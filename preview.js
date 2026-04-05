/* GUI‑on — preview.js
 * Vista previa (visor de páginas)
 * Extraído manualmente desde app.js
 */

/* ===== Preview (visor de páginas) ===== */
let previewTimer = null;

function isPreviewActive(){
  return document.querySelector('#panelPreview')?.classList.contains('active');
}
function maybeRenderPreview(force=false){
  if(!isPreviewActive()) return;
  const auto = document.getElementById('previewAuto');
  if(auto && !auto.checked && !force) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(()=>renderPreview(), 60);
}
function bindPreviewPanel(){
  const zoom = document.getElementById('previewZoom');
  const zoomVal = document.getElementById('previewZoomVal');
  const pages = document.getElementById('previewPages');
  const refresh = document.getElementById('previewRefresh');
  const auto = document.getElementById('previewAuto');

  if(zoom && pages){
    const applyZoom = ()=>{
      const z = Number(zoom.value||100);
      pages.style.transform = `scale(${z/100})`;
      if(zoomVal) zoomVal.textContent = `${z}%`;
    };
    zoom.addEventListener('input', applyZoom);
    applyZoom();
  }
  if(refresh){ refresh.addEventListener('click', ()=>renderPreview()); }
  if(auto){ auto.addEventListener('change', ()=>{ if(auto.checked) renderPreview(); }); }

  // Sincroniza selector de tamaño con el estado
  const pz = document.getElementById('previewPageSize');
  if(pz){
    pz.value = state.export.pageSize || 'A4';
    pz.addEventListener('change', ()=>{
      state.export.pageSize = pz.value;
      saveState();
      renderPreview();
    });
  }
}

function renderPreview(){
  const host = document.getElementById('previewPages');
  if(!host) return;
  host.innerHTML = '';

  const S = state;

  // === Medidas de página (igual que exportToPDF) ===
  const pageMM = (()=>{
    if(S.export.pageSize==='A4') return {w:210,h:297};
    if(S.export.pageSize==='A5') return {w:148,h:210};
    if(S.export.pageSize==='Letter') return {w:215.9,h:279.4};
    return {w:152.4,h:228.6}; // KDP 6x9
  })();
  const pagePx = { w: Math.round(pageMM.w*pxPerMm), h: Math.round(pageMM.h*pxPerMm) };
  const M = {
    top:   Math.round(clamp(S.export.margins.top,5,60)*pxPerMm),
    bottom:Math.round(clamp(S.export.margins.bottom,5,60)*pxPerMm),
    left:  Math.round(clamp(S.export.margins.left,5,60)*pxPerMm),
    right: Math.round(clamp(S.export.margins.right,5,60)*pxPerMm)
  };

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
    return { top: Math.round(7 * pxPerMm), bottom: Math.round(16 * pxPerMm) };
  })();

  const CONTENT_TOP    = M.top + HF.top;
  const CONTENT_BOTTOM = (pagePx.h - M.bottom) - HF.bottom;

  function newPage(){ return { lines:[], y: CONTENT_TOP, col: 0 }; }
  const pages = [];

  // ===== Helpers tipográficos =====
  function lh(fmt){ return Math.round((fmt.size||14) * (fmt.leading||1.4)); }
  function pushText(pg, text, x, y0, wmax, fmt, align='left'){
    pg.lines.push({
      text, x, y:y0, w:wmax, align,
      size:fmt.size, leading:fmt.leading, color:fmt.color, alpha:fmt.alpha,
      font:fmt.font, italic:fmt.italic, weight:fmt.weight, underline: !!fmt.underline,
      wordSpacingPx: (fmt.wordSpacingPx!=null ? fmt.wordSpacingPx : null)
    });
  }
  function pushHR(pg, x, y, w){ pg.lines.push({kind:'hr', x, y, w}); }

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

  // ===== Prefijo "NOMBRE: " con estilo propio en 1ª línea (preview) =====
  function renderParagraphWithPrefixRun(pg, prefix, fmtPrefix, text, x, w, fmtText){
    const prefixW = measureWidth(prefix, fmtPrefix);
    const wFirst  = Math.max(0, w - prefixW);
    const lines   = wrapVariable(text, fmtText, wFirst, w);

    ensure(lh(fmtText));
    const align = fmtText.align || 'left';
    pushText(pg, prefix, x, pg.y, prefixW, fmtPrefix, align);
    pushText(pg, lines[0]||'', x + prefixW, pg.y, wFirst, fmtText, align);
    pg.y += lh(fmtText);

    for(let i=1;i<lines.length;i++){
      ensure(lh(fmtText));
      pushText(pg, lines[i], x, pg.y, w, fmtText, align);
      pg.y += lh(fmtText);
    }
    return pg.y;
  }

  function wrapVariable(text, fmt, wFirst, w){
    if(wFirst<=0) return wrap(text, fmt, w);
    const ctx2 = document.createElement('canvas').getContext('2d');
    ctx2.font = canvasFont(fmt);
    const words = (text||'').replace(/\s+/g,' ').trim().split(' ');
    const out=[]; let cur=''; let limit=wFirst;
    for(const wd of words){
      const test = cur? cur+' '+wd : wd;
      if(ctx2.measureText(test).width <= (limit - 0.75)) cur=test;
      else{ if(cur) out.push(cur); cur=wd; limit=w; }
    }
    if(cur) out.push(cur);
    return out.length? out : [''];
  }

  function wrap(text, fmt, width){
    const ctx2 = document.createElement('canvas').getContext('2d');
    ctx2.font = canvasFont(fmt);
    const words = (text||'').replace(/\s+/g,' ').trim().split(' ');
    const out=[]; let cur='';
    for(const w of words){
      const test = cur? cur+' '+w : w;
      if(ctx2.measureText(test).width <= (width - 0.75)) cur = test;
      else{ if(cur) out.push(cur); cur = w; }
    }
    if(cur) out.push(cur);
    return out.length? out : [''];
  }

  function pushParagraphAt(pg, text, x, y0, w, fmt){
    const blocks = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let y = y0;

    blocks.forEach((block, blockIdx)=>{
      const lines = wrap(block, fmt, w);
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
        pushText(pg, ln, x, y, w, fmtLine, isJust ? 'justify' : (fmt.align||'left'));
        y += lh(fmt);
      });

    });

    return y;
  }

  function renderParagraph(pg, text, x, w, fmt){
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
      ensure(lh(fmt));
      pushText(pg, ln, x, pg.y, w, fmtLine, isJust ? 'justify' : (fmt.align||'left'));
      pg.y += lh(fmt);
    });
    return pg.y;
  }

  function ensure(h){
    const limit = CONTENT_BOTTOM;
    if(curPage.y + h <= limit) return;
    curPage = newPage();
    pages.push(curPage);
  }

  function addGap(px){
    const limit = CONTENT_BOTTOM;
    if(px <= 0) return;
    if(curPage.y + px > limit){
      curPage = newPage();
      pages.push(curPage);
      return; // no arrastrar gap arriba
    }
    curPage.y += px;
  }

  function forceNewPage(){
    if(curPage.lines.length === 0 && curPage.y === CONTENT_TOP) return;
    curPage = newPage();
    pages.push(curPage);
  }

  function colX(){ return M.left; }

  // ===== Portada =====
  const cover = newPage();
  const titleFmt = {...fmtFor(S,'TITLE'), align:'center'};
  const subFmt = {...fmtFor(S,'SUBTITLE'), size: Math.max(12, Math.round(titleFmt.size*0.6)), align:'center'};
  const authorFmt = {...subFmt, size: Math.max(11, subFmt.size - 1), align:'center'};
  const metaFmt = {...fmtFor(S,'META'), size: 11};
  const boxW = pagePx.w - (M.left+M.right);
  const ruleGap = Math.max(6, Math.round(lh(subFmt) * 0.35));
  const authorGap = Math.max(6, Math.round(lh(authorFmt) * 0.35));
  let y = cover.y;

  y = pushParagraphAt(cover, S.meta.title||'GUI‑on', M.left, y, boxW, titleFmt);
  y += Math.round(lh(titleFmt) * 0.3);

  if(S.meta.logline){
    y = pushParagraphAt(cover, S.meta.logline, M.left, y, boxW, subFmt);
  }

  y += ruleGap;
  pushHR(cover, M.left, y, boxW);
  y += authorGap;

  if(S.meta.author){
    y = pushParagraphAt(cover, S.meta.author, M.left, y, boxW, authorFmt);
  }

  const metaPairs = [
    ['Email',S.meta.email],['Licencia',S.meta.license],['Palabras clave',S.meta.keywords],
    ['Notas',S.meta.notes],['Resumen',S.meta.abstract]
  ].filter(([k,v])=>v&&String(v).trim().length);
  y = Math.max(y+10, Math.floor(pagePx.h*0.55));
  metaPairs.forEach(([k,v])=>{
    pushText(cover, k+':', M.left, y, boxW, {...metaFmt, size: metaFmt.size-1, alpha:.9}, 'left');
    y += lh(metaFmt)*0.9;
    y = pushParagraphAt(cover, v, M.left, y, boxW, metaFmt);
    y += Math.round(lh(metaFmt)*1.25);
  });
  pages.push(cover);

  // ===== Contenido =====
  let curPage = newPage(); pages.push(curPage);
  const blockNewPage = !!S.export.blockNewPage;
  const contentWFull = pagePx.w - (M.left + M.right);
  const colW = contentWFull;

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

  const sceneHeadingFmt = fmtFor(S,'SCENE');
  const actionFmt       = fmtFor(S,'ACTION');
  const parenFmt        = fmtFor(S,'PAREN');
  const transFmt        = fmtFor(S,'TRANS');
  const noteFmt         = fmtFor(S,'NOTE');
  const sfxFmt          = fmtFor(S,'SFX');
  const musicFmt        = fmtFor(S,'MUSIC');
  const timeFmt         = fmtFor(S,'TIME');

  const scenes = S.script.scenes || [];

  scenes.forEach((sc, idx)=>{
    if(sc.showHeading !== false){
      curPage.y = renderParagraph(curPage, `${idx+1}. ${sc.title}`, colX(), colW, sceneHeadingFmt);
      addGap(Math.round(lh(sceneHeadingFmt)*0.2));
    }

    // ⟶ NUEVO: control para fusionar "Nombre: diálogo" en podcast (preview)
    let skipNextDialogue = false;

    (sc.elements||[]).forEach((el, iEl)=>{
      const next = sc.elements[iEl+1];
      const nextDialogueBlock = el && el.type==='CHARACTER'
        ? findDialogueAfterParentheticals(sc.elements || [], iEl, el.charId)
        : null;
      const isPair = el && el.type==='CHARACTER' && next && next.type==='DIALOGUE' && next.charId===el.charId;

      // ⟶ NUEVO: si ya imprimimos "Nombre: diálogo", saltar este DIALOGUE
      if(skipNextDialogue && el.type==='DIALOGUE'){ skipNextDialogue=false; return; }

      if(el.type==='SLUGLINE'){
        const slFmt = fmtFor(S,'SLUGLINE');
        curPage.y = renderParagraph(curPage, (el.text||'').toUpperCase(), colX(), colW, slFmt);
        addGap(Math.round(lh(slFmt)*0.25));

      }else if(el.type==='ACTION'){
        addGap(6);
        curPage.y = renderParagraph(curPage, el.text||'', colX(), colW, actionFmt);
        addGap(2);

      }else if(el.type==='CHARACTER'){
        const name = (S.script.characters||[]).find(c=>c.id===el.charId)?.name || 'CHAR';
        const isFilm = (S.script.type==='film');

        if(S.script.type==='podcast' && isPair){
          const narrow = 0.86;
          const offset = Math.round(colW*(1-narrow)/2);
          const width  = Math.round(colW*narrow);

          let dialFmtLocal = fmtFor(S,'DIALOGUE');
          const ovDial = (S.styles && S.styles['DIALOGUE:'+el.charId]) || null;
          if(ovDial) dialFmtLocal = {...dialFmtLocal, ...ovDial};

          let charFmtLocal = fmtFor(S,'CHAR');
          const ovChar = (S.styles && S.styles['CHAR:'+el.charId]) || null;
          if(ovChar) charFmtLocal = {...charFmtLocal, ...ovChar};

          curPage.y = renderParagraphWithPrefixRun(
            curPage,
            `${name.toUpperCase()}: `,
            charFmtLocal,
            next.text||'',
            colX()+offset, width,
            dialFmtLocal
          );
          skipNextDialogue = true;

        }else{
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
          pushText(curPage, name.toUpperCase(), colX()+offset, curPage.y, width, charFmtLocal, alignChar);
          curPage.y += lh(charFmtLocal);
        }

      }else if(el.type==='PARENTHETICAL'){
        const offset = Math.round(colW*0.22);
        const width  = Math.round(colW*0.56);
        curPage.y = renderParagraph(curPage, '('+(el.text||'')+')', colX()+offset, width, parenFmt);

      }else if(el.type==='DIALOGUE'){
        const box = dialogueColumnBox();
        const offset = box.offset;
        const width  = box.width;

        let dialFmtLocal = fmtFor(S,'DIALOGUE');
        const ovDial = (S.styles && S.styles['DIALOGUE:'+el.charId]) || null;
        if(ovDial) dialFmtLocal = {...dialFmtLocal, ...ovDial};

        curPage.y = renderParagraph(curPage, el.text||'', colX()+offset, width, dialFmtLocal);

      }else if(el.type==='TRANSITION'){
        curPage.y = renderParagraph(curPage, (el.text||'').toUpperCase(), colX(), colW, transFmt);

      }else if(el.type==='SFX'){
        curPage.y = renderParagraph(curPage, el.text||'', colX(), colW, sfxFmt);

      }else if(el.type==='MUSIC'){
        curPage.y = renderParagraph(curPage, '♪ '+(el.text||''), colX(), colW, musicFmt);

      }else if(el.type==='NOTE'){
        curPage.y = renderParagraph(curPage, '['+(el.text||'')+']', colX(), colW, noteFmt);

      }else if(el.type==='TIME'){
        ensure(lh(timeFmt));
        pushText(curPage, '['+(el.text||'00:00')+']', colX(), curPage.y, colW, timeFmt, (timeFmt.align||'left'));
        curPage.y += lh(timeFmt);
      }

      const gmm = isPair ? Number(next?.gapAfterMm||0) : Number(el.gapAfterMm||0);
      if (gmm > 0) addGap(Math.round(gmm * pxPerMm));
    });

    const isLastScene = idx === scenes.length - 1;
    if (!isLastScene) {
      if (blockNewPage) {
        forceNewPage();
      } else {
        addGap(8);
      }
    }
  });

  // === Pintar páginas en el visor ===
  const hfMode = S.export.headerFooter;

  pages.forEach((p, idx)=>{
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    pageEl.style.width = pagePx.w+'px';
    pageEl.style.height = pagePx.h+'px';
    host.appendChild(pageEl);

    // Líneas y reglas
    p.lines.forEach(it=>{
      if(it.kind==='hr'){
        const hr = document.createElement('div');
        hr.className='hr'; hr.style.left=it.x+'px'; hr.style.top=it.y+'px'; hr.style.width=it.w+'px';
        pageEl.appendChild(hr);
      }else{
        const d = document.createElement('div');
        d.className='line';
        d.style.left = it.x+'px';
        d.style.top  = it.y+'px';
        d.style.width = (it.w|| (pagePx.w - (M.left+M.right))) + 'px';
        d.style.textAlign = it.align || 'left';
        if(it.align === 'justify'){ d.style.textAlignLast = 'left'; }
        d.style.color = rgba(it.color, it.alpha??1);
        d.style.font = `${it.size}px ${fontStack(it.font || 'sans')}`;
        d.style.fontStyle = it.italic? 'italic':'normal';
        d.style.fontWeight = it.weight || 400;
        d.style.textDecoration = it.underline ? 'underline' : 'none';
        d.style.wordSpacing = (it.wordSpacingPx!=null ? it.wordSpacingPx+'px' : 'normal');
        d.textContent = it.text || '';
        pageEl.appendChild(d);
      }
    });

    // Cabecero/pie/nº de página
    const isCover = (idx===0);
    if(!isCover && hfMode!=='none'){
      const pn = document.createElement('div'); pn.className='pn';
      pn.textContent = (idx); // portada = 0
      pn.style.right = (M.right)+'px';
      pn.style.bottom = (M.bottom - 6)+'px';
      pageEl.appendChild(pn);

      if(hfMode==='full'){
        const head = document.createElement('div'); head.className='line';
        head.style.left = M.left+'px'; head.style.top = (M.top-18)+'px';
        head.style.width = (pagePx.w-M.left-M.right)+'px';
        head.style.textAlign='center'; head.style.color='#333';
        head.style.font = `12px ${fontStack('sans')}`;
        head.textContent = (S.meta.title||'') + (S.meta.author? ' — '+S.meta.author : '');
        pageEl.appendChild(head);

        const foot = document.createElement('div'); foot.className='line';
        foot.style.left = M.left+'px'; foot.style.top = (pagePx.h - M.bottom + 6)+'px';
        foot.style.width = (pagePx.w-M.left-M.right)+'px';
        foot.style.textAlign='center'; foot.style.color='#333';
        foot.style.font = `12px ${fontStack('sans')}`;
        foot.textContent = (S.meta.license||'');
        pageEl.appendChild(foot);
      }

      if(!isCover && S.export.hfRule && hfMode!=='none'){
        const wCont = (pagePx.w - (M.left + M.right));

        const topRule = document.createElement('div');
        topRule.className='hr';
        topRule.style.left = M.left+'px';
        topRule.style.top = (M.top + Math.round(HF.top * 0.5))+'px';
        topRule.style.width = wCont+'px';
        pageEl.appendChild(topRule);

        const botRule = document.createElement('div');
        botRule.className='hr';
        botRule.style.left = M.left+'px';
        botRule.style.top = (pagePx.h - M.bottom - Math.round(HF.bottom * 0.5))+'px';
        botRule.style.width = wCont+'px';
        pageEl.appendChild(botRule);
      }
    }
  });

  // Llevar scroll al inicio cada vez que se recomputa
  const scroller = document.getElementById('previewHost');
  if(scroller) scroller.scrollTop = 0;
}
