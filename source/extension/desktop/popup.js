// Uses Yomitan's original popup, rendering, audio and Anki implementation.
import {Application} from '../js/application.js';
import {DocumentFocusController} from '../js/dom/document-focus-controller.js';
import {HotkeyHandler} from '../js/input/hotkey-handler.js';
import {DisplayAnki} from '../js/display/display-anki.js';
import {DisplayAudio} from '../js/display/display-audio.js';
import {DisplayProfileSelection} from '../js/display/display-profile-selection.js';
import {Display} from '../js/display/display.js';
import {extractSentence} from './sentence.js';
await Application.main(true,async(application)=>{
  const focus=new DocumentFocusController();focus.prepare();
  const hotkeys=new HotkeyHandler();hotkeys.prepare(application.crossFrame);
  const display=new Display(application,'search',focus,hotkeys);await display.prepare();
  display.close=()=>window.desktopHost.closePopup();
  const audio=new DisplayAudio(display);audio.prepare();const anki=new DisplayAnki(display,audio);anki.prepare();
  const profiles=new DisplayProfileSelection(display);await profiles.prepare();
  display.setHistorySettings({clearable:true,useBrowserHistory:false});
  const ocrBadge=document.createElement('span');ocrBadge.id='desktop-ocr';ocrBadge.textContent='OCR';ocrBadge.hidden=true;
  ocrBadge.title='Text recognized locally from the screen';document.body.append(ocrBadge);
  let activeRender=null;
  const settleRender=(result,error)=>{
    if(!activeRender)return;
    const pending=activeRender;activeRender=null;clearTimeout(pending.timer);
    if(error)pending.reject(error);else pending.resolve(result);
  };
  display.on('contentUpdateComplete',()=>settleRender({stale:false}));
  const onDisplayError=display.onError.bind(display);
  display.onError=(error)=>{settleRender(null,error);onDisplayError(error);};
  let generation=0;
  window.yomiDesktop={
    display,application,audio,anki,
    lookup:async(payload)=>{
      const id=++generation;settleRender({stale:true});
      const options=await application.api.optionsGet({current:true});
      const context={current:true,url:payload.url||'desktop://'+(payload.source||'app'),depth:0};
      let {dictionaryEntries,originalTextLength}=await application.api.termsFind(payload.query,{},context);
      let type='terms';
      if(!dictionaryEntries.length&&options.scanning.inputs.some(i=>i.options.searchKanji)){
        dictionaryEntries=await application.api.kanjiFind(Array.from(payload.query)[0],context);type='kanji';originalTextLength=Array.from(payload.query)[0]?.length||0;
      }
      if(id!==generation)return {stale:true};
      if(!dictionaryEntries.length)return {count:0};
      const complete=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>settleRender(null,new Error('The popup did not finish rendering')),8000);
        activeRender={resolve,reject,timer};
      });
      const sentence=extractSentence(payload,originalTextLength,options.sentenceParsing);
      try{
        display.setContent({focus:false,historyMode:'clear',params:{type,query:payload.query,full:payload.text,offset:String(payload.offset),wildcards:'off'},state:{focusEntry:0,optionsContext:context,url:payload.url||'desktop://'+(payload.source||'app'),sentence,documentTitle:payload.title||payload.source||''},content:{dictionaryEntries}});
      }catch(error){settleRender(null,error);}
      const rendered=await complete;
      if(rendered.stale||id!==generation)return {stale:true};
      ocrBadge.hidden=payload.provider!=='OCR.PP-OCRv6';
      return {count:dictionaryEntries.length,length:originalTextLength,type,word:dictionaryEntries[0]?.headwords?.[0]?.term||dictionaryEntries[0]?.character};
    },
    summary:()=>({count:display.dictionaryEntries.length,query:display.query,text:document.querySelector('#dictionary-entries').innerText.slice(0,1000)}),
  };
  window.desktopHost.onLookup(async(payload)=>{await window.yomiDesktop.lookup(payload);});
  document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){e.preventDefault();window.desktopHost.closePopup();}});
  // Diagnostics in data/diagnostics.log: errors, audio that fails to play and popup notices.
  addEventListener('error',e=>window.desktopHost.log('popup-js-error',e.message));
  addEventListener('unhandledrejection',e=>window.desktopHost.log('popup-js-error',e.reason?.message||String(e.reason)));
  {const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const src=String(this.src).slice(0,80);const p=play.call(this);p.then(()=>{},e=>window.desktopHost.log('popup-audio','failed '+e.name+' '+e.message+' '+src));return p;};}
  new MutationObserver(()=>{for(const n of document.querySelectorAll('.footer-notification'))if(n.getClientRects().length&&n.dataset.logged!==n.textContent){n.dataset.logged=n.textContent;window.desktopHost.log('popup-notice',n.textContent.trim());}}).observe(document.body,{childList:true,subtree:true,characterData:true});
  // "View added note" (button, or a note chosen from its Shift+click menu): Anki's window must come to the front.
  document.addEventListener('click',(e)=>{const t=e.target instanceof Element?e.target:null;if(!t)return;if((t.closest('[data-action="view-note"]')&&!e.shiftKey)||t.closest('.view-note-button-popup-menu .popup-menu-item'))window.desktopHost.raiseAnki();},true);
  document.documentElement.dataset.loaded='true';window.desktopHost.ready();
});
