# Installs only YomiDesktop's VLC module and a desktop shortcut. Existing settings are backed up.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$data=Join-Path $root 'data'
$vlcRoot='C:\Program Files (x86)\VideoLAN\VLC'
if(!(Test-Path -LiteralPath (Join-Path $vlcRoot 'vlc.exe'))){throw 'VLC x86 non trovato: questa build del modulo richiede VLC 3.0.x a 32 bit.'}
$tokenFile=Join-Path $data 'vlc-token'
if(!(Test-Path -LiteralPath $tokenFile)){throw "Il programma deve essere verificato prima dell'installazione."}
$token=(Get-Content -LiteralPath $tokenFile -Raw).Trim()
if($token -notmatch '^[a-f0-9]{64}$'){throw 'Token locale non valido'}
$backup=Join-Path $data 'installation-backup'
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$config=Join-Path $env:APPDATA 'vlc/vlcrc'
if(!(Test-Path -LiteralPath (Join-Path $backup 'vlcrc.original'))){Copy-Item -LiteralPath $config -Destination (Join-Path $backup 'vlcrc.original')}
$target=Join-Path $vlcRoot 'plugins/spu/libyomidesktop_plugin.dll'
$source=Join-Path $PSScriptRoot 'vlc-plugin/libyomidesktop_plugin.dll'
$mode='programFiles'
if((Test-Path -LiteralPath $target) -and !(Test-Path -LiteralPath (Join-Path $backup 'libyomidesktop_plugin.dll.original'))){Copy-Item -LiteralPath $target -Destination (Join-Path $backup 'libyomidesktop_plugin.dll.original')}
try { Copy-Item -LiteralPath $source -Destination $target -Force }
catch [System.UnauthorizedAccessException] {
  # Per-user installation avoids requiring administrator access to Program Files.
  $mode='userEnvironment'
  $environmentBackup=Join-Path $backup 'environment.json'
  if(!(Test-Path -LiteralPath $environmentBackup)){@{VLC_PLUGIN_PATH=[Environment]::GetEnvironmentVariable('VLC_PLUGIN_PATH','User')}|ConvertTo-Json|Set-Content -LiteralPath $environmentBackup -Encoding utf8}
  $current=[Environment]::GetEnvironmentVariable('VLC_PLUGIN_PATH','User')
  $pluginDir=Split-Path $source -Parent
  $paths=@($current -split ';'|Where-Object {$_ -and $_ -ne $pluginDir})+$pluginDir
  [Environment]::SetEnvironmentVariable('VLC_PLUGIN_PATH',($paths -join ';'),'User')
  $target=$source
  Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class YomiEnvironmentNotify{[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint msg,UIntPtr wParam,string lParam,uint flags,uint timeout,out UIntPtr result);}'
  $notificationResult=[UIntPtr]::Zero
  [void][YomiEnvironmentNotify]::SendMessageTimeout([IntPtr]0xffff,0x1a,[UIntPtr]::Zero,'Environment',2,3000,[ref]$notificationResult)
}
$text=[IO.File]::ReadAllText($config)
$filters=@()
$active=[regex]::Matches($text,'(?m)^sub-filter=([^\r\n]*)')
if($active.Count){$filters=@($active[$active.Count-1].Groups[1].Value.Split(':') | Where-Object {$_ -and $_ -ne 'yomidesktop'})}
$filters+= 'yomidesktop'
$text=[regex]::Replace($text,'(?m)^sub-filter=[^\r\n]*\r?\n?','')
$text=[regex]::Replace($text,'(?m)^yomidesktop-token=[^\r\n]*\r?\n?','')
$text=$text.TrimEnd()+"`r`n`r`n# YomiDesktop: lettura diretta dei sottotitoli`r`nsub-filter="+($filters -join ':')+"`r`nyomidesktop-token="+$token+"`r`n"
[IO.File]::WriteAllText($config,$text,[Text.UTF8Encoding]::new($false))
$desktop=[Environment]::GetFolderPath('Desktop')
$shortcut=Join-Path $desktop 'YomiDesktop.lnk'
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut($shortcut)
$link.TargetPath=Join-Path $root 'YomiDesktop.exe'
$link.WorkingDirectory=$root
$link.Description='Shift sul testo per consultare i tuoi dizionari Yomitan'
$link.IconLocation=(Join-Path $root 'YomiDesktop.exe')+',0'
$link.Save()
@{date=(Get-Date).ToString('o');mode=$mode;plugin=$target;config=$config;shortcut=$shortcut;sha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $data 'installation.json') -Encoding utf8
Write-Output 'Modulo VLC installato. Collegamento YomiDesktop creato sul desktop.'
