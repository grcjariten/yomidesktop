# Prepares the two files of a GitHub release, without any personal data:
#   YomiDesktop-Windows-x64.zip  (the program)      YomiDesktop-Setup.exe  (the installer)
# Usage: build-release.ps1 -Out <empty folder>
param([Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
$source = Split-Path $PSScriptRoot -Parent
$root = Split-Path $source -Parent
$stage = Join-Path $Out 'YomiDesktop'
New-Item -ItemType Directory -Force $Out | Out-Null
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }

# Program files only: never the personal folders.
robocopy $root $stage /E /NFL /NDL /NJH /NJS /NP /XD (Join-Path $root 'data') (Join-Path $root 'anki') (Join-Path $root 'archivio') (Join-Path $root 'verifica') $source (Join-Path $root '.git') __pycache__ /XF .gitignore VERIFICA.md LEGGIMI.md *.pdb *.lib *.log | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'Copia del programma non riuscita' }
# The program code is always the current source.
robocopy $source (Join-Path $stage 'resources\app') /MIR /NFL /NDL /NJH /NJS /NP /XD installer /XF *.pdb *.lib | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'Copia del codice non riuscita' }
foreach ($personal in 'data', 'anki') { if (Test-Path (Join-Path $stage $personal)) { throw "Cartella personale nel pacchetto: $personal" } }

@'
YomiDesktop

1. Tieni la cartella intera. Apri YomiDesktop.exe.
2. Si apre la configurazione guidata: tasto, dizionari, Anki.
3. Punta una parola giapponese in qualsiasi programma e premi il tasto scelto.

---

1. Keep the whole folder. Open YomiDesktop.exe.
2. The guided setup opens: key, dictionaries, Anki.
3. Point at any Japanese word in any app and press your key.
'@ | Set-Content -Encoding utf8 (Join-Path $stage 'INIZIA-QUI.txt')

$zip = Join-Path $Out 'YomiDesktop-Windows-x64.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Push-Location $Out
try { & "$env:WINDIR\System32\tar.exe" -a -c -f $zip YomiDesktop; if ($LASTEXITCODE -ne 0) { throw 'Creazione ZIP non riuscita' } } finally { Pop-Location }

& (Join-Path $PSScriptRoot 'build-setup.ps1') | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'YomiDesktop-Setup.exe') (Join-Path $Out 'YomiDesktop-Setup.exe') -Force
Get-ChildItem $Out -File | Select-Object Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }
