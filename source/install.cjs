// SPDX-License-Identifier: GPL-3.0-or-later
// Self-install from the extracted ZIP: copies the program folder to the usual place for the current user
// (no administrator rights, nothing downloaded), creates the shortcuts and the "Apps" entry, and keeps the user's data.
'use strict';
// original-fs: Electron's normal fs treats .asar files as folders, which breaks a plain copy.
const fs=(()=>{try{return require('original-fs');}catch{return require('node:fs');}})();const fsp=fs.promises;const path=require('node:path');const {execFile}=require('node:child_process');

const testRoot=process.env.YOMIDESKTOP_INSTALL_TEST||'';
const uninstallKey='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+(testRoot?'YomiDesktop-InstallTest':'YomiDesktop');
const run=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true},(e,stdout)=>e?reject(e):resolve(stdout)));
const same=(a,b)=>path.resolve(a).replace(/\\+$/,'').toLowerCase()===path.resolve(b).replace(/\\+$/,'').toLowerCase();

async function target(){
  if(testRoot)return path.join(testRoot,'app');
  // An earlier install (also made by the old installer) is updated in place.
  try{const m=/InstallLocation\s+REG_SZ\s+(.+)/.exec(await run('reg',['query',uninstallKey,'/v','InstallLocation']));if(m&&m[1].trim())return m[1].trim();}catch{}
  return path.join(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData','Local'),'Programs','YomiDesktop');
}
function links(){
  if(testRoot)return {menu:path.join(testRoot,'links'),desktop:path.join(testRoot,'links')};
  return {menu:path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs'),desktop:null};
}
async function files(dir,skip,out=[]){
  for(const entry of await fsp.readdir(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);if(skip.some(s=>same(s,full)))continue;
    if(entry.isDirectory())await files(full,skip,out);else if(entry.isFile())out.push(full);
  }
  return out;
}
// Closes a copy of YomiDesktop that is running from the destination folder (never this one).
async function stopRunning(folder){
  const prefix=path.resolve(folder).replace(/\\+$/,'')+'\\';
  const script=`$p='${prefix.replace(/'/g,"''")}';Get-Process | Where-Object { $_.Id -ne ${process.pid} -and $_.Path -and $_.Path.StartsWith($p,[StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue`;
  try{await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script]);}catch{}
  await new Promise(r=>setTimeout(r,800));
}

async function install({root,shell,desktopPath,version,desktop,language,onProgress=()=>{}}){
  const folder=await target();
  if(same(folder,root))throw new Error('already installed here');
  const list=await files(root,[path.join(root,'data')]);
  await stopRunning(folder);
  let bytes=0,last=-1;
  for(const [i,file] of list.entries()){
    const to=path.join(folder,path.relative(root,file));
    await fsp.mkdir(path.dirname(to),{recursive:true});
    await fsp.copyFile(file,to);bytes+=(await fsp.stat(file)).size;
    const pct=Math.floor((i+1)*100/list.length);if(pct!==last){last=pct;onProgress(pct);}
  }
  // The user's data stays where it is; a first install only takes the chosen language along.
  const prefs=path.join(folder,'data','preferences.json');
  if(!fs.existsSync(prefs)){await fsp.mkdir(path.dirname(prefs),{recursive:true});await fsp.writeFile(prefs,JSON.stringify({language},null,2));}
  const exe=path.join(folder,'YomiDesktop.exe'),uninstaller=path.join(folder,'Uninstall.exe'),where=links();
  await fsp.mkdir(where.menu,{recursive:true});
  const link=(file,targetFile)=>{if(!shell.writeShortcutLink(file,'create',{target:targetFile,cwd:folder,icon:targetFile,iconIndex:0}))throw new Error('shortcut not created');};
  link(path.join(where.menu,'YomiDesktop.lnk'),exe);
  if(fs.existsSync(uninstaller))link(path.join(where.menu,'Uninstall YomiDesktop.lnk'),uninstaller);
  if(desktop)link(path.join(where.desktop||desktopPath,'YomiDesktop.lnk'),exe);
  const values=[['DisplayName','REG_SZ','YomiDesktop'],['DisplayVersion','REG_SZ',version],['Publisher','REG_SZ','YomiDesktop'],['InstallLocation','REG_SZ',folder],['DisplayIcon','REG_SZ',exe],
    ['UninstallString','REG_SZ',`"${uninstaller}" /uninstall "${folder}"`],['URLInfoAbout','REG_SZ','https://github.com/grcjariten/yomidesktop'],
    ['NoModify','REG_DWORD','1'],['NoRepair','REG_DWORD','1'],['EstimatedSize','REG_DWORD',String(Math.round(bytes/1024))]];
  for(const [name,type,value] of values)await run('reg',['add',uninstallKey,'/v',name,'/t',type,'/d',value,'/f']);
  return {folder,runtime:path.join(folder,'YomiDesktopRuntime.exe')};
}

module.exports={target,install,same,uninstallKey};
