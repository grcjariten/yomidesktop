using System;using System.Collections.Generic;
class OcrLayoutTests{
 static int checks;static void Check(bool value,string name){if(!value)throw new Exception(name);checks++;}
 static OcrLayout.Line Make(string[] text,bool vertical=false){var line=new OcrLayout.Line();for(int i=0;i<text.Length;i++)line.words.Add(new OcrLayout.Token{text=text[i],x=vertical?20:20+i*22,y=vertical?20+i*22:20,width=20,height=20});return line;}
 public static void Main(){
  var lines=new List<OcrLayout.Line>{Make(new[]{"昨","日","は","日","本","語","。"})};
  for(int i=0;i<7;i++){var h=OcrLayout.Find(lines,30+i*22,30,0,300,100);Check(h!=null&&h.offset==i&&h.text=="昨日は日本語。","Japanese position "+i);}
  Check(OcrLayout.Find(lines,95,30,0,300,100).query=="日本語。","Gap hit mapping");
  Check(OcrLayout.Find(lines,50,80,0,300,100)==null,"Blank area rejected");
  var unicode=OcrLayout.Find(new List<OcrLayout.Line>{Make(new[]{"𠮷","野","日"})},52,30,0,200,100);Check(unicode.offset==2&&unicode.query=="野日","UTF16 supplementary offset");
  var vertical=OcrLayout.Find(new List<OcrLayout.Line>{Make(new[]{"日","本","語"},true)},30,52,0,100,200);Check(vertical.query=="本語"&&vertical.offset==1,"Vertical hit");
  var latin=OcrLayout.Find(new List<OcrLayout.Line>{Make(new[]{"a","b"})},52,30,0,100,100);Check(latin.text=="a b"&&latin.offset==2,"Latin spaces");
  double a=10*Math.PI/180,x=96,y=30,cx=150,cy=50,px=cx+Math.Cos(a)*(x-cx)-Math.Sin(a)*(y-cy),py=cy+Math.Sin(a)*(x-cx)+Math.Cos(a)*(y-cy);
  var rotated=OcrLayout.Find(lines,px,py,10,300,100);Check(rotated!=null&&rotated.offset==3,"Rotated text");
  var neural=Make(new[]{"a","b"});neural.text="ab";neural.words[0].offset=0;neural.words[1].offset=1;
  Check(OcrLayout.Find(new List<OcrLayout.Line>{neural},52,30,0,100,100).query=="b","Neural offsets preserve original spacing");
  neural.words[1].confidence=.4;Check(OcrLayout.Find(new List<OcrLayout.Line>{neural},52,30,0,100,100)==null,"Uncertain OCR character rejected");
  Console.WriteLine("OCR layout: "+checks+" checks passed");
 }
}
