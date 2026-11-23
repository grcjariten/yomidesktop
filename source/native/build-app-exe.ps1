# Makes YomiDesktop.exe (the program itself) from the stock electron.exe of the verified Electron archive
# (see runtime-integrity.json): same file, with our icon and name. No launcher in between.
# Usage: build-app-exe.ps1 -Electron <electron.exe> -Out <YomiDesktop.exe>
param([Parameter(Mandatory = $true)][string]$Electron, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
$source = Split-Path $PSScriptRoot -Parent
$framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$tool = Join-Path $env:TEMP 'YomiDesktop-Brand.exe'
& (Join-Path $framework 'csc.exe') /nologo /optimize+ /target:exe /platform:x64 ("/out:" + $tool) (Join-Path $PSScriptRoot 'Brand.cs')
if ($LASTEXITCODE -ne 0) { throw 'Brand build failed' }
$version = (Get-Content -Raw (Join-Path $source 'package.json') | ConvertFrom-Json).version
& $tool $Electron (Join-Path $PSScriptRoot 'app.ico') $Out $version
if ($LASTEXITCODE -ne 0) { throw 'Brand failed' }
Remove-Item $tool -Force
