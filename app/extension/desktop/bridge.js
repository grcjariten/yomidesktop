import {Application} from '../js/application.js';
import {DictionaryDatabase} from '../js/dictionary/dictionary-database.js';
import {OptionsUtil} from '../js/data/options-util.js';
await Application.main(true,async(application)=>{
  const database=new DictionaryDatabase();await database.prepare();
  const optionsUtil=new OptionsUtil();await optionsUtil.prepare();
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('dict',60);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  window.yomiBridge={
    options:()=>application.api.optionsGetFull(),
    setOptions:async(o)=>{const clean=await optionsUtil.update(o);await application.api.setAllSettings(clean,'desktop');return clean;},
    dictionaries:()=>application.api.getDictionaryInfo(),
    counts:async()=>{const names=Array.from(db.objectStoreNames);const counts={};for(const name of names){counts[name]=await new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).count();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}return counts;},
    notify:()=>application.api.triggerDatabaseUpdated('import','desktop'),
    terms:(text)=>application.api.termsFind(text,{}, {current:true}),
    kanji:(text)=>application.api.kanjiFind(text,{current:true}),
  };
  document.documentElement.dataset.ready='true';
  let syncTimer;
  const sync=()=>{clearTimeout(syncTimer);syncTimer=setTimeout(()=>window.desktopHost.command('engine-sync').catch(()=>{}),150);};
  application.on('optionsUpdated',sync);application.on('databaseUpdated',sync);
});
