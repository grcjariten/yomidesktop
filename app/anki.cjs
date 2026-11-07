// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {localAnkiUrl}=require('./core.cjs');
const modelName='YomiDesktop · Japanese';
const fieldMarkers={Word:'{expression}',Reading:'{reading}',Furigana:'{furigana}',Definition:'',Sentence:'{sentence}',SentenceFurigana:'{sentence-furigana}',Audio:'{audio}',PitchAccent:'{pitch-accents}',Frequency:'{frequency-harmonic-rank}',Source:'{document-title}',URL:'{url}'};
const css=`.card{font-family:'Yu Gothic','Meiryo',sans-serif;font-size:23px;line-height:1.65;text-align:left;color:#20232b;background:#fafaf8;max-width:800px;margin:0 auto;padding:30px 24px}.word{font-size:44px;font-weight:600;line-height:1.45}.context{font-size:24px;margin-top:22px;color:#555}.context b,.context strong{color:#246eae}.reading{font-size:19px;color:#666;margin:8px 0}.meaning{font-size:20px;margin:24px 0}.meta{font-size:14px;color:#777;margin-top:22px}ruby rt{font-size:.48em}.front ruby rt{visibility:hidden}.front ruby:hover rt{visibility:visible}img{max-width:100%;height:auto}.nightMode.card{color:#e8e9ed;background:#202126}.nightMode .context,.nightMode .reading{color:#b8bdc9}hr{border:0;border-top:1px solid #9995;margin:24px 0}ol,ul{padding-left:1.4em}.glossary-item{margin:.4em 0}a{color:#4c99d8}`;
const front=`<div class="front"><div class="word">{{Word}}</div>{{#Sentence}}<div class="context">{{Sentence}}</div>{{/Sentence}}</div>`;
const back=`<div class="word">{{furigana:Furigana}}</div><div class="reading">{{Reading}} {{Audio}}</div>{{#SentenceFurigana}}<div class="context">{{furigana:SentenceFurigana}}</div>{{/SentenceFurigana}}<hr><div class="meaning">{{Definition}}</div>{{#PitchAccent}}<div>{{PitchAccent}}</div>{{/PitchAccent}}<div class="meta">{{#Frequency}}Frequency: {{Frequency}}<br>{{/Frequency}}{{Source}}</div>`;
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
