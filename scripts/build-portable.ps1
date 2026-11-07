param(
  [Parameter(Mandatory)][string]$ElectronDir,
  [Parameter(Mandatory)][string]$OcrDir,
  [Parameter(Mandatory)][string]$Zig,
  [string]$VlcHeaders,
  [string]$VlcCore
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$source = Join-Path $repo 'app'
$dist = Join-Path $repo 'dist/YomiDesktop'
if (Test-Path -LiteralPath $dist) { throw "Move or remove the previous staging folder before building: $dist" }
$ElectronDir = (Resolve-Path -LiteralPath $ElectronDir).Path
$OcrDir = (Resolve-Path -LiteralPath $OcrDir).Path
$Zig = (Resolve-Path -LiteralPath $Zig).Path
foreach ($required in @((Join-Path $ElectronDir 'electron.exe'), (Join-Path $OcrDir 'python.exe'), (Join-Path $OcrDir 'manifest.json'))) {
  if (!(Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing runtime file: $required" }
}
if ([bool]$VlcHeaders -ne [bool]$VlcCore) { throw 'Pass both VLC headers and the matching x86 libvlccore.dll, or omit both.' }
New-Item -ItemType Directory -Path $dist | Out-Null
$env:ZIG_GLOBAL_CACHE_DIR = Join-Path $repo 'dist/zig-cache'
$env:ZIG_LOCAL_CACHE_DIR = Join-Path $repo 'dist/zig-local-cache'
& (Join-Path $source 'build.ps1')
& (Join-Path $source 'build-ocr.ps1')
& (Join-Path $source 'build-modern.ps1') -Compiler $Zig
if ($VlcHeaders) {
  & $Zig cc -target x86-windows-gnu -std=c11 -O2 -shared '-DMODULE_STRING="yomidesktop"' -D__PLUGIN__ -I $VlcHeaders (Join-Path $source 'vlc-plugin/yomidesktop.c') $VlcCore -lws2_32 -o (Join-Path $source 'vlc-plugin/libyomidesktop_plugin.dll')
  if ($LASTEXITCODE -ne 0) { throw 'VLC module compilation failed.' }
}

Get-ChildItem -LiteralPath $ElectronDir | ForEach-Object {
  $name = switch ($_.Name) {
    'electron.exe' { 'YomiDesktopRuntime.exe' }
    'LICENSE' { 'LICENSE-Electron.txt' }
    default { $_.Name }
  }
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dist $name) -Recurse
}
Copy-Item -LiteralPath $OcrDir -Destination (Join-Path $dist 'ocr-runtime') -Recurse
Copy-Item -LiteralPath $source -Destination (Join-Path $dist 'resources/app') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'LICENSE'), (Join-Path $repo 'THIRD-PARTY-NOTICES.md') -Destination $dist
Copy-Item -LiteralPath (Join-Path $repo 'PORTABLE.md') -Destination (Join-Path $dist 'START-HERE.md')
$csc = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $csc /nologo /target:winexe /r:System.Windows.Forms.dll ("/win32manifest:"+(Join-Path $source 'native/app.manifest')) ("/win32icon:"+(Join-Path $source 'native/app.ico')) ("/out:"+(Join-Path $dist 'YomiDesktop.exe')) (Join-Path $source 'native/Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
Write-Output $dist
