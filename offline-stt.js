/* offline-stt.js — GUI‑on
 * Transcripción 100% offline en cliente usando un runtime WASM local
 * (sin depender de SpeechRecognition del navegador).
 */

(() => {
  'use strict';

  function tt(key, fallback = '') {
    try {
      if (window.I18n && typeof window.I18n.t === 'function') {
        const v = window.I18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback;
  }

  function toast(key, fallback, type = 'info') {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(tt(key, fallback), type);
      }
    } catch (_) {}
  }

  function dispatchInput(el) {
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {}
  }

  function appendTranscript(textarea, text) {
    const next = String(text || '').trim();
    if (!next) return;

    const prev = String(textarea.value || '').trimEnd();
    textarea.value = prev ? `${prev}\n${next}` : next;
    dispatchInput(textarea);
  }

  function getWhisperLang(tag) {
    const raw = String(tag || '').trim().toLowerCase();
    if (!raw) return 'auto';

    const map = {
      'es-es': 'es',
      'en-us': 'en',
      'pt-br': 'pt',
      'fr-fr': 'fr',
      'de-de': 'de',
      'it-it': 'it',
      'zh-cn': 'zh',
      'ko-kr': 'ko',
      'ja-jp': 'ja',
      'ru-ru': 'ru'
    };

    return map[raw] || raw.split('-')[0] || 'auto';
  }

  function extractTranscript(result) {
    if (!result) return '';
    if (typeof result === 'string') return result.trim();
    if (typeof result.text === 'string') return result.text.trim();

    if (Array.isArray(result.transcription)) {
      return result.transcription
        .map((seg) => String(seg?.text || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (Array.isArray(result.segments)) {
      return result.segments
        .map((seg) => String(seg?.text || seg?.transcript || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return '';
  }

  async function supportsSimd() {
    try {
      return WebAssembly.validate(
        new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10,
          10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
        ])
      );
    } catch (_) {
      return false;
    }
  }

  let dom = null;
  let currentModelFile = null;
  let currentAudioFile = null;
  let busy = false;
  let transcriber = null;
  let runtime = null;
  let currentStatusKey = 'p4.status.idle';

  function updateFileName(which, file) {
    const nameEl = which === 'model' ? dom.modelName : dom.audioName;
    if (!nameEl) return;

    if (!file) {
      nameEl.textContent = tt('p4.noFileSelected', 'Ningún archivo seleccionado');
      nameEl.dataset.empty = '1';
      return;
    }

    nameEl.textContent = file.name;
    nameEl.dataset.empty = '0';
  }

  function setStatus(key, fallback, state = 'idle') {
    currentStatusKey = key;
    if (!dom?.status) return;
    dom.status.textContent = tt(key, fallback);
    dom.status.dataset.state = state;
  }

  function applyBusyState(isBusy) {
    busy = isBusy;

    const disableIds = [
      dom.openBtn,
      dom.closeBtn,
      dom.runBtn,
      dom.modelPickBtn,
      dom.audioPickBtn
    ];

    disableIds.forEach((el) => {
      if (el) el.disabled = !!isBusy;
    });

    if (dom.cancelBtn) {
      dom.cancelBtn.classList.toggle('hidden', !isBusy);
      dom.cancelBtn.disabled = !isBusy;
    }

    if (dom.panel) {
      dom.panel.dataset.busy = isBusy ? '1' : '0';
    }
  }

  function needsIsolation() {
    return !window.crossOriginIsolated;
  }

  function updateIsolationStatusIfNeeded(force = false) {
    if (!dom?.status || busy) return;

    if (needsIsolation()) {
      setStatus(
        'p4.status.reload',
        'Recarga la app una vez para activar el motor local offline. Si sigue igual, usa la PWA instalada o un hosting seguro con aislamiento.',
        'warning'
      );
      return;
    }

    if (force || currentStatusKey === 'p4.status.reload' || currentStatusKey === 'p4.status.idle') {
      setStatus('p4.status.idle', 'Listo para transcribir completamente offline.', 'idle');
    }
  }

  async function ensureRuntime() {
    if (runtime) return runtime;

    const simd = await supportsSimd();
    const shoutPath = simd ? './stt/shout.wasm.js' : './stt/shout.wasm_no-simd.js';

    const [{ default: createModule }, { FileTranscriber }] = await Promise.all([
      import(shoutPath),
      import('./stt/FileTranscriber.js')
    ]);

    runtime = { createModule, FileTranscriber, simd };
    return runtime;
  }

  async function cancelTranscription() {
    if (!busy || !transcriber) return;

    setStatus('p4.status.canceling', 'Cancelando transcripción offline…', 'warning');

    try {
      await transcriber.cancel();
      setStatus('p4.status.canceled', 'Transcripción cancelada.', 'warning');
      toast('p4.status.canceled', 'Transcripción cancelada.', 'warning');
    } catch (err) {
      console.warn('[GUI‑on offline-stt] cancel error', err);
    } finally {
      try {
        transcriber.destroy();
      } catch (_) {}
      transcriber = null;
      applyBusyState(false);
      updateIsolationStatusIfNeeded();
    }
  }

  async function runTranscription() {
    if (busy) return;

    if (!currentModelFile || !currentAudioFile) {
      setStatus('p4.status.needFiles', 'Selecciona un modelo local y un archivo de audio.', 'warning');
      toast('p4.status.needFiles', 'Selecciona un modelo local y un archivo de audio.', 'warning');
      return;
    }

    if (needsIsolation()) {
      updateIsolationStatusIfNeeded(true);
      toast(
        'p4.status.reload',
        'Recarga la app una vez para activar el motor local offline. Si sigue igual, usa la PWA instalada o un hosting seguro con aislamiento.',
        'warning'
      );
      return;
    }

    applyBusyState(true);
    setStatus('p4.status.preparing', 'Preparando motor local offline…', 'info');

    try {
      const { createModule, FileTranscriber } = await ensureRuntime();

      transcriber = new FileTranscriber({
        createModule,
        model: currentModelFile,
        print: () => {},
        printErr: (msg) => console.warn('[GUI‑on offline-stt]', msg)
      });

      await transcriber.init();
      setStatus('p4.status.running', 'Transcribiendo offline… Este proceso puede tardar un poco.', 'info');

      const lang = getWhisperLang(dom.langSelect?.value || 'auto');
      const result = await transcriber.transcribe(currentAudioFile, {
        lang,
        translate: false,
        max_len: 0,
        split_on_word: false,
        suppress_non_speech: false,
        token_timestamps: false
      });

      const transcript = extractTranscript(result);
      if (!transcript) {
        throw new Error(tt('p4.status.empty', 'No se obtuvo texto del audio.'));
      }

      appendTranscript(dom.textarea, transcript);
      setStatus('p4.status.done', 'Transcripción offline terminada e insertada en Texto.', 'success');
      toast('p4.inserted', 'Transcripción insertada en Texto.', 'success');
      dom.panel.classList.add('hidden');
    } catch (err) {
      console.error('[GUI‑on offline-stt] transcription error', err);
      setStatus('p4.status.error', 'No se pudo completar la transcripción offline.', 'danger');
      const extra = err?.message ? ` ${err.message}` : '';
      try {
        if (typeof window.showToast === 'function') {
          window.showToast(
            `${tt('p4.status.errorShort', 'No se pudo transcribir offline.').trim()}${extra}`.trim(),
            'danger'
          );
        }
      } catch (_) {}
    } finally {
      try {
        transcriber?.destroy();
      } catch (_) {}
      transcriber = null;
      applyBusyState(false);
      updateIsolationStatusIfNeeded();
    }
  }

  function bindFileInput(kind) {
    const input = kind === 'model' ? dom.modelInput : dom.audioInput;
    const button = kind === 'model' ? dom.modelPickBtn : dom.audioPickBtn;

    if (!input || !button) return;

    button.addEventListener('click', () => {
      try {
        input.value = '';
      } catch (_) {}
      input.click();
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      if (kind === 'model') currentModelFile = file;
      else currentAudioFile = file;
      updateFileName(kind, file);
      updateIsolationStatusIfNeeded();
    });
  }

  function refreshI18n() {
    if (!dom) return;

    if (!currentModelFile) updateFileName('model', null);
    if (!currentAudioFile) updateFileName('audio', null);
    updateIsolationStatusIfNeeded(true);
  }

  function init(opts) {
    if (!opts) return;

    dom = {
      panel: document.getElementById(opts.panelId),
      textarea: document.getElementById(opts.textareaId),
      langSelect: document.getElementById(opts.langSelectId),
      openBtn: document.getElementById(opts.openBtnId),
      closeBtn: document.getElementById(opts.closeBtnId),
      runBtn: document.getElementById(opts.runBtnId),
      cancelBtn: document.getElementById(opts.cancelBtnId),
      status: document.getElementById(opts.statusId),
      modelInput: document.getElementById(opts.modelInputId),
      modelPickBtn: document.getElementById(opts.modelPickBtnId),
      modelName: document.getElementById(opts.modelNameId),
      audioInput: document.getElementById(opts.audioInputId),
      audioPickBtn: document.getElementById(opts.audioPickBtnId),
      audioName: document.getElementById(opts.audioNameId)
    };

    if (!dom.panel || !dom.textarea || !dom.openBtn || !dom.runBtn) return;
    if (dom.openBtn.dataset.guiOnOfflineInit === '1') return;
    dom.openBtn.dataset.guiOnOfflineInit = '1';

    bindFileInput('model');
    bindFileInput('audio');

    dom.openBtn.addEventListener('click', () => {
      dom.panel.classList.remove('hidden');
      updateIsolationStatusIfNeeded(true);
    });

    dom.closeBtn?.addEventListener('click', () => {
      if (busy) return;
      dom.panel.classList.add('hidden');
    });

    dom.runBtn.addEventListener('click', () => {
      void runTranscription();
    });

    dom.cancelBtn?.addEventListener('click', () => {
      void cancelTranscription();
    });

    refreshI18n();
  }

  window.GUIonOfflineSTT = {
    init,
    refreshI18n,
    isBusy: () => busy
  };
})();
