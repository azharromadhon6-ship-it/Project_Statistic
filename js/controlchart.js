/* ============================================================
   controlchart.js — p-Chart (Peta Kendali Proporsi) engine
   Replaces the previous I-MR / X̄-R implementation entirely.

   Input per row : { id, period, n, np }
   Statistics    : pᵢ = npᵢ / nᵢ,  p̄ = Σnp / Σn
   Control limits: per-point (variable) because nᵢ may vary —
     UCLᵢ = p̄ + 3·√(p̄(1−p̄) / nᵢ)
     LCLᵢ = max(0, p̄ − 3·√(p̄(1−p̄) / nᵢ))
   ============================================================ */
(function () {

  let lastResult = null;

  /* ────────────────────────────────────────────────────────────
     Options + state sync
     ──────────────────────────────────────────────────────────── */
  function ccGetOptions() {
    const titleEl  = document.getElementById('cc-title');
    const labelYEl = document.getElementById('cc-label-y');
    return {
      title:  sanitizeText(titleEl?.value || '') || 'p-Chart',
      labelY: sanitizeText(labelYEl?.value || '').trim() || 'Proporsi Cacat (p)'
    };
  }
  window.getControlChartOptions = ccGetOptions;

  function ccSyncStateFromUI() {
    const o = ccGetOptions();
    AppState.controlChart.title  = (o.title === 'p-Chart') ? '' : o.title;
    AppState.controlChart.labelY = (o.labelY === 'Proporsi Cacat (p)') ? '' : o.labelY;
  }

  /* ────────────────────────────────────────────────────────────
     Input table (4 columns: Periode, n, np, ×)
     ──────────────────────────────────────────────────────────── */
  function ccAddRowToDOM(id, period, n, np) {
    const tbody = document.getElementById('cc-rows-container');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.dataset.id = id;

    const tdIdx = document.createElement('td');
    tdIdx.className = 'idx';

    // Periode
    const tdPeriod = document.createElement('td');
    const periodInp = document.createElement('input');
    periodInp.type = 'text';
    periodInp.className = 'cc-period-input';
    periodInp.dataset.id = id;
    periodInp.value = period || '';
    periodInp.placeholder = 'Jan 2024';
    periodInp.maxLength = 30;
    periodInp.addEventListener('blur', () => ccOnPeriodBlur(id, periodInp));
    tdPeriod.appendChild(periodInp);

    // n (production)
    const tdN = document.createElement('td');
    const nInp = document.createElement('input');
    nInp.type = 'number';
    nInp.min = '1';
    nInp.max = '999999';
    nInp.step = '1';
    nInp.className = 'cc-n-input';
    nInp.dataset.id = id;
    nInp.placeholder = '0';
    nInp.value = (n === '' || n === null || n === undefined ||
                  (typeof n === 'number' && isNaN(n))) ? '' : String(n);
    nInp.addEventListener('blur', () => ccOnNumBlur(id, 'n', nInp));
    tdN.appendChild(nInp);

    // np (defects)
    const tdNp = document.createElement('td');
    const npInp = document.createElement('input');
    npInp.type = 'number';
    npInp.min = '0';
    npInp.max = '999999';
    npInp.step = '1';
    npInp.className = 'cc-np-input';
    npInp.dataset.id = id;
    npInp.placeholder = '0';
    npInp.value = (np === '' || np === null || np === undefined ||
                   (typeof np === 'number' && isNaN(np))) ? '' : String(np);
    npInp.addEventListener('blur', () => ccOnNumBlur(id, 'np', npInp));
    npInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ccOnNumBlur(id, 'np', npInp);
        ccAddRow(true);
      }
    });
    tdNp.appendChild(npInp);

    // Remove button
    const tdBtn = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn-remove-row';
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = 'Hapus baris';
    btn.addEventListener('click', () => ccRemoveRow(id));
    tdBtn.appendChild(btn);

    tr.append(tdIdx, tdPeriod, tdN, tdNp, tdBtn);
    tbody.appendChild(tr);
    ccRefreshIndices();
  }

  function ccRefreshIndices() {
    const tbody = document.getElementById('cc-rows-container');
    if (!tbody) return;
    [...tbody.children].forEach((tr, i) => {
      const idxTd = tr.querySelector('td.idx');
      if (idxTd) idxTd.textContent = String(i + 1);
    });
  }

  function ccOnPeriodBlur(id, inp) {
    const row = AppState.controlChart.rows.find(r => r.id === id);
    if (!row) return;
    row.period = sanitizeText(inp.value).slice(0, 30);
    saveState();
  }

  function ccOnNumBlur(id, field, inp) {
    const row = AppState.controlChart.rows.find(r => r.id === id);
    if (!row) return;
    const raw = inp.value.trim();
    inp.classList.remove('invalid');
    if (raw === '') { row[field] = NaN; saveState(); return; }
    const v = parseInt(raw, 10);
    if (isNaN(v) || v < 0) { inp.classList.add('invalid'); row[field] = NaN; }
    else { row[field] = v; }
    saveState();
  }

  function ccAddRow(focusNew) {
    if (AppState.controlChart.rows.length >= 200) {
      showToast('warning', 'Maksimum 200 baris');
      return;
    }
    const id = generateId();
    AppState.controlChart.rows.push({ id, period: '', n: NaN, np: NaN });
    ccAddRowToDOM(id, '', '', '');
    saveState();
    if (focusNew) {
      const tbody = document.getElementById('cc-rows-container');
      // focus the Periode input (first input cell)
      tbody.lastElementChild?.querySelector('td:nth-child(2) input')?.focus();
    }
  }

  function ccRemoveRow(id) {
    AppState.controlChart.rows = AppState.controlChart.rows.filter(r => r.id !== id);
    document.getElementById('cc-rows-container')
      ?.querySelector(`tr[data-id="${id}"]`)?.remove();
    ccRefreshIndices();
    saveState();
  }
  window.removeCCRow = ccRemoveRow;

  function ccPopulateTable(rows) {
    const tbody = document.getElementById('cc-rows-container');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (rows.length === 0) {
      // seed with 5 empty rows
      for (let i = 0; i < 5; i++) {
        const id = generateId();
        AppState.controlChart.rows.push({ id, period: '', n: NaN, np: NaN });
        ccAddRowToDOM(id, '', '', '');
      }
    } else {
      rows.forEach(r => ccAddRowToDOM(
        r.id,
        r.period || '',
        (typeof r.n  === 'number' && !isNaN(r.n))  ? r.n  : '',
        (typeof r.np === 'number' && !isNaN(r.np)) ? r.np : ''
      ));
    }
  }

  function ccSyncUI() {
    const titleEl  = document.getElementById('cc-title');
    const labelYEl = document.getElementById('cc-label-y');
    const c = AppState.controlChart;
    if (titleEl)  titleEl.value  = c.title  || '';
    if (labelYEl) labelYEl.value = c.labelY || '';
    ccPopulateTable(c.rows.slice());
  }
  window.ccSyncUI = ccSyncUI;

  /* ────────────────────────────────────────────────────────────
     p-Chart calculation
     ──────────────────────────────────────────────────────────── */
  function calcPChart(rows) {
    const n = rows.length;
    if (n < 2) return null;

    const ps = rows.map(r => r.n > 0 ? r.np / r.n : 0);
    const totalNP = rows.reduce((s, r) => s + r.np, 0);
    const totalN  = rows.reduce((s, r) => s + r.n,  0);
    const pBar = totalN > 0 ? totalNP / totalN : 0;
    const variance = pBar * (1 - pBar);

    const UCLs = rows.map(r => pBar + 3 * Math.sqrt(variance / r.n));
    const LCLs = rows.map(r => Math.max(0, pBar - 3 * Math.sqrt(variance / r.n)));
    const UCL_avg = UCLs.reduce((s, v) => s + v, 0) / n;
    const LCL_avg = LCLs.reduce((s, v) => s + v, 0) / n;

    const oocIdx = ps.map((p, i) => p > UCLs[i] || p < LCLs[i]);

    const labels = rows.map((r, i) =>
      (r.period && r.period.trim() !== '') ? r.period : '#' + (i + 1)
    );

    return { ps, pBar, UCLs, LCLs, UCL_avg, LCL_avg, oocIdx, totalN, totalNP, labels };
  }

  /* ────────────────────────────────────────────────────────────
     Stats panel
     ──────────────────────────────────────────────────────────── */
  function ccRenderStats(stats) {
    const el = document.getElementById('cc-stats');
    if (!el) return;
    el.innerHTML = '';

    const mkCard = (label, value, id) => {
      const c = document.createElement('div');
      c.className = 'stat-card';
      if (id) c.id = id;
      const l = document.createElement('div'); l.className = 'stat-label'; l.textContent = label;
      const v = document.createElement('div'); v.className = 'stat-value'; v.textContent = value;
      c.append(l, v);
      return c;
    };

    const oocCount = stats.oocIdx.filter(Boolean).length;
    const pct = (v) => (v * 100).toFixed(2) + '%';

    el.appendChild(mkCard('Total n',    String(stats.totalN),  'cc-stat-total-n'));
    el.appendChild(mkCard('Total np',   String(stats.totalNP), 'cc-stat-total-np'));
    el.appendChild(mkCard('p̄ (CL)',     pct(stats.pBar),       'cc-stat-pbar'));
    el.appendChild(mkCard('UCL avg',    pct(stats.UCL_avg),    'cc-stat-ucl'));
    el.appendChild(mkCard('LCL avg',    pct(stats.LCL_avg),    'cc-stat-lcl'));
    el.appendChild(mkCard('OOC Points', String(oocCount),      'cc-stat-ooc'));

    // Full-width status card
    const statusCard = document.createElement('div');
    statusCard.id = 'cc-stat-status';
    statusCard.className = 'stat-card cc-status-card ' + (oocCount === 0 ? 'stable' : 'unstable');
    statusCard.style.gridColumn = '1 / -1';
    const sLabel = document.createElement('div');
    sLabel.className = 'stat-label';
    sLabel.textContent = 'STATUS';
    const sValue = document.createElement('div');
    sValue.className = 'stat-value';
    sValue.textContent = oocCount === 0
      ? 'PROSES STABIL'
      : 'PROSES TIDAK STABIL (' + oocCount + ' OOC)';
    statusCard.append(sLabel, sValue);
    el.appendChild(statusCard);

    // The legacy summary table is unused now — keep the DOM but blank it.
    const summary = document.getElementById('cc-summary-table');
    if (summary) summary.innerHTML = '';
  }

  /* ────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────── */
  function renderControlChart(rawData, options) {
    options = options || ccGetOptions();
    if (typeof Chart === 'undefined') {
      showToast('error', 'Chart.js gagal dimuat. Periksa koneksi internet.');
      return;
    }

    // Validate rows
    const errors = [];
    const valid = [];
    (Array.isArray(rawData) ? rawData : []).forEach((r, i) => {
      const nVal  = typeof r.n  === 'number' ? r.n  : parseInt(r.n,  10);
      const npVal = typeof r.np === 'number' ? r.np : parseInt(r.np, 10);
      if (isNaN(nVal)  || nVal  <= 0) { errors.push('Baris ' + (i + 1) + ': n harus > 0'); return; }
      if (isNaN(npVal) || npVal <  0) { errors.push('Baris ' + (i + 1) + ': np harus ≥ 0'); return; }
      if (npVal > nVal) {
        errors.push('Baris ' + (i + 1) + ': Cacat (np) tidak boleh > Produksi (n)');
        return;
      }
      valid.push({ period: r.period || '', n: nVal, np: npVal });
    });

    if (errors.length > 0) {
      // Show first error verbatim, summarize the rest
      showToast('error', errors.length === 1
        ? errors[0]
        : errors[0] + ' (+' + (errors.length - 1) + ' lainnya)');
    }

    if (valid.length < 5) {
      showToast('error', 'Minimal 5 baris data valid untuk p-Chart');
      showEmptyState('controlchart');
      return;
    }

    const stats = calcPChart(valid);
    if (!stats) {
      showEmptyState('controlchart');
      return;
    }

    // Y range — clamped to [0, 1] since p is a proportion
    const pool = [...stats.UCLs, ...stats.LCLs, ...stats.ps, stats.pBar];
    const pad  = (Math.max(...pool) - Math.min(...pool)) * 0.15;
    const yMin = Math.max(0, Math.min(...pool) - pad);
    const yMax = Math.min(1, Math.max(...pool) + pad);

    // Destroy any prior chart; null the legacy MR reference too.
    if (window.ccChartInstance) { window.ccChartInstance.destroy(); window.ccChartInstance = null; }
    window.ccMRChartInstance = null;

    toggleEmpty('controlchart', false);

    // Hard-coded colors so PNG export resolves cleanly.
    const COLOR_P     = '#3B82F6';   // blue: pᵢ line + in-control points
    const COLOR_OOC   = '#EF4444';   // red: OOC points + UCL/LCL lines
    const COLOR_CL    = '#10B981';   // green: center line
    const COLOR_ZONE  = 'rgba(59, 130, 246, 0.07)';  // faint blue between UCL/LCL
    const COLOR_GRID  = 'rgba(148, 163, 184, 0.12)';
    const COLOR_BG    = '#FAFAFA';

    const bgPlugin = {
      id: 'lightBg',
      beforeDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = COLOR_BG;
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
      }
    };

    const n = valid.length;
    const ptBg     = stats.ps.map((_, i) => stats.oocIdx[i] ? COLOR_OOC : COLOR_P);
    const ptBorder = stats.ps.map((_, i) => stats.oocIdx[i] ? COLOR_OOC : COLOR_P);
    const ptRad    = stats.ps.map((_, i) => stats.oocIdx[i] ? 8 : 5);

    const datasets = [
      // pᵢ data line
      {
        type: 'line',
        label: 'pᵢ (proporsi)',
        data: stats.ps,
        borderColor: COLOR_P,
        borderWidth: 2,
        pointBackgroundColor: ptBg,
        pointBorderColor: ptBorder,
        pointRadius: ptRad,
        pointHoverRadius: 9,
        pointStyle: 'circle',
        fill: false,
        tension: 0,
        order: 1
      },
      // UCL (variable per point)
      {
        type: 'line',
        label: 'UCL = ' + stats.UCL_avg.toFixed(4),
        data: stats.UCLs,
        borderColor: COLOR_OOC,
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 3
      },
      // CL (constant p̄)
      {
        type: 'line',
        label: 'CL  p̄ = ' + stats.pBar.toFixed(4),
        data: Array(n).fill(stats.pBar),
        borderColor: COLOR_CL,
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 3
      },
      // LCL (variable per point)
      {
        type: 'line',
        label: 'LCL = ' + stats.LCL_avg.toFixed(4),
        data: stats.LCLs,
        borderColor: COLOR_OOC,
        borderWidth: 1.5,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 3
      },
      // Shaded zone between UCL (this dataset) and LCL (previous dataset).
      // fill: '-1' targets the immediately preceding dataset, which is LCL.
      {
        type: 'line',
        label: '',
        data: stats.UCLs,
        borderColor: 'rgba(0,0,0,0)',
        borderWidth: 0,
        pointRadius: 0,
        backgroundColor: COLOR_ZONE,
        fill: '-1',
        tension: 0,
        order: 4
      }
    ];

    const canvas = document.getElementById('cc-chart-canvas');
    if (!canvas) return;

    window.ccChartInstance = new Chart(canvas.getContext('2d'), {
      plugins: [bgPlugin],
      data: { labels: stats.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 400 },
        layout: { padding: { top: 8, right: 12, bottom: 4, left: 8 } },
        plugins: {
          title: {
            display: !!options.title,
            text: options.title || '',
            color: '#222222',
            font: { family: 'system-ui, sans-serif', size: 15, weight: '700' },
            padding: { top: 4, bottom: 12 }
          },
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              pointStyleWidth: 16,
              color: '#444444',
              font: { size: 11, family: 'system-ui, sans-serif' },
              padding: 14,
              filter: (item) => item.text && item.text.trim() !== ''
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#ffffff',
            borderColor: '#dddddd',
            borderWidth: 1,
            titleColor: '#222222',
            bodyColor: '#555555',
            padding: 10,
            callbacks: {
              label: (item) => {
                // Hide the shaded fill dataset and the constant-CL dataset
                if (!item.dataset.label || item.dataset.label === '') return null;
                if (item.datasetIndex === 0) {
                  return ' p = ' + (item.raw * 100).toFixed(2) + '%';
                }
                return ' ' + item.dataset.label + ' = ' + (item.raw * 100).toFixed(2) + '%';
              },
              afterBody: (items) => {
                if (!items || items.length === 0) return [];
                const i = items[0].dataIndex;
                const row = valid[i];
                const isOOC = stats.oocIdx[i];
                return [
                  'n = ' + row.n + ', np = ' + row.np,
                  isOOC ? '⚠ OUT OF CONTROL' : '✓ In Control'
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid:   { color: 'rgba(148,163,184,0.10)' },
            border: { color: '#dddddd' },
            ticks:  { color: '#555555', font: { size: 11, family: 'system-ui, sans-serif' } },
            title:  { display: true, text: 'Periode',
                      color: '#555555', font: { size: 12, family: 'system-ui, sans-serif' } }
          },
          y: {
            min: parseFloat(yMin.toFixed(4)),
            max: parseFloat(yMax.toFixed(4)),
            grid:   { color: COLOR_GRID },
            border: { color: '#dddddd' },
            ticks:  {
              color: '#555555',
              font: { family: 'monospace', size: 11 },
              callback: (val) => (val * 100).toFixed(2) + '%'
            },
            title:  { display: true,
                      text: options.labelY || 'Proporsi Cacat (p)',
                      color: '#555555', font: { size: 12, family: 'system-ui, sans-serif' } }
          }
        }
      }
    });

    // Cache for export + tooltip
    lastResult = { rows: valid, stats, options };
    AppState.controlChart.stats = {
      pBar: stats.pBar, UCL_avg: stats.UCL_avg, LCL_avg: stats.LCL_avg,
      totalN: stats.totalN, totalNP: stats.totalNP,
      oocCount: stats.oocIdx.filter(Boolean).length
    };

    ccRenderStats(stats);
  }
  window.renderControlChart = renderControlChart;

  /* ────────────────────────────────────────────────────────────
     CSV import / paste / export
     CSV format: Periode,n,np   (header optional, auto-detected)
     ──────────────────────────────────────────────────────────── */
  function ccParseCSV(rawText) {
    if (typeof rawText !== 'string' || !rawText.trim()) return [];
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

    // Header detection: row 0 last two cells non-numeric AND row 1 last two cells numeric
    let startAt = 0;
    if (lines.length >= 2) {
      const a = splitClean(lines[0]);
      const b = splitClean(lines[1]);
      const isNum = (s) => !isNaN(parseInt(s, 10));
      const aHasNum = a.length >= 3 && (isNum(a[1]) && isNum(a[2]));
      const bHasNum = b.length >= 3 && (isNum(b[1]) && isNum(b[2]));
      if (!aHasNum && bHasNum) startAt = 1;
    }

    const out = [];
    for (let i = startAt; i < lines.length; i++) {
      const cols = splitClean(lines[i]);
      if (cols.length < 3) continue;
      const period = sanitizeText(cols[0]).slice(0, 30);
      const n  = parseInt(cols[1], 10);
      const np = parseInt(cols[2], 10);
      if (isNaN(n) || isNaN(np)) continue;
      if (n <= 0 || np < 0 || np > n) continue;
      out.push({ id: generateId(), period, n, np });
    }
    return out;
  }

  function ccImportCSV(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast('error', 'File terlalu besar (max 1MB)'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = ccParseCSV(String(e.target.result || ''));
      if (rows.length < 5) {
        showToast('error', 'CSV harus berisi minimal 5 baris (periode, n, np) yang valid');
        return;
      }
      AppState.controlChart.rows = rows;
      ccPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' baris berhasil diimport');
      renderControlChart(rows, ccGetOptions());
    };
    reader.onerror = () => showToast('error', 'Gagal membaca file');
    reader.readAsText(file);
  }

  function ccPasteClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      showToast('warning', 'Clipboard API tidak didukung — gunakan Import CSV');
      return;
    }
    navigator.clipboard.readText().then(text => {
      const rows = ccParseCSV(text);
      if (rows.length < 5) {
        showToast('error', 'Clipboard harus berisi minimal 5 baris (periode, n, np)');
        return;
      }
      AppState.controlChart.rows = rows;
      ccPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' baris dari clipboard');
      renderControlChart(rows, ccGetOptions());
    }).catch(() => showToast('warning', 'Akses clipboard ditolak'));
  }

  /* ────────────────────────────────────────────────────────────
     Exports
     ──────────────────────────────────────────────────────────── */
  function ccExportPNG() {
    if (!window.ccChartInstance) { showToast('error', 'Render chart dulu'); return; }
    triggerDownload(window.ccChartInstance.toBase64Image('image/png'), 'p-chart.png');
  }

  function ccExportCSV() {
    if (!lastResult) { showToast('error', 'Render chart dulu'); return; }
    const BOM = '﻿';
    const escape = (s) => /[,"\n]/.test(String(s))
      ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);

    let csv = BOM + 'Periode,n,np,p,UCL,LCL,Status\n';
    const { rows, stats } = lastResult;
    rows.forEach((r, i) => {
      const p   = stats.ps[i];
      const ucl = stats.UCLs[i];
      const lcl = stats.LCLs[i];
      const status = stats.oocIdx[i] ? 'OOC' : 'Dalam Kendali';
      csv += escape(r.period) + ',' + r.n + ',' + r.np + ',' +
             p.toFixed(4) + ',' + ucl.toFixed(4) + ',' + lcl.toFixed(4) + ',' + status + '\n';
    });
    csv += ',,Rata-rata,' + stats.pBar.toFixed(4) + ',' +
           stats.UCL_avg.toFixed(4) + ',' + stats.LCL_avg.toFixed(4) + ',\n';

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'p-chart-data.csv');
  }

  /* ────────────────────────────────────────────────────────────
     Reset
     ──────────────────────────────────────────────────────────── */
  function ccReset() {
    showModal('Hapus semua data p-Chart?', () => {
      if (window.ccChartInstance) { window.ccChartInstance.destroy(); window.ccChartInstance = null; }
      window.ccMRChartInstance = null;
      AppState.controlChart.title  = '';
      AppState.controlChart.labelY = '';
      AppState.controlChart.rows   = [];
      AppState.controlChart.stats  = {};
      saveState();
      ccSyncUI();
      showEmptyState('controlchart');
      showToast('success', 'p-Chart direset');
    });
  }

  /* ────────────────────────────────────────────────────────────
     Init
     ──────────────────────────────────────────────────────────── */
  function initControlChart() {
    document.getElementById('btn-cc-add-row')?.addEventListener('click', () => ccAddRow(true));
    document.getElementById('btn-cc-render')?.addEventListener('click', () => {
      ccSyncStateFromUI();
      saveState();
      renderControlChart(AppState.controlChart.rows.slice(), ccGetOptions());
    });
    document.getElementById('btn-cc-import-csv')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) ccImportCSV(f);
      e.target.value = '';
    });
    document.getElementById('btn-cc-paste')?.addEventListener('click', ccPasteClipboard);
    document.getElementById('btn-cc-export-png')?.addEventListener('click', ccExportPNG);
    document.getElementById('btn-cc-export-csv')?.addEventListener('click', ccExportCSV);
    document.getElementById('btn-cc-reset')?.addEventListener('click', ccReset);

    ['cc-title', 'cc-label-y'].forEach(id => {
      document.getElementById(id)?.addEventListener('blur', () => {
        ccSyncStateFromUI();
        saveState();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter' && AppState.activeTab === 'controlchart') {
        e.preventDefault();
        ccSyncStateFromUI();
        renderControlChart(AppState.controlChart.rows.slice(), ccGetOptions());
      }
    });

    ccSyncUI();
  }
  window.initControlChart = initControlChart;

})();
