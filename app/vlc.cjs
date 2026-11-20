// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const dgram=require('node:dgram');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawn}=require('node:child_process');
const vlcCandidates=[path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','VideoLAN/VLC/vlc.exe'),path.join(process.env.ProgramFiles||'C:/Program Files','VideoLAN/VLC/vlc.exe')];
class VlcBridge{
  showOverlay(pid){const w=this.overlays.get(pid);if(!w||w.isDestroyed())return;if(!w.isVisible())w.showInactive();const owner=this.owners.get(pid);if(owner)try{w.moveAbove('window:'+owner+':0');}catch{}}
  constructor(host){Object.assign(this,host);this.targets=[];this.overlays=new Map();this.owners=new Map();this.loading=new Map();this.ended=new Set();this.events=new Map();this.serial=0;this.running=true;this.connected=false;this.tokenFile=path.join(this.data,'vlc-token');this.token=fs.existsSync(this.tokenFile)?fs.readFileSync(this.tokenFile,'utf8').trim():crypto.randomBytes(32).toString('hex');fs.writeFileSync(this.tokenFile,this.token);}
  async start(){
    this.executable=vlcCandidates.find(p=>fs.existsSync(p));
    this.pluginDir=path.join(this.source,'vlc-plugin');
    try{const installation=JSON.parse(fs.readFileSync(path.join(this.data,'installation.json'),'utf8').replace(/^\uFEFF/,''));if(installation.mode==='userEnvironment'&&fs.existsSync(installation.plugin))this.pluginDir=path.dirname(installation.plugin);}catch{}
    const local=path.join(this.source,'vlc-plugin','libyomidesktop_plugin.dll');
    this.direct=Boolean(this.executable===vlcCandidates[0]&&fs.existsSync(local));
    this.setStatus({vlcAvailable:Boolean(this.executable),vlc:this.executable?'VLC found. Visible subtitles can be read with OCR.':'VLC was not found.'});
    if(!this.direct)return;
    if(this.executable){const installed=path.join(path.dirname(this.executable),'plugins','spu','libyomidesktop_plugin.dll');this.installed=fs.existsSync(installed)&&crypto.createHash('sha256').update(fs.readFileSync(installed)).digest('hex')===crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex');}
    this.socket=dgram.createSocket('udp4');this.socket.on('message',(raw,remote)=>this.message(raw,remote).catch(e=>{if(this.running)this.setStatus({vlc:'Reopen the VLC connection: '+e.message});}));
    this.socket.on('error',e=>this.setStatus({vlc:'VLC bridge unavailable: '+e.message}));
    await new Promise((resolve,reject)=>{this.socket.once('error',reject);this.socket.bind(19634,'127.0.0.1',()=>{this.socket.removeListener('error',reject);resolve();});});
    this.setStatus({vlc:'VLC x86 ready for direct subtitle lookup.'});
  }
  windows(targets){
    this.targets=targets;
    const ids=new Set(targets.map(t=>t.pid));
    for(const [pid,w] of this.overlays)if(!ids.has(pid)){if(!w.isDestroyed())w.destroy();this.overlays.delete(pid);this.events.delete(pid);this.owners.delete(pid);}
    for(const target of targets){const w=this.overlays.get(target.pid);if(w&&!w.isDestroyed()){
      const bounds=this.screen.screenToDipRect(null,{x:target.x,y:target.y,width:target.width,height:target.height});if(JSON.stringify(w.getBounds())!==JSON.stringify(bounds))w.setBounds(bounds);
      if(this.owners.has(target.pid)&&this.owners.get(target.pid)!==target.hwnd){this.owners.delete(target.pid);this.attachOwner?.(w,target).then(ok=>{if(ok)this.owners.set(target.pid,target.hwnd);}).catch(()=>{});}
      if(this.owners.has(target.pid)){if(this.events.get(target.pid)?.size)this.showOverlay(target.pid);}
      else if(!target.foreground&&!this.heldPid)w.hide();else if(this.events.get(target.pid)?.size)this.showOverlay(target.pid);
    }}
  }
  async overlay(target){
    if(this.loading.has(target.pid))return this.loading.get(target.pid);
    if(this.overlays.has(target.pid))return this.overlays.get(target.pid);
    const bounds=this.screen.screenToDipRect(null,{x:target.x,y:target.y,width:target.width,height:target.height});
    const w=this.createWindow({...bounds,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,alwaysOnTop:false,skipTaskbar:true,focusable:false,resizable:false});
    w.setIgnoreMouseEvents(true,{forward:true});
    this.overlays.set(target.pid,w);const loading=w.loadFile(path.join(this.source,'ui','subtitles.html')).then(async()=>{if(this.attachOwner&&await this.attachOwner(w,target))this.owners.set(target.pid,target.hwnd);else w.setAlwaysOnTop(true);this.loading.delete(target.pid);return w;});this.loading.set(target.pid,loading);return loading;
  }
  async message(raw,remote){
    if(!this.running)return;
    if(remote.address!=='127.0.0.1'||raw.length>61000)return;
    let packet;try{packet=JSON.parse(raw);}catch{return;}
    if(packet.protocol!==1||packet.token!==this.token||!Number.isInteger(packet.pid)||!Number.isSafeInteger(packet.id))return;
    const target=this.targets.find(t=>t.pid===packet.pid&&t.video);
    if(!target)return;
    if(!this.events.has(packet.pid))this.events.set(packet.pid,new Map());const entries=this.events.get(packet.pid);
    const key=remote.port+':'+packet.id;
    if(packet.clear){this.ended.add(key);if(this.ended.size>256)this.ended.delete(this.ended.values().next().value);entries.delete(key);this.updateOverlay(packet.pid);return;}
    if(!Array.isArray(packet.regions)||!packet.regions.length||!Number.isFinite(packet.width)||packet.width<=0||!Number.isFinite(packet.height)||packet.height<=0)return;
    // Acknowledge only after the transparent text surface has actually loaded.
    const w=await this.overlay(target);if(!this.running||w.isDestroyed()||this.ended.has(key))return;
    if(!this.owners.has(target.pid)&&!target.foreground&&this.heldPid!==target.pid)return;
    this.socket.send(Buffer.from('ack:'+this.token),remote.port,'127.0.0.1');
    if(!packet.suppressed)return;
    delete packet.token;entries.set(key,{...packet,title:target.title});this.updateOverlay(packet.pid);
    if(this.owners.has(target.pid)||target.foreground||this.heldPid===packet.pid)this.showOverlay(target.pid);
    if(!this.connected){this.connected=true;this.setStatus({vlc:'VLC connected. Look up a word in the current subtitle.'});}
  }
  updateOverlay(pid){const w=this.overlays.get(pid);if(!w||w.isDestroyed())return;const packets=Array.from(this.events.get(pid)?.values()||[]);w.webContents.send('desktop:subtitle',packets);if(!packets.length)w.hide();}
  async cursor(point){
    const dip=this.screen.screenToDipPoint({x:point.x,y:point.y});
    for(const [pid,w] of this.overlays){if(w.isDestroyed()||!w.isVisible())continue;const b=w.getBounds();if(dip.x<b.x||dip.y<b.y||dip.x>=b.x+b.width||dip.y>=b.y+b.height)continue;
      if(point.pid!==undefined&&point.pid!==pid&&point.pid!==process.pid)continue;
      const serial=++this.serial;const result=await w.webContents.executeJavaScript(`window.subtitleHitTest(${dip.x-b.x},${dip.y-b.y})`).catch(()=>null);if(serial!==this.serial)return;if(!result)return false;
      result.x=point.x;result.y=point.y;result.source='VLC';result.pid=pid;result.hwnd=this.targets.find(t=>t.pid===pid)?.hwnd;result.title=this.targets.find(t=>t.pid===pid)?.title||'VLC';result.url='vlc://subtitle';
      const r=result.rect;const physical=this.screen.dipToScreenRect(null,{x:Math.round(b.x+r.x),y:Math.round(b.y+r.y),width:Math.round(r.width),height:Math.round(r.height)});result.rect=physical;
      if(point.gesture!==undefined)result.nativeGesture=point.gesture;if(point.sequence!==undefined)result.nativeSequence=point.sequence;
      this.lookup(result);return true;
    }return false;
  }
  owns(sender){return [...this.overlays.values()].some(w=>w.webContents===sender);}
  hold(source){if(source.source==='VLC')this.heldPid=source.pid;}
  release(){this.heldPid=null;this.serial++;}
  async openVideo(){
    if(!this.executable)throw new Error('Install VLC to open videos.');
    const pick=await this.dialog.showOpenDialog({title:'Open video in VLC',properties:['openFile'],filters:[{name:'Video',extensions:['mkv','mp4','avi','webm','m4v','mov','ts','m2ts']},{name:'All files',extensions:['*']}]});
    if(pick.canceled)return false;this.launch(pick.filePaths[0]);return true;
  }
  launch(file,options={}){
    const env={...process.env};if(this.direct&&!this.installed)env.VLC_PLUGIN_PATH=[this.pluginDir,...(env.VLC_PLUGIN_PATH||'').split(path.delimiter).filter(p=>p&&p!==this.pluginDir&&!p.startsWith(this.root+path.sep))].join(path.delimiter);
    const extra=options.subtitle?['--no-sub-autodetect-file','--sub-file='+options.subtitle]:[];
    const bridgeArgs=this.direct?['--sub-filter=yomidesktop','--yomidesktop-token='+this.token]:[];
    const child=spawn(this.executable,['--no-one-instance',...bridgeArgs,...extra,file],{windowsHide:false,detached:true,stdio:'ignore',env});child.on('error',e=>this.setStatus({vlc:'VLC failed to start: '+e.message}));child.unref();return child;
  }
  close(){this.running=false;for(const w of this.overlays.values())if(!w.isDestroyed())w.destroy();this.overlays.clear();try{this.socket.close();}catch{}}
}
module.exports={VlcBridge,vlcCandidates};
