// SPDX-License-Identifier: GPL-3.0-or-later
using System;using System.Diagnostics;using System.IO;using System.Text;using System.Web.Script.Serialization;using System.Collections.Generic;
public static class NeuralOcrReader {
    public sealed class State{public bool available;public string language,engine;}
    public sealed class Model{public List<OcrLayout.Line> lines;public double angle,scale;public int width,height;}
    static Process worker;static bool ready;static object gate=new object();static JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=16*1024*1024};
    static NeuralOcrReader(){AppDomain.CurrentDomain.ProcessExit+=(s,e)=>Close();}
    static void Close(){try{if(worker!=null&&!worker.HasExited)worker.Kill();}catch{}try{if(worker!=null)worker.Dispose();}catch{}worker=null;}
    static string Runtime(){var directory=new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);for(int i=0;directory!=null&&i<5;i++,directory=directory.Parent){var path=Path.Combine(directory.FullName,"ocr-runtime","python.exe");if(File.Exists(path))return path;}return null;}
    static string Call(object request){lock(gate){try{
        if(worker==null||worker.HasExited){Close();var python=Runtime();if(python==null)return null;
            var info=new ProcessStartInfo{FileName=python,Arguments="-u -X utf8 \""+Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"NeuralOcrWorker.py")+"\"",UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=new UTF8Encoding(false)};
            worker=Process.Start(info);worker.ErrorDataReceived+=(s,e)=>{};worker.BeginErrorReadLine();ready=false;
        }
        worker.StandardInput.WriteLine(json.Serialize(request));worker.StandardInput.Flush();var response=worker.StandardOutput.ReadLineAsync();if(!response.Wait(ready?5000:60000)||response.Result==null){Close();return null;}ready=true;return response.Result;
    }catch{Close();return null;}}}
    public static State Status(){var value=Call(new{op="status"});return value==null?new State():json.Deserialize<State>(value);}
    public static Model Recognize(byte[] png,double x,double y){var value=Call(new{image=Convert.ToBase64String(png),x=x,y=y});return value==null?null:json.Deserialize<Model>(value);}
}
