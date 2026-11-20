# Ricostruzione

Il progetto non usa dipendenze npm. Il motore Yomitan completo è nella cartella `extension/`.

1. Compilare `native/TextProbe.cs`, `native/AccessibleTextReader.cs` e `native/ModernTextReader.cs` con `build.ps1`: usa il compilatore .NET Framework di Windows, Accessibility.dll e il manifesto DPI incluso. Il secondo lettore usa le interfacce COM IAccessible2 per testo e rettangoli originali dei caratteri.
2. Per il modulo VLC, compilare `vlc-plugin/yomidesktop.c` per `x86-windows-gnu` con gli header VLC 3.0.x del commit `6de05adcba`, collegando `libvlccore.dll` della stessa installazione e `ws2_32`. Il compilatore usato per la build verificata è Zig 0.14.1. Il modulo usa esplicitamente l’allocatore msvcrt per le stringhe di proprietà VLC, mantenendo separata la memoria del bridge.
3. Copiare `engine/*` in `extension/desktop/`; `popup.html` è quello originale, con lo script iniziale sostituito da `/desktop/popup.js`. Disattivare la registrazione della pagina browser di benvenuto in `js/background/backend.js`.
4. Eseguire `node --test tests/core.test.cjs`.
5. Avviare la cartella con Electron 45.2.3. `--self-test` esegue le verifiche sul database e sul popup. Con `YOMIDESKTOP_POPUP_REGRESSION=1` verifica anche una ricerca dopo 75 secondi a finestra nascosta, richieste concorrenti e una nuova ricerca durante la creazione delle voci precedenti. Impostando `YOMIDESKTOP_VIDEO_FIXTURE` a un video sintetico con sottotitoli testuali affiancati si include la prova con VLC reale. Queste prove non creano note in Anki.

Il motore e il popup devono mantenere `backgroundThrottling: false`: il popup viene mostrato solo dopo aver completato il rendering. Con il valore predefinito, dopo inattività i timer tra le voci rallentano e la ricerca può scadere prima che la finestra diventi visibile.

Il popup è creato con `focusable:false` (WS_EX_NOACTIVATE): i clic sul popup non attivano la finestra, così i giochi a schermo intero non perdono il primo piano e non si riducono a icona. Il popup non riceve la tastiera (Esc e Shift passano dall’hook nativo).

Il popup deve chiamare `moveTop()` dopo `showInactive()`, anche quando si ripete la stessa ricerca. `YOMIDESKTOP_ZORDER_REGRESSION=1` verifica la posizione sopra un'altra finestra sempre in primo piano e l'assenza di acquisizione del focus. Il lettore nativo usa un hook per Shift ed Esc, mantenendo il polling come ripiego; non registra altri tasti o contenuti digitati.

Telegram Desktop 7.4.1 espone i messaggi tramite celle di accessibilità senza TextInterface e con il rettangolo dell'intera riga. Il lettore TextPattern non può recuperare il carattere originale: la build 1.2 usa il fallback OCR locale sul testo visibile.

Il pacchetto Windows mette il codice in `resources/app` e usa `native/Launcher.cs` per l’avvio. Le librerie del runtime e i dizionari sono necessari al funzionamento offline del motore. Il file `data/dictionary-import.json` riporta i conteggi verificati della migrazione. La cartella `data/profile` è dedicata all’applicazione e non coincide con il profilo del browser.

Per la migrazione Firefox, durante questa installazione sono stati decodificati solo i due database dell’origine Yomitan. I record sono stati trasferiti in blocchi con checksum SHA-256 e scritture idempotenti. Conteggi, contenuti strutturati, immagini dei dizionari e impostazioni sono stati verificati prima di segnare l’importazione come completa.


## Lettore moderno e chiusura

`build-modern.ps1 -Compiler <percorso-zig>` compila `native/ModernTextReader.cpp` in `native/TextProbeModern.exe` con Zig 0.14.1, per x86_64-windows-gnu. Usa solo le API Windows per testo, coordinate e COM; il processo separato inizializza COM in MTA, gestisce il ridimensionamento del monitor e limita la durata delle richieste. Non usa OCR, appunti, selezioni simulate o accesso ai database delle chat.

`popup-session.cjs` segue il cursore anche a Shift rilasciato, concede 180 ms per attraversare lo spazio verso il popup e invalida i risultati arrivati dopo una chiusura. Ogni pressione di Shift ha un identificatore; una seconda pressione chiude senza riaprire con risultati della stessa pressione.

`node --test tests/core.test.cjs tests/popup-session.test.cjs` esegue dodici controlli. `YOMIDESKTOP_INTERACTION_REGRESSION=1` verifica la chiusura della finestra reale e il campo Significato vuoto. `YOMIDESKTOP_MODERN_REGRESSION=1` verifica dieci punti giapponesi tramite UIA3, inclusi caratteri supplementari Unicode, e la ricerca sulla posizione reale a schermo.

Le impostazioni delle carte Anki sono copiate da Yomitan su Firefox in `firefox-anki.json` e applicate una volta al profilo desktop (preferenza `cardsVersion`); unica differenza: il campo Notes contiene frequenza e fonte. Il programma non crea né modifica tipi di nota e non modifica le note già salvate in Anki.


## OCR locale (1.4)

`NeuralOcrWorker.py` riceve l’immagine e la posizione del puntatore e legge solo il testo sotto il puntatore:

1. due rilevatori cercano i riquadri di testo: PP-OCRv6 medium (schermate, interfacce) e PP-OCRv6_manga (illustrazioni, manga, scrittura a mano). ScreenOcr fotografa al massimo 1000×480 pixel intorno al puntatore (480 di altezza tiene intere le colonne verticali lunghe: sulle immagini reali 92% contro 86% con 320). Le immagini più piccole sono completate fino a 1000×480 e ingrandite come in RapidOCR (lato corto 736): una sola forma, compilata una volta sulla GPU. Le due esecuzioni DirectML restano in sequenza: in parallelo causano un accesso non valido.
2. tre lettori leggono in parallelo, su CPU, il riquadro sotto il puntatore: PP-OCRv6 medium, PP-OCRv6_manga e manga-ocr-charspot-small (solo per riquadri con rapporto lati ≤ 6, dove è affidabile).
3. vince la lettura su cui concordano più lettori (tilde e trattini scritti con codici diversi contano come uguali); fra quelle concordi la più lunga (la parola o colonna intera, non un pezzo tagliato dall’altro rilevatore). Senza accordo vince la lettura più vicina a tutte le altre (distanza di modifica); la confidenza decide solo i pareggi. Se il puntatore cade in due riquadri che si toccano, vale quello in cui è più vicino alla linea centrale.
4. il segno di vocale lunga letto come trattino, o come 一 nelle colonne verticali ruotate, torna ー secondo una regola di scrittura (solo tra katakana per 一). Non ci sono correzioni basate sul dizionario.

La GPU è scelta all’avvio misurando ogni scheda DirectML: su questo PC la RX 9070 XT è il dispositivo 0, la grafica integrata il dispositivo 1. Senza una GPU abbastanza veloce, o con `YOMIDESKTOP_OCR_CPU=1`, il rilevatore generale diventa PP-OCRv6-small su CPU. Senza la cartella `ocr-runtime/models` il worker torna alla sola pipeline PP-OCRv6-small. I lettori usano solo i file ONNX e i vocabolari: il codice Python dei pacchetti originali non viene eseguito. La pre-elaborazione di charspot è reimplementata.

Il worker ricorda i rilevamenti dell’ultima immagine; ScreenOcr riusa la risposta finché copre il puntatore e altrimenti chiede di nuovo. La prima risposta del worker, con caricamento dei modelli e scelta della GPU, può richiedere circa 7 secondi: NeuralOcrReader e OcrReader attendono fino a 60/65 secondi solo per la prima risposta di ogni processo.

`ocr-runtime/packages-gpu` contiene onnxruntime-directml 1.24.4 e ha la precedenza sul pacchetto CPU. Modelli aggiuntivi, fonti, licenze e SHA-256 sono in `ocr-runtime/manifest.json`. I pesi di charspot sono CC BY-NC-SA 4.0: solo uso non commerciale.

`ocr-runtime/python.exe -X utf8 tests/neural-ocr.test.py` verifica la lettura dell’intera immagine, la riga sotto il puntatore con il carattere giusto, una colonna verticale e un’area vuota.

## OCR locale (1.3)

`build-ocr.ps1` compila `ScreenOcr.cs`, `NeuralOcrReader.cs` e `OcrLayout.cs` con .NET Framework x64 e System.Drawing. Non usa più Windows.Media.Ocr né il language pack di Windows. `build.ps1` compila anche il ponte OcrReader nel lettore principale.

La cartella `ocr-runtime` accanto all’eseguibile contiene Python embedded 3.13.15, i pacchetti RapidOCR 3.10.0 e ONNX Runtime 1.31.1 e i modelli PP-OCRv6-small inclusi nel pacchetto ufficiale RapidOCR. `python313._pth` isola gli import dai pacchetti del sistema. Le versioni, gli URL di origine e gli SHA-256 sono nel manifest del runtime; le licenze di tutte le dipendenze restano nei rispettivi dist-info.

ScreenOcr avvia `NeuralOcrWorker.py` usando il Python incluso e lo mantiene attivo. PNG in memoria codificate base64 e risultati JSON passano solo tramite pipe locali. Tutti i percorsi dei modelli sono espliciti: se un modello manca il worker segnala indisponibilità senza scaricarlo. L’inferenza usa CPU con due thread per sessione.

La cattura prova PrintWindow sulla finestra sorgente, poi i pixel dello schermo se non trova un risultato utilizzabile. L’immagine OCR resta limitata alla regione del monitor e della finestra intorno al puntatore (massimo 1000×320 pixel). Immagini e frasi non vengono scritte nei log. Il processo principale rifiuta risultati di gesti e sequenze scaduti.

`ScreenOcr.exe --status` controlla il worker; `--point X Y` prova il percorso normale; `--screen-point X Y` prova esplicitamente il ripiego sui pixel dello schermo; `--image FILE X Y` prova un’immagine locale. Unità delle coordinate: pixel fisici. I risultati indicano `capture` e `confidence`.

`YOMIDESKTOP_OCR_REGRESSION=1` verifica dodici punti su raster non accessibile in font 14 e 32 pixel, due sfondi, e un punto sul ripiego schermo. Il self-test verifica anche indicatore OCR, voce 日本語 e campo Anki Significato vuoto, senza aggiungere note. I test C# in `tests/OcrLayoutTests.cs` coprono quindici casi. I controlli JavaScript su core e popup sono quindici. Eseguire la suite Electron a programma normale chiuso per non condividere contemporaneamente il database.
