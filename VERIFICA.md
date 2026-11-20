# Verifica YomiDesktop 1.4 — 19 novembre 2026

L’OCR combina due rilevatori e tre lettori e vota il risultato (dettagli in `source/BUILD.md`). La prova misura la riga sotto il puntatore letta in modo esatto.

| Prova | 1.3 | 1.4 con GPU | 1.4 senza GPU |
| --- | --- | --- | --- |
| Scritte reali da manga, a mano ed effetti sonori, dentro pagine 1000×320 (150) | 6% | **63%** | 62% |
| Righe difficili da app: kanji fitti, foto, contorno, inclinazione, 10–24 px (160) | 89% | **97%** | 96% |
| Tempo per immagine nuova, mediana | 0,32–0,45 s | **0,09–0,10 s** | 0,27–0,28 s |
| Immagini dell’utente: 8 pagine (manga moderni e d’epoca, cinese, titoli stilizzati, 4-koma a mano), 66 scritte × 3 punti | — | **92%** | — |

Le scritte da manga sono 400 ritagli reali di JMangaBench_Hard (CC BY-NC-SA 4.0, solo valutazione: non sono incluse). Le righe da app sono sintetiche. Con il riquadro già noto i lettori ottengono: PP-OCRv6 small 11%, medium 17%, PP-OCRv6_manga 69%, charspot 75%, voto 76%. Sulle immagini il limite principale resta trovare la scritta.

A schermo, su una finestra reale con cattura della finestra e dello schermo, sono state lette correttamente una riga da 18 px, una riga con contorno e una colonna verticale (醤油ラーメン da ogni carattere). Controlli automatici: 54 del worker con GPU e senza GPU, 15 C# sulla geometria, 15 JavaScript. La scheda video usata è la RX 9070 XT; senza GPU adatta il programma usa solo il processore.

Sulle immagini dell’utente, ritagliate come fa il programma, sbagliano ancora: il kanji raro 杢 letto 本 (tutti i lettori), un titolo molto stilizzato, una colonna scritta a mano di 4-koma e due colonne attaccate. Con le stesse immagini ingrandite ×2 la cattura alta 480 pixel ottiene 88% contro 69% con 320.

Limiti: scritte molto deformate, minuscole o su sfondi confusi possono ancora non essere trovate o lette. Le prove a mano reali riguardano manga; non ci sono prove su appunti scritti a mano fotografati. Risultati in `verifica/ocr-riconoscimento-1.4.json`.

# Verifica YomiDesktop 1.3 — 7 novembre 2026

Il motore Windows OCR della build 1.2 è sostituito da **PP-OCRv6-small**, eseguito localmente tramite RapidOCR e ONNX Runtime. Il testo originale conserva la precedenza.

| Controllo | Risultato |
| --- | --- |
| Screenshot fornito dall’utente | Riprodotto il vecchio errore 経営 → 土呂; il nuovo motore legge correttamente 経営 |
| Precisione su immagini di prova | 49 parole riconosciute correttamente: screenshot reale più sei parole giapponesi in otto combinazioni di dimensione e sfondo |
| Dimensioni delle prove | 14, 16, 24 e 48 pixel, testo scuro su bianco e testo grigio chiaro su sfondo scuro |
| LINE reale | Verificate dal gesto cursore + Shift fino al popup le parole 日本, 仕事 e 日曜日; nessun messaggio inviato e nessuna nota Anki aggiunta |
| Coordinate a schermo | Dodici punti su canvas privo di testo accessibile, font 14 e 32 pixel, sfondi chiari e scuri, Windows al 125% |
| Cattura della finestra | Verificata nei dodici punti tramite il campo capture=window |
| Ripiego sulla cattura dello schermo | Verificato separatamente su un punto con caratteri piccoli, capture=screen |
| Popup stabile | Verificato per un secondo anche con rettangolo OCR decentrato e scansione successiva vuota vicino alla sorgente |
| Chiusura voluta | Uscita del cursore, seconda pressione di Shift e rifiuto delle risposte tardive |
| Primo piano | Sopra un’altra finestra sempre in primo piano, senza sottrarre focus |
| Anki | Generazione reale della carta con Significato vuoto per scrivere l’italiano a mano; nessuna nota di prova aggiunta |
| Lettura diretta | Dieci punti giapponesi UIA3, carattere Unicode supplementare, percorso completo LibreOffice tramite IAccessible2 |
| VLC | SRT e ASS reali verificati separatamente fino al dizionario |
| Controlli automatici | Quindici verifiche JavaScript e quindici verifiche C# su geometria OCR, offset, Unicode, bassa confidenza e stabilità |
| Dizionari | Otto dizionari personali, 1.096.281 voci e 2.320.013 metadati di parole |

Il nuovo OCR restituisce anche coordinate e confidenza dei caratteri: i punti con confidenza inferiore alla soglia vengono scartati. Le coordinate provengono dall’allineamento del modello; non sono coordinate tipografiche originali. Non vengono inventate correzioni in base alle parole presenti nel dizionario.

La prova su LINE riguarda i tre casi elencati, non tutto il testo dell’applicazione. Le vecchie prove fallite sono conservate in `verifica/line-verifica-1.2.json`. Caratteri poco nitidi, stilizzati, animati o finestre protette possono ancora impedire una lettura corretta. La geometria verticale e ruotata ha test sintetici; l’integrazione reale documentata qui usa testo orizzontale.

Le immagini elaborate restano in memoria e non vengono inviate online. Il runtime OCR e i modelli sono inclusi. La cattura della finestra avviene in un processo separato con limite d’attesa; se il rendering non fornisce un risultato utilizzabile, viene provata la cattura dello schermo.

I tempi del modello nelle nove immagini di prova sono circa 0,2–0,3 secondi con processo già avviato. Le prove native a schermo includono invece l’avvio da zero di tutti i processi a ogni punto: questi tempi non rappresentano la latenza del normale processo persistente.

Risultati: `verifica/integrazione-1.3.json`, `verifica/ocr-riconoscimento-1.3.json`, `verifica/line-verifica.json`. Impronte della build e dei modelli: `verifica/verifiche.json` e `ocr-runtime/manifest.json`.
