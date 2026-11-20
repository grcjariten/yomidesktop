import {Application} from '../js/application.js';
import {DictionaryDatabase} from '../js/dictionary/dictionary-database.js';
import {OptionsUtil} from '../js/data/options-util.js';
import {DictionaryWorker} from '../js/dictionary/dictionary-worker.js';
await Application.main(true,async(application)=>{
  const database=new DictionaryDatabase();await database.prepare();
  const optionsUtil=new OptionsUtil();await optionsUtil.prepare();
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('dict',60);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  window.yomiBridge={
    options:()=>application.api.optionsGetFull(),
    setOptions:async(o)=>{const clean=await optionsUtil.update(o);await application.api.setAllSettings(clean,'desktop');return clean;},
    dictionaries:()=>application.api.getDictionaryInfo(),
    counts:async()=>{const names=Array.from(db.objectStoreNames);const counts={};for(const name of names){counts[name]=await new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).count();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}return counts;},
    importChunk:(name,rows,base=0)=>new Promise((resolve,reject)=>{
      const tx=db.transaction(name,'readwrite');const store=tx.objectStore(name);
      tx.oncomplete=()=>resolve(rows.length);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Import interrupted'));
      for(const [index,row] of rows.entries()){if(row.content?.$arrayBuffer){const b=atob(row.content.$arrayBuffer);row.content=Uint8Array.from(b,c=>c.charCodeAt(0)).buffer;}if(store.keyPath===null)store.put(row,base+index+1);else store.put(row);}
    }),
    clear:async()=>{for(const name of Array.from(db.objectStoreNames))await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});},
    notify:()=>application.api.triggerDatabaseUpdated('import','desktop'),
    // Setup wizard: download a Yomitan dictionary and enable it, like Yomitan's own import.
    importUrl:async(url)=>{
      const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('Download failed ('+response.status+')');
      const archive=await response.arrayBuffer();
      const full=await application.api.optionsGetFull();
      const details={prefixWildcardsSupported:full.global.database.prefixWildcardsSupported,yomitanVersion:chrome.runtime.getManifest().version};
      const {result,errors}=await new DictionaryWorker().importDictionary(archive,details,()=>{});
      if(!result)throw new Error((errors||[]).map(e=>e?.message||String(e)).join('; ')||'Import failed');
      const latest=await application.api.optionsGetFull();
      for(const profile of latest.profiles){
        const o=profile.options;
        if(!o.dictionaries.some(d=>d.name===result.title))o.dictionaries.push({name:result.title,alias:result.title,enabled:true,allowSecondarySearches:false,definitionsCollapsible:'not-collapsible',partsOfSpeechFilter:true,useDeinflections:true,styles:result.styles??''});
        if(result.sequenced&&o.general.mainDictionary==='')o.general.mainDictionary=result.title;
      }
      await application.api.setAllSettings(await optionsUtil.update(latest),'desktop');
      await application.api.triggerDatabaseUpdated('dictionary','import');
      return {title:result.title};
    },
    terms:(text)=>application.api.termsFind(text,{}, {current:true}),
    kanji:(text)=>application.api.kanjiFind(text,{current:true}),
  };
  document.documentElement.dataset.ready='true';
  let syncTimer;
  const sync=()=>{clearTimeout(syncTimer);syncTimer=setTimeout(()=>window.desktopHost.command('engine-sync').catch(()=>{}),150);};
  application.on('optionsUpdated',sync);application.on('databaseUpdated',sync);
});
