/* ============================================================
   app.js — AppState + §0.8 helper registry + lifecycle
   Loaded FIRST. Must expose all globals before engines load.
   app.js must NOT call any function from flowchart.js / pareto.js.
   ============================================================ */

// Fresh 6M default categories for Fishbone (deep copy each call to avoid shared refs)
function makeDefaultFishboneCategories() {
  return [
    { id: 'man',         label: 'Man',         active: true, causes: [] },
    { id: 'machine',     label: 'Machine',     active: true, causes: [] },
    { id: 'material',    label: 'Material',    active: true, causes: [] },
    { id: 'method',      label: 'Method',      active: true, causes: [] },
    { id: 'measurement', label: 'Measurement', active: true, causes: [] },
    { id: 'environment', label: 'Environment', active: true, causes: [] }
  ];
}
window.makeDefaultFishboneCategories = makeDefaultFishboneCategories;

const AppState = {
  activeTab: 'flowchart',
  flowchart: {
    nodes:    [],
    edges:    [],
    direction:'TD',
    scale:    1,
    viewBox:  { x: 0, y: 0, w: 800, h: 600 }
  },
  pareto: {
    title: '', threshold: 80, unit: '', yLabel: '',
    rows: []
  },
  controlChart: {
    title: '', type: 'imr', sigma: 3, subgroupSize: 2, unit: '',
    rows: []                 // { id, value }
  },
  histogram: {
    title: '', binMethod: 'sturges', binCount: 10,
    lsl: null, usl: null, showNormal: false, unit: '',
    // freqTypes: array of { id, label } defining the freq columns.
    // rows[].freqs is keyed by the type id, e.g. { sqt_abc: 12, sqt_def: 5 }.
    freqTypes: [],
    rows: []
  },
  fishbone: {
    effect: '',
    categories: makeDefaultFishboneCategories()
  },
  scatter: {
    title: '', xLabel: 'X', yLabel: 'Y',
    showRegression: true, showBand: false,
    showInverseRegression: false,
    rows: []                 // { id, label, x, y }
  },
  runChart: {
    title: '', xLabel: 'Urutan', yLabel: 'Nilai',
    showMedian: true, showAnnotations: true, detectTrend: true,
    rows: []                 // { id, label, value }
  }
};
window.AppState = AppState;

// [FIX B4/B6] Selection Set — separate, never persisted/serialized
let fcSelectedNodes = new Set();
window.fcSelectedNodes = fcSelectedNodes;

/* ---------- generateId ---------- */
function generateId() {
  return 'sqt_' + Math.random().toString(36).slice(2, 11);
}
window.generateId = generateId;

/* ---------- getCSSVar ---------- */
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
window.getCSSVar = getCSSVar;

/* ---------- sanitizeText ---------- */
function sanitizeText(str) {
  return String(str)
    .replace(/<[^>]*>/g, '')
    .replace(/['"<>&]/g, c => ({ "'":"&#39;","\"":"&quot;","<":"&lt;",">":"&gt;","&":"&amp;" })[c])
    .trim()
    .slice(0, 200);
}
window.sanitizeText = sanitizeText;

/* ---------- showToast ---------- */
function showToast(type, msg, duration) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  while (container.children.length >= 3) {
    container.removeChild(container.firstChild);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = msg;
  toast.addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  const ms = duration ?? (type === 'success' ? 3500 : 5000);
  setTimeout(() => toast?.remove(), ms);
}
window.showToast = showToast;

/* ---------- triggerDownload ---------- */
function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (url.startsWith('blob:')) {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
window.triggerDownload = triggerDownload;

/* ---------- showModal ---------- */
function showModal(message, onConfirm) {
  const modal  = document.getElementById('modal-confirm');
  const msgEl  = document.getElementById('modal-confirm-msg');
  const btnOk  = document.getElementById('modal-confirm-ok');
  const btnCxl = document.getElementById('modal-confirm-cancel');

  msgEl.textContent = message;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  btnCxl.focus();

  const newBtnOk = btnOk.cloneNode(true);
  btnOk.parentNode.replaceChild(newBtnOk, btnOk);
  newBtnOk.addEventListener('click', () => { closeModal(); onConfirm(); }, { once: true });
  btnCxl.onclick = closeModal;

  modal._escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', modal._escHandler);
}
window.showModal = showModal;

/* ---------- closeModal ---------- */
function closeModal() {
  const modal = document.getElementById('modal-confirm');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (modal._escHandler) {
    document.removeEventListener('keydown', modal._escHandler);
    delete modal._escHandler;
  }
}
window.closeModal = closeModal;

/* ---------- showEmptyState ---------- */
function showEmptyState(tool) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  if (tool === 'flowchart') {
    const canvas = document.getElementById('fc-canvas');
    if (!canvas) return;
    canvas.innerHTML = '';
    canvas.setAttribute('viewBox', '0 0 520 280');
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'empty-state');
    const rect1 = document.createElementNS(SVG_NS, 'rect');
    Object.entries({ x:'200',y:'60',width:'120',height:'44',rx:'22',
      fill:'none', stroke:'var(--border-base)', 'stroke-width':'1.5',
      'stroke-dasharray':'5,3' }).forEach(([k,v]) => rect1.setAttribute(k,v));
    const t1 = document.createElementNS(SVG_NS, 'text');
    Object.entries({ x:'260',y:'87','text-anchor':'middle',
      fill:'var(--text-muted)','font-family':'var(--font-body)','font-size':'13'
    }).forEach(([k,v]) => t1.setAttribute(k,v));
    t1.textContent = 'START';
    const line1 = document.createElementNS(SVG_NS, 'line');
    Object.entries({ x1:'260',y1:'104',x2:'260',y2:'130',
      stroke:'var(--border-base)','stroke-width':'1.5','stroke-dasharray':'5,3'
    }).forEach(([k,v]) => line1.setAttribute(k,v));
    const rect2 = document.createElementNS(SVG_NS, 'rect');
    Object.entries({ x:'180',y:'130',width:'160',height:'44',rx:'8',
      fill:'none',stroke:'var(--border-base)','stroke-width':'1.5','stroke-dasharray':'5,3'
    }).forEach(([k,v]) => rect2.setAttribute(k,v));
    const t2 = document.createElementNS(SVG_NS, 'text');
    Object.entries({ x:'260',y:'157','text-anchor':'middle',
      fill:'var(--text-muted)','font-family':'var(--font-body)','font-size':'13'
    }).forEach(([k,v]) => t2.setAttribute(k,v));
    t2.textContent = 'Proses';
    const t3 = document.createElementNS(SVG_NS, 'text');
    Object.entries({ x:'260',y:'210','text-anchor':'middle',
      fill:'var(--text-muted)','font-family':'var(--font-body)','font-size':'13'
    }).forEach(([k,v]) => t3.setAttribute(k,v));
    t3.textContent = 'Tambahkan node pertama Anda menggunakan panel kiri.';
    g.append(rect1, t1, line1, rect2, t2, t3);
    canvas.appendChild(g);

  } else if (tool === 'pareto') {
    const wrapper = document.getElementById('pareto-canvas-wrapper');
    if (!wrapper) return;
    if (window.paretoChartInstance) {
      window.paretoChartInstance.destroy();
      window.paretoChartInstance = null;
    }
    const div = document.createElement('div');
    div.className = 'empty-state-pareto';
    div.innerHTML = `
      <svg viewBox="0 0 200 80" width="160" aria-hidden="true">
        <rect x="10" y="50" width="20" height="30" rx="3" fill="var(--border-base)"/>
        <rect x="40" y="35" width="20" height="45" rx="3" fill="var(--border-base)"/>
        <rect x="70" y="20" width="20" height="60" rx="3" fill="var(--border-base)"/>
        <rect x="100" y="10" width="20" height="70" rx="3" fill="var(--border-base)"/>
        <line x1="10" y1="60" x2="170" y2="18" stroke="var(--accent-amber)"
              stroke-width="2" stroke-dasharray="4,3"/>
      </svg>
      <p>Masukkan data kategori &amp; frekuensi<br>untuk memulai analisis Pareto.</p>
    `;
    wrapper.innerHTML = '';
    wrapper.appendChild(div);
    // Clear stats + summary table
    const stats = document.getElementById('pareto-stats');
    const summary = document.getElementById('pareto-summary-table');
    if (stats) stats.innerHTML = '';
    if (summary) summary.innerHTML = '';

  } else if (tool === 'controlchart') {
    if (window.ccChartInstance) { window.ccChartInstance.destroy(); window.ccChartInstance = null; }
    // Legacy MR chart instance is no longer created (single dual-axis chart now)
    window.ccMRChartInstance = null;
    toggleEmpty('controlchart', true);
    const stats = document.getElementById('cc-stats');
    const summary = document.getElementById('cc-summary-table');
    if (stats) stats.innerHTML = '';
    if (summary) summary.innerHTML = '';

  } else if (tool === 'histogram') {
    if (window.histChartInstance) { window.histChartInstance.destroy(); window.histChartInstance = null; }
    toggleEmpty('histogram', true);
    const stats = document.getElementById('hist-stats');
    if (stats) stats.innerHTML = '';

  } else if (tool === 'scatter') {
    if (window.scatterChartInstance) { window.scatterChartInstance.destroy(); window.scatterChartInstance = null; }
    if (typeof window.toggleScatterEmpty === 'function') window.toggleScatterEmpty(true);
    const stats = document.getElementById('sc-stats');
    const summary = document.getElementById('sc-summary-table');
    if (stats)   stats.innerHTML   = '';
    if (summary) summary.innerHTML = '';

  } else if (tool === 'runchart') {
    if (window.runChartInstance) { window.runChartInstance.destroy(); window.runChartInstance = null; }
    if (typeof window.toggleRunEmpty === 'function') window.toggleRunEmpty(true);
    const stats = document.getElementById('rc-stats');
    const summary = document.getElementById('rc-summary-table');
    if (stats)   stats.innerHTML   = '';
    if (summary) summary.innerHTML = '';

  } else if (tool === 'fishbone') {
    const svg = document.getElementById('fb-canvas');
    if (!svg) return;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 520 280');
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'empty-state');
    const line = document.createElementNS(SVG_NS, 'line');
    Object.entries({ x1:'80', y1:'140', x2:'380', y2:'140',
      stroke:'var(--border-base)', 'stroke-width':'2', 'stroke-dasharray':'5,3' })
      .forEach(([k,v]) => line.setAttribute(k,v));
    const box = document.createElementNS(SVG_NS, 'rect');
    Object.entries({ x:'380', y:'110', width:'110', height:'60', rx:'8',
      fill:'none', stroke:'var(--border-base)', 'stroke-width':'1.5', 'stroke-dasharray':'5,3' })
      .forEach(([k,v]) => box.setAttribute(k,v));
    const t1 = document.createElementNS(SVG_NS, 'text');
    Object.entries({ x:'435', y:'144', 'text-anchor':'middle',
      fill:'var(--text-muted)', 'font-family':'var(--font-body)', 'font-size':'12' })
      .forEach(([k,v]) => t1.setAttribute(k,v));
    t1.textContent = 'EFFECT';
    const t2 = document.createElementNS(SVG_NS, 'text');
    Object.entries({ x:'235', y:'210', 'text-anchor':'middle',
      fill:'var(--text-muted)', 'font-family':'var(--font-body)', 'font-size':'13' })
      .forEach(([k,v]) => t2.setAttribute(k,v));
    t2.textContent = 'Tulis problem statement, lalu klik Render Diagram.';
    g.append(line, box, t1, t2);
    svg.appendChild(g);
  }
}
window.showEmptyState = showEmptyState;

// Toggle a tool's chart area vs. its empty-state placeholder (Chart.js tools)
function toggleEmpty(tool, showEmptyPlaceholder) {
  const area  = document.getElementById(tool === 'controlchart' ? 'cc-chart-area' : 'hist-chart-area');
  const empty = document.getElementById('empty-state-' + tool);
  if (area)  area.classList.toggle('hidden', !!showEmptyPlaceholder);
  if (empty) empty.classList.toggle('hidden', !showEmptyPlaceholder);
}
window.toggleEmpty = toggleEmpty;

/* ---------- clearState ---------- */
function clearState() {
  AppState.flowchart.nodes     = [];
  AppState.flowchart.edges     = [];
  AppState.flowchart.direction = 'TD';
  AppState.flowchart.scale     = 1;
  AppState.flowchart.viewBox   = { x: 0, y: 0, w: 800, h: 600 };
  AppState.pareto.title        = '';
  AppState.pareto.threshold    = 80;
  AppState.pareto.unit         = '';
  AppState.pareto.yLabel       = '';
  AppState.pareto.rows         = [];
  AppState.controlChart.title  = '';
  AppState.controlChart.type   = 'imr';
  AppState.controlChart.sigma  = 3;
  AppState.controlChart.subgroupSize = 2;
  AppState.controlChart.unit   = '';
  AppState.controlChart.rows   = [];
  AppState.histogram.title     = '';
  AppState.histogram.binMethod = 'sturges';
  AppState.histogram.binCount  = 10;
  AppState.histogram.lsl       = null;
  AppState.histogram.usl       = null;
  AppState.histogram.showNormal= false;
  AppState.histogram.unit      = '';
  AppState.histogram.freqTypes = [];
  AppState.histogram.rows      = [];
  AppState.fishbone.effect     = '';
  AppState.fishbone.categories = makeDefaultFishboneCategories();
  AppState.scatter.title          = '';
  AppState.scatter.xLabel         = 'X';
  AppState.scatter.yLabel         = 'Y';
  AppState.scatter.showRegression = true;
  AppState.scatter.showBand       = false;
  AppState.scatter.rows           = [];
  AppState.runChart.title           = '';
  AppState.runChart.xLabel          = 'Urutan';
  AppState.runChart.yLabel          = 'Nilai';
  AppState.runChart.showMedian      = true;
  AppState.runChart.showAnnotations = true;
  AppState.runChart.detectTrend     = true;
  AppState.runChart.rows            = [];
  fcSelectedNodes.clear();
  try { localStorage.removeItem('sqt_state_v1'); } catch(e) { /* ignore */ }
  saveState();
}
window.clearState = clearState;

/* ---------- saveState ---------- */
function saveState() {
  try {
    localStorage.setItem('sqt_state_v1', JSON.stringify({
      activeTab: AppState.activeTab,
      flowchart: {
        nodes:    AppState.flowchart.nodes,
        edges:    AppState.flowchart.edges,
        direction:AppState.flowchart.direction,
        scale:    AppState.flowchart.scale,
        viewBox:  AppState.flowchart.viewBox
      },
      pareto: { ...AppState.pareto },
      controlChart: { ...AppState.controlChart },
      histogram: { ...AppState.histogram },
      fishbone: AppState.fishbone,
      scatter: { ...AppState.scatter },
      runChart: { ...AppState.runChart }
    }));
  } catch(e) {
    console.warn('[SQT] saveState gagal:', e);
    if (!window._storageWarnShown) {
      showToast('warning', 'Auto-save tidak tersedia di mode ini');
      window._storageWarnShown = true;
    }
  }
}
window.saveState = saveState;

/* ---------- restoreState ---------- */
function restoreState() {
  try {
    const raw = localStorage.getItem('sqt_state_v1');
    if (!raw) return false;
    const p = JSON.parse(raw);
    if (typeof p !== 'object' || p === null) return false;

    if (p.flowchart) {
      const fc = p.flowchart;
      if (!Array.isArray(fc.nodes))    fc.nodes    = [];
      if (!Array.isArray(fc.edges))    fc.edges    = [];
      if (!['TD','LR'].includes(fc.direction)) fc.direction = 'TD';
      if (typeof fc.scale !== 'number')  fc.scale   = 1;
      if (typeof fc.viewBox !== 'object' || fc.viewBox === null) fc.viewBox = { x:0, y:0, w:800, h:600 };

      const validTypes = ['start','end','process','decision','io','connector'];
      fc.nodes = fc.nodes.filter(n =>
        n && typeof n.id==='string' && typeof n.label==='string' &&
        validTypes.includes(n.type)
      );
      const ids = new Set(fc.nodes.map(n=>n.id));
      fc.edges = fc.edges.filter(e =>
        e && typeof e.id==='string' && ids.has(e.from) && ids.has(e.to)
      );
      Object.assign(AppState.flowchart, fc);
    }

    if (p.pareto) {
      const pr = p.pareto;
      if (!Array.isArray(pr.rows)) pr.rows = [];
      if (typeof pr.threshold !== 'number') pr.threshold = 80;
      pr.threshold = Math.max(1, Math.min(99, pr.threshold));
      pr.rows = pr.rows.filter(r =>
        r && typeof r.id==='string' && typeof r.category==='string' &&
        typeof r.value==='number' && r.value > 0
      );
      Object.assign(AppState.pareto, pr);
    }

    if (p.controlChart) {
      const cc = p.controlChart;
      if (!Array.isArray(cc.rows)) cc.rows = [];
      if (!['imr','xbar'].includes(cc.type)) cc.type = 'imr';
      cc.sigma = Math.max(1, Math.min(4, typeof cc.sigma === 'number' ? cc.sigma : 3));
      cc.subgroupSize = Math.max(2, Math.min(10, typeof cc.subgroupSize === 'number' ? cc.subgroupSize : 2));
      cc.rows = cc.rows.filter(r => r && typeof r.id === 'string' && typeof r.value === 'number');
      Object.assign(AppState.controlChart, cc);
    }

    if (p.histogram) {
      const h = p.histogram;
      if (!Array.isArray(h.rows)) h.rows = [];
      if (!['sturges','fd','manual'].includes(h.binMethod)) h.binMethod = 'sturges';
      h.binCount = Math.max(1, Math.min(50, typeof h.binCount === 'number' ? h.binCount : 10));
      if (typeof h.lsl !== 'number') h.lsl = null;
      if (typeof h.usl !== 'number') h.usl = null;
      h.showNormal = !!h.showNormal;
      // Value may be string OR number (categorical bar chart upgrade).
      h.rows = h.rows.filter(r => r && typeof r.id === 'string' &&
                                  (typeof r.value === 'string' || typeof r.value === 'number'));

      // Multi-type freq upgrade: ensure freqTypes is a sane array,
      // then migrate any legacy scalar r.freq into r.freqs[defaultTypeId].
      if (!Array.isArray(h.freqTypes)) h.freqTypes = [];
      h.freqTypes = h.freqTypes.filter(t => t && typeof t.id === 'string' && typeof t.label === 'string');
      if (h.freqTypes.length === 0) {
        h.freqTypes = [{ id: generateId(), label: 'Frek' }];
      }
      const defaultTypeId = h.freqTypes[0].id;
      h.rows.forEach(r => {
        if (!r.freqs || typeof r.freqs !== 'object') r.freqs = {};
        // Migrate legacy scalar freq into the first (default) type
        if (typeof r.freq === 'number' && !(defaultTypeId in r.freqs)) {
          r.freqs[defaultTypeId] = Math.max(1, parseInt(r.freq, 10) || 1);
        }
        delete r.freq;
        // Sanitize every entry: integer ≥ 0, capped at 999
        Object.keys(r.freqs).forEach(k => {
          const v = parseInt(r.freqs[k], 10);
          r.freqs[k] = isNaN(v) || v < 0 ? 0 : Math.min(999, v);
        });
        // Ensure every type has an entry (default 0)
        h.freqTypes.forEach(t => {
          if (!(t.id in r.freqs)) r.freqs[t.id] = 0;
        });
      });

      Object.assign(AppState.histogram, h);
    }

    if (p.fishbone) {
      const fb = p.fishbone;
      if (typeof fb.effect !== 'string') fb.effect = '';
      if (!Array.isArray(fb.categories)) fb.categories = makeDefaultFishboneCategories();
      fb.categories = fb.categories.filter(c =>
        c && typeof c.id === 'string' && typeof c.label === 'string'
      );
      fb.categories.forEach(c => {
        c.active = c.active !== false;
        if (!Array.isArray(c.causes)) c.causes = [];
        c.causes = c.causes.filter(ca => ca && typeof ca.text === 'string');
        c.causes.forEach(ca => {
          if (typeof ca.id !== 'string') ca.id = generateId();
          if (!Array.isArray(ca.subCauses)) ca.subCauses = [];
          ca.subCauses = ca.subCauses.filter(s => s && typeof s.text === 'string');
          ca.subCauses.forEach(s => { if (typeof s.id !== 'string') s.id = generateId(); });
        });
      });
      if (fb.categories.length === 0) fb.categories = makeDefaultFishboneCategories();
      Object.assign(AppState.fishbone, fb);
    }

    if (p.scatter) {
      const sc = p.scatter;
      if (!Array.isArray(sc.rows)) sc.rows = [];
      if (typeof sc.xLabel !== 'string') sc.xLabel = 'X';
      if (typeof sc.yLabel !== 'string') sc.yLabel = 'Y';
      if (typeof sc.showRegression !== 'boolean')        sc.showRegression        = true;
      if (typeof sc.showBand !== 'boolean')              sc.showBand              = false;
      if (typeof sc.showInverseRegression !== 'boolean') sc.showInverseRegression = false;
      sc.rows = sc.rows.filter(r => r && typeof r.id === 'string' &&
                                    typeof r.x === 'number' && typeof r.y === 'number');
      sc.rows.forEach(r => { if (typeof r.label !== 'string') r.label = ''; });
      Object.assign(AppState.scatter, sc);
    }

    if (p.runChart) {
      const rc = p.runChart;
      if (!Array.isArray(rc.rows)) rc.rows = [];
      if (typeof rc.xLabel !== 'string') rc.xLabel = 'Urutan';
      if (typeof rc.yLabel !== 'string') rc.yLabel = 'Nilai';
      if (typeof rc.showMedian      !== 'boolean') rc.showMedian      = true;
      if (typeof rc.showAnnotations !== 'boolean') rc.showAnnotations = true;
      if (typeof rc.detectTrend     !== 'boolean') rc.detectTrend     = true;
      rc.rows = rc.rows.filter(r => r && typeof r.id === 'string' && typeof r.value === 'number');
      rc.rows.forEach(r => { if (typeof r.label !== 'string') r.label = ''; });
      Object.assign(AppState.runChart, rc);
    }

    if (typeof p.activeTab === 'string' &&
        ['flowchart','pareto','controlchart','histogram','fishbone','scatter','runchart'].includes(p.activeTab)) {
      AppState.activeTab = p.activeTab;
    }
    fcSelectedNodes = new Set();
    window.fcSelectedNodes = fcSelectedNodes;

    const ccValid   = AppState.controlChart.rows.some(r => typeof r.value === 'number' && !isNaN(r.value));
    const histValid = AppState.histogram.rows.some(r => {
      if (r.value === null || r.value === undefined) return false;
      if (typeof r.value === 'number') return !isNaN(r.value);
      return String(r.value).trim() !== '';
    });
    const fbHasData = (AppState.fishbone.effect && AppState.fishbone.effect.trim() !== '') ||
                      AppState.fishbone.categories.some(c =>
                        (c.causes || []).some(ca => ca.text && ca.text.trim() !== ''));
    const scValid = AppState.scatter.rows.some(r =>
      typeof r.x === 'number' && !isNaN(r.x) &&
      typeof r.y === 'number' && !isNaN(r.y));
    const rcValid = AppState.runChart.rows.some(r =>
      typeof r.value === 'number' && !isNaN(r.value));
    return AppState.flowchart.nodes.length > 0 ||
           AppState.pareto.rows.length > 0 ||
           ccValid || histValid || fbHasData ||
           scValid || rcValid;
  } catch(e) {
    console.warn('[SQT] restoreState gagal:', e);
    return false;
  }
}
window.restoreState = restoreState;

/* ---------- getScatterOptions (§5.3-EXT2) ---------- */
function getScatterOptions() {
  const titleEl = document.getElementById('sc-title');
  const xLblEl  = document.getElementById('sc-xlabel');
  const yLblEl  = document.getElementById('sc-ylabel');
  const regEl   = document.getElementById('sc-show-regression');
  const bandEl  = document.getElementById('sc-show-band');
  const regXYEl = document.getElementById('scatter-reg-xy');
  return {
    title:                sanitizeText(titleEl?.value || '') || 'Scatter Diagram',
    xLabel:               sanitizeText(xLblEl?.value || '')  || 'X',
    yLabel:               sanitizeText(yLblEl?.value || '')  || 'Y',
    showRegression:       regEl   ? !!regEl.checked   : true,
    showBand:             bandEl  ? !!bandEl.checked  : false,
    showInverseRegression: regXYEl ? !!regXYEl.checked : false
  };
}
window.getScatterOptions = getScatterOptions;

/* ---------- getRunChartOptions (§5.3-EXT2) ---------- */
function getRunChartOptions() {
  const titleEl = document.getElementById('rc-title');
  const xLblEl  = document.getElementById('rc-xlabel');
  const yLblEl  = document.getElementById('rc-ylabel');
  const medEl   = document.getElementById('rc-show-median');
  const annoEl  = document.getElementById('rc-show-annotations');
  const trEl    = document.getElementById('rc-detect-trend');
  return {
    title:           sanitizeText(titleEl?.value || '') || 'Run Chart',
    xLabel:          sanitizeText(xLblEl?.value || '')  || 'Urutan',
    yLabel:          sanitizeText(yLblEl?.value || '')  || 'Nilai',
    showMedian:      medEl  ? !!medEl.checked  : true,
    showAnnotations: annoEl ? !!annoEl.checked : true,
    detectTrend:     trEl   ? !!trEl.checked   : true
  };
}
window.getRunChartOptions = getRunChartOptions;

/* ---------- getOptionsFromUI ---------- */
function getOptionsFromUI() {
  const titleEl     = document.getElementById('pareto-title');
  const thresholdEl = document.getElementById('pareto-threshold');
  const unitEl      = document.getElementById('pareto-unit');
  const yLabelEl    = document.getElementById('pareto-ylabel');
  const rawTh = parseInt(thresholdEl?.value, 10);
  return {
    title     : sanitizeText(titleEl?.value || '') || 'Pareto Chart',
    threshold : (!isNaN(rawTh) && rawTh >= 1 && rawTh <= 99) ? rawTh : AppState.pareto.threshold,
    unitLabel : sanitizeText(unitEl?.value || ''),
    yAxisLabel: sanitizeText(yLabelEl?.value || '')
  };
}
window.getOptionsFromUI = getOptionsFromUI;

/* ---------- populateInputTable ---------- */
function populateInputTable(rows) {
  const tbody = document.getElementById('pareto-rows-container');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (rows.length === 0) {
    if (typeof window.addRowToDOM === 'function') {
      window.addRowToDOM(generateId(), '', '');
      window.addRowToDOM(generateId(), '', '');
    }
  } else {
    rows.forEach(row => {
      if (typeof window.addRowToDOM === 'function') {
        window.addRowToDOM(row.id, row.category, row.value);
      }
    });
  }
}
window.populateInputTable = populateInputTable;

/* ---------- renderActiveTab ---------- */
function renderActiveTab() {
  const tab = AppState.activeTab;
  if (tab === 'flowchart') {
    const { nodes, edges, direction } = AppState.flowchart;
    if (nodes.length >= 2) {
      if (typeof window.renderFlowchart === 'function') {
        window.renderFlowchart(nodes, edges, direction);
      }
    } else {
      showEmptyState('flowchart');
    }
  } else if (tab === 'pareto') {
    const { rows } = AppState.pareto;
    if (rows.length >= 2) {
      if (typeof window.renderParetoChart === 'function') {
        window.renderParetoChart(rows, getOptionsFromUI());
      }
    } else {
      showEmptyState('pareto');
    }
  } else if (tab === 'controlchart') {
    const { rows } = AppState.controlChart;
    const valid = rows.filter(r => typeof r.value === 'number' && !isNaN(r.value));
    if (valid.length >= 8 && typeof window.renderControlChart === 'function') {
      window.renderControlChart(rows, window.getControlChartOptions ? window.getControlChartOptions() : {});
    } else {
      showEmptyState('controlchart');
    }
  } else if (tab === 'histogram') {
    const { rows } = AppState.histogram;
    // A row is valid if its label is non-empty AND at least one freq > 0.
    const validRows = rows.filter(r => {
      if (r.value === null || r.value === undefined) return false;
      const labelOK = typeof r.value === 'number'
        ? !isNaN(r.value)
        : String(r.value).trim() !== '';
      if (!labelOK) return false;
      const totalFreq = Object.values(r.freqs || {}).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
      return totalFreq > 0;
    });
    if (validRows.length >= 2 && typeof window.renderHistogram === 'function') {
      window.renderHistogram(rows, window.getHistogramOptions ? window.getHistogramOptions() : {});
    } else {
      showEmptyState('histogram');
    }
  } else if (tab === 'fishbone') {
    if (AppState.fishbone.effect && AppState.fishbone.effect.trim() !== '' &&
        typeof window.renderFishbone === 'function') {
      window.renderFishbone(AppState.fishbone);
    } else {
      showEmptyState('fishbone');
    }
  } else if (tab === 'scatter') {
    const { rows } = AppState.scatter;
    const validRows = rows.filter(r =>
      typeof r.x === 'number' && !isNaN(r.x) &&
      typeof r.y === 'number' && !isNaN(r.y));
    if (validRows.length >= 5 && typeof window.renderScatter === 'function') {
      window.renderScatter(rows, getScatterOptions());
    } else {
      showEmptyState('scatter');
    }
  } else if (tab === 'runchart') {
    const { rows } = AppState.runChart;
    const validRows = rows.filter(r => typeof r.value === 'number' && !isNaN(r.value));
    if (validRows.length >= 10 && typeof window.renderRunChart === 'function') {
      window.renderRunChart(rows, getRunChartOptions());
    } else {
      showEmptyState('runchart');
    }
  }
}
window.renderActiveTab = renderActiveTab;

/* ---------- showRestorePrompt ---------- */
function showRestorePrompt() {
  const banner = document.getElementById('restore-prompt');
  if (!banner) { renderActiveTab(); return; }
  banner.classList.remove('hidden');
  banner.setAttribute('aria-hidden', 'false');

  document.getElementById('btn-restore-continue').addEventListener('click', () => {
    banner.classList.add('hidden');
    banner.setAttribute('aria-hidden', 'true');
    // Sync UI fields/tables from restored state
    syncParetoFieldsFromState();
    if (AppState.pareto.rows.length > 0) populateInputTable(AppState.pareto.rows);
    syncNewToolUIs();
    renderActiveTab();
  }, { once: true });

  document.getElementById('btn-restore-discard').addEventListener('click', () => {
    banner.classList.add('hidden');
    banner.setAttribute('aria-hidden', 'true');
    clearState();
    syncParetoFieldsFromState();
    populateInputTable([]);
    syncNewToolUIs();
    showEmptyState(AppState.activeTab);
  }, { once: true });
}
window.showRestorePrompt = showRestorePrompt;

// Re-sync the new tools' config fields + input tables from AppState.
// Each engine exposes its own syncUI; guarded so app.js stays decoupled.
function syncNewToolUIs() {
  if (typeof window.ccSyncUI === 'function')   window.ccSyncUI();
  if (typeof window.histSyncUI === 'function') window.histSyncUI();
  if (typeof window.fbSyncUI === 'function')   window.fbSyncUI();
  if (typeof window.scSyncUI === 'function')   window.scSyncUI();
  if (typeof window.rcSyncUI === 'function')   window.rcSyncUI();
}
window.syncNewToolUIs = syncNewToolUIs;

/* ---------- showPasteTextarea ---------- */
function showPasteTextarea() {
  let modal = document.getElementById('modal-paste-fallback');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-paste-fallback';
    modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
      <div class="modal-box">
        <h3>Tempel Data Manual</h3>
        <p>Format: Kategori[tab atau koma]Nilai, satu baris per entri</p>
        <textarea id="paste-textarea" rows="8"
          placeholder="Kategori A&#9;45&#10;Kategori B&#9;30"></textarea>
        <div class="modal-actions">
          <button id="btn-paste-cancel" class="btn-secondary">Batal</button>
          <button id="btn-paste-submit" class="btn-primary">Import</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');

  document.getElementById('btn-paste-cancel').onclick = () => modal.classList.add('hidden');
  document.getElementById('btn-paste-submit').onclick = () => {
    const text = document.getElementById('paste-textarea').value;
    if (!text.trim()) { showToast('warning', 'Textarea kosong'); return; }
    const withHeader = 'Kategori,Nilai\n' + text;
    const data = window.parseDelimited ? window.parseDelimited(withHeader) : [];
    if (data.length >= 2) {
      AppState.pareto.rows = data;
      populateInputTable(data);
      if (typeof window.renderParetoChart === 'function') {
        window.renderParetoChart(data, getOptionsFromUI());
      }
      saveState();
      showToast('success', `${data.length} baris berhasil di-paste`);
      modal.classList.add('hidden');
    } else {
      showToast('warning', 'Data tidak cukup — butuh minimal 2 baris valid');
    }
  };
}
window.showPasteTextarea = showPasteTextarea;

/* ---------- syncParetoFieldsFromState (helper for restore) ---------- */
function syncParetoFieldsFromState() {
  const titleEl     = document.getElementById('pareto-title');
  const thresholdEl = document.getElementById('pareto-threshold');
  const unitEl      = document.getElementById('pareto-unit');
  const yLabelEl    = document.getElementById('pareto-ylabel');
  if (titleEl)     titleEl.value     = AppState.pareto.title || '';
  if (thresholdEl) thresholdEl.value = AppState.pareto.threshold || 80;
  if (unitEl)      unitEl.value       = AppState.pareto.unit || '';
  if (yLabelEl)    yLabelEl.value      = AppState.pareto.yLabel || '';
}
window.syncParetoFieldsFromState = syncParetoFieldsFromState;

/* ============================================================
   Tab router
   ============================================================ */
const TAB_IDS = ['flowchart', 'pareto', 'controlchart', 'histogram', 'fishbone', 'scatter', 'runchart'];

function initTabs() {
  TAB_IDS.forEach(t => {
    const btn = document.getElementById('tab-' + t);
    if (btn) btn.addEventListener('click', () => switchTab(t));
  });
  applyTabVisual(AppState.activeTab);
}

function applyTabVisual(tab) {
  TAB_IDS.forEach(t => {
    const btn = document.getElementById('tab-' + t);
    const panel = document.getElementById('panel-' + t);
    const isActive = t === tab;
    if (panel) panel.classList.toggle('hidden', !isActive);
    if (btn) {
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  });
}

function switchTab(newTab) {
  if (newTab === AppState.activeTab) return;
  AppState.activeTab = newTab;
  applyTabVisual(newTab);
  saveState();
  renderActiveTab();
}
window.switchTab = switchTab;

/* ---------- Navbar links → switchTab (BUG 2 fix) ----------
   Maps the right-side navbar anchors to switchTab() and scrolls the
   tab bar into view. Uses addEventListener (no inline onclick). */
const NAV_LINK_MAP = {
  '#tab-flowchart':    'flowchart',
  '#tab-pareto':       'pareto',
  '#tab-controlchart': 'controlchart',
  '#tab-histogram':    'histogram',
  '#tab-fishbone':     'fishbone',
  '#tab-scatter':      'scatter',
  '#tab-runchart':     'runchart'
};

function initNavbarLinks() {
  const links = document.querySelectorAll('.navbar-links a');
  links.forEach(a => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href') || '';
      if (href in NAV_LINK_MAP) {
        e.preventDefault();
        switchTab(NAV_LINK_MAP[href]);
        // The inner .tabs bar is hidden — scroll to the active tool
        // panel instead so the user sees the workspace.
        const activePanel = document.getElementById('panel-' + NAV_LINK_MAP[href])
                          || document.querySelector('.app-main');
        if (activePanel) activePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

/* ============================================================
   Inline tool-guide modal — info ℹ button in each panel header
   opens a per-tool quick reference. Single modal element reused.
   ============================================================ */
const TOOL_GUIDES = {
  flowchart: {
    title: '⬡ Flowchart',
    fields: [
      { name: 'Label Step',
        desc: 'Nama atau deskripsi langkah proses. Contoh: "Periksa Kualitas", "Terima Order".' },
      { name: 'Tipe Node',
        desc: 'Start/End = titik awal/akhir proses. Process = langkah kerja. Decision = percabangan Ya/Tidak. Input/Output = data masuk/keluar.' },
      { name: 'Warna',
        desc: 'Warna latar node untuk membedakan kategori langkah secara visual.' },
      { name: 'Dari & Ke',
        desc: 'Pilih dua node yang ingin dihubungkan dengan panah. Dari = asal, Ke = tujuan alur.' },
      { name: 'Label Koneksi',
        desc: 'Teks pada panah penghubung. Isi "Ya" atau "Tidak" untuk node Decision.' }
    ],
    tips: 'Selalu mulai dengan node Start dan akhiri dengan End agar diagram valid.'
  },

  pareto: {
    title: '📊 Pareto Chart',
    fields: [
      { name: 'Judul Chart',
        desc: 'Nama chart yang akan tampil di bagian atas grafik. Contoh: "Cacat Produksi Baju Juli 2024".' },
      { name: 'Threshold %',
        desc: 'Batas persentase kumulatif untuk menentukan "Vital Few". Default 80 berarti kategori yang membentuk 80% masalah akan disorot merah.' },
      { name: 'Unit',
        desc: 'Satuan frekuensi data. Contoh: "kasus", "unit", "kejadian", "pcs".' },
      { name: 'Label Sumbu Y',
        desc: 'Nama sumbu vertikal kiri. Contoh: "Jumlah Cacat", "Frekuensi Kejadian".' },
      { name: 'Kategori',
        desc: 'Nama jenis cacat atau masalah. Contoh: "Jahitan Lepas", "Warna Pudar", "Ukuran Salah".' },
      { name: 'Frekuensi',
        desc: 'Jumlah kejadian untuk kategori tersebut. Harus angka positif.' }
    ],
    tips: 'Minimal 3 kategori. Sistem akan otomatis mengurutkan dari frekuensi terbesar.'
  },

  controlchart: {
    title: '📈 Control Chart',
    fields: [
      { name: 'Judul Chart',
        desc: 'Nama proses yang dimonitor. Contoh: "Berat Kemasan Line 3".' },
      { name: 'Tipe',
        desc: 'I-MR = untuk 1 pengukuran per waktu (paling umum). X̄-R = untuk rata-rata beberapa pengukuran per waktu (subgroup).' },
      { name: 'Sigma (σ)',
        desc: 'Multiplier batas kendali. Default 3 = standar industri (99.73% data normal masuk kendali). Jangan ubah kecuali ada kebutuhan khusus.' },
      { name: 'Subgroup n',
        desc: 'Jumlah pengukuran per subgroup. Hanya aktif untuk tipe X̄-R. Contoh: 5 berarti setiap titik adalah rata-rata 5 pengukuran.' },
      { name: 'Unit',
        desc: 'Satuan pengukuran. Contoh: "mm", "gram", "menit", "°C".' },
      { name: 'Nilai',
        desc: 'Data pengukuran berurutan dari waktu ke waktu. Minimal 8 nilai. Contoh: berat produk per jam produksi.' }
    ],
    tips: 'Urutan data sangat penting — masukkan sesuai urutan waktu pengambilan data.'
  },

  histogram: {
    title: '📉 Histogram',
    fields: [
      { name: 'Judul Chart',
        desc: 'Nama data yang dianalisis. Contoh: "Distribusi Berat Produk Minggu 1".' },
      { name: 'Method Bin',
        desc: 'Cara menentukan lebar kelas. Sturges = otomatis cocok untuk data <200. Freedman-Diaconis = lebih akurat untuk data banyak. Manual = kamu tentukan sendiri.' },
      { name: 'Jumlah Bin',
        desc: 'Aktif jika Method = Manual. Jumlah kelas/kolom histogram. Rekomendasi: 5–20 bin.' },
      { name: 'LSL (Lower Spec Limit)',
        desc: 'Batas spesifikasi bawah dari pelanggan/standar. Contoh: berat minimum produk = 95 gram. Kosongkan jika tidak ada spesifikasi.' },
      { name: 'USL (Upper Spec Limit)',
        desc: 'Batas spesifikasi atas. Contoh: berat maksimum = 105 gram. LSL dan USL dibutuhkan untuk menghitung Cp dan Cpk.' },
      { name: 'Unit',
        desc: 'Satuan data. Contoh: "gram", "mm", "detik".' },
      { name: 'Kurva Normal',
        desc: 'Centang untuk menampilkan kurva distribusi normal di atas histogram sebagai referensi.' },
      { name: 'Nilai',
        desc: 'Data pengukuran individual. Minimal 5 nilai. Contoh: berat setiap produk yang disampling.' }
    ],
    tips: 'Isi LSL dan USL untuk mendapatkan nilai Cp dan Cpk. Cpk ≥ 1.33 = proses kapabel.'
  },

  fishbone: {
    title: '🐟 Fishbone Diagram',
    fields: [
      { name: 'Problem Statement',
        desc: 'Masalah utama yang ingin dianalisis — ditulis jelas dan spesifik. Contoh: "Produk Cacat meningkat 15% di Juli 2024". Ini akan menjadi kepala ikan.' },
      { name: 'Kategori 6M',
        desc: 'Pilih kategori yang relevan: Man (faktor manusia), Machine (mesin/alat), Material (bahan baku), Method (prosedur), Measurement (pengukuran), Environment (lingkungan).' },
      { name: 'Causes per Kategori',
        desc: 'Penyebab potensial untuk setiap kategori. Satu baris = satu penyebab. Contoh untuk Man: "Operator kurang terlatih", "Kelelahan shift malam".' }
    ],
    tips: 'Gunakan teknik 5 Why untuk menemukan penyebab di setiap kategori sebelum mengisi.'
  },

  scatter: {
    title: '🔵 Scatter Diagram',
    fields: [
      { name: 'Judul Chart',
        desc: 'Nama hubungan yang dianalisis. Contoh: "Suhu vs Kekuatan Tarik".' },
      { name: 'Label X',
        desc: 'Nama variabel independen (sumbu horizontal). Contoh: "Suhu (°C)", "Kecepatan Mesin (rpm)".' },
      { name: 'Label Y',
        desc: 'Nama variabel dependen (sumbu vertikal). Contoh: "Kekuatan Tarik (N)", "Cacat per Batch".' },
      { name: 'Regresi Y pada X',
        desc: 'Garis regresi yang memprediksi nilai Y dari nilai X (Ŷ = a + bX). Gunakan saat Y adalah variabel yang ingin diprediksi.' },
      { name: 'Conf. Band 95%',
        desc: 'Centang untuk menampilkan area kepercayaan 95% di sekitar garis regresi Y pada X.' },
      { name: 'Regresi X pada Y',
        desc: 'Garis regresi terbalik yang memprediksi X dari Y (X̂ = c + dY). Jika kedua garis hampir berimpit, korelasi sangat kuat.' },
      { name: 'Titik Mean (x̄, ȳ)',
        desc: 'Titik pertemuan rata-rata X dan rata-rata Y. Kedua garis regresi selalu melewati titik ini. Selalu ditampilkan.' },
      { name: 'r (Pearson)',
        desc: 'Koefisien korelasi. Nilai antara -1 dan +1. Mendekati ±1 = korelasi kuat. Mendekati 0 = lemah.' },
      { name: 'R²',
        desc: 'Seberapa besar variasi Y yang bisa dijelaskan oleh X. R² = 0.81 berarti 81% variasi Y dijelaskan oleh X.' },
      { name: 'Persamaan Regresi Y pada X',
        desc: 'Formula Ŷ = a + bX. Nilai b = kemiringan (setiap X naik 1 satuan, Y naik b satuan). Nilai a = titik potong sumbu Y.' },
      { name: 'Persamaan Regresi X pada Y',
        desc: 'Formula X̂ = c + dY. Nilai d = kemiringan terbalik. Kedua persamaan bertemu di titik mean (x̄, ȳ).' },
      { name: 'X & Y (data)',
        desc: 'Pasangan nilai pengukuran. X = variabel sebab, Y = variabel akibat. Minimal 5 pasang.' }
    ],
    tips: 'Korelasi kuat jika titik membentuk pola garis lurus. Korelasi lemah jika titik menyebar acak.'
  },

  runchart: {
    title: '📏 Run Chart',
    fields: [
      { name: 'Judul Chart',
        desc: 'Nama proses yang dipantau. Contoh: "Waktu Siklus Produksi Minggu 3".' },
      { name: 'Label X',
        desc: 'Nama sumbu waktu. Contoh: "Jam ke-", "Hari", "Shift".' },
      { name: 'Label Y',
        desc: 'Nama nilai yang diukur. Contoh: "Waktu (menit)", "Jumlah Unit".' },
      { name: 'Median',
        desc: 'Centang untuk menampilkan garis median sebagai referensi tengah data.' },
      { name: 'Anotasi',
        desc: 'Centang untuk menampilkan penanda run di atas/bawah median.' },
      { name: 'Trend',
        desc: 'Centang untuk menampilkan garis tren linear pada data.' },
      { name: 'Label/Waktu',
        desc: 'Label untuk setiap titik data. Contoh: "Shift 1", "08:00", "Hari 1". Boleh dikosongkan.' },
      { name: 'Nilai',
        desc: 'Nilai pengukuran berurutan sesuai waktu. Minimal 10 nilai untuk analisis run yang valid.' }
    ],
    tips: '6 atau lebih titik naik/turun berturut-turut = indikasi tren. Perlu investigasi penyebab.'
  }
};

function showToolGuide(toolName) {
  const g = TOOL_GUIDES[toolName];
  const modal = document.getElementById('tool-guide-modal');
  if (!g || !modal) return;
  modal.querySelector('h3').textContent = g.title;

  // Build the per-field list via DOM API (no innerHTML — guide data is
  // hard-coded but the discipline keeps the codebase safe by default).
  const body = modal.querySelector('.guide-body');
  body.innerHTML = '';
  g.fields.forEach(f => {
    const row = document.createElement('div');
    row.className = 'guide-field';
    const name = document.createElement('span');
    name.className = 'guide-field-name';
    name.textContent = f.name;
    const desc = document.createElement('span');
    desc.className = 'guide-field-desc';
    desc.textContent = f.desc;
    row.append(name, desc);
    body.appendChild(row);
  });

  modal.querySelector('.guide-tips').textContent = '💡 ' + g.tips;
  modal.classList.remove('hidden');
  modal.querySelector('.btn-close-guide')?.focus();
}
window.showToolGuide = showToolGuide;

function closeToolGuide() {
  document.getElementById('tool-guide-modal')?.classList.add('hidden');
}
window.closeToolGuide = closeToolGuide;

function initToolGuide() {
  document.querySelectorAll('.btn-info-tool').forEach(btn => {
    btn.addEventListener('click', () => showToolGuide(btn.dataset.tool));
  });
  const modal = document.getElementById('tool-guide-modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.classList.contains('btn-close-guide')) {
        closeToolGuide();
      }
    });
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeToolGuide();
  });
}

/* ============================================================
   Global error handlers (§0.7 Level 3)
   ============================================================ */
function initGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    console.error('[SQT Error]', event.error);
    showToast('error', `Error tak terduga: ${event.message}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[SQT Promise]', event.reason);
    showToast('error', 'Operasi async gagal — coba lagi');
    event.preventDefault();
  });
}

/* ============================================================
   Lifecycle — DOMContentLoaded (§5.5 critical order)
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const hasData = restoreState();
  applyTabVisual(AppState.activeTab);
  initTabs();
  initNavbarLinks();

  if (typeof window.initFlowchart === 'function')    window.initFlowchart();
  if (typeof window.initPareto === 'function')       window.initPareto();
  if (typeof window.initControlChart === 'function') window.initControlChart();
  if (typeof window.initHistogram === 'function')    window.initHistogram();
  if (typeof window.initFishbone === 'function')     window.initFishbone();
  if (typeof window.initScatter === 'function')      window.initScatter();
  if (typeof window.initRunChart === 'function')     window.initRunChart();

  initToolGuide();
  initGlobalErrorHandlers();

  // Sync pareto UI from restored state regardless
  syncParetoFieldsFromState();

  if (hasData) {
    showRestorePrompt();
  } else {
    populateInputTable(AppState.pareto.rows);
    showEmptyState(AppState.activeTab);
  }
});
