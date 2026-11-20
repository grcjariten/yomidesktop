# SPDX-License-Identifier: GPL-3.0-or-later
"""Local, stdin/stdout OCR worker. Input images stay in memory; nothing is downloaded.

Pipeline (one request = one image + the pointer position inside it):
  1. two text detectors find the text box under the pointer: PP-OCRv6 medium (screens, UI text) and
     PP-OCRv6_manga (illustrations, handwriting, manga). They run on the fastest DirectML GPU if any.
  2. three readers read that box in parallel on the CPU: PP-OCRv6 medium, PP-OCRv6_manga and
     manga-ocr-charspot-small (only for short boxes, where it is reliable).
  3. the text most readers agree on wins; ties go to the most confident reader.
Detections of the last image are cached, so moving the pointer over the same pixels only re-reads.
Without the extra models the worker falls back to the PP-OCRv6-small pipeline shipped with RapidOCR."""
from pathlib import Path
import base64, concurrent.futures, hashlib, json, math, os, sys, time, unicodedata
sys.stdin.reconfigure(encoding='utf-8'); sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(sys.executable).parent
if (ROOT / 'packages-gpu' / 'onnxruntime').is_dir(): sys.path.insert(0, str(ROOT / 'packages-gpu'))  # onnxruntime-directml
import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image
from rapidocr.ch_ppocr_det.utils import DBPostProcess
from rapidocr.utils.process_img import get_rotate_crop_image

RAPID = ROOT / 'packages' / 'rapidocr' / 'models'
MODELS = ROOT / 'models'
CANVAS = (480, 1000)          # ScreenOcr crop size; smaller images are padded to it: one shape, compiled once on the GPU
NEAR = 6                      # max distance (px) between pointer and text box
THREADS = max(2, min(4, (os.cpu_count() or 4) // 4))

def log(*parts): print(*parts, file=sys.stderr, flush=True)
def utf16_length(text): return len(text.encode('utf-16-le')) // 2
VARIANTS = str.maketrans({'~': '〜', '～': '〜', '―': 'ー', '—': 'ー', '‐': 'ー', '－': 'ー', '-': 'ー', '─': 'ー', '━': 'ー'})
def normalized(text):
    """Key used to compare readings: readers write the same wave dash or long dash with different code points."""
    return ''.join(unicodedata.normalize('NFKC', text or '').split()).translate(VARIANTS)

def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1): cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]

def cpu_session(path):
    so = ort.SessionOptions(); so.intra_op_num_threads = THREADS; so.inter_op_num_threads = 1
    return ort.InferenceSession(str(path), so, providers=['CPUExecutionProvider'])

def gpu_session(path, device):
    so = ort.SessionOptions(); so.enable_mem_pattern = False; so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    return ort.InferenceSession(str(path), so, providers=[('DmlExecutionProvider', {'device_id': device}), 'CPUExecutionProvider'])

def pick_gpu(model):
    """Fastest DirectML adapter for the detector (the integrated GPU is often adapter 0 or 1), or None."""
    if os.environ.get('YOMIDESKTOP_OCR_CPU') or 'DmlExecutionProvider' not in ort.get_available_providers(): return None
    x = detector_input(np.zeros((CANVAS[0], CANVAS[1], 3), np.uint8)); best = None
    for device in range(4):
        try:
            s = gpu_session(model, device)
            if 'DmlExecutionProvider' not in s.get_providers(): break  # no such adapter: ONNX Runtime fell back to the CPU
            name = s.get_inputs()[0].name
            s.run(None, {name: x}); t = time.perf_counter(); s.run(None, {name: x}); s.run(None, {name: x})
            ms = (time.perf_counter() - t) * 500
            if best is None or ms < best[1]: best = (device, ms)
        except Exception:
            break
    return best[0] if best and best[1] < 150 else None

def detector_input(canvas):
    """Same sizing as RapidOCR's DetPreProcess(736, 'min') and the same (x/255-0.5)/0.5 scaling, computed in float32 once
    for both detectors (enlarging the image makes small and dense kanji easier to separate)."""
    h, w = canvas.shape[:2]; ratio = 736 / min(h, w) if min(h, w) < 736 else 1.0
    size = (max(32, int(round(int(w * ratio) / 32) * 32)), max(32, int(round(int(h * ratio) / 32) * 32)))
    return cv2.dnn.blobFromImage(cv2.resize(canvas, size), 1 / 127.5, size, (127.5, 127.5, 127.5), swapRB=False)

class Detector:
    def __init__(self, path, device, thresh=0.3, box_thresh=0.5, unclip=1.6):
        self.session = gpu_session(path, device) if device is not None else cpu_session(path)
        self.input = self.session.get_inputs()[0].name
        self.post = DBPostProcess(thresh=thresh, box_thresh=box_thresh, max_candidates=1000, unclip_ratio=unclip, use_dilation=True, score_mode='fast')
    def __call__(self, blob, shape):
        pred = self.session.run(None, {self.input: blob})[0]
        boxes, _ = self.post(pred, shape)
        return [np.asarray(b, np.float32) for b in boxes]

class CtcReader:
    """PP-OCR line recogniser; returns text, confidence and each character's span along the line (0..1)."""
    def __init__(self, path, keys=None):
        self.session = cpu_session(path); self.input = self.session.get_inputs()[0].name
        chars = Path(keys).read_text(encoding='utf-8').splitlines() if keys else self.session.get_modelmeta().custom_metadata_map['character'].splitlines()
        self.chars = [''] + chars + [' ']
    def __call__(self, line):
        h, w = line.shape[:2]; ratio = w / max(1, h)
        width = int(48 * max(320 / 48, ratio)); resized = min(width, int(math.ceil(48 * ratio)))
        x = np.zeros((1, 3, 48, width), np.float32)
        x[0, :, :, :resized] = (cv2.resize(line, (resized, 48)).astype(np.float32).transpose(2, 0, 1) / 255 - 0.5) / 0.5
        pred = self.session.run(None, {self.input: x})[0][0]
        index, prob = pred.argmax(1), pred.max(1)
        keep = np.ones(len(index), bool); keep[1:] = index[1:] != index[:-1]; keep &= index != 0
        cols = np.where(keep)[0]
        if not len(cols): return None
        text = ''.join(self.chars[i] for i in index[cols]); confs = prob[cols].astype(float)
        valid = len(index) * resized / width; centre = (cols + 0.5) / valid
        edges = np.concatenate([[max(0.0, centre[0] - (centre[1] - centre[0]) / 2 if len(centre) > 1 else 0.0)],
                                (centre[1:] + centre[:-1]) / 2,
                                [min(1.0, centre[-1] + (centre[-1] - centre[-2]) / 2 if len(centre) > 1 else 1.0)]])
        spans = [(text[i], float(edges[i]), float(edges[i + 1]), float(confs[i])) for i in range(len(text))]
        return text, float(confs.mean()), spans

class CharspotReader:
    """manga-ocr-charspot-small: finds and classifies every character of a text box (boxes in crop pixels)."""
    CELL, BUDGET = 16, 256
    def __init__(self, folder):
        cfg = json.loads((folder / 'config.json').read_text(encoding='utf-8'))
        self.session = cpu_session(folder / cfg['onnx'])
        chars = json.loads((folder / cfg['vocab']).read_text(encoding='utf-8'))['characters']
        combos = [a + b for a in '!?' for b in '!?'] + [a + b + c for a in '!?' for b in '!?' for c in '!?']
        self.out = chars + [''] * (cfg['n_cls'] - len(chars)) + combos
    def grid(self, h, w):
        lo, hi = 1e-4, 1000.0
        for _ in range(60):
            mid = (lo + hi) / 2
            if math.ceil(h * mid / 14) * math.ceil(w * mid / 14) <= self.BUDGET: lo = mid
            else: hi = mid
        return lo * self.CELL / 14, math.ceil(h * lo / 14), math.ceil(w * lo / 14)
    def __call__(self, crop):
        image = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)); scale, gh, gw = self.grid(image.height, image.width)
        rw = max(1, min(gw * self.CELL, round(image.width * scale))); rh = max(1, min(gh * self.CELL, round(image.height * scale)))
        small = np.asarray(image.resize((rw, rh), Image.Resampling.BICUBIC), np.uint8)
        border = np.concatenate([small[0], small[-1], small[:, 0], small[:, -1]])
        canvas = np.empty((gh * self.CELL, gw * self.CELL, 3), np.uint8); canvas[:] = np.median(border, axis=0).astype(np.uint8); canvas[:rh, :rw] = small
        boxes, scores, ids, order = self.session.run(None, {'img': np.ascontiguousarray(canvas.transpose(2, 0, 1))[None].astype(np.float32)})
        order = [int(k) for k in order]
        if not order: return None
        fx, fy = image.width / rw, image.height / rh
        chars = [(self.out[int(ids[k])], [float(boxes[k][0]) * fx, float(boxes[k][1]) * fy, float(boxes[k][2]) * fx, float(boxes[k][3]) * fy], float(scores[k])) for k in order]
        chars = [c for c in chars if c[0]]
        if not chars: return None
        return ''.join(c[0] for c in chars), float(np.mean([c[2] for c in chars])), chars

def is_kana(c): return 'ぁ' <= c <= 'ヿ' or 'ｦ' <= c <= 'ﾟ'
def is_katakana(c): return 'ァ' <= c <= 'ヿ' or 'ｦ' <= c <= 'ﾟ'
DASHES = set('—―－-‐─━ｰ')
def long_vowels(chars):
    """The long-vowel mark ー is often read as a dash, or as the kanji 一 once a vertical line is rotated
    (ラ一メン -> ラーメン). A dash after kana is always ー; 一 only between katakana or after katakana at the end,
    so words such as 一緒 or テスト一回 stay intact. This is a writing rule, not a dictionary correction."""
    out = list(chars)
    for i, c in enumerate(out):
        prev = out[i - 1][-1:] if i else ''; nxt = out[i + 1][:1] if i + 1 < len(out) else ''
        if c in DASHES and prev and (is_kana(prev) or prev == 'ー'): out[i] = 'ー'
        elif c == '一' and prev and (is_katakana(prev) or prev == 'ー') and (not nxt or is_katakana(nxt)): out[i] = 'ー'
    return out

def lerp(a, b, t): return a + (b - a) * t

def tokens_from_spans(text, spans, box, rotated):
    """Character spans along the straightened line -> pixel rectangles, following the detected quadrilateral."""
    p0, p1, p2, p3 = box; tokens = []; offset = 0
    for char, a, b, conf in spans:
        if not char.isspace():
            quad = ([lerp(p0, p3, a), lerp(p1, p2, a), lerp(p1, p2, b), lerp(p0, p3, b)] if rotated
                    else [lerp(p0, p1, a), lerp(p0, p1, b), lerp(p3, p2, b), lerp(p3, p2, a)])
            q = np.asarray(quad); left, top = q.min(0); right, bottom = q.max(0)
            tokens.append({'text': char, 'offset': offset, 'x': float(left), 'y': float(top), 'width': float(right - left), 'height': float(bottom - top), 'confidence': conf})
        offset += utf16_length(char)
    return tokens

def tokens_from_boxes(chars, ox, oy):
    tokens = []; offset = 0
    for char, (x0, y0, x1, y1), score in chars:
        tokens.append({'text': char, 'offset': offset, 'x': x0 + ox, 'y': y0 + oy, 'width': x1 - x0, 'height': y1 - y0, 'confidence': score})
        offset += utf16_length(char)
    return tokens

class Engine:
    def __init__(self):
        self.pool = concurrent.futures.ThreadPoolExecutor(3); self.last = None
        general, manga = MODELS / 'pp-ocrv6' / 'PP-OCRv6_det_medium.onnx', MODELS / 'pp-ocrv6-manga' / 'manga_det.onnx'
        self.full = general.is_file() and manga.is_file()
        self.device = pick_gpu(general) if self.full else None
        if self.full:
            # On the CPU the medium detector is too slow for a hover lookup: use the small one there.
            self.detectors = [Detector(general if self.device is not None else RAPID / 'PP-OCRv6_det_small.onnx', self.device),
                              Detector(manga, self.device, 0.15, 0.25, 1.5)]
            self.readers = [CtcReader(MODELS / 'pp-ocrv6' / 'PP-OCRv6_rec_medium.onnx'),
                            CtcReader(MODELS / 'pp-ocrv6-manga' / 'manga_rec.onnx', MODELS / 'pp-ocrv6-manga' / 'ppocrv6_dict.txt')]
            folder = MODELS / 'charspot-small'
            self.charspot = CharspotReader(folder) if (folder / 'model.onnx').is_file() else None
        else:
            self.detectors = [Detector(RAPID / 'PP-OCRv6_det_small.onnx', None)]
            self.readers = [CtcReader(RAPID / 'PP-OCRv6_rec_small.onnx')]; self.charspot = None
        # Warm every session before reporting ready, without reading the screen.
        blank = np.full((CANVAS[0], CANVAS[1], 3), 255, np.uint8); cv2.putText(blank, 'warm up', (40, 160), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 0), 4)
        for d in self.detectors: d(detector_input(blank), blank.shape[:2])
        for r in self.readers: r(blank[120:180, 30:400])
        if self.charspot: self.charspot(blank[120:180, 30:400])

    def name(self):
        if not self.full: return 'PP-OCRv6-small'
        return 'PP-OCRv6 medium + manga' + (' · charspot' if self.charspot else '') + (' · GPU' if self.device is not None else ' · CPU')

    def detect(self, image):
        key = hashlib.blake2b(image.tobytes(), digest_size=16).digest() + bytes(str(image.shape), 'ascii')
        if self.last and self.last[0] == key: return self.last[1]
        h, w = image.shape[:2]; H, W = max(h, CANVAS[0]), max(w, CANVAS[1]); canvas = image
        if (H, W) != (h, w):
            border = np.concatenate([image[0], image[-1], image[:, 0], image[:, -1]])
            canvas = np.empty((H, W, 3), np.uint8); canvas[:] = np.median(border, axis=0).astype(np.uint8); canvas[:h, :w] = image
        blob = detector_input(canvas)
        if self.device is not None:  # DirectML sessions must not run concurrently (access violation)
            found = [d(blob, canvas.shape[:2]) for d in self.detectors]
        else:
            jobs = [self.pool.submit(d, blob, canvas.shape[:2]) for d in self.detectors]
            found = [job.result() for job in jobs]
        self.last = (key, found); return found

    def candidates(self, image, box):
        """All readings of one box as (text, confidence, tokens)."""
        straight = get_rotate_crop_image(image, box.copy())
        p0, p1, p2, p3 = box  # same rule as get_rotate_crop_image: tall boxes are turned to read left to right
        width = int(max(np.linalg.norm(p0 - p1), np.linalg.norm(p2 - p3))); height = int(max(np.linalg.norm(p0 - p3), np.linalg.norm(p1 - p2)))
        rotated = width > 0 and height / width >= 1.5
        jobs = [(self.pool.submit(r, straight), 'line') for r in self.readers]
        left, top = np.floor(box.min(0)).astype(int); right, bottom = np.ceil(box.max(0)).astype(int)
        pad = max(2, int(0.08 * min(right - left, bottom - top))); x0, y0 = max(left - pad, 0), max(top - pad, 0)
        flat = image[y0:bottom + pad, x0:right + pad]
        if self.charspot is not None and flat.size and max(flat.shape[:2]) <= 6 * max(1, min(flat.shape[:2])):
            jobs.append((self.pool.submit(self.charspot, flat), 'chars'))
        out = []
        for job, kind in jobs:
            try: result = job.result()
            except Exception as exc: log(type(exc).__name__); continue
            if not result or not normalized(result[0]): continue
            text, conf, detail = result
            fixed = long_vowels([d[0] for d in detail]); detail = [(c,) + tuple(d[1:]) for c, d in zip(fixed, detail)]; text = ''.join(fixed)
            tokens = tokens_from_spans(text, detail, box, rotated) if kind == 'line' else tokens_from_boxes(detail, x0, y0)
            out.append((text, conf, tokens))
        return out

    def vote(self, candidates):
        groups = {}
        for text, conf, tokens in candidates:
            g = groups.setdefault(normalized(text), []); g.append((conf, text, tokens))
        if not groups: return None
        best = max(groups.values(), key=lambda g: (len(g), max(c[0] for c in g)))
        if len(best) == 1 and len(groups) >= 3:
            # No two readers agree: take the reading closest to all the others (each reader tends to get a different
            # character wrong, so the reading in the middle has the fewest errors), confidence only breaks ties.
            keys = list(groups)
            best = groups[min(keys, key=lambda k: (sum(edit_distance(k, o) for o in keys), -groups[k][0][0]))]
        conf, text, tokens = max(best, key=lambda c: c[0])
        if len(best) > 1:  # several independent readers agree: trust every character
            for t in tokens: t['confidence'] = max(t['confidence'], 0.99)
        return {'text': text, 'words': tokens, 'votes': len(best), 'confidence': conf}

    def choose(self, per_box):
        """per_box: readings of the box each detector found under the pointer. Readings that several readers agree on
        come first, and among those the longest (the whole word or column, not a piece the other detector cut off);
        otherwise every reading of every box takes part in one vote."""
        winners = [w for w in (self.vote(c) for c in per_box) if w and w['votes'] >= 2]
        if winners: return max(winners, key=lambda w: (len(normalized(w['text'])), w['votes'], w['confidence']))
        return self.vote([c for cands in per_box for c in cands])

    def recognize(self, image, x=None, y=None):
        found = self.detect(image); lines = []
        if x is None:  # whole image (tests, diagnostics): every box of the first detector
            for box in found[0]:
                line = self.vote(self.candidates(image, box))
                if line: lines.append(line)
        else:
            near = []
            for boxes in found:
                best = None
                for box in boxes:
                    left, top = box.min(0); right, bottom = box.max(0)
                    distance = max(top - y, 0, y - bottom) + max(left - x, 0, x - right)
                    # Boxes that touch (two vertical columns): prefer the one where the pointer is nearest the middle line.
                    w, h = max(right - left, 1), max(bottom - top, 1)
                    centre = abs(x - (left + right) / 2) / w if h > 1.3 * w else abs(y - (top + bottom) / 2) / h
                    if distance <= NEAR and (best is None or (distance, centre) < best[0]): best = ((distance, centre), box)
                near.append(best[1] if best is not None and not any(b is not None and np.allclose(best[1], b, atol=3) for b in near) else None)
            per_box = [self.candidates(image, box) if box is not None else [] for box in near]
            line = self.choose(per_box)
            if line: lines.append(line)
        return {'lines': lines, 'angle': 0, 'scale': 1, 'width': image.shape[1], 'height': image.shape[0]}

def decode(encoded):
    pixels = base64.b64decode(encoded, validate=True)
    if len(pixels) > 8 * 1024 * 1024: raise ValueError('Image too large')
    image = cv2.imdecode(np.frombuffer(pixels, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None: raise ValueError('Invalid image')
    return image

def main():
    engine = None; reply = sys.stdout
    sys.stdout = sys.stderr  # ONNX Runtime prints provider fallbacks: keep stdout for JSON replies only
    try: engine = Engine()
    except Exception as exc: log(type(exc).__name__, exc)
    finally: sys.stdout = reply
    for line in sys.stdin:
        try:
            query = json.loads(line)
            if query.get('op') == 'status':
                result = {'available': engine is not None, 'language': 'ja', 'engine': engine.name() if engine else None, 'local': True}
            elif engine is None: result = None
            else:
                x, y = query.get('x'), query.get('y')
                result = engine.recognize(decode(query['image']), None if x is None else float(x), None if y is None else float(y))
        except Exception as exc:
            log(type(exc).__name__); result = None
        print(json.dumps(result, ensure_ascii=False, separators=(',', ':')), flush=True)

if __name__ == '__main__': main()
