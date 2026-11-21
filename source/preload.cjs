'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktopHost',{
  command:(name,payload)=>ipcRenderer.invoke('desktop:command',name,payload),
  closePopup:()=>ipcRenderer.send('desktop:close-popup'),
  raiseAnki:()=>ipcRenderer.send('desktop:raise-anki'),
  log:(event,details)=>ipcRenderer.send('desktop:popup-log',String(event).slice(0,40),String(details).slice(0,600)),
  onLookup:(cb)=>{const fn=(_event,p)=>cb(p);ipcRenderer.on('desktop:lookup',fn);return ()=>ipcRenderer.removeListener('desktop:lookup',fn);},
  onStatus:(cb)=>{const fn=(_event,p)=>cb(p);ipcRenderer.on('desktop:status',fn);return ()=>ipcRenderer.removeListener('desktop:status',fn);},
  onSubtitle:(cb)=>{const fn=(_event,p)=>cb(p);ipcRenderer.on('desktop:subtitle',fn);return ()=>ipcRenderer.removeListener('desktop:subtitle',fn);},
  subtitleHit:(payload)=>ipcRenderer.send('desktop:subtitle-hit',payload),
  ready:()=>ipcRenderer.send('desktop:renderer-ready'),
});
