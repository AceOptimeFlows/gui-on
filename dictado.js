/* dictado.js — GUI‑on
 * Dictado por voz (Web Speech API) con anti-duplicados real (iOS + Android)
 *
 * Cubre 2 zonas:
 *  - Panel 1: .voice-controls[data-for="notes|abstract"] (UI ya existente)
 *  - Panel 3 (Editor): #sttStart/#sttStop/#sttLang + textarea #elemText
 *
 * Estrategia anti-duplicado:
 *  - continuous=false + keepAlive (auto-restart)
 *  - procesamos TODOS los finals nuevos del evento (clave en móvil)
 *  - filtro anti-repetición por ventana de tiempo + cache de finals recientes
 *  - añadimos solo el “tail” nuevo por solapamiento de palabras
 *
 * Extra:
 *  - En editor, grabación paralela de audio (MediaRecorder) → consumePendingAudio()
 *    (desactivada en móvil para no pelearse con SpeechRecognition)
 */

(() => {
  'use strict';

  /* ===== i18n helper ===== */
  function tt(key, fallback) {
    try {
      if (window.I18n && typeof window.I18n.t === 'function') {
        const v = window.I18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback;
  }

  /* ===== Speech API ===== */
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const HAS_SPEECH = !!SpeechRecognition;

  /* ===== Globals ===== */
  let activeDictation = null;
  const INSTANCES = new Set();

  // Audio pendiente (solo editor)
  let pendingAudio = null;

  /* ===== Helpers ===== */
  function normSpaces(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }
  function normLower(s) {
    return normSpaces(s).toLocaleLowerCase();
  }
  function splitWordsPreserve(s) {
    const x = normSpaces(s);
    return x ? x.split(' ').filter(Boolean) : [];
  }
  function splitWordsLower(s) {
    return splitWordsPreserve(s).map((w) => w.toLocaleLowerCase());
  }
  function startsWithPunctuationOrSpace(s) {
    return /^[\s,.;:!?¿¡)\]\}]/.test(String(s || ''));
  }

  function setRangeTextSafe(el, insertText, start, end) {
    const value = String(el.value || '');
    const before = value.slice(0, start);
    const after = value.slice(end);

    try {
      el.setRangeText(insertText, start, end, 'end');
    } catch {
      el.value = before + insertText + after;
    }
  }

  function capitalizeFirstMeaningfulChar(s) {
    const txt = normSpaces(s);
    if (!txt) return '';
    try {
      // intenta con unicode properties
      const m = txt.match(/^([^\p{L}]*)(\p{L})([\s\S]*)$/u);
      if (m) return m[1] + m[2].toLocaleUpperCase() + m[3];
    } catch (_) {}
    return txt.charAt(0).toLocaleUpperCase() + txt.slice(1);
  }

  /* ===== Overlap (anti-duplicado por “tail”) ===== */
  function overlapSuffixPrefixWords(aLower, bLower, maxLookback = 45) {
    const aLen = aLower.length;
    const bLen = bLower.length;
    if (aLen === 0 || bLen === 0) return 0;

    const aStart = Math.max(0, aLen - maxLookback);
    const aTail = aLower.slice(aStart);
    const A = aTail.length;

    const maxK = Math.min(A, bLen);
    for (let k = maxK; k >= 1; k--) {
      let ok = true;
      for (let i = 0; i < k; i++) {
        if (aTail[A - k + i] !== bLower[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return k;
    }
    return 0;
  }

  /* ===== Idiomas (GUI‑on UI → SpeechRecognition.lang) ===== */
  function normalizeAppLang(raw) {
    const s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace('_', '-');
    if (!s) return null;

    // normaliza algunos formatos típicos
    if (s === 'pt') return 'pt-br';
    if (s === 'zh') return 'zh-cn';
    if (s === 'ja') return 'ja-jp';
    if (s === 'ru') return 'ru-ru';

    return s;
  }

  const SPEECH_LANG_BY_APP_LANG = {
    es: 'es-ES',
    ca: 'ca-ES',
    'ca-es': 'ca-ES',
    en: 'en-US',
    'pt-br': 'pt-BR',
    fr: 'fr-FR',
    de: 'de-DE',
    it: 'it-IT',
    hi: 'hi-IN',
    'hi-in': 'hi-IN',
    'zh-cn': 'zh-CN',
    ko: 'ko-KR',
    'ja-jp': 'ja-JP',
    'ru-ru': 'ru-RU'
  };

  function getAppSpeechLang() {
    const sel = document.getElementById('langSelect');
    const appLang = normalizeAppLang(sel ? sel.value : 'es') || 'es';

    if (SPEECH_LANG_BY_APP_LANG[appLang]) return SPEECH_LANG_BY_APP_LANG[appLang];

    const primary = appLang.split('-')[0];
    if (SPEECH_LANG_BY_APP_LANG[primary]) return SPEECH_LANG_BY_APP_LANG[primary];

    return 'es-ES';
  }

  function getEditorSpeechLang(langSelectId) {
    const sel = document.getElementById(langSelectId || 'sttLang');
    const v = String(sel ? sel.value : '').trim();
    return v || getAppSpeechLang();
  }

  function isLikelyMobile() {
    try {
      if (window.matchMedia) {
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        const noHover = window.matchMedia('(hover: none)').matches;
        if (coarse && noHover) return true;
      }
    } catch (_) {}

    const ua = String(navigator.userAgent || navigator.vendor || '');
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  }

  function isFatalSpeechError(errorCode) {
    const code = String(errorCode || '').trim();
    if (!code) return false;

    if (code === 'not-allowed') return true;
    if (code === 'service-not-allowed') return true;
    if (code === 'audio-capture') return true;
    if (code === 'language-not-supported') return true;
    if (code === 'bad-grammar') return true;
    if (code === 'network' && !navigator.onLine) return true;

    return false;
  }

  /* ===== Core Dictation ===== */
  class VoiceDictation {
    constructor(opts) {
      this.el = opts.el;
      this.btnStart = opts.btnStart;
      this.btnStop = opts.btnStop;
      this.ind = opts.ind || null;

      this._getSpeechLang =
        typeof opts.getSpeechLang === 'function' ? opts.getSpeechLang : getAppSpeechLang;
      this._langSource = opts.langSource || 'app';

      this._capitalizeMode = opts.capitalizeMode || 'fieldEmpty'; // fieldEmpty | sessionTailEmpty | none
      this._getSessionStartIndex =
        typeof opts.getSessionStartIndex === 'function' ? opts.getSessionStartIndex : null;

      this._onStartHook = typeof opts.onStart === 'function' ? opts.onStart : null;
      this._onStopHook = typeof opts.onStop === 'function' ? opts.onStop : null;
      this._onFinalizeHook = typeof opts.onFinalize === 'function' ? opts.onFinalize : null;

      if (!HAS_SPEECH) {
        if (this.btnStart) this.btnStart.disabled = true;
        if (this.btnStop) this.btnStop.disabled = true;
        if (this.ind) {
          this.ind.dataset.state = 'idle';
          this.ind.title = tt(
            'dictation.status.notSupported',
            'Dictado no soportado por este navegador'
          );
        } else if (this.btnStart) {
          this.btnStart.title = tt('dictation.status.notSupportedShort', 'No soportado');
        }
        return;
      }

      this.rec = new SpeechRecognition();
      this._isMobile = isLikelyMobile();

      // ✅ móviles: continuous=false + keepAlive (restart) suele ser MUCHO más estable
      this.rec.continuous = false;
      this.rec.interimResults = !this._isMobile;
      this.rec.maxAlternatives = 1;

      this._keepAlive = false;

      // anti repetición por ventana de tiempo
      this._lastFinalNorm = '';
      this._lastFinalAt = 0;

      // cache de finals recientes (por si el engine re-dispara)
      this._recentFinals = []; // [{t, norm}]

      // guard tras restart
      this._restartGuardUntil = 0;

      this._restartTimer = null;

      // stop suave: finaliza en onend
      this._finalizeRequested = false;

      this._applyLangFromGetter();

      if (this.btnStart) {
        this.btnStart.addEventListener('click', () => this.start());
      }
      if (this.btnStop) {
        this.btnStop.addEventListener('click', () => this.stop(false));
      }

      this.rec.onstart = () => {
        this.setState('listening');
      };

      this.rec.onend = () => {
        if (this._keepAlive) {
          this._restartGuardUntil = Date.now() + 1200;

          clearTimeout(this._restartTimer);
          this._restartTimer = setTimeout(() => {
            if (!this._keepAlive) return;

            this._applyLangFromGetter();

            try {
              this.rec.start();
            } catch {
              /* ignore */
            }
          }, this._isMobile ? 380 : 250);

          return;
        }

        this.setState('idle');
        if (activeDictation === this) activeDictation = null;

        if (this._finalizeRequested) {
          this._finalizeRequested = false;
          try {
            this._onFinalizeHook && this._onFinalizeHook();
          } catch (_) {}
        }
      };

      this.rec.onerror = (e) => {
        const code = String(e && e.error ? e.error : '');
        console.warn('[GUI‑on dictado] Speech error', code || e, e);

        if (this._keepAlive && !isFatalSpeechError(code)) {
          return;
        }

        this.setState('error');
        this._keepAlive = false;
        this._finalizeRequested = false;
        if (activeDictation === this) activeDictation = null;
      };

      this.rec.onresult = (e) => {
        const finals = [];
        const startIndex = Number.isInteger(e.resultIndex) ? e.resultIndex : 0;

        for (let i = startIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (!r || !r.isFinal) continue;
          const transcript = normSpaces((r[0] && r[0].transcript) || '');
          if (transcript) finals.push(transcript);
        }

        if (!finals.length) return;
        finals.forEach((txt) => this._handleFinal(txt));
      };

      this.setState('idle');
      INSTANCES.add(this);
    }

    _applyLangFromGetter() {
      const speechLang = this._getSpeechLang();
      try {
        this.rec.lang = speechLang;
      } catch (_) {}
      this._speechLang = speechLang;
    }

    setSpeechLang(speechLang, restartIfAlive) {
      const v = String(speechLang || '').trim();
      if (!v || !HAS_SPEECH || !this.rec) return;

      try {
        this.rec.lang = v;
      } catch (_) {}
      this._speechLang = v;

      if (restartIfAlive && this._keepAlive) {
        try {
          this.rec.stop();
        } catch {}
      }
    }

    _rememberFinal(norm) {
      const now = Date.now();
      this._recentFinals.push({ t: now, norm });
      this._recentFinals = this._recentFinals.filter((x) => now - x.t < 3000);
      if (this._recentFinals.length > 16) {
        this._recentFinals = this._recentFinals.slice(this._recentFinals.length - 16);
      }
    }

    _seenFinalRecently(norm) {
      const now = Date.now();
      return this._recentFinals.some((x) => x.norm === norm && now - x.t < 1400);
    }

    _handleFinal(finalText) {
      const now = Date.now();
      const finalNorm = normLower(finalText);
      if (!finalNorm) return;

      // 1) si el motor repite el mismo final varias veces seguidas
      if (finalNorm === this._lastFinalNorm && now - this._lastFinalAt < 2000) {
        return;
      }

      // 2) repetición rápida (móviles)
      if (this._seenFinalRecently(finalNorm)) {
        return;
      }

      // 3) si acabamos de reiniciar y ese final ya está al final del campo, no lo metas otra vez
      if (now < this._restartGuardUntil) {
        const vNorm = normLower(this.el.value);
        if (vNorm && vNorm.endsWith(finalNorm)) {
          this._lastFinalNorm = finalNorm;
          this._lastFinalAt = now;
          this._rememberFinal(finalNorm);
          return;
        }
      }

      this._lastFinalNorm = finalNorm;
      this._lastFinalAt = now;
      this._rememberFinal(finalNorm);

      this._appendSmart(finalText);
    }

    _appendSmart(finalText) {
      const value = String(this.el.value || '');
      const valueTrim = value.trim();

      let candidate = normSpaces(finalText);
      if (!candidate) return;

      if (this._capitalizeMode === 'fieldEmpty') {
        if (!valueTrim) candidate = capitalizeFirstMeaningfulChar(candidate);
      } else if (this._capitalizeMode === 'sessionTailEmpty') {
        const startIdx = this._getSessionStartIndex
          ? Number(this._getSessionStartIndex() || 0)
          : 0;
        const tail = value.slice(startIdx).trim();
        if (!tail) candidate = capitalizeFirstMeaningfulChar(candidate);
      }

      const valueWordsLow = splitWordsLower(value);
      const candWords = splitWordsPreserve(candidate);
      const candWordsLow = candWords.map((w) => w.toLocaleLowerCase());

      const vNorm = normLower(value);
      const cNorm = normLower(candidate);

      // Si ya termina igual, no hacer nada
      if (vNorm && cNorm && vNorm.endsWith(cNorm)) return;

      const k = overlapSuffixPrefixWords(valueWordsLow, candWordsLow, 50);
      const remainderWords = candWords.slice(k);
      const remainder = remainderWords.join(' ').trim();

      if (!remainder) return;
      this._insertAtEnd(remainder);
    }

    _insertAtEnd(text) {
      const value = String(this.el.value || '');
      const start = value.length;
      const end = value.length;

      const needsSpace =
        value && !/\s$/.test(value) && !startsWithPunctuationOrSpace(text);

      const insertText = (needsSpace ? ' ' : '') + text;
      setRangeTextSafe(this.el, insertText, start, end);

      try {
        this.el.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
    }

    setState(s) {
      if (this.ind) this.ind.dataset.state = s;

      if (s === 'listening') {
        if (this.btnStart) this.btnStart.disabled = true;
        if (this.btnStop) this.btnStop.disabled = false;
        if (this.ind) this.ind.title = tt('dictation.status.listening', 'Captando voz');
      } else if (s === 'error') {
        if (this.btnStart) this.btnStart.disabled = false;
        if (this.btnStop) this.btnStop.disabled = true;
        if (this.ind) this.ind.title = tt('dictation.status.error', 'Error en dictado');
      } else {
        if (this.btnStart) this.btnStart.disabled = !HAS_SPEECH;
        if (this.btnStop) this.btnStop.disabled = true;
        if (this.ind) {
          this.ind.title = HAS_SPEECH
            ? tt('dictation.status.idle', 'Inactivo')
            : tt('dictation.status.notSupportedShort', 'No soportado');
        }
      }
    }

    start() {
      if (!HAS_SPEECH || !this.rec) return;
      if (this._keepAlive) return;

      // parar dictado activo si es otro
      if (activeDictation && activeDictation !== this) {
        activeDictation.stop(true);
      }

      try {
        this.el.focus({ preventScroll: true });
      } catch {
        try {
          this.el.focus();
        } catch {}
      }

      this._applyLangFromGetter();

      this._finalizeRequested = false;
      this._keepAlive = true;

      try {
        this._onStartHook && this._onStartHook();
      } catch (_) {}

      try {
        this.rec.start();
        activeDictation = this;
      } catch (err) {
        console.warn('[GUI‑on dictado] rec.start error', err);
        this._keepAlive = false;
        this.setState('idle');
        activeDictation = null;
      }
    }

    stop(silent) {
      this._keepAlive = false;
      clearTimeout(this._restartTimer);
      this._restartTimer = null;

      if (!silent) {
        try {
          this._onStopHook && this._onStopHook();
        } catch (_) {}
        this._finalizeRequested = true;
      } else {
        this._finalizeRequested = false;
      }

      try {
        this.rec.stop();
      } catch {}

      if (activeDictation === this) activeDictation = null;
      // setState('idle') se hace en onend
    }
  }

  /* ===== Panel 1: fields notes/abstract (UI existente) ===== */
  function initFields(ids) {
    if (!Array.isArray(ids)) return;

    ids.forEach((id) => {
      const textarea = document.getElementById(id);
      const wrap = document.querySelector(`.voice-controls[data-for="${id}"]`);
      if (!textarea || !wrap) return;

      // evita doble init
      if (textarea.dataset.guiOnDictadoInit === '1') return;
      textarea.dataset.guiOnDictadoInit = '1';

      const btnStart = wrap.querySelector('button[data-action="start"]');
      const btnStop = wrap.querySelector('button[data-action="stop"]');
      const ind = wrap.querySelector('.voice-indicator');

      if (!btnStart || !btnStop) return;

      new VoiceDictation({
        el: textarea,
        btnStart,
        btnStop,
        ind,
        getSpeechLang: () => getAppSpeechLang(),
        langSource: 'app',
        capitalizeMode: 'fieldEmpty'
      });
    });
  }

  /* ===== Editor: elemText + sttStart/sttStop + sttLang ===== */
  let editorInstance = null;

  function normalizeSentenceFallback(s) {
    s = String(s || '').trim();
    if (!s) return '';
    s = s.charAt(0).toUpperCase() + s.slice(1);
    s = s.replace(/\s*[.?!…]+$/, '');
    return s + '.';
  }

  function initEditorDictation(opts) {
    const o = opts || {};
    const textareaId = o.textareaId || 'elemText';
    const startBtnId = o.startBtnId || 'sttStart';
    const stopBtnId = o.stopBtnId || 'sttStop';
    const langSelectId = o.langSelectId || 'sttLang';

    const ta = document.getElementById(textareaId);
    const btnStart = document.getElementById(startBtnId);
    const btnStop = document.getElementById(stopBtnId);
    const langSel = document.getElementById(langSelectId);

    if (!ta || !btnStart || !btnStop) return;

    // evita doble init
    if (btnStart.dataset.guiOnDictadoInit === '1') return;
    btnStart.dataset.guiOnDictadoInit = '1';

    if (!HAS_SPEECH) {
      btnStart.disabled = true;
      btnStop.disabled = true;
      btnStart.title = tt(
        'dictation.status.notSupported',
        'Dictado no soportado por este navegador'
      );
      return;
    }

    const editorState = {
      sessionStartIndex: 0,
      micStream: null,
      mediaRec: null,
      mediaChunks: []
    };

    const enableParallelAudio = o.captureAudio !== false && !isLikelyMobile();

    function startAudioCapture() {
      if (!enableParallelAudio) return;
      pendingAudio = null;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      if (!window.MediaRecorder) return;

      // limpia anterior
      try {
        if (editorState.mediaRec && editorState.mediaRec.state !== 'inactive') {
          editorState.mediaRec.stop();
        }
      } catch (_) {}
      editorState.mediaRec = null;

      try {
        if (editorState.micStream) editorState.micStream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      editorState.micStream = null;

      editorState.mediaChunks = [];

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          editorState.micStream = stream;

          let mr = null;
          try {
            mr = new MediaRecorder(stream);
          } catch (err) {
            console.warn('[GUI‑on dictado] MediaRecorder error', err);
            try {
              stream.getTracks().forEach((t) => t.stop());
            } catch (_) {}
            editorState.micStream = null;
            return;
          }

          editorState.mediaRec = mr;

          mr.ondataavailable = (e) => {
            if (e && e.data && e.data.size) editorState.mediaChunks.push(e.data);
          };

          mr.onstop = () => {
            try {
              stream.getTracks().forEach((t) => t.stop());
            } catch (_) {}
            editorState.micStream = null;

            try {
              const blob = new Blob(editorState.mediaChunks, {
                type: mr.mimeType || 'audio/webm'
              });
              const url = URL.createObjectURL(blob);
              pendingAudio = { url, mime: blob.type, silenceMs: 0, muted: false };
            } catch (err) {
              console.warn('[GUI‑on dictado] audio blob error', err);
            } finally {
              editorState.mediaChunks = [];
              editorState.mediaRec = null;
            }
          };

          try {
            mr.start();
          } catch (err) {
            console.warn('[GUI‑on dictado] mediaRec.start error', err);
            try {
              stream.getTracks().forEach((t) => t.stop());
            } catch (_) {}
            editorState.micStream = null;
            editorState.mediaRec = null;
          }
        })
        .catch((err) => {
          console.warn('[GUI‑on dictado] No se pudo acceder al micrófono (audio)', err);
          try {
            if (window.showToast) {
              window.showToast(
                tt('msg.micDenied', 'No se pudo acceder al micrófono'),
                'warning'
              );
            }
          } catch (_) {}
        });
    }

    function stopAudioCapture() {
      if (!enableParallelAudio) return;

      try {
        if (editorState.mediaRec && editorState.mediaRec.state !== 'inactive') {
          editorState.mediaRec.stop();
        }
      } catch (_) {
        try {
          if (editorState.micStream) editorState.micStream.getTracks().forEach((t) => t.stop());
        } catch (__) {}
        editorState.micStream = null;
        editorState.mediaRec = null;
      }
    }

    function finalizeTextarea() {
      const startIdx = Number(editorState.sessionStartIndex || 0);
      const before = ta.value.slice(0, startIdx).trimEnd();
      let tail = ta.value.slice(startIdx).trim();
      if (!tail) return;

      const normalizeFn =
        typeof window.normalizeSentence === 'function'
          ? window.normalizeSentence
          : normalizeSentenceFallback;

      tail = normalizeFn(tail);

      let out = before
        ? before + (before.endsWith('\n') ? '' : '\n') + tail
        : tail;

      out = out.replace(/\s+$/, '');

      if (out && !/[.?!…]["')»”’]*$/.test(out)) out += '.';

      ta.value = out;

      try {
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
    }

    editorInstance = new VoiceDictation({
      el: ta,
      btnStart,
      btnStop,
      ind: null,
      getSpeechLang: () => getEditorSpeechLang(langSelectId),
      langSource: 'editor',
      capitalizeMode: 'sessionTailEmpty',
      getSessionStartIndex: () => editorState.sessionStartIndex,
      onStart: () => {
        editorState.sessionStartIndex = ta.value.length;
        pendingAudio = null;
        startAudioCapture();
      },
      onStop: () => {
        stopAudioCapture();
      },
      onFinalize: () => {
        finalizeTextarea();
      }
    });

    // Si el usuario cambia idioma manualmente, aplica (y reinicia si está dictando)
    if (langSel) {
      langSel.addEventListener('change', () => {
        if (!editorInstance) return;
        const speech = getEditorSpeechLang(langSelectId);
        editorInstance.setSpeechLang(speech, true);
      });
    }
  }

  function stopAll() {
    INSTANCES.forEach((inst) => {
      try {
        inst.stop(true);
      } catch (_) {}
    });
  }

  function consumePendingAudio() {
    const x = pendingAudio;
    pendingAudio = null;
    return x || null;
  }

  // Auto-sync: si cambia idioma de la app, actualiza dictados del Panel 1
  (function bindAppLangWatcher() {
    const sel = document.getElementById('langSelect');
    if (!sel) return;

    sel.addEventListener('change', () => {
      const speech = getAppSpeechLang();
      INSTANCES.forEach((inst) => {
        if (!inst || typeof inst.setSpeechLang !== 'function') return;
        if (inst._langSource !== 'app') return;
        inst.setSpeechLang(speech, true);
      });
    });
  })();

  /* ===== Public API ===== */
  window.GUIonDictado = {
    HAS_SPEECH,
    initFields,
    initEditorDictation,
    stopAll,
    consumePendingAudio,
    _debug: () => ({
      HAS_SPEECH,
      hasActive: !!activeDictation,
      hasPendingAudio: !!pendingAudio
    })
  };
})();
