# Componenti

- **Yomitan 26.10.22.0**, Yomitan Authors / Yomichan Authors, GPL-3.0-or-later. Codice dall’estensione Firefox attiva; manifesto Chromium MV3 e ingresso service worker dalla copia Chrome installata, per l’esecuzione in Electron. Motore, morfologia, dizionari, renderer, audio, Anki e impostazioni sono quelli originali. Adattatori aggiunti in `extension/desktop/`; disattivata soltanto la pagina di benvenuto dell’installazione browser in `backend.js`. Sorgenti: https://github.com/yomidevs/yomitan
- **Electron 45.2.3**, Electron contributors. Licenza MIT e licenze dei componenti Chromium incluse come `LICENSE-Electron.txt` e `LICENSES.chromium.html`. Integrità dell’archivio verificata contro SHASUMS256 ufficiale; dettaglio in `runtime-integrity.json`. Sorgenti: https://github.com/electron/electron
- **VLC 3.0.24-rc1**, VideoLAN. Il lettore installato viene utilizzato come programma separato. Il bridge usa le interfacce native VLC con header LGPL-2.1-or-later del commit `6de05adcba`; decoder libass originale mantenuto. Sorgenti: https://github.com/videolan/vlc
- **OCR (cartella `ocr-runtime`)**: Python embedded, RapidOCR, ONNX Runtime e ONNX Runtime DirectML, modelli PP-OCRv6 small e medium (PaddleOCR, Apache-2.0), PP-OCRv6_manga di Kellenok (Apache-2.0) e manga-ocr-charspot-small di muscgab, i cui pesi sono **CC BY-NC-SA 4.0, solo uso non commerciale**. Dettagli e licenze in `ocr-runtime/LEGGIMI-LICENZE.md` e `ocr-runtime/manifest.json`.
- I file originali degli otto dizionari conservano metadati, revisione e attribuzioni nel database. Non vengono redistribuiti come raccolta pubblica.

Il codice YomiDesktop è GPL-3.0-or-later. La licenza completa è in `LICENSE`.
