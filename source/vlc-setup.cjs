// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Connects YomiDesktop's subtitle module to the VLC found on this PC, 32 or 64 bit,
// without administrator rights: the module folder goes in the user's VLC_PLUGIN_PATH
// and VLC's settings file (vlcrc) turns the module on. The original vlcrc is backed up once.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {execFileSync,spawn}=require('node:child_process');
const moduleName='libyomidesktop_plugin.dll';

// 'x64' or 'x86' from the Windows executable header, null if unknown.
function exeArch(file){
  try{
    const fd=fs.openSync(file,'r');const head=Buffer.alloc(4096);fs.readSync(fd,head,0,4096,0);fs.closeSync(fd);
    const pe=head.readUInt32LE(0x3c);if(pe+6>head.length||head.toString('latin1',pe,pe+4)!=='PE\0\0')return null;
    const machine=head.readUInt16LE(pe+4);return machine===0x8664?'x64':machine===0x14c?'x86':null;
  }catch{return null;}
}
const sameFile=(a,b)=>{try{const h=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');return h(a)===h(b);}catch{return false;}};

// Folders of earlier YomiDesktop modules (any version or location) are replaced by the current one.
function isYomiFolder(entry){
  if(!entry)return false;
  if(fs.existsSync(path.join(entry,moduleName)))return true;
  return /[\\/]vlc-plugin([\\/](x86|x64))?[\\/]?$/i.test(entry)&&/yomi/i.test(entry);
}
function pluginPath(entries,folder){return [...entries.filter(p=>p&&!isYomiFolder(p)&&path.resolve(p)!==path.resolve(folder)),folder];}

function readUserVariable(name){
  try{const out=execFileSync('reg',['query','HKCU\\Environment','/v',name],{encoding:'utf8',windowsHide:true});const m=out.match(new RegExp(name+'\\s+REG_\\w+\\s+(.*)'));return m?m[1].trim():'';}catch{return '';}
}
// reg writes the value at once; setx (in the background, never awaited: it waits for every window,
// ours included, to acknowledge) tells Windows and Explorer, so VLC opened afterwards sees it.
function writeUserVariable(name,value){
  execFileSync('reg',['add','HKCU\\Environment','/v',name,'/t','REG_EXPAND_SZ','/d',value,'/f'],{windowsHide:true,stdio:'ignore'});
  try{spawn('setx',[name,value],{windowsHide:true,stdio:'ignore',detached:true}).on('error',()=>{}).unref();}catch{}
}

// Adds yomidesktop to the active sub-filter line and sets the token; keeps everything else.
function updateVlcrc(text,token){
  const lines=text.split(/\r?\n/);let filters=[];
  for(const line of lines){const m=line.match(/^sub-filter=(.*)$/);if(m)filters=m[1].split(':').filter(f=>f&&f!=='yomidesktop');}
  const kept=lines.filter(l=>!/^sub-filter=/.test(l)&&!/^yomidesktop-token=/.test(l)&&l!=='# YomiDesktop: lettura diretta dei sottotitoli'&&l!=='# YomiDesktop: direct subtitle text');
  while(kept.length&&kept[kept.length-1].trim()==='')kept.pop();
  return [...kept,'','# YomiDesktop: direct subtitle text','sub-filter='+[...filters,'yomidesktop'].join(':'),'yomidesktop-token='+token,''].join('\r\n');
}

function ensureVlcIntegration({executable,source,data,token,appData=process.env.APPDATA,env=process.env.VLC_PLUGIN_PATH}){
  const arch=exeArch(executable);if(!arch)return {ok:false,reason:'unknown-vlc'};
  const folder=path.join(source,'vlc-plugin',arch),plugin=path.join(folder,moduleName);
  if(!fs.existsSync(plugin))return {ok:false,reason:'missing-module',arch};
  // A matching copy inside VLC's own plugins folder is used as is.
  const builtIn=path.join(path.dirname(executable),'plugins','spu',moduleName);
  const inVlc=fs.existsSync(builtIn)&&sameFile(builtIn,plugin);
  let changedPath=false;
  if(!inVlc){
    const current=readUserVariable('VLC_PLUGIN_PATH');const entries=current.split(';').filter(Boolean);
    const next=pluginPath(entries,folder).join(';');
    if(next!==entries.join(';')){
      const backup=path.join(data,'installation-backup','environment.json');
      if(!fs.existsSync(backup)){fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,JSON.stringify({VLC_PLUGIN_PATH:current||null},null,2));}
      writeUserVariable('VLC_PLUGIN_PATH',next);changedPath=true;
    }
  }
  const config=path.join(appData,'vlc','vlcrc');
  const before=fs.existsSync(config)?fs.readFileSync(config,'utf8'):'';
  const after=updateVlcrc(before,token);
  if(after!==before){
    const backup=path.join(data,'installation-backup','vlcrc.original');
    if(before&&!fs.existsSync(backup)){fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,before);}
    fs.mkdirSync(path.dirname(config),{recursive:true});fs.writeFileSync(config,after);
  }
  fs.writeFileSync(path.join(data,'installation.json'),JSON.stringify({mode:inVlc?'programFiles':'userEnvironment',arch,plugin:inVlc?builtIn:plugin,config,date:new Date().toISOString()},null,2));
  // VLC windows already open, or started from a shell that has the old variable, need a restart.
  const pathReady=inVlc||String(env||'').split(';').some(p=>p&&path.resolve(p)===path.resolve(folder));
  return {ok:true,arch,folder,inVlc,changedPath,restartVlc:!pathReady||after!==before};
}
module.exports={ensureVlcIntegration,exeArch,updateVlcrc,pluginPath,isYomiFolder};
