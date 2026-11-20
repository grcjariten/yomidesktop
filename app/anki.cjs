// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {localAnkiUrl}=require('./core.cjs');
const modelName='YomiDesktop · Japanese';
const fieldMarkers={Word:'{expression}',Reading:'{reading}',Furigana:'{furigana}',Definition:'',Sentence:'{sentence}',SentenceFurigana:'{sentence-furigana}',Audio:'{audio}',PitchAccent:'{pitch-accents}',Frequency:'{frequency-harmonic-rank}',Source:'{document-title}',URL:'{url}'};
const css = `
.card {
  font-family: "Yu Gothic", Meiryo, sans-serif;
  font-size: 20px;
  line-height: 1.6;
  text-align: center;
  padding: 20px;
}
.word { font-size: 40px; }
.context { font-size: 23px; margin: 12px 0; }
.reading { font-size: 17px; opacity: .8; }
.meaning { max-width: 42em; margin: 16px auto; }
.meta { font-size: 13px; opacity: .7; margin-top: 18px; overflow-wrap: anywhere; }
ruby rt { font-size: .5em; }
hr { border: 0; border-top: 1px solid currentColor; opacity: .2; margin: 18px auto; max-width: 42em; }
img { max-width: 100%; height: auto; }
ol, ul { text-align: left; }
`;
const front = `<div class="word">{{Word}}</div>`;
const back=`<div class="word">{{furigana:Furigana}}</div><div class="reading">{{Reading}} {{Audio}}</div>{{#SentenceFurigana}}<div class="context">{{furigana:SentenceFurigana}}</div>{{/SentenceFurigana}}<hr><div class="meaning">{{Definition}}</div>{{#PitchAccent}}<div>{{PitchAccent}}</div>{{/PitchAccent}}{{#Frequency}}<div class="meta">Frequency: {{Frequency}}</div>{{/Frequency}}{{#Source}}<div class="meta">{{Source}}</div>{{/Source}}`;
async function call(server,apiKey,action,params={},fetcher=fetch){
  const response=await fetcher(localAnkiUrl(server),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:6,...(apiKey?{key:apiKey}:{}),params}),signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw new Error(`AnkiConnect: HTTP ${response.status}`);
  const body=await response.json();if(!body||!Object.hasOwn(body,'error')||!Object.hasOwn(body,'result'))throw new Error('Invalid AnkiConnect response');if(body.error)throw new Error(String(body.error));return body.result;
}
async function prepare(server,key,deck='YomiDesktop',fetcher=fetch){
  const invoke=(a,p)=>call(server,key,a,p,fetcher);
  const version=await invoke('version');if(version<6)throw new Error('AnkiConnect version 6 is required.');
  const models=await invoke('modelNames');
  if(!models.includes(modelName))await invoke('createModel',{modelName,inOrderFields:Object.keys(fieldMarkers),css,isCloze:false,cardTemplates:[{Name:'Recognition',Front:front,Back:back}]});
  else {const fields=await invoke('modelFieldNames',{modelName});if(Object.keys(fieldMarkers).some(f=>!fields.includes(f)))throw new Error('The existing YomiDesktop note type has different fields. Choose a compatible note type in Yomitan engine settings.');}
  await invoke('createDeck',{deck});return {model:modelName,deck,version};
}
function applyMapping(options,server,key,deck,includeDefinition=true){
  const p=options.profiles[options.profileCurrent].options;
  p.anki.enable=true;p.anki.server=localAnkiUrl(server);p.anki.apiKey=key;p.anki.tags=['YomiDesktop'];p.anki.duplicateBehavior='prevent';p.anki.duplicateScope='collection';p.anki.checkForDuplicates=true;
  const markers={...fieldMarkers,Definition:includeDefinition?'{glossary}':''};
  const starter={name:'Recognition',icon:'big-circle',deck,model:modelName,fields:Object.fromEntries(Object.entries(markers).map(([field,value])=>[field,{value,overwriteMode:'coalesce'}])),type:'term'};
  p.anki.cardFormats=[starter,...(p.anki.cardFormats||[]).filter(format=>format.model!==modelName||format.name!==starter.name)];
  return options;
}
module.exports={call,prepare,applyMapping,modelName,fieldMarkers,css,front,back};
