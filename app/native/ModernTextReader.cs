// SPDX-License-Identifier: GPL-3.0-or-later
using System;using System.Diagnostics;using System.IO;using System.Text;using System.Web.Script.Serialization;
public static class ModernTextReader {
    public sealed class Box{public double x,y,width,height;}
    public sealed class Hit{public string text,query;public int offset;public Box rect;}
    static Process reader;
    static ModernTextReader(){AppDomain.CurrentDomain.ProcessExit+=(s,e)=>Close();}
    public static void Close(){try{if(reader!=null&&!reader.HasExited)reader.Kill();}catch{}try{if(reader!=null)reader.Dispose();}catch{}reader=null;}
    public static Hit Read(int x,int y,int extent,IntPtr window,bool fromWindow=false){
        try{
            if(reader==null||reader.HasExited){
                Close();string file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"TextProbeModern.exe");if(!File.Exists(file))return null;
                reader=Process.Start(new ProcessStartInfo{FileName=file,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,StandardOutputEncoding=new UTF8Encoding(false)});
            }
            reader.StandardInput.WriteLine((fromWindow?"1 ":"0 ")+x+" "+y+" "+extent+" "+window.ToInt64());reader.StandardInput.Flush();
            var output=reader.StandardOutput.ReadLineAsync();
            if(!output.Wait(1200)){Close();return null;}
            if(output.Result==null){Close();return null;}
            return new JavaScriptSerializer().Deserialize<Hit>(output.Result);
        }catch{Close();return null;}
    }
}
