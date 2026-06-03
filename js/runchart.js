/* ============================================================
   runchart.js — Run Chart engine (median + run signal detection)
   Implements §3H. Depends app.js utils + Chart.js CDN.
   ============================================================ */
(function () {

  let lastResult = null;

  function nnum(s) {
    if (typeof window.normalizeNumber === 'function') return window.normalizeNumber(String(s));
    const v = parseFloat(String(s).replace(',', '.'));
    return isNaN(v) ? NaN : v;
  }

  function rcGetOptions() {
    if (typeof window.getRunChartOptions === 'function') return window.getRunChartOptions();
    const titleEl = document.getElementById('rc-title');
    const xLblEl  = document.getElementById('rc-xlabel');
    const yLblEl  = document.getElementById('rc-ylabel');
    const medEl   = document.getElementById('rc-show-median');
    const annoEl  = document.getElementById('rc-show-annotations');
    const trEl    = document.getElementById('rc-detect-trend');
    return {
      title:           sanitizeText(titleEl?.value || '') || 'Run Chart',
      xLabel:          sanitizeText(xLblEl?.value || '') || 'Urutan',
      yLabel:          sanitizeText(yLblEl?.value || '') || 'Nilai',
      showMedian:      medEl  ? !!medEl.checked  : true,
      showAnnotations: annoEl ? !!annoEl.checked : true,
      detectTrend:     trEl   ? !!trEl.checked   : true
    };
  }

  function rcSyncStateFromUI() {
    const o = rcGetOptions();
    AppState.runChart.title           = o.title === 'Run Chart' ? '' : o.title;
    AppState.runChart.xLabel          = o.xLabel;
    AppState.runChart.yLabel          = o.yLabel;
    AppState.runChart.showMedian      = o.showMedian;
    AppState.runChart.showAnnotations = o.showAnnotations;
    AppState.runChart.detectTrend     = o.detectTrend;
  }

  /* ---------- input table ---------- */
  function rcAddRowToDOM(id, label, value) {
    const tbody = document.getElementById('rc-rows-container');
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
    lblIn.addEventListener('blur', () => rcOnLabelBlur(id, lblIn));
    tdLbl.appendChild(lblIn);

    const tdVal = document.createElement('td');
    const valIn = document.createElement('input');
    valIn.type = 'text';
    valIn.className = 'num';
    valIn.value = (value === '' || value === null || value === undefined ||
                   (typeof value === 'number' && isNaN(value))) ? '' : String(value);
    valIn.placeholder = '0';
    valIn.addEventListener('blur', () => rcOnValueBlur(id, valIn));
    valIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); rcOnValueBlur(id, valIn); rcAddRow(true); }
    });
    tdVal.appendChild(valIn);

    const tdBtn = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn-remove-row';
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = 'Hapus baris';
    btn.addEventListener('click', () => rcRemoveRow(id));
    tdBtn.appendChild(btn);

    tr.append(tdIdx, tdLbl, tdVal, tdBtn);
    tbody.appendChild(tr);
    rcRefreshIndices();
  }

  function rcRefreshIndices() {
    const tbody = document.getElementById('rc-rows-container');
    if (!tbody) return;
    [...tbody.children].forEach((tr, i) => {
      const idxTd = tr.querySelector('td.idx');
      if (idxTd) idxTd.textContent = String(i + 1);
    });
  }

  function rcOnLabelBlur(id, inp) {
    const row = AppState.runChart.rows.find(r => r.id === id);
    if (!row) return;
    row.label = sanitizeText(inp.value).slice(0, 30);
    saveState();
  }

  function rcOnValueBlur(id, inp) {
    const row = AppState.runChart.rows.find(r => r.id === id);
    if (!row) return;
    const raw = inp.value.trim();
    inp.classList.remove('invalid');
    if (raw === '') { row.value = NaN; saveState(); return; }
    const v = nnum(raw);
    if (isNaN(v)) { inp.classList.add('invalid'); row.value = NaN; }
    else { row.value = v; }
    saveState();
  }

  function rcAddRow(focusNew) {
    if (AppState.runChart.rows.length >= 500) {
      showToast('warning', 'Maksimum 500 baris');
      return;
    }
    const id = generateId();
    AppState.runChart.rows.push({ id, label: '', value: NaN });
    rcAddRowToDOM(id, '', '');
    saveState();
    if (focusNew) {
      const tbody = document.getElementById('rc-rows-container');
      tbody.lastElementChild?.querySelector('td:nth-child(3) input')?.focus();
    }
  }

  function rcRemoveRow(id) {
    AppState.runChart.rows = AppState.runChart.rows.filter(r => r.id !== id);
    document.getElementById('rc-rows-container')?.querySelector(`tr[data-id="${id}"]`)?.remove();
    rcRefreshIndices();
    saveState();
  }

  function rcPopulateTable(rows) {
    const tbody = document.getElementById('rc-rows-container');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (rows.length === 0) {
      for (let i = 0; i < 10; i++) {
        const id = generateId();
        AppState.runChart.rows.push({ id, label: '', value: NaN });
        rcAddRowToDOM(id, '', '');
      }
    } else {
      rows.forEach(r => rcAddRowToDOM(
        r.id,
        r.label || '',
        (typeof r.value === 'number' && !isNaN(r.value)) ? r.value : ''
      ));
    }
  }

  function rcSyncUI() {
    const s = AppState.runChart;
    const titleEl = document.getElementById('rc-title');
    const xLblEl  = document.getElementById('rc-xlabel');
    const yLblEl  = document.getElementById('rc-ylabel');
    const medEl   = document.getElementById('rc-show-median');
    const annoEl  = document.getElementById('rc-show-annotations');
    const trEl    = document.getElementById('rc-detect-trend');
    if (titleEl) titleEl.value = s.title || '';
    if (xLblEl)  xLblEl.value  = (s.xLabel && s.xLabel !== 'Urutan') ? s.xLabel : '';
    if (yLblEl)  yLblEl.value  = (s.yLabel && s.yLabel !== 'Nilai')  ? s.yLabel : '';
    if (medEl)   medEl.checked  = !!s.showMedian;
    if (annoEl)  annoEl.checked = !!s.showAnnotations;
    if (trEl)    trEl.checked   = !!s.detectTrend;
    rcPopulateTable(s.rows.slice());
  }
  window.rcSyncUI = rcSyncUI;

  /* ---------- stats panel ---------- */
  function rcRenderStats(stats) {
    const el = document.getElementById('rc-stats');
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

    const isStable = stats.nonAstroSignals === 0;
    const statusTxt = isStable ? '✓ TIDAK ADA SIGNAL' : '⚠ SIGNAL TERDETEKSI';
    const statusCls = isStable ? 'vital' : 'trivial';

    el.appendChild(mkCard('n (Data Poin)', String(stats.n)));

    // FIX 5 — Median card with spec'd DOM ids
    const medianCard = mkCard('Median', stats.median.toFixed(3));
    medianCard.id = 'run-stat-median';
    medianCard.querySelector('.stat-value').id = 'run-stat-median-val';
    el.appendChild(medianCard);

    el.appendChild(mkCard('Status', statusTxt, null, statusCls));

    // FIX 6 — Jumlah Run card with spec'd DOM ids
    const runsCard = mkCard('Jumlah Run', String(stats.runCount),
      'Expected: ' + stats.expectedRuns.toFixed(1) +
      (stats.sdRuns > 0 ? ' (±' + stats.sdRuns.toFixed(1) + ')' : ''));
    runsCard.id = 'run-stat-runs';
    runsCard.querySelector('.stat-value').id = 'run-stat-runs-val';
    el.appendChild(runsCard);
    el.appendChild(mkCard('Run Terpanjang', String(stats.maxRunLen),
      stats.maxRunLen >= 8 ? '⚠ Melebihi batas (8)' : 'Dalam batas',
      stats.maxRunLen >= 8 ? 'trivial' : null));
    if (stats.astroCount > 0) {
      el.appendChild(mkCard('Astronomical Points',
        stats.astroCount + ' titik',
        'Nilai > Median ± 3×IQR', 'trivial'));
    }
  }

  function rcRenderSummary(signals) {
    const tbl = document.getElementById('rc-summary-table');
    if (!tbl) return;
    tbl.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Tipe Signal', 'Deskripsi', 'Titik Awal', 'Titik Akhir', 'Status'].forEach(c => {
      const th = document.createElement('th'); th.textContent = c; trh.appendChild(th);
    });
    thead.appendChild(trh);
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');

    if (signals.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.style.textAlign = 'center';
      td.textContent = 'Tidak ada signal non-random terdeteksi — proses tampak stabil';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      signals.forEach(sig => {
        const tr = document.createElement('tr');
        tr.className = 'vital-row';
        const cells = [
          [sig.type.charAt(0).toUpperCase() + sig.type.slice(1), ''],
          [sig.message, ''],
          [sig.startIdx !== null && sig.startIdx !== undefined ? '#' + (sig.startIdx + 1) : '—', 'num'],
          [sig.endIdx   !== null && sig.endIdx   !== undefined ? '#' + (sig.endIdx + 1)   : '—', 'num'],
          ['⚠ Signal', 'status vital']
        ];
        cells.forEach(([v, c]) => {
          const td = document.createElement('td');
          if (c) td.className = c;
          td.textContent = String(v);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    tbl.appendChild(tbody);
  }

  /* ---------- core render ---------- */
  function renderRunChart(rawData, options) {
    options = options || rcGetOptions();
    if (typeof Chart === 'undefined') {
      showToast('error', 'Chart.js gagal dimuat. Periksa koneksi internet.');
      return;
    }

    // FASE 1 — sanitize & validate
    const points = [];
    const errors = [];
    rawData.forEach((d, i) => {
      const v = typeof d.value === 'number' ? d.value : nnum(d.value);
      if (isNaN(v)) { errors.push('Baris ' + (i + 1)); return; }
      points.push({
        index: points.length,
        label: sanitizeText(d.label || String(i + 1)),
        value: v
      });
    });
    if (errors.length > 0) showToast('warning', errors.length + ' baris dilewati');
    if (points.length < 10) {
      showToast('error', 'Minimal 10 data poin untuk Run Chart');
      showEmptyState('runchart');
      return;
    }
    const values = points.map(p => p.value);
    if (Math.max(...values) === Math.min(...values)) {
      showToast('error', 'Semua nilai identik — Run Chart tidak dapat dianalisis');
      showEmptyState('runchart');
      return;
    }

    // FASE 2 — median
    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;
    const median = n % 2 === 1
      ? sorted[Math.floor(n / 2)]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

    // FASE 3 — classify each point
    const classified = points.map(p => ({
      ...p,
      side: p.value > median ? 'above'
          : p.value < median ? 'below' : 'on'
    }));

    // FASE 4 — run analysis (drop 'on' points from runs but DO NOT break runs)
    const meaningful = classified.filter(p => p.side !== 'on');
    const na = meaningful.filter(p => p.side === 'above').length;
    const nb = meaningful.filter(p => p.side === 'below').length;

    let runCount = 0;
    let prevSide = null;
    let currentRunLen = 0;
    let maxRunLen = 0;
    const runDetails = [];
    let runStart = 0;
    meaningful.forEach((p, i) => {
      if (p.side !== prevSide) {
        if (prevSide !== null) {
          runDetails.push({ start: runStart, end: i - 1, side: prevSide, length: currentRunLen });
          if (currentRunLen > maxRunLen) maxRunLen = currentRunLen;
        }
        runCount++;
        runStart = i;
        currentRunLen = 1;
        prevSide = p.side;
      } else {
        currentRunLen++;
      }
    });
    if (meaningful.length > 0) {
      runDetails.push({ start: runStart, end: meaningful.length - 1, side: prevSide, length: currentRunLen });
      if (currentRunLen > maxRunLen) maxRunLen = currentRunLen;
    }

    const nr = na + nb;
    const expectedRuns = nr > 0 ? (2 * na * nb / nr) + 1 : 0;
    let varRuns = 0, sdRuns = 0;
    if (nr > 1) {
      varRuns = (2 * na * nb * (2 * na * nb - na - nb)) / (nr * nr * (nr - 1));
      sdRuns = Math.sqrt(Math.max(0, varRuns));
    }

    // FASE 5 — signal detection
    const signals = [];

    // Signal 1 — Run Shift (≥ 8)
    runDetails.forEach(run => {
      if (run.length >= 8) {
        signals.push({
          type: 'shift',
          message: 'Run Shift: ' + run.length + ' titik berturutan di ' +
                   (run.side === 'above' ? 'atas' : 'bawah') + ' median',
          startIdx: meaningful[run.start].index,
          endIdx:   meaningful[run.end].index
        });
      }
    });

    // Signal 2 — Trend (≥ 6 consecutive up or down)
    if (options.detectTrend) {
      let trendLen = 1;
      let trendDir = null;
      let trendStart = 0;
      for (let i = 1; i < values.length; i++) {
        const dir = values[i] > values[i - 1] ? 'up'
                  : values[i] < values[i - 1] ? 'down' : 'flat';
        if (dir === 'flat') { trendLen = 1; trendDir = null; trendStart = i; continue; }
        if (dir === trendDir) {
          trendLen++;
          if (trendLen >= 6) {
            signals.push({
              type: 'trend',
              message: 'Trend ' + (trendDir === 'up' ? 'Naik' : 'Turun') +
                       ': ' + trendLen + ' titik berturutan (mulai #' + (trendStart + 1) + ')',
              startIdx: trendStart,
              endIdx:   i
            });
            // reset after detection to avoid duplicates
            trendLen = 1; trendDir = null; trendStart = i;
          }
        } else {
          trendLen = 2; trendDir = dir; trendStart = i - 1;
        }
      }
    }

    // Signal 3 — Astronomical points (> 3 IQR from median)
    const Q1 = sorted[Math.floor(n * 0.25)];
    const Q3 = sorted[Math.floor(n * 0.75)];
    const IQR = Q3 - Q1;
    const astroHigh = median + 3 * IQR;
    const astroLow  = median - 3 * IQR;
    const astronomicalPoints = points.filter(p => p.value > astroHigh || p.value < astroLow);
    if (astronomicalPoints.length > 0) {
      signals.push({
        type: 'astronomical',
        message: astronomicalPoints.length + ' Astronomical Point(s) terdeteksi',
        startIdx: null,
        endIdx: null
      });
    }

    // Toast once per signal type
    const seen = new Set();
    signals.forEach(sig => {
      if (!seen.has(sig.type)) {
        seen.add(sig.type);
        showToast('warning', '⚠ ' + sig.message);
      }
    });

    // FASE 6 — destroy old
    if (window.runChartInstance) {
      window.runChartInstance.destroy();
      window.runChartInstance = null;
    }
    if (typeof annotationPlugin !== 'undefined' && !Chart.registry.plugins.get('annotation')) {
      Chart.register(annotationPlugin);
    }
    const annoOk = (typeof annotationPlugin !== 'undefined');

    // FASE 7 — point colors (FIX 6: blue above / purple below / green on median;
    // astronomical points override to red)
    const astroSet = new Set(astronomicalPoints.map(p => p.index));
    const ptColors = classified.map(p => {
      if (astroSet.has(p.index)) return '#EF4444';
      if (p.side === 'above')    return '#3B82F6';    // blue = above median
      if (p.side === 'below')    return '#8B5CF6';    // purple = below median
      return '#10B981';                                // green = on median
    });
    const ptRadius = classified.map(p => {
      if (astroSet.has(p.index)) return 9;
      if (p.side === 'on')       return 7;
      return 5;
    });

    // FASE 8 — datasets + annotations
    const labels = classified.map(p => p.label);
    const datasets = [
      // 1. Data line (order: 1 — drawn over the median guideline)
      {
        type: 'line',
        label: sanitizeText(options.yLabel || 'Nilai'),
        data: classified.map(p => p.value),
        borderColor: '#3B82F6',
        borderWidth: 2,
        pointBackgroundColor: ptColors,
        pointBorderColor: ptColors,
        pointRadius: ptRadius,
        pointHoverRadius: 10,
        tension: 0,
        fill: false,
        order: 1
      },
      // 2. Median guideline (FIX 1+2 — ALWAYS on, no checkbox)
      {
        type: 'line',
        label: 'Median = ' + median.toFixed(3),
        data: Array(n).fill(median),
        borderColor: '#F59E0B',
        borderWidth: 2,
        borderDash: [8, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
        order: 3
      }
    ];

    const annotations = {};
    // FIX 3 — Right-edge median label (always shown)
    if (annoOk && labels.length > 0) {
      annotations.medianLabel = {
        type: 'label',
        xValue: labels[labels.length - 1],
        yValue: median,
        content: 'Median = ' + median.toFixed(3),
        color: '#F59E0B',
        backgroundColor: 'rgba(0,0,0,0)',
        font: { size: 10, weight: 'bold' },
        textAlign: 'left',
        xAdjust: 8,
        yAdjust: -10,
        position: { x: 'end', y: 'center' }
      };
    }
    if (annoOk && options.showAnnotations) {
      signals.filter(s => s.type === 'shift').forEach((sig, i) => {
        annotations['shift_' + i] = {
          type: 'box',
          xMin: sig.startIdx - 0.5,
          xMax: sig.endIdx + 0.5,
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          borderColor: 'rgba(239, 68, 68, 0.4)',
          borderWidth: 1
        };
      });
      signals.filter(s => s.type === 'trend').forEach((sig, i) => {
        annotations['trend_' + i] = {
          type: 'box',
          xMin: sig.startIdx - 0.5,
          xMax: sig.endIdx + 0.5,
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          borderColor: 'rgba(245, 158, 11, 0.4)',
          borderWidth: 1
        };
      });
    }

    toggleRunEmpty(false);
    const canvas = document.getElementById('rc-canvas');
    if (!canvas) return;

    // FIX 4 — y-range pinned so the median guideline never gets clipped
    // even if it sits at the extreme of the data range.
    const yPool = [median, ...values];
    const yPad  = (Math.max(...yPool) - Math.min(...yPool)) * 0.15;
    const yMin  = parseFloat((Math.min(...yPool) - yPad).toFixed(3));
    const yMax  = parseFloat((Math.max(...yPool) + yPad).toFixed(3));

    window.runChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8, right: 90, bottom: 12, left: 8 } },
        scales: {
          x: {
            grid: { color: getCSSVar('--border-base') },
            ticks: {
              color: getCSSVar('--text-secondary'),
              font: { family: getCSSVar('--font-body'), size: 11 },
              maxTicksLimit: 20, maxRotation: 45,
              callback: (v, i) => {
                const l = classified[i]?.label || '';
                return l.length > 12 ? l.slice(0, 10) + '…' : l;
              }
            },
            title: { display: true, text: sanitizeText(options.xLabel || 'Urutan'),
                     color: getCSSVar('--text-secondary'), font: { size: 12 } }
          },
          y: {
            min: yMin,
            max: yMax,
            grid: { color: getCSSVar('--border-base') },
            ticks: { color: getCSSVar('--text-secondary'),
                     font: { family: getCSSVar('--font-mono'), size: 11 } },
            title: { display: true, text: sanitizeText(options.yLabel || 'Nilai'),
                     color: getCSSVar('--text-secondary'), font: { size: 12 } }
          }
        },
        plugins: {
          legend: {
            labels: { color: getCSSVar('--text-secondary'),
                      font: { family: getCSSVar('--font-body'), size: 12 } }
          },
          tooltip: {
            backgroundColor: getCSSVar('--bg-secondary'),
            borderColor: getCSSVar('--border-base'),
            borderWidth: 1,
            titleColor: getCSSVar('--text-primary'),
            bodyColor:  getCSSVar('--text-secondary'),
            callbacks: {
              afterLabel: (item) => {
                const p = classified[item.dataIndex];
                if (!p) return '';
                const lines = [' Sisi Median: ' +
                  (p.side === 'above' ? 'Atas ▲'
                   : p.side === 'below' ? 'Bawah ▼' : 'Tepat di Median')];
                if (astroSet.has(p.index)) lines.push(' ⚠ ASTRONOMICAL POINT');
                return lines;
              }
            }
          },
          annotation: annoOk ? { clip: false, annotations } : {}
        }
      }
    });

    const nonAstroSignals = signals.filter(s => s.type !== 'astronomical').length;
    const stats = {
      n, median, runCount, expectedRuns, sdRuns, maxRunLen,
      astroCount: astronomicalPoints.length,
      nonAstroSignals
    };
    lastResult = { classified, signals, stats, astronomicalPoints, options };
    rcRenderStats(stats);
    rcRenderSummary(signals);
  }
  window.renderRunChart = renderRunChart;

  function toggleRunEmpty(showEmpty) {
    const area  = document.getElementById('rc-chart-area');
    const empty = document.getElementById('empty-state-runchart');
    if (area)  area.classList.toggle('hidden', !!showEmpty);
    if (empty) empty.classList.toggle('hidden', !showEmpty);
  }
  window.toggleRunEmpty = toggleRunEmpty;

  /* ---------- import / paste ----------
     Accepts 1-column (value) or 2-column (label, value). */
  function rcParseValues(rawText) {
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

    // Header detection: line 0 last cell non-numeric AND line 1 last cell numeric
    let startAt = 0;
    if (lines.length >= 2) {
      const a = splitClean(lines[0]);
      const b = splitClean(lines[1]);
      if (isNaN(nnum(a[a.length - 1])) && !isNaN(nnum(b[b.length - 1]))) startAt = 1;
    }

    const out = [];
    for (let i = startAt; i < lines.length; i++) {
      const cols = splitClean(lines[i]);
      if (cols.length === 0) continue;
      let label, valRaw;
      if (cols.length === 1) {
        label = String(out.length + 1);
        valRaw = cols[0];
      } else {
        label = cols[0];
        valRaw = cols[cols.length - 1];
      }
      const v = nnum(valRaw);
      if (isNaN(v)) continue;
      out.push({
        id: generateId(),
        label: sanitizeText(label).slice(0, 30),
        value: v
      });
    }
    return out;
  }

  function rcImportCSV(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast('error', 'File terlalu besar (max 1MB)'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const rows = rcParseValues(String(e.target.result || ''));
      if (rows.length < 10) {
        showToast('error', 'CSV harus berisi minimal 10 nilai numerik');
        return;
      }
      AppState.runChart.rows = rows;
      rcPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' nilai berhasil diimport');
      renderRunChart(rows, rcGetOptions());
    };
    reader.onerror = () => showToast('error', 'Gagal membaca file');
    reader.readAsText(file);
  }

  function rcPasteClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      showToast('warning', 'Clipboard API tidak didukung — gunakan Import CSV');
      return;
    }
    navigator.clipboard.readText().then(text => {
      const rows = rcParseValues(text);
      if (rows.length < 10) {
        showToast('error', 'Clipboard harus berisi minimal 10 nilai numerik');
        return;
      }
      AppState.runChart.rows = rows;
      rcPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' nilai dari clipboard');
      renderRunChart(rows, rcGetOptions());
    }).catch(() => showToast('warning', 'Akses clipboard ditolak'));
  }

  /* ---------- exports ---------- */
  function rcExportPNG() {
    if (!window.runChartInstance) { showToast('error', 'Render chart dulu'); return; }
    triggerDownload(window.runChartInstance.toBase64Image('image/png'), 'run-chart.png');
  }

  function rcExportCSV() {
    if (!lastResult) { showToast('error', 'Render chart dulu'); return; }
    const BOM = '﻿';
    const { classified, signals, stats, astronomicalPoints } = lastResult;
    const astroSet = new Set(astronomicalPoints.map(p => p.index));
    let csv = BOM + 'Label,Nilai,Posisi_Median,Astronomical\n';
    classified.forEach(p => {
      const astro = astroSet.has(p.index) ? 'YA' : 'TIDAK';
      const side = p.side === 'above' ? 'Atas'
                 : p.side === 'below' ? 'Bawah' : 'Tepat di Median';
      const lbl = /[,"\n]/.test(p.label)
        ? '"' + p.label.replace(/"/g, '""') + '"' : p.label;
      csv += lbl + ',' + p.value + ',' + side + ',' + astro + '\n';
    });
    csv += '\n# Sinyal Terdeteksi\n';
    if (signals.length === 0) csv += 'Tidak ada signal\n';
    else signals.forEach(s => { csv += s.type + ': ' + s.message + '\n'; });
    csv += '\n# Statistik\n';
    csv += 'Median,' + stats.median + '\n';
    csv += 'n,' + stats.n + '\n';
    csv += 'Run Aktual,' + stats.runCount + '\n';
    csv += 'Run Expected,' + stats.expectedRuns.toFixed(2) + '\n';
    csv += 'Run Terpanjang,' + stats.maxRunLen + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'run-chart-data.csv');
  }

  /* ---------- reset ---------- */
  function rcReset() {
    showModal('Hapus semua data Run Chart?', () => {
      if (window.runChartInstance) { window.runChartInstance.destroy(); window.runChartInstance = null; }
      AppState.runChart.title           = '';
      AppState.runChart.xLabel          = 'Urutan';
      AppState.runChart.yLabel          = 'Nilai';
      AppState.runChart.showMedian      = true;
      AppState.runChart.showAnnotations = true;
      AppState.runChart.detectTrend     = true;
      AppState.runChart.rows            = [];
      saveState();
      rcSyncUI();
      showEmptyState('runchart');
      showToast('success', 'Run Chart direset');
    });
  }

  /* ---------- init ---------- */
  function initRunChart() {
    document.getElementById('btn-rc-add-row')?.addEventListener('click', () => rcAddRow(true));
    document.getElementById('btn-rc-render')?.addEventListener('click', () => {
      rcSyncStateFromUI();
      saveState();
      renderRunChart(AppState.runChart.rows.slice(), rcGetOptions());
    });
    document.getElementById('btn-rc-import-csv')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) rcImportCSV(f);
      e.target.value = '';
    });
    document.getElementById('btn-rc-paste')?.addEventListener('click', rcPasteClipboard);
    document.getElementById('btn-rc-export-png')?.addEventListener('click', rcExportPNG);
    document.getElementById('btn-rc-export-csv')?.addEventListener('click', rcExportCSV);
    document.getElementById('btn-rc-reset')?.addEventListener('click', rcReset);

    ['rc-title', 'rc-xlabel', 'rc-ylabel'].forEach(id => {
      document.getElementById(id)?.addEventListener('blur', () => { rcSyncStateFromUI(); saveState(); });
    });
    ['rc-show-median', 'rc-show-annotations', 'rc-detect-trend'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => { rcSyncStateFromUI(); saveState(); });
    });

    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter' && AppState.activeTab === 'runchart') {
        e.preventDefault();
        rcSyncStateFromUI();
        renderRunChart(AppState.runChart.rows.slice(), rcGetOptions());
      }
    });

    rcSyncUI();
  }
  window.initRunChart = initRunChart;

})();
