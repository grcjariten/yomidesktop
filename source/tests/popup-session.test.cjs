const test=require('node:test');const assert=require('node:assert/strict');
const {PopupSession}=require('../popup-session.cjs');
function setup(){
  let visible=false,timer=null,closes=0;const bounds={x:10,y:40,width:200,height:100};
  const session=new PopupSession({visible:()=>visible,bounds:()=>bounds,close:()=>{visible=false;closes++;session.reset();},schedule:fn=>{timer=fn;return fn;},cancel:id=>{if(timer===id)timer=null;}});
  return {session,bounds,get closes(){return closes;},get visible(){return visible;},open(){session.begin({x:15,y:15},{x:10,y:10,width:20,height:20});visible=true;session.shown({x:10,y:10,width:20,height:20});},tick(){const fn=timer;timer=null;fn?.();}};
}
test('moving out after releasing Shift closes popup',()=>{const t=setup();t.open();t.session.pointer({x:400,y:400});assert(t.visible);t.tick();assert(!t.visible);assert.equal(t.closes,1);});
test('pointer can cross the gap into popup and use it',()=>{const t=setup();t.open();t.session.pointer({x:15,y:35});t.session.pointer({x:15,y:50});t.tick();assert(t.visible);t.session.pointer({x:250,y:50});t.tick();assert(!t.visible);});
test('second Shift closes and ignores delayed results for that press',()=>{const t=setup();t.session.shiftDown(1);t.session.noteScan(1);t.open();t.session.shiftDown(2);t.session.noteScan(2);assert(!t.visible);assert(!t.session.accepts({gesture:2,sequence:2}));assert(!t.session.accepts({gesture:1,sequence:1}));t.session.shiftDown(3);t.session.noteScan(3);assert(t.session.accepts({gesture:3,sequence:3}));});
test('dismissal invalidates results that arrive after pointer left',()=>{const t=setup();t.session.shiftDown(1);t.session.noteScan(4);t.open();t.session.pointer({x:400,y:400});t.tick();assert(!t.session.accepts({gesture:1,sequence:4}));});
test('a reader restart resets sequence without blocking future lookups',()=>{const t=setup();t.session.noteScan(100);t.session.reset();t.session.newReader();t.session.shiftDown(1);assert(t.session.accepts({gesture:1,sequence:1}));});
test('asynchronous lookup does not overwrite a newer outside pointer position',()=>{const t=setup();t.open();t.session.pointer({x:400,y:400});t.session.begin({x:15,y:15},{x:10,y:10,width:20,height:20},true);t.tick();assert(!t.visible);});
test('OCR box rounding cannot immediately dismiss the result at its scan point',()=>{const t=setup();t.open();t.session.begin({x:15,y:15},{x:25,y:25,width:10,height:10},true);t.session.shown({x:25,y:25,width:10,height:10});t.tick();assert(t.visible);});
test('small pointer jitter and a missed OCR scan preserve the current popup',()=>{const t=setup();t.open();t.session.pointer({x:33,y:15});t.session.begin({x:33,y:15});t.session.empty();t.tick();assert(t.visible);t.session.pointer({x:400,y:400});t.tick();assert(!t.visible);});
test('an empty scan on a different word still closes the previous popup',()=>{const t=setup();t.open();t.session.pointer({x:400,y:400});t.session.begin({x:400,y:400});t.session.empty();t.tick();assert(!t.visible);});
