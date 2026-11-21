<h1 align="center">YomiDesktop</h1>

<p align="center"><strong>Point at Japanese. Press a key. Understand it.</strong><br>
Anywhere on your Windows screen — videos, games, visual novels, chats, images, even your wallpaper.</p>

<p align="center">
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4">
  <img alt="Works offline" src="https://img.shields.io/badge/works-100%25%20offline-2ea44f">
  <img alt="Powered by Yomitan" src="https://img.shields.io/badge/powered%20by-Yomitan-8a2be2">
  <img alt="License GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue">
</p>

<p align="center">
  <a href="https://github.com/grcjariten/yomidesktop/releases/latest/download/YomiDesktop-Setup.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/Download%20for%20Windows-YomiDesktop%20Setup-2ea44f?style=for-the-badge&logo=windows&logoColor=white" height="44"></a>
</p>
<p align="center"><sub>Always the latest version · free · no account · <a href="https://github.com/grcjariten/yomidesktop/releases/latest/download/YomiDesktop-Windows-x64.zip">portable ZIP</a></sub></p>

<!-- Screenshots coming soon -->

---

Yomitan is the best pop-up dictionary for learning Japanese — but it only lives in the browser.
**YomiDesktop takes it out of the browser and puts it on your whole desktop.**

Hover any Japanese word, in any program, press **Shift** (or Ctrl, Alt, any other key or a mouse side button — your choice), and the real Yomitan popup appears right there: readings, meanings, frequency, pitch accent, audio, and one-click Anki cards. No copy-paste, no switching windows, no texthooker, no per-app setup.

## One tool, every app

| Where you read Japanese | How YomiDesktop reads it |
| --- | --- |
| 🎬 **VLC** — anime, dramas, films | Reads the original subtitle text straight from VLC. Burned-in subtitles? It reads those too. |
| 🎮 **Games** (windowed / borderless fullscreen) | The popup floats over the game without stealing focus — your game won't minimize. |
| 📖 **Visual novels** | Works on the text box directly, no hooking needed. |
| 💬 **Telegram, WhatsApp, LINE** | Look up words in your messages without leaving the chat. |
| 🖼️ **Images, manga, screenshots, your wallpaper** | Local OCR reads text drawn as pixels, including manga lettering and handwriting. |
| 🌐 **Browsers, PDFs, Office, any app** | Uses the text Windows already exposes, character by character. |

If an app shows Japanese on screen, YomiDesktop can almost certainly read it.

## How it works

1. **Real text first.** YomiDesktop asks Windows for the exact character under your cursor, using three different accessibility readers. When that works, the lookup is perfect and instant.
2. **OCR when there is no text.** If the app only shows pixels (games, video, images), a local Japanese OCR reads a small area around the cursor. It combines a reader for app text with two readers trained on manga and handwriting, and uses your graphics card when available — answers arrive in about a tenth of a second.
3. **The original Yomitan popup.** Same engine, same dictionaries, same look and settings you know from the browser extension.

A small **OCR** label in the popup tells you when the text came from recognition.

## Features

- **Your key, your choice:** cursor + **Shift**, **Ctrl**, **Alt**, any other key (like F2) or a **mouse side button**. Click the key shown in the panel to change it. Press it again, press **Esc**, click elsewhere or move away to close. You can move into the popup to use its buttons.
- **Guided setup:** a short wizard picks your key, installs the recommended dictionaries and connects Anki step by step. You can run it again any time.
- **Your Yomitan dictionaries:** import any Yomitan-format dictionary (JMdict/Jitendex, frequency lists, pitch accent…) and keep their order and settings.
- **Anki in one click:** works with AnkiConnect, with the same card setup as Yomitan, plus the word's frequency and its source (video title or window name) in the notes.
- **VLC integration:** open videos in VLC as usual and look up words directly in the subtitle text (SRT, ASS/SSA). YomiDesktop connects itself to VLC, 32 or 64 bit, no admin rights needed. Image subtitles (PGS, VobSub) and burned-in ones go through OCR.
- **Private and offline:** everything runs on your PC. Screen areas are processed in memory and never saved or sent anywhere. No account, no cloud, no clipboard tricks.
- **Lives in the tray:** starts with Windows if you want, and stays out of your way until you press your key. Turn it off with the switch in the panel or **Turn off** in the tray menu: the tray icon turns black and white.

## Download and install

1. **[Download YomiDesktop-Setup.exe](https://github.com/grcjariten/yomidesktop/releases/latest/download/YomiDesktop-Setup.exe)** — a tiny installer that always fetches the latest version.
2. Run it. The app isn't signed yet, so Windows may say *"Windows protected your PC"*: click **More info → Run anyway**.
3. Click **Install**. No administrator rights needed; it downloads about 500 MB and creates the shortcuts.
4. The **guided setup** opens by itself:
   - **Key** — choose Shift, Ctrl or Alt (any other key or a mouse side button later, from the panel).
   - **Dictionaries** — the recommended set is already ticked: just press **Next**. They're downloaded from their official sources.
   - **Anki** — three short steps to connect it (install Anki, add AnkiConnect, check). Or skip.
5. Point at Japanese text anywhere and press your key.

Uninstall from **Windows Settings → Apps**, from **Start → Uninstall YomiDesktop**, or with `Uninstall.exe` in the program folder. Updating is just running the setup again: your dictionaries and settings are kept.

<details><summary>Recommended dictionaries</summary>

| Dictionary | What it adds |
| --- | --- |
| [Jitendex](https://jitendex.org) | Japanese → English definitions, examples and forms |
| [JMnedict](https://www.edrdg.org/enamdict/enamdict_doc.html) | Names of people and places |
| [KANJIDIC](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) | Kanji meanings, readings and stroke counts |
| BCCWJ, JPDB | How common a word is in writing and in media |
| [Jiten](https://jiten.moe) (general, YouTube, Drama) | How common a word is in real content |

You can untick any of them, or import any other Yomitan dictionary later from **YomiDesktop options**.
</details>

> The interface is in English, with Italian available: pick it from **Language** in the panel or in the guided setup. The popup and dictionaries work in whatever language your dictionaries use.

## Honest limits

- OCR can still miss very small, blurry or heavily stylized characters.
- Windows that block screen capture (some DRM video players, protected apps) can't be read.
- Exclusive fullscreen games may hide the popup: use borderless or windowed fullscreen.
- The VLC module targets VLC 3.0.x (32 and 64 bit). Restart VLC once after the first start of YomiDesktop.

## Build from source

The code is in [`source/`](source). See [`source/BUILD.md`](source/BUILD.md) for building the native readers, the VLC module, the OCR runtime, the installer and for running the tests. Italian user notes are in [LEGGIMI.md](LEGGIMI.md), test results in [VERIFICA.md](VERIFICA.md).

## Credits and license

YomiDesktop is built on [Yomitan](https://github.com/yomidevs/yomitan), the successor of [Yomichan](https://github.com/FooSoft/yomichan) — huge thanks to their authors and contributors. It also uses [Electron](https://github.com/electron/electron), [VLC](https://github.com/videolan/vlc), RapidOCR, ONNX Runtime and PaddleOCR models. Some OCR model weights are **non-commercial only** (CC BY-NC-SA 4.0). Full details in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

YomiDesktop is an unofficial project, released under [GPL-3.0-or-later](LICENSE).
