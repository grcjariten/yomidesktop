# Build from source

Use Windows x64 with PowerShell, the .NET Framework compiler, Zig 0.14.1, and Electron 45.2.3 for Windows x64. JavaScript tests use Node.js and require no npm packages.

The portable build also needs a prepared `ocr-runtime` directory with embedded CPython, RapidOCR, and ONNX Runtime. The runtime manifest records versions, download URLs, and checksums.

From the repository root, pass the paths to the extracted Electron folder, OCR runtime, and Zig executable.

```powershell
.\scripts\build-portable.ps1 -ElectronDir C:\deps\electron -OcrDir C:\deps\ocr-runtime -Zig C:\deps\zig\zig.exe
```

The script builds the native helpers and launcher, then stages the portable app in `dist/YomiDesktop`. Use an empty staging location. For the optional 32-bit VLC subtitle module, also pass `-VlcHeaders` and `-VlcCore` with matching VLC 3.0.x headers and `libvlccore.dll`. Accessibility and OCR work independently of this module.

```powershell
node --test app/tests/core.test.cjs app/tests/popup-session.test.cjs
```

After building, run the portable integration test with a fresh profile and a synthetic dictionary.

```powershell
python scripts/make-demo-dictionary.py dist/demo-dictionary.zip
$env:YOMIDESKTOP_DATA = Join-Path (Resolve-Path dist).Path ([guid]::NewGuid().ToString('N'))
$env:YOMIDESKTOP_TEST_DICTIONARY = (Resolve-Path dist/demo-dictionary.zip).Path
$runtime = (Resolve-Path dist/YomiDesktop/YomiDesktopRuntime.exe).Path
Start-Process $runtime -ArgumentList '--self-test' -WindowStyle Hidden -Wait
Get-Content (Join-Path $env:YOMIDESKTOP_DATA self-test.json)
```

The test checks ZIP import through the engine settings, dashboard updates, and the lookup popup. Set `YOMIDESKTOP_TEST_SCREENSHOTS` to capture the dashboard and popup.
