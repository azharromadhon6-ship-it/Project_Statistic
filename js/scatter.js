/* ============================================================
   scatter.js — Scatter Diagram engine (Pearson r + linear regression)
   Implements §3G. Depends app.js utils + Chart.js CDN.
   ============================================================ */
(function () {

  let lastResult = null;

  function nnum(s) {
    if (typeof window.normalizeNumber === 'function') return window.normalizeNumber(String(s));
    const v = parseFloat(String(s).replace(',', '.'));
    return isNaN(v) ? NaN : v;
  }

  function scGetOptions() {
    if (typeof window.getScatterOptions === 'function') return window.getScatterOptions();
    const titleEl  = document.getElementById('sc-title');
    const xLblEl   = document.getElementById('sc-xlabel');
    const yLblEl   = document.getElementById('sc-ylabel');
    const regEl    = document.getElementById('sc-show-regression');
    const bandEl   = document.getElementById('sc-show-band');
    return {
      title:          sanitizeText(titleEl?.value || '') || 'Scatter Diagram',
      xLabel:         sanitizeText(xLblEl?.value || '') || 'X',
      yLabel:         sanitizeText(yLblEl?.value || '') || 'Y',
      showRegression: regEl ? !!regEl.checked : true,
      showBand:       bandEl ? !!bandEl.checked : false
    };
  }

  function scSyncStateFromUI() {
    const o = scGetOptions();
    AppState.scatter.title          = o.title === 'Scatter Diagram' ? '' : o.title;
    AppState.scatter.xLabel         = o.xLabel;
    AppState.scatter.yLabel         = o.yLabel;
    AppState.scatter.showRegression = o.showRegression;
    AppState.scatter.showBand       = o.showBand;
  }

  /* ---------- input table ---------- */
  function scAddRowToDOM(id, label, x, y) {
    const tbody = document.getElementById('sc-rows-container');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.dataset.id = id;

    const tdIdx = document.createElement('td');
    tdIdx.className = 'idx';

    const tdLbl = document.createElement('td');
    const lblIn = document.createElement('input');
    lblIn.type = 'text';
    lblIn.value = label || '';
    lblIn.placeholder = 'opsional';
    lblIn.maxLength = 30;
    lblIn.addEventListener('blur', () => scOnLabelBlur(id, lblIn));
    tdLbl.appendChild(lblIn);

    const tdX = document.createElement('td');
    const xIn = document.createElement('input');
    xIn.type = 'text';
    xIn.className = 'num';
    xIn.value = (x === '' || x === null || x === undefined ||
                 (typeof x === 'number' && isNaN(x))) ? '' : String(x);
    xIn.placeholder = '0';
    xIn.addEventListener('blur', () => scOnNumBlur(id, 'x', xIn));
    tdX.appendChild(xIn);

    const tdY = document.createElement('td');
    const yIn = document.createElement('input');
    yIn.type = 'text';
    yIn.className = 'num';
    yIn.value = (y === '' || y === null || y === undefined ||
                 (typeof y === 'number' && isNaN(y))) ? '' : String(y);
    yIn.placeholder = '0';
    yIn.addEventListener('blur', () => scOnNumBlur(id, 'y', yIn));
    yIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); scOnNumBlur(id, 'y', yIn); scAddRow(true); }
    });
    tdY.appendChild(yIn);

    const tdBtn = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn-remove-row';
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = 'Hapus baris';
    btn.addEventListener('click', () => scRemoveRow(id));
    tdBtn.appendChild(btn);

    tr.append(tdIdx, tdLbl, tdX, tdY, tdBtn);
    tbody.appendChild(tr);
    scRefreshIndices();
  }

  function scRefreshIndices() {
    const tbody = document.getElementById('sc-rows-container');
    if (!tbody) return;
    [...tbody.children].forEach((tr, i) => {
      const idxTd = tr.querySelector('td.idx');
      if (idxTd) idxTd.textContent = String(i + 1);
    });
  }

  function scOnLabelBlur(id, inp) {
    const row = AppState.scatter.rows.find(r => r.id === id);
    if (!row) return;
    row.label = sanitizeText(inp.value).slice(0, 30);
    saveState();
  }

  function scOnNumBlur(id, field, inp) {
    const row = AppState.scatter.rows.find(r => r.id === id);
    if (!row) return;
    const raw = inp.value.trim();
    inp.classList.remove('invalid');
    if (raw === '') { row[field] = NaN; saveState(); return; }
    const v = nnum(raw);
    if (isNaN(v)) { inp.classList.add('invalid'); row[field] = NaN; }
    else { row[field] = v; }
    saveState();
  }

  function scAddRow(focusNew) {
    if (AppState.scatter.rows.length >= 500) {
      showToast('warning', 'Maksimum 500 baris');
      return;
    }
    const id = generateId();
    AppState.scatter.rows.push({ id, label: '', x: NaN, y: NaN });
    scAddRowToDOM(id, '', '', '');
    saveState();
    if (focusNew) {
      const tbody = document.getElementById('sc-rows-container');
      tbody.lastElementChild?.querySelector('td:nth-child(3) input')?.focus();
    }
  }

  function scRemoveRow(id) {
    AppState.scatter.rows = AppState.scatter.rows.filter(r => r.id !== id);
    document.getElementById('sc-rows-container')?.querySelector(`tr[data-id="${id}"]`)?.remove();
    scRefreshIndices();
    saveState();
  }

  function scPopulateTable(rows) {
    const tbody = document.getElementById('sc-rows-container');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (rows.length === 0) {
      for (let i = 0; i < 5; i++) {
        const id = generateId();
        AppState.scatter.rows.push({ id, label: '', x: NaN, y: NaN });
        scAddRowToDOM(id, '', '', '');
      }
    } else {
      rows.forEach(r => scAddRowToDOM(
        r.id,
        r.label || '',
        (typeof r.x === 'number' && !isNaN(r.x)) ? r.x : '',
        (typeof r.y === 'number' && !isNaN(r.y)) ? r.y : ''
      ));
    }
  }

  function scSyncUI() {
    const s = AppState.scatter;
    const titleEl = document.getElementById('sc-title');
    const xLblEl  = document.getElementById('sc-xlabel');
    const yLblEl  = document.getElementById('sc-ylabel');
    const regEl   = document.getElementById('sc-show-regression');
    const bandEl  = document.getElementById('sc-show-band');
    if (titleEl) titleEl.value = s.title || '';
    if (xLblEl)  xLblEl.value  = (s.xLabel && s.xLabel !== 'X') ? s.xLabel : '';
    if (yLblEl)  yLblEl.value  = (s.yLabel && s.yLabel !== 'Y') ? s.yLabel : '';
    if (regEl)   regEl.checked = !!s.showRegression;
    if (bandEl)  bandEl.checked = !!s.showBand;
    scPopulateTable(s.rows.slice());
  }
  window.scSyncUI = scSyncUI;

  /* ---------- stats helpers ---------- */
  function interpretR(r) {
    const abs_r = Math.abs(r);
    const dir = r >= 0 ? 'Positif' : 'Negatif';
    if (abs_r >= 0.9) return dir + ' Sangat Kuat';
    if (abs_r >= 0.7) return dir + ' Kuat';
    if (abs_r >= 0.5) return dir + ' Sedang';
    if (abs_r >= 0.3) return dir + ' Lemah';
    return 'Sangat Lemah / Tidak Signifikan';
  }

  // P-value approx (threshold-based, per spec — display-only)
  function approxPValue(t, df) {
    if (t === Infinity) return 0;
    if (t > 3.5) return 0.001;
    if (t > 2.5) return 0.01;
    if (t > 2.0) return 0.05;
    if (t > 1.5) return 0.10;
    return 0.20;
  }

  function scRenderStats(stats) {
    const el = document.getElementById('sc-stats');
    if (!el) return;
    el.innerHTML = '';
    const mkCard = (label, value, sub, cls) => {
      const c = document.createElement('div');
      c.className = 'stat-card' + (cls ? ' ' + cls : '');
      const l = document.createElement('div'); l.className = 'stat-label'; l.textContent = label;
      const v = document.createElement('div'); v.className = 'stat-value'; v.textContent = value;
      c.append(l, v);
      if (sub) { const s = document.createElement('div'); s.className = 'stat-sub'; s.textContent = sub; c.appendChild(s); }
      return c;
    };
    const rCls = Math.abs(stats.r) >= 0.7 ? 'vital' : (Math.abs(stats.r) >= 0.5 ? '' : 'trivial');
    el.appendChild(mkCard('n (Pasang Data)', String(stats.n)));
    el.appendChild(mkCard('Pearson r', stats.r.toFixed(4), interpretR(stats.r), rCls));
    el.appendChild(mkCard('Koefisien r²', stats.r2.toFixed(4), 'Variasi Y yang dijelaskan X'));
    const sign = stats.beta1 >= 0 ? '+' : '';
    el.appendChild(mkCard('Persamaan Regresi',
      'Ŷ = ' + stats.beta0.toFixed(3) + sign + stats.beta1.toFixed(3) + 'X',
      'Slope = ' + stats.beta1.toFixed(4) + ' | Intercept = ' + stats.beta0.toFixed(4)));
    el.appendChild(mkCard('P-value (approx)',
      stats.pValue <= 0.001 ? '< 0.001' : '≈ ' + stats.pValue,
      stats.pValue < 0.05 ? 'Korelasi Signifikan (α=0.05)' : 'Tidak Signifikan'));
  }

  function scRenderSummary(pairs, predict, sigmaHat) {
    const tbl = document.getElementById('sc-summary-table');
    if (!tbl) return;
    tbl.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Label', 'X', 'Y', 'Ŷ (Prediksi)', 'Residual', 'Residual²'].forEach(c => {
      const th = document.createElement('th'); th.textContent = c; trh.appendChild(th);
    });
    thead.appendChild(trh);
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    pairs.forEach(p => {
      const yHat = predict(p.x);
      const resid = p.y - yHat;
      const tr = document.createElement('tr');
      const cells = [
        [p.label, ''],
        [p.x.toFixed(3), 'num'],
        [p.y.toFixed(3), 'num'],
        [yHat.toFixed(3), 'num'],
        [resid.toFixed(3), 'num' + (Math.abs(resid) > 2 * sigmaHat ? ' vital' : '')],
        [(resid * resid).toFixed(4), 'num']
      ];
      cells.forEach(([v, c]) => {
        const td = document.createElement('td');
        if (c) td.className = c;
        td.textContent = String(v);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
  }

  /* ---------- core render ---------- */
  function renderScatter(rawData, options) {
    options = options || scGetOptions();
    if (typeof Chart === 'undefined') {
      showToast('error', 'Chart.js gagal dimuat. Periksa koneksi internet.');
      return;
    }

    // FASE 1 — sanitize & validate
    const pairs = [];
    const errors = [];
    rawData.forEach((d, i) => {
      const vx = typeof d.x === 'number' ? d.x : nnum(d.x);
      const vy = typeof d.y === 'number' ? d.y : nnum(d.y);
      if (isNaN(vx) || isNaN(vy)) {
        errors.push('Baris ' + (i + 1));
        return;
      }
      pairs.push({
        label: sanitizeText(d.label || String(i + 1)),
        x: vx,
        y: vy
      });
    });
    if (errors.length > 0) showToast('warning', errors.length + ' baris dilewati');
    if (pairs.length < 5) {
      showToast('error', 'Minimal 5 pasang data (X,Y) untuk Scatter Diagram');
      showEmptyState('scatter');
      return;
    }
    const xs = pairs.map(p => p.x);
    const ys = pairs.map(p => p.y);
    if (Math.max(...xs) === Math.min(...xs)) {
      showToast('error', 'Semua nilai X identik — regresi tidak bisa dihitung');
      return;
    }
    if (Math.max(...ys) === Math.min(...ys)) {
      showToast('error', 'Semua nilai Y identik — regresi tidak bisa dihitung');
      return;
    }

    // FASE 2 — stats
    const n = pairs.length;
    const Xbar = xs.reduce((s, v) => s + v, 0) / n;
    const Ybar = ys.reduce((s, v) => s + v, 0) / n;
    const Sxx  = xs.reduce((s, v) => s + (v - Xbar) * (v - Xbar), 0);
    const Syy  = ys.reduce((s, v) => s + (v - Ybar) * (v - Ybar), 0);
    const Sxy  = pairs.reduce((s, p) => s + (p.x - Xbar) * (p.y - Ybar), 0);

    const r = Sxy / Math.sqrt(Sxx * Syy);
    const r2 = r * r;
    const beta1 = Sxy / Sxx;
    const beta0 = Ybar - beta1 * Xbar;
    const predict = (x) => beta0 + beta1 * x;
    const SSres = pairs.reduce((s, p) => s + (p.y - predict(p.x)) ** 2, 0);
    const df = n - 2;
    const sigmaHat = Math.sqrt(SSres / Math.max(1, df));
    const tStat = (df > 0 && r2 < 1)
      ? Math.abs(r) * Math.sqrt(df) / Math.sqrt(1 - r2)
      : Infinity;
    const pValue = approxPValue(tStat, df);

    if (Math.abs(r) >= 0.7) showToast('success', 'Korelasi ' + interpretR(r) + ' (r=' + r.toFixed(3) + ')');
    else if (Math.abs(r) < 0.3) showToast('warning', 'Korelasi lemah (r=' + r.toFixed(3) + ')');

    // FASE 3 — regression line points + confidence band
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const xRange = xMax - xMin;
    const REG_PTS = 50;
    const regLinePoints = Array.from({ length: REG_PTS }, (_, i) => {
      const x = xMin + (i / (REG_PTS - 1)) * xRange;
      return { x, y: predict(x) };
    });

    const t975 = df >= 30 ? 1.96
               : df >= 20 ? 2.086
               : df >= 15 ? 2.131
               : df >= 10 ? 2.228
               : df >= 5  ? 2.571
               : 3.182;

    let bandUpper = null, bandLower = null;
    if (options.showBand && options.showRegression) {
      bandUpper = regLinePoints.map(pt => {
        const se = sigmaHat * Math.sqrt(1 / n + (pt.x - Xbar) * (pt.x - Xbar) / Sxx);
        return { x: pt.x, y: pt.y + t975 * se };
      });
      bandLower = regLinePoints.map(pt => {
        const se = sigmaHat * Math.sqrt(1 / n + (pt.x - Xbar) * (pt.x - Xbar) / Sxx);
        return { x: pt.x, y: pt.y - t975 * se };
      });
    }

    // FASE 4 — destroy old
    if (window.scatterChartInstance) {
      window.scatterChartInstance.destroy();
      window.scatterChartInstance = null;
    }
    if (typeof annotationPlugin !== 'undefined' && !Chart.registry.plugins.get('annotation')) {
      Chart.register(annotationPlugin);
    }
    const annoOk = (typeof annotationPlugin !== 'undefined');

    // FASE 5 — point colors (residual > 2σ̂ → amber)
    const ptColors = pairs.map(p => {
      const resid = Math.abs(p.y - predict(p.x));
      return resid > 2 * sigmaHat
        ? getCSSVar('--accent-amber')
        : getCSSVar('--chart-bar-vital');
    });

    // FASE 6 — build datasets
    const datasets = [{
      type: 'scatter',
      label: options.xLabel + ' vs ' + options.yLabel,
      data: pairs.map(p => ({ x: p.x, y: p.y, label: p.label })),
      backgroundColor: ptColors,
      borderColor: ptColors,
      pointRadius: 6,
      pointHoverRadius: 9,
      order: 2
    }];

    if (options.showRegression) {
      const sign = beta1 >= 0 ? '+' : '';
      datasets.push({
        type: 'line',
        label: 'Regresi: Ŷ=' + beta0.toFixed(3) + sign + beta1.toFixed(3) + 'X',
        data: regLinePoints,
        borderColor: getCSSVar('--accent-red'),
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 1
      });

      if (options.showBand) {
        // Upper band MUST be pushed first so the lower band can fill: '-1'
        datasets.push({
          type: 'line',
          label: '95% CI (atas)',
          data: bandUpper,
          borderColor: getCSSVar('--accent-red') + '40',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0,
          order: 0
        });
        datasets.push({
          type: 'line',
          label: '95% CI (bawah)',
          data: bandLower,
          borderColor: getCSSVar('--accent-red') + '40',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: '-1',
          backgroundColor: getCSSVar('--accent-red') + '10',
          tension: 0,
          order: 0
        });
      }
    }

    // FASE 6.5 — annotations: X̄ and Ȳ guidelines
    const annotations = {};
    if (annoOk) {
      annotations.xMean = {
        type: 'line', scaleID: 'x', value: Xbar,
        borderColor: getCSSVar('--text-muted'), borderWidth: 1, borderDash: [4, 4],
        label: { display: true, content: 'X̄=' + Xbar.toFixed(2), position: 'start',
                 backgroundColor: 'transparent', color: getCSSVar('--text-muted'), font: { size: 9 } }
      };
      annotations.yMean = {
        type: 'line', scaleID: 'y', value: Ybar,
        borderColor: getCSSVar('--text-muted'), borderWidth: 1, borderDash: [4, 4],
        label: { display: true, content: 'Ȳ=' + Ybar.toFixed(2), position: 'end',
                 backgroundColor: 'transparent', color: getCSSVar('--text-muted'), font: { size: 9 } }
      };
    }

    toggleScatterEmpty(false);
    const canvas = document.getElementById('sc-canvas');
    if (!canvas) return;

    window.scatterChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        interaction: { mode: 'nearest', intersect: true },
        scales: {
          x: {
            type: 'linear', position: 'bottom',
            grid: { color: getCSSVar('--border-base') },
            ticks: { color: getCSSVar('--text-secondary'),
                     font: { family: getCSSVar('--font-mono'), size: 11 } },
            title: { display: true, text: sanitizeText(options.xLabel || 'X'),
                     color: getCSSVar('--text-secondary'), font: { size: 12 } }
          },
          y: {
            type: 'linear',
            grid: { color: getCSSVar('--border-base') },
            ticks: { color: getCSSVar('--text-secondary'),
                     font: { family: getCSSVar('--font-mono'), size: 11 } },
            title: { display: true, text: sanitizeText(options.yLabel || 'Y'),
                     color: getCSSVar('--text-secondary'), font: { size: 12 } }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: getCSSVar('--text-secondary'),
              font: { family: getCSSVar('--font-body'), size: 12 }
            }
          },
          tooltip: {
            backgroundColor: getCSSVar('--bg-secondary'),
            borderColor: getCSSVar('--border-base'),
            borderWidth: 1,
            titleColor: getCSSVar('--text-primary'),
            bodyColor:  getCSSVar('--text-secondary'),
            callbacks: {
              title: (items) => {
                const i = items[0].dataIndex;
                return pairs[i] ? pairs[i].label : '#' + (i + 1);
              },
              label: (item) => {
                if (item.datasetIndex === 0) {
                  const raw = item.raw;
                  const yHat = predict(raw.x);
                  return [
                    ' X: ' + raw.x,
                    ' Y: ' + raw.y,
                    ' Ŷ: ' + yHat.toFixed(3),
                    ' Residual: ' + (raw.y - yHat).toFixed(3)
                  ];
                }
                return item.dataset.label + ': ' + (item.raw.y != null ? item.raw.y.toFixed(3) : '');
              }
            }
          },
          annotation: annoOk ? { clip: false, annotations } : {}
        }
      }
    });

    const stats = { n, Xbar, Ybar, Sxx, Syy, Sxy, r, r2, beta0, beta1, sigmaHat, tStat, pValue };
    lastResult = { pairs, stats, predict, sigmaHat, options };
    scRenderStats(stats);
    scRenderSummary(pairs, predict, sigmaHat);
  }
  window.renderScatter = renderScatter;

  function toggleScatterEmpty(showEmpty) {
    const area  = document.getElementById('sc-chart-area');
    const empty = document.getElementById('empty-state-scatter');
    if (area)  area.classList.toggle('hidden', !!showEmpty);
    if (empty) empty.classList.toggle('hidden', !showEmpty);
  }
  window.toggleScatterEmpty = toggleScatterEmpty;

  /* ---------- import / paste ----------
     Auto-detect 2-column (X, Y) or 3-column (Label, X, Y) per pitfall #37. */
  function scParseValues(rawText) {
    const text = (rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText)
                  .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) return [];
    const first = lines[0];
    const delim = first.includes('\t') ? '\t'
                : first.includes(';')  ? ';'
                : first.includes(',')  ? ',' : null;
    const splitClean = (line) => (delim ? line.split(delim) : [line])
      .map(p => p.trim().replace(/^"|"$/g, ''));

    // Header detection: row 0 numeric cells all NaN → skip
    let startAt = 0;
    if (lines.length >= 2) {
      const a = splitClean(lines[0]);
      const numericCols = a.filter(c => !isNaN(nnum(c))).length;
      if (numericCols < Math.min(2, a.length)) startAt = 1;
    }

    const out = [];
    for (let i = startAt; i < lines.length; i++) {
      const cols = splitClean(lines[i]);
      if (cols.length < 2) continue;
      let label, xRaw, yRaw;
      if (cols.length === 2) {
        label = String(out.length + 1);
        xRaw = cols[0]; yRaw = cols[1];
      } else {
        label = cols[0];
        xRaw  = cols[1];
        yRaw  = cols[2];
      }
      const vx = nnum(xRaw);
      const vy = nnum(yRaw);
      if (isNaN(vx) || isNaN(vy)) continue;
      out.push({
        id: generateId(),
        label: sanitizeText(label).slice(0, 30),
        x: vx,
        y: vy
      });
    }
    return out;
  }

  function scImportCSV(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast('error', 'File terlalu besar (max 1MB)'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const rows = scParseValues(String(e.target.result || ''));
      if (rows.length < 5) {
        showToast('error', 'CSV harus berisi minimal 5 pasang (X, Y) valid');
        return;
      }
      AppState.scatter.rows = rows;
      scPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' titik berhasil diimport');
      renderScatter(rows, scGetOptions());
    };
    reader.onerror = () => showToast('error', 'Gagal membaca file');
    reader.readAsText(file);
  }

  function scPasteClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      showToast('warning', 'Clipboard API tidak didukung — gunakan Import CSV');
      return;
    }
    navigator.clipboard.readText().then(text => {
      const rows = scParseValues(text);
      if (rows.length < 5) {
        showToast('error', 'Clipboard harus berisi minimal 5 pasang valid');
        return;
      }
      AppState.scatter.rows = rows;
      scPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' titik dari clipboard');
      renderScatter(rows, scGetOptions());
    }).catch(() => showToast('warning', 'Akses clipboard ditolak'));
  }

  /* ---------- exports ---------- */
  function scExportPNG() {
    if (!window.scatterChartInstance) { showToast('error', 'Render chart dulu'); return; }
    triggerDownload(window.scatterChartInstance.toBase64Image('image/png'), 'scatter-diagram.png');
  }

  function scExportCSV() {
    if (!lastResult) { showToast('error', 'Render chart dulu'); return; }
    const BOM = '﻿';
    const { pairs, stats, predict } = lastResult;
    let csv = BOM + 'Label,X,Y,Y_Hat,Residual,Residual_Squared\n';
    pairs.forEach(p => {
      const yh = predict(p.x);
      const res = p.y - yh;
      const lbl = /[,"\n]/.test(p.label)
        ? '"' + p.label.replace(/"/g, '""') + '"' : p.label;
      csv += lbl + ',' + p.x + ',' + p.y + ',' +
             yh.toFixed(4) + ',' + res.toFixed(4) + ',' + (res * res).toFixed(6) + '\n';
    });
    csv += '\n# Statistik Ringkasan\n';
    csv += 'n,' + stats.n + '\n';
    csv += 'r,' + stats.r.toFixed(6) + '\n';
    csv += 'r2,' + stats.r2.toFixed(6) + '\n';
    csv += 'Beta0 (Intercept),' + stats.beta0.toFixed(6) + '\n';
    csv += 'Beta1 (Slope),' + stats.beta1.toFixed(6) + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'scatter-data.csv');
  }

  /* ---------- reset ---------- */
  function scReset() {
    showModal('Hapus semua data Scatter Diagram?', () => {
      if (window.scatterChartInstance) { window.scatterChartInstance.destroy(); window.scatterChartInstance = null; }
      AppState.scatter.title          = '';
      AppState.scatter.xLabel         = 'X';
      AppState.scatter.yLabel         = 'Y';
      AppState.scatter.showRegression = true;
      AppState.scatter.showBand       = false;
      AppState.scatter.rows           = [];
      saveState();
      scSyncUI();
      showEmptyState('scatter');
      showToast('success', 'Scatter Diagram direset');
    });
  }

  /* ---------- init ---------- */
  function initScatter() {
    document.getElementById('btn-sc-add-row')?.addEventListener('click', () => scAddRow(true));
    document.getElementById('btn-sc-render')?.addEventListener('click', () => {
      scSyncStateFromUI();
      saveState();
      renderScatter(AppState.scatter.rows.slice(), scGetOptions());
    });
    document.getElementById('btn-sc-import-csv')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) scImportCSV(f);
      e.target.value = '';
    });
    document.getElementById('btn-sc-paste')?.addEventListener('click', scPasteClipboard);
    document.getElementById('btn-sc-export-png')?.addEventListener('click', scExportPNG);
    document.getElementById('btn-sc-export-csv')?.addEventListener('click', scExportCSV);
    document.getElementById('btn-sc-reset')?.addEventListener('click', scReset);

    ['sc-title', 'sc-xlabel', 'sc-ylabel'].forEach(id => {
      document.getElementById(id)?.addEventListener('blur', () => { scSyncStateFromUI(); saveState(); });
    });
    ['sc-show-regression', 'sc-show-band'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => { scSyncStateFromUI(); saveState(); });
    });

    // Ctrl+Enter to render when scatter tab is active
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter' && AppState.activeTab === 'scatter') {
        e.preventDefault();
        scSyncStateFromUI();
        renderScatter(AppState.scatter.rows.slice(), scGetOptions());
      }
    });

    scSyncUI();
  }
  window.initScatter = initScatter;

})();
