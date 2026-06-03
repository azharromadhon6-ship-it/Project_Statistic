/* ============================================================
   histogram.js — Categorical bar chart engine with multi-type freq
   Each row in the input table is one Nilai (string OR number).
   Each Nilai has N frequency values, one per user-defined "type"
   (e.g. Cacat Ringan / Sedang / Parah). The chart renders as a
   grouped bar chart: one bar per (Nilai × Type) combination.
   ============================================================ */
(function () {

  let lastResult = null;

  // Colors used for the freq-type datasets in order. Resolved at render
  // time so they pick up theme variables but fall back to hardcoded hex
  // when CSS variables are unset (needed for PNG export).
  const TYPE_COLORS = [
    () => getCSSVar('--chart-bar-vital') || '#2563EB',
    () => getCSSVar('--accent-amber')    || '#F59E0B',
    () => getCSSVar('--accent-red')      || '#EF4444',
    () => getCSSVar('--accent-green')    || '#10B981',
    () => getCSSVar('--accent-purple')   || '#8B5CF6',
    () => '#0EA5E9',
    () => '#A855F7',
    () => '#14B8A6'
  ];
  const typeColor = (idx) => TYPE_COLORS[idx % TYPE_COLORS.length]();

  function nnum(s) {
    if (typeof window.normalizeNumber === 'function') return window.normalizeNumber(String(s));
    const v = parseFloat(String(s).replace(',', '.'));
    return isNaN(v) ? NaN : v;
  }

  function histGetOptions() {
    const titleEl  = document.getElementById('hist-title');
    const methodEl = document.getElementById('hist-bin-method');
    const unitEl   = document.getElementById('hist-unit');
    const curveEl  = document.getElementById('hist-normal-curve');
    const labelYEl = document.getElementById('hist-label-y');
    const method   = ['sturges','fd'].includes(methodEl?.value) ? methodEl.value : 'sturges';
    return {
      title:     sanitizeText(titleEl?.value || '') || 'Histogram',
      binMethod: method,
      showNormalCurve: !!curveEl?.checked,
      unitLabel: sanitizeText(unitEl?.value || '') || 'Nilai',
      labelY:    sanitizeText(labelYEl?.value || '').trim() || 'Frekuensi'
    };
  }
  window.getHistogramOptions = histGetOptions;

  function histSyncStateFromUI() {
    const o = histGetOptions();
    AppState.histogram.title      = o.title === 'Histogram' ? '' : o.title;
    AppState.histogram.binMethod  = o.binMethod;
    AppState.histogram.showNormal = o.showNormalCurve;
    AppState.histogram.unit       = document.getElementById('hist-unit')?.value || '';
    AppState.histogram.labelY     = (o.labelY === 'Frekuensi') ? '' : o.labelY;
  }

  /* ════════════════════════════════════════════════════════════
     Freq-type manager — the chips above the data table
     ════════════════════════════════════════════════════════════ */
  function histEnsureDefaultType() {
    if (!Array.isArray(AppState.histogram.freqTypes)) AppState.histogram.freqTypes = [];
    if (AppState.histogram.freqTypes.length === 0) {
      AppState.histogram.freqTypes.push({ id: generateId(), label: 'Frek' });
    }
  }

  function histRenderTypes() {
    const cont = document.getElementById('hist-types-container');
    if (!cont) return;
    histEnsureDefaultType();
    cont.innerHTML = '';
    AppState.histogram.freqTypes.forEach((t, idx) => {
      const chip = document.createElement('div');
      chip.className = 'hist-type-chip';
      chip.dataset.id = t.id;

      const swatch = document.createElement('span');
      swatch.className = 'chip-swatch';
      swatch.style.background = typeColor(idx);
      chip.appendChild(swatch);

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = t.label;
      inp.maxLength = 30;
      inp.placeholder = 'Tipe…';
      inp.addEventListener('blur', () => {
        const newLabel = sanitizeText(inp.value).slice(0, 30) || ('Tipe ' + (idx + 1));
        t.label = newLabel;
        inp.value = newLabel;
        saveState();
        histRebuildTableHeader();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      chip.appendChild(inp);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'chip-remove';
      del.textContent = '×';
      del.title = 'Hapus tipe';
      del.disabled = AppState.histogram.freqTypes.length <= 1;
      del.addEventListener('click', () => histRemoveType(t.id));
      chip.appendChild(del);

      cont.appendChild(chip);
    });
  }

  function histAddType() {
    if (AppState.histogram.freqTypes.length >= 8) {
      showToast('warning', 'Maksimum 8 tipe frekuensi');
      return;
    }
    const idx = AppState.histogram.freqTypes.length + 1;
    const newType = { id: generateId(), label: 'Tipe ' + idx };
    AppState.histogram.freqTypes.push(newType);
    // Every existing row gets a fresh freq cell defaulting to 0.
    AppState.histogram.rows.forEach(r => {
      if (!r.freqs || typeof r.freqs !== 'object') r.freqs = {};
      if (!(newType.id in r.freqs)) r.freqs[newType.id] = 0;
    });
    saveState();
    histRenderTypes();
    histRebuildTableHeader();
    histRepopulateRows();
  }

  function histRemoveType(typeId) {
    if (AppState.histogram.freqTypes.length <= 1) return;
    AppState.histogram.freqTypes = AppState.histogram.freqTypes.filter(t => t.id !== typeId);
    AppState.histogram.rows.forEach(r => {
      if (r.freqs && typeId in r.freqs) delete r.freqs[typeId];
    });
    saveState();
    histRenderTypes();
    histRebuildTableHeader();
    histRepopulateRows();
  }

  /* ════════════════════════════════════════════════════════════
     Input table
     ════════════════════════════════════════════════════════════ */
  function histRebuildTableHeader() {
    const theadRow = document.getElementById('hist-thead-row');
    if (!theadRow) return;
    // Keep first two (#, Nilai) and last (remove-button) columns; rebuild middle.
    theadRow.innerHTML = '';
    const thIdx = document.createElement('th'); thIdx.textContent = '#';
    const thVal = document.createElement('th'); thVal.textContent = 'Nilai';
    theadRow.append(thIdx, thVal);
    AppState.histogram.freqTypes.forEach((t, idx) => {
      const th = document.createElement('th');
      th.className = 'freq-col';
      th.title = 'Frekuensi untuk tipe "' + t.label + '"';
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = typeColor(idx);
      th.appendChild(sw);
      th.appendChild(document.createTextNode(t.label));
      theadRow.appendChild(th);
    });
    const thEnd = document.createElement('th');
    theadRow.appendChild(thEnd);
  }

  function histAddRowToDOM(id, value, freqs) {
    const tbody = document.getElementById('hist-rows-container');
    if (!tbody) return;
    histEnsureDefaultType();

    const tr = document.createElement('tr');
    tr.dataset.id = id;

    const tdIdx = document.createElement('td');
    tdIdx.className = 'idx';

    // Value cell
    const tdVal = document.createElement('td');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value === '' || value === undefined || value === null ? '' : String(value);
    inp.placeholder = 'angka atau teks';
    inp.addEventListener('blur',  () => histOnRowBlur(id, inp));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); histOnRowBlur(id, inp); histAddRow(true); }
    });
    tdVal.appendChild(inp);

    tr.append(tdIdx, tdVal);

    // One <td> per freq-type
    AppState.histogram.freqTypes.forEach(t => {
      const tdFreq = document.createElement('td');
      tdFreq.className = 'freq';
      const freqInp = document.createElement('input');
      freqInp.type = 'number';
      freqInp.min = '0';
      freqInp.max = '999';
      freqInp.step = '1';
      freqInp.className = 'hist-freq-input';
      freqInp.dataset.id = id;
      freqInp.dataset.typeId = t.id;
      const initial = (freqs && t.id in freqs) ? freqs[t.id] : 0;
      freqInp.value = String(Math.max(0, parseInt(initial, 10) || 0));
      freqInp.title = 'Frekuensi untuk "' + t.label + '"';
      freqInp.addEventListener('blur',   () => histOnFreqBlur(id, t.id, freqInp));
      freqInp.addEventListener('change', () => histOnFreqBlur(id, t.id, freqInp));
      tdFreq.appendChild(freqInp);
      tr.appendChild(tdFreq);
    });

    // Remove cell
    const tdBtn = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn-remove-row';
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = 'Hapus baris';
    btn.addEventListener('click', () => histRemoveRow(id));
    tdBtn.appendChild(btn);
    tr.appendChild(tdBtn);

    tbody.appendChild(tr);
    histRefreshIndices();
  }
  window.histAddRowToDOM = histAddRowToDOM;

  function histOnFreqBlur(rowId, typeId, inp) {
    const row = AppState.histogram.rows.find(r => r.id === rowId);
    if (!row) return;
    if (!row.freqs || typeof row.freqs !== 'object') row.freqs = {};
    let f = parseInt(inp.value, 10);
    if (isNaN(f) || f < 0) f = 0;
    if (f > 999) f = 999;
    inp.value = String(f);
    row.freqs[typeId] = f;
    saveState();
  }

  function histRefreshIndices() {
    const tbody = document.getElementById('hist-rows-container');
    if (!tbody) return;
    [...tbody.children].forEach((tr, i) => {
      const idxTd = tr.querySelector('td.idx');
      if (idxTd) idxTd.textContent = String(i + 1);
    });
  }

  function histOnRowBlur(id, inp) {
    const raw = inp.value.trim();
    const row = AppState.histogram.rows.find(r => r.id === id);
    if (!row) return;
    inp.classList.remove('invalid');
    if (raw === '') { row.value = ''; saveState(); return; }
    const sanitized = sanitizeText(raw);
    const n = nnum(sanitized);
    row.value = isNaN(n) ? sanitized : n;
    saveState();
  }

  function histAddRow(focusNew) {
    if (AppState.histogram.rows.length >= 500) {
      showToast('warning', 'Maksimum 500 baris');
      return;
    }
    histEnsureDefaultType();
    const id = generateId();
    const freqs = {};
    AppState.histogram.freqTypes.forEach(t => { freqs[t.id] = 0; });
    AppState.histogram.rows.push({ id, value: '', freqs });
    histAddRowToDOM(id, '', freqs);
    saveState();
    if (focusNew) {
      const tbody = document.getElementById('hist-rows-container');
      tbody.lastElementChild?.querySelector('td:nth-child(2) input')?.focus();
    }
  }

  function histRemoveRow(id) {
    AppState.histogram.rows = AppState.histogram.rows.filter(r => r.id !== id);
    document.getElementById('hist-rows-container')?.querySelector(`tr[data-id="${id}"]`)?.remove();
    histRefreshIndices();
    saveState();
  }

  // Re-render every row's <tr> from current state — used after type
  // add/remove since the number of freq cells changes.
  function histRepopulateRows() {
    const tbody = document.getElementById('hist-rows-container');
    if (!tbody) return;
    tbody.innerHTML = '';
    AppState.histogram.rows.forEach(r => {
      const v = (r.value === null || r.value === undefined ||
                 (typeof r.value === 'number' && isNaN(r.value))) ? '' : r.value;
      histAddRowToDOM(r.id, v, r.freqs || {});
    });
  }

  function histPopulateTable(rows) {
    const tbody = document.getElementById('hist-rows-container');
    if (!tbody) return;
    histEnsureDefaultType();
    tbody.innerHTML = '';
    if (rows.length === 0) {
      for (let i = 0; i < 5; i++) {
        const id = generateId();
        const freqs = {};
        AppState.histogram.freqTypes.forEach(t => { freqs[t.id] = 0; });
        AppState.histogram.rows.push({ id, value: '', freqs });
        histAddRowToDOM(id, '', freqs);
      }
    } else {
      rows.forEach(r => {
        const v = (r.value === null || r.value === undefined ||
                   (typeof r.value === 'number' && isNaN(r.value))) ? '' : r.value;
        histAddRowToDOM(r.id, v, r.freqs || {});
      });
    }
  }

  function histSyncUI() {
    const titleEl  = document.getElementById('hist-title');
    const methodEl = document.getElementById('hist-bin-method');
    const unitEl   = document.getElementById('hist-unit');
    const curveEl  = document.getElementById('hist-normal-curve');
    const labelYEl = document.getElementById('hist-label-y');
    const h = AppState.histogram;
    if (titleEl)  titleEl.value  = h.title || '';
    if (methodEl) methodEl.value = ['sturges','fd'].includes(h.binMethod) ? h.binMethod : 'sturges';
    if (unitEl)   unitEl.value   = h.unit || '';
    if (curveEl)  curveEl.checked = !!h.showNormal;
    if (labelYEl) labelYEl.value = h.labelY || '';
    histEnsureDefaultType();
    histRenderTypes();
    histRebuildTableHeader();
    histPopulateTable(h.rows.slice());
  }
  window.histSyncUI = histSyncUI;

  /* ════════════════════════════════════════════════════════════
     Stats panel
     ════════════════════════════════════════════════════════════ */
  function histRenderStats(stats, opts) {
    const el = document.getElementById('hist-stats');
    if (!el) return;
    el.innerHTML = '';
    const cards = [['N', String(stats.n)]];
    if (stats.allNumeric) {
      if (stats.mean !== null)   cards.push(['Mean',     stats.mean.toFixed(3)]);
      if (stats.stdDev !== null) cards.push(['Std Dev',  stats.stdDev.toFixed(3)]);
      if (stats.min !== null)    cards.push(['Min',      stats.min.toFixed(3)]);
      if (stats.max !== null)    cards.push(['Max',      stats.max.toFixed(3)]);
      if (stats.k !== undefined && stats.k !== null) cards.push(['Bins', String(stats.k)]);
      if (stats.binWidth !== undefined && stats.binWidth !== null) {
        cards.push(['Bin Width', stats.binWidth.toFixed(3)]);
      }
    } else {
      cards.push(['Mode', 'Kategori (string)']);
      if (stats.k !== undefined && stats.k !== null) cards.push(['Bar', String(stats.k)]);
    }
    cards.forEach(([label, val]) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      const l = document.createElement('div'); l.className = 'stat-label'; l.textContent = label;
      const v = document.createElement('div'); v.className = 'stat-value'; v.textContent = val;
      card.append(l, v);
      el.appendChild(card);
    });
  }

  /* ════════════════════════════════════════════════════════════
     Core render — grouped bar chart (one dataset per freq-type)
     ════════════════════════════════════════════════════════════ */
  function renderHistogram(rawData, options) {
    options = options || histGetOptions();
    if (typeof Chart === 'undefined') {
      showToast('error', 'Chart.js gagal dimuat. Periksa koneksi internet.');
      return;
    }
    histEnsureDefaultType();
    const types = AppState.histogram.freqTypes;

    // Read raw title input at render time so an empty field hides the
    // title bar entirely (display: false), instead of the histGetOptions
    // fallback ('Histogram') always showing.
    const titleEl = document.getElementById('hist-title');
    const chartTitle = sanitizeText((titleEl?.value || '').trim());

    if (!Array.isArray(rawData) || rawData.length === 0) {
      showToast('error', 'Minimal 2 baris diperlukan');
      showEmptyState('histogram');
      return;
    }

    // Collect bars: { label, num, freqs:{typeId→N} }
    const bars = [];
    rawData.forEach(d => {
      if (d.value === null || d.value === undefined) return;
      const labelText = String(d.value).trim();
      if (labelText === '') return;
      const freqs = {};
      let rowTotal = 0;
      types.forEach(t => {
        const f = Math.max(0, parseInt(d.freqs?.[t.id], 10) || 0);
        freqs[t.id] = f;
        rowTotal += f;
      });
      if (rowTotal === 0) return;   // skip rows whose total across all types is zero
      const num = typeof d.value === 'number' ? d.value : nnum(labelText);
      bars.push({ label: labelText, freqs, total: rowTotal, num });
    });

    if (bars.length < 2) {
      showToast('error', 'Minimal 2 baris terisi (nilai + freq > 0)');
      showEmptyState('histogram');
      return;
    }

    const allNumeric = bars.every(b => !isNaN(b.num));
    const totalN = bars.reduce((s, b) => s + b.total, 0);
    if (totalN < 2) {
      showToast('error', 'Total frekuensi terlalu sedikit');
      showEmptyState('histogram');
      return;
    }

    // Frequency-weighted numeric stats (sum of all types per bar = total)
    let mean = null, stdDev = null, minV = null, maxV = null, binWidth = null;
    if (allNumeric) {
      const nums = bars.map(b => b.num);
      minV = Math.min(...nums);
      maxV = Math.max(...nums);
      const sumWX = bars.reduce((s, b) => s + b.num * b.total, 0);
      mean = sumWX / totalN;
      const sumSq = bars.reduce((s, b) => s + b.total * (b.num - mean) * (b.num - mean), 0);
      stdDev = Math.sqrt(sumSq / Math.max(1, totalN - 1));
      // Conceptual bin width: span / number of bins (matches the chosen method).
      // Sturges / Freedman-Diaconis already drive bars.length; this just exposes
      // the derived (max - min) / k for the stat panel.
      if (bars.length > 0 && maxV > minV) binWidth = (maxV - minV) / bars.length;
    }

    // Destroy old chart + (re)register annotation
    if (window.histChartInstance) { window.histChartInstance.destroy(); window.histChartInstance = null; }
    toggleEmpty('histogram', false);
    if (typeof annotationPlugin !== 'undefined' && !Chart.registry.plugins.get('annotation')) {
      Chart.register(annotationPlugin);
    }
    const annoOk = (typeof annotationPlugin !== 'undefined');

    // One dataset per freq-type — Chart.js groups bars by category automatically.
    const datasets = types.map((t, idx) => {
      const color = typeColor(idx);
      return {
        type: 'bar',
        label: t.label,
        data: bars.map(b => b.freqs[t.id] || 0),
        backgroundColor: color,
        borderColor: color,
        borderWidth: 1,
        borderRadius: 2,
        categoryPercentage: 0.85,
        barPercentage: 0.95
      };
    });

    // Optional normal-curve overlay using bar TOTALS — only when numeric
    if (options.showNormalCurve && allNumeric && stdDev > 0) {
      const sortedNums = [...new Set(bars.map(b => b.num))].sort((a, b) => a - b);
      let approxWidth = 1;
      if (sortedNums.length >= 2) {
        let sumGap = 0;
        for (let i = 1; i < sortedNums.length; i++) sumGap += sortedNums[i] - sortedNums[i - 1];
        approxWidth = sumGap / (sortedNums.length - 1);
      }
      const pdf = (x) => (1 / (stdDev * Math.sqrt(2 * Math.PI))) *
                        Math.exp(-0.5 * ((x - mean) / stdDev) ** 2);
      datasets.push({
        type: 'line',
        label: 'Distribusi Normal',
        data: bars.map(b => pdf(b.num) * totalN * approxWidth),
        borderColor: getCSSVar('--accent-amber') || '#F59E0B',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: false
      });
    }

    // Annotations — only X̄ mean line (no LSL/USL anymore)
    const annotations = {};
    if (annoOk && allNumeric && mean !== null) {
      const closestIdx = (target) => {
        let bestI = 0, bestD = Infinity;
        for (let i = 0; i < bars.length; i++) {
          const d = Math.abs(bars[i].num - target);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        return bestI;
      };
      annotations.Mean = {
        type: 'line', scaleID: 'x', value: closestIdx(mean),
        borderColor: getCSSVar('--accent-green'), borderWidth: 2,
        label: { display: true, content: 'X̄=' + mean.toFixed(2), position: 'center',
                 backgroundColor: getCSSVar('--accent-green'), color: '#fff', font: { size: 10 } }
      };
    }

    const canvas = document.getElementById('hist-canvas');
    if (!canvas) return;

    window.histChartInstance = new Chart(canvas.getContext('2d'), {
      data: { labels: bars.map(b => b.label), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        scales: {
          x: {
            grid: { color: getCSSVar('--border-base') },
            ticks: {
              color: getCSSVar('--text-secondary'),
              maxRotation: 45,
              font: { family: getCSSVar('--font-body'), size: 11 },
              autoSkip: false
            },
            title: { display: true, text: options.unitLabel || (allNumeric ? 'Nilai' : 'Kategori'),
                     color: getCSSVar('--text-secondary') }
          },
          y: {
            min: 0,
            grid: { color: getCSSVar('--border-base') },
            ticks: { color: getCSSVar('--text-secondary'),
                     font: { family: getCSSVar('--font-mono'), size: 11 }, precision: 0 },
            title: { display: true,
                     text: options.labelY || 'Frekuensi',
                     color: getCSSVar('--text-secondary'),
                     font: { size: 12 } }
          }
        },
        plugins: {
          title: {
            display: chartTitle !== '',
            text: chartTitle,
            font: { size: 15, weight: 'bold' },
            color: getCSSVar('--text-primary') || '#F1F5F9',
            padding: { top: 10, bottom: 16 }
          },
          legend: {
            position: 'top',
            labels: { color: getCSSVar('--text-secondary'), usePointStyle: true, boxWidth: 14 }
          },
          tooltip: {
            backgroundColor: getCSSVar('--bg-secondary'),
            borderColor: getCSSVar('--border-base'),
            borderWidth: 1,
            titleColor: getCSSVar('--text-primary'),
            bodyColor:  getCSSVar('--text-secondary'),
            callbacks: {
              title: (items) => bars[items[0].dataIndex]?.label || '',
              label: (item) => ' ' + item.dataset.label + ': ' + item.raw,
              afterLabel: (item) => ' Relatif: ' + (item.raw / totalN * 100).toFixed(1) + '%'
            }
          },
          annotation: annoOk ? { clip: false, annotations } : {}
        }
      }
    });

    const stats = {
      n: totalN, k: bars.length, types: types.length, allNumeric,
      mean, stdDev, min: minV, max: maxV, binWidth
    };
    lastResult = { bars, types: types.slice(), stats, options };
    histRenderStats(stats, options);
  }
  window.renderHistogram = renderHistogram;

  /* ════════════════════════════════════════════════════════════
     Import / paste — multi-column CSV
     Header row defines the freq-type names (column 1 = "Nilai" or
     similar, columns 2..N = freq-type labels). Without a header,
     each line is treated as: label, freq1, freq2, ...
     ════════════════════════════════════════════════════════════ */
  function histParseValues(rawText) {
    const text = (rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText)
                  .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) return null;
    const first = lines[0];
    const delim = first.includes('\t') ? '\t'
                : first.includes(';')  ? ';'
                : first.includes(',')  ? ',' : null;
    const splitClean = (line) => (delim ? line.split(delim) : [line])
      .map(p => p.trim().replace(/^"|"$/g, ''));

    // Header detection: row 0 has at least 2 columns AND every column after
    // the first is non-numeric AND row 1 column 1+ is numeric.
    let startAt = 0;
    let headerTypeLabels = null;
    if (lines.length >= 2) {
      const a = splitClean(lines[0]);
      const b = splitClean(lines[1]);
      if (a.length >= 2 && b.length >= 2) {
        const headerLooksLikeHeader = a.slice(1).every(c => isNaN(nnum(c)));
        const dataLooksLikeData = !isNaN(nnum(b[b.length - 1]));
        if (headerLooksLikeHeader && dataLooksLikeData) {
          startAt = 1;
          headerTypeLabels = a.slice(1);   // column names for the freq columns
        }
      }
    }

    // Build (or reuse) freq types: if a header was found AND it differs
    // from the current types, replace types with new ones.
    if (headerTypeLabels && headerTypeLabels.length > 0) {
      const same = AppState.histogram.freqTypes.length === headerTypeLabels.length &&
                   AppState.histogram.freqTypes.every((t, i) => t.label === headerTypeLabels[i]);
      if (!same) {
        AppState.histogram.freqTypes = headerTypeLabels
          .slice(0, 8)
          .map(l => ({ id: generateId(), label: sanitizeText(l).slice(0, 30) || 'Tipe' }));
      }
    }
    histEnsureDefaultType();
    const types = AppState.histogram.freqTypes;

    const out = [];
    for (let i = startAt; i < lines.length; i++) {
      const cleaned = splitClean(lines[i]);
      if (cleaned.length === 0) continue;
      const labelRaw = (cleaned[0] || '').trim();
      if (labelRaw === '') continue;
      const sanitized = sanitizeText(labelRaw);
      const asNum = nnum(sanitized);

      const freqs = {};
      types.forEach((t, ti) => {
        const cell = cleaned[ti + 1];
        let f = 0;
        if (cell !== undefined) {
          const n = nnum(cell);
          if (!isNaN(n)) f = Math.min(999, Math.max(0, Math.round(n)));
        }
        // If only one column total ("Lulus" alone) treat as freq=1 on first type.
        if (cleaned.length === 1 && ti === 0) f = 1;
        freqs[t.id] = f;
      });

      out.push({
        id: generateId(),
        value: isNaN(asNum) ? sanitized : asNum,
        freqs
      });
    }
    return out;
  }

  function histTotalFreq(rows) {
    return rows.reduce((s, r) => {
      const t = Object.values(r.freqs || {}).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
      return s + t;
    }, 0);
  }

  function histImportCSV(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast('error', 'File terlalu besar (max 1MB)'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const rows = histParseValues(String(e.target.result || ''));
      if (!rows || rows.length === 0 || histTotalFreq(rows) < 2) {
        showToast('error', 'CSV harus berisi minimal 2 data (total frekuensi)');
        return;
      }
      AppState.histogram.rows = rows;
      histRenderTypes();
      histRebuildTableHeader();
      histPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' baris (Σ freq = ' + histTotalFreq(rows) + ') diimport');
      renderHistogram(rows, histGetOptions());
    };
    reader.onerror = () => showToast('error', 'Gagal membaca file');
    reader.readAsText(file);
  }

  function histPasteClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      showToast('warning', 'Clipboard API tidak didukung — gunakan Import CSV');
      return;
    }
    navigator.clipboard.readText().then(text => {
      const rows = histParseValues(text);
      if (!rows || rows.length === 0 || histTotalFreq(rows) < 2) {
        showToast('error', 'Clipboard harus berisi minimal 2 data');
        return;
      }
      AppState.histogram.rows = rows;
      histRenderTypes();
      histRebuildTableHeader();
      histPopulateTable(rows.slice());
      saveState();
      showToast('success', rows.length + ' baris dari clipboard');
      renderHistogram(rows, histGetOptions());
    }).catch(() => showToast('warning', 'Akses clipboard ditolak'));
  }

  /* ════════════════════════════════════════════════════════════
     Export
     ════════════════════════════════════════════════════════════ */
  function histExportPNG() {
    if (!window.histChartInstance) { showToast('error', 'Render chart dulu'); return; }
    triggerDownload(window.histChartInstance.toBase64Image('image/png'), 'histogram.png');
  }

  function histExportCSV() {
    if (!lastResult) { showToast('error', 'Render chart dulu'); return; }
    const BOM = '﻿';
    const csvEscape = (s) => /[,"\n]/.test(String(s))
      ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);

    // Multi-column header: Label, <type1>, <type2>, …, Total, Relatif (%)
    const header = ['Label', ...lastResult.types.map(t => t.label), 'Total', 'Relatif (%)'];
    let csv = BOM + header.map(csvEscape).join(',') + '\n';
    const n = lastResult.stats.n;
    lastResult.bars.forEach(b => {
      const row = [
        csvEscape(b.label),
        ...lastResult.types.map(t => b.freqs[t.id] || 0),
        b.total,
        (b.total / n * 100).toFixed(2)
      ];
      csv += row.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'histogram-data.csv');
  }

  /* ---------- reset ---------- */
  function histReset() {
    showModal('Hapus semua data Histogram?', () => {
      if (window.histChartInstance) { window.histChartInstance.destroy(); window.histChartInstance = null; }
      AppState.histogram.title      = '';
      AppState.histogram.binMethod  = 'sturges';
      AppState.histogram.showNormal = false;
      AppState.histogram.unit       = '';
      AppState.histogram.labelY     = '';
      AppState.histogram.freqTypes  = [];
      AppState.histogram.rows       = [];
      saveState();
      histSyncUI();
      showEmptyState('histogram');
      showToast('success', 'Histogram direset');
    });
  }

  function initHistogram() {
    document.getElementById('btn-hist-add-row')?.addEventListener('click', () => histAddRow(true));
    document.getElementById('btn-hist-add-type')?.addEventListener('click', () => histAddType());
    document.getElementById('btn-hist-render')?.addEventListener('click', () => {
      histSyncStateFromUI();
      saveState();
      renderHistogram(AppState.histogram.rows.slice(), histGetOptions());
    });
    document.getElementById('btn-hist-import-csv')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) histImportCSV(f);
      e.target.value = '';
    });
    document.getElementById('btn-hist-paste')?.addEventListener('click', histPasteClipboard);
    document.getElementById('btn-hist-export-png')?.addEventListener('click', histExportPNG);
    document.getElementById('btn-hist-export-csv')?.addEventListener('click', histExportCSV);
    document.getElementById('btn-hist-reset')?.addEventListener('click', histReset);

    const methodSel = document.getElementById('hist-bin-method');
    methodSel?.addEventListener('change', () => {
      histSyncStateFromUI();
      saveState();
    });
    ['hist-title', 'hist-unit', 'hist-label-y'].forEach(id => {
      document.getElementById(id)?.addEventListener('blur', () => { histSyncStateFromUI(); saveState(); });
    });
    document.getElementById('hist-normal-curve')?.addEventListener('change', () => {
      histSyncStateFromUI();
      saveState();
    });

    histSyncUI();
  }
  window.initHistogram = initHistogram;

})();
