// Text buffer adapter for Yomitan's original sentence extraction algorithm.
import {TextSourceGenerator} from '../js/dom/text-source-generator.js';
class BufferSource{
  constructor(chars,start,end){this.chars=chars;this.start=start;this.end=end;}
  clone(){return new BufferSource(this.chars,this.start,this.end);}
  setStartOffset(count){const old=this.start;this.start=Math.max(0,this.start-count);return old-this.start;}
  setEndOffset(count,fromEnd){const old=this.end;this.end=Math.min(this.chars.length,(fromEnd?this.end:this.start)+count);return this.end-old;}
  text(){return this.chars.slice(this.start,this.end).join('');}
}
export function extractSentence(payload,length,options){
  const {scanExtent,terminationCharacterMode,terminationCharacters}=options;
  const terminators=new Map(),forward=new Map(),backward=new Map();
  if(terminationCharacterMode==='custom'||terminationCharacterMode==='custom-no-newlines')for(const item of terminationCharacters){if(!item.enabled)continue;const {character1:a,character2:b,includeCharacterAtStart:start,includeCharacterAtEnd:end}=item;if(b===null)terminators.set(a,[start,end]);else{forward.set(a,[b,start]);backward.set(b,[a,end]);}}
  const chars=Array.from(payload.text),offset=Array.from(payload.text.slice(0,payload.offset)).length;
  const source=new BufferSource(chars,offset,offset+Array.from(payload.query.slice(0,length)).length);
  return new TextSourceGenerator().extractSentence(source,false,scanExtent,!['none','custom-no-newlines'].includes(terminationCharacterMode),terminators,forward,backward);
}
