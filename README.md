<p align="center"><img src="app/ui/icon.svg" alt="" width="96"></p>
<h1 align="center">YomiDesktop</h1>
<p align="center"><strong>Point at Japanese text. Press Shift. Keep reading.</strong></p>

YomiDesktop brings the [Yomitan](https://github.com/yomidevs/yomitan) dictionary engine to Windows desktop apps. It reads accessible text at the pointer and can use local Japanese OCR when an app only exposes pixels.

## Quick start

1. Download the Windows x64 ZIP from [Releases](../../releases) and extract the entire archive.
2. Open **YomiDesktop.exe**. This beta is unsigned, so Windows may show a publisher warning.
3. Choose **Manage dictionaries → Import** and select a Yomitan-format ZIP. See the [Yomitan dictionary guide](https://yomitan.wiki/dictionaries/).
4. Point at Japanese text and press **Shift**. Press **Shift** again or **Esc** to close the popup.

The dictionary list starts empty. You can import term, frequency, and pitch-accent dictionaries and set their order in the engine settings.

## What works

| Feature | Details |
| --- | --- |
| Desktop lookup | Reads text exposed by Windows accessibility APIs and shows entries from your dictionaries. |
| Local Japanese OCR | Reads the visible region around the pointer, including rasterized text and visible subtitles. Accuracy depends on font size, contrast, and rendering. |
| Anki | Optional [AnkiConnect](https://ankiweb.net/shared/info/2055492159) integration. Use the starter note type or your own. You can fill definitions automatically or enter them yourself. |
| Video | Open files in an existing VLC installation. A compatible 32-bit VLC installation can use the optional bridge for text subtitles. Image-based subtitles rely on OCR. |

YomiDesktop is an unofficial Windows x64 beta. Compatibility depends on the text each app exposes and on what Windows permits YomiDesktop to capture. Lookup can fail in games, protected video, or with very small text. The profile lives in `%APPDATA%\YomiDesktop Public`.

## Build and test

See [Build from source](app/BUILD.md) for dependencies, packaging, and tests.

## Credits and license

YomiDesktop uses the dictionary engine, popup, and settings from [Yomitan](https://github.com/yomidevs/yomitan), which grew out of [Yomichan](https://github.com/FooSoft/yomichan). Thanks to their authors and contributors. YomiDesktop is distributed under [GPL-3.0-or-later](LICENSE). See the [third-party notices](THIRD-PARTY-NOTICES.md).
