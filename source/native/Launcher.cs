using System;using System.Diagnostics;using System.IO;using System.Windows.Forms;
class Launcher{
 [STAThread]static void Main(string[] args){try{string root=AppDomain.CurrentDomain.BaseDirectory;string options=Array.IndexOf(args,"--self-test")>=0?"--self-test":Array.IndexOf(args,"--background")>=0?"--background":"";Process.Start(new ProcessStartInfo{FileName=Path.Combine(root,"YomiDesktopRuntime.exe"),Arguments=options,WorkingDirectory=root,UseShellExecute=false,WindowStyle=options.Length==0?ProcessWindowStyle.Normal:ProcessWindowStyle.Hidden});}catch(Exception){MessageBox.Show("Non riesco ad avviare YomiDesktop. Mantieni tutti i file nella stessa cartella e riprova.","YomiDesktop",MessageBoxButtons.OK,MessageBoxIcon.Error);}}
}
