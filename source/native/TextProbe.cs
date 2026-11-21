// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Text;
using System.Web.Script.Serialization;

public static class TextProbe {
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
    [StructLayout(LayoutKind.Sequential)] struct MSG {public IntPtr window;public uint message;public IntPtr wParam,lParam;public uint time;public POINT point;public uint privateData;}
    delegate IntPtr KeyboardHook(int code,IntPtr message,IntPtr data);
    [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetWindowsHookEx(int id,KeyboardHook callback,IntPtr module,uint thread);
    [DllImport("user32.dll")]static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")]static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
    [DllImport("user32.dll")]static extern int GetMessage(out MSG message,IntPtr window,uint min,uint max);
    [DllImport("user32.dll")]static extern bool PostThreadMessage(uint thread,uint message,IntPtr wParam,IntPtr lParam);
    [DllImport("kernel32.dll")]static extern IntPtr GetModuleHandle(string name);
    [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
    [DllImport("user32.dll",EntryPoint="GetPhysicalCursorPos")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out RECT r);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out RECT r);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h,ref POINT p);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW",SetLastError=true)] static extern IntPtr SetWindowLongPtr(IntPtr h,int index,IntPtr value);
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h,int index);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder t,int max);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder t,int max);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr arg);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,EnumProc cb,IntPtr arg);
    delegate bool EnumProc(IntPtr h,IntPtr arg);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int command);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach,uint to,bool on);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int cx,int cy,uint flags);
    // Anki opens "View added note" behind the other windows (Windows blocks focus stealing):
    // bring its top window to the front, a few times while it is still opening.
    static void RaiseApp(string name){
        string result="not-found";
        try{foreach(int delay in new[]{350,500,700}){
            Thread.Sleep(delay);
            IntPtr found=IntPtr.Zero;
            var pids=new HashSet<uint>();foreach(var proc in Process.GetProcessesByName(name)){pids.Add((uint)proc.Id);proc.Dispose();}if(pids.Count==0){result="no-anki";break;}
            EnumWindows((h,arg)=>{if(!IsWindowVisible(h))return true;uint pid;GetWindowThreadProcessId(h,out pid);if(pids.Contains(pid)&&WindowTitle(h).Length>0){found=h;return false;}return true;},IntPtr.Zero);
            if(found==IntPtr.Zero)continue;
            IntPtr fg=GetForegroundWindow();if(fg==found){result="front";break;}
            uint ignored,fgThread=GetWindowThreadProcessId(fg,out ignored),me=GetCurrentThreadId();
            bool attached=fgThread!=0&&fgThread!=me&&AttachThreadInput(me,fgThread,true);
            // Windows may refuse the focus: putting the window on top for a moment still shows it above the others.
            try{if(IsIconic(found))ShowWindow(found,9);SetForegroundWindow(found);}
            finally{if(attached)AttachThreadInput(me,fgThread,false);}
            if(GetForegroundWindow()==found){result="focused";continue;}
            SetWindowPos(found,new IntPtr(-1),0,0,0,0,0x43);SetWindowPos(found,new IntPtr(-2),0,0,0,0,0x43);
            result="on-top";
        }}catch(Exception e){result="error "+e.Message;}
        Send(new{kind="raise-app",result=result});
    }
    static JavaScriptSerializer json=new JavaScriptSerializer();
    static object io=new object();
    static HashSet<int> own=new HashSet<int>();
    static volatile bool enabled=true,exit=false,busy=false;
    static volatile bool ocrEnabled=true;
    static volatile int contextExtent=200;
    static long sequence=0;
    static int shiftPulse=0,escapePulse=0;
    static volatile int scanKey=0x10; // Shift, Ctrl, Alt, any other key (not Esc) or the middle/side mouse buttons (0x04-0x06)
    static volatile bool mouseHeld=false,mouseHookReady=false;
    static KeyboardHook mouseCallback=OnMouse;
    static bool IsMouse(int key){return key>=0x04&&key<=0x06;}
    static int ModifierKey(int key){switch(key){case 0xA0:case 0xA1:return 0x10;case 0xA2:case 0xA3:return 0x11;case 0xA4:case 0xA5:return 0x12;default:return key;}}
    static uint hookThreadId;
    static volatile bool keyboardHookReady=false;
    static KeyboardHook keyboardCallback=OnKeyboard;
    static object queueLock=new object();
    static Dictionary<uint,bool> legacyWpf=new Dictionary<uint,bool>();
    static bool LegacyWpf(uint pid){bool value;if(legacyWpf.TryGetValue(pid,out value))return value;value=false;try{foreach(ProcessModule m in Process.GetProcessById((int)pid).Modules)if(m.ModuleName.Equals("wpfgfx_v0400.dll",StringComparison.OrdinalIgnoreCase)){value=true;break;}}catch{}legacyWpf[pid]=value;return value;}
    static Dictionary<string,object> job;
    static AutoResetEvent ready=new AutoResetEvent(false);
    static void CaptureShortcut(int key,long kind){
        if(kind==0x100||kind==0x104){
            if(ModifierKey(key)==scanKey)Interlocked.Exchange(ref shiftPulse,1);
            else if(key==0x1B)Interlocked.Exchange(ref escapePulse,1);
        }
    }
    static IntPtr OnKeyboard(int code,IntPtr message,IntPtr data){
        if(code>=0)CaptureShortcut(Marshal.ReadInt32(data),message.ToInt64());
        return CallNextHookEx(IntPtr.Zero,code,message,data);
    }
    // Mouse scan button: tracked here and swallowed, so the click does not also go back a page in browsers.
    static IntPtr OnMouse(int code,IntPtr message,IntPtr data){
        int key=scanKey;
        if(code>=0&&enabled&&IsMouse(key)){
            int m=message.ToInt32(),button=0;bool down=false;
            if(m==0x207||m==0x208){button=0x04;down=m==0x207;}
            else if(m==0x20B||m==0x20C){int x=(Marshal.ReadInt32(data,8)>>16)&0xFFFF;button=x==1?0x05:x==2?0x06:0;down=m==0x20B;}
            if(button==key){if(down){mouseHeld=true;Interlocked.Exchange(ref shiftPulse,1);}else mouseHeld=false;return new IntPtr(1);}
        }
        return CallNextHookEx(IntPtr.Zero,code,message,data);
    }
    static void Shortcuts(){
        hookThreadId=GetCurrentThreadId();var hook=SetWindowsHookEx(13,keyboardCallback,GetModuleHandle(null),0);
        var mouseHook=SetWindowsHookEx(14,mouseCallback,GetModuleHandle(null),0);mouseHookReady=mouseHook!=IntPtr.Zero;
        if(hook==IntPtr.Zero){Send(new{kind="shortcut-hook",ok=false});return;}
        keyboardHookReady=true;
        Send(new{kind="shortcut-hook",ok=true});
        try{MSG message;while(!exit&&GetMessage(out message,IntPtr.Zero,0,0)>0){}}
        finally{keyboardHookReady=false;mouseHookReady=false;UnhookWindowsHookEx(hook);if(mouseHook!=IntPtr.Zero)UnhookWindowsHookEx(mouseHook);}
    }
    static void Send(object o) { lock(io) { Console.WriteLine(json.Serialize(o));Console.Out.Flush(); } }
    static string WindowTitle(IntPtr h) { var s=new StringBuilder(1000);GetWindowText(h,s,1000);return s.ToString(); }
    static string ClassName(IntPtr h) { var s=new StringBuilder(300);GetClassName(h,s,300);return s.ToString(); }
    static string ProcessName(uint pid) { try{return Process.GetProcessById((int)pid).ProcessName;}catch{return "";} }
    static bool AttachOwner(long window,long owner,int allowedPid){var child=new IntPtr(window);var parent=new IntPtr(owner);uint pid,parentPid;GetWindowThreadProcessId(child,out pid);GetWindowThreadProcessId(parent,out parentPid);if(pid!=(uint)allowedPid||ProcessName(parentPid)!="vlc")return false;SetWindowLongPtr(child,-8,parent);return GetWindowLongPtr(child,-8)==parent;}
    static bool Contains(Rect r,POINT p) {return !r.IsEmpty&&r.Width>0&&r.Height>0&&p.X>=r.Left&&p.X<r.Right&&p.Y>=r.Top&&p.Y<r.Bottom;}
    static Rect HitRect(TextPatternRange r,POINT p) {
        var a=r.GetBoundingRectangles();foreach(var b in a)if(Contains(b,p))return b;return Rect.Empty;
    }
    static object OcrPoint(int x,int y,long gesture){
        var p=new POINT{X=x,Y=y};var h=WindowFromPoint(p);uint pid;GetWindowThreadProcessId(h,out pid);lock(own)if(own.Contains((int)pid))return null;
        var root=GetAncestor(h,2);var hit=OcrReader.Read(x,y,root,gesture);if(hit==null)return null;
        string process=ProcessName(pid);return new{kind="text",text=hit.text,offset=hit.offset,query=hit.query,rect=hit.rect,x=x,y=y,source=process,title=WindowTitle(root)+" · OCR",url="ocr://"+process,hwnd=root.ToInt64(),pid=pid,provider="OCR.PP-OCRv6",approximate=hit.approximate,confidence=hit.confidence,capture=hit.capture};
    }
    public static object ReadPoint(int x,int y,long gesture=0) {
        var readClock=Stopwatch.StartNew();
        var p=new POINT{X=x,Y=y};var h=WindowFromPoint(p);uint pid;GetWindowThreadProcessId(h,out pid);
        lock(own)if(own.Contains((int)pid))return null;
        string process=ProcessName(pid);
        if(process.Equals("vlc",StringComparison.OrdinalIgnoreCase))return new{kind="delegated",source="VLC"};
        var root=GetAncestor(h,2);string title=WindowTitle(root);
        bool hasTextPattern=false;
        try{
        var element=AutomationElement.FromPoint(new Point(x,y));
        // Never examine password fields or a provider which marks its ancestor protected.
        var candidate=element;var scanClock=Stopwatch.StartNew();
        for(int depth=0;candidate!=null&&depth<32&&scanClock.ElapsedMilliseconds<1200;depth++) {
            if(candidate.Current.IsPassword)return null;
            object pattern;
            if(candidate.TryGetCurrentPattern(TextPattern.Pattern,out pattern)) {
                hasTextPattern=true;
                var tp=(TextPattern)pattern;
                double factor=1,ox=0,oy=0;
                // .NET Framework WPF exposes text offsets at 96 DPI while its origin is physical.
                // Modern WPF providers and other toolkits already expose fully physical bounds.
                if(candidate.Current.FrameworkId=="WPF"&&LegacyWpf(pid)){
                    uint dpi=GetDpiForWindow(root);if(dpi>96){var boxes=tp.DocumentRange.GetBoundingRectangles();if(boxes.Length>0){factor=dpi/96.0;ox=boxes[0].X;oy=boxes[0].Y;}}
                }
                POINT probe=new POINT{X=(int)Math.Floor(ox+(x-ox)/factor),Y=(int)Math.Floor(oy+(y-oy)/factor)};
                var point=tp.RangeFromPoint(new Point(probe.X,probe.Y));
                var character=point.Clone();
                character.MoveEndpointByUnit(TextPatternRangeEndpoint.End,TextUnit.Character,1);
                var rect=HitRect(character,probe);
                if(rect.IsEmpty) {
                    character=point.Clone();character.MoveEndpointByUnit(TextPatternRangeEndpoint.Start,TextUnit.Character,-1);
                    rect=HitRect(character,probe);
                }
                if(!rect.IsEmpty) {
                    if(factor!=1)rect=new Rect(ox+(rect.X-ox)*factor,oy+(rect.Y-oy)*factor,rect.Width*factor,rect.Height*factor);
                    string ch=character.GetText(8);
                    if(String.IsNullOrWhiteSpace(ch))return null;
                    // Canvas/images may be exposed as an embedded-object placeholder.
                    // That is not the visible character and must reach the OCR fallback.
                    if(ch.IndexOf('\uFFFC')>=0||ch.IndexOf('\uFFFD')>=0)break;
                    // Keep the actual character boundary. Windows' Japanese word segmentation is not used.
                    var before=character.Clone();before.MoveEndpointByRange(TextPatternRangeEndpoint.End,character,TextPatternRangeEndpoint.Start);
                    before.MoveEndpointByUnit(TextPatternRangeEndpoint.Start,TextUnit.Character,-contextExtent);
                    var after=character.Clone();after.MoveEndpointByUnit(TextPatternRangeEndpoint.End,TextUnit.Character,contextExtent);
                    string left=before.GetText(contextExtent*4+20),right=after.GetText(contextExtent*4+20);
                    if(String.IsNullOrEmpty(right))return null;
                    return new {kind="text",text=left+right,offset=left.Length,query=right,x=x,y=y,
                        rect=new {x=rect.X,y=rect.Y,width=rect.Width,height=rect.Height},
                        source=process,title=title,hwnd=root.ToInt64(),pid=pid,provider="UIAutomation.TextPattern"};
                }
            }
            candidate=TreeWalker.RawViewWalker.GetParent(candidate);
        }
        }catch(ElementNotAvailableException){}catch(InvalidOperationException){}catch(COMException){}
        var legacy=AccessibleTextReader.Read(x,y,contextExtent);
        if(legacy!=null&&legacy.offset<legacy.text.Length&&legacy.text[legacy.offset]!='\uFFFC'&&legacy.text[legacy.offset]!='\uFFFD')return new {kind="text",text=legacy.text,offset=legacy.offset,query=legacy.text.Substring(legacy.offset),x=x,y=y,
            rect=new{x=legacy.x,y=legacy.y,width=legacy.width,height=legacy.height},source=process,title=title,hwnd=root.ToInt64(),pid=pid,provider="IAccessible2.Text"};
        var modern=readClock.ElapsedMilliseconds<1400?ModernTextReader.Read(x,y,contextExtent,root):null;
        if(modern!=null&&!String.IsNullOrEmpty(modern.query)&&modern.query[0]!='\uFFFC'&&modern.query[0]!='\uFFFD')return new{kind="text",text=modern.text,offset=modern.offset,query=modern.query,x=x,y=y,rect=modern.rect,source=process,title=title,hwnd=root.ToInt64(),pid=pid,provider="UIAutomation3.TextPattern"};
        if(ocrEnabled){var ocr=OcrPoint(x,y,gesture);if(ocr!=null)return ocr;}
        if(!hasTextPattern)return new{kind="unsupported",source=process,pid=pid,reason="no-character-provider"};
        return null;
    }
    static void Worker() {
        while(!exit) {
            ready.WaitOne(500);Dictionary<string,object> current;
            lock(queueLock){current=job;job=null;}
            if(current==null)continue;busy=true;
            try {
                long seq=Convert.ToInt64(current["sequence"]);int x=Convert.ToInt32(current["x"]),y=Convert.ToInt32(current["y"]);
                long gesture=Convert.ToInt64(current["gesture"]);
                var result=current.ContainsKey("ocrOnly")?(ocrEnabled?OcrPoint(x,y,gesture):null):ReadPoint(x,y,gesture);
                POINT now;GetCursorPos(out now);
                if(seq==Interlocked.Read(ref sequence)&&Math.Abs(now.X-x)<=2&&Math.Abs(now.Y-y)<=2&&enabled&&GetAncestor(WindowFromPoint(now),2).ToInt64()==Convert.ToInt64(current["window"]))
                    Send(new{kind="result",sequence=seq,gesture=Convert.ToInt64(current["gesture"]),data=result});
            } catch(ElementNotAvailableException){}catch(InvalidOperationException){}catch(COMException){}
            catch(Exception ex){Send(new{kind="provider-error",error=ex.GetType().Name});}
            finally{busy=false;}
        }
    }
    static object VlcWindows() {
        var windows=new List<object>();
        EnumWindows((h,arg)=>{
            if(!IsWindowVisible(h)||IsIconic(h))return true;
            uint pid;GetWindowThreadProcessId(h,out pid);if(ProcessName(pid)!="vlc")return true;
            RECT r;GetClientRect(h,out r);POINT p=new POINT();ClientToScreen(h,ref p);
            IntPtr video=IntPtr.Zero;int best=0;
            EnumChildWindows(h,(child,a)=>{
                string cls=ClassName(child);RECT c;GetClientRect(child,out c);
                int size=(c.R-c.L)*(c.B-c.T);
                if(IsWindowVisible(child)&&size>best&&(cls.Contains("VLC video")||cls.Contains("video"))){video=child;best=size;}
                return true;
            },IntPtr.Zero);
            if(video==IntPtr.Zero&&ClassName(h).Contains("VLC video"))video=h;
            if(video==IntPtr.Zero)return true;
            if(video!=IntPtr.Zero){GetClientRect(video,out r);p=new POINT();ClientToScreen(video,ref p);}
            if(r.R-r.L<160||r.B-r.T<90)return true;
            windows.Add(new{hwnd=h.ToInt64(),pid=pid,title=WindowTitle(h),x=p.X,y=p.Y,width=r.R-r.L,height=r.B-r.T,foreground=GetForegroundWindow()==h,video=video.ToInt64()});
            return true;
        },IntPtr.Zero);
        return new{kind="vlc-windows",windows=windows};
    }
    [STAThread] public static void Main(string[] args) {
        Console.OutputEncoding=new UTF8Encoding(false);Console.InputEncoding=new UTF8Encoding(false);
        try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
        if(args.Length==3&&args[0]=="--point") {try{Send(ReadPoint(Int32.Parse(args[1]),Int32.Parse(args[2])));}catch(Exception e){Send(new{error=e.ToString()});}return;}
        if(args.Length==4&&args[0]=="--window-point"){try{RECT bounds;if(!GetWindowRect(new IntPtr(Int64.Parse(args[1])),out bounds))throw new ArgumentException("Window unavailable");Send(ReadPoint(bounds.L+Int32.Parse(args[2]),bounds.T+Int32.Parse(args[3])));}catch(Exception e){Send(new{error=e.ToString()});}return;}
        if(args.Length==4&&args[0]=="--ia2-window"){try{Send(AccessibleTextReader.Read(Int32.Parse(args[2]),Int32.Parse(args[3]),contextExtent,new IntPtr(Int64.Parse(args[1]))));}catch(Exception e){Send(new{error=e.ToString()});}return;}
        if(args.Length==4&&args[0]=="--modern-window"){try{Send(ModernTextReader.Read(Int32.Parse(args[2]),Int32.Parse(args[3]),contextExtent,new IntPtr(Int64.Parse(args[1])),true));}catch(Exception e){Send(new{error=e.ToString()});}return;}
        if(args.Length==2&&args[0]=="--window-info"){
            var window=new IntPtr(Int64.Parse(args[1]));RECT bounds;uint pid;GetWindowThreadProcessId(window,out pid);GetWindowRect(window,out bounds);
            Send(new{window=window.ToInt64(),pid=pid,source=ProcessName(pid),visible=IsWindowVisible(window),foreground=GetForegroundWindow().ToInt64(),x=bounds.L,y=bounds.T,width=bounds.R-bounds.L,height=bounds.B-bounds.T});return;
        }
        if(args.Length==3&&args[0]=="--top-at"){
            var point=new POINT{X=Int32.Parse(args[1]),Y=Int32.Parse(args[2])};var window=GetAncestor(WindowFromPoint(point),2);uint pid;GetWindowThreadProcessId(window,out pid);Send(new{window=window.ToInt64(),pid=pid,source=ProcessName(pid),foreground=GetForegroundWindow().ToInt64()});return;
        }
        if(args.Length==1&&args[0]=="--windows"){Send(VlcWindows());return;}
        if(args.Length==4&&args[0]=="--attach-owner"){Send(new{ok=AttachOwner(Int64.Parse(args[1]),Int64.Parse(args[2]),Int32.Parse(args[3]))});return;}
        var input=new Thread(()=>{
            string line;while((line=Console.ReadLine())!=null) {
                try{
                    var d=json.Deserialize<Dictionary<string,object>>(line);
                    if(d.ContainsKey("scanKey")){int k=Convert.ToInt32(d["scanKey"]);if(k>=0x04&&k<=0xFE&&k!=0x07&&k!=0x1B){if(k!=scanKey)mouseHeld=false;scanKey=k;}}
                    if(d.ContainsKey("enabled"))enabled=Convert.ToBoolean(d["enabled"]);
                    if(d.ContainsKey("extent"))contextExtent=Math.Max(50,Math.Min(2000,Convert.ToInt32(d["extent"])));
                    if(d.ContainsKey("ocr"))ocrEnabled=Convert.ToBoolean(d["ocr"]);
                    if(d.ContainsKey("ocrPoint")){
                        var item=(Dictionary<string,object>)d["ocrPoint"];long seq=Convert.ToInt64(item["sequence"]);
                        if(seq==Interlocked.Read(ref sequence)){lock(queueLock){item["ocrOnly"]=true;job=item;}ready.Set();}
                    }
                    if(d.ContainsKey("quit")){exit=true;break;}
                    if(d.ContainsKey("pids")){lock(own){own.Clear();foreach(object v in (System.Collections.IEnumerable)d["pids"])own.Add(Convert.ToInt32(v));}}
                    if(d.ContainsKey("raiseApp")&&Convert.ToString(d["raiseApp"])=="anki"){var raise=new Thread(()=>RaiseApp("anki"));raise.IsBackground=true;raise.Start();}
                    if(d.ContainsKey("ownerWindow")&&d.ContainsKey("owner")){long window=Convert.ToInt64(d["ownerWindow"]),owner=Convert.ToInt64(d["owner"]);uint pid;GetWindowThreadProcessId(new IntPtr(window),out pid);bool allowed;lock(own)allowed=own.Contains((int)pid);Send(new{kind="owner-attached",window=window,ok=allowed&&AttachOwner(window,owner,(int)pid)});}
                }catch{}
            }
            exit=true;
        });input.IsBackground=true;input.Start();
        var worker=new Thread(Worker);worker.IsBackground=true;worker.SetApartmentState(ApartmentState.STA);worker.Start();
        var shortcuts=new Thread(Shortcuts);shortcuts.IsBackground=true;shortcuts.Start();
        var ocrStatus=new Thread(()=>{try{var state=OcrReader.GetStatus();Send(new{kind="ocr-ready",available=state.available,language=state.language});}catch{Send(new{kind="ocr-ready",available=false,language="ja"});}});ocrStatus.IsBackground=true;ocrStatus.Start();
        Send(new{kind="ready",protocol=1});
        int lx=Int32.MinValue,ly=0,px=Int32.MinValue,py=0;long gesture=0;bool previousShift=false,previousEsc=false,previousMouse=false;int lastWindows=Environment.TickCount-1000,lastHeart=Environment.TickCount-1000;
        IntPtr previousForeground=GetForegroundWindow();
        while(!exit) {
            POINT p;GetCursorPos(out p);
            IntPtr fg=GetForegroundWindow();if(fg!=previousForeground){uint fpid;GetWindowThreadProcessId(fg,out fpid);Send(new{kind="foreground",pid=fpid,hwnd=fg.ToInt64()});previousForeground=fg;}
            if(!enabled)mouseHeld=false;int key=scanKey;bool hooked=IsMouse(key)?mouseHookReady:keyboardHookReady;
            bool shift=IsMouse(key)&&mouseHookReady?mouseHeld:(GetAsyncKeyState(key)&0x8000)!=0,esc=(GetAsyncKeyState(0x1b)&0x8000)!=0;
            bool shiftTap=Interlocked.Exchange(ref shiftPulse,0)!=0,escapeTap=Interlocked.Exchange(ref escapePulse,0)!=0;
            if(p.X!=px||p.Y!=py){Send(new{kind="pointer-move",x=p.X,y=p.Y});px=p.X;py=p.Y;}
            if(shiftTap||(!hooked&&shift&&!previousShift)){gesture++;Send(new{kind="shift-down",gesture=gesture,x=p.X,y=p.Y});}
            bool mouse=(GetAsyncKeyState(0x01)&0x8000)!=0;if(mouse&&!previousMouse)Send(new{kind="pointer-down",x=p.X,y=p.Y});previousMouse=mouse;
            if((esc&&!previousEsc)||escapeTap)Send(new{kind="escape"});previousEsc=esc;
            if((gesture>0||!hooked)&&(shift||shiftTap)&&enabled&&(p.X!=lx||p.Y!=ly||!previousShift||shiftTap)) {
                long seq=Interlocked.Increment(ref sequence);
                IntPtr pointed=WindowFromPoint(p);uint pointedPid;GetWindowThreadProcessId(pointed,out pointedPid);long window=GetAncestor(pointed,2).ToInt64();
                Send(new{kind="cursor",x=p.X,y=p.Y,pid=pointedPid,hwnd=window,shift=true,sequence=seq,gesture=gesture,delegated=ProcessName(pointedPid).Equals("vlc",StringComparison.OrdinalIgnoreCase)});
                lock(queueLock){job=new Dictionary<string,object>{{"x",p.X},{"y",p.Y},{"sequence",seq},{"window",window},{"gesture",gesture}};}ready.Set();
                lx=p.X;ly=p.Y;
            }
            if(!shift&&(previousShift||shiftTap))Send(new{kind="shift-up",gesture=gesture});previousShift=shift;
            int now=Environment.TickCount;
            if(unchecked(now-lastWindows)>300){Send(VlcWindows());lastWindows=now;}
            if(unchecked(now-lastHeart)>1000){Send(new{kind="heartbeat",busy=busy});lastHeart=now;}
            Thread.Sleep(25);
        }
        if(hookThreadId!=0)PostThreadMessage(hookThreadId,0x12,IntPtr.Zero,IntPtr.Zero);
    }
}
