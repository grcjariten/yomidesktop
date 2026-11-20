// SPDX-License-Identifier: GPL-3.0-or-later
using System;using System.Diagnostics;using System.IO;using System.Text;using System.Web.Script.Serialization;
public static class OcrReader {
    public sealed class Status {public bool available;public string language;}
    static Process reader;static bool ready;static object gate=new object();static JavaScriptSerializer json=new JavaScriptSerializer();
    static OcrReader(){AppDomain.CurrentDomain.ProcessExit+=(s,e)=>Close();}
    static void Close(){try{if(reader!=null&&!reader.HasExited)reader.Kill();}catch{}try{if(reader!=null)reader.Dispose();}catch{}reader=null;}
    static string Call(string command){
        lock(gate){try{
            if(reader==null||reader.HasExited){Close();string file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ScreenOcr.exe");if(!File.Exists(file))return null;reader=Process.Start(new ProcessStartInfo{FileName=file,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,StandardOutputEncoding=new UTF8Encoding(false)});ready=false;}
            reader.StandardInput.WriteLine(command);reader.StandardInput.Flush();var result=reader.StandardOutput.ReadLineAsync();
            if(!result.Wait(ready?5500:65000)||result.Result==null){Close();return null;}ready=true;return result.Result;
        }catch{Close();return null;}}
    }
    public static Status GetStatus(){var value=Call("status");return value==null?new Status():json.Deserialize<Status>(value);}
    public static OcrLayout.Hit Read(int x,int y,IntPtr window,long gesture){
        string value=Call(x+" "+y+" "+window.ToInt64()+" "+gesture);if(value==null)return null;
        var hit=json.Deserialize<OcrLayout.Hit>(value);return hit!=null&&!String.IsNullOrEmpty(hit.text)&&hit.rect!=null?hit:null;
    }
}
