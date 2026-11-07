param([string]$Compiler='zig')
$ErrorActionPreference='Stop'
& $Compiler c++ -target x86_64-windows-gnu -O2 -std=c++17 (Join-Path $PSScriptRoot 'native/ModernTextReader.cpp') -lole32 -loleaut32 -luuid -luser32 -o (Join-Path $PSScriptRoot 'native/TextProbeModern.exe')
if($LASTEXITCODE -ne 0){throw 'Compilazione lettore UIA3 non riuscita'}
