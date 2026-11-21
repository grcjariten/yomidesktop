// Clicks the buttons of the real popup with real mouse input and reports what happens
// (run with --self-test and YOMIDESKTOP_POPUP_BUTTONS=1). Never adds notes to Anki.
const fs=require('node:fs');const path=require('node:path');
exports.run=async({popup,bridge,data})=>{
  const out={console:[]};const page=popup.webContents;const js=c=>page.executeJavaScript(c);const wait=ms=>new Promise(r=>setTimeout(r,ms));
  page.on('console-message',(_e,d)=>out.console.push(`${d.level} ${String(d.message).slice(0,300)}`));
  const save=()=>fs.writeFileSync(path.join(data,'popup-buttons.json'),JSON.stringify(out,null,2));
  await js(`(()=>{window.__log=[];const P=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const src=String(this.src);window.__log.push('play '+src.slice(0,140));const p=P.call(this);p.then(()=>window.__log.push('playing'),e=>window.__log.push('play-error '+e.name+': '+e.message));return p;};})()`);
  const options=await bridge('options');out.audioOptions=options.profiles[options.profileCurrent].options.audio;
  popup.setBounds({x:80,y:80,width:440,height:560});popup.showInactive();
  out.lookup=await js(`window.yomiDesktop.lookup(${JSON.stringify({text:'日本語を勉強しました。',offset:0,query:'日本語を勉強しました。',source:'Test',title:'Test'})})`);
  await wait(800);
  out.buttons=await js(`[...document.querySelectorAll('button,a,[data-action],.tag,.headword-term')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({tag:e.tagName,cls:String(e.className).slice(0,60),action:e.dataset.action||'',title:(e.title||e.textContent||'').trim().slice(0,40),disabled:Boolean(e.disabled)}))`);
  save();
  const click=async(selector,button='left')=>{
    const r=await js(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if(!r)return false;const x=Math.round(r.x),y=Math.round(r.y);
    page.sendInputEvent({type:'mouseMove',x,y});page.sendInputEvent({type:'mouseDown',x,y,button,clickCount:1});page.sendInputEvent({type:'mouseUp',x,y,button,clickCount:1});return true;
  };
  const notes=()=>js(`[...document.querySelectorAll('.footer-notification')].filter(e=>e.getClientRects().length).map(e=>e.textContent.trim().slice(0,300))`);
  out.audioClick=await click('[data-action="play-audio"]');await wait(6000);
  out.audioLog=await js('window.__log');out.audioNotifications=await notes();
  fs.writeFileSync(path.join(data,'popup-buttons.png'),(await page.capturePage()).toPNG());save();
  // Audio sources: what the background can find for this word.
  out.audioInfo=await js(`(async()=>{const r=[];for(const s of ${JSON.stringify(out.audioOptions.sources||[])}){try{const list=await window.yomiDesktop.display.application.api.getTermAudioInfoList({...s,url:s.url||'',voice:s.voice||''},'日本語','にほんご',window.yomiDesktop.display.getLanguageSummary?window.yomiDesktop.display.getLanguageSummary():{});r.push({type:s.type,count:list.length,first:list[0]?.info?.url||list[0]?.info?.type||''});}catch(e){r.push({type:s.type,error:String(e.message||e)});}}return r;})()`).catch(e=>String(e));
  save();
  // Anki buttons appear once AnkiConnect answers.
  await wait(2500);
  out.ankiButtons=await js(`[...document.querySelectorAll('.action-button[data-action^="add-note"],.action-button[data-action="view-note"]')].map(e=>({action:e.dataset.action,hidden:e.hidden,disabled:e.disabled,title:e.title}))`);
  // Kanji link: opens the kanji entry inside the popup, then back to the word.
  const before=await js('window.yomiDesktop.display.dictionaryEntries.length');
  out.kanjiClick=await click('.headword-kanji-link');await wait(2500);
  out.kanjiPage=await js(`({type:window.yomiDesktop.display.contentType||document.documentElement.dataset.pageType||'',entries:window.yomiDesktop.display.dictionaryEntries.length,first:(window.yomiDesktop.display.dictionaryEntries[0]?.character||window.yomiDesktop.display.dictionaryEntries[0]?.headwords?.[0]?.term||'')})`);
  fs.writeFileSync(path.join(data,'popup-kanji.png'),(await page.capturePage()).toPNG());
  page.sendInputEvent({type:'mouseDown',x:200,y:200,button:'back',clickCount:1});page.sendInputEvent({type:'mouseUp',x:200,y:200,button:'back',clickCount:1});
  await js("window.yomiDesktop.display.history&&window.yomiDesktop.display.history.back?window.yomiDesktop.display.history.back():history.back()").catch(e=>out.backError=String(e));await wait(2000);
  out.afterBack=await js(`({entries:window.yomiDesktop.display.dictionaryEntries.length,first:window.yomiDesktop.display.dictionaryEntries[0]?.headwords?.[0]?.term||window.yomiDesktop.display.dictionaryEntries[0]?.character||''})`);
  out.before=before;
  // Audio sources menu (Shift+click on the audio button).
  await js(`(()=>{const b=document.querySelector('[data-action="play-audio"]');b.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));})()`);await wait(1500);
  out.audioMenu=await js(`[...document.querySelectorAll('.popup-menu-item')].filter(e=>e.getClientRects().length).map(e=>e.textContent.trim().slice(0,40))`);
  fs.writeFileSync(path.join(data,'popup-audio-menu.png'),(await page.capturePage()).toPNG());
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  save();
  // Real mouse click from Windows, like the user: only if the popup is really under the pointer.
  if(process.env.YOMIDESKTOP_REAL_CLICK){
    const {execFileSync}=require('node:child_process');
    await js('window.__log=[]');
    const r=await js(`(()=>{const b=document.querySelector('[data-action="play-audio"]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    const b=popup.getContentBounds();const x=Math.round(b.x+r.x),y=Math.round(b.y+r.y);
    out.realClick=execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',process.env.YOMIDESKTOP_REAL_CLICK,'-x',String(x),'-y',String(y),'-pid0',String(process.pid)],{encoding:'utf8'}).trim();
    await wait(6000);out.realAudioLog=await js('window.__log');out.realNotifications=await notes();
    out.popupVisible=popup.isVisible();save();
  }
};
