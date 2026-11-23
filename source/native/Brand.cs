// SPDX-License-Identifier: GPL-3.0-or-later
// Turns the stock electron.exe into YomiDesktop.exe: our icon and our name/version in the file details.
// The app then starts directly, without a tiny launcher (antivirus ML flagged the launcher as "anomalous").
// Usage: Brand.exe <electron.exe> <app.ico> <out.exe> <version, e.g. 2.5.1>
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

static class Brand
{
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr BeginUpdateResource(string file, bool deleteExisting);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateResource(IntPtr h, IntPtr type, IntPtr name, ushort lang, byte[] data, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool EndUpdateResource(IntPtr h, bool discard);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr LoadLibraryEx(string file, IntPtr reserved, uint flags);
    [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr h);
    delegate bool EnumNames(IntPtr module, IntPtr type, IntPtr name, IntPtr param);
    delegate bool EnumLangs(IntPtr module, IntPtr type, IntPtr name, ushort lang, IntPtr param);
    [DllImport("kernel32.dll")] static extern bool EnumResourceNames(IntPtr module, IntPtr type, EnumNames cb, IntPtr param);
    [DllImport("kernel32.dll")] static extern bool EnumResourceLanguages(IntPtr module, IntPtr type, IntPtr name, EnumLangs cb, IntPtr param);

    static readonly IntPtr RT_ICON = (IntPtr)3, RT_GROUP_ICON = (IntPtr)14, RT_VERSION = (IntPtr)16;
    const ushort English = 1033;

    static int Main(string[] a)
    {
        if (a.Length != 4) { Console.Error.WriteLine("Brand.exe <electron.exe> <app.ico> <out.exe> <version>"); return 2; }
        string input = a[0], ico = a[1], output = a[2], version = a[3];
        File.Copy(input, output, true);

        // Existing icons and version blocks (all ids and languages), so they can be replaced cleanly.
        var old = new List<Tuple<IntPtr, IntPtr, ushort>>();
        IntPtr module = LoadLibraryEx(input, IntPtr.Zero, 0x2 /* LOAD_LIBRARY_AS_DATAFILE */);
        if (module == IntPtr.Zero) throw new Exception("cannot read " + input);
        var keep = new List<object>();
        foreach (IntPtr type in new[] { RT_ICON, RT_GROUP_ICON, RT_VERSION })
        {
            EnumLangs langs = (m, t, n, l, p) => { old.Add(Tuple.Create(t, n, l)); return true; };
            EnumNames names = (m, t, n, p) => { EnumResourceLanguages(m, t, n, langs, IntPtr.Zero); return true; };
            keep.Add(langs); keep.Add(names);
            EnumResourceNames(module, type, names, IntPtr.Zero);
        }
        FreeLibrary(module);
        foreach (var r in old) if (!IsInt(r.Item2)) throw new Exception("named resource not supported");

        IntPtr h = BeginUpdateResource(output, false);
        if (h == IntPtr.Zero) throw new Exception("BeginUpdateResource " + Marshal.GetLastWin32Error());
        foreach (var r in old) Check(UpdateResource(h, r.Item1, r.Item2, r.Item3, null, 0));

        // .ico file -> one RT_ICON per image + one RT_GROUP_ICON (id 1, the one Windows shows).
        byte[] icoBytes = File.ReadAllBytes(ico);
        int count = BitConverter.ToUInt16(icoBytes, 4);
        var group = new MemoryStream(); var g = new BinaryWriter(group);
        g.Write((ushort)0); g.Write((ushort)1); g.Write((ushort)count);
        for (int i = 0; i < count; i++)
        {
            int e = 6 + i * 16;
            int size = BitConverter.ToInt32(icoBytes, e + 8), offset = BitConverter.ToInt32(icoBytes, e + 12);
            byte[] image = new byte[size]; Array.Copy(icoBytes, offset, image, 0, size);
            ushort id = (ushort)(i + 1);
            Check(UpdateResource(h, RT_ICON, (IntPtr)id, English, image, (uint)size));
            g.Write(icoBytes, e, 12); g.Write(id);
        }
        byte[] groupBytes = group.ToArray();
        Check(UpdateResource(h, RT_GROUP_ICON, (IntPtr)1, English, groupBytes, (uint)groupBytes.Length));

        byte[] info = VersionInfo(version);
        Check(UpdateResource(h, RT_VERSION, (IntPtr)1, English, info, (uint)info.Length));
        if (!EndUpdateResource(h, false)) throw new Exception("EndUpdateResource " + Marshal.GetLastWin32Error());
        GC.KeepAlive(keep);
        Console.WriteLine(output);
        return 0;
    }

    static bool IsInt(IntPtr p) { return ((ulong)p.ToInt64() >> 16) == 0; }
    static void Check(bool ok) { if (!ok) throw new Exception("UpdateResource " + Marshal.GetLastWin32Error()); }

    // VS_VERSIONINFO with the file details Windows shows (Properties > Details, Task Manager).
    static byte[] VersionInfo(string version)
    {
        string[] p = (version + ".0.0.0").Split('.');
        ushort v1 = ushort.Parse(p[0]), v2 = ushort.Parse(p[1]), v3 = ushort.Parse(p[2]), v4 = ushort.Parse(p[3]);
        var strings = new[,] {
            { "CompanyName", "YomiDesktop" }, { "FileDescription", "YomiDesktop" }, { "FileVersion", version },
            { "InternalName", "YomiDesktop" }, { "LegalCopyright", "GPL-3.0-or-later" }, { "OriginalFilename", "YomiDesktop.exe" },
            { "ProductName", "YomiDesktop" }, { "ProductVersion", version } };
        var children = new List<byte[]>();
        for (int i = 0; i < strings.GetLength(0); i++) children.Add(Block(strings[i, 0], Text(strings[i, 1]), 1, true));
        byte[] table = Block("040904b0", Concat(children), 1, false);
        byte[] sfi = Block("StringFileInfo", table, 1, false);
        byte[] vfi = Block("VarFileInfo", Block("Translation", new byte[] { 0x09, 0x04, 0xb0, 0x04 }, 0, false), 1, false);
        var fixedInfo = new MemoryStream(); var f = new BinaryWriter(fixedInfo);
        f.Write(0xFEEF04BDu); f.Write(0x00010000u);
        f.Write((uint)(v1 << 16 | v2)); f.Write((uint)(v3 << 16 | v4));
        f.Write((uint)(v1 << 16 | v2)); f.Write((uint)(v3 << 16 | v4));
        f.Write(0x3Fu); f.Write(0u); f.Write(0x40004u /* NT */); f.Write(1u /* APP */); f.Write(0u); f.Write(0u); f.Write(0u);
        return Block("VS_VERSION_INFO", Concat(new List<byte[]> { Pad(fixedInfo.ToArray()), sfi, vfi }), 0, false, fixedInfo.ToArray().Length);
    }
    static byte[] Text(string s) { return Encoding.Unicode.GetBytes(s + "\0"); }
    static byte[] Pad(byte[] b) { int n = (b.Length + 3) & ~3; Array.Resize(ref b, n); return b; }
    static byte[] Concat(List<byte[]> parts) { var m = new MemoryStream(); foreach (var x in parts) m.Write(Pad(x), 0, Pad(x).Length); return m.ToArray(); }
    // One version block: length, value length, type, key, padding, value/children.
    static byte[] Block(string key, byte[] value, ushort type, bool isString, int valueLength = -1)
    {
        var m = new MemoryStream(); var w = new BinaryWriter(m);
        w.Write((ushort)0);
        w.Write((ushort)(valueLength >= 0 ? valueLength : isString ? value.Length / 2 : (key == "Translation" ? value.Length : 0)));
        w.Write(type); w.Write(Text(key));
        while (m.Length % 4 != 0) w.Write((byte)0);
        w.Write(value);
        byte[] r = m.ToArray();
        BitConverter.GetBytes((ushort)r.Length).CopyTo(r, 0);
        return r;
    }
}
