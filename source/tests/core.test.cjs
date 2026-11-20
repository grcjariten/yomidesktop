const test=require('node:test');const assert=require('node:assert/strict');
const {placePopup,validateSource,localAnkiUrl}=require('../core.cjs');const anki=require('../anki.cjs');
test('popup remains on the target monitor, including negative coordinates',()=>{
  for(const area of [{x:0,y:0,width:1920,height:1080},{x:-1920,y:0,width:1920,height:1080},{x:0,y:-1440,width:2560,height:1440}])for(const anchor of [{x:area.x+1,y:area.y+1,width:30,height:30},{x:area.x+area.width-5,y:area.y+area.height-5,width:30,height:30}]){const p=placePopup(anchor,{width:400,height:250},area);assert(p.x>=area.x&&p.y>=area.y);assert(p.x+p.width<=area.x+area.width&&p.y+p.height<=area.y+area.height);}
});
test('the character offset is preserved and surrogate pairs are not split',()=>{const p=validateSource({text:'昨日は𠮷野に行った。',offset:3},2);assert.equal(p.query,'𠮷野');assert.equal(p.offset,3);assert.equal(validateSource({text:'abc',offset:-1}),null);assert.equal(validateSource({text:'a b',offset:1}),null);});
test('Anki connection is restricted to loopback',()=>{assert.equal(localAnkiUrl('http://127.0.0.1:8765'),'http://127.0.0.1:8765/');for(const u of ['https://example.com','http://example.com:8765','http://user:secret@localhost:8765'])assert.throws(()=>localAnkiUrl(u));});
test('Anki preparation never creates note types or notes',async()=>{
  const actions=[];const fetcher=async(_url,request)=>{const body=JSON.parse(request.body);actions.push(body);const result=body.action==='version'?6:body.action==='modelNames'?[]:null;return {ok:true,json:async()=>({result,error:null})};};
  await assert.rejects(anki.prepare('http://127.0.0.1:8765','','Parole',fetcher),/manca il tipo di nota/);assert(!actions.some(a=>['createModel','addNote','createDeck'].includes(a.action)));
});
test('existing Firefox note type is checked and never overwritten',async()=>{
  const actions=[];const fetcher=async(_url,request)=>{const b=JSON.parse(request.body);actions.push(b.action);return {ok:true,json:async()=>({result:b.action==='version'?6:b.action==='modelNames'?[anki.modelName]:b.action==='modelFieldNames'?Object.keys(anki.fieldMarkers):null,error:null})};};const r=await anki.prepare('http://localhost:8765','','Parole',fetcher);assert.equal(r.deck,'Parole');assert.equal(r.model,'Kaishi 1.5k');assert(!actions.includes('createModel'));assert(!actions.includes('updateModelTemplates'));assert(!actions.includes('addNote'));
});
test('desktop mapping copies the Firefox card settings, adding frequency and source to Notes',()=>{const options={profileCurrent:0,profiles:[{options:{dictionaries:[{name:'A'},{name:'B'}],anki:{}}}]};anki.applyMapping(options,'http://localhost:8765','','Yomitan');assert.deepEqual(options.profiles[0].options.dictionaries.map(d=>d.name),['A','B']);const a=options.profiles[0].options.anki;const {cardFormats,...rest}=anki.firefoxAnki;for(const [k,v] of Object.entries(rest))assert.deepEqual(a[k],v,k);const expected=structuredClone(cardFormats);expected[0].fields.Notes.value=anki.extraFields.Notes;assert.deepEqual(a.cardFormats,expected);assert(a.cardFormats[0].fields.Notes.value.includes('{frequency-harmonic-rank}'));assert(a.cardFormats[0].fields.Notes.value.includes('{document-title}'));assert.equal(a.cardFormats[0].model,'Kaishi 1.5k');assert.equal(a.cardFormats[0].fields['Word Meaning'].value,'');assert.equal(a.enable,true);});
test('setup wizard creates the starter note type only when asked and maps cards to it',async()=>{
  const actions=[];let created=null;const fetcher=async(_url,request)=>{const b=JSON.parse(request.body);actions.push(b.action);if(b.action==='createModel')created=b.params;const result=b.action==='version'?6:b.action==='modelNames'?(created?[created.modelName]:[]):b.action==='modelFieldNames'?created.inOrderFields:null;return {ok:true,json:async()=>({result,error:null})};};
  const r=await anki.prepare('http://127.0.0.1:8765','','Giapponese',fetcher,{createModel:true});
  assert.equal(r.model,anki.starterModel);assert.deepEqual(created.inOrderFields,Object.keys(anki.fieldMarkers));assert(actions.includes('createDeck'));assert(!actions.includes('addNote'));
  const options={profileCurrent:0,profiles:[{options:{anki:{}}}]};const mapped=anki.applyMapping(options,'http://127.0.0.1:8765','','Giapponese',{model:r.model,autoMeaning:true});
  const format=mapped.profiles[0].options.anki.cardFormats.find(f=>f.model);assert.equal(format.model,anki.starterModel);assert.equal(format.deck,'Giapponese');assert.equal(format.fields['Word Meaning'].value,'{glossary-first}');
});
test('suggested dictionaries are recognised by title, including older names',()=>{
  const {installedIds,suggestedDictionaries}=require('../setup.cjs');
  assert.equal(suggestedDictionaries.length,8);assert(suggestedDictionaries.every(d=>/^https:\/\//.test(d.url)));
  assert.deepEqual(installedIds([{title:'Jitendex.org [2026-04-04]'},{title:'JPDBv2㋕'},{title:'Youtube'},{title:'Jiten'},{title:'Jiten (Drama)'}]).sort(),['jiten','jiten-drama','jiten-youtube','jitendex','jpdb']);
});
