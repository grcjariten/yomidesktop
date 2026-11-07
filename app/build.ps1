$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$framework=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
& (Join-Path $framework 'csc.exe') /nologo /optimize+ /target:exe /platform:anycpu ("/win32manifest:"+(Join-Path $root 'native/app.manifest')) ("/out:"+(Join-Path $root 'native/TextProbe.exe')) /r:System.Web.Extensions.dll /r:Accessibility.dll ("/r:"+(Join-Path $framework 'WPF/WindowsBase.dll')) ("/r:"+(Join-Path $framework 'WPF/UIAutomationClient.dll')) ("/r:"+(Join-Path $framework 'WPF/UIAutomationTypes.dll')) (Join-Path $root 'native/TextProbe.cs') (Join-Path $root 'native/AccessibleTextReader.cs') (Join-Path $root 'native/ModernTextReader.cs') (Join-Path $root 'native/OcrLayout.cs') (Join-Path $root 'native/OcrReader.cs')
if($LASTEXITCODE -ne 0){throw 'Compilazione TextProbe non riuscita'}
