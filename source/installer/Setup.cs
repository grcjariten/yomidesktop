// SPDX-License-Identifier: GPL-3.0-or-later
// YomiDesktop installer: downloads the latest release, installs it for the current user
// (no administrator rights), creates shortcuts and an uninstaller. Personal data in "data" is kept on update.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class Setup
{
    const string AppName = "YomiDesktop";
    public const string ZipName = "YomiDesktop-Windows-x64.zip";
    public const string DownloadUrl = "https://github.com/grcjariten/yomidesktop/releases/latest/download/" + ZipName;
    const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\YomiDesktop";
    static readonly string[] Processes = { "YomiDesktopRuntime", "YomiDesktop", "TextProbe", "TextProbeModern", "ScreenOcr", "python" };

    [STAThread]
    static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        int u = Array.FindIndex(args, a => a.Equals("/uninstall", StringComparison.OrdinalIgnoreCase));
        if (u >= 0) return Uninstall(u + 1 < args.Length ? args[u + 1] : AppDomain.CurrentDomain.BaseDirectory);
        // The copy inside the program folder is "Uninstall.exe": a double click uninstalls.
        if (Path.GetFileNameWithoutExtension(Application.ExecutablePath).Equals("Uninstall", StringComparison.OrdinalIgnoreCase))
            return Uninstall(AppDomain.CurrentDomain.BaseDirectory);
        // Test only: extract a ZIP into a folder, no shortcuts or registry.
        if (args.Length == 3 && args[0] == "/extract-test")
        {
            Console.WriteLine(new InstallForm().ExtractForTest(args[1], args[2]));
            return 0;
        }
        if (args.Length == 3 && args[0] == "/shortcut-test") { Shortcut(args[1], args[2], Path.GetDirectoryName(args[2])); return 0; }
        Application.Run(new InstallForm());
        return 0;
    }

    public static string DefaultFolder()
    {
        string existing = null;
        using (var k = Registry.CurrentUser.OpenSubKey(UninstallKey)) if (k != null) existing = k.GetValue("InstallLocation") as string;
        if (!string.IsNullOrEmpty(existing)) return existing;
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", AppName);
    }

    public static bool StopRunning(string folder)
    {
        string root = Path.GetFullPath(folder).TrimEnd('\\') + "\\";
        var running = Processes.SelectMany(n => Process.GetProcessesByName(n)).Where(p =>
        {
            try { return p.MainModule.FileName.StartsWith(root, StringComparison.OrdinalIgnoreCase); } catch { return false; }
        }).ToList();
        foreach (var p in running) { try { p.Kill(); p.WaitForExit(5000); } catch { } }
        return running.Count > 0;
    }

    public static void Shortcut(string link, string target, string folder)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object sc = shellType.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { link });
        Type t = sc.GetType();
        t.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, sc, new object[] { target });
        t.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, sc, new object[] { folder });
        t.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty, null, sc, new object[] { target + ",0" });
        t.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, sc, null);
    }

    public static string StartMenuLink() { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName + ".lnk"); }
    public static string UninstallLink() { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Disinstalla " + AppName + ".lnk"); }
    public static string DesktopLink() { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppName + ".lnk"); }

    static int Uninstall(string folder)
    {
        folder = Path.GetFullPath(folder.Trim('"')).TrimEnd('\\');
        if (!File.Exists(Path.Combine(folder, "YomiDesktopRuntime.exe")))
        {
            MessageBox.Show("Non trovo YomiDesktop in questa cartella:\n" + folder, AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
        // The uninstaller lives inside the folder it deletes: run a temporary copy instead.
        string self = Process.GetCurrentProcess().MainModule.FileName;
        if (self.StartsWith(folder + "\\", StringComparison.OrdinalIgnoreCase))
        {
            string copy = Path.Combine(Path.GetTempPath(), "YomiDesktop-Uninstall.exe");
            File.Copy(self, copy, true);
            Process.Start(copy, "/uninstall \"" + folder + "\"");
            return 0;
        }
        if (MessageBox.Show("Vuoi disinstallare YomiDesktop?", AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return 1;
        bool removeData = MessageBox.Show("Vuoi eliminare anche dizionari e impostazioni?\n\nSe scegli No, li ritrovi se reinstalli.", AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
        StopRunning(folder);
        foreach (string entry in Directory.GetFileSystemEntries(folder))
        {
            if (!removeData && Path.GetFileName(entry).Equals("data", StringComparison.OrdinalIgnoreCase)) continue;
            try { if (Directory.Exists(entry)) Directory.Delete(entry, true); else File.Delete(entry); } catch { }
        }
        if (removeData) { try { Directory.Delete(folder, true); } catch { } }
        foreach (string link in new[] { StartMenuLink(), UninstallLink(), DesktopLink() }) { try { File.Delete(link); } catch { } }
        using (var run = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
            if (run != null) foreach (string name in run.GetValueNames())
                    if ((run.GetValue(name) as string ?? "").IndexOf(folder, StringComparison.OrdinalIgnoreCase) >= 0) run.DeleteValue(name, false);
        Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);
        MessageBox.Show("YomiDesktop è stato disinstallato.", AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
        return 0;
    }

    public static void Register(string folder, string version)
    {
        using (var key = Registry.CurrentUser.CreateSubKey(UninstallKey))
        {
            string uninstaller = Path.Combine(folder, "Uninstall.exe");
            key.SetValue("DisplayName", AppName);
            key.SetValue("DisplayVersion", version);
            key.SetValue("Publisher", "YomiDesktop");
            key.SetValue("InstallLocation", folder);
            key.SetValue("DisplayIcon", Path.Combine(folder, "YomiDesktop.exe"));
            key.SetValue("UninstallString", "\"" + uninstaller + "\" /uninstall \"" + folder + "\"");
            key.SetValue("URLInfoAbout", "https://github.com/grcjariten/yomidesktop");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            long size = 0;
            try { size = new DirectoryInfo(folder).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length) / 1024; } catch { }
            key.SetValue("EstimatedSize", (int)Math.Min(int.MaxValue, size), RegistryValueKind.DWord);
        }
    }
}

class InstallForm : Form
{
    readonly TextBox folderBox = new TextBox();
    readonly CheckBox desktopBox = new CheckBox();
    readonly ProgressBar bar = new ProgressBar();
    readonly Label status = new Label();
    readonly Button installButton = new Button();
    readonly Button browseButton = new Button();
    bool finished;

    public InstallForm()
    {
        Text = "Installa YomiDesktop";
        Font = new Font("Segoe UI", 10f);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(520, 300);
        BackColor = Color.FromArgb(22, 25, 32);
        ForeColor = Color.FromArgb(237, 240, 246);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        var title = new Label { Text = "YomiDesktop", Font = new Font("Segoe UI Semibold", 20f), AutoSize = true, Location = new Point(28, 22) };
        var subtitle = new Label { Text = "Punta una parola giapponese, premi un tasto, capisci.", ForeColor = Color.FromArgb(155, 165, 183), AutoSize = true, Location = new Point(31, 66) };
        var where = new Label { Text = "Cartella di installazione", ForeColor = Color.FromArgb(174, 185, 202), AutoSize = true, Location = new Point(31, 112) };
        folderBox.Text = Setup.DefaultFolder();
        folderBox.SetBounds(31, 136, 360, 28);
        folderBox.BackColor = Color.FromArgb(20, 24, 31); folderBox.ForeColor = ForeColor; folderBox.BorderStyle = BorderStyle.FixedSingle;
        browseButton.Text = "Cambia…"; browseButton.SetBounds(400, 134, 90, 30); Style(browseButton, false);
        browseButton.Click += (s, e) =>
        {
            using (var d = new FolderBrowserDialog { Description = "Scegli dove installare YomiDesktop", SelectedPath = folderBox.Text })
                if (d.ShowDialog(this) == DialogResult.OK) folderBox.Text = Path.Combine(d.SelectedPath, "YomiDesktop");
        };
        desktopBox.Text = "Crea un collegamento sul desktop"; desktopBox.Checked = true; desktopBox.AutoSize = true; desktopBox.Location = new Point(31, 176);
        bar.SetBounds(31, 214, 459, 8); bar.Visible = false;
        status.SetBounds(31, 228, 459, 22); status.ForeColor = Color.FromArgb(152, 219, 186);
        status.Text = "Circa 500 MB da scaricare. Dopo, una breve configurazione guidata.";
        installButton.Text = "Installa"; installButton.SetBounds(370, 254, 120, 34); Style(installButton, true);
        installButton.Click += (s, e) => { if (finished) Launch(); else Start(); };
        AcceptButton = installButton;
        Controls.AddRange(new Control[] { title, subtitle, where, folderBox, browseButton, desktopBox, bar, status, installButton });
        ActiveControl = installButton;
    }

    static void Style(Button b, bool primary)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderColor = primary ? Color.FromArgb(132, 183, 245) : Color.FromArgb(70, 76, 88);
        b.BackColor = primary ? Color.FromArgb(132, 183, 245) : Color.FromArgb(32, 36, 45);
        b.ForeColor = primary ? Color.FromArgb(20, 34, 54) : Color.FromArgb(203, 214, 231);
        b.Cursor = Cursors.Hand;
    }

    void Ui(Action a) { if (IsHandleCreated) BeginInvoke(a); }
    void Say(string text, int percent = -1)
    {
        Ui(() =>
        {
            status.Text = text;
            if (percent < 0) bar.Style = ProgressBarStyle.Marquee;
            else { bar.Style = ProgressBarStyle.Continuous; bar.Value = Math.Max(0, Math.Min(100, percent)); }
        });
    }

    void Start()
    {
        string folder;
        try { folder = Path.GetFullPath(folderBox.Text.Trim()); }
        catch { MessageBox.Show(this, "La cartella non è valida.", Text); return; }
        installButton.Enabled = browseButton.Enabled = folderBox.Enabled = desktopBox.Enabled = false;
        bar.Visible = true;
        bool desktop = desktopBox.Checked;
        new Thread(() => Install(folder, desktop)) { IsBackground = true }.Start();
    }

    void Install(string folder, bool desktop)
    {
        string zip = null; bool downloaded = false;
        try
        {
            // A ZIP next to the installer is used as is (offline install).
            string local = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "YomiDesktop-Windows-x64.zip");
            if (File.Exists(local)) zip = local;
            else
            {
                zip = Path.Combine(Path.GetTempPath(), "YomiDesktop-download.zip");
                Download(zip); downloaded = true;
            }
            Say("Chiudo YomiDesktop se è aperto…");
            Setup.StopRunning(folder);
            Directory.CreateDirectory(folder);
            string version = Extract(zip, folder);
            Say("Creo i collegamenti…");
            File.Copy(Application.ExecutablePath, Path.Combine(folder, "Uninstall.exe"), true);
            string exe = Path.Combine(folder, "YomiDesktop.exe");
            Setup.Shortcut(Setup.StartMenuLink(), exe, folder);
            Setup.Shortcut(Setup.UninstallLink(), Path.Combine(folder, "Uninstall.exe"), folder);
            if (desktop) Setup.Shortcut(Setup.DesktopLink(), exe, folder);
            Setup.Register(folder, version);
            if (downloaded) { try { File.Delete(zip); } catch { } }
            Ui(() =>
            {
                finished = true;
                bar.Style = ProgressBarStyle.Continuous; bar.Value = 100;
                status.Text = "Installato! Ora si apre la configurazione guidata.";
                installButton.Text = "Apri YomiDesktop"; installButton.Width = 160; installButton.Left = 330; installButton.Enabled = true;
                installButton.Tag = folder; installButton.Focus();
            });
        }
        catch (Exception e)
        {
            Ui(() =>
            {
                bar.Visible = false;
                status.ForeColor = Color.FromArgb(255, 181, 169);
                status.Text = "Installazione non riuscita: " + e.Message;
                installButton.Text = "Riprova";
                installButton.Enabled = browseButton.Enabled = folderBox.Enabled = desktopBox.Enabled = true;
            });
        }
    }

    void Download(string target)
    {
        Exception error = null;
        using (var done = new ManualResetEvent(false))
        using (var web = new WebClient())
        {
            web.Headers.Add("User-Agent", "YomiDesktop-Setup");
            web.DownloadProgressChanged += (s, e) =>
            {
                long total = e.TotalBytesToReceive > 0 ? e.TotalBytesToReceive : 0;
                Say(total > 0 ? string.Format("Scarico YomiDesktop… {0} di {1} MB", e.BytesReceived >> 20, total >> 20) : string.Format("Scarico YomiDesktop… {0} MB", e.BytesReceived >> 20), total > 0 ? (int)(e.BytesReceived * 100 / total) : -1);
            };
            web.DownloadFileCompleted += (s, e) => { error = e.Error; done.Set(); };
            Say("Mi collego a GitHub…");
            web.DownloadFileAsync(new Uri(Setup.DownloadUrl), target);
            done.WaitOne();
        }
        if (error != null) throw new Exception("download non riuscito. Controlla la connessione. (" + error.Message + ")");
    }

    public string ExtractForTest(string zip, string folder) { Directory.CreateDirectory(folder); return Extract(zip, folder); }

    string Extract(string zip, string folder)
    {
        string root = Path.GetFullPath(folder).TrimEnd('\\') + "\\";
        string version = "";
        using (var archive = ZipFile.OpenRead(zip))
        {
            var entries = archive.Entries.Where(e => !string.IsNullOrEmpty(e.Name)).ToList();
            for (int i = 0; i < entries.Count; i++)
            {
                var entry = entries[i];
                // The ZIP holds one top folder ("YomiDesktop/"): strip it.
                string name = entry.FullName.Replace('/', '\\');
                int slash = name.IndexOf('\\');
                string relative = slash >= 0 ? name.Substring(slash + 1) : name;
                if (relative.StartsWith("data\\", StringComparison.OrdinalIgnoreCase)) continue; // keep the user's data
                string target = Path.GetFullPath(Path.Combine(folder, relative));
                if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue;
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                entry.ExtractToFile(target, true);
                if (relative.Equals("resources\\app\\package.json", StringComparison.OrdinalIgnoreCase))
                {
                    var m = System.Text.RegularExpressions.Regex.Match(File.ReadAllText(target), "\"version\"\\s*:\\s*\"([^\"]+)\"");
                    if (m.Success) version = m.Groups[1].Value;
                }
                if (i % 25 == 0) Say(string.Format("Installo… {0}%", (i + 1) * 100 / entries.Count), (i + 1) * 100 / entries.Count);
            }
        }
        return version;
    }

    void Launch()
    {
        string folder = installButton.Tag as string;
        try { Process.Start(new ProcessStartInfo { FileName = Path.Combine(folder, "YomiDesktop.exe"), WorkingDirectory = folder, UseShellExecute = true }); } catch { }
        Close();
    }
}
