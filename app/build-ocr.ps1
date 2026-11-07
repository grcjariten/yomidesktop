$ErrorActionPreference='Stop'
$framework=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$references=@('/r:System.Drawing.dll','/r:System.Web.Extensions.dll')
& (Join-Path $framework 'csc.exe') /nologo /optimize+ /target:exe /platform:x64 ("/win32manifest:"+(Join-Path $PSScriptRoot 'native/app.manifest')) ("/out:"+(Join-Path $PSScriptRoot 'native/ScreenOcr.exe')) @references (Join-Path $PSScriptRoot 'native/OcrLayout.cs') (Join-Path $PSScriptRoot 'native/NeuralOcrReader.cs') (Join-Path $PSScriptRoot 'native/ScreenOcr.cs')
if($LASTEXITCODE -ne 0){throw 'Compilazione OCR non riuscita'}
