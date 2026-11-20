// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {app,BrowserWindow,session,ipcMain,screen,Tray,Menu,nativeImage,dialog,shell,globalShortcut}=require('electron');
const fs=require('node:fs');const fsp=fs.promises;const path=require('node:path');const crypto=require('node:crypto');const {spawn}=require('node:child_process');const readline=require('node:readline');
const {placePopup,validateSource,contained,localAnkiUrl,safeInside}=require('./core.cjs');
const anki=require('./anki.cjs');
const {suggestedDictionaries,installedIds,ankiLinks}=require('./setup.cjs');
const {PopupSession}=require('./popup-session.cjs');
const I18N=require('./ui/i18n.js');
const root=process.env.YOMIDESKTOP_ROOT||(app.isPackaged?path.dirname(process.execPath):path.resolve(__dirname,'..'));
const data=process.env.YOMIDESKTOP_DATA||path.join(root,'data');fs.mkdirSync(data,{recursive:true});
app.setName('YomiDesktop');app.setPath('userData',path.join(data,'profile'));
const testMode=process.argv.includes('--self-test');
let preferences={language:'en',scanKey:'shift',enabled:true,ocrEnabled:true,ankiServer:'http://127.0.0.1:8765',ankiKey:'',ankiDeck:'Yomitan',startAtLogin:false};
const preferencesFile=path.join(data,'preferences.json');
const hadPreferences=fs.existsSync(preferencesFile);
try{preferences={...preferences,...JSON.parse(fs.readFileSync(preferencesFile,'utf8'))};}catch{}
// Existing installs skip the setup wizard; a fresh install opens it.
if(preferences.setupDone===undefined)preferences.setupDone=hadPreferences&&Boolean(preferences.ankiPrepared||fs.existsSync(path.join(data,'dictionary-import.json')));
const scanKeys={shift:{code:0x10,label:'Shift',yomitan:'shift'},ctrl:{code:0x11,label:'Ctrl',yomitan:'ctrl'},alt:{code:0x12,label:'Alt',yomitan:'alt'}};
const scanKey=()=>preferences.scanKey==='custom'&&preferences.customKey?{code:preferences.customKey.code,label:preferences.customKey.label,yomitan:null}:scanKeys[preferences.scanKey]||scanKeys.shift;
const t=(key,vars)=>I18N.translator(preferences.language)(key,vars);
const ankiText=key=>t(key||(preferences.ankiPrepared?'anki.prepared':'anki.todo'));
const ocrText=()=>!preferences.ocrEnabled?t('ocr.off'):status.ocrAvailable===undefined?t('ocr.preparing'):t(status.ocrAvailable?'ocr.ready':'ocr.unavailable');
// Status messages remember their key, so they can be shown again in another language.
const phase=(key,vars={})=>({phase:t(key,vars),phaseKey:key,phaseVars:vars,ready:key==='phase.ready',error:false});
const readyPhase=()=>phase('phase.ready',{key:scanKey().label});
const ocrTitle=()=>{if(popupReady)popup.webContents.executeJavaScript(`document.getElementById('desktop-ocr').title=${JSON.stringify(t('popup.ocr'))}`).catch(()=>{});};
const savePrefs=()=>{const tmp=preferencesFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(preferences,null,2));fs.renameSync(tmp,preferencesFile);};
let mainWindow,engine,popup,tray,native,extensionId,shuttingDown=false,engineReady=false,popupReady=false;
let status={language:preferences.language,enabled:preferences.enabled,dictionaries:[],native:false,vlc:'',ankiKey:null,imported:0,total:0};
let popupSize={width:400,height:250},scanLength=16,contextExtent=200,requestId=0,lastQueryKey='',lastCursor={x:0,y:0};
let nativeBusySince=0,watchdog,vlcBridge,lastSourcePid=0,lastSourceWindow=0,lastUnsupported='';
const ownerRequests=new Map();
Object.assign(status,phase('phase.start'),{anki:ankiText()});
const popupSession=new PopupSession({visible:()=>Boolean(popup&&!popup.isDestroyed()&&popup.isVisible()),bounds:()=>popup.getBounds(),close:()=>hidePopup()});
const logFile=path.join(data,'diagnostics.log');
function log(event,details=''){fs.appendFileSync(logFile,`${new Date().toISOString()} ${event} ${String(details).slice(0,1200)}\n`);}
function setStatus(update){Object.assign(status,update);if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('desktop:status',status);if(tray)refreshTray();}
function errorMessage(e){return e?.message||String(e);}
function trustedWindow(e){return [mainWindow,popup,engine,...BrowserWindow.getAllWindows()].some(w=>w&&!w.isDestroyed()&&w.webContents===e.sender&&(/^(file:|chrome-extension:)/.test(e.sender.getURL())));}
function safeWeb(w){
  w.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith(`chrome-extension://${extensionId}/`)){openEnginePage(url);return {action:'deny'};}if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  w.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file:')&&!url.startsWith(`chrome-extension://${extensionId}/`)){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url);}});
  w.webContents.on('render-process-gone',(_event,details)=>{log('renderer-gone',details.reason);if(!shuttingDown){setStatus(phase('phase.restart'));w.webContents.reload();}});
}
function windowOptions(extra={}){return {show:false,icon:path.join(__dirname,'extension','images','icon128.png'),backgroundColor:'#1d2027',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false,backgroundThrottling:false},...extra};}
function showPage(page){const [width,height]=page==='setup.html'?[680,730]:[460,760];const b=mainWindow.getBounds();mainWindow.setMinimumSize(page==='setup.html'?540:400,480);if(b.width!==width||b.height!==height)mainWindow.setBounds({x:b.x+Math.round((b.width-width)/2),y:b.y,width,height});mainWindow.loadFile(path.join(__dirname,'ui',page));}
function createMain(){
  mainWindow=new BrowserWindow(windowOptions({width:460,height:760,minWidth:400,minHeight:480,title:'YomiDesktop',autoHideMenuBar:true}));safeWeb(mainWindow);
  showPage(preferences.setupDone?'index.html':'setup.html');
  mainWindow.on('close',e=>{if(!shuttingDown&&!testMode){e.preventDefault();mainWindow.hide();}});
  mainWindow.webContents.on('did-finish-load',()=>mainWindow.webContents.send('desktop:status',status));
  if((!process.argv.includes('--background')||!preferences.setupDone)&&!testMode)mainWindow.show();
}
let trayIcons;
function refreshTray(){
  tray.setImage(preferences.enabled?trayIcons.on:trayIcons.off);
  tray.setToolTip(preferences.enabled?t('tray.tip',{key:scanKey().label}):t('tray.paused'));
  tray.setContextMenu(Menu.buildFromTemplate([{label:t('tray.open'),click:()=>mainWindow.show()},{label:t(preferences.enabled?'tray.off':'tray.on'),click:()=>toggleEnabled(!preferences.enabled)},{type:'separator'},{label:t('tray.quit'),click:()=>app.quit()}]));
}
// Paused: the tray icon turns black and white.
function grayIcon(image){
  const size=image.getSize(),pixels=Buffer.from(image.toBitmap());
  for(let i=0;i<pixels.length;i+=4){const g=Math.round(pixels[i]*.114+pixels[i+1]*.587+pixels[i+2]*.299);pixels[i]=pixels[i+1]=pixels[i+2]=g;}
  return nativeImage.createFromBitmap(pixels,size);
}
function toggleEnabled(value){preferences.enabled=Boolean(value);savePrefs();if(native?.stdin.writable)native.stdin.write(JSON.stringify({enabled:preferences.enabled})+'\n');setStatus({enabled:preferences.enabled});if(!value)hidePopup();}
function createTray(){
  const on=nativeImage.createFromPath(path.join(__dirname,'extension','images','icon32.png'));trayIcons={on,off:grayIcon(on)};
  tray=new Tray(preferences.enabled?on:trayIcons.off);tray.on('double-click',()=>mainWindow.show());refreshTray();
}
function openEnginePage(url){const w=new BrowserWindow(windowOptions({width:1000,height:780,title:t('window.options'),autoHideMenuBar:true}));safeWeb(w);w.on('page-title-updated',e=>e.preventDefault());w.loadURL(url).then(()=>w.show());w.webContents.on('did-finish-load',sendOwnPids);}
async function waitFor(w,expression,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await w.webContents.executeJavaScript(expression).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw new Error(t('err.engine'));}
async function bridge(method,...args){if(!engine||engine.isDestroyed())throw new Error(t('err.noEngine'));return engine.webContents.executeJavaScript(`window.yomiBridge[${JSON.stringify(method)}](...${JSON.stringify(args)})`);}
async function importData(){
  const migration=process.env.YOMIDESKTOP_MIGRATION||path.resolve(root,'..','..','work','migration');
  const manifestFile=path.join(migration,'manifest.json');const completedFile=path.join(data,'dictionary-import.json');
  if(fs.existsSync(completedFile))return;
  if(!fs.existsSync(manifestFile)){log('dictionary-import-skipped','fresh profile');return;}// Fresh install: dictionaries are imported from Yomitan settings.
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));if(!manifest.complete)throw new Error('Incomplete archive.');
  const total=Object.values(manifest.tables).reduce((a,b)=>a+b,0);
  setStatus({...phase('loading.import'),total,imported:0});
  const checkpointFile=path.join(data,'migration-checkpoint.json');let done=[];
  try{done=JSON.parse(fs.readFileSync(checkpointFile,'utf8'));}catch{}
  let imported=0;const bases={};
  for(const chunk of manifest.chunks){
    const base=bases[chunk.store]||0;bases[chunk.store]=base+chunk.count;
    if(!done.includes(chunk.file)){
      const payload=await fsp.readFile(safeInside(migration,chunk.file));
      if(crypto.createHash('sha256').update(payload).digest('hex')!==chunk.sha256)throw new Error('Integrity check failed: '+chunk.file);
      await bridge('importChunk',chunk.store,JSON.parse(payload),base);
      done.push(chunk.file);const tmp=checkpointFile+'.tmp';await fsp.writeFile(tmp,JSON.stringify(done));await fsp.rename(tmp,checkpointFile);
    }
    imported+=chunk.count;if(done.length%12===0)setStatus({imported});
  }
  const counts=await bridge('counts');for(const [name,count] of Object.entries(manifest.tables))if(counts[name]!==count)throw new Error(`Count ${name}: expected ${count}, found ${counts[name]}`);
  const original=JSON.parse(fs.readFileSync(path.join(migration,'settings-original.json'),'utf8'));
  for(const p of original.profiles){p.options.general.showGuide=false;p.options.general.enableYomitanApi=false;p.options.clipboard.enableBackgroundMonitor=false;p.options.clipboard.enableSearchPageMonitor=false;}
  // Cards use exactly the Firefox Yomitan Anki settings.
  anki.applyMapping(original,preferences.ankiServer,preferences.ankiKey,preferences.ankiDeck,{notes:t('anki.notes')});
  await bridge('setOptions',original);await bridge('notify');
  fs.writeFileSync(completedFile,JSON.stringify({date:new Date().toISOString(),counts,dictionaries:(await bridge('dictionaries')).map(d=>d.title)},null,2));
  setStatus({imported:total,total});log('dictionary-import-complete',JSON.stringify(counts));
}
async function startEngine(){
  const ext=await session.defaultSession.extensions.loadExtension(path.join(__dirname,'extension'),{allowFileAccess:true});extensionId=ext.id;
  engine=new BrowserWindow(windowOptions({width:500,height:400}));safeWeb(engine);
  engine.webContents.on('console-message',(_event,d)=>{if(d.level==='error'||d.level===3)log('engine-error',d.message);});
  session.defaultSession.serviceWorkers.on('console-message',(_event,d)=>{if(d.level===3)log('engine-worker-error',d.message);});
  await engine.loadURL(`chrome-extension://${extensionId}/desktop/bridge.html`);await waitFor(engine,'Boolean(window.yomiBridge)');
  await importData();
  if(preferences.cardsVersion!==2){
    // One-time switch to the Firefox Yomitan card settings (plus frequency/source in Notes).
    await bridge('setOptions',anki.applyMapping(await bridge('options'),preferences.ankiServer,preferences.ankiKey,preferences.ankiDeck,{model:preferences.ankiModel,autoMeaning:preferences.ankiAutoMeaning,notes:t('anki.notes')}));
    preferences.cardsVersion=2;savePrefs();
  }
  const options=await bridge('options');const current=options.profiles[options.profileCurrent].options;
  popupSize={width:Math.max(300,Math.round(current.general.popupWidth*current.general.popupScalingFactor)),height:Math.max(200,Math.round(current.general.popupHeight*current.general.popupScalingFactor))};scanLength=current.scanning.length;contextExtent=current.sentenceParsing.scanExtent;
  setStatus({dictionariesLoaded:true,dictionaries:await bridge('dictionaries'),...readyPhase()});
  popup=new BrowserWindow(windowOptions({width:popupSize.width,height:popupSize.height,frame:false,alwaysOnTop:true,skipTaskbar:true,resizable:true,minWidth:280,minHeight:180,hasShadow:true,focusable:false}));safeWeb(popup);
  popup.setAlwaysOnTop(true,'screen-saver');
  popup.webContents.on('console-message',(_event,d)=>{if(d.level==='error'||d.level===3)log('popup-error',d.message);});
  await popup.loadURL(`chrome-extension://${extensionId}/desktop/popup.html`);await waitFor(popup,'Boolean(window.yomiDesktop)');popupReady=true;ocrTitle();
  popup.on('resize',()=>{if(popup.isVisible()){const b=popup.getBounds();popupSize={width:b.width,height:b.height};}});
  popup.on('close',e=>{if(!shuttingDown){e.preventDefault();hidePopup();}});
  engineReady=true;sendOwnPids();
}
function sendOwnPids(){if(!native?.stdin?.writable)return;const pids=[process.pid,...BrowserWindow.getAllWindows().map(w=>w.webContents.getOSProcessId())];native.stdin.write(JSON.stringify({pids,enabled:preferences.enabled,extent:contextExtent,ocr:preferences.ocrEnabled,scanKey:scanKey().code})+'\n');}
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
    lastUnsupported='';setStatus({...readyPhase(),lastLookupMs:Date.now()-started});
    vlcBridge?.hold(source);
  }catch(e){if(id!==requestId)return;hidePopup();log('lookup-error',errorMessage(e));setStatus(phase('phase.failed',{key:scanKey().label}));}
}
function startNative(){
  if(shuttingDown)return;
  native=spawn(path.join(__dirname,'native','TextProbe.exe'),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});sendOwnPids();
  native.on('error',e=>{log('native-error',errorMessage(e));setStatus({native:false,...phase('phase.noReader')});});
  native.stderr.on('data',()=>{});
  const lines=readline.createInterface({input:native.stdout});
  lines.on('line',line=>{let event;try{event=JSON.parse(line);}catch{return;}
    switch(event.kind){
      case 'ready':popupSession.newReader();log('native-ready');setStatus({native:true});sendOwnPids();break;
      case 'shortcut-hook':log('shortcut-hook',event.ok?'ready':'polling-fallback');break;
      case 'ocr-ready':status.ocrAvailable=Boolean(event.available);setStatus({ocr:ocrText()});log('ocr-ready',event.available?'ja':'unavailable');break;
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
          const source=String(event.data.source||'App'),key=source+':'+event.data.reason;
          if(key!==lastUnsupported){lastUnsupported=key;log('text-unavailable',source+' '+event.data.reason);setStatus(preferences.ocrEnabled?phase('phase.noText'):phase('phase.noDirect',{source}));}
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
  if(!trustedWindow(event))throw new Error(t('err.unauthorized'));
  switch(name){
    case 'engine-sync':{
      if(event.sender!==engine?.webContents)return false;
      const options=await bridge('options'),p=options.profiles[options.profileCurrent].options;
      scanLength=p.scanning.length;contextExtent=p.sentenceParsing.scanExtent;
      popupSize={width:Math.max(300,Math.round(p.general.popupWidth*p.general.popupScalingFactor)),height:Math.max(200,Math.round(p.general.popupHeight*p.general.popupScalingFactor))};
      sendOwnPids();setStatus({dictionaries:await bridge('dictionaries')});return true;
    }
    case 'status':return {...status,ocr:ocrText(),scanKeyLabel:scanKey().label,preferences:{...preferences,ankiKey:undefined},version:app.getVersion()};
    case 'toggle':toggleEnabled(payload.enabled);return status;
    case 'ocr-toggle':preferences.ocrEnabled=Boolean(payload.enabled);savePrefs();sendOwnPids();setStatus({ocr:ocrText()});return true;
    case 'settings':openEnginePage(`chrome-extension://${extensionId}/settings.html`);return true;
    case 'lookup':return lookup({...payload,source:'YomiDesktop',title:t('manual')});
    case 'anki-test':{
      const server=localAnkiUrl(payload.server||preferences.ankiServer);const key=String(payload.key||preferences.ankiKey||'');
      try{const version=await anki.call(server,key,'version');setStatus({anki:t('anki.connected'),ankiKey:'anki.connected'});return {ok:true,version};}catch(e){setStatus({anki:t('anki.notConnected'),ankiKey:'anki.notConnected'});return {ok:false,message:t('anki.openHint')+errorMessage(e)};}
    }
    case 'anki-prepare':{
      const server=localAnkiUrl(payload.server||preferences.ankiServer),key=String(payload.key||preferences.ankiKey||''),deck=String(payload.deck||preferences.ankiDeck).trim();if(!deck||deck.length>200)throw new Error(t('anki.badDeck'));
      const setup=Boolean(payload.setup),autoMeaning=setup?Boolean(payload.autoMeaning):Boolean(preferences.ankiAutoMeaning);
      const result=await anki.prepare(server,key,deck,fetch,{createModel:setup,t});
      preferences.ankiServer=server;preferences.ankiKey=key;preferences.ankiDeck=deck;preferences.ankiPrepared=true;preferences.ankiModel=result.model;preferences.ankiAutoMeaning=autoMeaning;preferences.cardsVersion=2;savePrefs();
      await bridge('setOptions',anki.applyMapping(await bridge('options'),server,key,deck,{model:result.model,autoMeaning,notes:t('anki.notes')}));setStatus({anki:t('anki.connectedReady'),ankiKey:'anki.connectedReady'});return result;
    }
    case 'open-video':return vlcBridge?.openVideo();
    // Setup wizard
    case 'setup-info':{
      const installed=engineReady?installedIds(await bridge('dictionaries')):[];
      return {scanKey:preferences.scanKey,scanKeyLabel:scanKey().label,language:preferences.language,dictionaries:suggestedDictionaries.map(({url,match,...d})=>({...d,kind:t('kind.'+d.kind),about:t('about.'+d.id),installed:installed.includes(d.id)})),engineReady,ankiServer:preferences.ankiServer,ankiDeck:preferences.ankiDeck,ankiAutoMeaning:Boolean(preferences.ankiAutoMeaning),ankiPrepared:Boolean(preferences.ankiPrepared),startAtLogin:Boolean(preferences.startAtLogin)};
    }
    case 'set-key':{
      let next=String(payload.key);const previous=scanKey().yomitan;
      if(next==='custom'){
        // Any keyboard key except Esc (closes the popup), or the middle/side mouse buttons (4-6); Shift/Ctrl/Alt use their own entries.
        const code=Number(payload.code),label=String(payload.label||'').trim().slice(0,20);
        const modifier={16:'shift',17:'ctrl',18:'alt'}[code];
        if(modifier)next=modifier;else{if(!Number.isInteger(code)||code<4||code===7||code>254||code===27||!label)throw new Error(t('err.badKey'));preferences.customKey={code,label};}
      }else if(!scanKeys[next])throw new Error(t('err.badKey'));
      preferences.scanKey=next;savePrefs();sendOwnPids();
      const wanted=scanKey().yomitan;
      if(engineReady&&previous&&wanted&&previous!==wanted){const options=await bridge('options');for(const profile of options.profiles)for(const input of profile.options.scanning.inputs)if(input.include===previous)input.include=wanted;await bridge('setOptions',options);}
      setStatus({...(engineReady?readyPhase():{}),scanKeyLabel:scanKey().label});return true;
    }
    case 'install-dictionaries':{
      if(!engineReady)throw new Error(t('err.starting'));
      const wanted=suggestedDictionaries.filter(d=>(payload.ids||[]).includes(d.id));const results=[];
      for(const [index,d] of wanted.entries()){
        setStatus({setupProgress:{index,total:wanted.length,title:d.title}});
        try{if(!installedIds(await bridge('dictionaries')).includes(d.id))await bridge('importUrl',d.url);results.push({id:d.id,ok:true});log('setup-dictionary',d.title);}
        catch(e){results.push({id:d.id,ok:false,message:errorMessage(e)});log('setup-dictionary-error',d.title+' '+errorMessage(e));}
      }
      setStatus({setupProgress:null,dictionaries:await bridge('dictionaries'),dictionariesLoaded:true});return results;
    }
    case 'open-link':{const url=ankiLinks[payload.id];if(!url)return false;shell.openExternal(url);return true;}
    case 'finish-setup':{
      preferences.setupDone=true;
      if(payload.startAtLogin!==undefined){preferences.startAtLogin=Boolean(payload.startAtLogin);app.setLoginItemSettings({openAtLogin:preferences.startAtLogin,path:process.execPath,args:['--background']});}
      savePrefs();showPage('index.html');return true;
    }
    case 'open-setup':showPage('setup.html');return true;
    case 'start-at-login':preferences.startAtLogin=Boolean(payload.enabled);app.setLoginItemSettings({openAtLogin:preferences.startAtLogin,path:process.execPath,args:['--background']});savePrefs();return true;
    case 'set-language':{
      const next=String(payload.language);if(!I18N.strings[next])throw new Error(t('err.command'));
      preferences.language=next;savePrefs();
      const update={language:next,anki:ankiText(status.ankiKey),ocr:ocrText()};
      if(status.phaseKey)Object.assign(update,phase(status.phaseKey,status.phaseVars));
      setStatus(update);ocrTitle();
      // The text added to the cards' Notes field follows the language.
      if(engineReady&&preferences.cardsVersion===2)bridge('options').then(o=>{for(const profile of o.profiles)for(const format of profile.options.anki?.cardFormats||[])if(/\{frequency-harmonic-rank\}/.test(format.fields?.Notes?.value||''))format.fields.Notes.value=t('anki.notes');return bridge('setOptions',o);}).catch(e=>log('language-notes-error',errorMessage(e)));
      return true;
    }
    case 'quit':app.quit();return true;
    default:throw new Error(t('err.command'));
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
      if(testMode){await require(process.env.YOMIDESKTOP_SETUP_TEST?'./tests/setup-smoke.cjs':'./tests/integration.cjs').run({app,engine,popup,popupSession,bridge,lookup,data,root,status,mainWindow});const stale=path.join(data,'self-test-error.txt');if(fs.existsSync(stale))fs.unlinkSync(stale);app.quit();return;}
      const {VlcBridge}=require('./vlc.cjs');vlcBridge=new VlcBridge({root,data,source:__dirname,createWindow:(opts)=>{const w=new BrowserWindow(windowOptions(opts));safeWeb(w);return w;},attachOwner:(w,target)=>new Promise(resolve=>{if(!native?.stdin?.writable){resolve(false);return;}const hwnd=Number(w.getNativeWindowHandle().readBigUInt64LE(0)),key=String(hwnd);ownerRequests.set(key,resolve);sendOwnPids();native.stdin.write(JSON.stringify({ownerWindow:hwnd,owner:target.hwnd})+'\n');setTimeout(()=>{if(ownerRequests.delete(key))resolve(false);},1500);}),setStatus,lookup,hidePopup,screen,dialog});await vlcBridge.start();
      startNative();log('application-ready');watchdog=setInterval(()=>{if(nativeBusySince&&Date.now()-nativeBusySince>7000){log('provider-timeout');nativeBusySince=0;native?.kill();}},1000);
    }catch(e){log('startup-error',e.stack||errorMessage(e));setStatus({phase:errorMessage(e),phaseKey:null,ready:false,error:true});if(testMode){fs.writeFileSync(path.join(data,'self-test-error.txt'),e.stack||String(e));app.exit(1);}else mainWindow.show();}
  });
}
