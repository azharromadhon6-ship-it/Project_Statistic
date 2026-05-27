# CLAUDE.md — Seven Quality Tools Web App
> Auto-loaded by Claude Code every session. Read this fully before writing any code.

---

## 1. Project Identity

- **App:** Seven Quality Tools Web App (Flowchart Builder + Pareto Chart Generator)
- **Spec file:** `7_Quality_tools_v4.md` — source of truth, DETERMINISTIC (one valid interpretation per instruction)
- **Hosting:** Netlify (static, no backend, no server)
- **Stack:** Pure Vanilla HTML + CSS + JavaScript — ZERO frameworks, ZERO npm packages

---

## 2. Mandatory Reading Order (Before Any Code)

> Follow this exact order every session. Do NOT skip any step.

1. Read `7_Quality_tools_v4.md` §0 — Architecture, lifecycle, state mutation pattern A→B→C→D→E
2. Read `7_Quality_tools_v4.md` §0.8 — Helper Function Registry (14 functions, all must exist in app.js)
3. Read `7_Quality_tools_v4.md` §5.4 — DOM ID Registry (use IDs exactly as listed, never rename)
4. Read `7_Quality_tools_v4.md` §5.6 — 23 Pitfalls (these are guaranteed bugs if ignored)
5. Read `7_Quality_tools_v4.md` §5.7 — Phase Checkpoints (build Phase 1 → 2 → 3 → 4, never skip)

---

## 3. File Structure (Never Deviate)

```
project-root/
├── index.html
├── CLAUDE.md               ← this file
├── 7_Quality_tools_v4.md   ← full spec
├── netlify.toml
├── css/
│   ├── main.css            ← CSS variables, reset, global layout
│   ├── navbar.css          ← Navbar & hero
│   ├── flowchart.css       ← Flowchart-specific styles
│   └── pareto.css          ← Pareto-specific styles
└── js/
    ├── app.js              ← AppState + all §0.8 helpers → exposed to window
    ├── flowchart-undo.js   ← UndoManager → window.UndoManager
    ├── flowchart.js        ← Flowchart engine (depends: app.js + flowchart-undo.js)
    └── pareto.js           ← Pareto engine (depends: app.js + Chart.js CDN)
```

---

## 4. CDN Load Order (CRITICAL — Never Change)

In `index.html`, scripts load at end of `<body>` in this exact order:

```
1. css/main.css
2. css/navbar.css
3. css/flowchart.css
4. css/pareto.css
--- (end of <body>) ---
5. Chart.js v4.4.3          (CDN — MUST be before any plugin)
6. chartjs-plugin-annotation@3.0.1  (CDN — MUST be after Chart.js)
7. chartjs-plugin-datalabels@2.2.0  (CDN — optional, guard before use)
8. js/app.js
9. js/flowchart-undo.js
10. js/flowchart.js
11. js/pareto.js
```

---

## 5. Absolute Rules (Never Violate)

### Architecture
- ❌ No global state except `window.AppState` and `window.fcSelectedNodes`
- ❌ No circular dependency: `app.js` must NOT call any function from `flowchart.js` or `pareto.js`
- ❌ `pareto.js` must NOT call any function from `flowchart.js` (and vice versa)
- ❌ `fcSelectedNodes` (Set) must NEVER be persisted to localStorage
- ✅ All state mutations must follow pattern: Validate → Snapshot → Mutate → Save → Render

### Security
- ✅ Always use `textContent`, never `innerHTML` for user data
- ✅ Always call `sanitizeText()` on every user input before touching the DOM
- ❌ Never use `innerHTML` with user-supplied data (XSS risk — Pitfall #19)

### Functions
- ✅ All 14 helper functions from §0.8 MUST exist in `app.js` and be exposed to `window`
- ❌ Never redefine §0.8 functions in `flowchart.js` or `pareto.js`
- ✅ Guard all CDN plugins before use:
  - `typeof Chart !== 'undefined'`
  - `typeof annotationPlugin !== 'undefined'`
  - `typeof ChartDataLabels !== 'undefined'`

---

## 6. window Globals Required (app.js exports)

```js
window.AppState
window.fcSelectedNodes        // Set — separate from AppState
window.saveState()
window.restoreState()
window.showToast(type, msg, duration?)
window.triggerDownload(url, filename)
window.generateId()
window.getCSSVar(name)
window.showModal(message, onConfirm)
window.closeModal()
window.showEmptyState(tool)
window.clearState()
window.renderActiveTab()
window.getOptionsFromUI()
window.populateInputTable(rows)
window.sanitizeText(str)

// flowchart-undo.js:
window.UndoManager
```

---

## 7. Build Phases (Always Sequential)

### Phase 1 — Foundation (Start Here)
Checklist before moving to Phase 2:
- [ ] 1.1 All CSS `var(--)` resolve in DevTools
- [ ] 1.2 Navbar + Hero renders on mobile & desktop
- [ ] 1.3 Tab router works — AppState.activeTab updates on click
- [ ] 1.4 AppState save/restore — data survives page refresh
- [ ] 1.5 showToast (3 types) + Modal focus-trap working
- [ ] 1.6 `window.onerror` → toast; no uncaught silent errors

### Phase 2 — Pareto Chart
Only start after ALL Phase 1 checkpoints pass.
Key risk: Pitfalls #1 (Chart destroy), #2 (isVital self-reference), #4 (annotationPlugin guard), #14 (normalizeNumber)

### Phase 3 — Flowchart Engine
Only start after ALL Phase 2 checkpoints pass.
Key risk: Pitfalls #3 (SVG overflow), #7 (BFS cycle), #9 (PNG blank), #15 (viewBox undo), #18 (edge layer order)

### Phase 4 — Polish (Optional)
Mini-map, auto-save, restore prompt, mobile responsiveness.

---

## 8. Top 5 Most Critical Pitfalls (from §5.6)

| # | Pitfall | Fix |
|---|---------|-----|
| 7 | BFS infinite loop on cycle | Use `visited_bfs` Set + cycle detection |
| 19 | XSS via innerHTML | Always `textContent` + `sanitizeText()` |
| 18 | Edges hidden behind nodes | `edgeLayer` rendered BELOW `nodeLayer` in SVG |
| 1 | Chart "Canvas already in use" | Call `paretoChartInstance?.destroy()` before re-render |
| 9 | PNG export blank | Call `injectInlineStyles()` before canvas serialize |

Full list of 23 pitfalls: see `7_Quality_tools_v4.md` §5.6

---

## 9. How to Use This Project with Claude Code

### Starting a new phase
```
Read CLAUDE.md and @7_Quality_tools_v4.md §[relevant section].
I am on Phase [N]. All Phase [N-1] checkpoints have passed.
Build [specific task] now.
```

### Debugging a bug
```
Read @7_Quality_tools_v4.md §5.6 pitfalls list.
Bug: [describe symptom]. Which pitfall matches? Apply the fix.
```

### Verifying a completed phase
```
Phase [N] is built. Run through §5.7 Phase [N] checkpoints one by one.
Tell me which pass and which fail.
```

---

## 10. Reference Cases (Quick Sanity Check)

### Pareto — 5 items, threshold 80%
Input totals to 100. Expected `vitalCount = 3`, `trivialCount = 2`.
If all items show `isVital=true` or all `false` → Pitfall #2.

### Flowchart — 3 nodes TD layout
Expected: `svgWidth=600`, `svgHeight=400`, node centers at y=65, y=187, y=309.
If nodes overlap → BFS layout broken.

### normalizeNumber edge case
`"1.234"` → `1234` (Indonesian thousands), NOT `1.234` (US decimal).
If returning wrong value → `normalizeNumber()` 5-pattern logic broken (§5.8 Case C).

---

*Spec version: 4.0 — Production-Grade Edition*
*CLAUDE.md version: 1.0 — optimized for Claude Code session context*
