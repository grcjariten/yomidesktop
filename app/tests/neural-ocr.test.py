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
def recognize(image):
    image=image.convert('RGB');buffer=io.BytesIO();image.save(buffer,format='PNG')
    result=call({'image':base64.b64encode(buffer.getvalue()).decode('ascii')})
    assert result is not None
    return [line['text'] for line in result['lines']]
try:
    assert call({'op':'status'})['available']
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
    print(json.dumps({'ok':True,'wordChecks':count,'engine':'PP-OCRv6-small'}))
finally:
    process.stdin.close()
    try:process.wait(timeout=10)
    except subprocess.TimeoutExpired:process.kill();process.wait()
