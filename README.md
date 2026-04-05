# OptimeFlow(s) GUI-on

**GUI-on** is a local-first progressive web application for writing, organizing, previewing, and exporting scripts for **film**, **theatre**, and **podcast** workflows.

It is built to stay close to the authoring process: no mandatory account, no required backend, no app-owned cloud workflow just to start writing. The core experience runs in the browser, works as an installable PWA, supports multilingual UI, and includes both live dictation and an optional fully local offline transcription path.

---

## Why GUI-on exists

GUI-on is designed for creators who want the speed of a browser-based editor without giving up ownership, portability, or offline capability. The app focuses on three practical goals:

1. **Write and structure scripts quickly** across multiple formats.
2. **Keep the workflow local-first** so projects remain on the user’s device unless the user explicitly exports or imports files.
3. **Package the whole experience as a PWA** so the editor can be installed and reopened offline with cached assets, language packs, and local STT runtime resources.

The result is a lightweight but capable authoring environment that combines script editing, structure management, preview, export, multilingual UI, and privacy-conscious local processing.

---

## Core capabilities

### 1) Multi-format script authoring
GUI-on supports three main script modes:

- **Film**
- **Theatre**
- **Podcast**

Within a project, writers can work with structured elements such as:

- sluglines / scene headings
- action / description
- character cues
- parentheticals
- dialogue
- transitions
- SFX
- music
- notes
- timecodes

This structure is used consistently across the editor, preview, and export pipeline.

### 2) Character and scene management
The app includes dedicated flows for:

- adding and editing characters / voices
- building scene or section structure
- reordering scenes
- inserting structured elements into a selected scene
- controlling whether a scene heading is shown at the beginning of a block

This makes GUI-on useful both as a writing environment and as a production-friendly script organizer.

### 3) Formatting and layout control
GUI-on is not only a text editor. It also provides layout and formatting controls intended for real script output:

- per-element formatting controls
- per-character dialogue styling support
- configurable spacing / block gaps
- page size selection
- margin control
- header / footer modes
- page rules
- block start on a new page
- live preview before export

### 4) PDF export
The export layer supports production-ready output with:

- live preview
- multiple page sizes:
  - A4
  - Letter
  - A5
  - KDP 6×9
- configurable header / footer behavior
- page numbering
- margin control
- script-type-aware formatting
- dialogue indentation logic adapted to the selected format

### 5) Audio export
GUI-on also includes an audio-export path that can mix assigned audio snippets into a WAV file. This is particularly useful for podcast-oriented workflows or annotated editorial testing.

### 6) Multilingual interface
The app is designed around JSON-based UI translations and supports a broad multilingual interface layer.

Supported UI languages in the current project structure:

- Spanish (`es`)
- Catalan (`ca`)
- English (`en`)
- Brazilian Portuguese (`pt-br`)
- French (`fr`)
- German (`de`)
- Italian (`it`)
- Hindi (`hi`)
- Simplified Chinese (`zh`)
- Korean (`ko`)
- Japanese (`ja`)
- Russian (`ru`)

### 7) Eight visual themes
The settings panel includes multiple visual themes, allowing the editor to be adapted to different working environments and aesthetic preferences.

### 8) Installable PWA
GUI-on can be installed as a **Progressive Web App**. The service worker is responsible for caching:

- the application shell
- runtime assets
- language JSON files
- local STT runtime assets

This enables a robust offline experience after the app has been opened and cached once.

### 9) Live dictation and local offline transcription
GUI-on supports two complementary voice workflows:

#### Live dictation
Live dictation uses the speech-recognition capabilities available in the user’s browser or operating system. Depending on browser and platform, this may run locally or rely on the platform provider’s speech service.

#### 100% offline transcription with a local model
The app also provides an optional offline transcription flow where:

- the user selects a local model file (for example, a compatible `.bin` / `.ggml` Whisper-style model)
- the user selects a local audio file
- transcription runs on the client side through the bundled local runtime path

This path is meant for users who want a more self-contained transcription workflow without relying on browser speech recognition.

---

## Local-first and privacy model

GUI-on is designed to run primarily on the user’s device.

In practical terms, that means the app can store locally:

- project content
- metadata
- character and scene data
- script elements
- export settings
- UI preferences such as theme and language
- saved templates
- PWA cache resources

The inspected version of the project also states that it **does not redistribute bundled third-party JavaScript libraries or embedded local transcription models by default**. Some features still depend on browser or platform services, and fully local offline transcription depends on user-supplied local model files.

That distinction matters:

- **live dictation** depends on browser / platform speech APIs
- **offline transcription** depends on local runtime assets and a user-selected model
- **project authoring and export** are otherwise local-first in the browser

---

## Technology overview

GUI-on is intentionally modular. The main files in this project play the following roles.

### `index.html`
Defines the application shell, UI structure, settings panel, writing panels, export controls, preview panel, footer, overlays, and entry points for all major interactions.

### `app.js`
Owns the core application state and the main editing flows, including:

- local storage persistence
- project metadata
- script type handling
- character and scene management
- element insertion and editing
- template handling
- format controls
- PWA registration
- theme and language switching

### `export.js`
Handles:

- JSON project export / import
- demo project loading
- PDF generation
- audio mix export to WAV

### `preview.js`
Builds the live page preview with the same page-size and layout logic used by the export layer.

### `dictado.js`
Implements live dictation with mobile-friendly anti-duplication logic, speech-language mapping, editor integration, and optional audio capture support for editor elements.

### `offline-stt.js`
Implements the local offline transcription panel and runtime flow, including:

- local model selection
- local audio selection
- runtime initialization
- status handling
- transcript insertion into the editor
- cancellation support

### `i18n.js`
Loads language JSON files, resolves candidate language-file names, applies translations to DOM nodes, and supports translated placeholders, titles, and ARIA labels.

### `sw.js`
Provides the PWA service-worker layer, including:

- offline app shell handling
- language-file alias resolution
- STT runtime caching
- same-origin runtime caching
- cache-versioning and activation cleanup
- isolation headers relevant to local runtime behavior

---

## Expected project structure

A clean distribution can be organized like this:

```text
.
├── app.js
├── dictado.js
├── export.js
├── i18n.js
├── index.html
├── manifest.webmanifest
├── offline-stt.js
├── preview.js
├── styles.css
├── sw.js
├── lang/
│   ├── es.json
│   ├── ca.json
│   ├── en.json
│   ├── pt-br.json
│   ├── fr.json
│   ├── de.json
│   ├── it.json
│   ├── hi.json
│   ├── zh.json
│   ├── ko.json
│   ├── ja.json
│   └── ru.json
├── stt/
│   ├── utils.js
│   ├── Transcriber.js
│   ├── FileTranscriber.js
│   ├── shout.wasm.js
│   └── shout.wasm_no-simd.js
└── assets/
    └── img/
        ├── logo.png
        ├── guion180.png
        ├── guion192.png
        └── guion512.png
```

> Note: the manifest explicitly references the 192×192 and 512×512 icons. Additional assets such as `guion180.png` can still be useful for packaging, documentation, or platform-specific distribution conventions.

---

## Running the app locally

Because GUI-on uses a service worker, it should be served over **HTTP(S)** or from a local development server. Do not open it directly through `file://`.

### Quick local serve options

Using Python:

```bash
python -m http.server 8000
```

Using Node:

```bash
npx serve .
```

Then open the app in your browser, for example:

```text
http://localhost:8000/
```

After the first successful load, the service worker can cache the application shell and the offline resources.

---

## Installation as a PWA

Once served correctly, GUI-on can be installed as a PWA in browsers that support installation.

Typical flow:

1. Open the app from a local or hosted server.
2. Let the browser load the service worker and cache the shell.
3. Use the built-in install action or the browser’s install / add-to-home-screen flow.
4. Reopen the app from the installed icon and test offline access.

The settings panel includes app-install UI logic, and the service worker is versioned so updates can refresh caches cleanly.

---

## Language system

GUI-on uses a JSON-based translation system.

The language loader:

- tries multiple filename variations for a selected language
- supports root-level JSON files and `lang/` files
- applies translations to text, placeholders, titles, and ARIA labels
- falls back to Spanish when required
- includes supplemental messages for placeholder safety

The service worker complements this by caching language files and resolving common aliases such as:

- `pt-BR` → `pt-br.json`
- `zh-CN` → `zh.json`
- `ja-JP` → `ja.json`
- `ru-RU` → `ru.json`
- `hi-IN` → `hi.json`

This makes multilingual offline behavior much more reliable.

---

## Speech and transcription stack

GUI-on intentionally separates two voice paths.

### Browser dictation path
This path is ideal for quick capture while writing. It uses browser / platform speech recognition and writes directly into the editor.

Main characteristics:

- immediate interaction
- language selection
- mobile-aware anti-duplication handling
- paragraph normalization before insertion
- direct integration with script elements

### Local offline transcription path
This path is intended for privacy-focused or offline processing.

Main characteristics:

- user-selected local model
- user-selected local audio
- runtime initialization in the browser
- transcript inserted back into the editor
- no app-owned upload step required

### Important note
Offline transcription in this project is not the same thing as “the app ships a built-in model.” In the inspected version, the project expects the user to provide a compatible local model file.

---

## Export workflow

GUI-on supports multiple export flows.

### Project export
Projects can be saved and loaded as JSON.

### Template export
Formatting presets / templates can be saved, loaded, and exported.

### PDF export
The PDF output is based on the structured script model and page layout settings.

### Audio export
Assigned audio clips can be mixed and exported as a WAV file.

---

## Browser APIs used

GUI-on relies on standard browser capabilities, including:

- `localStorage`
- `Service Worker`
- `fetch`
- `FileReader`
- `MediaRecorder`
- `getUserMedia`
- `SpeechRecognition` / `webkitSpeechRecognition`
- `AudioContext` / `OfflineAudioContext`
- `WebAssembly`
- PWA installation events such as `beforeinstallprompt`

This keeps the app lightweight and browser-native, while still enabling advanced authoring features.

---

## Design philosophy

GUI-on is opinionated in a useful way:

- **local-first**
- **offline-capable**
- **format-aware**
- **multilingual**
- **PWA-ready**
- **privacy-conscious**
- **writer-centered**

It is not a generic note-taking tool with a script skin on top. The application logic is built around structured script elements and exportable layout rules.

---

## Licensing

GUI-on is released under the **MIT License**.

The inspected version also includes an in-app license / notice panel explaining that:

- the project itself is MIT-licensed
- browser and platform technologies may be involved in some features
- this inspected version does not bundle redistributed third-party JavaScript libraries or embedded local transcription models by default
- future bundled third-party components should have their notices added explicitly

---

## Citation and archival metadata

This repository can include:

- `CITATION.cff`
- `.zenodo.json`

These files help the project remain easier to cite, archive, and publish in research, workshop, or open-software contexts.

---

## Credits

**Author:** Andrés Calvo Espinosa  
**Organization / brand:** OptimeFlow(s)  
**ORCID:** 0009-0005-4079-7418

---

## Final note

GUI-on is at its best when used as a **serious local-first writing tool**: fast to open, installable, multilingual, export-ready, and capable of staying useful even when the network disappears.

That combination local script editing, structured export, PWA packaging, and optional on-device transcription is what makes the project distinctive.
