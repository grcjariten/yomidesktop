'use strict';
const $=id=>document.getElementById(id);const host=window.desktopHost;
const steps=[...document.querySelectorAll('.step')];const pills=[...document.querySelectorAll('.steps li')];
let current=0,info=null,busy=false,ankiConnected=false;
const keyLabel={shift:'Shift',ctrl:'Ctrl',alt:'Alt'};
let t=I18N.translator('en'),language='en';
function setLanguage(next){
  language=I18N.strings[next]?next:'en';t=I18N.translator(language);document.documentElement.lang=language;document.title=t('setup.title');
  I18N.apply(document,t);$('language').value=language;if(info)show(current);
}
$('language').replaceChildren(...Object.entries(I18N.languages).map(([code,name])=>new Option(name,code)));
$('language').onchange=async()=>{const next=$('language').value;await host.command('set-language',{language:next}).catch(()=>{});await loadInfo().catch(()=>{});setLanguage(next);};

function show(index){
  current=index;steps.forEach((s,i)=>{s.hidden=i!==index;});
  pills.forEach((p,i)=>{p.classList.toggle('current',i===index-1);p.classList.toggle('done',i<index-1);});
  $('back').hidden=index===0;$('skip').hidden=index!==3;
  $('next').textContent=t(index===2?'setup.install':index===3?'setup.prepare':index===4?'setup.finish':'setup.next');
  $('nav-note').textContent='';
  if(index===2){renderDictionaries();if(info?.engineReady)loadInfo().then(()=>{if(current===2&&!busy)renderDictionaries();}).catch(()=>{});}
  if(index===4)$('final-key').textContent=keyLabel[selectedKey()]||info?.scanKeyLabel||'Shift';
  steps[index].querySelector('input,button')?.focus();
}
function setBusy(value,note=''){busy=value;$('next').disabled=value;$('back').disabled=value;$('skip').disabled=value;$('nav-note').textContent=note;}
const selectedKey=()=>document.querySelector('input[name=key]:checked')?.value;

async function loadInfo(){
  info=await host.command('setup-info');
  const radio=document.querySelector(`input[name=key][value="${info.scanKey||'shift'}"]`);if(radio)radio.checked=true;
  $('anki-deck').value=info.ankiDeck||'Yomitan';$('anki-meaning').checked=info.ankiAutoMeaning;$('autostart').checked=true;
  return info;
}
async function waitForEngine(){
  while(!info.engineReady){$('dict-total').textContent=t('setup.dictWait');await new Promise(r=>setTimeout(r,700));await loadInfo();}
}
function renderDictionaries(){
  if(!info)return;
  $('dict-list').replaceChildren(...info.dictionaries.map(d=>{
    const li=document.createElement('li');const label=document.createElement('label');
    const box=document.createElement('input');box.type='checkbox';box.value=d.id;box.checked=!d.installed;box.disabled=d.installed;box.dataset.id=d.id;
    const text=document.createElement('span');text.textContent=d.title;const small=document.createElement('small');small.textContent=d.about;text.append(small);
    const tag=document.createElement('span');tag.className='tag';tag.id='tag-'+d.id;tag.textContent=d.installed?t('setup.dictHave'):d.size;tag.title=d.kind;if(d.installed)tag.classList.add('ok');
    label.append(box,text,tag);li.append(label);return li;
  }));
  const pending=info.dictionaries.filter(d=>!d.installed).length;
  $('dict-total').textContent=t(pending?'setup.dictPick':'setup.dictAll');
}
async function installDictionaries(){
  await waitForEngine();
  const ids=[...document.querySelectorAll('#dict-list input:checked:not(:disabled)')].map(b=>b.value);
  if(!ids.length)return true;
  $('dict-total').textContent='';setBusy(true,t('setup.dontClose'));$('dict-progress').hidden=false;$('dict-bar').max=ids.length*100;$('dict-bar').value=0;
  try{
    const results=await host.command('install-dictionaries',{ids});
    for(const r of results){const tag=$('tag-'+r.id);if(tag){tag.textContent=t(r.ok?'setup.dictOk':'setup.dictFail');tag.className='tag '+(r.ok?'ok':'err');tag.title=r.message||'';}}
    await loadInfo();
    const failed=results.filter(r=>!r.ok);$('dict-bar').value=ids.length*100;
    if(failed.length){$('dict-status').textContent=t('setup.dictSomeFailed',{n:failed.length});$('dict-status').className='bad';return false;}
    $('dict-status').textContent=t('setup.dictDone');$('dict-status').className='good';return true;
  }catch(e){$('dict-status').textContent=e.message;$('dict-status').className='bad';return false;}
  finally{setBusy(false);}
}
async function checkAnki(){
  $('anki-check-result').textContent=t('setup.checking');$('anki-check-result').className='';
  const r=await host.command('anki-test',{server:info?.ankiServer});
  ankiConnected=r.ok!==false;
  $('anki-check-result').textContent=t(ankiConnected?'setup.ankiOk':'setup.ankiNo');
  $('anki-check-result').className=ankiConnected?'good':'bad';return ankiConnected;
}
async function prepareAnki(){
  setBusy(true);$('anki-result').textContent=t('setup.preparing');$('anki-result').className='hint';
  try{
    if(!ankiConnected&&!(await checkAnki())){$('anki-result').textContent=t('setup.ankiFirst');$('anki-result').className='hint bad';return false;}
    const r=await host.command('anki-prepare',{server:info?.ankiServer,deck:$('anki-deck').value,setup:true,autoMeaning:$('anki-meaning').checked});
    if(r?.ok===false)throw new Error(r.message);
    $('anki-result').textContent=t('setup.deckReady',{deck:r.deck});$('anki-result').className='hint good';return true;
  }catch(e){$('anki-result').textContent=e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/,'');$('anki-result').className='hint bad';return false;}
  finally{setBusy(false);}
}

$('next').onclick=async()=>{
  if(busy)return;
  if(current===1&&selectedKey()){setBusy(true);try{await host.command('set-key',{key:selectedKey()});}finally{setBusy(false);}}
  if(current===2&&!(await installDictionaries()))return;
  if(current===3&&!(await prepareAnki()))return;
  if(current===4){setBusy(true);await host.command('finish-setup',{startAtLogin:$('autostart').checked});return;}
  show(current+1);
};
$('back').onclick=()=>{if(!busy&&current>0)show(current-1);};
$('skip').onclick=()=>{if(!busy)show(4);};
$('anki-check').onclick=()=>checkAnki();
$('copy-code').onclick=async()=>{try{await navigator.clipboard.writeText('2055492159');$('copy-code').textContent=t('setup.copied');}catch{$('copy-code').textContent=t('setup.copyFail');}};
document.querySelectorAll('[data-link]').forEach(b=>{b.onclick=()=>host.command('open-link',{id:b.dataset.link});});
host.onStatus(s=>{const p=s.setupProgress;if(p&&current===2){const part=p.part||0;$('dict-bar').value=Math.round((p.index+part)*100);$('dict-status').className='';$('dict-status').textContent=t(part<0.15?'setup.dictDownloading':'setup.dictProgress',{title:p.title,i:p.index+1,n:p.total,pct:Math.round(part*100)});}});
setLanguage('en');
loadInfo().then(i=>{setLanguage(i.language);show(0);}).catch(()=>show(0));
