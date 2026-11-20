'use strict';

const $ = (id) => document.getElementById(id);
const host = window.desktopHost;
const dictionarySetup = $('dictionary-setup');
let setupShown = false;

function update(status) {
  $('status').textContent = status.phase;
  $('scan-key-prompt').hidden = !status.scanKeyLabel;
  $('scan-key').textContent = status.scanKeyLabel;
  $('dismiss-hint').textContent = status.scanKeyLabel
    ? 'Press ' + status.scanKeyLabel + ' again or Esc to close the popup.'
    : 'Press Esc to close the popup.';
  $('status').classList.toggle('error', Boolean(status.error));
  $('toggle').setAttribute('aria-pressed', String(status.enabled));
  $('toggle').textContent = status.enabled ? 'Active' : 'Paused';
  $('toggle').disabled = false;
  for (const id of ['settings', 'manage-dictionaries', 'anki-prepare']) {
    $(id).disabled = !status.engineReady;
  }

  const dictionaries = status.dictionaries;
  const hasDictionaries = dictionaries.length > 0;
  if (status.engineReady && !hasDictionaries && !status.dictionarySetupDismissed && !setupShown) {
    setupShown = true;
    dictionarySetup.showModal();
  }
  $('dictionary-count').textContent = `${dictionaries.length} installed`;
  $('dict-description').textContent = hasDictionaries
    ? 'Change dictionary order and preferences in engine settings.'
    : 'Import a Yomitan-format ZIP to start looking up words.';
  $('dictionary-list').hidden = !hasDictionaries;
  $('dictionaries').replaceChildren(...dictionaries.map(({title}) => {
    const item = document.createElement('li');
    item.textContent = title;
    return item;
  }));
  $('vlc-state').textContent = status.vlc;
  $('video').disabled = !status.vlcAvailable;
  $('anki-state').textContent = status.anki;
  $('ocr-state').textContent = status.ocr || 'Checking the local OCR runtime…';
}

host.onStatus(update);
host.command('status').then((status) => {
  update(status);
  const {preferences} = status;
  $('anki-server').value = preferences.ankiServer;
  $('anki-deck').value = preferences.ankiDeck;
  $('anki-definition').checked = preferences.ankiDefinition !== false;
  $('autostart').checked = preferences.startAtLogin;
  $('ocr-toggle').checked = preferences.ocrEnabled;
});

$('toggle').onclick = () => host.command('toggle', {enabled: $('toggle').getAttribute('aria-pressed') !== 'true'});
$('settings').onclick = () => host.command('settings');
$('manage-dictionaries').onclick = () => host.command('dictionaries');
$('video').onclick = () => host.command('open-video').catch((error) => {
  $('vlc-state').textContent = error.message;
});
$('autostart').onchange = () => host.command('start-at-login', {enabled: $('autostart').checked});
$('ocr-toggle').onchange = () => host.command('ocr-toggle', {enabled: $('ocr-toggle').checked});

async function chooseDictionarySetup(choice) {
  if (await host.command('dictionary-setup', {choice})) {
    dictionarySetup.close();
  }
}

for (const button of dictionarySetup.querySelectorAll('[data-setup-choice]')) {
  button.onclick = () => chooseDictionarySetup(button.dataset.setupChoice);
}
dictionarySetup.addEventListener('cancel', (event) => {
  event.preventDefault();
  void chooseDictionarySetup('skip');
});

for (const action of ['anki-test', 'anki-prepare']) {
  const button = $(action);
  button.onclick = async () => {
    button.disabled = true;
    $('anki-result').textContent = 'Connecting to Anki…';
    try {
      const result = await host.command(action, {
        server: $('anki-server').value,
        key: $('anki-key').value,
        deck: $('anki-deck').value,
        includeDefinition: $('anki-definition').checked,
      });
      $('anki-result').textContent = result.ok === false
        ? result.message
        : action === 'anki-test'
          ? 'AnkiConnect is responding.'
          : 'Starter cards are ready. Use + in the dictionary popup to add a word.';
    } catch (error) {
      $('anki-result').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
