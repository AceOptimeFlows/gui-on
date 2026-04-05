/* GUI‑on — PWA Offline (Podcast/Teatro/Cine)
 * - 7 idiomas con cambio instantáneo
 * - 8 temas
 * - Editor de guion por elementos
 * - Dictado en vivo + transcripción offline opcional
 * - Exportación a PDF con formateo por tipo
 * - 100% offline con Service Worker
 */

/* ===== DOM helpers ===== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ===== Utilidades ===== */
const pxPerMm = 96 / 25.4;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const todayISO = () => new Date().toISOString().slice(0, 10);
const fontStack = (f) => {
  if (f === 'mono')
    return 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  return 'system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,Cantarell,Arial,"Noto Sans","Noto Sans CJK SC","Noto Sans SC","PingFang SC","Microsoft YaHei","WenQuanYi Micro Hei","Hiragino Sans GB","Helvetica Neue",sans-serif';
};

const rgba = (hex, alpha = 1) => {
  const v = (hex || '#000').replace('#', '');
  const r = parseInt(v.slice(0, 2), 16) || 0,
    g = parseInt(v.slice(2, 4), 16) || 0,
    b = parseInt(v.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
};

function showToast(msg, type = 'info') {
  try {
    const host =
      document.getElementById('toastHost') ||
      (() => {
        const d = document.createElement('div');
        d.id = 'toastHost';
        d.className = 'toast-host';
        document.body.appendChild(d);
        return d;
      })();
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = String(msg || '');
    host.appendChild(t);
    setTimeout(() => {
      try {
        t.remove();
      } catch {}
    }, 3400);
  } catch {}
}

function t(key) {
  return window.I18n && typeof window.I18n.t === 'function' ? window.I18n.t(key) : key;
}

function tr(key, fallback = '') {
  const value = t(key);
  return value && value !== key ? value : fallback;
}

function applyI18n(root) {
  if (window.I18n && typeof window.I18n.applyI18nToDom === 'function') {
    window.I18n.applyI18nToDom(root || document);
  }
}

const APP_LANG_TO_STT_LANG = {
  es: 'es-ES',
  ca: 'ca-ES',
  en: 'en-US',
  'pt-BR': 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  hi: 'hi-IN',
  'zh-CN': 'zh-CN',
  ko: 'ko-KR',
  'ja-JP': 'ja-JP',
  'ru-RU': 'ru-RU'
};

function syncEditorSttLang() {
  const stt = document.getElementById('sttLang');
  if (stt) stt.value = APP_LANG_TO_STT_LANG[state?.ui?.lang] || 'es-ES';
}

/* ===== Estado ===== */
const LS_KEY = 'GUIon:data';
const LS_STYLE = 'GUIon:styles';
const LS_PRESETS = 'GUIon:presets';

const defaultState = {
  meta: {
    title: 'GUI‑on',
    logline: '',
    author: '',
    email: '',
    date: '',
    license: '',
    keywords: '',
    notes: '',
    abstract: ''
  },
  ui: {
    lang: 'es',
    theme: 'abyss',
    selectedTpl: null
  },
  script: {
    type: 'film',
    characters: [],
    scenes: []
  },
  export: {
    pageSize: 'A4',
    margins: { top: 25, bottom: 25, left: 32, right: 25 },
    headerFooter: 'pageNum',
    blockNewPage: false,
    hfRule: false,
    pdfName: 'guion.pdf'
  },
  styles: {}
};

let state = loadState();
let deferredInstallPrompt = null;
let installUiState = 'idle';

/* ===== Carga / guardado ===== */
function sanitizeExportConfig(exportCfg) {
  const clean = { ...(exportCfg || {}) };
  delete clean.twoCols;
  delete clean.colsActionOnly;
  clean.blockNewPage = !!clean.blockNewPage;
  return clean;
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(defaultState);
    const obj = JSON.parse(raw);
    const out = structuredClone(defaultState);
    out.meta = { ...out.meta, ...(obj.meta || {}) };
    out.ui = { ...out.ui, ...(obj.ui || {}) };
    out.script = { ...out.script, ...(obj.script || {}) };
    out.script.characters = obj.script?.characters || [];
    out.script.scenes = obj.script?.scenes || [];
    out.export = { ...out.export, ...sanitizeExportConfig(obj.export) };
    out.styles = obj.styles || {};
    return out;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  if (typeof maybeRenderPreview === 'function') maybeRenderPreview();
}

/* ===== App init (1 sola vez) ===== */
document.addEventListener('DOMContentLoaded', async () => {
  // idioma actual (carga)
  try {
    if (window.I18n && typeof window.I18n.setLang === 'function') {
      await window.I18n.setLang(state.ui.lang || 'es');
    }
  } catch {}

  initBrandControls();
  initSettingsPanel();
  initSteps();

  hydratePanel1();
  refreshScriptTypeSelect();

  bindPanel1();
  bindPanel2();
  bindPanel3();

  if (typeof bindPanel5 === 'function') bindPanel5();
  if (typeof bindPreviewPanel === 'function') bindPreviewPanel();

  refreshSelScene();
  refreshCharSelects();
  renderElements();

  applyI18n();
  syncInstallUI();
  if (window.GUIonOfflineSTT && typeof window.GUIonOfflineSTT.refreshI18n === 'function') {
    window.GUIonOfflineSTT.refreshI18n();
  }

  registerSW();
  updateOfflineBadge(navigator.onLine);
  window.addEventListener('online', () => updateOfflineBadge(true));
  window.addEventListener('offline', () => updateOfflineBadge(false));
});

/* ===== Brand controls (idioma / tema) ===== */
let __brandControlsInited = false;

function initBrandControls() {
  if (__brandControlsInited) return;

  const langSel = document.getElementById('langSelect');
  const themeSel = document.getElementById('themeSelect');

  if (!langSel || !themeSel) return;

  __brandControlsInited = true;

  langSel.value = state.ui.lang;
  themeSel.value = state.ui.theme;
  setTheme(state.ui.theme);

  langSel.addEventListener('change', async (e) => {
    state.ui.lang = e.target.value;
    saveState();

    // cargar idioma
    try {
      if (window.I18n && typeof window.I18n.setLang === 'function') {
        await window.I18n.setLang(state.ui.lang);
      }
    } catch {}

    applyI18n();
    if (window.GUIonOfflineSTT && typeof window.GUIonOfflineSTT.refreshI18n === 'function') {
      window.GUIonOfflineSTT.refreshI18n();
    }

    // refresca selects dependientes de i18n
    fillPresetSelect();
    refreshScriptTypeSelect();

    // Fuerza reconstrucción diferida del panel “Formato” para ver textos traducidos
    document.querySelectorAll('.format-panel').forEach((p) => {
      p.dataset.ready = '';
      p.innerHTML = '';
    });

    syncInstallUI();
    syncEditorSttLang();
  });

  themeSel.addEventListener('change', (e) => {
    state.ui.theme = e.target.value;
    setTheme(state.ui.theme);
    saveState();
  });
}

function setTheme(name) {
  document.body.classList.remove(
    ...[
      'theme-abyss',
      'theme-dawn',
      'theme-matrix',
      'theme-rose',
      'theme-paper',
      'theme-grape',
      'theme-copper',
      'theme-ocean'
    ]
  );
  document.body.classList.add('theme-' + name);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const themeColors = {
      abyss: '#0f172a',
      dawn: '#9f1239',
      matrix: '#166534',
      rose: '#9d174d',
      paper: '#e5e7eb',
      grape: '#4c1d95',
      copper: '#92400e',
      ocean: '#0e7490'
    };
    metaTheme.setAttribute('content', themeColors[name] || '#0f172a');
  }
}

function updateOfflineBadge(isOnline) {
  const b = $('#offlineBadge');
  if (!b) return;
  b.textContent = t('badge.offline');
}

/* ===== Panel de ajustes (engranaje + instalación PWA) ===== */
let __settingsPanelInited = false;

function isStandalonePWA() {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  } catch {
    return false;
  }
}

function isIOSDevice() {
  try {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
  } catch {
    return false;
  }
}

function getManualInstallMessage() {
  if (isStandalonePWA()) {
    return tr('install.installed', 'App instalada.');
  }

  if (isIOSDevice()) {
    return 'En iPhone/iPad: comparte la página y pulsa «Añadir a pantalla de inicio». Luego funcionará offline.';
  }

  return 'Si tu navegador no muestra el instalador automático, abre el menú del navegador y elige «Instalar app» o «Añadir a pantalla de inicio». Luego funcionará offline.';
}

function syncInstallUI() {
  const installBtn = document.getElementById('installBtn');
  const installStatus = document.getElementById('installStatus');

  if (isStandalonePWA()) {
    installUiState = 'installed';
  }

  if (installBtn) {
    installBtn.disabled = isStandalonePWA() || installUiState === 'accepted';
  }

  if (!installStatus) return;

  if (installUiState === 'installed') {
    installStatus.textContent = tr('install.installed', 'App instalada.');
    return;
  }

  if (installUiState === 'accepted') {
    installStatus.textContent = tr('install.installed', 'App instalada o en proceso.');
    return;
  }

  if (installUiState === 'ready' && deferredInstallPrompt) {
    installStatus.textContent = tr(
      'install.ready',
      'Instalación lista: pulsa en «Instalar app».'
    );
    return;
  }

  installStatus.textContent = getManualInstallMessage();
}

function initSettingsPanel() {
  if (__settingsPanelInited) return;

  const toggleBtn = document.getElementById('settingsToggle');
  const panel = document.getElementById('settingsPanel');
  if (!toggleBtn || !panel) return;

  __settingsPanelInited = true;

  const installBtn = document.getElementById('installBtn');
  const installStatus = document.getElementById('installStatus');

  const closePanel = () => {
    panel.classList.remove('open');
    panel.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
  };
  const openPanel = () => {
    panel.classList.add('open');
    panel.hidden = false;
    toggleBtn.setAttribute('aria-expanded', 'true');
  };
  const togglePanel = () => {
    if (panel.classList.contains('open')) closePanel();
    else openPanel();
  };

  // Estado inicial coherente
  closePanel();

  toggleBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    togglePanel();
  });

  // Cerrar al hacer click fuera
  document.addEventListener('click', (ev) => {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || toggleBtn.contains(ev.target)) return;
    closePanel();
  });

  // Cerrar con ESC
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && panel.classList.contains('open')) {
      closePanel();
    }
  });

  // Botón de instalación PWA
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        const msg = getManualInstallMessage();
        showToast(msg, isStandalonePWA() ? 'success' : 'info');
        if (installStatus) installStatus.textContent = msg;
        return;
      }

      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;

        if (choice.outcome === 'accepted') {
          installUiState = 'accepted';
          showToast(tr('install.accepted', 'Instalación iniciada.'), 'success');
        } else {
          installUiState = 'idle';
          showToast(tr('install.dismissed', 'Instalación cancelada.'), 'info');
        }
      } catch {
        installUiState = deferredInstallPrompt ? 'ready' : 'idle';
        showToast('No se pudo lanzar la instalación.', 'danger');
      } finally {
        deferredInstallPrompt = null;
        syncInstallUI();
      }
    });

    syncInstallUI();
  }
}

// Evento PWA: el navegador avisa de que se puede instalar
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  deferredInstallPrompt = ev;
  installUiState = 'ready';
  syncInstallUI();
});

// Evento PWA: la app ya se instaló
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installUiState = 'installed';
  syncInstallUI();
  showToast(tr('install.thanks', '¡Gracias por instalar GUI‑on!'), 'success');
});

/* ===== Steps nav ===== */
function initSteps() {
  $$('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.step-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-target');
      $$('.panel').forEach((p) => p.classList.remove('active'));
      $(target).classList.add('active');
      if (target === '#panelPreview' && typeof renderPreview === 'function') {
        renderPreview();
      }
    });
  });
}

/* ===== Panel 1 ===== */
function hydratePanel1() {
  $('#scriptType').value = state.ui.selectedTpl
    ? 'tpl:' + state.ui.selectedTpl
    : state.script.type;

  $('#title').value = state.meta.title;
  $('#logline').value = state.meta.logline;
  $('#author').value = state.meta.author;
  $('#email').value = state.meta.email;
  $('#pubDate').value = state.meta.date || '';
  $('#license').value = state.meta.license;
  $('#keywords').value = state.meta.keywords;
  $('#notes').value = state.meta.notes;
  $('#abstract').value = state.meta.abstract;
}

function bindPanel1() {
  $('#scriptType').addEventListener('change', (e) => {
    const val = e.target.value;

    toggleTplNew(val === 'custom-new');

    if (val === 'film' || val === 'theatre' || val === 'podcast') {
      state.ui.selectedTpl = null;
      applyTypePreset(val);
      saveState();
      if (typeof maybeRenderPreview === 'function') maybeRenderPreview(true);
      return;
    }

    if (val === 'custom-new') {
      saveState();
      return;
    }

    if (val.startsWith('tpl:')) {
      const name = val.slice(4);
      const lib = loadPresetLibrary();
      const found = lib.find((p) => p.name === name);
      if (found) {
        applyPreset(found);
        state.ui.selectedTpl = name;
        if (found.scriptType) {
          state.script.type = found.scriptType;
        }
        saveState();
        if (typeof hydratePanel5 === 'function') hydratePanel5();
        if (typeof maybeRenderPreview === 'function') maybeRenderPreview(true);
      } else {
        showToast('Plantilla no encontrada', 'danger');
      }
    }
  });

  $('#tplLoad')?.addEventListener('click', () => {
    if (typeof pickJSONFile !== 'function') {
      showToast('Falta pickJSONFile (¿export.js?)', 'danger');
      return;
    }
    pickJSONFile((data) => {
      try {
        const preset = normalizePreset(JSON.parse(data));
        preset.name = preset.name || 'Plantilla importada ' + new Date().toLocaleString();
        addPresetToLibrary(preset);
        refreshScriptTypeSelect();
        $('#scriptType').value = 'tpl:' + preset.name;
        state.ui.selectedTpl = preset.name;
        if (preset.scriptType) {
          state.script.type = preset.scriptType;
        }
        applyPreset(preset);
        saveState();
        if (typeof hydratePanel5 === 'function') hydratePanel5();
        if (typeof maybeRenderPreview === 'function') maybeRenderPreview(true);
        showToast('Plantilla importada y aplicada', 'success');
      } catch {
        showToast('Preset inválido', 'danger');
      }
    });
  });

  function toggleTplNew(show) {
    const box = document.querySelector('.tpl-new');
    if (box) {
      box.classList.toggle('hidden', !show);
    }
  }

  $('#tplSave')?.addEventListener('click', () => {
    const sel = $('#scriptType').value;
    if (sel !== 'custom-new') {
      showToast('Elige “Nueva plantilla” y nómbrala para guardar.', 'warning');
      return;
    }
    const name = ($('#tplName').value || '').trim();
    if (!name) {
      showToast('Escribe un nombre para la plantilla', 'warning');
      return;
    }

    const preset = {
      name,
      scriptType: state.script.type,
      styles: state.styles || {}
    };
    addPresetToLibrary(preset);
    refreshScriptTypeSelect();
    $('#scriptType').value = 'tpl:' + name;
    state.ui.selectedTpl = name;
    saveState();
    showToast('Plantilla guardada', 'success');
  });

  $('#tplExport')?.addEventListener('click', () => {
    if (typeof downloadJSON !== 'function') {
      showToast('Falta downloadJSON (¿export.js?)', 'danger');
      return;
    }
    const raw = ($('#tplName').value || '').trim() || 'Plantilla';
    const name = raw.replace(/\.json$/i, '');
    const payload = {
      name,
      scriptType: state.script.type,
      styles: state.styles || {}
    };
    downloadJSON(`${name}.json`, payload);
    showToast('Plantilla exportada', 'success');
  });

  const map = {
    title: '#title',
    logline: '#logline',
    author: '#author',
    email: '#email',
    license: '#license',
    keywords: '#keywords',
    notes: '#notes',
    abstract: '#abstract'
  };
  for (const [k, sel] of Object.entries(map)) {
    $(sel).addEventListener('input', (e) => {
      state.meta[k] = e.target.value;
      saveState();
    });
  }
  $('#pubDate').addEventListener('change', (e) => {
    state.meta.date = e.target.value;
    saveState();
  });

  // ✅ Dictado Panel 1 se inicializa desde dictado.js
  if (window.GUIonDictado && typeof window.GUIonDictado.initFields === 'function') {
    window.GUIonDictado.initFields(['notes', 'abstract']);
  }
}

function applyFormatPreset(preset) {
  if (preset === 'film-classic' || (preset === 'auto' && state.script.type === 'film')) {
    state.export.margins = { top: 25, bottom: 25, left: 38, right: 25 };
    state.export.headerFooter = 'pageNum';
  } else if (
    preset === 'theatre-europe' ||
    (preset === 'auto' && state.script.type === 'theatre')
  ) {
    state.export.margins = { top: 25, bottom: 25, left: 30, right: 25 };
    state.export.headerFooter = 'full';
  } else if (
    preset === 'podcast-standard' ||
    (preset === 'auto' && state.script.type === 'podcast')
  ) {
    state.export.margins = { top: 20, bottom: 20, left: 25, right: 25 };
    state.export.headerFooter = 'pageNum';
  }
  saveState();
  if (typeof hydratePanel5 === 'function') hydratePanel5();
}

/* ===== Plantillas unificadas: select dinámico y presets por tipo ===== */
function refreshScriptTypeSelect() {
  const sel = document.getElementById('scriptType');
  if (!sel) return;

  const current = state.ui.selectedTpl
    ? 'tpl:' + state.ui.selectedTpl
    : state.script.type || 'film';

  sel.innerHTML = '';
  [
    ['film', t('types.film') || 'Cine'],
    ['theatre', t('types.theatre') || 'Teatro'],
    ['podcast', t('types.podcast') || 'Podcast'],
    ['custom-new', 'Nueva plantilla']
  ].forEach(([v, txt]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = txt;
    sel.appendChild(o);
  });

  try {
    const lib = loadPresetLibrary();
    const mine = lib.filter((p) => !p.builtIn);
    if (mine.length) {
      const og = document.createElement('optgroup');
      og.label = 'Mis plantillas';
      mine.forEach((p) => {
        const o = document.createElement('option');
        o.value = 'tpl:' + p.name;
        o.textContent = p.name;
        og.appendChild(o);
      });
      sel.appendChild(og);
    }
  } catch {}

  sel.value = current;

  const showNew = sel.value === 'custom-new';
  const box = document.querySelector('.tpl-new');
  if (box) {
    box.classList.toggle('hidden', !showNew);
  }
}

function applyTypePreset(type) {
  state.script.type = type;

  if (type === 'podcast') {
    state.export.margins = { top: 20, bottom: 20, left: 25, right: 25 };
    state.export.headerFooter = 'pageNum';

    const base11 = {
      font: 'sans',
      size: 11,
      align: 'justify',
      weight: 400,
      italic: false,
      underline: false,
      color: '#000000'
    };
    state.styles = {
      SLUGLINE: { ...base11, size: 13, weight: 700 },
      SCENE: { ...base11, size: 15, weight: 700 },
      ACTION: { ...base11 },
      CHAR: { ...base11 },
      DIALOGUE: { ...base11 },
      PAREN: { ...base11 },
      TRANS: { ...base11 },
      MUSIC: { ...base11 },
      NOTE: { ...base11 },
      TIME: { ...base11 },
      SFX: { ...base11, italic: true, color: '#666666' }
    };
    return;
  }

  const builtins = makeBuiltinPresets();
  const found = builtins.find((p) => p.scriptType === type);
  if (found) {
    if (found.export) state.export = { ...state.export, ...found.export };
    state.styles = { ...(found.styles || {}) };
  }
}

/* ===== Panel 2: Personajes & Estructura ===== */
function bindPanel2() {
  $('#addChar').addEventListener('click', () => {
    const name = ($('#charName').value || '').trim();
    if (!name) return;
    state.script.characters.push({ id: crypto.randomUUID(), name });
    $('#charName').value = '';
    saveState();
    renderCharacters();
    refreshCharSelects();
  });
  $('#addScene').addEventListener('click', () => {
    const title =
      ($('#sceneTitle').value || '').trim() || `Escena ${state.script.scenes.length + 1}`;
    state.script.scenes.push({ id: crypto.randomUUID(), title, elements: [] });
    $('#sceneTitle').value = '';
    saveState();
    renderScenes();
    refreshSelScene();
  });
  renderCharacters();
  renderScenes();
}

function renderCharacters() {
  const ul = $('#charList');
  ul.innerHTML = '';
  state.script.characters.forEach((ch) => {
    const li = document.createElement('li');
    const name = document.createElement('div');
    name.textContent = ch.name;
    const tools = document.createElement('div');

    const edt = document.createElement('button');
    edt.className = 'ghost';
    edt.textContent = '✎';
    edt.addEventListener('click', () => {
      const nuevo = prompt('Nuevo nombre para el personaje:', ch.name);
      if (!nuevo) return;
      ch.name = nuevo.trim();
      saveState();
      renderCharacters();
      refreshCharSelects();
      renderElements();
    });

    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      let count = 0;
      state.script.scenes.forEach((s) => {
        s.elements.forEach((e) => {
          if (e.charId === ch.id && (e.type === 'CHARACTER' || e.type === 'DIALOGUE')) count++;
        });
      });

      if (count > 0) {
        const ren = confirm(
          `Este personaje tiene ${count} bloques (personaje/diálogo).\n\nAceptar: RENOMBRAR a otro nombre y conservar diálogos.\n\nCancelar: Preguntar si deseas BORRAR sus diálogos.`
        );
        if (ren) {
          const nuevo = prompt('Cambiar a nombre:', ch.name);
          if (nuevo && nuevo.trim()) {
            ch.name = nuevo.trim();
            saveState();
            renderCharacters();
            refreshCharSelects();
            renderElements();
          }
          return;
        } else {
          const sure = confirm(
            '¿Eliminar personaje y BORRAR todos sus diálogos? Esta acción no se puede deshacer.'
          );
          if (!sure) return;
          state.script.scenes.forEach((s) => {
            s.elements = s.elements.filter(
              (e) => !(e.charId === ch.id && (e.type === 'CHARACTER' || e.type === 'DIALOGUE'))
            );
          });
        }
      }

      state.script.characters = state.script.characters.filter((c) => c.id !== ch.id);
      saveState();
      renderCharacters();
      refreshCharSelects();
      renderElements();
    });

    tools.append(edt, del);
    li.appendChild(name);
    li.appendChild(tools);

    ul.appendChild(li);
  });
}

function renderScenes() {
  const ul = $('#sceneList');
  ul.innerHTML = '';
  state.script.scenes.forEach((sc) => {
    const li = document.createElement('li');
    const name = document.createElement('div');
    name.textContent = sc.title;
    const tools = document.createElement('div');
    const up = document.createElement('button');
    up.textContent = '▲';
    up.className = 'ghost';
    up.addEventListener('click', () => moveScene(sc.id, -1));
    const down = document.createElement('button');
    down.textContent = '▼';
    down.className = 'ghost';
    down.addEventListener('click', () => moveScene(sc.id, 1));
    const del = document.createElement('button');
    del.textContent = '✕';
    del.className = 'danger';
    del.addEventListener('click', () => {
      state.script.scenes = state.script.scenes.filter((s) => s.id !== sc.id);
      saveState();
      renderScenes();
      refreshSelScene();
      renderElements();
    });
    tools.append(up, down, del);
    li.append(name, tools);
    ul.appendChild(li);
  });
}

function moveScene(id, delta) {
  const i = state.script.scenes.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.script.scenes.length) return;
  const tmp = state.script.scenes[j];
  state.script.scenes[j] = state.script.scenes[i];
  state.script.scenes[i] = tmp;
  saveState();
  renderScenes();
  refreshSelScene();
  renderElements();
}

/* ===== Panel 3: Editor ===== */
function bindPanel3() {
  $('#elemType').addEventListener('change', onElemTypeChange);
  $('#addElem').onclick = addElementFromForm;
  $('#clearElem').addEventListener('click', () => {
    $('#elemText').value = '';
    $('#elemType').value = 'ACTION';
    onElemTypeChange();
  });

  $('#selScene').addEventListener('change', renderElements);
  $('#selScene').addEventListener('change', () => {
    renderElements();
    const sc = state.script.scenes.find((x) => x.id === $('#selScene').value);
    const cb = $('#sceneVisible');
    if (cb && sc) cb.checked = sc.showHeading !== false;
  });

  const initSc = state.script.scenes[0];
  const cbInit = $('#sceneVisible');
  if (cbInit) cbInit.checked = initSc ? initSc.showHeading !== false : true;

  $('#sceneVisible')?.addEventListener('change', (e) => {
    const sc = state.script.scenes.find((x) => x.id === $('#selScene').value);
    if (!sc) return;
    sc.showHeading = !!e.target.checked;
    saveState();
    if (typeof maybeRenderPreview === 'function') maybeRenderPreview(true);
  });

  onElemTypeChange();

  syncEditorSttLang();

  // ✅ Dictado Editor se inicializa desde dictado.js (anti-duplicados móvil + audio)
  if (window.GUIonDictado && typeof window.GUIonDictado.initEditorDictation === 'function') {
    window.GUIonDictado.initEditorDictation({
      textareaId: 'elemText',
      startBtnId: 'sttStart',
      stopBtnId: 'sttStop',
      langSelectId: 'sttLang'
    });
  }

  // ✅ Transcripción offline real (WASM local + modelo local)
  if (window.GUIonOfflineSTT && typeof window.GUIonOfflineSTT.init === 'function') {
    window.GUIonOfflineSTT.init({
      textareaId: 'elemText',
      langSelectId: 'sttLang',
      panelId: 'offlineMini',
      openBtnId: 'sttOfflineOpen',
      closeBtnId: 'sttOfflineCloseMini',
      runBtnId: 'sttOfflineRunMini',
      cancelBtnId: 'sttOfflineCancelMini',
      statusId: 'sttOfflineStatusMini',
      modelInputId: 'sttModelFileMini',
      modelPickBtnId: 'sttModelPickMini',
      modelNameId: 'sttModelFileNameMini',
      audioInputId: 'sttAudioFileMini',
      audioPickBtnId: 'sttAudioPickMini',
      audioNameId: 'sttAudioFileNameMini'
    });
  }
}

function refreshSelScene() {
  const sel = $('#selScene');
  sel.innerHTML = '';
  state.script.scenes.forEach((s, i) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${i + 1}. ${s.title}`;
    sel.appendChild(o);
  });
  if (state.script.scenes[0]) sel.value = state.script.scenes[0].id;
}

function refreshCharSelects() {
  const fills = ['#elemChar'];
  fills.forEach((id) => {
    const sel = $(id);
    if (!sel) return;
    sel.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '—';
    sel.appendChild(none);
    state.script.characters.forEach((c) => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
  });
}

function onElemTypeChange() {
  const ty = $('#elemType').value;
  $('#charField').style.display = ty === 'CHARACTER' || ty === 'DIALOGUE' ? '' : 'none';
}

function addElementFromForm() {
  const sceneId = $('#selScene').value;
  const s = state.script.scenes.find((x) => x.id === sceneId);
  if (!s) {
    showToast('Primero crea una Sección para poder insertar elementos.', 'warning');
    return;
  }

  const type = $('#elemType').value;
  const text = ($('#elemText').value || '').trim();
  const charId = $('#elemChar').value || null;

  if (type === 'CHARACTER' && !charId) {
    showToast('Elige un personaje/voz.', 'warning');
    return;
  }
  if (!text && type !== 'SLUGLINE' && type !== 'CHARACTER' && type !== 'TIME') {
    showToast('Falta texto.', 'warning');
    return;
  }

  let newEl = null;
  if (type === 'CHARACTER') {
    s.elements.push({ id: crypto.randomUUID(), type: 'CHARACTER', text: '', charId });
    if (text) {
      const tNorm = normalizeSentence(text);
      newEl = {
        id: crypto.randomUUID(),
        type: 'DIALOGUE',
        text: tNorm,
        charId,
        gapAfterMm: 4
      };
      s.elements.push(newEl);
    }
  } else {
    newEl = { id: crypto.randomUUID(), type, text, charId };
    s.elements.push(newEl);
  }
  if (newEl && newEl.gapAfterMm == null) newEl.gapAfterMm = 4;

  // ✅ Audio capturado por dictado.js (si existe)
  if (newEl && window.GUIonDictado && typeof window.GUIonDictado.consumePendingAudio === 'function') {
    const pa = window.GUIonDictado.consumePendingAudio();
    if (pa && pa.url) {
      newEl.audio = { url: pa.url, mime: pa.mime, silenceMs: 0, muted: false };
    }
  }

  $('#elemText').value = '';
  saveState();
  renderElements();
  showToast('Elemento insertado', 'success');
}

function renderElements() {
  const host = $('#elementsList');
  host.innerHTML = '';
  const sceneId = $('#selScene').value;
  const s = state.script.scenes.find((x) => x.id === sceneId);
  if (!s) return;

  for (let i = 0; i < s.elements.length; i++) {
    const el = s.elements[i];
    const next = s.elements[i + 1];

    const isPair =
      el &&
      el.type === 'CHARACTER' &&
      next &&
      next.type === 'DIALOGUE' &&
      next.charId === el.charId;

    const card = document.createElement('div');
    card.className = 'elem-card';
    const type = document.createElement('div');
    type.className = 'type';
    const text = document.createElement('div');
    text.className = 'text';
    const tools = document.createElement('div');
    tools.className = 'tools';

    if (isPair) {
      const name = state.script.characters.find((c) => c.id === el.charId)?.name || 'CHAR';
      type.textContent = t('elem.CHARACTER');
      text.textContent = `${name}: ${next.text || ''}`;

      const gap = mkGapInput(next.gapAfterMm || 0, (valMm) => {
        next.gapAfterMm = clamp(Number(valMm || 0), 0, 60);
        saveState();
      });

      const up = btn('▲', 'ghost', () => movePair(s, i, -1));
      const down = btn('▼', 'ghost', () => movePair(s, i, 1));
      const edit = btn('✎', 'ghost', () => editElem(s, i));
      const del = btn('✕', 'danger', () => {
        s.elements.splice(i, 2);
        saveState();
        renderElements();
      });
      const au = mkAudioUI(next);
      tools.append(au.ind, au.mic, au.mute, gap, up, down, edit, del);

      card.append(type, text, tools);
      host.appendChild(card);
      i++;
    } else {
      type.textContent = t('elem.' + el.type) || el.type;
      text.textContent = formatElementPreview(el);

      const gap = mkGapInput(el.gapAfterMm || 0, (valMm) => {
        el.gapAfterMm = clamp(Number(valMm || 0), 0, 60);
        saveState();
      });

      const up = btn('▲', 'ghost', () => moveElem(s, i, -1));
      const down = btn('▼', 'ghost', () => moveElem(s, i, 1));
      const edit = btn('✎', 'ghost', () => editElem(s, i));
      const del = btn('✕', 'danger', () => {
        s.elements.splice(i, 1);
        saveState();
        renderElements();
      });
      const au = mkAudioUI(el);
      tools.append(au.ind, au.mic, au.mute, gap, up, down, edit, del);

      card.append(type, text, tools);
      host.appendChild(card);
    }
  }

  const fmtWrap = document.createElement('div');
  const fmtBtn = document.createElement('button');
  fmtBtn.className = 'ghost';
  fmtBtn.textContent = t('actions.format');
  const fmtPanel = document.createElement('div');
  fmtPanel.className = 'format-panel hidden';
  fmtWrap.append(fmtBtn, fmtPanel);
  host.appendChild(fmtWrap);

  fmtBtn.addEventListener('click', () => {
    fmtPanel.classList.toggle('hidden');
    if (!fmtPanel.dataset.ready) {
      buildFormatPanel(fmtPanel);
      fmtPanel.dataset.ready = '1';
    }
  });

  function mkGapInput(value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'gap';
    const lab = document.createElement('label');
    lab.textContent = t('p3.spacing');
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '0';
    inp.max = '60';
    inp.step = '1';
    inp.value = value || 0;
    inp.title = t('p3.spacing') + ' (mm)';
    inp.addEventListener('change', () => onChange(inp.value));
    wrap.append(lab, inp);
    return wrap;
  }

  function mkAudioUI(e) {
    const ind = document.createElement('span');
    ind.className = 'audio-ind' + (e?.audio && e.audio.url ? ' on' : '');

    const mic = document.createElement('button');
    mic.className = 'btn-mic';
    mic.title = 'Audio';
    mic.textContent = '🎙️';
    mic.addEventListener('click', () => openAudioPanel(e, ind));

    const mute = document.createElement('label');
    mute.className = 'mute-wrap';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!(e?.audio && e.audio.muted);
    cb.addEventListener('change', () => {
      e.audio = e.audio || { silenceMs: 0 };
      e.audio.muted = cb.checked;
      saveState();
    });
    mute.append(cb, document.createTextNode(' ' + t('p3.mute')));

    return { ind, mic, mute };
  }

  function openAudioPanel(e, indRef) {
    e.audio = e.audio || { silenceMs: 0, muted: false };
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.display = 'flex';
    const box = document.createElement('div');
    box.className = 'box audio-box';
    const h = document.createElement('h3');
    h.textContent = 'Audio del elemento';
    const audio = document.createElement('audio');
    audio.controls = true;
    if (e.audio.url) audio.src = e.audio.url;

    const lSil = document.createElement('label');
    lSil.textContent = t('p3.silenceTail');
    const iSil = document.createElement('input');
    iSil.type = 'number';
    iSil.min = '0';
    iSil.step = '50';
    iSil.value = e.audio.silenceMs || 0;
    iSil.addEventListener('input', () => {
      e.audio.silenceMs = clamp(Number(iSil.value || 0), 0, 600000);
      saveState();
    });

    const btnRec = document.createElement('button');
    btnRec.className = 'primary';
    btnRec.textContent = 'Grabar de nuevo';
    const btnDel = document.createElement('button');
    btnDel.className = 'danger';
    btnDel.textContent = 'Eliminar';
    const btnClose = document.createElement('button');
    btnClose.className = 'ghost';
    btnClose.textContent = 'Cerrar';

    let recM = null,
      recStr = null,
      recChunks = [];
    btnRec.addEventListener('click', async () => {
      if (recM && recM.state === 'recording') {
        try {
          recM.stop();
        } catch {}
        btnRec.textContent = 'Grabar de nuevo';
        return;
      }
      try {
        recStr = await navigator.mediaDevices.getUserMedia({ audio: true });
        recChunks = [];
        recM = new MediaRecorder(recStr);
        recM.ondataavailable = (ev) => {
          if (ev.data && ev.data.size) recChunks.push(ev.data);
        };
        recM.onstop = () => {
          try {
            recStr.getTracks().forEach((t) => t.stop());
          } catch {}
          const blob = new Blob(recChunks, { type: recM.mimeType || 'audio/webm' });
          const url = URL.createObjectURL(blob);
          e.audio = { ...(e.audio || {}), url, mime: blob.type, muted: false };
          audio.src = url;
          indRef.classList.add('on');
          saveState();
        };
        recM.start();
        btnRec.textContent = 'Parar';
      } catch {
        showToast('No se pudo acceder al micro', 'danger');
      }
    });

    btnDel.addEventListener('click', () => {
      e.audio = null;
      audio.removeAttribute('src');
      indRef.classList.remove('on');
      saveState();
      showToast('Audio eliminado', 'success');
    });
    btnClose.addEventListener('click', () => {
      ov.remove();
    });

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(btnRec, btnDel, btnClose);

    box.append(h, audio, lSil, iSil, actions);
    ov.append(box);
    document.body.appendChild(ov);
  }

  function buildFormatPanel(box) {
    const TYPES = [
      ['SLUGLINE', t('fmt.label.SLUGLINE')],
      ['SCENE', t('fmt.label.SCENE')],
      ['ACTION', t('fmt.label.ACTION')],
      ['CHAR', t('fmt.label.CHAR')],
      ['PAREN', t('fmt.label.PAREN')],
      ['DIALOGUE', t('fmt.label.DIALOGUE')],
      ['TRANS', t('fmt.label.TRANS')],
      ['SFX', t('fmt.label.SFX')],
      ['MUSIC', t('fmt.label.MUSIC')],
      ['NOTE', t('fmt.label.NOTE')],
      ['TIME', t('fmt.label.TIME')]
    ];
    const grid = document.createElement('div');
    grid.className = 'format-grid';

    TYPES.forEach(([key, labelI18n]) => {
      const baseEff = fmtFor(state, key);
      const card = document.createElement('div');
      card.className = 'format-card';
      const h = document.createElement('h4');
      h.textContent = labelI18n;
      card.appendChild(h);

      let charSel = null;
      let editKey = key;
      if (key === 'CHAR' || key === 'DIALOGUE') {
        const r0 = document.createElement('div');
        r0.className = 'row';
        const l0 = document.createElement('label');
        l0.textContent = t('fmt.character');
        charSel = document.createElement('select');
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = t('fmt.global');
        charSel.appendChild(opt0);
        (state.script.characters || []).forEach((c) => {
          const o = document.createElement('option');
          o.value = c.id;
          o.textContent = c.name;
          charSel.appendChild(o);
        });
        r0.append(l0, charSel);
        card.append(r0);
      }

      const r1 = document.createElement('div');
      r1.className = 'row';
      const lf = document.createElement('label');
      lf.textContent = t('fmt.font');
      const sf = document.createElement('select');
      ['sans', 'mono'].forEach((f) => {
        const o = document.createElement('option');
        o.value = f;
        o.textContent = f === 'mono' ? t('fmt.font.mono') : t('fmt.font.sans');
        if ((state.styles?.[key]?.font || baseEff.font) === f) o.selected = true;
        sf.appendChild(o);
      });
      r1.append(lf, sf);
      card.append(r1);

      const r2 = document.createElement('div');
      r2.className = 'row';
      const ls = document.createElement('label');
      ls.textContent = t('fmt.size');
      const isz = document.createElement('input');
      isz.type = 'number';
      isz.min = '8';
      isz.max = '72';
      isz.step = '1';
      isz.value = state.styles?.[key]?.size || baseEff.size;
      r2.append(ls, isz);
      card.append(r2);

      let sa = null;
      if (key !== 'CHAR') {
        const r3 = document.createElement('div');
        r3.className = 'row';
        const la = document.createElement('label');
        la.textContent = t('fmt.align');
        sa = document.createElement('select');
        [
          ['left', t('fmt.align.left')],
          ['center', t('fmt.align.center')],
          ['right', t('fmt.align.right')],
          ['justify', t('fmt.align.justify')]
        ].forEach(([v, txt]) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = txt;
          if ((state.styles?.[key]?.align || baseEff.align || 'left') === v) o.selected = true;
          sa.appendChild(o);
        });
        r3.append(la, sa);
        card.append(r3);
      }

      const r4 = document.createElement('div');
      r4.className = 'row';
      const lc = document.createElement('label');
      lc.textContent = t('fmt.color');
      const ic = document.createElement('input');
      ic.type = 'color';
      ic.value = state.styles?.[key]?.color || baseEff.color || '#111111';
      r4.append(lc, ic);
      card.append(r4);

      const r5 = document.createElement('div');
      r5.className = 'row';
      const lx = document.createElement('label');
      lx.textContent = t('fmt.alpha');
      const ia = document.createElement('input');
      ia.type = 'number';
      ia.min = '0';
      ia.max = '1';
      ia.step = '0.05';
      ia.value = state.styles?.[key]?.alpha ?? baseEff.alpha ?? 1;
      r5.append(lx, ia);
      card.append(r5);

      const toggles = document.createElement('div');
      toggles.className = 'toggles';
      const mkT = (on, label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'format-toggle';
        b.textContent = label;
        b.dataset.on = on ? '1' : '0';
        if (on) b.style.outline = '2px solid var(--primary)';
        b.addEventListener('click', () => {
          b.dataset.on = b.dataset.on === '1' ? '0' : '1';
          b.style.outline = b.dataset.on === '1' ? '2px solid var(--primary)' : 'none';
        });
        return b;
      };
      const bold = mkT(!!((state.styles?.[key]?.weight ?? baseEff.weight) >= 700), t('fmt.bold'));
      const ital = mkT(!!(state.styles?.[key]?.italic ?? baseEff.italic), t('fmt.italic'));
      const undl = mkT(!!(state.styles?.[key]?.underline ?? baseEff.underline), t('fmt.underline'));
      toggles.append(bold, ital, undl);
      card.append(toggles);

      const ok = document.createElement('button');
      ok.className = 'primary';
      ok.textContent = t('fmt.ok');
      ok.addEventListener('click', () => {
        const o = {
          font: sf.value,
          size: clamp(Number(isz.value || baseEff.size), 8, 72),
          ...(sa ? { align: sa.value } : {}),
          color: ic.value,
          alpha: clamp(Number(ia.value ?? 1), 0, 1),
          italic: ital.dataset.on === '1',
          underline: undl.dataset.on === '1',
          weight: bold.dataset.on === '1' ? 700 : 400
        };

        editKey = charSel && charSel.value ? key + ':' + charSel.value : key;
        state.styles = state.styles || {};
        state.styles[editKey] = { ...(state.styles[editKey] || {}), ...o };
        saveState();
        const who =
          charSel && charSel.value ? ' · ' + charSel.options[charSel.selectedIndex].text : '';
        showToast(t('fmt.label.' + key) + who + ': ' + t('fmt.ok'), 'success');
      });
      card.append(ok);

      function applyValuesFrom(k) {
        const cur = { ...baseEff, ...(state.styles?.[k] || {}) };
        sf.value = cur.font || baseEff.font;
        isz.value = cur.size;
        if (sa) sa.value = cur.align || 'left';
        ic.value = cur.color || '#111111';
        ia.value = cur.alpha != null ? cur.alpha : 1;
        bold.dataset.on = cur.weight >= 700 ? '1' : '0';
        bold.style.outline = bold.dataset.on === '1' ? '2px solid var(--primary)' : 'none';
        ital.dataset.on = cur.italic ? '1' : '0';
        ital.style.outline = ital.dataset.on === '1' ? '2px solid var(--primary)' : 'none';
        undl.dataset.on = cur.underline ? '1' : '0';
        undl.style.outline = undl.dataset.on === '1' ? '2px solid var(--primary)' : 'none';
      }
      if (charSel) {
        charSel.addEventListener('change', () => {
          editKey = charSel.value ? key + ':' + charSel.value : key;
          applyValuesFrom(editKey);
        });
        editKey = key;
        applyValuesFrom(editKey);
      }

      grid.appendChild(card);
    });

    box.appendChild(grid);
  }

  function btn(label, cls, fn) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = cls;
    b.addEventListener('click', fn);
    return b;
  }
}

function moveElem(scene, i, delta) {
  const j = i + delta;
  if (i < 0 || j < 0 || j >= scene.elements.length) return;
  const tmp = scene.elements[j];
  scene.elements[j] = scene.elements[i];
  scene.elements[i] = tmp;
  saveState();
  renderElements();
}

function movePair(scene, i, delta) {
  if (i < 0 || i + 1 >= scene.elements.length) return;

  if (delta < 0) {
    const prev1 = scene.elements[i - 1];
    const prev2 = scene.elements[i - 2];
    const prevIsPair =
      prev2 &&
      prev1 &&
      prev2.type === 'CHARACTER' &&
      prev1.type === 'DIALOGUE' &&
      prev1.charId === prev2.charId;
    const insertAt = prevIsPair ? i - 2 : i - 1;
    if (insertAt < 0) return;

    const block = scene.elements.splice(i, 2);
    scene.elements.splice(insertAt, 0, ...block);
  } else if (delta > 0) {
    if (i + 2 >= scene.elements.length) return;
    const nextStart = i + 2;
    const n1 = scene.elements[nextStart];
    const n2 = scene.elements[nextStart + 1];
    const nextIsPair =
      n1 && n2 && n1.type === 'CHARACTER' && n2.type === 'DIALOGUE' && n2.charId === n1.charId;

    const block = scene.elements.splice(i, 2);
    let insertAt = i;
    insertAt += nextIsPair ? 2 : 1;
    scene.elements.splice(insertAt, 0, ...block);
  }
  saveState();
  renderElements();
}

function editElem(scene, i) {
  const el = scene.elements[i];
  if (!el) return;
  const prev = scene.elements[i - 1];
  const next = scene.elements[i + 1];

  const isPairFwd = el.type === 'CHARACTER' && next && next.type === 'DIALOGUE' && next.charId === el.charId;
  const isPairBack = el.type === 'DIALOGUE' && prev && prev.type === 'CHARACTER' && prev.charId === el.charId;
  const pairStart = isPairFwd ? i : isPairBack ? i - 1 : -1;

  const btn = $('#addElem');

  if (pairStart >= 0) {
    const charEl = scene.elements[pairStart];
    const dialEl = scene.elements[pairStart + 1];

    $('#elemType').value = 'CHARACTER';
    onElemTypeChange();
    $('#elemChar').value = charEl.charId || '';
    $('#elemText').value = dialEl.text || '';

    btn.textContent = t('actions.update');
    btn.onclick = () => {
      const newType = $('#elemType').value;
      const newChar = $('#elemChar').value || null;
      const newText = $('#elemText').value;

      if (newType === 'CHARACTER') {
        charEl.charId = newChar;
        dialEl.charId = newChar;
        dialEl.text = normalizeSentence(newText);
      } else {
        charEl.type = newType;
        charEl.charId = newType === 'DIALOGUE' || newType === 'CHARACTER' ? newChar : null;
        charEl.text = newType === 'DIALOGUE' ? normalizeSentence(newText) : newText;
        if (dialEl?.audio && !charEl.audio) charEl.audio = dialEl.audio;
        if (dialEl?.gapAfterMm != null && charEl.gapAfterMm == null) charEl.gapAfterMm = dialEl.gapAfterMm;
        scene.elements.splice(pairStart + 1, 1);
      }

      saveState();
      renderElements();

      $('#elemText').value = '';
      $('#elemType').value = 'ACTION';
      onElemTypeChange();
      btn.textContent = t('actions.insert');
      btn.onclick = addElementFromForm;
    };
  } else {
    $('#elemType').value = el.type;
    onElemTypeChange();
    $('#elemChar').value = el.charId || '';
    $('#elemText').value = el.text || '';

    btn.textContent = t('actions.update');
    btn.onclick = () => {
      const newType = $('#elemType').value;
      const newChar = $('#elemChar').value || null;
      const newText = $('#elemText').value;

      el.type = newType;
      el.charId = newChar;
      el.text = newType === 'DIALOGUE' ? normalizeSentence(newText) : newText;

      saveState();
      renderElements();

      $('#elemText').value = '';
      $('#elemType').value = 'ACTION';
      onElemTypeChange();
      btn.textContent = t('actions.insert');
      btn.onclick = addElementFromForm;
    };
  }
}

function formatElementPreview(el) {
  if (el.type === 'CHARACTER') {
    const c = state.script.characters.find((c) => c.id === el.charId);
    return (c ? c.name : 'CHAR') + ':';
  }
  if (el.type === 'SLUGLINE') {
    return (el.text || '').toUpperCase();
  }
  if (el.type === 'TIME') {
    return `[${el.text || '00:00'}]`;
  }
  return el.text || '';
}

/* ===== Normalización de frases (usado en varios sitios, no solo dictado) ===== */
function normalizeSentence(s) {
  s = String(s || '').trim();
  if (!s) return '';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  s = s.replace(/\s*[.?!…]+$/, '');
  return s + '.';
}

/* ==== Librería de plantillas (localStorage) + 3 predefinidas ==== */
function loadPresetLibrary() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_PRESETS) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function savePresetLibrary(arr) {
  localStorage.setItem(LS_PRESETS, JSON.stringify(arr));
}

function makeBuiltinPresets() {
  return [
    {
      name: 'Podcast Standard',
      builtIn: true,
      scriptType: 'podcast',
      ui: { theme: 'ocean' },
      export: {
        margins: { top: 20, bottom: 20, left: 25, right: 25 },
        headerFooter: 'pageNum',
        blockNewPage: false,
        hfRule: false
      },
      styles: {
        ACTION: { font: 'sans', size: 14, leading: 1.55, align: 'left' },
        CHAR: { font: 'sans', size: 14, weight: 800, align: 'left' },
        DIALOGUE: { font: 'sans', size: 14, leading: 1.45, align: 'left' },
        PAREN: { font: 'sans', size: 13, italic: true, color: '#333333' },
        SFX: { italic: true, color: '#333333' },
        MUSIC: { italic: true, color: '#333333' },
        TRANS: { font: 'sans', size: 12, align: 'right', color: '#333333' },
        TIME: { font: 'sans', size: 12, align: 'right', color: '#444444' },
        SCENE: { font: 'sans', size: 18, weight: 700 }
      }
    },
    {
      name: 'Teatro Standard',
      builtIn: true,
      scriptType: 'theatre',
      ui: { theme: 'grape' },
      export: {
        margins: { top: 25, bottom: 25, left: 30, right: 25 },
        headerFooter: 'full',
        blockNewPage: false,
        hfRule: false
      },
      styles: {
        ACTION: { font: 'sans', size: 14, leading: 1.5, align: 'justify' },
        CHAR: { font: 'sans', size: 14, weight: 700, align: 'left' },
        DIALOGUE: { font: 'sans', size: 14, leading: 1.4, align: 'left' },
        PAREN: { font: 'sans', size: 13, italic: true, color: '#333333' },
        TRANS: { font: 'sans', size: 13, align: 'right', color: '#333333' },
        TIME: { font: 'sans', size: 12, align: 'right', color: '#444444' },
        SCENE: { font: 'sans', size: 18, weight: 700 }
      }
    },
    {
      name: 'Cine Standard',
      builtIn: true,
      scriptType: 'film',
      ui: { theme: 'paper' },
      export: {
        margins: { top: 25, bottom: 25, left: 38, right: 25 },
        headerFooter: 'pageNum',
        blockNewPage: false,
        hfRule: true
      },
      styles: {
        ACTION: { font: 'mono', size: 12, leading: 1.5, align: 'left' },
        CHAR: { font: 'mono', size: 12, weight: 700, align: 'center' },
        DIALOGUE: { font: 'mono', size: 12, leading: 1.35, align: 'left' },
        PAREN: { font: 'mono', size: 11, italic: true, color: '#333333' },
        TRANS: { font: 'mono', size: 12, align: 'right', color: '#333333' },
        TIME: { font: 'mono', size: 12, align: 'right', color: '#444444' },
        SCENE: { font: 'mono', size: 18, weight: 700 }
      }
    }
  ];
}

function ensureBuiltinPresets() {
  let lib = loadPresetLibrary();
  const names = new Set(lib.map((p) => p.name));
  for (const p of makeBuiltinPresets()) {
    if (!names.has(p.name)) {
      lib.push(p);
      names.add(p.name);
    }
  }
  savePresetLibrary(lib);
}

function fillPresetSelect() {
  ensureBuiltinPresets();
  const sel = document.getElementById('presetSelect');
  if (!sel) return;
  const lib = loadPresetLibrary();
  sel.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = t('presets.choose');
  sel.appendChild(ph);
  lib.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.name;
    if (p.builtIn) {
      const byType = {
        podcast: 'presets.name.podcastStd',
        theatre: 'presets.name.theatreStd',
        film: 'presets.name.filmStd'
      };
      o.textContent = t(byType[p.scriptType] || p.name);
    } else {
      o.textContent = p.name;
    }
    sel.appendChild(o);
  });
}

function normalizePreset(preset) {
  return {
    name: preset.name || undefined,
    ui: preset.ui || undefined,
    export: preset.export ? sanitizeExportConfig(preset.export) : undefined,
    styles: preset.styles || undefined,
    scriptType: preset.scriptType || preset.script?.type || undefined
  };
}

function addPresetToLibrary(preset) {
  const lib = loadPresetLibrary();
  const idx = lib.findIndex((x) => x.name === preset.name);
  if (idx >= 0) {
    if (lib[idx].builtIn) {
      showToast('No puedes sobrescribir una plantilla predefinida', 'warning');
      return;
    }
    lib[idx] = preset;
  } else {
    lib.push(preset);
  }
  savePresetLibrary(lib);
}

function applyPreset(preset) {
  const p = normalizePreset(preset);
  if (p.export) state.export = { ...state.export, ...sanitizeExportConfig(p.export) };
  if (p.styles) state.styles = { ...(state.styles || {}), ...p.styles };
  if (p.ui?.theme) {
    state.ui.theme = p.ui.theme;
    setTheme(state.ui.theme);
    const th = document.getElementById('themeSelect');
    if (th) th.value = state.ui.theme;
  }
  if (p.scriptType) {
    state.script.type = p.scriptType;
    const stSel = document.getElementById('scriptType');
    if (stSel) stSel.value = p.scriptType;
  }
  saveState();
  if (typeof hydratePanel5 === 'function') hydratePanel5();
  showToast('Plantilla cargada: ' + (preset.name || ''), 'success');
}

/* ===== Formatos tipográficos por tipo de guion ===== */
function fmtFor(S, what) {
  const type = S.script.type;
  const base = { size: 14, leading: 1.4, color: '#111111', alpha: 1, font: type === 'film' ? 'mono' : 'sans' };

  const map = {
    TITLE: { size: 28, leading: 1.3, font: 'sans', weight: 800 },
    SUBTITLE: { size: 18, leading: 1.3, font: 'sans' },
    META: { size: 11, leading: 1.4, font: 'sans', color: '#333333' },

    SCENE: { size: 18, leading: 1.2, font: type === 'film' ? 'mono' : 'sans', weight: 700 },
    SLUGLINE: { size: type === 'film' ? 12 : 14, leading: 1.2, font: type === 'film' ? 'mono' : 'sans', weight: 700, align: 'left' },
    ACTION: { size: type === 'film' ? 12 : 14, leading: 1.5, font: type === 'film' ? 'mono' : 'sans', align: 'justify' },

    CHAR: { size: type === 'film' ? 12 : 14, leading: 1.2, font: type === 'film' ? 'mono' : 'sans', weight: 700 },
    PAREN: { size: type === 'film' ? 11 : 13, leading: 1.2, font: type === 'film' ? 'mono' : 'sans', italic: true, color: '#333333' },
    DIALOGUE: { size: type === 'film' ? 12 : 14, leading: 1.35, font: type === 'film' ? 'mono' : 'sans' },
    TRANS: { size: type === 'film' ? 12 : 13, leading: 1.2, font: type === 'film' ? 'mono' : 'sans', color: '#333333', align: 'left' },

    SFX: { size: 13, leading: 1.35, italic: true, color: '#333333' },
    MUSIC: { size: 13, leading: 1.35, italic: true },
    NOTE: { size: 12, leading: 1.35, color: '#444' },
    TIME: { size: 12, leading: 1.2, color: '#444' }
  };
  const override = (S.styles && S.styles[what]) || {};
  return { ...base, ...(map[what] || {}), ...override };
}

/* ===== Service Worker ===== */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  const RELOAD_KEY = 'GUIon:sw:reload-on-control';

  try {
    // Si ya estamos controlados, limpiamos la marca para permitir futuros updates.
    if (navigator.serviceWorker.controller) {
      sessionStorage.removeItem(RELOAD_KEY);
    }
  } catch {}

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === '1') return;
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch {}

    try {
      window.location.reload();
    } catch {}
  });

  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((reg) => {
      const pokeWaitingWorker = () => {
        try {
          reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
        } catch {}
      };

      pokeWaitingWorker();

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            pokeWaitingWorker();
          }
        });
      });

      try {
        reg.update();
      } catch {}

      navigator.serviceWorker.ready
        .then((readyReg) => {
          try {
            readyReg.active?.postMessage({ type: 'PRECACHE_ALL' });
          } catch {}
        })
        .catch(() => {});
    })
    .catch(() => {});
}
