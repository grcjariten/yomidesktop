const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');const execute=promisify(execFile);
const {BrowserWindow,screen}=require('electron');const {VlcBridge}=require('../vlc.cjs');
exports.run=async({root,data,popup,subtitle})=>{
  const source=path.resolve(__dirname,'..');const fixture=process.env.YOMIDESKTOP_VIDEO_FIXTURE;if(!fixture)return {skipped:true};
  let captured,pending;const vlc=new VlcBridge({root,data,source,screen,setStatus:()=>{},hidePopup:()=>{},attachOwner:async(w,target)=>{const hwnd=Number(w.getNativeWindowHandle().readBigUInt64LE(0));const {stdout}=await execute(path.join(source,'native','TextProbe.exe'),['--attach-owner',String(hwnd),String(target.hwnd),String(process.pid)],{windowsHide:true,encoding:'utf8'});return JSON.parse(stdout.replace(/^\uFEFF/,'')).ok;},createWindow:opts=>new BrowserWindow({show:false,...opts,webPreferences:{preload:path.join(source,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}}),lookup:payload=>{captured=payload;pending=popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify(payload)})`);}});
  let child,timer;
  try{
    await vlc.start();child=vlc.launch(fixture,{subtitle});
    const update=async()=>{const {stdout}=await execute(path.join(source,'native','TextProbe.exe'),['--windows'],{windowsHide:true,encoding:'utf8',timeout:4000});const metadata=JSON.parse(stdout.replace(/^\uFEFF/,''));fs.writeFileSync(path.join(data,'live-vlc-windows.json'),JSON.stringify({pid:child.pid,windows:metadata.windows},null,2));vlc.windows(metadata.windows.filter(w=>w.pid===child.pid).map(w=>({...w,foreground:true})));};
    await update();timer=setInterval(()=>update().catch(()=>{}),250);
    const deadline=Date.now()+15000;let overlay;
    while(Date.now()<deadline){overlay=vlc.overlays.get(child.pid);if(overlay&&!overlay.isDestroyed()&&await overlay.webContents.executeJavaScript('Boolean(document.querySelector(".subtitle span"))').catch(()=>false))break;await new Promise(r=>setTimeout(r,100));}
    assert(overlay&&!overlay.isDestroyed(),'VLC live overlay');
    assert(vlc.owners.has(child.pid),'VLC owns the transparent subtitle surface');
    fs.writeFileSync(path.join(data,'live-vlc-events.json'),JSON.stringify(Array.from(vlc.events.get(child.pid)?.values()||[]),null,2));
    fs.writeFileSync(path.join(data,'live-vlc-dom.json'),JSON.stringify(await overlay.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight,html:document.getElementById('subtitles').innerHTML})`),null,2));
    const bounds=overlay.getBounds();const p=await overlay.webContents.executeJavaScript(`(()=>{const n=document.querySelector('.subtitle span').firstChild;const r=document.createRange();r.setStart(n,3);r.setEnd(n,4);const b=r.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
    const physical=screen.dipToScreenPoint({x:Math.round(bounds.x+p.x),y:Math.round(bounds.y+p.y)});const back=screen.screenToDipPoint(physical);fs.writeFileSync(path.join(data,'live-vlc-coordinates.json'),JSON.stringify({bounds,p,physical,back,visible:overlay.isVisible(),displays:screen.getAllDisplays().map(d=>({bounds:d.bounds,scale:d.scaleFactor})),direct:await overlay.webContents.executeJavaScript(`window.subtitleHitTest(${p.x},${p.y})`),converted:await overlay.webContents.executeJavaScript(`window.subtitleHitTest(${back.x-bounds.x},${back.y-bounds.y})`)},null,2));await vlc.cursor(physical);assert(captured,'VLC native coordinate lookup');const found=await pending;assert.equal(found.word,'日本語');
    fs.writeFileSync(path.join(data,'vlc-live-verifica.png'),(await overlay.webContents.capturePage()).toPNG());
    return {name:'VLC reale → testo originale → posizione mouse → Yomitan',format:subtitle?path.extname(subtitle):'SRT / automatico',word:found.word,provider:captured.source,characters:captured.text.length};
  }finally{clearInterval(timer);vlc.close();if(child)child.kill();}
};
