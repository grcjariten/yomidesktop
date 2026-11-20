# YomiDesktop 2.2

Apri **YomiDesktop.exe** o il collegamento sul desktop. Punta una parola giapponese e premi **Shift**. Il popup usa il motore originale di Yomitan e i tuoi otto dizionari.

Una nuova pressione di **Shift** chiude il popup. Si chiude anche quando allontani il cursore, con **Esc** o facendo clic fuori. Puoi attraversare il piccolo spazio fra la parola e il popup per entrare nella definizione e usare i pulsanti. Piccoli movimenti del cursore e una scansione OCR momentaneamente vuota sullo stesso punto non chiudono più la definizione valida.

Per cambiare tasto, clicca sul tasto mostrato nel pannello: puoi scegliere Shift, Ctrl, Alt oppure **Altro…** e premere il tasto che preferisci (meglio uno che non scrive lettere, come F2) o un tasto laterale del mouse. Il tasto del mouse scelto non fa più «indietro» nel browser finché YomiDesktop è attivo.

Il programma è in inglese di base: l’italiano si sceglie da **Lingua** nel pannello o nella configurazione guidata.

La X del pannello lascia il programma attivo vicino all’orologio. Lo switch in alto, o **Disattiva** nel menu dell’icona, mette in pausa il programma: l’icona diventa in bianco e nero. Per chiuderlo del tutto, usa **Esci** dal menu dell’icona. L’avvio con Windows si gestisce dal pannello.

## Lettura del testo

Il programma prova prima i tre lettori del testo originale. Se l’applicazione non espone il carattere sotto il cursore, usa automaticamente l’OCR locale per il giapponese. Dalla versione 1.4 l’OCR combina più lettori: uno per il testo delle app e due specializzati in manga, illustrazioni e scritte a mano. Quando la scheda video lo permette, la ricerca della scritta avviene lì e la risposta arriva in circa un decimo di secondo. Questo permette di cercare anche parole disegnate sullo schermo, nelle immagini e nelle app senza accessibilità del testo. Il gesto rimane **cursore + Shift**.

La piccola scritta **OCR** nel popup indica quando è stato usato il riconoscimento. Puoi disattivarlo dal pannello con **OCR automatico**. Motore, modelli e ambiente di esecuzione sono inclusi nella cartella del programma: non serve installare Python o scaricare modelli durante l’uso.

L’OCR elabora in memoria una piccola zona intorno al cursore, senza salvare o inviare immagini. Prima chiede i pixel alla finestra sorgente; se non è possibile ottenere il testo in questo modo, riconosce i pixel dello schermo. Questo riduce le interferenze delle finestre sovrapposte e degli effetti del cursore. Non usa gli appunti. Per una carta creata tramite OCR anche la frase proviene dal testo riconosciuto.

La copertura si amplia in generale, senza configurazioni separate per Telegram, WhatsApp o LINE. Le scritte a mano e gli effetti sonori dei manga sono ora riconosciuti molto più spesso, ma non sempre; l’OCR può ancora sbagliare su caratteri piccoli, sfocati o molto stilizzati; finestre protette dalla cattura possono restare illeggibili. Le verifiche di questa build sono descritte in **VERIFICA.md**.

## Dizionari e impostazioni

Sono stati copiati gli otto dizionari da Yomitan su Firefox, con ordine, frequenze e tema scuro. Le impostazioni originali del browser restano separate. **Opzioni YomiDesktop** apre le preferenze del popup, audio e dizionari. Sono separate da quelle di Yomitan su Firefox: cambiarle qui non tocca il browser.

## Anki

Le carte sono fatte **esattamente come in Yomitan su Firefox**: mazzo **Yomitan**, tipo di nota **Kaishi 1.5k**, stessi campi, stessa etichetta *Yomitan* e stessa gestione dei duplicati (la carta già esistente viene aggiornata). Il programma non crea né modifica tipi di nota in Anki.

I campi **Word Meaning** e **Sentence Meaning** restano vuoti come su Firefox: il significato in italiano lo scrivi tu in Anki.

Unica aggiunta rispetto a Firefox: nel riquadro **Note** in fondo alla carta compaiono la frequenza d’uso e la fonte (il nome del video o della finestra da cui hai preso la parola). Le carte vecchie non cambiano.

Il pulsante di aggiunta nel popup funziona con Anki aperto. Per cambiare collegamento o mazzo, usa **Configura AnkiConnect**, **Verifica collegamento** e **Prepara le carte**. La preparazione non aggiunge note di prova.

## VLC

Il modulo è compilato per VLC 3.0.x a 32 bit presente sul PC. Basta aprire normalmente i video in VLC. La consultazione usa i caratteri originali dei sottotitoli testuali. Se il testo originale non è disponibile, il programma può ripiegare sull’OCR dei sottotitoli visibili, compresi quelli impressi nel video.

Se cambi architettura o versione di VLC, il modulo va verificato e ricompilato. Per ASS conserva testo e impaginazione di base, ma non riproduce tutti gli effetti tipografici animati complessi.

Mantieni la cartella completa: programma, runtime, dati e `ocr-runtime` sono necessari. Il codice è in `source`; i risultati e i limiti delle verifiche sono in `VERIFICA.md`.
