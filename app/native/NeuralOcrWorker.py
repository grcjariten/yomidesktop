# SPDX-License-Identifier: GPL-3.0-or-later
"""Local, stdin/stdout OCR worker. Input images stay in memory; no downloads."""
from pathlib import Path
import base64,json,sys
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
import cv2
import numpy as np
from rapidocr import RapidOCR

def utf16_length(text):
    return len(text.encode('utf-16-le'))//2

def create_engine():
    models=Path(sys.executable).parent/'packages/rapidocr/models'
    params={'Global.log_level':'critical','Global.return_word_box':True,
            'Global.return_single_char_box':True,'Global.use_cls':False,
            'Global.text_score':0.8,'EngineConfig.onnxruntime.intra_op_num_threads':2,
            'EngineConfig.onnxruntime.inter_op_num_threads':1}
    for section,name in [('Det','PP-OCRv6_det_small.onnx'),('Rec','PP-OCRv6_rec_small.onnx'),('Cls','ch_ppocr_mobile_v2.0_cls_mobile.onnx')]:
        file=models/name
        if not file.is_file():raise FileNotFoundError(name)
        params[section+'.model_path']=str(file)
    engine=RapidOCR(params=params)
    # Warm both sessions before reporting ready, without reading the screen.
    engine(np.full((64,160,3),255,dtype=np.uint8))
    engine._load_rec_model()
    return engine

def recognize(engine,encoded):
    pixels=base64.b64decode(encoded,validate=True)
    if len(pixels)>8*1024*1024:raise ValueError('Image too large')
    image=cv2.imdecode(np.frombuffer(pixels,dtype=np.uint8),cv2.IMREAD_COLOR)
    if image is None:raise ValueError('Invalid image')
    result=engine(image)
    lines=[]
    if result.txts and result.word_results:
        for text,score,words in zip(result.txts,result.scores,result.word_results):
            if score<.8:continue
            tokens=[];start=0
            for character,confidence,polygon in words:
                position=text.find(character,start)
                if position<0:continue
                start=position+len(character)
                p=np.asarray(polygon,dtype=float)
                left,top=p.min(axis=0);right,bottom=p.max(axis=0)
                tokens.append({'text':character,'offset':utf16_length(text[:position]),
                               'x':float(left),'y':float(top),'width':float(right-left),
                               'height':float(bottom-top),'confidence':float(confidence)})
            if tokens:lines.append({'text':text,'words':tokens})
    return {'lines':lines,'angle':0,'scale':1,'width':image.shape[1],'height':image.shape[0]}

def main():
    engine=None
    try:engine=create_engine()
    except Exception as exc:print(type(exc).__name__,file=sys.stderr,flush=True)
    for line in sys.stdin:
        try:
            query=json.loads(line)
            if query.get('op')=='status':result={'available':engine is not None,'language':'ja','engine':'PP-OCRv6-small','local':True}
            elif engine is None:result=None
            else:result=recognize(engine,query['image'])
        except Exception as exc:
            print(type(exc).__name__,file=sys.stderr,flush=True);result=None
        print(json.dumps(result,ensure_ascii=False,separators=(',',':')),flush=True)

if __name__=='__main__':main()
