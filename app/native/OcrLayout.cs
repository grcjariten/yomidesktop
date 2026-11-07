// SPDX-License-Identifier: GPL-3.0-or-later
using System;using System.Collections.Generic;using System.Globalization;using System.Text;
public static class OcrLayout {
    public sealed class Box {public double x,y,width,height;}
    public sealed class Token {public string text;public double x,y,width,height;public int offset=-1;public double confidence=1;}
    public sealed class Line {public string text;public List<Token> words=new List<Token>();}
    public sealed class Hit {public string text,query,capture;public int offset;public Box rect;public bool approximate;public double confidence;}
    static bool Latin(char c){return c<128&&Char.IsLetterOrDigit(c);}
    static List<string> Elements(string text){var result=new List<string>();var e=StringInfo.GetTextElementEnumerator(text);while(e.MoveNext())result.Add((string)e.Current);return result;}
    static void Rotate(ref double x,ref double y,double angle,double cx,double cy){double r=angle*Math.PI/180,c=Math.Cos(r),s=Math.Sin(r),dx=x-cx,dy=y-cy;x=cx+c*dx-s*dy;y=cy+s*dx+c*dy;}
    static Box Rotated(Box box,double angle,double cx,double cy){double left=Double.MaxValue,top=Double.MaxValue,right=Double.MinValue,bottom=Double.MinValue;foreach(double px in new[]{box.x,box.x+box.width})foreach(double py in new[]{box.y,box.y+box.height}){double x=px,y=py;Rotate(ref x,ref y,angle,cx,cy);left=Math.Min(left,x);right=Math.Max(right,x);top=Math.Min(top,y);bottom=Math.Max(bottom,y);}return new Box{x=left,y=top,width=right-left,height=bottom-top};}
    public static Hit Find(List<Line> lines,double pointerX,double pointerY,double angle,int imageWidth,int imageHeight){
        double x=pointerX,y=pointerY;Rotate(ref x,ref y,-angle,imageWidth/2.0,imageHeight/2.0);Hit best=null;double bestDistance=Double.MaxValue;
        foreach(var line in lines){
            if(line.words.Count==0)continue;
            var words=new List<Token>(line.words);bool vertical=false;
            if(words.Count>1){var first=words[0];var last=words[words.Count-1];vertical=Math.Abs(last.y-first.y)>Math.Abs(last.x-first.x)*1.2;}
            else vertical=words[0].height>words[0].width*1.8&&Elements(words[0].text).Count>1;
            words.Sort((a,b)=>vertical?a.y.CompareTo(b.y):a.x.CompareTo(b.x));
            double lx=Double.MaxValue,ly=Double.MaxValue,rx=Double.MinValue,by=Double.MinValue;
            foreach(var word in words){lx=Math.Min(lx,word.x);ly=Math.Min(ly,word.y);rx=Math.Max(rx,word.x+word.width);by=Math.Max(by,word.y+word.height);}
            double cross=vertical?rx-lx:by-ly;if(cross<=0)continue;
            var text=new StringBuilder();var starts=new List<int>();
            for(int i=0;i<words.Count;i++){if(i>0&&text.Length>0&&words[i].text.Length>0&&Latin(text[text.Length-1])&&Latin(words[i].text[0]))text.Append(' ');starts.Add(text.Length);text.Append(words[i].text);}
            string content=line.text??text.ToString();
            for(int i=0;i<words.Count;i++){
                var word=words[i];var chars=Elements(word.text);if(chars.Count==0||word.confidence<.85)continue;
                double low=vertical?word.y:word.x,high=low+(vertical?word.height:word.width);
                double padding=cross*.12;
                if(i>0){var prev=words[i-1];double gap=low-(vertical?prev.y+prev.height:prev.x+prev.width);low-=gap>=0?Math.Min(gap/2,padding*3):0;}else low-=padding;
                if(i+1<words.Count){var next=words[i+1];double gap=(vertical?next.y:next.x)-high;high+=gap>=0?Math.Min(gap/2,padding*3):0;}else high+=padding;
                int offset=line.text!=null?word.offset:starts[i];if(offset<0||offset>=content.Length)continue;
                for(int j=0;j<chars.Count;j++){
                    double a=low+(high-low)*j/chars.Count,b=low+(high-low)*(j+1)/chars.Count;
                    var cell=vertical?new Box{x=lx-padding,y=a,width=rx-lx+padding*2,height=b-a}:new Box{x=a,y=ly-padding,width=b-a,height=by-ly+padding*2};
                    if(x>=cell.x&&x<cell.x+cell.width&&y>=cell.y&&y<cell.y+cell.height){
                        double dx=(x-cell.x-cell.width/2)/Math.Max(1,cell.width),dy=(y-cell.y-cell.height/2)/Math.Max(1,cell.height),distance=dx*dx+dy*dy;
                        if(distance<bestDistance){bestDistance=distance;best=new Hit{text=content,offset=offset,query=content.Substring(offset),rect=Rotated(cell,angle,imageWidth/2.0,imageHeight/2.0),approximate=chars.Count>1,confidence=word.confidence};}
                    }offset+=chars[j].Length;
                }
            }
        }return best;
    }
}
