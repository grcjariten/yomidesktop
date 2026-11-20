// SPDX-License-Identifier: GPL-3.0-or-later
using System;using System.Drawing;using System.Drawing.Imaging;using System.IO;using System.Runtime.InteropServices;using System.Text;using System.Web.Script.Serialization;
public static class ScreenOcr {
    [StructLayout(LayoutKind.Sequential)]struct POINT{public int x,y;}
    [StructLayout(LayoutKind.Sequential)]struct RECT{public int left,top,right,bottom;}
    [StructLayout(LayoutKind.Sequential)]struct MONITORINFO{public int size;public RECT monitor,work;public uint flags;}
    [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")]static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr window,uint flags);
    [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr window,out RECT rect);
    [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr window,IntPtr context,uint flags);
    [DllImport("user32.dll")]static extern IntPtr MonitorFromPoint(POINT point,uint flags);
    [DllImport("user32.dll")]static extern bool GetMonitorInfo(IntPtr monitor,ref MONITORINFO info);
    static JavaScriptSerializer json=new JavaScriptSerializer();
    static Rectangle cachedRect;static ulong cachedHash;static long cachedWindow,cachedGesture;static int cachedAt;
    static NeuralOcrReader.Model cachedModel;
    static void Send(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
    static byte[] Pixels(Bitmap bitmap){
        var data=bitmap.LockBits(new Rectangle(0,0,bitmap.Width,bitmap.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
        try{var bytes=new byte[bitmap.Width*bitmap.Height*4];for(int y=0;y<bitmap.Height;y++)Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),bytes,y*bitmap.Width*4,bitmap.Width*4);return bytes;}finally{bitmap.UnlockBits(data);}
    }
    static ulong Fingerprint(byte[] bytes){unchecked{ulong hash=1469598103934665603UL;for(int i=0;i<bytes.Length;i+=16){hash^=bytes[i];hash*=1099511628211UL;hash^=bytes[i+1];hash*=1099511628211UL;hash^=bytes[i+2];hash*=1099511628211UL;}return hash;}}
    static NeuralOcrReader.Model Recognize(Bitmap image,double x,double y){using(var stream=new MemoryStream()){image.Save(stream,ImageFormat.Png);return NeuralOcrReader.Recognize(stream.ToArray(),x,y);}}
    // The worker reads only the text under the pointer: reuse the cached result while it still covers the pointer,
    // otherwise ask again (the worker keeps the detections of the same pixels, so this only re-reads).
    static OcrLayout.Hit Lookup(Bitmap image,Rectangle crop,ulong hash,int x,int y,bool recent,long window,long gesture){
        if(recent&&crop==cachedRect&&hash==cachedHash&&cachedModel!=null){var cached=Find(cachedModel,x-crop.Left,y-crop.Top,crop.Left,crop.Top);if(cached!=null)return cached;}
        cachedModel=Recognize(image,x-crop.Left,y-crop.Top);cachedRect=crop;cachedHash=hash;cachedWindow=window;cachedGesture=gesture;cachedAt=Environment.TickCount;
        return Find(cachedModel,x-crop.Left,y-crop.Top,crop.Left,crop.Top);
    }
    static bool CaptureWindow(IntPtr window,Rectangle crop,Bitmap image){
        RECT bounds;if(!GetWindowRect(window,out bounds))return false;
        int width=bounds.right-bounds.left,height=bounds.bottom-bounds.top;
        if(width<1||height<1||(long)width*height>32000000)return false;
        using(var frame=new Bitmap(width,height,PixelFormat.Format32bppRgb)){
            bool captured;using(var g=Graphics.FromImage(frame)){var dc=g.GetHdc();try{captured=PrintWindow(window,dc,2);}finally{g.ReleaseHdc(dc);}}
            if(!captured)return false;
            using(var g=Graphics.FromImage(image))g.DrawImage(frame,new Rectangle(0,0,crop.Width,crop.Height),new Rectangle(crop.Left-bounds.left,crop.Top-bounds.top,crop.Width,crop.Height),GraphicsUnit.Pixel);
        }return true;
    }
    static OcrLayout.Hit Find(NeuralOcrReader.Model model,double x,double y,int originX,int originY){
        if(model==null||model.lines==null)return null;var hit=OcrLayout.Find(model.lines,x,y,model.angle,model.width,model.height);
        if(hit!=null){hit.rect.x+=originX;hit.rect.y+=originY;}return hit;
    }
    public static OcrLayout.Hit ReadScreen(int x,int y,long window,long gesture,bool captureWindow=true){
        var point=new POINT{x=x,y=y};var expected=new IntPtr(window);
        if(GetAncestor(WindowFromPoint(point),2)!=expected)return null;
        var monitor=new MONITORINFO{size=Marshal.SizeOf(typeof(MONITORINFO))};if(!GetMonitorInfo(MonitorFromPoint(point,2),ref monitor))return null;
        var bounds=new Rectangle(monitor.monitor.left,monitor.monitor.top,monitor.monitor.right-monitor.monitor.left,monitor.monitor.bottom-monitor.monitor.top);RECT wr;
        if(GetWindowRect(expected,out wr))bounds=Rectangle.Intersect(bounds,new Rectangle(wr.left,wr.top,wr.right-wr.left,wr.bottom-wr.top));
        if(bounds.Width<1||bounds.Height<1||!bounds.Contains(x,y))return null;
        int width=Math.Min(1000,bounds.Width),height=Math.Min(480,bounds.Height);  // 480 px tall: long vertical columns (manga) stay whole
        var crop=new Rectangle(Math.Max(bounds.Left,Math.Min(x-400,bounds.Right-width)),Math.Max(bounds.Top,Math.Min(y-240,bounds.Bottom-height)),width,height);
        bool recent=cachedWindow==window&&cachedGesture==gesture&&(uint)(Environment.TickCount-cachedAt)<1500;
        if(recent&&cachedRect.Contains(x,y)&&bounds.Contains(cachedRect))crop=cachedRect;
        using(var image=new Bitmap(crop.Width,crop.Height,PixelFormat.Format32bppArgb)){
            // Ask the source window for its pixels first: overlays/cursor effects
            // from other processes must not erase the character being pointed at.
            if(captureWindow&&CaptureWindow(expected,crop,image)){
                var hit=Lookup(image,crop,Fingerprint(Pixels(image)),x,y,recent,window,gesture);if(hit!=null){hit.capture="window";return hit;}
            }
            using(var g=Graphics.FromImage(image))g.CopyFromScreen(crop.Left,crop.Top,0,0,crop.Size,CopyPixelOperation.SourceCopy);
            var screenHit=Lookup(image,crop,Fingerprint(Pixels(image)),x,y,recent,window,gesture);if(screenHit!=null)screenHit.capture="screen";return screenHit;
        }
    }
    [MTAThread]public static void Main(string[] args){
        Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
        if(args.Length==1&&args[0]=="--status"){Send(NeuralOcrReader.Status());return;}
        if(args.Length==3&&(args[0]=="--point"||args[0]=="--screen-point")){int x=Int32.Parse(args[1]),y=Int32.Parse(args[2]);Send(ReadScreen(x,y,GetAncestor(WindowFromPoint(new POINT{x=x,y=y}),2).ToInt64(),1,args[0]=="--point"));return;}
        if(args.Length==4&&args[0]=="--image"){
            using(var original=new Bitmap(args[1]))using(var image=new Bitmap(original.Width,original.Height,PixelFormat.Format32bppArgb)){
                using(var g=Graphics.FromImage(image))g.DrawImageUnscaled(original,0,0);double px=Double.Parse(args[2],System.Globalization.CultureInfo.InvariantCulture),py=Double.Parse(args[3],System.Globalization.CultureInfo.InvariantCulture);Send(Find(Recognize(image,px,py),px,py,0,0));
            }return;
        }
        string line;while((line=Console.ReadLine())!=null){try{
            if(line=="status"){Send(NeuralOcrReader.Status());continue;}
            var values=line.Split(' ');Send(ReadScreen(Int32.Parse(values[0]),Int32.Parse(values[1]),Int64.Parse(values[2]),Int64.Parse(values[3])));
        }catch{Send(null);}}
    }
}
