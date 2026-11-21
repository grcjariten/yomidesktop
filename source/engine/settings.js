// SPDX-License-Identifier: GPL-3.0-or-later
// YomiDesktop options page: the Yomitan settings page with the desktop app's name.
// Only visible text changes; the credit page (info.html) and links to the Yomitan wiki keep the original name.
const skip=node=>node.parentElement?.closest('a[href^="http"],a[href="/info.html"],script,style,code');
function rename(root){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeValue.includes('Yomitan')&&!skip(n)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const n of nodes)n.nodeValue=n.nodeValue.replaceAll('Yomitan','YomiDesktop');
}
document.title='YomiDesktop';
rename(document.body);
new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes){if(n.nodeType===Node.TEXT_NODE){if(n.nodeValue.includes('Yomitan')&&!skip(n))n.nodeValue=n.nodeValue.replaceAll('Yomitan','YomiDesktop');}else if(n.nodeType===Node.ELEMENT_NODE)rename(n);}}).observe(document.body,{childList:true,subtree:true});
// A .zip dropped anywhere on the page is installed as a dictionary, as if dropped on Yomitan's small drop box
// (otherwise the window would try to save the file). Yomitan's own box keeps handling its drops.
addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
addEventListener('drop',e=>{
  if(e.defaultPrevented||!e.dataTransfer?.files.length)return;
  e.preventDefault();
  const zips=[...e.dataTransfer.files].filter(f=>/\.zip$/i.test(f.name));const input=document.querySelector('#dictionary-import-file-input');
  if(!zips.length||!input||input.disabled)return;
  document.querySelector('.settings-item[data-modal-action="show,dictionaries"]')?.click();// shows the dictionary list and its progress bar
  const files=new DataTransfer();for(const f of zips)files.items.add(f);input.files=files.files;input.dispatchEvent(new Event('change'));
});
