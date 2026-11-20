'use strict';
const $=id=>document.getElementById(id);const host=window.desktopHost;
const steps=[...document.querySelectorAll('.step')];const pills=[...document.querySelectorAll('.steps li')];
let current=0,info=null,busy=false,ankiConnected=false;
const keyLabel={shift:'Shift',ctrl:'Ctrl',alt:'Alt'};

function show(index){
  current=index;steps.forEach((s,i)=>{s.hidden=i!==index;});
  pills.forEach((p,i)=>{p.classList.toggle('current',i===index-1);p.classList.toggle('done',i<index-1);});
  $('back').hidden=index===0;$('skip').hidden=index!==3;
  $('next').textContent=index===0?'Avanti':index===2?'Installa e continua':index===3?'Prepara le carte':index===4?'Fine':'Avanti';
  $('nav-note').textContent='';
  if(index===2){renderDictionaries();if(info?.engineReady)loadInfo().then(()=>{if(current===2&&!busy)renderDictionaries();}).catch(()=>{});}
  if(index===4)$('final-key').textContent=keyLabel[selectedKey()]||'Shift';
  steps[index].querySelector('input,button')?.focus();
}
function setBusy(value,note=''){busy=value;$('next').disabled=value;$('back').disabled=value;$('skip').disabled=value;$('nav-note').textContent=note;}
const selectedKey=()=>document.querySelector('input[name=key]:checked')?.value||'shift';

async function loadInfo(){
  info=await host.command('setup-info');
  const radio=document.querySelector(`input[name=key][value="${info.scanKey||'shift'}"]`);if(radio)radio.checked=true;
  $('anki-deck').value=info.ankiDeck||'Yomitan';$('anki-meaning').checked=info.ankiAutoMeaning;$('autostart').checked=true;
  return info;
}
async function waitForEngine(){
  while(!info.engineReady){$('dict-total').textContent='Avvio del motore dei dizionari…';await new Promise(r=>setTimeout(r,700));await loadInfo();}
}
function renderDictionaries(){
  if(!info)return;
  $('dict-list').replaceChildren(...info.dictionaries.map(d=>{
    const li=document.createElement('li');const label=document.createElement('label');
    const box=document.createElement('input');box.type='checkbox';box.value=d.id;box.checked=!d.installed;box.disabled=d.installed;box.dataset.id=d.id;
    const text=document.createElement('span');text.textContent=d.title;const small=document.createElement('small');small.textContent=d.about;text.append(small);
    const tag=document.createElement('span');tag.className='tag';tag.id='tag-'+d.id;tag.textContent=d.installed?'✓ già presente':d.size;tag.title=d.kind;if(d.installed)tag.classList.add('ok');
    label.append(box,text,tag);li.append(label);return li;
  }));
  const pending=info.dictionaries.filter(d=>!d.installed).length;
  $('dict-total').textContent=pending?'Togli la spunta a quelli che non vuoi. Ci vogliono alcuni minuti.':'Hai già tutti i dizionari consigliati.';
}
async function installDictionaries(){
  await waitForEngine();
  const ids=[...document.querySelectorAll('#dict-list input:checked:not(:disabled)')].map(b=>b.value);
  if(!ids.length)return true;
  setBusy(true,'Non chiudere la finestra');$('dict-progress').hidden=false;$('dict-bar').max=ids.length;$('dict-bar').value=0;
  try{
    const results=await host.command('install-dictionaries',{ids});
    for(const r of results){const tag=$('tag-'+r.id);if(tag){tag.textContent=r.ok?'✓ installato':'✕ non riuscito';tag.className='tag '+(r.ok?'ok':'err');tag.title=r.message||'';}}
    await loadInfo();
    const failed=results.filter(r=>!r.ok);$('dict-bar').value=ids.length;
    if(failed.length){$('dict-status').textContent=`${failed.length} non installati (controlla la connessione). Premi di nuovo per riprovare, oppure vai avanti.`;$('dict-status').className='bad';return false;}
    $('dict-status').textContent='Dizionari installati.';$('dict-status').className='good';return true;
  }catch(e){$('dict-status').textContent=e.message;$('dict-status').className='bad';return false;}
  finally{setBusy(false);}
}
async function checkAnki(){
  $('anki-check-result').textContent='Controllo…';$('anki-check-result').className='';
  const r=await host.command('anki-test',{server:info?.ankiServer});
  ankiConnected=r.ok!==false;
  $('anki-check-result').textContent=ankiConnected?'✓ Anki è collegato':'✕ Anki non risponde: è aperto? AnkiConnect è installato?';
  $('anki-check-result').className=ankiConnected?'good':'bad';return ankiConnected;
}
async function prepareAnki(){
  setBusy(true);$('anki-result').textContent='Preparazione…';$('anki-result').className='hint';
  try{
    if(!ankiConnected&&!(await checkAnki())){$('anki-result').textContent='Prima collega Anki (passi 1-3), oppure premi Salta.';$('anki-result').className='hint bad';return false;}
    const r=await host.command('anki-prepare',{server:info?.ankiServer,deck:$('anki-deck').value,setup:true,autoMeaning:$('anki-meaning').checked});
    if(r?.ok===false)throw new Error(r.message);
    $('anki-result').textContent=`✓ Mazzo "${r.deck}" pronto. Nel popup premi + per creare una carta.`;$('anki-result').className='hint good';return true;
  }catch(e){$('anki-result').textContent=e.message;$('anki-result').className='hint bad';return false;}
  finally{setBusy(false);}
}

$('next').onclick=async()=>{
  if(busy)return;
  if(current===1){setBusy(true);try{await host.command('set-key',{key:selectedKey()});}finally{setBusy(false);}}
  if(current===2&&!(await installDictionaries()))return;
  if(current===3&&!(await prepareAnki()))return;
  if(current===4){setBusy(true);await host.command('finish-setup',{startAtLogin:$('autostart').checked});return;}
  show(current+1);
};
$('back').onclick=()=>{if(!busy&&current>0)show(current-1);};
$('skip').onclick=()=>{if(!busy)show(4);};
$('anki-check').onclick=()=>checkAnki();
$('copy-code').onclick=async()=>{try{await navigator.clipboard.writeText('2055492159');$('copy-code').textContent='Copiato ✓';}catch{$('copy-code').textContent='Selezionalo e copialo';}};
document.querySelectorAll('[data-link]').forEach(b=>{b.onclick=()=>host.command('open-link',{id:b.dataset.link});});
host.onStatus(s=>{const p=s.setupProgress;if(p&&current===2){$('dict-bar').value=p.index;$('dict-status').className='';$('dict-status').textContent=`Scarico e installo ${p.title} (${p.index+1} di ${p.total})…`;}});
loadInfo().then(()=>show(0)).catch(()=>show(0));
