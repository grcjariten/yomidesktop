// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {app,BrowserWindow,session,ipcMain,screen,Tray,Menu,nativeImage,dialog,shell,globalShortcut}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');const readline=require('node:readline');
const {placePopup,validateSource,contained,localAnkiUrl}=require('./core.cjs');
const anki=require('./anki.cjs');
const {PopupSession}=require('./popup-session.cjs');
const root=process.env.YOMIDESKTOP_ROOT||(app.isPackaged?path.dirname(process.execPath):path.resolve(__dirname,'..'));
app.setName('YomiDesktop');
const data=process.env.YOMIDESKTOP_DATA||path.join(app.getPath('appData'),'YomiDesktop Public');fs.mkdirSync(data,{recursive:true});app.setPath('userData',path.join(data,'profile'));
const testMode=process.argv.includes('--self-test');
let preferences={enabled:true,ocrEnabled:true,ankiServer:'http://127.0.0.1:8765',ankiKey:'',ankiDeck:'YomiDesktop',ankiDefinition:true,startAtLogin:false};
const preferencesFile=path.join(data,'preferences.json');
try{preferences={...preferences,...JSON.parse(fs.readFileSync(preferencesFile,'utf8'))};}catch{}
const savePrefs=()=>{const tmp=preferencesFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(preferences,null,2));fs.renameSync(tmp,preferencesFile);};
let mainWindow,engine,popup,tray,native,extensionId,shuttingDown=false,engineReady=false,popupReady=false;
let status={phase:'Avvio…',enabled:preferences.enabled,dictionaries:[],native:false,vlc:'Preparazione…',anki:preferences.ankiPrepared?'Starter cards ready':'Not connected',engineReady:false,vlcAvailable:false};
let popupSize={width:400,height:250},scanLength=16,contextExtent=200,requestId=0,lastQueryKey='',lastCursor={x:0,y:0};
let nativeBusySince=0,watchdog,vlcBridge,lastSourcePid=0,lastSourceWindow=0,lastUnsupported='';
const ownerRequests=new Map();
const popupSession=new PopupSession({visible:()=>Boolean(popup&&!popup.isDestroyed()&&popup.isVisible()),bounds:()=>popup.getBounds(),close:()=>hidePopup()});
const logFile=path.join(data,'diagnostics.log');
function log(event,details=''){fs.appendFileSync(logFile,`${new Date().toISOString()} ${event} ${String(details).slice(0,1200)}\n`);}
function setStatus(update){Object.assign(status,update);if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('desktop:status',status);if(tray)refreshTray();}
function errorMessage(e){return e?.message||String(e);}
function trustedWindow(e){return [mainWindow,popup,engine,...BrowserWindow.getAllWindows()].some(w=>w&&!w.isDestroyed()&&w.webContents===e.sender&&(/^(file:|chrome-extension:)/.test(e.sender.getURL())));}
function safeWeb(w){
  w.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith(`chrome-extension://${extensionId}/`)){openEnginePage(url);return {action:'deny'};}if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  w.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file:')&&!url.startsWith(`chrome-extension://${extensionId}/`)){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url);}});
  w.webContents.on('render-process-gone',(_event,details)=>{log('renderer-gone',details.reason);if(!shuttingDown){setStatus({phase:'Riavvio del pannello…'});w.webContents.reload();}});
}
function windowOptions(extra={}){return {show:false,icon:path.join(__dirname,'ui','icon.png'),backgroundColor:'#1d2027',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false,backgroundThrottling:false},...extra};}
function createMain(){
  mainWindow=new BrowserWindow(windowOptions({width:740,height:780,minWidth:540,minHeight:600,title:'YomiDesktop',autoHideMenuBar:true}));safeWeb(mainWindow);
  mainWindow.loadFile(path.join(__dirname,'ui','index.html'));
  mainWindow.on('close',e=>{if(!shuttingDown&&!testMode){e.preventDefault();mainWindow.hide();}});
  mainWindow.webContents.on('did-finish-load',()=>mainWindow.webContents.send('desktop:status',status));
  if(!process.argv.includes('--background')&&!testMode)mainWindow.show();
}
function refreshTray(){
  tray.setToolTip(`YomiDesktop · ${preferences.enabled?'Shift to look up':'Paused'}`);
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Open YomiDesktop',click:()=>mainWindow.show()},{label:'Active',type:'checkbox',checked:preferences.enabled,click:()=>toggleEnabled(!preferences.enabled)},{type:'separator'},{label:'Quit',click:()=>app.quit()}]));
}
function toggleEnabled(value){preferences.enabled=Boolean(value);savePrefs();if(native?.stdin.writable)native.stdin.write(JSON.stringify({enabled:preferences.enabled})+'\n');setStatus({enabled:preferences.enabled});if(!value)hidePopup();}
function createTray(){
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'ui','tray.png')));tray.on('double-click',()=>mainWindow.show());refreshTray();
}
function openEnginePage(url){const w=new BrowserWindow(windowOptions({width:1000,height:780,title:'Yomitan engine settings',autoHideMenuBar:true}));safeWeb(w);w.loadURL(url).then(()=>w.show());w.webContents.on('did-finish-load',sendOwnPids);}
async function waitFor(w,expression,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await w.webContents.executeJavaScript(expression).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw new Error('The Yomitan engine did not respond.');}
async function bridge(method,...args){if(!engine||engine.isDestroyed())throw new Error('Dictionary engine unavailable');return engine.webContents.executeJavaScript(`window.yomiBridge[${JSON.stringify(method)}](...${JSON.stringify(args)})`);}
async function startEngine(){
  const ext=await session.defaultSession.extensions.loadExtension(path.join(__dirname,'extension'),{allowFileAccess:true});extensionId=ext.id;
  engine=new BrowserWindow(windowOptions({width:500,height:400}));safeWeb(engine);
  engine.webContents.on('console-message',(_event,d)=>{if(d.level==='error'||d.level===3)log('engine-error',d.message);});
  session.defaultSession.serviceWorkers.on('console-message',(_event,d)=>{if(d.level===3)log('engine-worker-error',d.message);});
  await engine.loadURL(`chrome-extension://${extensionId}/desktop/bridge.html`);await waitFor(engine,'Boolean(window.yomiBridge)');
  const options=await bridge('options');const current=options.profiles[options.profileCurrent].options;
  popupSize={width:Math.max(300,Math.round(current.general.popupWidth*current.general.popupScalingFactor)),height:Math.max(200,Math.round(current.general.popupHeight*current.general.popupScalingFactor))};scanLength=current.scanning.length;contextExtent=current.sentenceParsing.scanExtent;
  setStatus({dictionaries:await bridge('dictionaries'),phase:'Ready. Point at a word and press Shift.'});
  popup=new BrowserWindow(windowOptions({width:popupSize.width,height:popupSize.height,frame:false,alwaysOnTop:true,skipTaskbar:true,resizable:true,minWidth:280,minHeight:180,hasShadow:true,focusable:true}));safeWeb(popup);
  popup.setAlwaysOnTop(true,'screen-saver');
  popup.webContents.on('console-message',(_event,d)=>{if(d.level==='error'||d.level===3)log('popup-error',d.message);});
  await popup.loadURL(`chrome-extension://${extensionId}/desktop/popup.html`);await waitFor(popup,'Boolean(window.yomiDesktop)');popupReady=true;
  popup.on('resize',()=>{if(popup.isVisible()){const b=popup.getBounds();popupSize={width:b.width,height:b.height};}});
  popup.on('close',e=>{if(!shuttingDown){e.preventDefault();hidePopup();}});
  engineReady=true;sendOwnPids();
}
function sendOwnPids(){if(!native?.stdin?.writable)return;const pids=[process.pid,...BrowserWindow.getAllWindows().map(w=>w.webContents.getOSProcessId())];native.stdin.write(JSON.stringify({pids,enabled:preferences.enabled,extent:contextExtent,ocr:preferences.ocrEnabled})+'\n');}
function requestOcr(event){if(!preferences.ocrEnabled||!native?.stdin?.writable||!popupSession.accepts(event))return;native.stdin.write(JSON.stringify({ocrPoint:{x:event.x,y:event.y,sequence:event.sequence,gesture:event.gesture,window:event.hwnd}})+'\n');}
function hidePopup(){popupSession.reset();requestId++;lastQueryKey='';if(popup&&!popup.isDestroyed())popup.hide();vlcBridge?.release();}
async function lookup(raw){
  if(!engineReady||!preferences.enabled||!popupReady)return;
  if(!popupSession.accepts({gesture:raw.nativeGesture,sequence:raw.nativeSequence}))return;
  const source=validateSource(raw,scanLength);if(!source)return;
  lastSourcePid=source.pid||0;lastSourceWindow=source.hwnd||0;
  const key=source.source+'\0'+source.text+'\0'+source.offset;
  const pointer=screen.screenToDipPoint({x:source.x,y:source.y});
  const anchor=source.rect?screen.screenToDipRect(null,{x:Math.round(source.rect.x),y:Math.round(source.rect.y),width:Math.round(source.rect.width),height:Math.round(source.rect.height)}):{...pointer,width:1,height:1};
  if(key===lastQueryKey){if(popup.isVisible()){popupSession.begin(pointer,anchor,source.nativeGesture!==undefined);popupSession.shown(anchor);popup.moveTop();}return;}
  popupSession.begin(pointer,anchor,source.nativeGesture!==undefined);
  const id=++requestId;lastQueryKey=key;const started=Date.now();
  try{
    const result=await popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify(source)})`);
    if(id!==requestId||result.stale)return;
    if(!result.count){hidePopup();return;}
    const p=screen.screenToDipPoint({x:source.x,y:source.y});
    const a=source.rect?screen.screenToDipRect(null,{x:Math.round(source.rect.x),y:Math.round(source.rect.y),width:Math.round(source.rect.width),height:Math.round(source.rect.height)}):{...p,width:1,height:1};
    const area=screen.getDisplayNearestPoint(p).workArea;
    popup.setBounds(placePopup(a,popupSize,area));popup.showInactive();popup.moveTop();
    popupSession.shown(anchor);
    lastUnsupported='';setStatus({phase:'Ready. Point at a word and press Shift.',lastLookupMs:Date.now()-started});
    vlcBridge?.hold(source);
  }catch(e){if(id!==requestId)return;hidePopup();log('lookup-error',errorMessage(e));setStatus({phase:'Lookup failed. Press Shift to try again.'});}
}
function startNative(){
  if(shuttingDown)return;
  native=spawn(path.join(__dirname,'native','TextProbe.exe'),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});sendOwnPids();
  native.on('error',e=>{log('native-error',errorMessage(e));setStatus({native:false,phase:'The Windows text reader is unavailable'});});
  native.stderr.on('data',()=>{});
  const lines=readline.createInterface({input:native.stdout});
  lines.on('line',line=>{let event;try{event=JSON.parse(line);}catch{return;}
    switch(event.kind){
      case 'ready':popupSession.newReader();log('native-ready');setStatus({native:true});sendOwnPids();break;
      case 'shortcut-hook':log('shortcut-hook',event.ok?'ready':'polling-fallback');break;
      case 'ocr-ready':setStatus({ocrAvailable:event.available,ocr:preferences.ocrEnabled?(event.available?'Local Japanese OCR ready':'Local Japanese OCR unavailable'):'OCR off'});log('ocr-ready',event.available?'ja':'unavailable');break;
      case 'shift-down':popupSession.shiftDown(event.gesture);break;
      case 'pointer-move':popupSession.pointer(screen.screenToDipPoint({x:event.x,y:event.y}));break;
      case 'owner-attached':{const key=String(event.window),resolve=ownerRequests.get(key);if(resolve){ownerRequests.delete(key);resolve(event.ok);}break;}
      case 'cursor':{
        popupSession.noteScan(event.sequence);if(!popupSession.accepts(event))break;
        lastCursor={x:event.x,y:event.y};const p=screen.screenToDipPoint(lastCursor);
        if(popup?.isVisible()&&contained(p,popup.getBounds()))break;
        popupSession.begin(p);
        if(event.delegated)vlcBridge?.cursor(event).then(found=>{if(found===false&&popupSession.accepts(event)){if(preferences.ocrEnabled)requestOcr(event);else popupSession.empty();}}).catch(()=>{if(popupSession.accepts(event)){if(preferences.ocrEnabled)requestOcr(event);else popupSession.empty();}});
        break;
      }
      case 'result':{
        if(!popupSession.accepts(event))break;
        if(event.data?.kind==='delegated')break;
        if(event.data?.kind==='unsupported'){
          popupSession.empty();
          const source=String(event.data.source||'Application'),key=source+':'+event.data.reason;
          if(key!==lastUnsupported){lastUnsupported=key;log('text-unavailable',source+' '+event.data.reason);setStatus({phase:preferences.ocrEnabled?'No text recognized at this point.':source+': lettura diretta non disponibile. Puoi attivare l’OCR.'});}
        }else if(event.data)lookup({...event.data,nativeGesture:event.gesture,nativeSequence:event.sequence});else popupSession.empty();
        break;
      }
      case 'escape':if(popupSession.active||popup?.isVisible())hidePopup();break;
      case 'pointer-down':if(popup?.isVisible()&&!contained(screen.screenToDipPoint({x:event.x,y:event.y}),popup.getBounds()))hidePopup();break;
      case 'foreground':if(event.pid!==process.pid&&(event.pid!==lastSourcePid||(lastSourceWindow&&event.hwnd!==lastSourceWindow)))hidePopup();break;
      case 'vlc-windows':vlcBridge?.windows(event.windows);break;
      case 'heartbeat':if(event.busy){if(!nativeBusySince)nativeBusySince=Date.now();}else nativeBusySince=0;break;
      case 'provider-error':log('provider-error',event.error);break;
    }
  });
  native.on('exit',()=>{hidePopup();setStatus({native:false});if(!shuttingDown){log('native-restart');setTimeout(startNative,1000);}});
}
async function handleCommand(event,name,payload={}){
  if(!trustedWindow(event))throw new Error('Unauthorized request');
  switch(name){
    case 'engine-sync':{
      if(event.sender!==engine?.webContents)return false;
      const options=await bridge('options'),p=options.profiles[options.profileCurrent].options;
      scanLength=p.scanning.length;contextExtent=p.sentenceParsing.scanExtent;
      popupSize={width:Math.max(300,Math.round(p.general.popupWidth*p.general.popupScalingFactor)),height:Math.max(200,Math.round(p.general.popupHeight*p.general.popupScalingFactor))};
      sendOwnPids();setStatus({dictionaries:await bridge('dictionaries')});return true;
    }
    case 'status':return {...status,preferences:{...preferences,ankiKey:undefined},version:app.getVersion()};
    case 'toggle':toggleEnabled(payload.enabled);return status;
    case 'ocr-toggle':preferences.ocrEnabled=Boolean(payload.enabled);savePrefs();sendOwnPids();setStatus({ocr:preferences.ocrEnabled?(status.ocrAvailable?'Local Japanese OCR ready':'Local Japanese OCR unavailable'):'OCR off'});return true;
    case 'dictionaries':
    case 'settings':
      if(event.sender!==mainWindow?.webContents||!engineReady)return false;
      openEnginePage(`chrome-extension://${extensionId}/settings.html${name==='dictionaries'?'#dictionaries':''}`);return true;
    case 'lookup':return lookup({...payload,source:'YomiDesktop',title:'Manual lookup'});
    case 'anki-test':{
      const server=localAnkiUrl(payload.server||preferences.ankiServer);const key=String(payload.key||preferences.ankiKey||'');
      try{const version=await anki.call(server,key,'version');setStatus({anki:'Connected'});return {ok:true,version};}catch(e){setStatus({anki:'Not connected'});return {ok:false,message:'Open Anki and check AnkiConnect. '+errorMessage(e)};}
    }
    case 'anki-prepare':{
      const server=localAnkiUrl(payload.server||preferences.ankiServer),key=String(payload.key||preferences.ankiKey||''),deck=String(payload.deck||preferences.ankiDeck).trim();if(!deck||deck.length>200)throw new Error('Enter a valid deck name');
      const includeDefinition=payload.includeDefinition!==false;
      const result=await anki.prepare(server,key,deck);
      preferences.ankiServer=server;preferences.ankiKey=key;preferences.ankiDeck=deck;preferences.ankiPrepared=true;preferences.ankiDefinition=includeDefinition;savePrefs();
      await bridge('setOptions',anki.applyMapping(await bridge('options'),server,key,deck,includeDefinition));setStatus({anki:'Connected · starter cards ready'});return result;
    }
    case 'open-video':return vlcBridge?.openVideo();
    case 'start-at-login':preferences.startAtLogin=Boolean(payload.enabled);app.setLoginItemSettings({openAtLogin:preferences.startAtLogin,path:app.isPackaged?path.join(root,'YomiDesktop.exe'):process.execPath,args:['--background']});savePrefs();return true;
    case 'quit':app.quit();return true;
    default:throw new Error('Unsupported command');
  }
}
if(!app.requestSingleInstanceLock()&&!testMode){app.quit();}
else{
  app.on('second-instance',()=>mainWindow?.show());
  ipcMain.handle('desktop:command',handleCommand);
  ipcMain.on('desktop:close-popup',e=>{if(popup?.webContents===e.sender)hidePopup();});
  ipcMain.on('desktop:subtitle-hit',(e,payload)=>{if(vlcBridge?.owns(e.sender))lookup(payload);});
  app.on('window-all-closed',()=>{});
  app.on('before-quit',()=>{shuttingDown=true;popupSession.reset();clearInterval(watchdog);globalShortcut.unregisterAll();vlcBridge?.close();if(native){native.stdin?.end();native.kill();}});
  app.whenReady().then(async()=>{
    Menu.setApplicationMenu(null);createMain();if(!testMode)createTray();
    try{
      await startEngine();
      setStatus({engineReady:true});
      if(testMode){await require('./tests/integration.cjs').run({app,engine,popup,popupSession,bridge,lookup,data,root,status,mainWindow});const stale=path.join(data,'self-test-error.txt');if(fs.existsSync(stale))fs.unlinkSync(stale);app.quit();return;}
      const {VlcBridge}=require('./vlc.cjs');vlcBridge=new VlcBridge({root,data,source:__dirname,createWindow:(opts)=>{const w=new BrowserWindow(windowOptions(opts));safeWeb(w);return w;},attachOwner:(w,target)=>new Promise(resolve=>{if(!native?.stdin?.writable){resolve(false);return;}const hwnd=Number(w.getNativeWindowHandle().readBigUInt64LE(0)),key=String(hwnd);ownerRequests.set(key,resolve);sendOwnPids();native.stdin.write(JSON.stringify({ownerWindow:hwnd,owner:target.hwnd})+'\n');setTimeout(()=>{if(ownerRequests.delete(key))resolve(false);},1500);}),setStatus,lookup,hidePopup,screen,dialog});await vlcBridge.start().catch(e=>{log('vlc-start-error',errorMessage(e));setStatus({vlc:'Direct subtitle bridge unavailable. On-screen OCR still works.'});});
      startNative();log('application-ready');watchdog=setInterval(()=>{if(nativeBusySince&&Date.now()-nativeBusySince>7000){log('provider-timeout');nativeBusySince=0;native?.kill();}},1000);
    }catch(e){log('startup-error',e.stack||errorMessage(e));setStatus({phase:errorMessage(e),error:true});if(testMode){fs.writeFileSync(path.join(data,'self-test-error.txt'),e.stack||String(e));app.exit(1);}else mainWindow.show();}
  });
}
