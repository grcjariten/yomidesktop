// Self-install from the extracted ZIP (run with --self-test, YOMIDESKTOP_INSTALL_SMOKE=1 and
// YOMIDESKTOP_INSTALL_TEST=<empty folder>: installs there, with shortcuts in <folder>\links and a test registry key).
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
exports.run=async({data,mainWindow})=>{
  const results=[];const step=(name,extra={})=>{results.push({name,...extra});fs.writeFileSync(path.join(data,'install-test-results.json'),JSON.stringify(results,null,2));};
  const page=mainWindow.webContents;const js=code=>page.executeJavaScript(code);const wait=ms=>new Promise(r=>setTimeout(r,ms));
  if(page.isLoading())await new Promise(r=>page.once('did-finish-load',r));
  await wait(1500);
  assert(page.getURL().endsWith('/ui/setup.html'));
  assert.equal(await js("document.getElementById('install-box').hidden"),false,'The install choice must be shown');
  assert.equal(await js("document.getElementById('next').textContent"),'Install and continue');
  fs.writeFileSync(path.join(data,'install-box.png'),(await page.capturePage()).toPNG());step('Install choice shown on the welcome page');
  await js("document.getElementById('install-app').click()");assert.equal(await js("document.getElementById('next').textContent"),'Next');
  await js("document.getElementById('install-app').click()");assert.equal(await js("document.getElementById('next').textContent"),'Install and continue');step('Unticking it turns the button back into Next');
  await js("document.getElementById('next').click()");
  const end=Date.now()+180000;let text='';
  while(Date.now()<end){text=await js("document.getElementById('install-status').textContent");if(/Installed!|failed/.test(text))break;await wait(250);}
  assert(/Installed!/.test(text),text);step('Installed',{text});
  await new Promise(()=>{});// this copy now quits and the installed one starts
};
