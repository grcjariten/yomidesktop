const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
exports.run=async({engine,popup,popupSession,bridge,lookup,data,root,mainWindow})=>{
  const results=[];const counts=await bridge('counts');assert.equal(counts.terms,1096281);assert.equal(counts.termMeta,2320013);results.push({name:'Migrazione completa',counts});
  const info=await bridge('dictionaries');assert.equal(info.length,8);results.push({name:'Otto dizionari',dictionaries:info.map(d=>d.title)});
  for(const [source,expected] of [['食べました','食べる'],['日本語','日本語'],['取り戻した','取り戻す'],['勉強しています','勉強']]){
    const start=Date.now();const found=await bridge('terms',source);assert(found.dictionaryEntries.length>0,source);
    const words=found.dictionaryEntries.flatMap(x=>x.headwords.map(h=>h.term));assert(words.some(w=>w===expected),source+' -> '+words.join(','));results.push({name:'Ricerca '+source,expected,ms:Date.now()-start,count:found.dictionaryEntries.length});
  }
  const payload={text:'昨日は日本語を勉強しました。',offset:3,query:'日本語を勉強しました。',source:'Test',title:'Prova di lettura diretta'};
  const found=await popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify(payload)})`);assert(found.count>0);assert.equal(found.word,'日本語');
  results.push({name:'Popup originale',result:found,summary:await popup.webContents.executeJavaScript('window.yomiDesktop.summary()')});
  fs.writeFileSync(path.join(data,'popup-verifica.png'),(await popup.webContents.capturePage()).toPNG());
  if(process.env.YOMIDESKTOP_POPUP_REGRESSION){
    // Production keeps this window hidden until the first lookup has rendered.
    // A fresh-window-only test misses Chromium's background timer throttling.
    popup.hide();await new Promise(r=>setTimeout(r,75000));
    const start=Date.now();
    const idle=await popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify(payload)})`);
    assert(idle.count>0);assert.equal(idle.word,'日本語');
    const elapsed=Date.now()-start;assert(elapsed<5000,'Hidden popup lookup took '+elapsed+'ms');
    const rapid=await popup.webContents.executeJavaScript(`Promise.all(['日本語','食べました','取り戻した','勉強しています','日本語'].map(query=>window.yomiDesktop.lookup({query,text:query,offset:0,source:'Regression'})))`);
    assert(rapid.slice(0,-1).every(x=>x.stale));assert.equal(rapid.at(-1).word,'日本語');
    const interrupted=await popup.webContents.executeJavaScript(`(async()=>{
      const api=window.yomiDesktop;let next;
      const onEntry=()=>{api.display.off('contentUpdateEntry',onEntry);next=api.lookup({query:'食べました',text:'食べました。',offset:0,source:'Regression'});};
      api.display.on('contentUpdateEntry',onEntry);
      const previous=await api.lookup(${JSON.stringify(payload)});
      return {previous,next:await next};
    })()`);
    assert(interrupted.previous.stale,'Superseded render must be cancelled');assert.equal(interrupted.next.word,'食べる');
    for(let i=0;i<3;i++){
      const repeat=await popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify(payload)})`);
      assert.equal(repeat.word,'日本語');
    }
    results.push({name:'Popup nascosto e richieste rapide ripetute',hiddenMs:75000,lookupMs:elapsed,rapidLookups:rapid.length,interruptedRender:true});
  }
  const {BrowserWindow}=require('electron');const view=new BrowserWindow({show:false,width:960,height:540,webPreferences:{preload:path.resolve(__dirname,'../preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  try{
    await view.loadFile(path.resolve(__dirname,'../ui/subtitles.html'));
    const packet={id:0,width:960,height:540,originalWidth:960,originalHeight:540,font:'Yu Gothic',fontSize:38,relativeSize:0,color:16777215,bold:false,title:'Verifica VLC',regions:[{x:0,y:27,align:8,textAlign:0,segments:[{text:'昨日は日本語を勉強しました。'}]}]};
    view.webContents.send('desktop:subtitle',[packet]);await new Promise(r=>setTimeout(r,200));
    const hits=await view.webContents.executeJavaScript(`(()=>{const node=document.querySelector('.subtitle span').firstChild;return [0,1,2,3,4,5,6,7,8,9,10,11,12].flatMap(i=>{const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+1);const b=r.getBoundingClientRect();return [.2,.8].map(f=>({expected:i,hit:window.subtitleHitTest(b.x+b.width*f,b.y+b.height*.5)}));});})()`);
    for(const {expected,hit} of hits){assert(hit,'Subtitle hit '+expected);assert.equal(hit.offset,expected,'Subtitle offset');}
    const hit=hits.find(x=>x.expected===3).hit;const found=await popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify({...hit,source:'VLC',title:'Verifica VLC'})})`);assert.equal(found.word,'日本語');
    results.push({name:'VLC: coordinate del testo e ricerca nel popup',positions:hits.length,result:found});
    fs.writeFileSync(path.join(data,'sottotitoli-verifica.png'),(await view.webContents.capturePage()).toPNG());
  }finally{view.destroy();}
  // Exercise the actual original Yomitan note builder, without writing to Anki.
  const note=await popup.webContents.executeJavaScript(`window.yomiDesktop.anki.getLogData(window.yomiDesktop.display.dictionaryEntries[0]).then(x=>x.ankiNotes[0])`);
  assert(note.note,'Anki note template rendering');assert.equal(note.note.fields.Word,'日本語');assert.equal(note.note.fields['Word Meaning'],'');assert(note.note.fields.Sentence.includes('昨日は'));assert(note.note.fields['Word Furigana'].includes('日本語'));assert(note.note.fields.Notes.includes('Fonte:'));
  results.push({name:'Generazione reale carta Anki',fields:Object.keys(note.note.fields),model:note.note.modelName,deck:note.note.deckName});
  if(process.env.YOMIDESKTOP_INTERACTION_REGRESSION){
    const {screen}=require('electron');const area=screen.getPrimaryDisplay().workArea;
    const point=screen.dipToScreenPoint({x:area.x+100,y:area.y+100});
    const source={...payload,source:'Verifica chiusura',x:point.x,y:point.y,rect:{x:point.x,y:point.y,width:20,height:20}};
    await lookup(source);assert(popup.isVisible());
    let bounds=popup.getBounds();popupSession.pointer({x:bounds.x+20,y:bounds.y+20});
    await new Promise(r=>setTimeout(r,230));assert(popup.isVisible(),'Popup must stay open while pointer is inside');
    popupSession.pointer({x:bounds.x+bounds.width+50,y:bounds.y+bounds.height+50});
    await new Promise(r=>setTimeout(r,230));assert(!popup.isVisible(),'Pointer exit must close popup without holding Shift');
    await lookup(source);assert(popup.isVisible());popupSession.shiftDown(10);assert(!popup.isVisible(),'Second Shift must close popup');
    await lookup({...source,nativeGesture:10,nativeSequence:1});assert(!popup.isVisible(),'Closed popup must not reopen on a late result');
    await lookup({...source,provider:'OCR.PP-OCRv6',text:'日本語',offset:0,rect:{x:point.x+25,y:point.y+25,width:18,height:18}});
    await new Promise(r=>setTimeout(r,750));assert(popup.isVisible(),'OCR geometry must not dismiss its own scan point');
    popupSession.pointer({x:area.x+102,y:area.y+100});popupSession.empty();
    await new Promise(r=>setTimeout(r,250));assert(popup.isVisible(),'Missed OCR scan near source must keep the valid result');
    popupSession.pointer({x:area.x+900,y:area.y+700});await new Promise(r=>setTimeout(r,230));assert(!popup.isVisible());
    results.push({name:'Chiusura reale popup',pointerExit:true,shiftToggle:true,lateResultRejected:true,manualMeaning:note.note.fields['Word Meaning']==='',ocrStableForMs:1000,missedOcrScanPreserved:true});
  }
  if(process.env.YOMIDESKTOP_ZORDER_REGRESSION){
    const {screen}=require('electron');const {execFile}=require('node:child_process');const {promisify}=require('node:util');
    const execute=promisify(execFile),area=screen.getPrimaryDisplay().workArea;
    const blocker=new BrowserWindow({show:false,frame:false,alwaysOnTop:true,skipTaskbar:true,x:area.x+20,y:area.y+20,width:700,height:500,backgroundColor:'#999999'});
    const popupHandle=Number(popup.getNativeWindowHandle().readBigUInt64LE(0)),blockerHandle=Number(blocker.getNativeWindowHandle().readBigUInt64LE(0));
    const topAt=async(p)=>{const {stdout}=await execute(path.resolve(__dirname,'../native/TextProbe.exe'),['--top-at',String(p.x),String(p.y)],{windowsHide:true,encoding:'utf8',timeout:3000});return JSON.parse(stdout.replace(/^\uFEFF/,''));};
    try{
      blocker.showInactive();blocker.moveTop();
      const p=screen.dipToScreenPoint({x:area.x+60,y:area.y+60});
      const source={...payload,source:'Verifica primo piano',x:p.x,y:p.y,rect:{x:p.x,y:p.y,width:20,height:20}};
      await lookup(source);assert(popup.isVisible());assert(!popup.isFocused(),'Lookup must not steal focus');
      const b=popup.getBounds(),probe=screen.dipToScreenPoint({x:b.x+30,y:b.y+30});
      const first=await topAt(probe);assert.equal(first.window,popupHandle,'Popup must cover another always-on-top window');
      blocker.moveTop();const covered=await topAt(probe);assert.equal(covered.window,blockerHandle,'Regression setup must cover popup');
      await lookup(source);const repeated=await topAt(probe);assert.equal(repeated.window,popupHandle,'Same word must raise popup again');
      assert(!popup.isFocused());
      results.push({name:'Popup davanti alle finestre senza sottrarre focus',firstWindow:first.window,repeatedWindow:repeated.window,popupWindow:popupHandle,foreground:first.foreground,focused:false});
    }finally{blocker.destroy();popup.hide();}
  }
  if(process.env.YOMIDESKTOP_IA2_FIXTURE){
    const {execFile}=require('node:child_process');const {promisify}=require('node:util');
    const fixture=JSON.parse(process.env.YOMIDESKTOP_IA2_FIXTURE);
    const {stdout}=await promisify(execFile)(path.resolve(__dirname,'../native/TextProbe.exe'),['--ia2-window',String(fixture.window),String(fixture.x),String(fixture.y)],{windowsHide:true,encoding:'utf8',timeout:5000});
    const hit=JSON.parse(stdout.replace(/^\uFEFF/,''));assert.equal(hit.offset,3);assert(hit.text.includes('日本語'));
    const found=await popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify({...hit,query:hit.text.slice(hit.offset),source:'LibreOffice Writer',title:'Verifica lettura generale'})})`);
    assert.equal(found.word,'日本語');results.push({name:'LibreOffice reale → IAccessible2 → carattere → Yomitan',provider:'IAccessible2.Text',word:found.word});
  }
  if(process.env.YOMIDESKTOP_MODERN_REGRESSION){
    const {app,screen}=require('electron');const {execFile}=require('node:child_process');const {promisify}=require('node:util');
    app.setAccessibilitySupportEnabled(true);
    const area=screen.getPrimaryDisplay().workArea;
    const modernView=new BrowserWindow({show:false,x:area.x+30,y:area.y+40,width:640,height:250,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    try{
      await modernView.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html lang="ja"><meta charset="utf-8"><title>Verifica testo UIA3</title><body style="font:32px Meiryo;margin:20px"><div id="sample">昨日は日本語を勉強しました。𠮷野に行った。</div></body></html>'));
      modernView.showInactive();await new Promise(r=>setTimeout(r,250));
      const geometry=await modernView.webContents.executeJavaScript(`(()=>{const node=document.getElementById('sample').firstChild;return [0,3,4,5,14].flatMap(i=>{const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+(node.textContent.codePointAt(i)>0xffff?2:1));const b=r.getBoundingClientRect();return [.2,.8].map(f=>({character:String.fromCodePoint(node.textContent.codePointAt(i)),x:b.x+b.width*f,y:b.y+b.height/2,index:i}));});})()`);
      const content=modernView.getContentBounds(),handle=String(modernView.getNativeWindowHandle().readBigUInt64LE(0));let dictionaryHit;
      for(const point of geometry){
        const p=screen.dipToScreenPoint({x:Math.round(content.x+point.x),y:Math.round(content.y+point.y)});
        const {stdout}=await promisify(execFile)(path.resolve(__dirname,'../native/TextProbe.exe'),['--modern-window',handle,String(p.x),String(p.y)],{windowsHide:true,encoding:'utf8',timeout:2500});
        const hit=JSON.parse(stdout.replace(/^\uFEFF/,''));assert(hit,'UIA3 character '+point.index);assert(hit.query.startsWith(point.character),'UIA3 original character '+point.index);
        assert.equal(hit.query,hit.text.slice(hit.offset));
        if(point.index===3)dictionaryHit=hit;
      }
      modernView.setAlwaysOnTop(true);modernView.moveTop();
      const target=geometry.find(p=>p.index===3),nativePoint=screen.dipToScreenPoint({x:Math.round(content.x+target.x),y:Math.round(content.y+target.y)});
      const direct=await promisify(execFile)(path.resolve(__dirname,'../native/TextProbeModern.exe'),['--point',handle,String(nativePoint.x),String(nativePoint.y),'200'],{windowsHide:true,encoding:'utf8',timeout:2500});
      const directHit=JSON.parse(direct.stdout);assert(directHit&&directHit.query.startsWith('日本語'),'UIA3 actual on-screen character');
      const found=await popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify({...dictionaryHit,source:'UIA3',title:'Verifica giapponese'})})`);
      assert.equal(found.word,'日本語');results.push({name:'Testo giapponese UIA3 → carattere → Yomitan',positions:geometry.length,supplementaryCharacter:true,onScreenNativePath:true,word:found.word,provider:'UIAutomation3.TextPattern'});
    }finally{modernView.destroy();}
  }
  if(process.env.YOMIDESKTOP_OCR_REGRESSION){
    const {screen}=require('electron');const execute=require('node:util').promisify(require('node:child_process').execFile);
    const area=screen.getPrimaryDisplay().workArea;
    const raster=new BrowserWindow({show:false,frame:false,alwaysOnTop:true,skipTaskbar:true,x:area.x+40,y:area.y+60,width:700,height:260,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const cases=[];
    try{
      for(const {dark,size} of [{dark:false,size:32},{dark:true,size:32},{dark:false,size:14},{dark:true,size:14}]){
        popup.hide();
        await raster.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Verifica OCR raster</title><style>body{margin:0;overflow:hidden}</style><canvas width="700" height="260"></canvas><script>const c=document.querySelector('canvas'),g=c.getContext('2d');g.fillStyle='${dark?'#202020':'#ffffff'}';g.fillRect(0,0,700,260);g.font='${size}px Meiryo';g.textBaseline='top';g.fillStyle='${dark?'#ffffff':'#111111'}';g.fillText('昨日は日本語を勉強しました。',40,65);window.points=[3,4,5].map(i=>({i,x:40+g.measureText('昨日は日本語を勉強しました。'.slice(0,i)).width+${size/2},y:${65+size*.75}}));</script>`));
        raster.showInactive();raster.moveTop();await new Promise(r=>setTimeout(r,250));
        const points=await raster.webContents.executeJavaScript('window.points'),bounds=raster.getContentBounds();
        fs.writeFileSync(path.join(data,'ocr-raster-test.png'),(await raster.webContents.capturePage()).toPNG());
        for(const point of points){
          const p=screen.dipToScreenPoint({x:Math.round(bounds.x+point.x),y:Math.round(bounds.y+point.y)}),start=Date.now();
          const {stdout}=await execute(path.resolve(__dirname,'../native/TextProbe.exe'),['--point',String(p.x),String(p.y)],{windowsHide:true,encoding:'utf8',timeout:10000});
          const hit=JSON.parse(stdout.replace(/^\uFEFF/,''));
          if(!hit||hit.provider!=='OCR.PP-OCRv6'){const diagnostic=await execute(path.resolve(__dirname,'../native/ScreenOcr.exe'),['--point',String(p.x),String(p.y)],{windowsHide:true,encoding:'utf8',timeout:10000});throw new Error('Raster OCR hit '+JSON.stringify({point,p,bounds,diagnostic}));}
          assert.equal(hit.provider,'OCR.PP-OCRv6',JSON.stringify(hit));assert.equal(hit.capture,'window');assert.equal(hit.offset,point.i);assert(hit.text.startsWith('昨日は日本語を勉強しました'),JSON.stringify(hit));
          cases.push({dark,fontPixels:size,index:point.i,capture:hit.capture,ms:Date.now()-start});
          if(!dark&&size===14&&point.i===3){
            const raw=await execute(path.resolve(__dirname,'../native/ScreenOcr.exe'),['--screen-point',String(p.x),String(p.y)],{windowsHide:true,encoding:'utf8',timeout:10000});
            const fallback=JSON.parse(raw.stdout);assert.equal(fallback.capture,'screen');assert(fallback.query.startsWith('日本語'));cases.push({fontPixels:size,index:point.i,capture:'screen'});
          }
          if(point.i===3){
            const found=await popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify(hit)})`);assert.equal(found.word,'日本語');
            const badge=await popup.webContents.executeJavaScript('(()=>{const e=document.getElementById("desktop-ocr"),s=getComputedStyle(e),r=e.getBoundingClientRect();return {hidden:e.hidden,display:s.display,visibility:s.visibility,x:r.x,y:r.y,width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight}}})()');
            assert(!badge.hidden&&badge.width>0&&badge.x>=0&&badge.y>=0&&badge.y+badge.height<=badge.viewport.height,'OCR badge '+JSON.stringify(badge));
            const note=await popup.webContents.executeJavaScript('window.yomiDesktop.anki.getLogData(window.yomiDesktop.display.dictionaryEntries[0]).then(x=>x.ankiNotes[0])');assert.equal(note.note.fields['Word Meaning'],'');
          }
        }
      }
      fs.writeFileSync(path.join(data,'ocr-verifica.png'),(await popup.webContents.capturePage()).toPNG());
      await popup.webContents.executeJavaScript(`window.yomiDesktop.lookup(${JSON.stringify(payload)})`);assert(await popup.webContents.executeJavaScript('document.getElementById("desktop-ocr").hidden'),'Badge must disappear for direct text');
      results.push({name:'Schermo raster → fallback OCR automatico → Yomitan → carta Anki',provider:'OCR.PP-OCRv6',positions:cases.length,cases,word:'日本語',manualMeaning:true,indicator:true,local:true});
    }finally{raster.destroy();popup.hide();}
  }
  if(process.env.YOMIDESKTOP_VIDEO_FIXTURE)results.push(await require('./live-vlc.cjs').run({root,data,popup}));
  if(process.env.YOMIDESKTOP_ASS_FIXTURE){await new Promise(r=>setTimeout(r,200));results.push(await require('./live-vlc.cjs').run({root,data,popup,subtitle:process.env.YOMIDESKTOP_ASS_FIXTURE}));}
  if(mainWindow)fs.writeFileSync(path.join(data,'interfaccia-verifica.png'),(await mainWindow.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(data,'integration-results.json'),JSON.stringify({ok:true,results},null,2));
};
