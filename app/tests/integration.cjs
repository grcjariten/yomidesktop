'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {BrowserWindow, screen} = require('electron');

async function until(predicate, description) {
  for (let tries = 0; tries < 120; tries++) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(description);
}

exports.run = async ({mainWindow, popup, bridge, lookup, data, setStatus}) => {
  const fixture = process.env.YOMIDESKTOP_TEST_DICTIONARY;
  assert(fixture, 'Set YOMIDESKTOP_TEST_DICTIONARY to the synthetic dictionary ZIP.');
  assert.deepEqual(await bridge('dictionaries'), [], 'Run with a fresh YOMIDESKTOP_DATA directory.');
  const home = (script) => mainWindow.webContents.executeJavaScript(script);
  await until(() => home('document.querySelector("#manage-dictionaries")?.disabled === false'), 'Home did not initialize.');
  assert.equal(await home('document.documentElement.lang'), 'en');
  await home('document.querySelector("#manage-dictionaries").click()');
  const settings = await until(
    () => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/settings.html#dictionaries')),
    'Dictionary settings did not open.',
  );
  const settingsJs = (script) => settings.webContents.executeJavaScript(script);
  await until(() => settingsJs('document.documentElement.dataset.loaded === "true"'), 'Yomitan settings did not initialize.');
  await settingsJs(`(() => {
    const input = document.querySelector('#dictionary-import-file-input');
    const bytes = Uint8Array.from(atob(${JSON.stringify(fs.readFileSync(fixture).toString('base64'))}), (char) => char.charCodeAt(0));
    const files = new DataTransfer();
    files.items.add(new File([bytes], 'demo-dictionary.zip', {type: 'application/zip'}));
    input.files = files.files;
    input.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
  await until(async () => (await bridge('dictionaries')).some(({title}) => title === 'YomiDesktop Demo'), 'ZIP import did not complete.');
  await until(() => home('document.querySelector("#dictionary-count").textContent === "1 installed"'), 'Home did not refresh.');
  settings.close();

  const found = await bridge('terms', '猫が窓辺で眠っている。');
  assert(found.dictionaryEntries.some((entry) => entry.headwords.some((word) => word.term === '猫')));
  const area = screen.getPrimaryDisplay().workArea;
  const point = screen.dipToScreenPoint({x: area.x + 70, y: area.y + 80});
  await lookup({text: '猫が窓辺で眠っている。', offset: 0, ...point, source: 'Demo', title: 'Sample reading', rect: {...point, width: 22, height: 25}});
  assert(popup.isVisible(), 'Lookup did not open the real popup.');
  assert.match(await popup.webContents.executeJavaScript('document.body.innerText'), /cat/);
  const screenshotDir = process.env.YOMIDESKTOP_TEST_SCREENSHOTS;
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, {recursive: true});
    fs.writeFileSync(path.join(screenshotDir, 'lookup.png'), (await popup.webContents.capturePage()).toPNG());
    await home('document.querySelector("#dictionary-list").open = true');
    await home('document.querySelector("#dictionary-list").open');
    fs.writeFileSync(path.join(screenshotDir, 'dashboard.png'), (await mainWindow.webContents.capturePage()).toPNG());
  }
  fs.writeFileSync(path.join(data, 'self-test.json'), JSON.stringify({cleanProfile: true, english: true, zipImport: true, desktopLookup: true}, null, 2));
};
