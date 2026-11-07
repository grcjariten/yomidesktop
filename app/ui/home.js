'use strict';

const $ = (id) => document.getElementById(id);
const host = window.desktopHost;

function update(status) {
  $('status').textContent = status.phase;
  $('status').classList.toggle('error', Boolean(status.error));
  $('toggle').setAttribute('aria-pressed', String(status.enabled));
  $('toggle').textContent = status.enabled ? 'Active' : 'Paused';
  $('toggle').disabled = false;
  for (const id of ['settings', 'manage-dictionaries', 'anki-prepare']) {
    $(id).disabled = !status.engineReady;
  }

  const dictionaries = status.dictionaries;
  const hasDictionaries = dictionaries.length > 0;
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
