// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path = require('node:path');
function clamp(n,min,max){return Math.min(Math.max(n,min),Math.max(min,max));}
function placePopup(anchor,size,area){
  const width=Math.min(size.width,area.width),height=Math.min(size.height,area.height);
  let x=anchor.x,y=anchor.y+anchor.height+10;
  if(y+height>area.y+area.height)y=anchor.y-height-10;
  return {x:Math.round(clamp(x,area.x,area.x+area.width-width)),y:Math.round(clamp(y,area.y,area.y+area.height-height)),width,height};
}
function validateSource(input,scanLength=16){
  if(!input||typeof input.text!=='string'||!Number.isInteger(input.offset)||input.offset<0||input.offset>=input.text.length)return null;
  if(input.text.length>10000)return null;
  const text=input.text.replace(/\u0000/g,'');
  const query=Array.from(text.slice(input.offset)).slice(0,scanLength).join('');
  if(!query||/^\s/u.test(query)||!/[\p{L}\p{N}]/u.test(Array.from(query)[0]))return null;
  return {...input,text,query};
}
function contained(p,r){return p.x>=r.x&&p.x<r.x+r.width&&p.y>=r.y&&p.y<r.y+r.height;}
function localAnkiUrl(value){
  const u=new URL(value);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password)throw new Error('AnkiConnect deve essere un indirizzo HTTP locale.');return u.href;
}
function safeInside(root,file){const p=path.resolve(root,file);if(p!==root&&!p.startsWith(path.resolve(root)+path.sep))throw new Error('Percorso non valido');return p;}
const scanKeys = {
  '': {code: 0, label: ''},
  shift: {code: 0x10, label: 'Shift'},
  ctrl: {code: 0x11, label: 'Ctrl'},
  alt: {code: 0x12, label: 'Alt'},
  meta: {code: 0x5b, label: 'Windows'},
};
function desktopScanKey(inputs) {
  const split = (value) => (value ?? '').trim().toLowerCase().split(/[,;\s]+/).filter(Boolean);
  for (const {include, exclude, types} of inputs ?? []) {
    if (!types?.mouse || split(exclude).join(' ') !== 'mouse0') continue;
    const name = split(include).join(' ');
    if (Object.hasOwn(scanKeys, name)) return scanKeys[name];
  }
  return scanKeys.shift;
}
module.exports={clamp,placePopup,validateSource,contained,localAnkiUrl,safeInside,desktopScanKey};
