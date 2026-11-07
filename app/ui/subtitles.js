'use strict';
const root=document.getElementById('subtitles');let previous='';let packets=[];
function color(value){return '#'+(Number(value)&0xffffff).toString(16).padStart(6,'0');}
function render(){
  const key=JSON.stringify([innerWidth,innerHeight,packets.map(p=>[p.id,p.regions,p.font,p.fontSize,p.relativeSize,p.width,p.height])]);if(key===previous)return;previous=key;
  const elements=[];
  for(const packet of packets){
    const scale=Math.min(innerWidth/packet.width,innerHeight/packet.height);const videoWidth=packet.width*scale,videoHeight=packet.height*scale;const dx=(innerWidth-videoWidth)/2,dy=(innerHeight-videoHeight)/2;
    for(const region of packet.regions){
      const node=document.createElement('div');node.className='subtitle';node.dataset.title=packet.title;
      const baseSize=packet.fontSize>0?packet.fontSize*scale:videoHeight/(packet.relativeSize||16);
      node.style.fontSize=baseSize+'px';if(packet.font)node.style.fontFamily=JSON.stringify(packet.font)+',"Yu Gothic","Meiryo",sans-serif';node.style.fontWeight=packet.bold?'700':'400';node.style.color=color(packet.color??0xffffff);
      const rx=region.x*scale,ry=region.y*scale;
      const align=region.align;
      if(region.absolute){node.style.left=(dx+rx)+'px';node.style.top=(dy+ry)+'px';node.style.maxWidth=Math.max(20,videoWidth-rx-10)+'px';}
      else{
        if(align&1)node.style.left=(dx+rx)+'px';else if(align&2)node.style.right=(dx+rx)+'px';else{node.style.left=(dx+videoWidth/2+rx)+'px';node.style.transform='translateX(-50%)';}
        if(align&4)node.style.top=(dy+ry)+'px';else if(align&8)node.style.bottom=(dy+ry)+'px';else{node.style.top=(dy+videoHeight/2+ry)+'px';node.style.transform=(node.style.transform+' translateY(-50%)').trim();}
        node.style.maxWidth=Math.max(20,videoWidth-Math.abs(rx)*2-20)+'px';
      }
      if(region.textAlign&1)node.style.textAlign='left';else if(region.textAlign&2)node.style.textAlign='right';
      for(const segment of region.segments){const span=document.createElement('span');span.textContent=segment.text;const s=segment.style;
        if(s){if(s.font)span.style.fontFamily=JSON.stringify(s.font)+',"Yu Gothic",sans-serif';if(s.size>0)span.style.fontSize=(s.size*scale)+'px';else if(s.relativeSize>0)span.style.fontSize=(videoHeight*s.relativeSize/100)+'px';if(s.features&1)span.style.color=color(s.color);if(s.features&2)span.style.opacity=String(s.alpha/255);if(s.features&4){span.style.fontWeight=s.flags&1?'700':'400';span.style.fontStyle=s.flags&2?'italic':'normal';if(s.flags&32)span.style.textDecoration='underline';}if(s.spacing)span.style.letterSpacing=(s.spacing*scale)+'px';}
        node.appendChild(span);
      }elements.push(node);
    }
  }root.replaceChildren(...elements);
}
window.desktopHost.onSubtitle(next=>{packets=next;render();});window.addEventListener('resize',render);
function hitRect(range,x,y){return [...range.getClientRects()].find(r=>x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom);}
window.subtitleHitTest=(x,y)=>{
  const caret=document.caretRangeFromPoint(x,y);if(!caret||caret.startContainer.nodeType!==Node.TEXT_NODE)return null;
  const textNode=caret.startContainer;const parent=textNode.parentElement?.closest('.subtitle');if(!parent)return null;
  let offset=caret.startOffset;let found;
  for(const candidate of [offset,offset-1]){if(candidate<0||candidate>=textNode.length)continue;const range=document.createRange();range.setStart(textNode,candidate);range.setEnd(textNode,candidate+(textNode.textContent.codePointAt(candidate)>0xffff?2:1));const rect=hitRect(range,x,y);if(rect){offset=candidate;found=rect;break;}}
  if(!found)return null;
  const prefix=document.createRange();prefix.selectNodeContents(parent);prefix.setEnd(textNode,offset);const before=prefix.toString();const text=parent.textContent;
  return {text,offset:before.length,query:text.slice(before.length),rect:{x:found.x,y:found.y,width:found.width,height:found.height}};
};
