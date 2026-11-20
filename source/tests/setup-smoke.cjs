// End-to-end check of the setup wizard on a fresh profile (run with --self-test and YOMIDESKTOP_SETUP_TEST=1).
// Downloads real dictionaries, so it needs an internet connection. Never touches Anki.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
exports.run=async({bridge,data,mainWindow})=>{
  const results=[];const step=(name,extra={})=>{results.push({name,...extra});fs.writeFileSync(path.join(data,'setup-test-results.json'),JSON.stringify(results,null,2));};
  const page=mainWindow.webContents;
  if(page.isLoading())await new Promise(r=>page.once('did-finish-load',r));
  assert(page.getURL().endsWith('/ui/setup.html'),'Fresh profile must open the wizard: '+page.getURL());step('Il primo avvio apre la configurazione');
  const call=(name,payload)=>page.executeJavaScript(`window.desktopHost.command(${JSON.stringify(name)},${JSON.stringify(payload||{})})`);
  let info=await call('setup-info');
  assert.equal(info.dictionaries.length,8);assert(info.dictionaries.every(d=>!d.installed&&!d.url));step('Otto dizionari consigliati, nessuno installato');
  await call('set-key',{key:'ctrl'});
  const prefs=JSON.parse(fs.readFileSync(path.join(data,'preferences.json'),'utf8'));assert.equal(prefs.scanKey,'ctrl');
  const options=await bridge('options');assert(options.profiles[0].options.scanning.inputs.some(i=>i.include==='ctrl'));assert(!options.profiles[0].options.scanning.inputs.some(i=>i.include==='shift'));
  step('Tasto Ctrl salvato anche in Yomitan');
  await call('set-key',{key:'shift'});
  const started=Date.now();
  const all=info.dictionaries.map(d=>d.id);const installed=await call('install-dictionaries',{ids:all});
  assert(installed.every(r=>r.ok),JSON.stringify(installed));step('Dizionari scaricati e installati',{seconds:Math.round((Date.now()-started)/1000),installed});
  const titles=(await bridge('dictionaries')).map(d=>d.title);
  const active=(await bridge('options')).profiles[0].options.dictionaries.filter(d=>d.enabled).map(d=>d.name);
  assert.equal(titles.length,8);assert(titles.every(t=>active.includes(t)),'All imported dictionaries must be enabled');step('Dizionari attivi nel profilo',{titles});
  const found=await bridge('terms','食べました');const words=found.dictionaryEntries.flatMap(x=>x.headwords.map(h=>h.term));assert(words.includes('食べる'),words.join(','));
  const freq=found.dictionaryEntries[0].frequencies?.length||0;assert(freq>0,'Frequency dictionary must annotate results');
  const kanji=await bridge('kanji','日');assert(kanji.length>0);step('Ricerca con significato, frequenza e kanji',{words:words.slice(0,3),frequencies:freq});
  info=await call('setup-info');assert.deepEqual(info.dictionaries.filter(d=>d.installed).map(d=>d.id).sort(),[...all].sort());
  const again=await call('install-dictionaries',{ids:['kanjidic']});assert(again[0].ok);assert.equal((await bridge('dictionaries')).length,8);step('Un dizionario già presente non viene duplicato');
  assert.equal(await call('open-link',{id:'not-allowed'}),false);step('Solo i link previsti si possono aprire');
  await call('finish-setup',{startAtLogin:false});await new Promise(r=>page.once('did-finish-load',r));
  assert(page.getURL().endsWith('/ui/index.html'));assert.equal(JSON.parse(fs.readFileSync(path.join(data,'preferences.json'),'utf8')).setupDone,true);step('Fine configurazione: si apre il pannello');
};
