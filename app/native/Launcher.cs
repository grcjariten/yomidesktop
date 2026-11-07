using System;using System.Diagnostics;using System.IO;using System.Windows.Forms;
class Launcher{
 [STAThread]static void Main(string[] args){try{string root=AppDomain.CurrentDomain.BaseDirectory;string options=Array.IndexOf(args,"--self-test")>=0?"--self-test":Array.IndexOf(args,"--background")>=0?"--background":"";Process.Start(new ProcessStartInfo{FileName=Path.Combine(root,"YomiDesktopRuntime.exe"),Arguments=options,WorkingDirectory=root,UseShellExecute=false,WindowStyle=options.Length==0?ProcessWindowStyle.Normal:ProcessWindowStyle.Hidden});}catch(Exception){MessageBox.Show("YomiDesktop could not start. Keep all files in the extracted folder and try again.","YomiDesktop",MessageBoxButtons.OK,MessageBoxIcon.Error);}}
}
