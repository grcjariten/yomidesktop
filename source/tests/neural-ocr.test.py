# Run with the bundled ocr-runtime/python.exe (Windows).
from pathlib import Path
import base64,io,json,subprocess,sys,time
from PIL import Image,ImageDraw,ImageFont
tests=Path(__file__).resolve().parent
root=next(p for p in tests.parents if (p/'ocr-runtime').is_dir())
worker=tests.parent/'native/NeuralOcrWorker.py'
process=subprocess.Popen([str(root/'ocr-runtime/python.exe'),'-u','-X','utf8',str(worker)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
def call(request):
    process.stdin.write(json.dumps(request)+'\n');process.stdin.flush()
    response=process.stdout.readline()
    assert response,'Worker unexpectedly closed'
    return json.loads(response)
def encode(image):
    image=image.convert('RGB');buffer=io.BytesIO();image.save(buffer,format='PNG');return base64.b64encode(buffer.getvalue()).decode('ascii')
def recognize(image):
    result=call({'image':encode(image)})
    assert result is not None
    return [line['text'] for line in result['lines']]
def at(image,x,y):
    """Line under the pointer and the character whose box holds the pointer."""
    started=time.perf_counter();result=call({'image':encode(image),'x':x,'y':y});elapsed=time.perf_counter()-started
    assert result is not None and len(result['lines'])<=1
    if not result['lines']:return None,None,elapsed
    line=result['lines'][0]
    char=next((w['text'] for w in line['words'] if w['x']<=x<=w['x']+w['width'] and w['y']<=y<=w['y']+w['height']),None)
    return line['text'],char,elapsed
try:
    status=call({'op':'status'});assert status['available'],status
    assert '経営' in recognize(Image.open(tests/'fixtures/keiei-regression.png'))
    words=['経営','日曜日','仕事','食べました','不器用','日本語']
    count=1
    for size in [14,16,24,48]:
        for dark in [False,True]:
            image=Image.new('RGB',(760,270),'#2c2c2c' if dark else '#ffffff')
            draw=ImageDraw.Draw(image);font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',size)
            for i,word in enumerate(words):draw.text((24+(i%3)*240,12+(i//3)*125),word,font=font,fill='#d0d0d0' if dark else '#171717')
            texts=recognize(image)
            for word in words:assert any(word in text for text in texts),(size,dark,word,texts)
            count+=len(words)
    # Pointer mode: only the line under the pointer comes back, with the pointed character.
    lines=['今日は仕事が忙しくて大変でした','憂鬱な議論に驚愕した','週末に友達と映画を見に行きます']
    image=Image.new('RGB',(1000,320),'#ffffff');draw=ImageDraw.Draw(image);font=ImageFont.truetype('C:/Windows/Fonts/YuGothR.ttc',22)
    for i,text in enumerate(lines):draw.text((40,40+i*34),text,font=font,fill='#202020')
    times=[]
    for i,text in enumerate(lines):
        got,char,elapsed=at(image,40+22*4+11,40+i*34+14);times.append(elapsed)
        assert got==text and char==text[4],(text,got,char);count+=1
    # Vertical text (top to bottom), as in manga and signs.
    image=Image.new('RGB',(1000,320),'#ffffff');draw=ImageDraw.Draw(image);font=ImageFont.truetype('C:/Windows/Fonts/YuGothR.ttc',30)
    vertical='日曜日に会議'
    for i,c in enumerate(vertical):draw.text((500,20+i*38),c,font=font,fill='#101010')
    got,char,elapsed=at(image,515,20+3*38+18);times.append(elapsed)
    assert got==vertical and char==vertical[3],(got,char);count+=1
    got,char,_=at(image,900,300);assert got is None,got;count+=1  # blank area
    print(json.dumps({'ok':True,'wordChecks':count,'engine':status['engine'],'pointerMs':round(1000*sorted(times)[len(times)//2])},ensure_ascii=False))
finally:
    process.stdin.close()
    try:process.wait(timeout=10)
    except subprocess.TimeoutExpired:process.kill();process.wait()
