/* ============================================================
   test.js — Phase 1-3 checkpoint verification
   Run with:  node test.js
   Loads the real js/app.js + js/pareto.js into a vm sandbox
   with minimal DOM / localStorage stubs, then asserts behavior
   against the spec (§5.4 DOM registry, §5.3 state, §5.8 cases).
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- tiny assertion harness ---------- */
let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; fails.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected) || actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

/* ============================================================
   Build a browser-like sandbox
   ============================================================ */
function makeEl() {
  const el = {
    innerHTML: '', className: '', textContent: '', value: '',
    style: { setProperty() {}, getPropertyValue() { return ''; }, cssText: '' },
    dataset: {}, children: [], firstChild: null, lastElementChild: null,
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    setAttribute() {}, getAttribute() { return null; },
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); },
    removeChild() {}, insertBefore() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    cloneNode() { return makeEl(); }, focus() {},
    getContext() { return {}; },
    parentNode: { replaceChild() {} }
  };
  return el;
}

const storeBacking = {};
const localStorageStub = {
  getItem: k => (Object.prototype.hasOwnProperty.call(storeBacking, k) ? storeBacking[k] : null),
  setItem: (k, v) => { storeBacking[k] = String(v); },
  removeItem: k => { delete storeBacking[k]; },
  clear: () => { for (const k in storeBacking) delete storeBacking[k]; }
};

// Chart.js mock — captures the last config so we can inspect datasets
class ChartMock {
  constructor(ctx, cfg) { this.config = cfg; sandbox.__lastChartConfig = cfg; }
  destroy() {}
  toBase64Image() { return 'data:image/png;base64,'; }
  static register() {}
}

const documentStub = {
  addEventListener() {},
  getElementById(id) {
    if (id === 'toast-container') return null;     // makes showToast a no-op
    return makeEl();
  },
  createElement() { return makeEl(); },
  createElementNS() { return makeEl(); },
  body: { appendChild() {}, removeChild() {} },
  documentElement: {}
};

const sandbox = {
  console,
  setTimeout, clearTimeout,
  localStorage: localStorageStub,
  document: documentStub,
  navigator: {},
  Chart: ChartMock,
  // getCSSVar returns the var name so vital/useful colors are distinguishable
  getComputedStyle: () => ({ getPropertyValue: (name) => name })
};
sandbox.window = sandbox;          // window.X assignments land on the sandbox itself
vm.createContext(sandbox);

/* ---------- load real source ---------- */
function load(file) {
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  vm.runInContext(src, sandbox, { filename: file });
}
try {
  load('js/app.js');
  load('js/pareto.js');
} catch (e) {
  console.error('FATAL: failed to load source files:', e);
  process.exit(1);
}

const W = sandbox; // shorthand for the window/global

/* ============================================================
   Phase 1.x — DOM IDs present in index.html (§5.4 registry)
   ============================================================ */
section('Phase 1 — DOM ID Registry (index.html)');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const requiredIds = [
  'tab-flowchart', 'tab-pareto', 'panel-flowchart', 'panel-pareto',
  'fc-canvas', 'fc-minimap', 'fc-node-label', 'fc-node-type', 'fc-node-color',
  'fc-edge-from', 'fc-edge-to', 'fc-edge-label',
  'btn-fc-add-node', 'btn-fc-add-edge', 'btn-fc-delete',
  'btn-undo', 'btn-redo', 'btn-fc-fit', 'btn-fc-zoom-in', 'btn-fc-zoom-out',
  'btn-fc-direction', 'btn-fc-minimap', 'btn-fc-export-png', 'btn-fc-export-svg', 'btn-fc-reset',
  'pareto-canvas', 'pareto-rows-container', 'pareto-stats', 'pareto-summary-table',
  'pareto-title', 'pareto-threshold', 'pareto-unit', 'pareto-ylabel',
  'btn-pareto-render', 'btn-pareto-add-row', 'btn-pareto-import-csv', 'btn-pareto-paste',
  'btn-pareto-export-png', 'btn-pareto-export-csv', 'btn-pareto-reset',
  'modal-confirm', 'modal-confirm-msg', 'modal-confirm-ok', 'modal-confirm-cancel',
  'toast-container', 'restore-prompt'
];
for (const id of requiredIds) {
  ok('id="' + id + '" present', html.includes('id="' + id + '"'));
}
// Note: empty-state-flowchart / empty-state-pareto are injected at runtime by
// showEmptyState(), not static markup, so they are intentionally not asserted here.

/* ============================================================
   Phase 1 — window globals + AppState structure (§5.3)
   ============================================================ */
section('Phase 1 — window globals (§0.2)');
const requiredGlobals = [
  'AppState', 'fcSelectedNodes', 'saveState', 'restoreState', 'showToast',
  'triggerDownload', 'generateId', 'getCSSVar', 'showModal', 'closeModal',
  'showEmptyState', 'clearState', 'renderActiveTab', 'getOptionsFromUI',
  'populateInputTable', 'sanitizeText'
];
for (const g of requiredGlobals) {
  ok('window.' + g + ' defined', typeof W[g] !== 'undefined');
}
ok('window.normalizeNumber defined', typeof W.normalizeNumber === 'function');
ok('window.parseDelimited defined', typeof W.parseDelimited === 'function');
ok('window.renderParetoChart defined', typeof W.renderParetoChart === 'function');

section('Phase 1 — AppState structure (§5.3)');
const S = W.AppState;
ok('AppState is object', S && typeof S === 'object');
eq('AppState.activeTab default', S.activeTab, 'flowchart');
ok('flowchart.nodes is array', Array.isArray(S.flowchart.nodes));
ok('flowchart.edges is array', Array.isArray(S.flowchart.edges));
eq('flowchart.direction default', S.flowchart.direction, 'TD');
eq('flowchart.scale default', S.flowchart.scale, 1);
ok('flowchart.viewBox has w/h', S.flowchart.viewBox && S.flowchart.viewBox.w === 800 && S.flowchart.viewBox.h === 600);
eq('pareto.threshold default', S.pareto.threshold, 80);
ok('pareto.rows is array', Array.isArray(S.pareto.rows));
ok('fcSelectedNodes is a Set', W.fcSelectedNodes && W.fcSelectedNodes.constructor && W.fcSelectedNodes.constructor.name === 'Set' && typeof W.fcSelectedNodes.has === 'function');

/* ============================================================
   Phase 1.4 — saveState / restoreState roundtrip (§5.3)
   ============================================================ */
section('Phase 1.4 — saveState / restoreState roundtrip');
localStorageStub.clear();
// Populate with valid data
W.AppState.activeTab = 'pareto';
W.AppState.flowchart.nodes = [
  { id: 'n1', type: 'start', label: 'Mulai' },
  { id: 'n2', type: 'process', label: 'Proses' }
];
W.AppState.flowchart.edges = [{ id: 'e1', from: 'n1', to: 'n2', label: '' }];
W.AppState.flowchart.direction = 'LR';
W.AppState.pareto.threshold = 70;
W.AppState.pareto.rows = [
  { id: 'r1', category: 'A', value: 10 },
  { id: 'r2', category: 'B', value: 5 }
];
W.saveState();
ok('localStorage key written', localStorageStub.getItem('sqt_state_v1') !== null);

// Corrupt in-memory state, then restore from storage
W.AppState.activeTab = 'flowchart';
W.AppState.flowchart.nodes = [];
W.AppState.flowchart.edges = [];
W.AppState.flowchart.direction = 'TD';
W.AppState.pareto.threshold = 80;
W.AppState.pareto.rows = [];

const hasData = W.restoreState();
ok('restoreState returns true when data exists', hasData === true);
eq('activeTab restored', W.AppState.activeTab, 'pareto');
eq('nodes restored count', W.AppState.flowchart.nodes.length, 2);
eq('edges restored count', W.AppState.flowchart.edges.length, 1);
eq('direction restored', W.AppState.flowchart.direction, 'LR');
eq('pareto.threshold restored', W.AppState.pareto.threshold, 70);
eq('pareto.rows restored count', W.AppState.pareto.rows.length, 2);
eq('restored node label intact', W.AppState.flowchart.nodes[0].label, 'Mulai');

// Schema validation: corrupt localStorage should not crash, drops bad rows
localStorageStub.setItem('sqt_state_v1', JSON.stringify({
  activeTab: 'pareto',
  flowchart: { nodes: [{ id: 'x', type: 'BOGUS', label: 'bad' }, { id: 'y', type: 'process', label: 'good' }], edges: [{ id: 'e', from: 'x', to: 'zzz' }] },
  pareto: { threshold: 999, rows: [{ id: 'r', category: 'C', value: -3 }, { id: 's', category: 'D', value: 8 }] }
}));
W.restoreState();
eq('invalid node type filtered out', W.AppState.flowchart.nodes.length, 1);
eq('edge to missing node filtered out', W.AppState.flowchart.edges.length, 0);
ok('threshold clamped to 1-99', W.AppState.pareto.threshold >= 1 && W.AppState.pareto.threshold <= 99);
eq('negative-value row filtered out', W.AppState.pareto.rows.length, 1);

/* ============================================================
   Phase 2 — normalizeNumber edge cases (§5.8 Case C)
   ============================================================ */
section('Phase 2 — normalizeNumber (§5.8 Case C)');
const nn = W.normalizeNumber;
eq('"1234" -> 1234', nn('1234'), 1234);
eq('"1.5" -> 1.5', nn('1.5'), 1.5);
eq('"1.234" -> 1234 (ID thousands)', nn('1.234'), 1234);
eq('"1.234.567" -> 1234567', nn('1.234.567'), 1234567);
eq('"1.234,5" -> 1234.5 (ID decimal)', nn('1.234,5'), 1234.5);
eq('"1,5" -> 1.5', nn('1,5'), 1.5);
eq('"0.5" -> 0.5', nn('0.5'), 0.5);
ok('"abc" -> NaN', Number.isNaN(nn('abc')));
ok('"" -> NaN', Number.isNaN(nn('')));
eq('"-5" -> -5', nn('-5'), -5);

/* ============================================================
   Phase 2.4 — Pareto 2-pass calculation (§5.8 Case B)
   ============================================================ */
section('Phase 2.4 — Pareto 2-pass (§5.8 Case B)');
sandbox.__lastChartConfig = null;
W.paretoChartInstance = null;
const caseB = [
  { id: 'r1', category: 'Cacat Goresan', value: 45 },
  { id: 'r2', category: 'Cacat Warna',   value: 30 },
  { id: 'r3', category: 'Cacat Ukuran',  value: 15 },
  { id: 'r4', category: 'Cacat Kemasan', value: 7 },
  { id: 'r5', category: 'Cacat Lain',    value: 3 }
];
W.renderParetoChart(caseB, { threshold: 80, unitLabel: 'kasus', yAxisLabel: '', title: 'Test' });

const cfg = sandbox.__lastChartConfig;
ok('chart config captured', !!cfg);
if (cfg) {
  const barData  = cfg.data.datasets[0].data;
  const lineData = cfg.data.datasets[1].data;
  const barColors = cfg.data.datasets[0].backgroundColor;
  const vitalColor = '--chart-bar-vital';

  ok('bar values sorted desc', JSON.stringify(barData) === JSON.stringify([45, 30, 15, 7, 3]),
     JSON.stringify(barData));
  ok('cumulative % correct', JSON.stringify(lineData) === JSON.stringify([45, 75, 90, 97, 100]),
     JSON.stringify(lineData));

  const vitalCount = barColors.filter(c => c === vitalColor).length;
  const trivialCount = barColors.length - vitalCount;
  eq('vitalCount = 3', vitalCount, 3);
  eq('trivialCount = 2', trivialCount, 2);

  // crossIdx = first index where cumPct >= threshold
  const crossIdx = lineData.findIndex(v => v >= 80);
  eq('crossIdx = 2', crossIdx, 2);

  // labels order matches sorted categories
  ok('labels in sorted order',
     JSON.stringify(cfg.data.labels) === JSON.stringify(['Cacat Goresan','Cacat Warna','Cacat Ukuran','Cacat Kemasan','Cacat Lain']));
}

// Threshold sensitivity (§ checkpoint 2.8): higher threshold -> more vital
sandbox.__lastChartConfig = null;
W.paretoChartInstance = null;
W.renderParetoChart(caseB, { threshold: 95, unitLabel: '', yAxisLabel: '', title: '' });
if (sandbox.__lastChartConfig) {
  const bc = sandbox.__lastChartConfig.data.datasets[0].backgroundColor;
  const vc = bc.filter(c => c === '--chart-bar-vital').length;
  eq('threshold 95 -> vitalCount = 4', vc, 4);
}

/* ============================================================
   Phase 2.5 — CSV round-trip parse (app-exported format)
   ============================================================ */
section('Phase 2.5 — parseDelimited header detection');
const exportedCsv = 'Rank,Kategori,Nilai,Persen (%),Kumulatif (%),Status\n' +
  '1,"Cacat Goresan",45,45,45,"Vital Few"\n' +
  '2,"Cacat Warna",30,30,75,"Vital Few"';
const parsed = W.parseDelimited(exportedCsv);
eq('app-exported CSV parses 2 rows', parsed.length, 2);
if (parsed.length >= 1) {
  eq('category from "Kategori" column', parsed[0].category, 'Cacat Goresan');
  eq('value from "Nilai" column', parsed[0].value, 45);
}
const plainCsv = 'Kategori,Nilai\nCacat A,45\nCacat B,30';
const parsedPlain = W.parseDelimited(plainCsv);
eq('plain 2-col CSV parses 2 rows', parsedPlain.length, 2);

/* ============================================================
   Summary
   ============================================================ */
console.log('\n' + '='.repeat(48));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('All checkpoints passed.');
  process.exit(0);
}
