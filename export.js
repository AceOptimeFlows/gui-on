/* GUI‑on — export.js
 * - Panel 5: Exportar
 * - Helpers JSON (download / import)
 * - Exportación a PDF (print window/iframe)
 * - Exportación de audio (mezcla a WAV)
 *
 * Nota: Este archivo asume que en app.js existen (en el ámbito global):
 *  - $, clamp, pxPerMm, fontStack, rgba, showToast, fmtFor
 *  - defaultState, state, renderCharacters, renderScenes, refreshSelScene, refreshCharSelects, renderElements
 *  - ensureBuiltinPresets, fillPresetSelect, loadPresetLibrary, addPresetToLibrary, applyPreset, normalizePreset, hydratePanel1
 */

/* ===== Demo Podcast (Panel 5) =====
 * - Inyecta un botón "Cargar Demo Podcast" en el panel Exportar (sin tocar HTML)
 * - Carga el guion demo DESDE es.json (los textos viven ahí)
 *
 * Espera encontrar en es.json una clave:
 *   "demo_podcast": { meta:{...}, script:{ type:"podcast", characters:[...], scenes:[...] } }
 *
 * Si tu es.json vive en otra ruta, este loader prueba varias rutas comunes:
 *   es.json | i18n/es.json | locales/es.json | lang/es.json | assets/i18n/es.json (y variantes ./ y /)
 */

function _deepGet(obj, path){
  if(!obj || typeof obj !== 'object') return undefined;
  if(typeof path !== 'string' || !path.length) return undefined;

  // soporte: clave directa
  if(Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];

  // soporte: ruta a.b.c
  const parts = path.split('.');
  let cur = obj;
  for(const p of parts){
    if(!cur || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function _parseMaybeJSON(v){
  if(typeof v !== 'string') return v;
  const s = v.trim();
  if(!s) return v;
  if((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))){
    try{ return JSON.parse(s); }catch{ return v; }
  }
  return v;
}

async function _fetchFirstJSON(paths){
  for(const p of paths){
    try{
      const r = await fetch(p, { cache:'no-store' });
      if(!r.ok) continue;
      const j = await r.json();
      return j;
    }catch{
      // seguimos probando
    }
  }
  return null;
}

function _getLocaleString(key, fallback){
  // 1) función global t(key)
  try{
    if(typeof t === 'function'){
      const v = t(key);
      if(typeof v === 'string' && v.trim()) return v;
    }
  }catch{}

  // 2) buscar en almacenes típicos globales
  try{
    const lang =
      (state && state.ui && (state.ui.lang || state.ui.locale || state.ui.language)) ||
      document.documentElement.getAttribute('lang') ||
      'es';

    const roots = [
      window.I18N,
      window.LOCALES,
      window.TRANSLATIONS,
      window.translations,
      window.messages,
      window.i18n,
      window.locale,
      window.lang
    ].filter(Boolean);

    for(const root of roots){
      const dict = (root && (root[lang] || root.es || root)) || null;
      if(!dict || typeof dict !== 'object') continue;
      const v = _deepGet(dict, key);
      if(typeof v === 'string' && v.trim()) return v;
    }
  }catch{}

  return fallback;
}

async function _resolveDemoPodcastPayload(){
  // 1) si por algún motivo existe ya en memoria
  try{
    const lang =
      (state && state.ui && (state.ui.lang || state.ui.locale || state.ui.language)) ||
      document.documentElement.getAttribute('lang') ||
      'es';

    const roots = [
      window.I18N,
      window.LOCALES,
      window.TRANSLATIONS,
      window.translations,
      window.messages,
      window.i18n
    ].filter(Boolean);

    for(const root of roots){
      const dict = (root && (root[lang] || root.es || root)) || null;
      if(!dict || typeof dict !== 'object') continue;

      const raw =
        dict.demo_podcast ??
        dict.demoPodcast ??
        _deepGet(dict, 'demo_podcast') ??
        _deepGet(dict, 'demoPodcast') ??
        _deepGet(dict, 'export.demo_podcast') ??
        _deepGet(dict, 'export.demoPodcast');

      const parsed = _parseMaybeJSON(raw);
      if(parsed && typeof parsed === 'object') return parsed;
    }
  }catch{}

  // 2) intentar vía t() por si tu i18n devuelve objetos o JSON-string
  try{
    if(typeof t === 'function'){
      const keys = ['demo_podcast', 'demoPodcast', 'export.demo_podcast', 'export.demoPodcast'];
      for(const k of keys){
        const raw = t(k);
        const parsed = _parseMaybeJSON(raw);
        if(parsed && typeof parsed === 'object') return parsed;
      }
    }
  }catch{}

  // 3) fetch directo a es.json (rutas comunes)
  const paths = [
    'es.json',
    './es.json',
    '/es.json',
    'i18n/es.json',
    './i18n/es.json',
    '/i18n/es.json',
    'locales/es.json',
    './locales/es.json',
    '/locales/es.json',
    'lang/es.json',
    './lang/es.json',
    '/lang/es.json',
    'assets/i18n/es.json',
    './assets/i18n/es.json',
    '/assets/i18n/es.json'
  ];

  const j = await _fetchFirstJSON(paths);
  if(!j || typeof j !== 'object') return null;

  const raw =
    j.demo_podcast ??
    j.demoPodcast ??
    _deepGet(j, 'demo_podcast') ??
    _deepGet(j, 'demoPodcast') ??
    _deepGet(j, 'export.demo_podcast') ??
    _deepGet(j, 'export.demoPodcast');

  const parsed = _parseMaybeJSON(raw);
  if(parsed && typeof parsed === 'object') return parsed;

  return null;
}

function _normalizeDemoPodcast(payload){
  if(!payload || typeof payload !== 'object') return null;

  const meta = (payload.meta && typeof payload.meta === 'object') ? payload.meta : (payload.meta || {});
  let script = null;

  if(payload.script && typeof payload.script === 'object'){
    script = payload.script;
  }else if(Array.isArray(payload.characters) && Array.isArray(payload.scenes)){
    script = { type:'podcast', characters: payload.characters, scenes: payload.scenes };
  }

  if(!script || typeof script !== 'object') return null;

  const out = {
    meta: meta || {},
    script: {
      type: script.type || 'podcast',
      characters: Array.isArray(script.characters) ? script.characters : [],
      scenes: Array.isArray(script.scenes) ? script.scenes : []
    }
  };

  // asegurar IDs mínimos
  out.script.characters = out.script.characters.map((c, i)=>({
    id: c.id || `c${i+1}`,
    name: c.name || `PERSONAJE ${i+1}`,
    ...c
  }));

  out.script.scenes = out.script.scenes.map((s, i)=>({
    id: s.id || `s${i+1}`,
    title: s.title || `Escena ${i+1}`,
    showHeading: (s.showHeading !== false),
    elements: Array.isArray(s.elements) ? s.elements.map((e, k)=>({ id: e.id || `e${i+1}_${k+1}`, ...e })) : []
  }));

  return out;
}

function _hasProjectData(S){
  try{
    if((S?.script?.characters||[]).length) return true;
    if((S?.script?.scenes||[]).length) return true;
    if((S?.meta?.title||'').trim()) return true;
    if((S?.meta?.author||'').trim()) return true;
    if((S?.meta?.logline||'').trim()) return true;
  }catch{}
  return false;
}

async function loadDemoPodcastProject(){
  try{
    const payload = await _resolveDemoPodcastPayload();
    const demo = _normalizeDemoPodcast(payload);

    if(!demo){
      showToast('No se pudo cargar la demo: falta demo_podcast en es.json', 'danger');
      return;
    }

    // Si hay algo en el proyecto actual, pedimos confirmación (para no pisar trabajo)
    if(_hasProjectData(state)){
      if(!confirm('Esto reemplazará tu proyecto actual por una DEMO Podcast. ¿Continuar?')) return;
    }

    // Conservamos export/ui/styles del usuario para que la demo sirva para probar formatos sin tocar ajustes
    const keepExport = structuredClone(state.export);
    const keepUI     = structuredClone(state.ui);
    const keepStyles = structuredClone(state.styles);

    // Reseteo limpio
    state = structuredClone(defaultState);

    // Restauro ajustes
    state.export = keepExport;
    state.ui     = keepUI;
    state.styles = keepStyles;

    // Aplico demo
    state.meta = { ...state.meta, ...demo.meta };
    state.script = { ...state.script, ...demo.script, type:'podcast' };

    // (Opcional amigable) si el nombre es el default, ponemos uno de demo
    if(!state.export.pdfName || state.export.pdfName === 'guion.pdf'){
      state.export.pdfName = 'demo_podcast.pdf';
    }

    saveState();
    hydratePanel1();
    renderCharacters();
    renderScenes();
    refreshSelScene();
    refreshCharSelects();
    renderElements();
    hydratePanel5();

    showToast('Demo Podcast cargada', 'success');
  }catch(err){
    console.error(err);
    showToast('No se pudo cargar la demo', 'danger');
  }
}

function injectDemoPodcastButton(){
  // Evitar duplicados
  if(document.getElementById('loadDemoPodcast')) return;

  // Punto de inserción: cerca de Exportar PDF si existe
  const exportPDFBtn = document.getElementById('exportPDF');
  const exportAudioBtn = document.getElementById('exportAudio');
  const anchor = exportPDFBtn || exportAudioBtn || document.getElementById('clearAll') || document.getElementById('loadJSON') || document.getElementById('saveJSON');

  if(!anchor || !anchor.parentElement) return;

  const btn = document.createElement('button');
  btn.id = 'loadDemoPodcast';
  btn.type = 'button';
  btn.className = 'ghost';
  btn.textContent = _getLocaleString('demo_podcast_btn', 'Cargar Demo Podcast');
  btn.title = 'Carga un guion demo (Podcast) con 6 personajes y 3 escenas para probar exportación rápido';

  // Insertamos antes de exportPDF si existe, para que quede en la zona de export
  if(exportPDFBtn && exportPDFBtn.parentElement){
    exportPDFBtn.parentElement.insertBefore(btn, exportPDFBtn);
  }else{
    anchor.parentElement.appendChild(btn);
  }

  btn.addEventListener('click', () => { void loadDemoPodcastProject(); });
}

/* ===== Panel 5: Exportar ===== */
function hydratePanel5(){
  $('#pageSize').value = state.export.pageSize;
  $('#headerFooter').value = state.export.headerFooter;
  $('#blockNewPage').checked = !!state.export.blockNewPage;
  $('#hfRule').checked = !!state.export.hfRule;

  $('#pdfName').value = state.export.pdfName;

  const sideSel = $('#marginSide');
  const valInp = $('#marginValue');
  const side = sideSel ? (sideSel.value || 'top') : 'top';
  if(sideSel) sideSel.value = side;
  if(valInp)  valInp.value  = state.export.margins[side];
}

function bindPanel5(){
  hydratePanel5();

  // Aseguramos que la librería de presets está inicializada,
  // pero si no hay <select id="presetSelect"> no pasa nada.
  ensureBuiltinPresets();
  fillPresetSelect();

  // Tamaño de página
  const pageSizeEl = $('#pageSize');
  if (pageSizeEl) {
    pageSizeEl.addEventListener('change', e => {
      state.export.pageSize = e.target.value;
      saveState();
    });
  }

  // Márgenes: selecciona lado y guarda al escribir
  const marginSideEl  = $('#marginSide');
  const marginValueEl = $('#marginValue');

  if (marginSideEl && marginValueEl) {
    marginSideEl.addEventListener('change', e => {
      const side = e.target.value;
      marginValueEl.value = clamp(Number(state.export.margins[side] || 25), 5, 60);
    });

    marginValueEl.addEventListener('input', e => {
      const side = marginSideEl.value || 'top';
      const val  = clamp(Number(e.target.value || 0), 5, 60);
      state.export.margins[side] = val;
      saveState();
      showToast(`Margen ${side} = ${val} mm`, 'success');
    });
  }

  // Cabecero / pie de página
  const headerFooterEl = $('#headerFooter');
  if (headerFooterEl) {
    headerFooterEl.addEventListener('change', e => {
      state.export.headerFooter = e.target.value;
      saveState();
    });
  }

  // Salto entre bloques
  const blockNewPageEl = $('#blockNewPage');
  if (blockNewPageEl) {
    blockNewPageEl.addEventListener('change', e => {
      state.export.blockNewPage = e.target.checked;
      saveState();
    });
  }

  const hfRuleEl = $('#hfRule');
  if (hfRuleEl) {
    hfRuleEl.addEventListener('change', e => {
      state.export.hfRule = e.target.checked;
      saveState();
    });
  }

  // Nombre del archivo
  const pdfNameEl = $('#pdfName');
  if (pdfNameEl) {
    pdfNameEl.addEventListener('input', e => {
      state.export.pdfName = e.target.value || 'guion.pdf';
      saveState();
    });
  }

  // Guardar / cargar JSON de proyecto
  const saveJSONBtn = $('#saveJSON');
  if (saveJSONBtn) {
    saveJSONBtn.addEventListener('click', () => downloadJSON('guion.json', state));
  }

  const loadJSONBtn = $('#loadJSON');
  if (loadJSONBtn) {
    loadJSONBtn.addEventListener('click', () => pickJSONFile(data => {
      try {
        state = { ...structuredClone(defaultState), ...JSON.parse(data) };
        if (typeof sanitizeExportConfig === 'function') {
          state.export = { ...structuredClone(defaultState).export, ...sanitizeExportConfig(state.export) };
        }
        saveState();
        hydratePanel1();
        renderCharacters();
        renderScenes();
        refreshSelScene();
        refreshCharSelects();
        renderElements();
        hydratePanel5();
      } catch {
        showToast('JSON inválido', 'danger');
      }
    }));
  }

  // Limpiar todo
  const clearAllBtn = $('#clearAll');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (!confirm('¿Seguro que quieres limpiar TODOS los datos?')) return;
      localStorage.removeItem(LS_KEY);
      state = structuredClone(defaultState);
      hydratePanel1();
      renderCharacters();
      renderScenes();
      refreshSelScene();
      refreshCharSelects();
      renderElements();
      hydratePanel5();
      saveState();
      showToast('Todo limpiado', 'success');
    });
  }

  // Plantillas de formato (estos botones NO existen en tu nuevo index.html;
  // por eso los protegemos con if, así no revientan si no están)
  const saveStyleBtn = $('#saveStyle');
  if (saveStyleBtn) {
    saveStyleBtn.addEventListener('click', () => {
      const preset = {
        export: state.export,
        ui: { theme: state.ui.theme },
        styles: state.styles || {}
      };

      downloadJSON('preset_gui-on.json', preset);
      showToast('Plantilla guardada', 'success');
    });
  }

  const loadStyleBtn = $('#loadStyle');
  if (loadStyleBtn) {
    loadStyleBtn.addEventListener('click', () => {
      const sel    = document.getElementById('presetSelect');
      const chosen = sel?.value || '';
      const lib    = loadPresetLibrary();
      const found  = lib.find(p => p.name === chosen);

      if (found) {
        applyPreset(found);
        return;
      }

      // Fallback: importar desde archivo y añadir a la librería
      pickJSONFile(data => {
        try {
          const preset = JSON.parse(data);
          const norm   = normalizePreset(preset);
          norm.name    = norm.name || ('Plantilla importada ' + new Date().toLocaleString());
          addPresetToLibrary(norm);
          fillPresetSelect();
          applyPreset(norm);
        } catch {
          showToast('Preset inválido', 'danger');
        }
      });
    });
  }

  // Exportar PDF / audio
  const exportPDFBtn = $('#exportPDF');
  if (exportPDFBtn) {
    exportPDFBtn.addEventListener('click', () => exportToPDF(state));
  }

  const exportAudioBtn = $('#exportAudio');
  if (exportAudioBtn) {
    exportAudioBtn.addEventListener('click', () => exportAudioMix(state));
  }

  // ✅ NUEVO: Botón demo podcast (inyectado)
  injectDemoPodcastButton();
}

/* ===== JSON helpers ===== */
function downloadJSON(filename, data){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pickJSONFile(cb){
  const inp = document.createElement('input');
  inp.type='file';
  inp.accept='application/json';
  inp.onchange = ()=>{
    const f=inp.files?.[0];
    if(!f) return;
    const fr=new FileReader();
    fr.onload=()=>cb(String(fr.result||''));
    fr.readAsText(f);
  };
  inp.click();
}

/* ===== Export: generador a PDF/print window ===== */
function exportToPDF(S){
  const pageMM = (() => {
    if(S.export.pageSize==='A4') return {w:210,h:297};
    if(S.export.pageSize==='A5') return {w:148,h:210};
    if(S.export.pageSize==='Letter') return {w:215.9,h:279.4}; // mm
    return {w:152.4,h:228.6}; // KDP 6x9
  })();

  const pagePx = {
    w: Math.round(pageMM.w * pxPerMm),
    h: Math.round(pageMM.h * pxPerMm)
  };

  const M = {
    top:    Math.round(clamp(S.export.margins.top,    5,60) * pxPerMm),
    bottom: Math.round(clamp(S.export.margins.bottom, 5,60) * pxPerMm),
    left:   Math.round(clamp(S.export.margins.left,   5,60) * pxPerMm),
    right:  Math.round(clamp(S.export.margins.right,  5,60) * pxPerMm)
  };

  // Reserva dinámica para cabecero/pie según modo
  const HF = (() => {
    const mode = S.export.headerFooter;
    if(mode === 'none') return { top:0, bottom:0 };
    if(mode === 'pageNum'){
      return {
        top:    Math.round((S.export.hfRule ? 3 : 2) * pxPerMm),
        bottom: Math.round((S.export.hfRule ? 10 : 8) * pxPerMm)
      };
    }
    // 'full'
    return {
      top:    Math.round(7 * pxPerMm),
      bottom: Math.round(16 * pxPerMm)
    };
  })();

  const CONTENT_TOP    = M.top + HF.top;
  const CONTENT_BOTTOM = (pagePx.h - M.bottom) - HF.bottom;

  function newPage(){
    return { lines:[], y: CONTENT_TOP, col: 0 };
  }

  /* —— helpers de composición —— */
  function lh(fmt){ return Math.round((fmt.size||14) * (fmt.leading||1.4)); }

  function pushText(pg, text, x, y0, wmax, fmt, align='left'){
    pg.lines.push({
      kind:'text',
      text, x, y:y0, w:wmax, align,
      size:fmt.size, leading:fmt.leading, color:fmt.color, alpha:fmt.alpha,
      font:fmt.font, italic:fmt.italic, weight:fmt.weight, underline: !!fmt.underline,
      wordSpacingPx: (fmt.wordSpacingPx!=null ? fmt.wordSpacingPx : null)
    });
  }

  function pushHR(pg, x, y, w){
    pg.lines.push({kind:'hr', x, y, w});
  }

  function canvasFont(fmt){
    const style = fmt.italic ? 'italic ' : '';
    const weight = fmt.weight ? `${fmt.weight} ` : '';
    return `${style}${weight}${fmt.size}px ${fontStack(fmt.font||'sans')}`;
  }

  function measureWidth(text, fmt){
    const mc = document.createElement('canvas').getContext('2d');
    mc.font = canvasFont(fmt);
    return mc.measureText(text).width;
  }

  function wrap(text, fmt, width){
    const ctx2 = document.createElement('canvas').getContext('2d');
    ctx2.font = canvasFont(fmt);
    const words = (text||'').replace(/\s+/g,' ').trim().split(' ');
    const out=[]; let cur='';
    for(const w of words){
      const test = cur ? cur+' '+w : w;
      if(ctx2.measureText(test).width <= (width - 0.75)) cur = test;
      else { if(cur) out.push(cur); cur = w; }
    }
    if(cur) out.push(cur);
    return out.length ? out : [''];
  }

  function wrapVariable(text, fmt, wFirst, w){
    if(wFirst<=0) return wrap(text, fmt, w);
    const ctx2 = document.createElement('canvas').getContext('2d');
    ctx2.font = canvasFont(fmt);
    const words = (text||'').replace(/\s+/g,' ').trim().split(' ');
    const out=[]; let cur=''; let limit=wFirst;
    for(const wd of words){
      const test = cur ? cur+' '+wd : wd;
      if(ctx2.measureText(test).width <= (limit - 0.75)) cur = test;
      else { if(cur) out.push(cur); cur = wd; limit = w; }
    }
    if(cur) out.push(cur);
    return out.length ? out : [''];
  }

  // Párrafo en y fijo (para portada / meta)
  function pushParagraph(pg, text, x, y0, wmax, fmt){
    const blocks = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let y = y0;

    blocks.forEach((block, blockIdx)=>{
      const lines = wrap(block, fmt, wmax);
      lines.forEach((ln, k)=>{
        const isJust = (fmt.align === 'justify');
        let ws = null;
        if(isJust && k < lines.length-1){
          const spaces = (ln.match(/ /g)||[]).length;
          if(spaces>0){
            const tw = measureWidth(ln, fmt);
            const extra = Math.max(0, wmax - tw);
            ws = extra / spaces;
          }
        }
        const fmtLine = {...fmt, wordSpacingPx: ws};
        pushText(pg, ln, x, y, wmax, fmtLine, isJust ? 'justify' : (fmt.align||'left'));
        y += lh(fmt);
      });

    });

    return y;
  }

  // Párrafo usando pg.y (para cuerpo)
  function renderParagraph(pg, text, x, w, fmt, ensureFn){
    const lines = wrap(text, fmt, w);
    lines.forEach((ln, k)=>{
      const isJust = (fmt.align === 'justify');
      let ws = null;
      if(isJust && k < lines.length-1){
        const spaces = (ln.match(/ /g)||[]).length;
        if(spaces>0){
          const tw = measureWidth(ln, fmt);
          const extra = Math.max(0, w - tw);
          ws = extra / spaces;
        }
      }
      const fmtLine = {...fmt, wordSpacingPx: ws};
      ensureFn(lh(fmt));
      pushText(pg, ln, x, pg.y, w, fmtLine, isJust ? 'justify' : (fmt.align||'left'));
      pg.y += lh(fmt);
    });
    return pg.y;
  }

  // Prefijo "NOMBRE: " con estilo propio en 1ª línea
  function renderParagraphWithPrefixRun(pg, prefix, fmtPrefix, text, x, w, fmtText, ensureFn){
    const prefixW = measureWidth(prefix, fmtPrefix);
    const wFirst  = Math.max(0, w - prefixW);
    const lines   = wrapVariable(text, fmtText, wFirst, w);

    const align = fmtText.align || 'left';

    ensureFn(lh(fmtText));
    pushText(pg, prefix, x, pg.y, prefixW, fmtPrefix, align);
    pushText(pg, lines[0]||'', x + prefixW, pg.y, wFirst, fmtText, align);
    pg.y += lh(fmtText);

    for(let i=1;i<lines.length;i++){
      ensureFn(lh(fmtText));
      pushText(pg, lines[i], x, pg.y, w, fmtText, align);
      pg.y += lh(fmtText);
    }
    return pg.y;
  }

  /* ===== Construcción de páginas ===== */
  const pages = [];

  // Portada
  const cover = newPage();
  const titleFmt = {...fmtFor(S,'TITLE'), align:'center'};
  const subFmt   = {...fmtFor(S,'SUBTITLE'), size: Math.max(12, Math.round(titleFmt.size*0.6)), align:'center'};
  const authorFmt = {...subFmt, size: Math.max(11, subFmt.size - 1), align:'center'};
  const metaFmt  = {...fmtFor(S,'META'), size: 11};

  const boxW = pagePx.w - (M.left + M.right);
  const ruleGap = Math.max(6, Math.round(lh(subFmt) * 0.35));
  const authorGap = Math.max(6, Math.round(lh(authorFmt) * 0.35));
  let y = cover.y;

  y = pushParagraph(cover, S.meta.title||'GUI‑on', M.left, y, boxW, titleFmt);
  y += Math.round(lh(titleFmt) * 0.3);

  if(S.meta.logline){
    y = pushParagraph(cover, S.meta.logline, M.left, y, boxW, subFmt);
  }

  y += ruleGap;
  pushHR(cover, M.left, y, boxW);
  y += authorGap;

  if(S.meta.author){
    y = pushParagraph(cover, S.meta.author, M.left, y, boxW, authorFmt);
  }

  const metaPairs = [
    ['Email', S.meta.email],
    ['Licencia', S.meta.license],
    ['Palabras clave', S.meta.keywords],
    ['Notas', S.meta.notes],
    ['Resumen', S.meta.abstract]
  ].filter(([k,v])=>v && String(v).trim().length);

  y = Math.max(y+10, Math.floor(pagePx.h*0.55));
  metaPairs.forEach(([k,v])=>{
    pushText(cover, k+':', M.left, y, boxW, {...metaFmt, size: metaFmt.size-1, alpha:.9}, 'left');
    y += lh(metaFmt) * 0.9;
    y = pushParagraph(cover, v, M.left, y, boxW, metaFmt);
    y += Math.round(lh(metaFmt) * 1.25);
  });

  pages.push(cover);

  // Contenido
  let page = newPage();
  pages.push(page);

  const blockNewPage = !!S.export.blockNewPage;
  const contentWFull = pagePx.w - (M.left + M.right);
  const colW = contentWFull;

  function colX(){
    return M.left;
  }

  function dialogueColumnBox(){
    const narrow = (S.script.type === 'film') ? 0.6 : 0.86;
    return {
      offset: Math.round(colW * (1 - narrow) / 2),
      width: Math.round(colW * narrow)
    };
  }

  function findDialogueAfterParentheticals(elements, startIdx, charId){
    let j = startIdx + 1;
    let sawParenthetical = false;

    while(j < elements.length){
      const candidate = elements[j];
      if(!candidate){ j++; continue; }
      if(candidate.type === 'PARENTHETICAL'){
        sawParenthetical = true;
        j++;
        continue;
      }
      if(candidate.type === 'DIALOGUE' && candidate.charId === charId){
        return { index: j, element: candidate, hasParenthetical: sawParenthetical };
      }
      break;
    }

    return null;
  }

  function ensure(h){
    if(page.y + h <= CONTENT_BOTTOM) return;
    page = newPage();
    pages.push(page);
  }

  function addGap(px){
    if(px <= 0) return;

    if(page.y + px > CONTENT_BOTTOM){
      page = newPage();
      pages.push(page);
      return; // no arrastramos gap a la nueva página
    }
    page.y += px;
  }

  function forceNewPage(){
    if(page.lines.length === 0 && page.y === CONTENT_TOP) return;
    page = newPage();
    pages.push(page);
  }

  const sceneHeadingFmt = fmtFor(S,'SCENE');
  const actionFmt       = fmtFor(S,'ACTION');
  const parenFmt        = fmtFor(S,'PAREN');
  const transFmt        = fmtFor(S,'TRANS');
  const noteFmt         = fmtFor(S,'NOTE');
  const sfxFmt          = fmtFor(S,'SFX');
  const musicFmt        = fmtFor(S,'MUSIC');
  const timeFmt         = fmtFor(S,'TIME');

  const scenes = S.script.scenes || [];

  scenes.forEach((sc, sceneIdx)=>{
    if(sc.showHeading !== false){
      renderParagraph(page, `${sceneIdx+1}. ${sc.title}`, colX(), colW, sceneHeadingFmt, ensure);
      addGap(Math.round(lh(sceneHeadingFmt) * 0.2));
    }

    let skipNextDialogue = false;

    (sc.elements||[]).forEach((el, idx)=>{
      const next = sc.elements[idx+1];
      const nextDialogueBlock = el && el.type==='CHARACTER'
        ? findDialogueAfterParentheticals(sc.elements || [], idx, el.charId)
        : null;
      const isPair = el && el.type==='CHARACTER' && next && next.type==='DIALOGUE' && next.charId===el.charId;

      if(skipNextDialogue && el.type==='DIALOGUE'){
        skipNextDialogue = false;
        return;
      }

      if(el.type==='SLUGLINE'){
        const slFmt = fmtFor(S,'SLUGLINE');
        renderParagraph(page, (el.text||'').toUpperCase(), colX(), colW, slFmt, ensure);
        addGap(Math.round(lh(slFmt) * 0.25));

      }else if(el.type==='ACTION'){
        addGap(6);
        renderParagraph(page, el.text||'', colX(), colW, actionFmt, ensure);
        addGap(2);

      }else if(el.type==='CHARACTER'){
        const name = (S.script.characters||[]).find(c=>c.id===el.charId)?.name || 'CHAR';
        const upName = String(name).toUpperCase();

        // Podcast: "NOMBRE: diálogo" en la MISMA línea
        if(S.script.type==='podcast' && isPair){
          const narrow = 0.86;
          const offset = Math.round(colW*(1-narrow)/2);
          const width  = Math.round(colW*narrow);

          // Overrides por personaje
          let dialFmtLocal = fmtFor(S,'DIALOGUE');
          const ovDial = (S.styles && S.styles['DIALOGUE:'+el.charId]) || null;
          if(ovDial) dialFmtLocal = {...dialFmtLocal, ...ovDial};

          let charFmtLocal = fmtFor(S,'CHAR');
          const ovChar = (S.styles && S.styles['CHAR:'+el.charId]) || null;
          if(ovChar) charFmtLocal = {...charFmtLocal, ...ovChar};

          renderParagraphWithPrefixRun(
            page,
            `${upName}: `,
            charFmtLocal,
            next.text||'',
            colX()+offset,
            width,
            dialFmtLocal,
            ensure
          );

          skipNextDialogue = true;

        }else{
          // Nombre en su propia línea (alineado como el diálogo)
          const isFilm = (S.script.type==='film');
          const podcastDialogueBox = (S.script.type==='podcast' && nextDialogueBlock)
            ? dialogueColumnBox()
            : null;
          const offset = isFilm
            ? Math.round(colW*0.25)
            : (podcastDialogueBox ? podcastDialogueBox.offset : 0);
          const width  = isFilm
            ? Math.round(colW*0.5)
            : (podcastDialogueBox ? podcastDialogueBox.width : colW);

          let charFmtLocal = fmtFor(S,'CHAR');
          const ovChar = (S.styles && S.styles['CHAR:'+el.charId]) || null;
          if(ovChar) charFmtLocal = {...charFmtLocal, ...ovChar};

          const alignChar = isFilm ? 'center' : (charFmtLocal.align || 'left');

          ensure(lh(charFmtLocal)*1.2);
          pushText(page, upName, colX()+offset, page.y, width, charFmtLocal, alignChar);
          page.y += lh(charFmtLocal);
        }

      }else if(el.type==='PARENTHETICAL'){
        const offset = Math.round(colW*0.22);
        const width  = Math.round(colW*0.56);
        renderParagraph(page, '('+(el.text||'')+')', colX()+offset, width, parenFmt, ensure);

      }else if(el.type==='DIALOGUE'){
        const box = dialogueColumnBox();
        const offset = box.offset;
        const width  = box.width;

        let dialFmtLocal = fmtFor(S,'DIALOGUE');
        const ovDial = (S.styles && S.styles['DIALOGUE:'+el.charId]) || null;
        if(ovDial) dialFmtLocal = {...dialFmtLocal, ...ovDial};

        renderParagraph(page, el.text||'', colX()+offset, width, dialFmtLocal, ensure);

      }else if(el.type==='TRANSITION'){
        renderParagraph(page, (el.text||'').toUpperCase(), colX(), colW, transFmt, ensure);

      }else if(el.type==='SFX'){
        renderParagraph(page, el.text||'', colX(), colW, sfxFmt, ensure);

      }else if(el.type==='MUSIC'){
        renderParagraph(page, '♪ ' + (el.text||''), colX(), colW, musicFmt, ensure);

      }else if(el.type==='NOTE'){
        renderParagraph(page, '['+(el.text||'')+']', colX(), colW, noteFmt, ensure);

      }else if(el.type==='TIME'){
        ensure(lh(timeFmt));
        pushText(page, '['+(el.text||'00:00')+']', colX(), page.y, colW, timeFmt, (timeFmt.align||'left'));
        page.y += lh(timeFmt);
      }

      const gmm = isPair ? Number((next && next.gapAfterMm)||0) : Number(el.gapAfterMm||0);
      if(gmm > 0) addGap(Math.round(gmm * pxPerMm));
    });

    const isLastScene = sceneIdx === scenes.length - 1;
    if (!isLastScene) {
      if (blockNewPage) {
        forceNewPage();
      } else {
        addGap(8);
      }
    }
  });

  /* ===== Render a documento de impresión ===== */
  const hfMode = S.export.headerFooter;

  const PRINT_CSS = `
    @page { size:${pageMM.w}mm ${pageMM.h}mm; margin:0; }
    body{ margin:0; background:#fff; color:#111; }
    .page{ position:relative; width:${pagePx.w}px; height:${pagePx.h}px; page-break-after:always; }
    .line{ position:absolute; white-space:pre; }
    .hr{ position:absolute; height:0; border-top:1px solid #222; }
    .pn{ position:absolute; font: 12px ${fontStack('sans')}; color:#333; }
    @media print{
      *{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;

  const DOC_TITLE = (S.export.pdfName||'guion').replace(/\.pdf$/i,'');
  const HTML_HEAD = `<!doctype html><html><head><meta charset="utf-8"><title>${DOC_TITLE}</title><style>${PRINT_CSS}</style></head><body></body></html>`;

  function renderInto(doc){
    pages.forEach((p, idx)=>{
      const pageEl = doc.createElement('div');
      pageEl.className='page';
      doc.body.appendChild(pageEl);

      // líneas
      p.lines.forEach(it=>{
        if(it.kind==='hr'){
          const hr = doc.createElement('div');
          hr.className='hr';
          hr.style.left = it.x+'px';
          hr.style.top  = it.y+'px';
          hr.style.width= it.w+'px';
          pageEl.appendChild(hr);
          return;
        }

        const d = doc.createElement('div');
        d.className='line';
        d.style.left = it.x+'px';
        d.style.top  = it.y+'px';
        d.style.width = (it.w || (pagePx.w - (M.left + M.right))) + 'px';
        d.style.textAlign = it.align || 'left';
        if(it.align === 'justify'){ d.style.textAlignLast = 'left'; }
        d.style.color = rgba(it.color, it.alpha ?? 1);
        d.style.font = `${it.size}px ${fontStack(it.font || 'sans')}`;
        d.style.fontStyle = it.italic ? 'italic' : 'normal';
        d.style.fontWeight = it.weight || 400;
        d.style.textDecoration = it.underline ? 'underline' : 'none';
        d.style.wordSpacing = (it.wordSpacingPx!=null ? it.wordSpacingPx+'px' : 'normal');
        d.textContent = it.text || '';
        pageEl.appendChild(d);
      });

      const isCover = (idx === 0);

      if(!isCover && hfMode !== 'none'){
        // Nº página (portada=0, primera de contenido=1)
        const pn = doc.createElement('div');
        pn.className='pn';
        pn.textContent = String(idx);
        pn.style.right  = (M.right) + 'px';
        pn.style.bottom = (M.bottom - 6) + 'px';
        pageEl.appendChild(pn);

        if(hfMode === 'full'){
          const head = doc.createElement('div');
          head.className='line';
          head.style.left = M.left+'px';
          head.style.top  = (M.top - 18) + 'px';
          head.style.width= (pagePx.w - M.left - M.right) + 'px';
          head.style.textAlign='center';
          head.style.color='#333';
          head.style.font = `12px ${fontStack('sans')}`;
          head.textContent = (S.meta.title||'') + (S.meta.author ? ' — '+S.meta.author : '');
          pageEl.appendChild(head);

          const foot = doc.createElement('div');
          foot.className='line';
          foot.style.left = M.left+'px';
          foot.style.top  = (pagePx.h - M.bottom + 6) + 'px';
          foot.style.width= (pagePx.w - M.left - M.right) + 'px';
          foot.style.textAlign='center';
          foot.style.color='#333';
          foot.style.font = `12px ${fontStack('sans')}`;
          foot.textContent = (S.meta.license||'');
          pageEl.appendChild(foot);
        }

        // Reglas
        if(S.export.hfRule){
          const wCont = (pagePx.w - (M.left + M.right));

          const topRule = doc.createElement('div');
          topRule.className='hr';
          topRule.style.left = M.left+'px';
          topRule.style.top  = (M.top + Math.round(HF.top * 0.5))+'px';
          topRule.style.width= wCont+'px';
          pageEl.appendChild(topRule);

          const botRule = doc.createElement('div');
          botRule.className='hr';
          botRule.style.left = M.left+'px';
          botRule.style.top  = (pagePx.h - M.bottom - Math.round(HF.bottom * 0.5))+'px';
          botRule.style.width= wCont+'px';
          pageEl.appendChild(botRule);
        }
      }
    });
  }

  // Intento 1: ventana nueva (mejor si el botón lo dispara el usuario)
  let w = null;
  try { w = window.open('about:blank','_blank'); } catch {}

  if(w && w.document){
    try{
      w.document.open();
      w.document.write(HTML_HEAD);
      w.document.close();
      renderInto(w.document);
      w.focus();
      // pequeño delay para asegurar layout
      setTimeout(()=>{ try{ w.print(); }catch{} }, 150);
      return;
    }catch(err){
      try{ w.close(); }catch{}
    }
  }

  // Fallback 2: iframe oculto
  const iframe = document.createElement('iframe');
  iframe.style.position='fixed';
  iframe.style.right='0';
  iframe.style.bottom='0';
  iframe.style.width='1px';
  iframe.style.height='1px';
  iframe.style.border='0';
  document.body.appendChild(iframe);

  const d = iframe.contentWindow?.document;
  if(!d){
    showToast('No se pudo preparar la impresión.','danger');
    try{ document.body.removeChild(iframe); }catch{}
    return;
  }

  d.open();
  d.write(HTML_HEAD);
  d.close();

  renderInto(d);

  setTimeout(()=>{
    try{
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }catch{}
    setTimeout(()=>{ try{ document.body.removeChild(iframe); }catch{} }, 900);
  }, 150);
}

/* ===== Export: mezcla de audio a WAV ===== */
async function exportAudioMix(S){
  try{
    const clips = [];
    (S.script.scenes||[]).forEach(sc=>{
      (sc.elements||[]).forEach(el=>{
        if(el?.audio?.url && !el.audio.muted){
          clips.push({url:el.audio.url, silenceMs: Number(el.audio.silenceMs||0)});
        }
      });
    });

    if(!clips.length){
      showToast('No hay audios asignados.','warning');
      return;
    }

    const sampleRate = 44100;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();

    const parts = [];
    let totalLen = 0;

    for(const c of clips){
      const ab = await (await fetch(c.url)).arrayBuffer();
      let buf = await ctx.decodeAudioData(ab.slice(0));

      // Mono
      if(buf.numberOfChannels > 1){
        const mono = ctx.createBuffer(1, buf.length, buf.sampleRate);
        mono.getChannelData(0).set(buf.getChannelData(0));
        buf = mono;
      }

      // Resample si hace falta
      if(buf.sampleRate !== sampleRate){
        const off = new OfflineAudioContext(1, Math.ceil(buf.duration * sampleRate), sampleRate);
        const src = off.createBufferSource();
        src.buffer = buf;
        src.connect(off.destination);
        src.start();
        buf = await off.startRendering();
      }

      const data = buf.getChannelData(0);
      parts.push(data);
      totalLen += data.length;

      const sFrames = Math.round((c.silenceMs||0)/1000 * sampleRate);
      if(sFrames>0){
        parts.push(new Float32Array(sFrames));
        totalLen += sFrames;
      }
    }

    const merged = new Float32Array(totalLen);
    let offset = 0;
    parts.forEach(p=>{
      merged.set(p, offset);
      offset += p.length;
    });

    const wav = encodeWav(merged, sampleRate);
    const name = (S.export.pdfName||'guion.pdf').replace(/\.pdf$/i,'') + '.wav';
    downloadBlob(name, wav);
    showToast('Audio exportado','success');
  }catch(err){
    console.error(err);
    showToast('No se pudo exportar el audio','danger');
  }
}

function encodeWav(samples, sampleRate){
  const buffer = new ArrayBuffer(44 + samples.length*2);
  const view = new DataView(buffer);

  const writeString = (off, str)=>{
    for(let i=0;i<str.length;i++) view.setUint8(off+i, str.charCodeAt(i));
  };

  const bytesPerSample = 2;
  const channels = 1;
  const blockAlign = bytesPerSample * channels;

  writeString(0,'RIFF');
  view.setUint32(4, 36 + samples.length*bytesPerSample, true);
  writeString(8,'WAVE');
  writeString(12,'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);   // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8*bytesPerSample, true);
  writeString(36,'data');
  view.setUint32(40, samples.length*bytesPerSample, true);

  // PCM 16-bit
  let o = 44;
  for(let i=0;i<samples.length;i++){
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s<0 ? s*0x8000 : s*0x7FFF, true);
    o += 2;
  }
  return new Blob([view], {type:'audio/wav'});
}

function downloadBlob(filename, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
