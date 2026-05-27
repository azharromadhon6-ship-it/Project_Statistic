/* ============================================================
   fishbone.js — Ishikawa Cause & Effect engine
   Implements §3F. SVG manual (no Chart.js dependency).
   ============================================================ */
(function () {

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CAT_KEYS = ['man','machine','material','method','measurement','environment'];
  const MAX_CAUSES_PER_CAT = 8;

  function el(tag) { return document.createElementNS(SVG_NS, tag); }

  /* ---------- word wrap (duplicated from flowchart.js per Pitfall #29) ---------- */
  function wordWrap(text, maxChars) {
    maxChars = maxChars || 18;
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (((cur + ' ' + w).trim()).length <= maxChars) {
        cur = (cur + ' ' + w).trim();
      } else {
        if (cur) lines.push(cur);
        if (w.length > maxChars) {
          lines.push(w.slice(0, maxChars - 1) + '…');
          cur = '';
        } else {
          cur = w;
        }
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /* ---------- inline styles for SVG export ---------- */
  function injectInlineStyles(svgClone) {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const propsToInline = [
      '--bg-secondary','--text-primary','--text-secondary','--text-muted',
      '--accent-amber','--accent-red','--accent-green','--border-base',
      '--font-body','--font-heading'
    ];
    let cssText = ':root{';
    propsToInline.forEach(p => {
      const v = styles.getPropertyValue(p);
      if (v) cssText += p + ':' + v.trim() + ';';
    });
    cssText += '}';
    const styleEl = document.createElementNS(SVG_NS, 'style');
    styleEl.textContent = cssText;
    svgClone.insertBefore(styleEl, svgClone.firstChild);
  }

  /* ---------- left-panel UI ---------- */
  function fbStateForCat(catId) {
    return AppState.fishbone.categories.find(c => c.id === catId);
  }

  function fbRenderCausesUI() {
    const container = document.getElementById('fb-causes-container');
    if (!container) return;
    container.innerHTML = '';

    AppState.fishbone.categories.forEach(cat => {
      if (!cat.active) return;

      const block = document.createElement('div');
      block.className = 'fb-cat-block';
      block.dataset.cat = cat.id;

      const header = document.createElement('div');
      header.className = 'fb-cat-block-header';
      const title = document.createElement('span');
      title.className = 'fb-cat-block-title';
      title.textContent = cat.label;
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'fb-cat-block-add';
      addBtn.textContent = '+ Cause';
      addBtn.addEventListener('click', () => {
        if (cat.causes.length >= MAX_CAUSES_PER_CAT) {
          showToast('warning', 'Max ' + MAX_CAUSES_PER_CAT + ' causes per kategori');
          return;
        }
        cat.causes.push({ id: generateId(), text: '', subCauses: [] });
        saveState();
        fbRenderCausesUI();
      });
      header.append(title, addBtn);
      block.appendChild(header);

      cat.causes.forEach(cause => {
        const row = document.createElement('div');
        row.className = 'fb-cause-row';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.maxLength = 60;
        inp.placeholder = 'Penyebab…';
        inp.value = cause.text || '';
        inp.addEventListener('input', () => { cause.text = inp.value; });
        inp.addEventListener('blur', () => { saveState(); });

        const addSub = document.createElement('button');
        addSub.type = 'button';
        addSub.className = 'btn-add-sub';
        addSub.title = 'Tambah sub-cause';
        addSub.textContent = '+';
        addSub.addEventListener('click', () => {
          if (cause.subCauses.length >= 5) { showToast('warning', 'Max 5 sub-cause'); return; }
          cause.subCauses.push({ id: generateId(), text: '' });
          saveState();
          fbRenderCausesUI();
        });

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn-remove-row';
        del.title = 'Hapus cause';
        del.textContent = '×';
        del.addEventListener('click', () => {
          cat.causes = cat.causes.filter(c => c.id !== cause.id);
          saveState();
          fbRenderCausesUI();
        });

        row.append(inp, addSub, del);
        block.appendChild(row);

        if (cause.subCauses.length > 0) {
          const subList = document.createElement('div');
          subList.className = 'fb-sub-list';
          cause.subCauses.forEach(sub => {
            const subRow = document.createElement('div');
            subRow.className = 'fb-sub-row';
            const subInp = document.createElement('input');
            subInp.type = 'text';
            subInp.maxLength = 60;
            subInp.placeholder = 'Sub-cause…';
            subInp.value = sub.text || '';
            subInp.addEventListener('input', () => { sub.text = subInp.value; });
            subInp.addEventListener('blur', () => { saveState(); });
            const subDel = document.createElement('button');
            subDel.type = 'button';
            subDel.className = 'btn-remove-row';
            subDel.textContent = '×';
            subDel.addEventListener('click', () => {
              cause.subCauses = cause.subCauses.filter(s => s.id !== sub.id);
              saveState();
              fbRenderCausesUI();
            });
            subRow.append(subInp, subDel);
            subList.appendChild(subRow);
          });
          block.appendChild(subList);
        }
      });

      container.appendChild(block);
    });
  }

  function fbSyncUI() {
    const eff = document.getElementById('fb-effect');
    if (eff) eff.value = AppState.fishbone.effect || '';
    CAT_KEYS.forEach(k => {
      const cb = document.getElementById('fb-cat-' + k);
      const cat = fbStateForCat(k);
      if (cb && cat) cb.checked = cat.active !== false;
    });
    fbRenderCausesUI();
  }
  window.fbSyncUI = fbSyncUI;

  /* ---------- core render ---------- */
  function renderFishbone(state) {
    state = state || AppState.fishbone;
    const svg = document.getElementById('fb-canvas');
    if (!svg) return;

    if (!state.effect || state.effect.trim() === '') {
      showEmptyState('fishbone');
      return;
    }
    const active = state.categories.filter(c => c.active !== false);
    if (active.length === 0) {
      showToast('error', 'Aktifkan minimal 1 kategori');
      showEmptyState('fishbone');
      return;
    }

    // Layout constants
    const SVG_W = 1200;
    const SVG_H = 700;
    const SPINE_Y  = SVG_H / 2;
    const SPINE_X1 = 80;
    const SPINE_X2 = SVG_W - 220;
    const BOX_W = 180, BOX_H = 100;
    const BOX_X = SVG_W - BOX_W - 20;
    const BOX_Y = SPINE_Y - BOX_H / 2;
    const BONE_LEN = 200;
    const BONE_ANGLE = 45; // degrees

    const topCats    = active.filter((_, i) => i % 2 === 0);
    const bottomCats = active.filter((_, i) => i % 2 !== 0);
    const maxSide    = Math.max(topCats.length, bottomCats.length, 1);
    const usableW    = SPINE_X2 - SPINE_X1 - 80;
    const interval   = maxSide > 1 ? usableW / maxSide : usableW / 2;

    // Init SVG
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 ' + SVG_W + ' ' + SVG_H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const bg = el('rect');
    bg.setAttribute('width', SVG_W);
    bg.setAttribute('height', SVG_H);
    bg.setAttribute('fill', getCSSVar('--bg-secondary') || '#1A1D27');
    svg.appendChild(bg);

    // Title
    const titleEl = el('text');
    titleEl.setAttribute('x', SVG_W / 2);
    titleEl.setAttribute('y', 32);
    titleEl.setAttribute('text-anchor', 'middle');
    titleEl.setAttribute('fill', getCSSVar('--text-primary'));
    titleEl.setAttribute('font-size', '18');
    titleEl.setAttribute('font-weight', '700');
    titleEl.setAttribute('font-family', getCSSVar('--font-heading') || 'serif');
    titleEl.textContent = 'Fishbone Diagram';
    svg.appendChild(titleEl);

    // Spine
    const spine = el('line');
    spine.setAttribute('x1', SPINE_X1);
    spine.setAttribute('y1', SPINE_Y);
    spine.setAttribute('x2', SPINE_X2);
    spine.setAttribute('y2', SPINE_Y);
    spine.setAttribute('stroke', getCSSVar('--text-primary'));
    spine.setAttribute('stroke-width', '3');
    svg.appendChild(spine);

    // Arrowhead
    const arrow = el('polygon');
    arrow.setAttribute('points',
      SPINE_X2 + ',' + SPINE_Y + ' ' +
      (SPINE_X2 - 15) + ',' + (SPINE_Y - 10) + ' ' +
      (SPINE_X2 - 15) + ',' + (SPINE_Y + 10));
    arrow.setAttribute('fill', getCSSVar('--text-primary'));
    svg.appendChild(arrow);

    // Effect box
    const box = el('rect');
    box.setAttribute('x', BOX_X);
    box.setAttribute('y', BOX_Y);
    box.setAttribute('width', BOX_W);
    box.setAttribute('height', BOX_H);
    box.setAttribute('rx', '8');
    box.setAttribute('fill', getCSSVar('--accent-red'));
    box.setAttribute('fill-opacity', '0.15');
    box.setAttribute('stroke', getCSSVar('--accent-red'));
    box.setAttribute('stroke-width', '2');
    svg.appendChild(box);

    const effectLines = wordWrap(sanitizeText(state.effect), 20);
    const lineH = 18;
    const startY = BOX_Y + BOX_H / 2 - (effectLines.length * lineH) / 2 + lineH / 2;
    effectLines.forEach((line, i) => {
      const t = el('text');
      t.setAttribute('x', BOX_X + BOX_W / 2);
      t.setAttribute('y', startY + i * lineH);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('fill', getCSSVar('--text-primary'));
      t.setAttribute('font-size', '14');
      t.setAttribute('font-weight', '600');
      t.setAttribute('font-family', getCSSVar('--font-body') || 'sans-serif');
      t.textContent = line;
      svg.appendChild(t);
    });

    // Compute bone positions
    function assignBoneX(cats) {
      const n = cats.length;
      cats.forEach((cat, i) => {
        cat._boneX = SPINE_X2 - 60 - (n - 1 - i) * interval - interval / 2;
      });
    }
    assignBoneX(topCats);
    assignBoneX(bottomCats);

    // Draw bones + causes
    active.forEach(cat => {
      const isTop = topCats.includes(cat);
      const boneX = cat._boneX;
      const angle = isTop ? -BONE_ANGLE : BONE_ANGLE;
      const rad   = angle * Math.PI / 180;
      const outerX = boneX - Math.cos(rad) * BONE_LEN;
      const outerY = SPINE_Y - Math.sin(rad) * BONE_LEN;

      // Diagonal bone
      const bone = el('line');
      bone.setAttribute('x1', outerX);
      bone.setAttribute('y1', outerY);
      bone.setAttribute('x2', boneX);
      bone.setAttribute('y2', SPINE_Y);
      bone.setAttribute('stroke', getCSSVar('--accent-amber'));
      bone.setAttribute('stroke-width', '2.5');
      svg.appendChild(bone);

      // ──────────────────────────────────────────────────────────
      // Category label — offset PERPENDICULAR to the bone so it
      // never overlaps the diagonal stroke regardless of bone angle.
      // ──────────────────────────────────────────────────────────
      // Bone vector: outerPoint → bonePoint (on the spine)
      const boneVecX = boneX - outerX;
      const boneVecY = SPINE_Y - outerY;
      const boneLenN = Math.sqrt(boneVecX * boneVecX + boneVecY * boneVecY) || 1;
      // Unit perpendicular (rotation +90°); direction flips per side so
      // the label always sits on the OUTER side of the bone.
      const perpX = -boneVecY / boneLenN;
      const perpY =  boneVecX / boneLenN;
      const sideDir = isTop ? 1 : -1;
      const LABEL_OFFSET = 22;
      const labelX = outerX + perpX * LABEL_OFFSET * sideDir;
      const labelY = outerY + perpY * LABEL_OFFSET * sideDir;

      // Background rect behind the label so the amber text stays
      // legible even when it lands close to the bone. Width is an
      // estimate from char count; height matches font-size.
      const labelText = sanitizeText(cat.label);
      const estW = labelText.length * 8 + 12;
      const estH = 20;
      const bgRect = el('rect');
      bgRect.setAttribute('x', labelX - estW / 2);
      bgRect.setAttribute('y', labelY - estH / 2);
      bgRect.setAttribute('width', estW);
      bgRect.setAttribute('height', estH);
      bgRect.setAttribute('rx', '3');
      bgRect.setAttribute('fill', getCSSVar('--bg-primary') || '#0F1117');
      bgRect.setAttribute('fill-opacity', '0.6');
      svg.appendChild(bgRect);

      const catLbl = el('text');
      catLbl.setAttribute('x', labelX);
      catLbl.setAttribute('y', labelY);
      catLbl.setAttribute('text-anchor', 'middle');
      catLbl.setAttribute('dominant-baseline', 'middle');
      catLbl.setAttribute('fill', getCSSVar('--accent-amber'));
      catLbl.setAttribute('font-size', '14');
      catLbl.setAttribute('font-weight', '700');
      catLbl.setAttribute('font-family', getCSSVar('--font-body') || 'sans-serif');
      catLbl.textContent = labelText;
      svg.appendChild(catLbl);

      const causes = (cat.causes || []).filter(c => c.text && c.text.trim() !== '');
      const limited = causes.slice(0, MAX_CAUSES_PER_CAT);
      if (causes.length > MAX_CAUSES_PER_CAT) {
        showToast('warning', cat.label + ': hanya ' + MAX_CAUSES_PER_CAT + ' cause yang ditampilkan');
      }

      limited.forEach((cause, ci) => {
        const tPos = (ci + 1) / (limited.length + 1);
        const cX = outerX + (boneX - outerX) * tPos;
        const cY = outerY + (SPINE_Y - outerY) * tPos;

        const causeLen = 90;
        const subEndX = cX + causeLen;

        const causeLine = el('line');
        causeLine.setAttribute('x1', cX);
        causeLine.setAttribute('y1', cY);
        causeLine.setAttribute('x2', subEndX);
        causeLine.setAttribute('y2', cY);
        causeLine.setAttribute('stroke', getCSSVar('--text-secondary'));
        causeLine.setAttribute('stroke-width', '1.5');
        svg.appendChild(causeLine);

        const dot = el('circle');
        dot.setAttribute('cx', cX);
        dot.setAttribute('cy', cY);
        dot.setAttribute('r', '4');
        dot.setAttribute('fill', getCSSVar('--accent-amber'));
        svg.appendChild(dot);

        const causeTxt = el('text');
        causeTxt.setAttribute('x', subEndX + 4);
        causeTxt.setAttribute('y', cY + (isTop ? -5 : 14));
        causeTxt.setAttribute('text-anchor', 'start');
        causeTxt.setAttribute('fill', getCSSVar('--text-primary'));
        causeTxt.setAttribute('font-size', '12');
        causeTxt.setAttribute('font-family', getCSSVar('--font-body') || 'sans-serif');
        causeTxt.textContent = sanitizeText(cause.text.slice(0, 40));
        svg.appendChild(causeTxt);

        const subs = (cause.subCauses || []).filter(s => s.text && s.text.trim() !== '');
        subs.forEach((sub, si) => {
          const subT = (si + 1) / (subs.length + 1);
          const subX = cX + (subEndX - cX) * subT;
          const miniLen = 25;
          const miniY = isTop ? cY - miniLen : cY + miniLen;
          const miniLine = el('line');
          miniLine.setAttribute('x1', subX);
          miniLine.setAttribute('y1', cY);
          miniLine.setAttribute('x2', subX);
          miniLine.setAttribute('y2', miniY);
          miniLine.setAttribute('stroke', getCSSVar('--text-muted'));
          miniLine.setAttribute('stroke-width', '1');
          svg.appendChild(miniLine);

          const subTxt = el('text');
          subTxt.setAttribute('x', subX);
          subTxt.setAttribute('y', isTop ? miniY - 4 : miniY + 10);
          subTxt.setAttribute('text-anchor', 'middle');
          subTxt.setAttribute('fill', getCSSVar('--text-muted'));
          subTxt.setAttribute('font-size', '10');
          subTxt.setAttribute('font-family', getCSSVar('--font-body') || 'sans-serif');
          subTxt.textContent = sanitizeText(sub.text.slice(0, 20));
          svg.appendChild(subTxt);
        });
      });
    });
  }
  window.renderFishbone = renderFishbone;

  /* ---------- exports ---------- */
  function fbExportPNG() {
    const svg = document.getElementById('fb-canvas');
    if (!svg) return;
    if (!AppState.fishbone.effect || AppState.fishbone.effect.trim() === '') {
      showToast('error', 'Render diagram dulu');
      return;
    }
    const cl = svg.cloneNode(true);
    injectInlineStyles(cl);
    const ss = new XMLSerializer().serializeToString(cl);
    const vb = svg.getAttribute('viewBox')?.split(/\s+/) || ['0','0','1200','700'];
    const w = parseFloat(vb[2]) || 1200;
    const h = parseFloat(vb[3]) || 700;

    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = getCSSVar('--bg-secondary') || '#1A1D27';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    const blob = new Blob([ss], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      triggerDownload(canvas.toDataURL('image/png'), 'fishbone.png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showToast('error', 'Gagal mengekspor PNG');
    };
    img.src = url;
  }

  function fbExportSVG() {
    const svg = document.getElementById('fb-canvas');
    if (!svg) return;
    if (!AppState.fishbone.effect || AppState.fishbone.effect.trim() === '') {
      showToast('error', 'Render diagram dulu');
      return;
    }
    const cl = svg.cloneNode(true);
    injectInlineStyles(cl);
    const ss = new XMLSerializer().serializeToString(cl);
    const blob = new Blob([ss], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'fishbone.svg');
  }

  function fbReset() {
    showModal('Hapus semua data Fishbone?', () => {
      AppState.fishbone.effect = '';
      AppState.fishbone.categories = (typeof makeDefaultFishboneCategories === 'function')
        ? makeDefaultFishboneCategories()
        : AppState.fishbone.categories.map(c => ({ ...c, active: true, causes: [] }));
      saveState();
      fbSyncUI();
      showEmptyState('fishbone');
      showToast('success', 'Fishbone direset');
    });
  }

  function initFishbone() {
    const eff = document.getElementById('fb-effect');
    eff?.addEventListener('input', () => { AppState.fishbone.effect = eff.value; });
    eff?.addEventListener('blur',  () => { saveState(); });

    CAT_KEYS.forEach(k => {
      const cb = document.getElementById('fb-cat-' + k);
      cb?.addEventListener('change', () => {
        const cat = fbStateForCat(k);
        if (cat) cat.active = cb.checked;
        saveState();
        fbRenderCausesUI();
      });
    });

    document.getElementById('btn-fb-render')?.addEventListener('click', () => {
      renderFishbone(AppState.fishbone);
    });
    document.getElementById('btn-fb-export-png')?.addEventListener('click', fbExportPNG);
    document.getElementById('btn-fb-export-svg')?.addEventListener('click', fbExportSVG);
    document.getElementById('btn-fb-reset')?.addEventListener('click', fbReset);

    fbSyncUI();
  }
  window.initFishbone = initFishbone;

})();
