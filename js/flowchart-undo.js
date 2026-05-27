/* ============================================================
   flowchart-undo.js — UndoManager (standalone)
   Loaded AFTER app.js, BEFORE flowchart.js.
   Calls renderFlowchart()/fitToScreen() which flowchart.js
   registers onto window during initFlowchart().
   ============================================================ */

const UndoManager = {
  history: [],
  future: [],
  maxSize: 30,

  reset() {
    this.history = [];
    this.future = [];
    // Seed with current state so first undo has a baseline.
    this.history.push(this._cloneState());
    this.updateButtons();
  },

  _cloneState() {
    return JSON.parse(JSON.stringify({
      nodes:     AppState.flowchart.nodes,
      edges:     AppState.flowchart.edges,
      direction: AppState.flowchart.direction,
      scale:     AppState.flowchart.scale,
      viewBox:   AppState.flowchart.viewBox,
      selected:  []
    }));
  },

  snapshot() {
    const s = this._cloneState();
    this.history.push(s);
    this.future = [];
    if (this.history.length > this.maxSize) this.history.shift();
    this.updateButtons();
  },

  undo() {
    if (this.history.length < 2) return;
    this.future.push(this.history.pop());
    const r = JSON.parse(JSON.stringify(this.history[this.history.length - 1]));
    delete r.selected;
    Object.assign(AppState.flowchart, r);
    window.fcSelectedNodes.clear();
    if (typeof window.renderFlowchart === 'function') {
      window.renderFlowchart(AppState.flowchart.nodes, AppState.flowchart.edges,
                             AppState.flowchart.direction);
    }
    if (typeof window.fitToScreen === 'function') window.fitToScreen();
    saveState();
    this.updateButtons();
  },

  redo() {
    if (this.future.length === 0) return;
    const s = this.future.pop();
    this.history.push(s);
    const r = JSON.parse(JSON.stringify(s));
    delete r.selected;
    Object.assign(AppState.flowchart, r);
    window.fcSelectedNodes.clear();
    if (typeof window.renderFlowchart === 'function') {
      window.renderFlowchart(AppState.flowchart.nodes, AppState.flowchart.edges,
                             AppState.flowchart.direction);
    }
    if (typeof window.fitToScreen === 'function') window.fitToScreen();
    saveState();
    this.updateButtons();
  },

  updateButtons() {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) u.disabled = this.history.length < 2;
    if (r) r.disabled = this.future.length === 0;
  }
};

window.UndoManager = UndoManager;
