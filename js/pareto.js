/* ============================================================
   pareto.js — Pareto engine (depends: app.js + Chart.js CDN)
   Loaded LAST. Must NOT call any function from flowchart.js.
   Implements §3B (chart) + §3C (CSV/paste/normalizeNumber).
   ============================================================ */
(function () {
  let lastEnriched = [];   // cache for CSV export

  /* ========================================================
     §3C — normalizeNumber (5-pattern) [FIX B3]
     ======================================================== */
  function normalizeNumber(str) {
    const s = String(str).trim();
    if (s === '') return NaN;
    if (/^\d+$/.test(s)) return parseFloat(s);                       // integer
    // ID thousands ("1.234", "1.234.567") MUST be tested before US decimal:
    // it is the more specific pattern (groups of exactly 3 digits), and §5.8
    // Case C requires "1.234" -> 1234, not 1.234.
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, '')); // ID thousands
    if (/^\d+\.\d+$/.test(s)) return parseFloat(s);                   // US decimal
    if (/^[\d.]+,\d+$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')); // ID decimal
    const v = parseFloat(s);
    if (!isNaN(v)) return v;
    return NaN;
  }
  window.normalizeNumber = normalizeNumber;

  function splitCSVLine(line, delim) {
    const result = []; let inQ = false, cur = '';
    for (const c of line) {
      if (c === '"') inQ = !inQ;
      else if (c === delim && !inQ) { result.push(cur); cur = ''; }
      else cur += c;
    }
    result.push(cur);
    return result;
  }

  function parseDelimited(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const text = (raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw)
                    .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) { showToast('error', 'File tidak memiliki data'); return []; }

    const f = lines[0];
    const delim = (f.match(/\t/g) || []).length > 0 ? '\t'
                : (f.match(/;/g) || []).length > 0 ? ';' : ',';

    // Detect category/value columns from the header so app-exported CSVs
    // (Rank,Kategori,Nilai,…) round-trip correctly. Fall back to 0/1.
    const header = splitCSVLine(f, delim).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    let catIdx = header.findIndex(h => h === 'kategori' || h === 'category');
    let valIdx = header.findIndex(h => h === 'nilai' || h === 'value' || h === 'frekuensi');
    if (catIdx === -1) catIdx = 0;
    if (valIdx === -1) valIdx = 1;

    const result = [], errors = [];
    lines.slice(1).forEach((line, i) => {
      const cols = splitCSVLine(line, delim);
      if (cols.length <= Math.max(catIdx, valIdx)) { errors.push('Baris ' + (i + 2) + ': kolom kurang'); return; }
      const cat = (cols[catIdx] || '').trim().replace(/^"|"$/g, '');
      const rv  = (cols[valIdx] || '').trim().replace(/^"|"$/g, '');
      if (cat === '') { errors.push('Baris ' + (i + 2) + ': kategori kosong'); return; }
      const v = normalizeNumber(rv);
      if (isNaN(v) || v <= 0) { errors.push('Baris ' + (i + 2) + ': "' + rv + '" tidak valid'); return; }
      result.push({ id: generateId(), category: sanitizeText(cat), value: v });
    });

    if (errors.length > 0) {
      showToast('warning', errors.length + ' baris dilewati: ' +
        (errors.length <= 3 ? errors.join(' | ') : errors.slice(0, 3).join(' | ') + '…'));
    }
    return result;
  }
  window.parseDelimited = parseDelimited;

  /* ========================================================
     §3B — renderParetoChart
     ======================================================== */
  function renderParetoChart(rawData, options) {
    options = options || {};
    if (typeof Chart === 'undefined') {
      showToast('error', 'Chart.js gagal dimuat. Periksa koneksi internet.');
      return;
    }

    // FASE 1 — sanitize & validate
    const cleaned = rawData.filter(d =>
      d.category && String(d.category).trim() !== '' &&
      d.value !== null && d.value !== undefined && d.value !== ''
    );
    if (cleaned.length < 2) { showToast('error', 'Minimal 2 kategori'); return; }

    const data = [], errors = [];
    for (const d of cleaned) {
      const v = normalizeNumber(String(d.value));
      if (isNaN(v) || v <= 0) { errors.push('"' + d.category + '": "' + d.value + '"'); continue; }
      data.push({ category: String(d.category).trim(), value: v });
    }
    if (errors.length > 0) {
      showToast('error', errors.length + ' baris tidak valid: ' + errors.slice(0, 3).join('; '));
      if (data.length < 2) return;
    }

    const cats = data.map(d => d.category.toLowerCase());
    const dups = cats.filter((c, i) => cats.indexOf(c) !== i);
    if (dups.length > 0) showToast('warning', 'Duplikat: ' + [...new Set(dups)].join(', '));

    // FASE 2 — sort & 2-pass calc [FIX B2]
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, d) => s + d.value, 0);
    if (total === 0) { showToast('error', 'Total tidak boleh nol'); return; }

    let cumSum = 0;
    const temp = sorted.map((d, i) => {
      cumSum += d.value;
      const pct = d.value / total * 100, cp = cumSum / total * 100;
      return { rank: i + 1, category: d.category, value: d.value,
               pct: Math.round(pct * 10) / 10, cumPct: Math.round(cp * 10) / 10 };
    });
    const threshold = options.threshold || 80;
    const enriched = temp.map((d, i) => ({
      ...d,
      isVital: i === 0 ? true : temp[i - 1].cumPct < threshold
    }));
    lastEnriched = enriched;

    const vitalCount   = enriched.filter(d => d.isVital).length;
    const trivialCount = enriched.length - vitalCount;
    let crossIdx = enriched.findIndex(d => d.cumPct >= threshold);
    if (crossIdx === -1) crossIdx = enriched.length - 1;

    // FASE 3 — destroy old chart [Pitfall 1]
    if (window.paretoChartInstance) {
      window.paretoChartInstance.destroy();
      window.paretoChartInstance = null;
    }

    // ensure canvas exists (empty-state may have replaced wrapper)
    let ctxEl = document.getElementById('pareto-canvas');
    if (!ctxEl) {
      const wrapper = document.getElementById('pareto-canvas-wrapper');
      wrapper.innerHTML = '';
      ctxEl = document.createElement('canvas');
      ctxEl.id = 'pareto-canvas';
      wrapper.appendChild(ctxEl);
    }

    // FASE 4 — colors
    const barColors = enriched.map(d => d.isVital
      ? getCSSVar('--chart-bar-vital') : getCSSVar('--chart-bar-useful'));
    const pointColors = enriched.map(d => d.cumPct >= threshold
      ? getCSSVar('--accent-red') : getCSSVar('--chart-line'));

    // FASE 5 — render [FIX B17 guard register]
    if (typeof annotationPlugin !== 'undefined') Chart.register(annotationPlugin);
    else showToast('warning', 'Plugin anotasi tidak aktif');
    if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

    const ctx = ctxEl.getContext('2d');

    // White canvas background — copied verbatim from histogram.js / controlchart.js
    // (POLA A: local plugin object passed via plugins: [bgPlugin]).
    // beforeDraw paints #FAFAFA into the canvas before Chart.js draws,
    // so PNG export via toBase64Image() carries the light background too.
    const COLOR_BG = '#FAFAFA';
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

    const annotations = {};
    if (typeof annotationPlugin !== 'undefined') {
      annotations.thresholdLine = {
        type: 'line', scaleID: 'y2', value: threshold,
        borderColor: getCSSVar('--accent-amber'), borderWidth: 2, borderDash: [6, 4],
        label: { display: true, content: threshold + '% Threshold', position: 'end',
                 backgroundColor: getCSSVar('--accent-amber'), color: '#000',
                 font: { size: 11, weight: 'bold' }, padding: { x: 6, y: 4 }, borderRadius: 4 }
      };
      annotations.vitalCutLine = {
        type: 'line', scaleID: 'x', value: crossIdx + 0.5,
        borderColor: getCSSVar('--border-focus') + '80', borderWidth: 1, borderDash: [3, 3],
        label: { display: true, content: 'Vital Few →', position: 'start',
                 color: getCSSVar('--text-muted'), font: { size: 10 } }
      };
    }

    window.paretoChartInstance = new Chart(ctx, {
      plugins: [bgPlugin],
      type: 'bar',
      data: {
        labels: enriched.map(d => d.category),
        datasets: [
          { type: 'bar', label: options.unitLabel || 'Frekuensi',
            data: enriched.map(d => d.value), backgroundColor: barColors, borderColor: barColors,
            borderWidth: 1, borderRadius: 4, borderSkipped: false, yAxisID: 'y', order: 2 },
          { type: 'line', label: '% Kumulatif', data: enriched.map(d => d.cumPct),
            borderColor: getCSSVar('--chart-line'), borderWidth: 2,
            pointRadius: 5, pointBackgroundColor: pointColors, pointHoverRadius: 7,
            tension: 0.3, fill: false, yAxisID: 'y2', order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 600, easing: 'easeOutQuart' },
        scales: {
          x: {
            grid: { color: getCSSVar('--border-base') },
            ticks: { color: getCSSVar('--text-secondary'),
                     font: { family: getCSSVar('--font-body'), size: 11 },
                     maxRotation: 35, minRotation: 0,
                     callback: (v, i) => { const l = enriched[i]?.category || ''; return l.length > 15 ? l.slice(0, 13) + '…' : l; } }
          },
          y: {
            type: 'linear', position: 'left', min: 0,
            suggestedMax: Math.ceil((enriched[0]?.value || 1) * 1.15),
            grid: { color: getCSSVar('--border-base') },
            ticks: { color: getCSSVar('--text-secondary'), font: { family: getCSSVar('--font-mono'), size: 11 } },
            title: { display: true, text: options.yAxisLabel || options.unitLabel || 'Frekuensi',
                     color: getCSSVar('--text-secondary'), font: { size: 12 } }
          },
          y2: {
            type: 'linear', position: 'right', min: 0, max: 100,
            grid: { drawOnChartArea: false },
            ticks: { color: getCSSVar('--accent-amber'), font: { family: getCSSVar('--font-mono'), size: 11 },
                     callback: v => v + '%' },
            title: { display: true, text: '% Kumulatif', color: getCSSVar('--accent-amber'), font: { size: 12 } }
          }
        },
        plugins: {
          title: { display: !!options.title, text: options.title || '',
                   color: '#000000', font: { family: getCSSVar('--font-heading'), size: 16 } },
          legend: { labels: { color: getCSSVar('--text-secondary'), font: { family: getCSSVar('--font-body'), size: 12 } } },
          tooltip: {
            backgroundColor: getCSSVar('--bg-secondary'), borderColor: getCSSVar('--border-base'),
            borderWidth: 1, titleColor: getCSSVar('--text-primary'), bodyColor: getCSSVar('--text-secondary'),
            position: 'nearest',
            callbacks: {
              title: items => enriched[items[0].dataIndex]?.category || '',
              beforeBody: items => { const d = enriched[items[0].dataIndex]; return 'Rank #' + d.rank + ' | ' + (d.isVital ? '★ Vital Few' : '· Useful Many'); },
              label: item => item.datasetIndex === 0 ? ' Nilai: ' + item.raw + ' ' + (options.unitLabel || '') : ' Kumulatif: ' + item.raw + '%',
              afterBody: items => 'Kontribusi: ' + enriched[items[0].dataIndex].pct + '%'
            }
          },
          annotation: { clip: false, annotations }
        }
      }
    });

    // FASE 6 — stat panel [FIX B19]
    renderStats(total, vitalCount, trivialCount, threshold, options, enriched.length);

    // FASE 7 — summary table [FIX B19]
    renderSummaryTable(enriched);
  }
  window.renderParetoChart = renderParetoChart;

  function renderStats(total, vitalCount, trivialCount, threshold, options, totalCats) {
    const sp = document.getElementById('pareto-stats');
    if (!sp) return;
    sp.innerHTML = '';
    const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
    const span = (c, t) => { const s = el('span', c); s.textContent = t; return s; };
    const mkCard = (lbl, val, sub, cls) => {
      const c = el('div', 'stat-card' + (cls ? ' ' + cls : ''));
      c.appendChild(span('stat-label', lbl));
      c.appendChild(span('stat-value', val));
      if (sub) c.appendChild(span('stat-sub', sub));
      return c;
    };
    sp.appendChild(mkCard('Total', total.toLocaleString('id-ID') + ' ' + (options.unitLabel || '').trim(), null, null));
    sp.appendChild(mkCard('Vital Few', vitalCount + '/' + totalCats + ' kategori', '(menyumbang ≥' + threshold + '% masalah)', 'vital'));
    sp.appendChild(mkCard('Useful Many', trivialCount + ' kategori', null, null));
  }

  function renderSummaryTable(enriched) {
    const tbl = document.getElementById('pareto-summary-table');
    if (!tbl) return;
    tbl.innerHTML = '';
    const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
    const thead = el('thead'); let tr = el('tr');
    for (const col of ['Rank', 'Kategori', 'Nilai', '%', 'Kum%', 'Status']) {
      const th = el('th'); th.textContent = col; tr.appendChild(th);
    }
    thead.appendChild(tr); tbl.appendChild(thead);
    const tbody = el('tbody');
    for (const d of enriched) {
      tr = el('tr'); if (d.isVital) tr.className = 'vital-row';
      const cells = [
        [d.rank, ''], [d.category, ''], [d.value.toLocaleString('id-ID'), 'num'],
        [d.pct + '%', 'num'], [d.cumPct + '%', 'num'],
        [d.isVital ? '★ Vital Few' : '· Useful Many', 'status ' + (d.isVital ? 'vital' : 'trivial')]
      ];
      for (const [v, c] of cells) {
        const td = el('td'); if (c) td.className = c; td.textContent = String(v); tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
  }

  /* ---------- FASE 8: export ---------- */
  function exportChartPNG() {
    if (!window.paretoChartInstance) { showToast('error', 'Render chart dulu'); return; }
    triggerDownload(window.paretoChartInstance.toBase64Image('image/png'), 'pareto-chart.png');
  }

  function exportCSVData() {
    if (!lastEnriched || lastEnriched.length === 0) { showToast('error', 'Render chart dulu'); return; }
    const hdr = 'Rank,Kategori,Nilai,Persen (%),Kumulatif (%),Status\n';
    const rows = lastEnriched.map(d => d.rank + ',"' + d.category.replace(/"/g, '""') + '",' + d.value + ',' +
          d.pct + ',' + d.cumPct + ',"' + (d.isVital ? 'Vital Few' : 'Useful Many') + '"').join('\n');
    const blob = new Blob([String.fromCharCode(0xFEFF) + hdr + rows], { type: 'text/csv;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'pareto-data.csv');
  }

  /* ---------- §3C: CSV import / paste ---------- */
  function importCSVFile(file) {
    if (!file) return;
    if (file.size > 1000000) { showToast('error', 'File terlalu besar (maks 1MB)'); return; }
    if (!file.name.match(/\.(csv|tsv|txt)$/i)) {
      showToast('error', 'Format tidak didukung (.csv/.tsv/.txt)'); return;
    }
    const r = new FileReader();
    r.onerror = () => showToast('error', 'Gagal membaca file');
    r.onload = e => {
      const data = parseDelimited(e.target.result);
      if (data.length >= 2) {
        AppState.pareto.rows = data;
        populateInputTable(data);
        renderParetoChart(data, getOptionsFromUI());
        saveState();
        showToast('success', data.length + ' baris berhasil diimport');
      } else {
        showToast('warning', 'Data tidak cukup (minimal 2 baris)');
      }
    };
    r.readAsText(file, 'UTF-8');
  }

  function pasteFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) { showPasteTextarea(); return; }
    navigator.clipboard.readText()
      .then(text => {
        if (!text.trim()) { showToast('warning', 'Clipboard kosong'); return; }
        const data = parseDelimited(text);
        if (data.length >= 2) {
          AppState.pareto.rows = data;
          populateInputTable(data);
          renderParetoChart(data, getOptionsFromUI());
          saveState();
          showToast('success', data.length + ' baris berhasil di-paste');
        } else {
          showToast('warning', 'Data tidak cukup');
          showPasteTextarea();
        }
      })
      .catch(err => {
        console.warn('[SQT] Clipboard error:', err);
        showToast('warning', 'Clipboard tidak tersedia — gunakan textarea');
        showPasteTextarea();
      });
  }

  /* ========================================================
     Input table — addRowToDOM + row actions
     ======================================================== */
  function addRowToDOM(id, category, value) {
    const tbody = document.getElementById('pareto-rows-container');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.dataset.rowId = id;

    const tdCat = document.createElement('td');
    const inpCat = document.createElement('input');
    inpCat.type = 'text'; inpCat.maxLength = 50;
    inpCat.placeholder = 'Kategori';
    inpCat.value = category != null ? String(category) : '';
    tdCat.appendChild(inpCat);

    const tdVal = document.createElement('td');
    const inpVal = document.createElement('input');
    inpVal.type = 'text'; inpVal.className = 'num';
    inpVal.placeholder = '0';
    inpVal.value = value != null && value !== '' ? String(value) : '';
    tdVal.appendChild(inpVal);

    const tdDel = document.createElement('td');
    const btnDel = document.createElement('button');
    btnDel.className = 'btn-remove-row';
    btnDel.type = 'button';
    btnDel.textContent = '×';
    btnDel.title = 'Hapus baris';
    btnDel.addEventListener('click', () => removeRow(id));
    tdDel.appendChild(btnDel);

    tr.append(tdCat, tdVal, tdDel);
    tbody.appendChild(tr);

    inpCat.addEventListener('blur', () => updateRow(id, 'category', inpCat.value));
    inpVal.addEventListener('blur', () => {
      updateRow(id, 'value', inpVal.value);
      const v = normalizeNumber(inpVal.value);
      if (inpVal.value.trim() !== '' && (isNaN(v) || v <= 0)) inpVal.classList.add('invalid');
      else inpVal.classList.remove('invalid');
    });
    inpVal.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateRow(id, 'value', inpVal.value);
        addRow(true);
      }
    });
  }
  window.addRowToDOM = addRowToDOM;

  function syncRowsFromState(id, field, val) {
    let row = AppState.pareto.rows.find(r => r.id === id);
    if (!row) {
      row = { id, category: '', value: 0 };
      AppState.pareto.rows.push(row);
    }
    if (field === 'category') row.category = sanitizeText(val);
    else if (field === 'value') {
      const v = normalizeNumber(val);
      row.value = isNaN(v) ? 0 : v;
    }
  }

  function updateRow(id, field, val) {
    syncRowsFromState(id, field, val);
    saveState();
  }

  function addRow(focusNew) {
    if (AppState.pareto.rows.length >= 50) { showToast('error', 'Maksimum 50 baris'); return; }
    const id = generateId();
    AppState.pareto.rows.push({ id, category: '', value: 0 });
    addRowToDOM(id, '', '');
    saveState();
    if (AppState.pareto.rows.length > 20) showToast('warning', 'Lebih dari 20 baris — pertimbangkan menggabungkan kategori');
    if (focusNew) {
      const tbody = document.getElementById('pareto-rows-container');
      const lastRow = tbody.lastElementChild;
      if (lastRow) { const inp = lastRow.querySelector('input'); if (inp) inp.focus(); }
    }
  }

  function removeRow(id) {
    AppState.pareto.rows = AppState.pareto.rows.filter(r => r.id !== id);
    const tbody = document.getElementById('pareto-rows-container');
    const tr = tbody.querySelector(`tr[data-row-id="${id}"]`);
    if (tr) tr.remove();
    saveState();
  }

  function updateThreshold(val) {
    const v = parseInt(val, 10);
    if (isNaN(v) || v < 1 || v > 99) { showToast('error', 'Threshold harus 1–99'); return; }
    AppState.pareto.threshold = v;
    saveState();
    if (window.paretoChartInstance) {
      renderParetoChart(AppState.pareto.rows, getOptionsFromUI());
    }
  }

  function resetPareto() {
    showModal('Hapus seluruh data Pareto? Tindakan ini tidak bisa dibatalkan.', () => {
      AppState.pareto.rows = [];
      AppState.pareto.title = '';
      AppState.pareto.unit = '';
      AppState.pareto.yLabel = '';
      AppState.pareto.threshold = 80;
      saveState();
      syncParetoFieldsFromState();
      populateInputTable([]);
      showEmptyState('pareto');
      showToast('success', 'Data Pareto direset');
    });
  }

  /* ========================================================
     initPareto — attach listeners (called by app.js)
     ======================================================== */
  function initPareto() {
    document.getElementById('btn-pareto-add-row').addEventListener('click', () => addRow(false));
    document.getElementById('btn-pareto-render').addEventListener('click', () => {
      AppState.pareto.title = getOptionsFromUI().title;
      renderParetoChart(AppState.pareto.rows, getOptionsFromUI());
      saveState();
    });
    document.getElementById('btn-pareto-paste').addEventListener('click', pasteFromClipboard);
    document.getElementById('btn-pareto-export-png').addEventListener('click', exportChartPNG);
    document.getElementById('btn-pareto-export-csv').addEventListener('click', exportCSVData);
    document.getElementById('btn-pareto-reset').addEventListener('click', resetPareto);

    document.getElementById('btn-pareto-import-csv').addEventListener('change', e => {
      const file = e.target.files[0];
      importCSVFile(file);
      e.target.value = '';
    });

    const thEl = document.getElementById('pareto-threshold');
    thEl.addEventListener('blur', () => updateThreshold(thEl.value));
    thEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); updateThreshold(thEl.value); } });

    // persist config fields on blur
    ['pareto-title', 'pareto-unit', 'pareto-ylabel'].forEach(id => {
      const elx = document.getElementById(id);
      if (!elx) return;
      elx.addEventListener('blur', () => {
        AppState.pareto.title  = getOptionsFromUI().title;
        AppState.pareto.unit   = sanitizeText(document.getElementById('pareto-unit').value || '');
        AppState.pareto.yLabel = sanitizeText(document.getElementById('pareto-ylabel').value || '');
        saveState();
      });
    });

    // Ctrl+Enter global render
    document.addEventListener('keydown', e => {
      if (AppState.activeTab !== 'pareto') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        renderParetoChart(AppState.pareto.rows, getOptionsFromUI());
        saveState();
      }
    });

    // CDN guard: disable render if Chart.js missing
    if (typeof Chart === 'undefined') {
      const rb = document.getElementById('btn-pareto-render');
      if (rb) rb.disabled = true;
      showToast('error', 'Chart.js gagal dimuat. Periksa koneksi internet.');
    }
  }
  window.initPareto = initPareto;
})();
