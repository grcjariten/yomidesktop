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
// Starter note type for new users who don't have the Firefox one: same field names, simple card.
const starterModel='YomiDesktop';
const starterCss='.card{font-family:"Yu Gothic","Meiryo",sans-serif;font-size:22px;text-align:center;color:#20232b;background:#fafaf8}.word{font-size:56px;margin:24px 0}.reading{color:#6b7280}.meaning{margin:18px auto;max-width:640px;text-align:left;font-size:18px}.sentence{margin-top:22px;font-size:24px}.small{font-size:14px;color:#8a8f99;margin-top:18px}';
const starterFront='<div class="word">{{Word}}</div>';
const starterBack='<div class="word">{{furigana:Word Furigana}}</div>{{Word Audio}}<div class="meaning">{{Word Meaning}}</div><div class="sentence">{{furigana:Sentence Furigana}}</div><div>{{Sentence Meaning}}</div><div class="small">{{Pitch Accent}}</div><div class="small">{{Notes}}</div>';
// Never changes existing note types. Without the Firefox one it uses (or, if allowed, creates) the starter one.
async function prepare(server,key,deck=mainFormat.deck,fetcher=fetch,{createModel=false}={}){
  const invoke=(a,p)=>call(server,key,a,p,fetcher);
  const version=await invoke('version');if(version<6)throw new Error('È richiesto AnkiConnect versione 6.');
  const models=await invoke('modelNames');
  let model=modelName;
  if(!models.includes(modelName)){
    model=starterModel;
    if(!models.includes(starterModel)){
      if(!createModel)throw new Error(`In Anki manca il tipo di nota "${modelName}" usato da Yomitan su Firefox.`);
      await invoke('createModel',{modelName:starterModel,inOrderFields:Object.keys(fieldMarkers),css:starterCss,isCloze:false,cardTemplates:[{Name:'Riconoscimento',Front:starterFront,Back:starterBack}]});
    }
  }
  const fields=await invoke('modelFieldNames',{modelName:model});
  if(Object.keys(fieldMarkers).some(f=>!fields.includes(f)))throw new Error(`Il tipo di nota "${model}" in Anki ha campi diversi da quelli previsti.`);
  await invoke('createDeck',{deck});return {model,deck,version};
}
function applyMapping(options,server,key,deck,{model,autoMeaning=false}={}){
  const copy=structuredClone(firefoxAnki);
  for(const format of copy.cardFormats)if(format.model){
    if(deck)format.deck=deck;
    if(model)format.model=model;
    if(autoMeaning&&format.fields['Word Meaning'])format.fields['Word Meaning'].value='{glossary-first}';
    for(const [field,value] of Object.entries(extraFields))if(format.fields[field])format.fields[field].value=value;
  }
  for(const profile of options.profiles){
    const p=profile.options;
    p.anki={...p.anki,...copy,enable:true,server:localAnkiUrl(server),apiKey:key};
  }
  return options;
}
module.exports={call,prepare,applyMapping,modelName,starterModel,fieldMarkers,firefoxAnki,extraFields};
