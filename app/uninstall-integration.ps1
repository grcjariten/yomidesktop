# Removes only the integration created by install.ps1. Does not delete dictionaries or Anki cards.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$manifestFile=Join-Path $root 'data/installation.json'
if(!(Test-Path -LiteralPath $manifestFile)){throw 'Installazione non registrata'}
$installed=Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$expectedPlugin='C:\Program Files (x86)\VideoLAN\VLC\plugins\spu\libyomidesktop_plugin.dll'
if($installed.mode -eq 'userEnvironment'){
  $expectedLocal=Join-Path $PSScriptRoot 'vlc-plugin/libyomidesktop_plugin.dll'
  if([IO.Path]::GetFullPath($installed.plugin) -ne [IO.Path]::GetFullPath($expectedLocal)){throw 'Percorso del modulo utente inatteso'}
  $pluginDir=Split-Path $expectedLocal -Parent
  $current=[Environment]::GetEnvironmentVariable('VLC_PLUGIN_PATH','User')
  $remaining=@($current -split ';' | Where-Object {$_ -and $_ -ne $pluginDir})
  [Environment]::SetEnvironmentVariable('VLC_PLUGIN_PATH',$(if($remaining.Count){$remaining -join ';'}else{$null}),'User')
}elseif([IO.Path]::GetFullPath($installed.plugin) -ne $expectedPlugin){throw 'Percorso del modulo inatteso'}
elseif(Test-Path -LiteralPath $expectedPlugin){
  if((Get-FileHash -LiteralPath $expectedPlugin -Algorithm SHA256).Hash -ne $installed.sha256){throw 'Il modulo è cambiato: rimozione automatica interrotta'}
  $old=Join-Path $root 'data/installation-backup/libyomidesktop_plugin.dll.original'
  if(Test-Path -LiteralPath $old){Copy-Item -LiteralPath $old -Destination $expectedPlugin -Force}else{Remove-Item -LiteralPath $expectedPlugin}
}
$config=Join-Path $env:APPDATA 'vlc/vlcrc'
$text=[IO.File]::ReadAllText($config)
$text=[regex]::Replace($text,'(?m)^sub-filter=([^\r\n]*)',{param($m) 'sub-filter='+(($m.Groups[1].Value.Split(':')|Where-Object {$_ -and $_ -ne 'yomidesktop'}) -join ':')})
$text=[regex]::Replace($text,'(?m)^yomidesktop-token=[^\r\n]*\r?\n?','')
[IO.File]::WriteAllText($config,$text,[Text.UTF8Encoding]::new($false))
$shortcut=Join-Path ([Environment]::GetFolderPath('Desktop')) 'YomiDesktop.lnk'
if(Test-Path -LiteralPath $shortcut){$shell=New-Object -ComObject WScript.Shell;$link=$shell.CreateShortcut($shortcut);if($link.TargetPath -eq (Join-Path $root 'YomiDesktop.exe')){Remove-Item -LiteralPath $shortcut}}
Write-Output 'Integrazione VLC rimossa. Dizionari, programma e carte Anki conservati.'
