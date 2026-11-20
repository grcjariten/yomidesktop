# Builds YomiDesktop-Setup.exe with the C# compiler included in Windows (.NET Framework 4).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$out = Join-Path $PSScriptRoot 'YomiDesktop-Setup.exe'
& (Join-Path $framework 'csc.exe') /nologo /optimize+ /target:winexe /platform:anycpu `
  ("/win32manifest:" + (Join-Path $PSScriptRoot 'setup.manifest')) ("/win32icon:" + (Join-Path $root 'native/app.ico')) ("/out:" + $out) `
  /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll `
  (Join-Path $PSScriptRoot 'Setup.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compilazione Setup non riuscita' }
Write-Output $out
