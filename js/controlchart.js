/* ============================================================
   controlchart.js — Shewhart Control Chart engine (I-MR / X̄-R)
   Loaded after app.js + Chart.js. Implements §3D.
   ============================================================ */
(function () {

  const CC_CONSTANTS = {
    2:  { A2: 1.880, D3: 0,     D4: 3.267, d2: 1.128 },
    3:  { A2: 1.023, D3: 0,     D4: 2.574, d2: 1.693 },
    4:  { A2: 0.729, D3: 0,     D4: 2.282, d2: 2.059 },
    5:  { A2: 0.577, D3: 0,     D4: 2.114, d2: 2.326 },
    6:  { A2: 0.483, D3: 0,     D4: 2.004, d2: 2.534 },
    7:  { A2: 0.419, D3: 0.076, D4: 1.924, d2: 2.704 },
    8:  { A2: 0.373, D3: 0.136, D4: 1.864, d2: 2.847 },
    9:  { A2: 0.337, D3: 0.184, D4: 1.816, d2: 2.970 },
    10: { A2: 0.308, D3: 0.223, D4: 1.777, d2: 3.078 }
  };

  // local cache for export
  let lastResult = null;

  /* ---------- helpers ---------- */
  function nnum(s) {
    if (typeof window.normalizeNumber === 'function') return window.normalizeNumber(String(s));
    const v = parseFloat(String(s).replace(',', '.'));
    return isNaN(v) ? NaN : v;
  }

  function ccGetOptions() {
    const titleEl = document.getElementById('cc-title');
    const typeEl  = document.getElementById('cc-type');
    const sigEl   = document.getElementById('cc-sigma');
    const sgEl    = document.getElementById('cc-subgroup-size');
    const unitEl  = document.getElementById('cc-unit');
    const sigma   = parseFloat(sigEl?.value);
    const sgSize  = parseInt(sgEl?.value, 10);
    return {
      title: sanitizeText(titleEl?.value || '') || 'Control Chart',
      type: (typeEl?.value === 'xbar') ? 'xbar' : 'imr',
      sigmaMultiplier: (!isNaN(sigma) && sigma >= 1 && sigma <= 4) ? sigma : 3,
      subgroupSize: (!isNaN(sgSize) && sgSize >= 2 && sgSize <= 10) ? sgSize : 2,
      unitLabel: sanitizeText(unitEl?.value || '') || 'Nilai'
    };
  }
  window.getControlChartOptions = ccGetOptions;

  function ccSyncStateFromUI() {
    const o = ccGetOptions();
    AppState.controlChart.title = o.title === 'Control Chart' ? '' : o.title;
    AppState.controlChart.type = o.type;
    AppState.controlChart.sigma = o.sigmaMultiplier;
    AppState.controlChart.subgroupSize = o.subgroupSize;
    AppState.controlChart.unit = document.getElementById('cc-unit')?.value || '';
  }

  /* ---------- input table ---------- */
  function ccAddRowToDOM(id, value) {
    const tbody = document.getElementById('cc-rows-container');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.dataset.id = id;
    const tdIdx = document.createElement('td');
    tdIdx.className = 'idx';
    const tdVal = document.createElement('td');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value === '' || value === undefined || value === null ? '' : String(value);
    inp.placeholder = '0';
    inp.addEventListener('blur',  () => ccOnRowBlur(id, inp));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); ccOnRowBlur(id, inp); ccAddRow(true); }
    });
    tdVal.appendChild(inp);
    const tdBtn = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn-remove-row';
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = 'Hapus baris';
    btn.addEventListener('click', () => ccRemoveRow(id));
    tdBtn.appendChild(btn);
    tr.append(tdIdx, tdVal, tdBtn);
    tbody.appendChild(tr);
    ccRefreshIndices();
  }
  window.ccAddRowToDOM = ccAddRowToDOM;

  function ccRefreshIndices() {
    const tbody = document.getElementById('cc-rows-container');
    if (!tbody) return;
    [...tbody.children].forEach((tr, i) => {
      const idxTd = tr.querySelector('td.idx');
      if (idxTd) idxTd.textContent = String(i + 1);
    });
  }

  function ccOnRowBlur(id, inp) {
    const raw = inp.value.trim();
    const row = AppState.controlChart.rows.find(r => r.id === id);
    if (!row) return;
    if (raw === '') { row.value = NaN; inp.classList.remove('invalid'); saveState(); return; }
    const v = nnum(raw);
    if (isNaN(v)) { inp.classList.add('invalid'); row.value = NaN; }
    else { inp.classList.remove('invalid'); row.value = v; }
    saveState();
  }

  function ccAddRow(focusNew) {
    if (AppState.controlChart.rows.length >= 200) {
      showToast('warning', 'Maksimum 200 baris');
      return;
    }
    const id = generateId();
    AppState.controlChart.rows.push({ id, value: NaN });
    ccAddRowToDOM(id, '');
    saveState();
    if (focusNew) {
      const tbody = document.getElementById('cc-rows-container');
      const inp = tbody.lastElementChild?.querySelector('input');
      inp?.focus();
    }
  }

  function ccRemoveRow(id) {
    AppState.controlChart.rows = AppState.controlChart.rows.filter(r => r.id !== id);
    const tbody = document.getElementById('cc-rows-container');
    const tr = tbody?.querySelector(`tr[data-id="${id}"]`);
    tr?.remove();
    ccRefreshIndices();
    saveState();
  }

  function ccPopulateTable(rows) {
    const tbody = document.getElementById('cc-rows-container');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (rows.length === 0) {
      // seed with 8 empty rows (minimum needed)
      for (let i = 0; i < 8; i++) {
        const id = generateId();
        AppState.controlChart.rows.push({ id, value: NaN });
        ccAddRowToDOM(id, '');
      }
    } else {
      rows.forEach(r => ccAddRowToDOM(r.id, isNaN(r.value) ? '' : r.value));
    }
  }

  /* ---------- sync UI from state (called by app.js after restore) ---------- */
  function ccSyncUI() {
    const titleEl = document.getElementById('cc-title');
    const typeEl  = document.getElementById('cc-type');
    const sigEl   = document.getElementById('cc-sigma');
    const sgEl    = document.getElementById('cc-subgroup-size');
    const unitEl  = document.getElementById('cc-unit');
    const cc = AppState.controlChart;
    if (titleEl) titleEl.value = cc.title || '';
    if (typeEl)  typeEl.value  = cc.type || 'imr';
    if (sigEl)   sigEl.value   = cc.sigma || 3;
    if (sgEl)    sgEl.value    = cc.subgroupSize || 2;
    if (unitEl)  unitEl.value  = cc.unit || '';
    if (sgEl) sgEl.disabled = (typeEl?.value !== 'xbar');
    ccPopulateTable(cc.rows.slice());
  }
  window.ccSyncUI = ccSyncUI;

  /* ---------- statistics panel ---------- */
  function ccRenderStats(stats, opts, type) {
    const el = document.getElementById('cc-stats');
    if (!el) return;
    el.innerHTML = '';
    const cards = [];
    if (type === 'imr') {
      cards.push(['N',         String(stats.n)]);
      cards.push(['Mean (X̄)', stats.mean.toFixed(3)]);
      cards.push(['σ̂ (MR̄/d2)', stats.stdDev.toFixed(3)]);
      cards.push(['UCL',       stats.UCL.toFixed(3)]);
      cards.push(['CL',        stats.CL.toFixed(3)]);
      cards.push(['LCL',       stats.LCL.toFixed(3)]);
      cards.push(['σ Multiplier', opts.sigmaMultiplier.toFixed(1)]);
      cards.push(['OOC Points', String(stats.oocCount)]);
    } else {
      cards.push(['N total',   String(stats.n * stats.k)]);
      cards.push(['Subgroup n', String(stats.n)]);
      cards.push(['k subgroup', String(stats.k)]);
      cards.push(['Mean (X̄̄)', stats.mean.toFixed(3)]);
      cards.push(['R̄',         stats.RBar.toFixed(3)]);
      cards.push(['UCL X̄',     stats.UCL_x.toFixed(3)]);
      cards.push(['LCL X̄',     stats.LCL_x.toFixed(3)]);
      cards.push(['UCL R',     stats.UCL_r.toFixed(3)]);
      cards.push(['OOC X̄',     String(stats.oocX)]);
      cards.push(['OOC R',      String(stats.oocR)]);
    }
    cards.forEach(([label, val]) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      const l = document.createElement('div');
      l.className = 'stat-label';
      l.textContent = label;
      const v = document.createElement('div');
      v.className = 'stat-value';
      v.textContent = val;
      card.append(l, v);
      el.appendChild(card);
    });
    const totalOOC = type === 'imr' ? stats.oocCount : (stats.oocX + stats.oocR);
    const badge = document.createElement('div');
    badge.className = 'cc-status-badge ' + (totalOOC === 0 ? 'stable' : 'unstable');
    badge.textContent = totalOOC === 0 ? 'PROSES STABIL' : 'PROSES TIDAK STABIL';
    el.appendChild(badge);
  }

  function ccRenderSummary(plotData, ooc, type) {
    const tbl = document.getElementById('cc-summary-table');
    if (!tbl) return;
    tbl.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const cols = type === 'imr'
      ? ['#', 'Nilai', 'Status']
      : ['Subgroup', 'X̄', 'R', 'Status'];
    cols.forEach(c => { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
    thead.appendChild(trh);
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    plotData.forEach((v, i) => {
      const tr = document.createElement('tr');
      const isOOC = ooc[i]?.isOOC;
      if (isOOC) tr.className = 'ooc-row';
      const td1 = document.createElement('td'); td1.textContent = '#' + (i + 1);
      const td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = v.toFixed(3);
      tr.append(td1, td2);
      if (type !== 'imr') {
        const td3 = document.createElement('td'); td3.className = 'num';
        td3.textContent = (lastResult.plotRange?.[i] ?? 0).toFixed(3);
        tr.append(td3);
      }
      const tdS = document.createElement('td');
      tdS.className = isOOC ? 'status-ooc' : 'status-ok';
      tdS.textContent = isOOC ? 'OOC' : 'OK';
      tr.appendChild(tdS);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
  }

  /* ---------- core render ---------- */
  function renderControlChart(rawData, options) {
    options = options || ccGetOptions();
    if (typeof Chart === 'undefined') {
      showToast('error', 'Chart.js gagal dimuat. Periksa koneksi internet.');
      return;
    }
    if (!Array.isArray(rawData) || rawData.length < 8) {
      showToast('error', 'Minimal 8 data poin diperlukan untuk Control Chart');
      showEmptyState('controlchart');
      return;
    }

    // Parse values, skip invalid
    const values = [];
    const errors = [];
    rawData.forEach((d, i) => {
      const raw = d.value;
      let v = typeof raw === 'number' ? raw : nnum(raw);
      if (isNaN(v)) { errors.push('Baris ' + (i + 1)); return; }
      values.push(v);
    });
    if (errors.length > 0) {
      showToast('warning', errors.length + ' baris tanpa angka valid dilewati');
    }
    if (values.length < 8) {
      showToast('error', 'Butuh minimal 8 nilai numerik valid');
      showEmptyState('controlchart');
      return;
    }

    const sigma = Math.max(1, Math.min(4, options.sigmaMultiplier || 3));
    const type  = options.type === 'xbar' ? 'xbar' : 'imr';

    let stats, plotData, plotRange, ooc, oocR;

    if (type === 'imr') {
      const n = values.length;
      const xBar = values.reduce((s, v) => s + v, 0) / n;
      const MRs = values.slice(1).map((v, i) => Math.abs(v - values[i]));
      const MRBar = MRs.length ? MRs.reduce((s, v) => s + v, 0) / MRs.length : 0;
      const d2 = CC_CONSTANTS[2].d2;
      const sigmaEst = MRBar / d2;
      const UCL = xBar + sigma * sigmaEst;
      const LCL = Math.max(0, xBar - sigma * sigmaEst);
      const CL  = xBar;
      ooc = values.map((v, i) => ({ index: i, value: v, isOOC: v > UCL || v < LCL }));
      plotData = values;
      stats = {
        n, mean: xBar, stdDev: sigmaEst,
        UCL, LCL, CL,
        UCL_MR: CC_CONSTANTS[2].D4 * MRBar,
        LCL_MR: 0,
        CL_MR: MRBar,
        oocCount: ooc.filter(p => p.isOOC).length,
        MRs
      };
    } else {
      const n = Math.max(2, Math.min(10, options.subgroupSize || 2));
      const k = Math.floor(values.length / n);
      if (k < 3) {
        showToast('error', 'Butuh minimal ' + (3 * n) + ' data untuk X̄-R dengan n=' + n);
        return;
      }
      const C = CC_CONSTANTS[n];
      const subgroups = Array.from({ length: k }, (_, i) => values.slice(i * n, (i + 1) * n));
      const xBars = subgroups.map(sg => sg.reduce((s, v) => s + v, 0) / sg.length);
      const Rs    = subgroups.map(sg => Math.max(...sg) - Math.min(...sg));
      const xBarBar = xBars.reduce((s, v) => s + v, 0) / k;
      const RBar    = Rs.reduce((s, v) => s + v, 0) / k;
      const UCL_x = xBarBar + C.A2 * RBar;
      const LCL_x = Math.max(0, xBarBar - C.A2 * RBar);
      const UCL_r = C.D4 * RBar;
      const LCL_r = C.D3 * RBar;
      ooc  = xBars.map((v, i) => ({ index: i, value: v, isOOC: v > UCL_x || v < LCL_x }));
      oocR = Rs.map((v, i) => ({ index: i, value: v, isOOC: v > UCL_r || v < LCL_r }));
      plotData  = xBars;
      plotRange = Rs;
      stats = {
        n, k, mean: xBarBar, RBar,
        sigmaEst: RBar / C.d2,
        UCL_x, LCL_x, CL_x: xBarBar,
        UCL_r, LCL_r, CL_r: RBar,
        oocX: ooc.filter(p => p.isOOC).length,
        oocR: oocR.filter(p => p.isOOC).length
      };
    }

    lastResult = { values, stats, plotData, plotRange, ooc, oocR, type, options };

    // ──────────────────────────────────────────────────────────────────
    // STEP 2 — Destroy any prior chart. The secondary canvas is gone
    // now that the chart is dual-axis; we still null the legacy ref so
    // any external reader (export code, debug tools) sees a clean state.
    // ──────────────────────────────────────────────────────────────────
    if (window.ccChartInstance) { window.ccChartInstance.destroy(); window.ccChartInstance = null; }
    window.ccMRChartInstance = null;

    toggleEmpty('controlchart', false);

    // Hard-coded hex palette so PNG export resolves to the same colors
    // (CSS vars do not survive toBase64Image()).
    const COLOR_XI       = '#3B82F6';   // Xi / X̄ line
    const COLOR_OOC      = '#EF4444';   // out-of-control point fill
    const COLOR_UCL_MAIN = '#EF4444';   // dashed UCL / LCL on yLeft
    const COLOR_CL_MAIN  = '#10B981';   // solid CL on yLeft
    const COLOR_MR       = '#8B5CF6';   // MR / R line + UCL_MR on yRight
    const COLOR_MR_BAR   = '#A78BFA';   // CL (MR̄ / R̄) on yRight
    const COLOR_GRID     = 'rgba(148,163,184,0.12)';
    const COLOR_BG       = '#FAFAFA';

    // Plugin: paint a near-white chart background so the colored lines
    // read clearly inside the dark app shell, and PNG export carries it too.
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

    // Unify I-MR and X̄-R variable names. For I-MR the "secondary" is the
    // Moving Range chart; for X̄-R it is the R chart — both render on yRight.
    const isMR = type === 'imr';
    const ucl  = isMR ? stats.UCL    : stats.UCL_x;
    const cl   = isMR ? stats.CL     : stats.CL_x;
    const lcl  = isMR ? stats.LCL    : stats.LCL_x;
    const ucl2 = isMR ? stats.UCL_MR : stats.UCL_r;
    const cl2  = isMR ? stats.CL_MR  : stats.CL_r;
    const lcl2 = isMR ? 0            : stats.LCL_r;
    const secondaryRaw   = isMR ? stats.MRs : plotRange;
    const secondaryData  = isMR ? [null, ...stats.MRs] : plotRange;
    const secondaryLabel = isMR ? 'MR' : 'R';
    const secondaryTitle = isMR ? 'Moving Range' : 'Range';
    const mainLabel      = isMR ? 'Xi (individual)' : 'X̄ subgroup';
    const meanCaption    = isMR ? 'X̄' : 'X̄̄';
    const mrBarCaption   = isMR ? 'MR̄' : 'R̄';
    const n = plotData.length;

    // ──────────────────────────────────────────────────────────────────
    // STEP 3 — Y-range calculations
    // ──────────────────────────────────────────────────────────────────
    const poolLeft = [ucl, lcl, cl, ...plotData];
    const padLeft  = (Math.max(...poolLeft) - Math.min(...poolLeft)) * 0.15;
    const yLeftMin = parseFloat((Math.min(...poolLeft) - padLeft).toFixed(3));
    const yLeftMax = parseFloat((Math.max(...poolLeft) + padLeft).toFixed(3));

    const secondaryVals = secondaryRaw.filter(v => v !== null && v !== undefined);
    const poolRight = [ucl2, cl2, lcl2, ...secondaryVals];
    const padRight  = Math.max(...poolRight) * 0.20;
    const yRightMin = 0;
    const yRightMax = parseFloat((Math.max(...poolRight) + padRight).toFixed(3));

    // ──────────────────────────────────────────────────────────────────
    // STEP 4 — Point colors / radii. OOC = red, in-control = brand blue.
    // For the secondary line (MR / R) we colour OOC points red too.
    // ──────────────────────────────────────────────────────────────────
    const ptColors = plotData.map(v =>
      v > ucl || v < lcl ? COLOR_OOC : COLOR_XI);
    const ptRadius = plotData.map(v =>
      v > ucl || v < lcl ? 8 : 5);

    const mrColors = secondaryData.map(v =>
      v === null || v === undefined
        ? 'transparent'
        : (v > ucl2 || v < lcl2 ? COLOR_OOC : COLOR_MR));
    const mrRadius = secondaryData.map(v =>
      v === null || v === undefined ? 0 : 4);

    const labels = plotData.map((_, i) => '#' + (i + 1));

    // ──────────────────────────────────────────────────────────────────
    // STEP 4 — Seven datasets in ONE chart (yLeft = main, yRight = MR/R).
    // Horizontal control lines are drawn as flat datasets — no annotation
    // plugin dependency.
    // ──────────────────────────────────────────────────────────────────
    const datasets = [
      // yLeft — Individual / X̄
      {
        type: 'line',
        label: mainLabel,
        data: plotData,
        yAxisID: 'yLeft',
        borderColor: COLOR_XI,
        borderWidth: 2,
        pointBackgroundColor: ptColors,
        pointBorderColor: ptColors,
        pointRadius: ptRadius,
        pointHoverRadius: 9,
        pointStyle: 'circle',
        fill: false,
        tension: 0,
        order: 1
      },
      {
        type: 'line',
        label: 'UCL = ' + ucl.toFixed(3),
        data: Array(n).fill(ucl),
        yAxisID: 'yLeft',
        borderColor: COLOR_UCL_MAIN,
        borderWidth: 1.5,
        borderDash: [7, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 3
      },
      {
        type: 'line',
        label: 'CL  ' + meanCaption + ' = ' + cl.toFixed(3),
        data: Array(n).fill(cl),
        yAxisID: 'yLeft',
        borderColor: COLOR_CL_MAIN,
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 3
      },
      {
        type: 'line',
        label: 'LCL = ' + lcl.toFixed(3),
        data: Array(n).fill(lcl),
        yAxisID: 'yLeft',
        borderColor: COLOR_UCL_MAIN,
        borderWidth: 1.5,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 3
      },

      // yRight — Moving Range / Range
      {
        type: 'line',
        label: secondaryLabel,
        data: secondaryData,
        yAxisID: 'yRight',
        borderColor: COLOR_MR,
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointBackgroundColor: mrColors,
        pointBorderColor: mrColors,
        pointRadius: mrRadius,
        pointStyle: 'triangle',
        fill: false,
        tension: 0,
        spanGaps: false,
        order: 2
      },
      {
        type: 'line',
        label: 'UCL_' + secondaryLabel + ' = ' + ucl2.toFixed(3),
        data: Array(n).fill(ucl2),
        yAxisID: 'yRight',
        borderColor: COLOR_MR,
        borderWidth: 1,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 4
      },
      {
        type: 'line',
        label: mrBarCaption + ' = ' + cl2.toFixed(3),
        data: Array(n).fill(cl2),
        yAxisID: 'yRight',
        borderColor: COLOR_MR_BAR,
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 4
      }
    ];

    // For X̄-R, expose an LCL_R line too (relevant when subgroup size ≥ 7).
    if (!isMR && lcl2 > 0) {
      datasets.push({
        type: 'line',
        label: 'LCL_R = ' + lcl2.toFixed(3),
        data: Array(n).fill(lcl2),
        yAxisID: 'yRight',
        borderColor: COLOR_MR,
        borderWidth: 1,
        borderDash: [2, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 4
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 5 — Chart options (single chart, dual y-axis).
    // ──────────────────────────────────────────────────────────────────
    const chartOptions = {
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
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyleWidth: 16,
            color: '#444444',
            font: { size: 11, family: 'system-ui, sans-serif' },
            padding: 14
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#ffffff',
          borderColor: '#dddddd',
          borderWidth: 1,
          titleColor: '#222222',
          bodyColor:  '#555555',
          padding: 10,
          callbacks: {
            afterBody(items) {
              const v = plotData[items[0].dataIndex];
              if (v === undefined) return [];
              const isOOC = v > ucl || v < lcl;
              return isOOC ? ['⚠ OUT OF CONTROL'] : ['✓ In Control'];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(148,163,184,0.10)' },
          border: { color: '#dddddd' },
          ticks: { color: '#555555', font: { size: 11, family: 'system-ui, sans-serif' } },
          title: { display: true, text: 'Pengamatan ke-',
                   color: '#555555', font: { size: 12, family: 'system-ui, sans-serif' } }
        },
        yLeft: {
          type: 'linear',
          position: 'left',
          min: yLeftMin,
          max: yLeftMax,
          grid: { color: COLOR_GRID },
          border: { color: '#dddddd' },
          ticks: { color: '#555555',
                   font: { size: 11, family: 'monospace' } },
          title: { display: true,
                   text: options.unitLabel || (isMR ? 'Nilai (Xi)' : 'X̄'),
                   color: '#555555', font: { size: 12, family: 'system-ui, sans-serif' } }
        },
        yRight: {
          type: 'linear',
          position: 'right',
          min: yRightMin,
          max: yRightMax,
          // ↓ critical: prevents a second y-grid being drawn over the chart area
          grid: { drawOnChartArea: false },
          border: { color: '#dddddd' },
          ticks: { color: '#555555',
                   font: { size: 11, family: 'monospace' } },
          title: { display: true, text: secondaryTitle,
                   color: '#555555', font: { size: 12, family: 'system-ui, sans-serif' } }
        }
      }
    };

    const mainCanvas = document.getElementById('cc-chart-canvas');
    if (mainCanvas) {
      window.ccChartInstance = new Chart(mainCanvas.getContext('2d'), {
        plugins: [bgPlugin],
        data: { labels, datasets },
        options: chartOptions
      });
    }

    ccRenderStats(stats, options, type);
    ccRenderSummary(plotData, ooc, type);
  }
  window.renderControlChart = renderControlChart;

  /* ---------- import / paste ---------- */
  function ccParseValues(rawText) {
    // Accept 1-column or 2-column data; pick the rightmost numeric column.
    const text = (rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText)
                  .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) return [];
    // Determine delimiter from first line
    const first = lines[0];
    const delim = first.includes('\t') ? '\t'
                : first.includes(';')  ? ';'
                : first.includes(',')  ? ',' : null;

    const out = [];
    lines.forEach((line, lineIdx) => {
      const parts = delim ? line.split(delim) : [line];
      // pick last numeric token
      let v = NaN;
      for (let i = parts.length - 1; i >= 0; i--) {
        const t = parts[i].trim().replace(/^"|"$/g, '');
        const n = nnum(t);
        if (!isNaN(n)) { v = n; break; }
      }
      // skip header on line 0 if not numeric
      if (lineIdx === 0 && isNaN(v)) return;
      if (!isNaN(v)) out.push({ id: generateId(), value: v });
    });
    return out;
  }

  function ccImportCSV(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast('error', 'File terlalu besar (max 1MB)'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const rows = ccParseValues(String(e.target.result || ''));
      if (rows.length < 8) {
        showToast('error', 'CSV harus berisi minimal 8 nilai numerik');
        return;
      }
      AppState.controlChart.rows = rows;
      ccPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' nilai berhasil diimport');
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
      const rows = ccParseValues(text);
      if (rows.length < 8) {
        showToast('error', 'Clipboard harus berisi minimal 8 nilai numerik');
        return;
      }
      AppState.controlChart.rows = rows;
      ccPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' nilai dari clipboard');
      renderControlChart(rows, ccGetOptions());
    }).catch(() => showToast('warning', 'Akses clipboard ditolak'));
  }

  /* ---------- exports ---------- */
  function ccExportPNG() {
    if (!window.ccChartInstance) { showToast('error', 'Render chart dulu'); return; }
    triggerDownload(window.ccChartInstance.toBase64Image('image/png'), 'control-chart.png');
  }

  function ccExportCSV() {
    if (!lastResult) { showToast('error', 'Render chart dulu'); return; }
    const BOM = '﻿';
    let csv = '';
    if (lastResult.type === 'imr') {
      csv = BOM + 'No,Nilai,Status,MR\n';
      lastResult.values.forEach((v, i) => {
        const status = lastResult.ooc[i].isOOC ? 'OOC' : 'OK';
        const mr = i === 0 ? '' : lastResult.stats.MRs[i - 1].toFixed(4);
        csv += (i + 1) + ',' + v + ',' + status + ',' + mr + '\n';
      });
    } else {
      csv = BOM + 'Subgroup,X-bar,R,Status X,Status R\n';
      lastResult.plotData.forEach((v, i) => {
        const sx = lastResult.ooc[i].isOOC ? 'OOC' : 'OK';
        const sr = lastResult.oocR[i].isOOC ? 'OOC' : 'OK';
        csv += (i + 1) + ',' + v.toFixed(4) + ',' + lastResult.plotRange[i].toFixed(4) + ',' + sx + ',' + sr + '\n';
      });
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'control-chart-data.csv');
  }

  /* ---------- reset ---------- */
  function ccReset() {
    showModal('Hapus semua data Control Chart?', () => {
      if (window.ccChartInstance) { window.ccChartInstance.destroy(); window.ccChartInstance = null; }
      window.ccMRChartInstance = null;
      AppState.controlChart.title = '';
      AppState.controlChart.type = 'imr';
      AppState.controlChart.sigma = 3;
      AppState.controlChart.subgroupSize = 2;
      AppState.controlChart.unit = '';
      AppState.controlChart.rows = [];
      saveState();
      ccSyncUI();
      showEmptyState('controlchart');
      showToast('success', 'Control Chart direset');
    });
  }

  /* ---------- init ---------- */
  function initControlChart() {
    // Attach button listeners
    document.getElementById('btn-cc-add-row')?.addEventListener('click', () => ccAddRow(true));
    document.getElementById('btn-cc-render')?.addEventListener('click', () => {
      ccSyncStateFromUI();
      saveState();
      renderControlChart(AppState.controlChart.rows.slice(), ccGetOptions());
    });
    document.getElementById('btn-cc-import-csv')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) ccImportCSV(f);
      e.target.value = '';
    });
    document.getElementById('btn-cc-paste')?.addEventListener('click', ccPasteClipboard);
    document.getElementById('btn-cc-export-png')?.addEventListener('click', ccExportPNG);
    document.getElementById('btn-cc-export-csv')?.addEventListener('click', ccExportCSV);
    document.getElementById('btn-cc-reset')?.addEventListener('click', ccReset);

    const typeSel = document.getElementById('cc-type');
    typeSel?.addEventListener('change', () => {
      const sgEl = document.getElementById('cc-subgroup-size');
      if (sgEl) sgEl.disabled = (typeSel.value !== 'xbar');
      ccSyncStateFromUI();
      saveState();
    });
    ['cc-title','cc-sigma','cc-subgroup-size','cc-unit'].forEach(id => {
      document.getElementById(id)?.addEventListener('blur', () => { ccSyncStateFromUI(); saveState(); });
    });

    // Initial UI sync from state (also seeds empty rows if needed)
    ccSyncUI();
  }
  window.initControlChart = initControlChart;

})();
