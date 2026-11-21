// SPDX-License-Identifier: GPL-3.0-or-later
// Every text shown by YomiDesktop, in English (default) and Italian.
// Loaded by the windows (window.I18N) and by the main process (require).
(function(root){
'use strict';
const strings={
en:{
  // Main window
  'loading':'Loading dictionaries…','loading.import':'Installing your dictionaries…',
  'switch.title':'Turn YomiDesktop on or off','on':'On','paused':'Paused',
  'hero':'Point at a word and hold','key.title':'Change key','key.menu':'Key:','key.other':'Other…',
  'key.capture':'Press the key or the mouse side button you want to use. Better a key that doesn’t type letters, like F2. <kbd>Esc</kbd> cancels.',
  'mouse.middle':'Middle click','mouse.back':'Mouse 4','mouse.forward':'Mouse 5',
  'options':'⚙ YomiDesktop options','ocr.title':'Also read images (OCR)','ocr.preparing':'Preparing OCR…',
  'dict.title':'Dictionaries','dict.loading':'Loading your dictionaries…','dict.count':'{n} dictionaries active','dict.none':'No dictionaries. Add them from YomiDesktop options → Dictionaries.','dict.show':'Show dictionaries',
  'anki.about':'Word, reading, sentence, audio and frequency. You write the meaning yourself in Anki.','anki.configure':'Set up AnkiConnect',
  'anki.server':'Address','anki.deck':'Deck','anki.key':'API key, if set','anki.test':'Test connection','anki.prepare':'Prepare cards',
  'anki.connecting':'Connecting…','anki.answers':'AnkiConnect answers.','anki.ready':'Deck and note type ready. Use the + button in the popup to add words.',
  'autostart':'Start with Windows','wizard':'Guided setup','language':'Language',
  'promo':'Review Japanese grammar with Pera Pera · Android','promo.title':'From the author of YomiDesktop · opens Google Play',
  'note.close':'{key} or Esc close the popup · The X keeps the dictionary running.',
  'note.ocr':'The original text comes first. When it can’t be read directly, OCR recognizes the Japanese on screen: also in images and messaging apps. Recognition can be wrong on blurry characters.',
  // Status (main process)
  'phase.start':'Starting…','phase.ready':'Ready · hold {key} on the text','phase.restart':'Restarting the panel…',
  'phase.failed':'Lookup failed. Try again with {key}.','phase.noReader':'Windows text reading not available',
  'phase.noText':'No text recognized at this point.','phase.noDirect':'{source}: direct reading not available. You can turn on OCR.',
  'ocr.ready':'Local OCR · Japanese','ocr.unavailable':'Japanese OCR not available','ocr.off':'OCR off',
  'anki.prepared':'Cards ready · local AnkiConnect','anki.todo':'Not connected','anki.connected':'Connected','anki.notConnected':'Not connected','anki.connectedReady':'Connected · cards ready',
  'anki.openHint':'Open Anki and check AnkiConnect. ','anki.badDeck':'Invalid deck name','anki.version':'AnkiConnect version 6 is required.',
  'anki.missingModel':'Anki is missing the note type "{model}" used by Yomitan on Firefox.','anki.otherFields':'The note type "{model}" in Anki has different fields than expected.',
  'anki.notes':'Frequency {frequency-harmonic-rank} · Source: {document-title}','anki.template':'Recognition',
  'tray.tip':'YomiDesktop · {key} to look up','tray.paused':'YomiDesktop · Paused','tray.open':'Open YomiDesktop','tray.off':'Turn off','tray.on':'Turn on','tray.quit':'Quit',
  'window.options':'YomiDesktop options','manual':'Manual lookup',
  'err.engine':'The Yomitan engine is not responding.','err.noEngine':'Engine not available','err.unauthorized':'Request not allowed','err.badKey':'Invalid key',
  'err.starting':'The engine is still starting. Try again in a few seconds.','err.command':'Unsupported command',
  'popup.ocr':'Text recognized locally from the screen',
  // Setup wizard
  'setup.title':'YomiDesktop · Setup','setup.sub':'Guided setup','setup.s1':'Key','setup.s2':'Dictionaries','setup.s3':'Anki','setup.s4':'Done',
  'setup.welcome':'WELCOME','setup.welcomeH':'Ready in 4 steps.',
  'setup.welcomeP1':'Point at a Japanese word in any program, press a key and the translation appears. Works on videos, games, visual novels, chats and images.',
  'setup.welcomeP2':'If you don’t want to change anything, just press <b>Next</b>: the recommended choices are already selected.',
  'setup.keyE':'STEP 1 · KEY','setup.keyH':'Which key do you want to use?','setup.keyP':'Point at the word, press the key and the popup appears.',
  'setup.recommended':'Recommended','setup.altNote':'Opens menus in some programs',
  'setup.dictE':'STEP 2 · DICTIONARIES','setup.dictH':'Which dictionaries do you want?','setup.dictP':'The selected ones are recommended. They are downloaded from their official sites.',
  'setup.dictWait':'Starting the dictionary engine…','setup.dictPick':'Untick the ones you don’t want. It can take 5–15 minutes: the bar keeps moving.','setup.dictAll':'You already have all the recommended dictionaries.',
  'setup.dictHave':'✓ already installed','setup.dictOk':'✓ installed','setup.dictFail':'✕ failed','setup.dontClose':'Don’t close the window',
  'setup.dictSomeFailed':'{n} not installed (check your connection). Press again to retry, or go ahead.','setup.dictDone':'Dictionaries installed.','setup.dictDownloading':'Downloading {title} ({i} of {n})…','setup.dictProgress':'Installing {title} ({i} of {n}): {pct}%',
  'setup.ankiE':'STEP 3 · ANKI','setup.ankiH':'Do you want to make Anki cards?','setup.ankiP':'With one click in the popup the word becomes a card, with reading, sentence and audio.',
  'setup.anki1':'<b>Install and open Anki.</b>','setup.ankiDownload':'Download Anki',
  'setup.anki2':'<b>Add AnkiConnect.</b> In Anki open Tools → Add-ons → Get Add-ons and paste this code:','setup.copy':'Copy','setup.copied':'Copied ✓','setup.copyFail':'Select it and copy it','setup.anki2b':'Then close and reopen Anki.',
  'setup.anki3':'<b>Check the connection.</b>','setup.check':'Check','setup.checking':'Checking…','setup.ankiOk':'✓ Anki is connected','setup.ankiNo':'✕ Anki doesn’t answer: is it open? Is AnkiConnect installed?',
  'setup.deck':'Deck name','setup.meaning':'Write the meaning on the card already (otherwise you write it)',
  'setup.preparing':'Preparing…','setup.ankiFirst':'First connect Anki (steps 1-3), or press Skip.','setup.deckReady':'✓ Deck "{deck}" ready. In the popup press + to make a card.',
  'setup.doneE':'DONE','setup.doneH':'All set.','setup.doneP1':'Open a video, a game or a chat in Japanese. Point at a word and press <kbd id="final-key">Shift</kbd>.',
  'setup.doneP2':'Press the key again, <kbd>Esc</kbd> or click outside to close the popup.','setup.autostart':'Start YomiDesktop with Windows','setup.redo':'You can run this setup again any time from the panel.',
  'setup.back':'Back','setup.skip':'Skip','setup.next':'Next','setup.install':'Install and continue','setup.prepare':'Prepare cards','setup.finish':'Finish',
  // Suggested dictionaries
  'kind.dictionary':'Dictionary','kind.names':'Names','kind.kanji':'Kanji','kind.frequency':'Frequency',
  'about.jitendex':'Japanese → English, complete and up to date','about.jmnedict':'Names of people, places and brands','about.kanjidic':'Meaning, readings and strokes of kanji',
  'about.bccwj':'How common it is in written language','about.jpdb':'How common it is in anime, novels and games','about.jiten':'General frequency from jiten.moe',
  'about.jiten-youtube':'How common it is in YouTube videos','about.jiten-drama':'How common it is in dramas',
},
it:{
  'loading':'Caricamento dei dizionari…','loading.import':'Installazione dei tuoi dizionari…',
  'switch.title':'Accendi o spegni YomiDesktop','on':'Attivo','paused':'In pausa',
  'hero':'Punta la parola e tieni premuto','key.title':'Cambia tasto','key.menu':'Tasto:','key.other':'Altro…',
  'key.capture':'Premi il tasto o il tasto laterale del mouse che vuoi usare. Meglio un tasto che non scrive, come F2. <kbd>Esc</kbd> annulla.',
  'mouse.middle':'Clic centrale','mouse.back':'Mouse 4','mouse.forward':'Mouse 5',
  'options':'⚙ Opzioni YomiDesktop','ocr.title':'Leggi anche le immagini (OCR)','ocr.preparing':'Preparazione OCR…',
  'dict.title':'Dizionari','dict.loading':'Caricamento dei tuoi dizionari…','dict.count':'{n} dizionari attivi','dict.none':'Nessun dizionario. Aggiungili da Opzioni YomiDesktop → Dizionari.','dict.show':'Vedi dizionari',
  'anki.about':'Parola, lettura, frase, audio e frequenza. Il significato in italiano lo scrivi tu in Anki.','anki.configure':'Configura AnkiConnect',
  'anki.server':'Indirizzo','anki.deck':'Mazzo','anki.key':'Chiave API, se impostata','anki.test':'Verifica collegamento','anki.prepare':'Prepara le carte',
  'anki.connecting':'Collegamento…','anki.answers':'AnkiConnect risponde.','anki.ready':'Mazzo e modello pronti. Usa il pulsante + nel popup per aggiungere le parole.',
  'autostart':'Avvia con Windows','wizard':'Configurazione guidata','language':'Lingua',
  'promo':'Ripassa la grammatica giapponese con Pera Pera · Android','promo.title':'Dall’autore di YomiDesktop · apre Google Play',
  'note.close':'{key} o Esc chiudono il popup · La X lascia il dizionario attivo.',
  'note.ocr':'Il testo originale ha la precedenza. Quando non è leggibile direttamente, l’OCR riconosce il giapponese sullo schermo: anche nelle immagini e nelle app di messaggistica. Il riconoscimento può sbagliare sui caratteri poco nitidi.',
  'phase.start':'Avvio…','phase.ready':'Pronto · tieni premuto {key} sul testo','phase.restart':'Riavvio del pannello…',
  'phase.failed':'Ricerca non riuscita. Riprova con {key}.','phase.noReader':'Lettura Windows non disponibile',
  'phase.noText':'Nessun testo riconosciuto in questo punto.','phase.noDirect':'{source}: lettura diretta non disponibile. Puoi attivare l’OCR.',
  'ocr.ready':'OCR locale · giapponese','ocr.unavailable':'OCR giapponese non disponibile','ocr.off':'OCR disattivato',
  'anki.prepared':'Carte pronte · AnkiConnect locale','anki.todo':'Da collegare','anki.connected':'Collegato','anki.notConnected':'Non collegato','anki.connectedReady':'Collegato · carte pronte',
  'anki.openHint':'Apri Anki e verifica AnkiConnect. ','anki.badDeck':'Nome mazzo non valido','anki.version':'È richiesto AnkiConnect versione 6.',
  'anki.missingModel':'In Anki manca il tipo di nota "{model}" usato da Yomitan su Firefox.','anki.otherFields':'Il tipo di nota "{model}" in Anki ha campi diversi da quelli previsti.',
  'anki.notes':'Frequenza {frequency-harmonic-rank} · Fonte: {document-title}','anki.template':'Riconoscimento',
  'tray.tip':'YomiDesktop · {key} per cercare','tray.paused':'YomiDesktop · In pausa','tray.open':'Apri YomiDesktop','tray.off':'Disattiva','tray.on':'Attiva','tray.quit':'Esci',
  'window.options':'Opzioni YomiDesktop','manual':'Ricerca manuale',
  'err.engine':'Il motore Yomitan non risponde.','err.noEngine':'Motore non disponibile','err.unauthorized':'Richiesta non autorizzata','err.badKey':'Tasto non valido',
  'err.starting':'Il motore si sta ancora avviando. Riprova tra qualche secondo.','err.command':'Comando non supportato',
  'popup.ocr':'Testo riconosciuto localmente dallo schermo',
  'setup.title':'YomiDesktop · Configurazione','setup.sub':'Configurazione guidata','setup.s1':'Tasto','setup.s2':'Dizionari','setup.s3':'Anki','setup.s4':'Fine',
  'setup.welcome':'BENVENUTO','setup.welcomeH':'Pronto in 4 passi.',
  'setup.welcomeP1':'Punti una parola giapponese in qualsiasi programma, premi un tasto e appare la traduzione. Funziona su video, giochi, visual novel, chat e immagini.',
  'setup.welcomeP2':'Se non vuoi cambiare niente, premi solo <b>Avanti</b>: le scelte consigliate sono già pronte.',
  'setup.keyE':'PASSO 1 · TASTO','setup.keyH':'Con quale tasto vuoi cercare?','setup.keyP':'Punti la parola, premi il tasto e appare il popup.',
  'setup.recommended':'Consigliato','setup.altNote':'Apre i menu in alcuni programmi',
  'setup.dictE':'PASSO 2 · DIZIONARI','setup.dictH':'Quali dizionari vuoi?','setup.dictP':'Quelli selezionati sono i consigliati. Vengono scaricati dai siti ufficiali.',
  'setup.dictWait':'Avvio del motore dei dizionari…','setup.dictPick':'Togli la spunta a quelli che non vuoi. Possono servire 5–15 minuti: la barra continua ad avanzare.','setup.dictAll':'Hai già tutti i dizionari consigliati.',
  'setup.dictHave':'✓ già presente','setup.dictOk':'✓ installato','setup.dictFail':'✕ non riuscito','setup.dontClose':'Non chiudere la finestra',
  'setup.dictSomeFailed':'{n} non installati (controlla la connessione). Premi di nuovo per riprovare, oppure vai avanti.','setup.dictDone':'Dizionari installati.','setup.dictDownloading':'Scarico {title} ({i} di {n})…','setup.dictProgress':'Installo {title} ({i} di {n}): {pct}%',
  'setup.ankiE':'PASSO 3 · ANKI','setup.ankiH':'Vuoi creare carte Anki?','setup.ankiP':'Con un clic nel popup la parola diventa una carta, con lettura, frase e audio.',
  'setup.anki1':'<b>Installa e apri Anki.</b>','setup.ankiDownload':'Scarica Anki',
  'setup.anki2':'<b>Aggiungi AnkiConnect.</b> In Anki apri Strumenti → Componenti aggiuntivi → Ottieni componenti aggiuntivi (in inglese: Tools → Add-ons → Get Add-ons) e incolla questo codice:','setup.copy':'Copia','setup.copied':'Copiato ✓','setup.copyFail':'Selezionalo e copialo','setup.anki2b':'Poi chiudi e riapri Anki.',
  'setup.anki3':'<b>Controlla il collegamento.</b>','setup.check':'Verifica','setup.checking':'Controllo…','setup.ankiOk':'✓ Anki è collegato','setup.ankiNo':'✕ Anki non risponde: è aperto? AnkiConnect è installato?',
  'setup.deck':'Nome del mazzo','setup.meaning':'Scrivi già il significato sulla carta (altrimenti lo scrivi tu)',
  'setup.preparing':'Preparazione…','setup.ankiFirst':'Prima collega Anki (passi 1-3), oppure premi Salta.','setup.deckReady':'✓ Mazzo "{deck}" pronto. Nel popup premi + per creare una carta.',
  'setup.doneE':'FATTO','setup.doneH':'Tutto pronto.','setup.doneP1':'Apri un video, un gioco o una chat in giapponese. Punta una parola e premi <kbd id="final-key">Shift</kbd>.',
  'setup.doneP2':'Premi di nuovo il tasto, <kbd>Esc</kbd> o fai clic fuori per chiudere il popup.','setup.autostart':'Avvia YomiDesktop con Windows','setup.redo':'Puoi rifare questa configurazione quando vuoi dal pannello.',
  'setup.back':'Indietro','setup.skip':'Salta','setup.next':'Avanti','setup.install':'Installa e continua','setup.prepare':'Prepara le carte','setup.finish':'Fine',
  'kind.dictionary':'Dizionario','kind.names':'Nomi','kind.kanji':'Kanji','kind.frequency':'Frequenza',
  'about.jitendex':'Giapponese → inglese, completo e aggiornato','about.jmnedict':'Nomi di persone, luoghi e marchi','about.kanjidic':'Significato, letture e tratti dei kanji',
  'about.bccwj':'Quanto è comune nella lingua scritta','about.jpdb':'Quanto è comune in anime, romanzi e giochi','about.jiten':'Frequenza generale da jiten.moe',
  'about.jiten-youtube':'Quanto è comune nei video YouTube','about.jiten-drama':'Quanto è comune nei drama',
},
};
const languages={en:'English',it:'Italiano'};
function translator(language){
  const table=strings[language]||strings.en;
  return (key,vars={})=>String(table[key]??strings.en[key]??key).replace(/\{(\w+)\}/g,(m,name)=>Object.hasOwn(vars,name)?String(vars[name]):m);
}
// Fills elements marked data-i18n (text), data-i18n-html (trusted markup from this file) and data-i18n-title.
function apply(doc,t){
  for(const e of doc.querySelectorAll('[data-i18n]'))e.textContent=t(e.dataset.i18n);
  for(const e of doc.querySelectorAll('[data-i18n-html]'))e.innerHTML=t(e.dataset.i18nHtml);
  for(const e of doc.querySelectorAll('[data-i18n-title]'))e.title=t(e.dataset.i18nTitle);
}
const api={strings,languages,translator,apply};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.I18N=api;
})(this);
