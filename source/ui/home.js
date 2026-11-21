'use strict';
const $=id=>document.getElementById(id);const host=window.desktopHost;
let t=I18N.translator('en'),language='en',last=null;
function setLanguage(next){
  language=I18N.strings[next]?next:'en';t=I18N.translator(language);document.documentElement.lang=language;
  I18N.apply(document,t);$('language').value=language;if(last)update(last);
}
function update(s){
  last=s;
  if(s.language&&s.language!==language){setLanguage(s.language);return;}
  if(s.scanKeyLabel)$('key-label').textContent=s.scanKeyLabel;
  $('note-close').textContent=t('note.close',{key:s.scanKeyLabel||$('key-label').textContent});
  const loaded=Boolean(s.dictionariesLoaded||s.error);
  $('loading').classList.toggle('done',loaded);$('loading-text').textContent=t(s.total?'loading.import':'loading');
  $('progress').hidden=!s.total||s.imported>=s.total;$('progress').max=s.total||1;$('progress').value=s.imported;
  // The ready message is already the big title: the status line only shows problems or news.
  $('status').textContent=s.error||!s.ready?s.phase:'';$('status').classList.toggle('error',Boolean(s.error));
  $('toggle').checked=Boolean(s.enabled);$('toggle-label').textContent=t(s.enabled?'on':'paused');document.body.classList.toggle('paused',!s.enabled);
  $('dictionary-count').textContent=s.dictionaries.length||'—';
  $('dict-description').textContent=s.dictionaries.length?t('dict.count',{n:s.dictionaries.length}):t(s.dictionariesLoaded?'dict.none':'dict.loading');
  $('dictionaries').replaceChildren(...s.dictionaries.map(d=>{const li=document.createElement('li');li.textContent=d.title;return li;}));
  $('anki-state').textContent=s.anki;$('ocr-state').textContent=s.ocr||t('ocr.preparing');
}
$('language').replaceChildren(...Object.entries(I18N.languages).map(([code,name])=>new Option(name,code)));
setLanguage('en');
host.onStatus(update);
host.command('status').then(s=>{update(s);$('anki-server').value=s.preferences.ankiServer;$('anki-deck').value=s.preferences.ankiDeck;$('autostart').checked=s.preferences.startAtLogin;$('ocr-toggle').checked=s.preferences.ocrEnabled!==false;});
$('language').onchange=()=>host.command('set-language',{language:$('language').value});
$('toggle').onchange=()=>host.command('toggle',{enabled:$('toggle').checked});
const closeKeyMenu=()=>{$('key-menu').hidden=true;$('key-capture').hidden=true;removeEventListener('keydown',captureKey,true);removeEventListener('mousedown',captureMouse,true);};
$('key-label').onclick=()=>{if($('key-menu').hidden)$('key-menu').hidden=false;else closeKeyMenu();};
for(const b of document.querySelectorAll('#key-menu button[data-key]'))b.onclick=async()=>{await host.command('set-key',{key:b.dataset.key}).catch(()=>{});closeKeyMenu();};
const keyNames={en:{' ':'Space',CapsLock:'Caps Lock',Enter:'Enter',Delete:'Del',End:'End',PageUp:'Page ↑',PageDown:'Page ↓'},it:{' ':'Spazio',CapsLock:'Bloc Maiusc',Enter:'Invio',Delete:'Canc',End:'Fine',PageUp:'Pag ↑',PageDown:'Pag ↓'}};
const commonKeys={Tab:'Tab',Backspace:'Backspace',Insert:'Ins',Home:'Home',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ContextMenu:'Menu',Meta:'Windows'};
function captureKey(e){
  e.preventDefault();e.stopPropagation();
  if(e.key==='Escape'){closeKeyMenu();return;}
  const label=keyNames[language][e.key]||commonKeys[e.key]||(e.key.length===1?e.key.toUpperCase():e.key);
  host.command('set-key',{key:'custom',code:e.keyCode,label}).catch(()=>{}).finally(closeKeyMenu);
}
// Middle and side mouse buttons (Windows codes 4, 5, 6).
const mouseButtons={1:[0x04,'mouse.middle'],3:[0x05,'mouse.back'],4:[0x06,'mouse.forward']};
function captureMouse(e){
  const button=mouseButtons[e.button];if(!button)return;
  e.preventDefault();e.stopPropagation();
  host.command('set-key',{key:'custom',code:button[0],label:t(button[1])}).catch(()=>{}).finally(closeKeyMenu);
}
$('custom-key').onclick=()=>{$('key-capture').hidden=false;$('custom-key').blur();addEventListener('keydown',captureKey,true);addEventListener('mousedown',captureMouse,true);};
$('wizard').onclick=()=>host.command('open-setup');$('perapera').onclick=()=>host.command('open-link',{id:'perapera'});$('settings').onclick=()=>host.command('settings');
$('autostart').onchange=()=>host.command('start-at-login',{enabled:$('autostart').checked});
$('ocr-toggle').onchange=()=>host.command('ocr-toggle',{enabled:$('ocr-toggle').checked});
for(const [id,action] of [['anki-test','anki-test'],['anki-prepare','anki-prepare']])$(id).onclick=async()=>{const b=$(id);b.disabled=true;$('anki-result').textContent=t('anki.connecting');try{const r=await host.command(action,{server:$('anki-server').value,key:$('anki-key').value,deck:$('anki-deck').value});$('anki-result').textContent=r.ok===false?r.message:t(action==='anki-test'?'anki.answers':'anki.ready');}catch(e){$('anki-result').textContent=e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/,'');}finally{b.disabled=false;}};
