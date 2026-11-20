// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {localAnkiUrl}=require('./core.cjs');
// Card settings copied verbatim from Yomitan on Firefox (deck, note type, fields, tags, duplicates).
const firefoxAnki=require('./firefox-anki.json');
const mainFormat=firefoxAnki.cardFormats.find(f=>f.model)||firefoxAnki.cardFormats[0];
const modelName=mainFormat.model;
// Only difference from Firefox: show frequency and source in the visible "Notes" field of new cards.
const extraFields={Notes:'Frequenza {frequency-harmonic-rank} · Fonte: {document-title}'};
const fieldMarkers=Object.fromEntries(Object.entries(mainFormat.fields).map(([field,{value}])=>[field,value]));
async function call(server,apiKey,action,params={},fetcher=fetch){
  const response=await fetcher(localAnkiUrl(server),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:6,...(apiKey?{key:apiKey}:{}),params}),signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw new Error(`AnkiConnect: HTTP ${response.status}`);
  const body=await response.json();if(!body||!Object.hasOwn(body,'error')||!Object.hasOwn(body,'result'))throw new Error('Risposta AnkiConnect non valida');if(body.error)throw new Error(String(body.error));return body.result;
}
// Never creates or changes note types: it only checks the Firefox one exists and creates the deck if missing.
async function prepare(server,key,deck=mainFormat.deck,fetcher=fetch){
  const invoke=(a,p)=>call(server,key,a,p,fetcher);
  const version=await invoke('version');if(version<6)throw new Error('È richiesto AnkiConnect versione 6.');
  const models=await invoke('modelNames');
  if(!models.includes(modelName))throw new Error(`In Anki manca il tipo di nota "${modelName}" usato da Yomitan su Firefox.`);
  const fields=await invoke('modelFieldNames',{modelName});
  if(Object.keys(fieldMarkers).some(f=>!fields.includes(f)))throw new Error(`Il tipo di nota "${modelName}" in Anki ha campi diversi da quelli di Yomitan su Firefox.`);
  await invoke('createDeck',{deck});return {model:modelName,deck,version};
}
function applyMapping(options,server,key,deck){
  const copy=structuredClone(firefoxAnki);
  for(const format of copy.cardFormats)if(format.model){
    if(deck)format.deck=deck;
    for(const [field,value] of Object.entries(extraFields))if(format.fields[field])format.fields[field].value=value;
  }
  for(const profile of options.profiles){
    const p=profile.options;
    p.anki={...p.anki,...copy,enable:true,server:localAnkiUrl(server),apiKey:key};
  }
  return options;
}
module.exports={call,prepare,applyMapping,modelName,fieldMarkers,firefoxAnki,extraFields};
