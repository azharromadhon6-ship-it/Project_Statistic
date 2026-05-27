/* ============================================================
   flowchart.js — Flowchart engine (depends: app.js, flowchart-undo.js)
   Implements §3A FASE 0-10. Registers renderFlowchart/fitToScreen
   onto window so app.js + UndoManager can call them.
   ============================================================ */
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Geometry constants (FASE 0)
  const NODE_W = 160, NODE_H = 50;
  const DIAMOND_W = 160, DIAMOND_H = 80;
  const CIRCLE_R = 20;
  const GAP_X = 48, GAP_Y = 72, PADDING = 40;

  // Module-scoped render state (used by pan/zoom/fit)
  let svgEl = null;
  let svgWidth = 600, svgHeight = 400;
  let scale = 1;
  let viewBox = { x: 0, y: 0, w: 800, h: 600 };
  let nodeMap = {};
  let miniMapVisible = false;
  let isPanning = false, panStart = null;

  const createNS = (tag) => document.createElementNS(SVG_NS, tag);

  function getNodeDim(node) {
    if (node.type === 'decision')  return { w: DIAMOND_W, h: DIAMOND_H };
    if (node.type === 'connector') return { w: CIRCLE_R * 2, h: CIRCLE_R * 2 };
    return { w: NODE_W, h: NODE_H };
  }

  /* ========================================================
     renderFlowchart — main render pipeline
     ======================================================== */
  function renderFlowchart(nodes, edges, direction = 'TD') {
    svgEl = document.getElementById('fc-canvas');
    if (!svgEl) return;

    // PRE-CONDITION
    if (nodes.length < 2) { showEmptyState('flowchart'); return; }

    // FASE 0 — node map
    nodeMap = {};
    nodes.forEach(node => { nodeMap[node.id] = { ...node, ...getNodeDim(node) }; });

    // FASE 1 — cycle detection (DFS)
    const visited = new Set(), recStack = new Set();
    function dfsHasCycle(nodeId) {
      visited.add(nodeId); recStack.add(nodeId);
      for (const edge of edges) {
        if (edge.from !== nodeId) continue;
        const n = edge.to;
        if (!visited.has(n)) { if (dfsHasCycle(n)) return true; }
        else if (recStack.has(n)) return true;
      }
      recStack.delete(nodeId); return false;
    }
    let cycleFound = false;
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfsHasCycle(node.id)) { cycleFound = true; break; }
      }
    }
    if (cycleFound) showToast('warning', 'Diagram mengandung siklus');

    // FASE 2 — orphan check [FIX B16]
    let orphans;
    if (edges.length > 0) {
      const connected = new Set(edges.flatMap(e => [e.from, e.to]));
      orphans = nodes.filter(n => !connected.has(n.id));
    } else {
      orphans = [...nodes];
    }
    if (orphans.length > 0 && nodes.length > 1) {
      showToast('warning', orphans.length + ' node belum terhubung');
    }

    // FASE 3 — BFS layout
    const root = nodes.find(n => n.type === 'start') || nodes[0];
    const levelMap = {}, levelGroups = {}, visited_bfs = new Set();

    function bfsFrom(startId, baseLevel) {
      const queue = [startId];
      levelMap[startId] = baseLevel;
      while (queue.length) {
        const cId = queue.shift();
        if (visited_bfs.has(cId)) continue;
        visited_bfs.add(cId);
        const lv = levelMap[cId];
        levelGroups[lv] = levelGroups[lv] || [];
        levelGroups[lv].push(cId);
        for (const edge of edges) {
          if (edge.from !== cId) continue;
          const childId = edge.to;
          if (!nodeMap[childId]) continue;       // [FIX B12]
          if (!visited_bfs.has(childId)) {
            if (levelMap[childId] === undefined) levelMap[childId] = lv + 1;
            queue.push(childId);
          }
        }
      }
    }
    bfsFrom(root.id, 0);

    // disconnected subgraphs [FIX B11]
    let maxLv = Math.max(...Object.values(levelMap), 0);
    for (const node of nodes) {
      if (!visited_bfs.has(node.id)) { maxLv++; bfsFrom(node.id, maxLv); }
    }

    // 3c. provisional width [FIX B1]
    const maxPerLevel = Math.max(...Object.values(levelGroups).map(g => g.length), 1);
    const provisionalW = Math.max(maxPerLevel * (NODE_W + GAP_X) + PADDING * 2, 600);

    // 3d. assign coordinates
    const levels = Object.keys(levelGroups).map(Number).sort((a, b) => a - b);
    for (const lv of levels) {
      const group = levelGroups[lv];
      const n = group.length;
      group.forEach((nodeId, i) => {
        const nm = nodeMap[nodeId];
        if (direction === 'TD') {
          const totalW = n * NODE_W + (n - 1) * GAP_X;
          const startX = (provisionalW - totalW) / 2;
          nm.x = startX + i * (NODE_W + GAP_X);
          nm.y = PADDING + lv * (NODE_H + GAP_Y);
          if (nm.type === 'decision') nm.y -= (DIAMOND_H - NODE_H) / 2;
        } else {
          const totalH = n * NODE_H + (n - 1) * GAP_Y;
          const startY = (provisionalW - totalH) / 2;
          nm.x = PADDING + lv * (NODE_W + GAP_X);
          nm.y = startY + i * (NODE_H + GAP_Y);
        }
      });
    }

    // 3e. actual bounding box [FIX B1]
    const allX = Object.values(nodeMap).map(n => n.x + getNodeDim(n).w);
    const allY = Object.values(nodeMap).map(n => n.y + getNodeDim(n).h);
    svgWidth  = Math.max(Math.max(...allX) + PADDING, 600);
    svgHeight = Math.max(Math.max(...allY) + PADDING, 400);

    // 3f. center helpers
    for (const id in nodeMap) {
      const nm = nodeMap[id];
      const dim = getNodeDim(nm);
      nm.cx = nm.x + dim.w / 2; nm.cy = nm.y + dim.h / 2;
      nm.top = nm.y; nm.bottom = nm.y + dim.h;
      nm.left = nm.x; nm.right = nm.x + dim.w;
      nm.w = dim.w; nm.h = dim.h;
    }

    // FASE 4 — SVG init + layers [FIX B18]
    svgEl.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
    svgEl.setAttribute('width', svgWidth);
    svgEl.setAttribute('height', svgHeight);
    svgEl.innerHTML = '';

    const defs = createNS('defs');
    defs.appendChild(makeMarker('arrow',     getCSSVar('--text-secondary')));
    defs.appendChild(makeMarker('arrow-yes', getCSSVar('--accent-green')));
    defs.appendChild(makeMarker('arrow-no',  getCSSVar('--accent-red')));
    // shadow filter
    const filter = createNS('filter');
    filter.setAttribute('id', 'node-shadow');
    filter.setAttribute('x', '-20%'); filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%'); filter.setAttribute('height', '140%');
    const fe = createNS('feDropShadow');
    fe.setAttribute('dx', '0'); fe.setAttribute('dy', '2');
    fe.setAttribute('stdDeviation', '3');
    fe.setAttribute('flood-color', '#000'); fe.setAttribute('flood-opacity', '0.35');
    filter.appendChild(fe);
    defs.appendChild(filter);
    svgEl.appendChild(defs);

    const edgeLayer = createNS('g'); edgeLayer.setAttribute('class', 'edge-layer');
    const nodeLayer = createNS('g'); nodeLayer.setAttribute('class', 'node-layer');
    svgEl.appendChild(edgeLayer);   // below
    svgEl.appendChild(nodeLayer);   // above

    // FASE 5 — edges
    renderEdges(edges, direction, edgeLayer);

    // FASE 6 — nodes
    renderNodes(nodes, defs, nodeLayer);

    // FASE 7 — event listeners (selection)
    attachNodeSelection(nodeLayer);

    // sync module viewBox from AppState if present
    const vb = AppState.flowchart.viewBox;
    if (vb && typeof vb.w === 'number') { viewBox = { ...vb }; }
    else { viewBox = { x: 0, y: 0, w: svgWidth, h: svgHeight }; }
    scale = AppState.flowchart.scale || 1;

    if (miniMapVisible) updateMiniMap();
  }

  function makeMarker(id, color) {
    const m = createNS('marker');
    m.setAttribute('id', id);
    m.setAttribute('viewBox', '0 0 10 10');
    m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
    m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7');
    m.setAttribute('orient', 'auto-start-reverse');
    const path = createNS('path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', color);
    m.appendChild(path);
    return m;
  }

  /* ---------- FASE 5: edge renderer ---------- */
  function renderEdges(edges, direction, edgeLayer) {
    for (const edge of edges) {
      const from = nodeMap[edge.from], to = nodeMap[edge.to];
      if (!from || !to) continue;

      let start, end;
      if (direction === 'TD') {
        start = { x: from.cx, y: from.bottom }; end = { x: to.cx, y: to.top };
        if (from.type === 'decision') {
          const isYes = ['Yes','ya','Y'].includes(edge.label);
          const isNo  = ['No','tidak','N'].includes(edge.label);
          if (isYes) { start = { x: from.right, y: from.cy }; end = { x: to.cx, y: to.top }; }
          if (isNo)  { start = { x: from.left,  y: from.cy }; end = { x: to.cx, y: to.top }; }
        }
      } else {
        start = { x: from.right, y: from.cy }; end = { x: to.left, y: to.cy };
        if (from.type === 'decision') {
          const isYes = ['Yes','ya','Y'].includes(edge.label);
          const isNo  = ['No','tidak','N'].includes(edge.label);
          if (isYes) { start = { x: from.cx, y: from.bottom }; end = { x: to.left, y: to.cy }; }
          if (isNo)  { start = { x: from.cx, y: from.top };    end = { x: to.left, y: to.cy }; }
        }
      }

      const dx = end.x - start.x, dy = end.y - start.y;
      let d;
      if (Math.abs(dx) < 2) {
        d = 'M ' + start.x + ' ' + start.y + ' L ' + end.x + ' ' + end.y;
      } else {
        const mid = start.y + dy * 0.5;
        d = 'M ' + start.x + ' ' + start.y +
            ' L ' + start.x + ' ' + mid +
            ' L ' + end.x + ' ' + mid +
            ' L ' + end.x + ' ' + end.y;
      }

      const edgeLen = Math.sqrt(dx * dx + dy * dy) + 100;   // [FIX B9]
      const marker = edge.label === 'Yes' ? 'arrow-yes'
                   : edge.label === 'No'  ? 'arrow-no' : 'arrow';

      const path = createNS('path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', getCSSVar('--text-muted'));
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-dasharray', String(edgeLen));
      // Resting state is visible (dashoffset 0). The draw-in animation runs
      // from --edge-len → 0 via CSS, so edges stay solid even if it never plays.
      path.setAttribute('stroke-dashoffset', '0');
      path.style.setProperty('--edge-len', String(edgeLen));
      path.setAttribute('marker-end', 'url(#' + marker + ')');
      path.classList.add('fc-edge');
      edgeLayer.appendChild(path);

      if (edge.label) {
        const lbl = createNS('text');
        lbl.setAttribute('x', (start.x + end.x) / 2);
        lbl.setAttribute('y', (start.y + end.y) / 2 - 6);
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('font-size', '11');
        lbl.setAttribute('fill', edge.label === 'Yes' ? getCSSVar('--accent-green')
                               : edge.label === 'No'  ? getCSSVar('--accent-red')
                               : getCSSVar('--text-secondary'));
        lbl.textContent = sanitizeText(edge.label);   // [FIX B19]
        edgeLayer.appendChild(lbl);
      }
    }
  }

  /* ---------- FASE 6: node renderer ---------- */
  function wordWrap(text, maxChars = 18) {
    const words = String(text).split(' ');
    const lines = []; let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length <= maxChars) {
        cur = (cur + ' ' + w).trim();
      } else {
        if (cur) lines.push(cur);
        if (w.length > maxChars) { lines.push(w.slice(0, maxChars - 1) + '…'); cur = ''; }
        else cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function renderNodes(nodes, defs, nodeLayer) {
    for (const node of nodes) {
      const nm = nodeMap[node.id];
      const g = createNS('g');
      g.setAttribute('class', 'fc-node');
      g.setAttribute('data-node-id', node.id);
      g.style.cursor = 'pointer';

      let el;
      switch (node.type) {
        case 'start':
          el = createNS('ellipse');
          el.setAttribute('cx', nm.cx); el.setAttribute('cy', nm.cy);
          el.setAttribute('rx', NODE_W / 2); el.setAttribute('ry', NODE_H / 2);
          el.setAttribute('fill', node.color || getCSSVar('--accent-green'));
          el.setAttribute('filter', 'url(#node-shadow)');
          g.appendChild(el);
          break;
        case 'end': {
          el = createNS('ellipse');
          el.setAttribute('cx', nm.cx); el.setAttribute('cy', nm.cy);
          el.setAttribute('rx', NODE_W / 2); el.setAttribute('ry', NODE_H / 2);
          el.setAttribute('fill', node.color || getCSSVar('--accent-red'));
          el.setAttribute('stroke', node.color || getCSSVar('--accent-red'));
          el.setAttribute('stroke-width', '3');
          el.setAttribute('filter', 'url(#node-shadow)');
          g.appendChild(el);
          const inner = createNS('ellipse');
          inner.setAttribute('cx', nm.cx); inner.setAttribute('cy', nm.cy);
          inner.setAttribute('rx', NODE_W / 2 - 5); inner.setAttribute('ry', NODE_H / 2 - 5);
          inner.setAttribute('fill', 'none');
          inner.setAttribute('stroke', '#ffffff30');
          inner.setAttribute('stroke-width', '1.5');
          g.appendChild(inner);
          break;
        }
        case 'process':
          el = createNS('rect');
          el.setAttribute('x', nm.x); el.setAttribute('y', nm.y);
          el.setAttribute('width', NODE_W); el.setAttribute('height', NODE_H);
          el.setAttribute('rx', '6');
          el.setAttribute('fill', node.color || getCSSVar('--bg-surface'));
          el.setAttribute('stroke', getCSSVar('--border-focus'));
          el.setAttribute('stroke-width', '1.5');
          el.setAttribute('filter', 'url(#node-shadow)');
          g.appendChild(el);
          break;
        case 'decision': {
          const cx = nm.cx, cy = nm.cy;
          const pts = cx + ',' + (cy - DIAMOND_H / 2) + ' ' + (cx + DIAMOND_W / 2) + ',' + cy + ' ' +
                      cx + ',' + (cy + DIAMOND_H / 2) + ' ' + (cx - DIAMOND_W / 2) + ',' + cy;
          el = createNS('polygon');
          el.setAttribute('points', pts);
          el.setAttribute('fill', node.color || getCSSVar('--accent-amber'));
          el.setAttribute('fill-opacity', '0.15');
          el.setAttribute('stroke', getCSSVar('--accent-amber'));
          el.setAttribute('stroke-width', '1.5');
          el.setAttribute('filter', 'url(#node-shadow)');
          g.appendChild(el);
          break;
        }
        case 'io': {
          const skew = 15;
          const pts = (nm.x + skew) + ',' + nm.y + ' ' + (nm.x + NODE_W) + ',' + nm.y + ' ' +
                      (nm.x + NODE_W - skew) + ',' + (nm.y + NODE_H) + ' ' + nm.x + ',' + (nm.y + NODE_H);
          el = createNS('polygon');
          el.setAttribute('points', pts);
          el.setAttribute('fill', node.color || getCSSVar('--bg-surface'));
          el.setAttribute('stroke', getCSSVar('--accent-purple'));
          el.setAttribute('stroke-width', '1.5');
          g.appendChild(el);
          break;
        }
        case 'connector':
          el = createNS('circle');
          el.setAttribute('cx', nm.cx); el.setAttribute('cy', nm.cy);
          el.setAttribute('r', CIRCLE_R);
          el.setAttribute('fill', node.color || getCSSVar('--accent-purple'));
          el.setAttribute('fill-opacity', '0.2');
          el.setAttribute('stroke', getCSSVar('--accent-purple'));
          el.setAttribute('stroke-width', '1.5');
          g.appendChild(el);
          break;
        default:
          el = createNS('rect');
          el.setAttribute('x', nm.x); el.setAttribute('y', nm.y);
          el.setAttribute('width', NODE_W); el.setAttribute('height', NODE_H);
          el.setAttribute('rx', '6');
          el.setAttribute('fill', node.color || getCSSVar('--bg-surface'));
          g.appendChild(el);
      }

      // Selection ring [FIX B4]
      if (window.fcSelectedNodes.has(node.id)) {
        let ring;
        if (node.type === 'connector') {
          ring = createNS('circle');
          ring.setAttribute('cx', nm.cx); ring.setAttribute('cy', nm.cy);
          ring.setAttribute('r', CIRCLE_R + 4);
        } else {
          ring = createNS('rect');
          ring.setAttribute('x', nm.x - 4); ring.setAttribute('y', nm.y - 4);
          ring.setAttribute('width', nm.w + 8); ring.setAttribute('height', nm.h + 8);
          ring.setAttribute('rx', '8');
        }
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', getCSSVar('--brand-main'));
        ring.setAttribute('stroke-width', '2');
        ring.setAttribute('stroke-dasharray', '4,2');
        g.insertBefore(ring, g.firstChild);
      }

      // ClipPath [FIX B10]
      const clipId = 'clip-' + node.id;
      const clip = createNS('clipPath'); clip.setAttribute('id', clipId);
      let ce;
      if (node.type === 'connector') {
        ce = createNS('circle');
        ce.setAttribute('cx', nm.cx); ce.setAttribute('cy', nm.cy);
        ce.setAttribute('r', CIRCLE_R - 2);
      } else {
        ce = createNS('rect');
        ce.setAttribute('x', nm.x + 4); ce.setAttribute('y', nm.y + 4);
        ce.setAttribute('width', nm.w - 8); ce.setAttribute('height', nm.h - 8);
      }
      clip.appendChild(ce); defs.appendChild(clip);

      // Label [FIX B19]
      const maxCh = node.type === 'decision' ? 14 : 18;
      const lines = wordWrap(sanitizeText(node.label), maxCh);
      const lineH = 14, tH = lines.length * lineH, sY = nm.cy - tH / 2 + lineH / 2;
      lines.forEach((line, i) => {
        const txt = createNS('text');
        txt.setAttribute('x', nm.cx); txt.setAttribute('y', sY + i * lineH);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('dominant-baseline', 'middle');
        txt.setAttribute('fill', getCSSVar('--text-primary'));
        txt.setAttribute('font-size', '12');
        txt.setAttribute('clip-path', 'url(#' + clipId + ')');
        txt.textContent = line;
        g.appendChild(txt);
      });

      nodeLayer.appendChild(g);
    }
  }

  /* ---------- FASE 7: selection + interaction ---------- */
  function rerenderSelection() {
    // Re-render just nodes/edges with current selection
    renderFlowchart(AppState.flowchart.nodes, AppState.flowchart.edges,
                    AppState.flowchart.direction);
  }

  function attachNodeSelection(nodeLayer) {
    nodeLayer.querySelectorAll('.fc-node').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.nodeId;
        if (e.ctrlKey || e.metaKey) {
          window.fcSelectedNodes.has(id)
            ? window.fcSelectedNodes.delete(id)
            : window.fcSelectedNodes.add(id);
        } else {
          window.fcSelectedNodes.clear();
          window.fcSelectedNodes.add(id);
        }
        rerenderSelection();
      });
    });
  }

  function updateViewBox() {
    if (!svgEl) return;
    svgEl.setAttribute('viewBox',
      viewBox.x + ' ' + viewBox.y + ' ' + (viewBox.w / scale) + ' ' + (viewBox.h / scale));
    AppState.flowchart.scale = scale;
    AppState.flowchart.viewBox = { ...viewBox };
    if (miniMapVisible) updateMiniMap();
  }

  function fitToScreen() {
    const nodes = AppState.flowchart.nodes;
    if (nodes.length === 0) return;
    const nms = nodes.map(n => nodeMap[n.id]).filter(Boolean);
    if (nms.length === 0) return;
    const minX = Math.min(...nms.map(n => n.x)) - PADDING;
    const minY = Math.min(...nms.map(n => n.y)) - PADDING;
    const maxX = Math.max(...nms.map(n => n.x + n.w)) + PADDING;
    const maxY = Math.max(...nms.map(n => n.y + n.h)) + PADDING;
    viewBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    scale = 1;
    if (svgEl) svgEl.setAttribute('viewBox', minX + ' ' + minY + ' ' + (maxX - minX) + ' ' + (maxY - minY));
    AppState.flowchart.scale = scale;
    AppState.flowchart.viewBox = { ...viewBox };
    if (miniMapVisible) updateMiniMap();
  }
  window.fitToScreen = fitToScreen;

  function zoomViewBox(factor) {
    scale = Math.max(0.2, Math.min(4, scale * factor));
    updateViewBox();
  }

  /* ---------- FASE 9: mini-map ---------- */
  function updateMiniMap() {
    if (!miniMapVisible) return;
    const mm = document.getElementById('fc-minimap');
    if (!mm || !svgEl) return;
    mm.innerHTML = svgEl.innerHTML;
    mm.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
    mm.style.pointerEvents = 'none';
    const vb = svgEl.viewBox.baseVal;
    const vr = createNS('rect');
    vr.setAttribute('x', String(vb.x)); vr.setAttribute('y', String(vb.y));
    vr.setAttribute('width', String(vb.width)); vr.setAttribute('height', String(vb.height));
    vr.setAttribute('stroke', getCSSVar('--brand-main'));
    vr.setAttribute('fill', getCSSVar('--brand-subtle'));
    vr.setAttribute('stroke-width', String(8 / 0.15));
    mm.appendChild(vr);
  }

  /* ---------- FASE 10: export ---------- */
  function injectInlineStyles(svgClone) {
    const cs = getComputedStyle(document.documentElement);
    for (const el of svgClone.querySelectorAll('*')) {
      for (const attr of ['fill', 'stroke', 'color', 'font-family']) {
        const v = el.getAttribute(attr);
        if (v && v.includes('var(--')) {
          const m = v.match(/var\((--[^)]+)\)/);
          if (m) { const r = cs.getPropertyValue(m[1]).trim(); if (r) el.setAttribute(attr, r); }
        }
      }
      if (el.style && el.style.cssText && el.style.cssText.includes('var(--')) {
        for (const p of Array.from(el.style)) {
          const sv = el.style.getPropertyValue(p);
          if (sv.includes('var(--')) {
            const m = sv.match(/var\((--[^)]+)\)/);
            if (m) { const r = cs.getPropertyValue(m[1]).trim(); if (r) el.style.setProperty(p, r); }
          }
        }
      }
    }
  }

  function exportFlowchartPNG() {
    if (AppState.flowchart.nodes.length < 2) { showToast('error', 'Tambahkan minimal 2 node dulu'); return; }
    const cl = svgEl.cloneNode(true);
    cl.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
    injectInlineStyles(cl);
    const ss = new XMLSerializer().serializeToString(cl);
    const canvas = document.createElement('canvas');
    canvas.width = svgWidth * 2; canvas.height = svgHeight * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = getCSSVar('--bg-secondary') || '#1A1D27';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    const blob = new Blob([ss], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      triggerDownload(canvas.toDataURL('image/png'), 'flowchart.png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showToast('warning', 'Font tidak ter-embed, menggunakan system font');
      triggerDownload(canvas.toDataURL('image/png'), 'flowchart.png');
    };
    img.src = url;
  }

  function exportFlowchartSVG() {
    if (AppState.flowchart.nodes.length < 2) { showToast('error', 'Tambahkan minimal 2 node dulu'); return; }
    const cl = svgEl.cloneNode(true);
    cl.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
    injectInlineStyles(cl);
    const ss = new XMLSerializer().serializeToString(cl);
    const blob = new Blob([ss], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'flowchart.svg');
  }

  /* ========================================================
     State mutation actions (A→B→C→D→E)
     ======================================================== */
  function refreshEdgeSelects() {
    const fromSel = document.getElementById('fc-edge-from');
    const toSel = document.getElementById('fc-edge-to');
    if (!fromSel || !toSel) return;
    const prevFrom = fromSel.value, prevTo = toSel.value;
    fromSel.innerHTML = ''; toSel.innerHTML = '';
    AppState.flowchart.nodes.forEach(n => {
      const o1 = document.createElement('option');
      o1.value = n.id; o1.textContent = sanitizeText(n.label) || n.type;
      fromSel.appendChild(o1);
      const o2 = o1.cloneNode(true);
      toSel.appendChild(o2);
    });
    if ([...fromSel.options].some(o => o.value === prevFrom)) fromSel.value = prevFrom;
    if ([...toSel.options].some(o => o.value === prevTo)) toSel.value = prevTo;
  }

  function addNode() {
    const labelEl = document.getElementById('fc-node-label');
    const typeEl  = document.getElementById('fc-node-type');
    const colorEl = document.getElementById('fc-node-color');
    const label = sanitizeText(labelEl.value || '');
    // [A] validate
    if (!label) { showToast('error', 'Label node wajib diisi'); return; }
    if (AppState.flowchart.nodes.length >= 100) { showToast('error', 'Maksimum 100 node'); return; }
    let finalLabel = label;
    if (finalLabel.length > 60) finalLabel = finalLabel.slice(0, 59) + '…';
    const type = typeEl.value;
    const color = /^#[0-9A-Fa-f]{6}$/.test(colorEl.value) ? colorEl.value : null;
    // [B] snapshot
    UndoManager.snapshot();
    // [C] mutate
    const node = { id: generateId(), type, label: finalLabel };
    if (color && color.toLowerCase() !== '#242837') node.color = color;
    AppState.flowchart.nodes.push(node);
    // [D] save
    saveState();
    // [E] render
    refreshEdgeSelects();
    renderActiveTab();
    labelEl.value = '';
    if (AppState.flowchart.nodes.length > 50) showToast('warning', 'Lebih dari 50 node — performa mungkin menurun');
    else showToast('success', 'Node ditambahkan');
  }

  function deleteNode(id) {
    UndoManager.snapshot();
    AppState.flowchart.nodes = AppState.flowchart.nodes.filter(n => n.id !== id);
    AppState.flowchart.edges = AppState.flowchart.edges.filter(e => e.from !== id && e.to !== id);
    window.fcSelectedNodes.delete(id);
    saveState();
    refreshEdgeSelects();
    renderActiveTab();
  }

  function addEdge() {
    const fromSel = document.getElementById('fc-edge-from');
    const toSel   = document.getElementById('fc-edge-to');
    const labelEl = document.getElementById('fc-edge-label');
    const from = fromSel.value, to = toSel.value;
    // [A] validate
    if (!from || !to) { showToast('error', 'Pilih node asal dan tujuan'); return; }
    if (from === to)  { showToast('error', 'Node asal dan tujuan harus berbeda'); return; }
    if (AppState.flowchart.edges.length >= 200) { showToast('error', 'Maksimum 200 koneksi'); return; }
    const label = sanitizeText(labelEl.value || '');
    // [B] snapshot
    UndoManager.snapshot();
    // [C] mutate
    AppState.flowchart.edges.push({ id: generateId(), from, to, label });
    // [D] save
    saveState();
    // [E] render
    renderActiveTab();
    labelEl.value = '';
    if (AppState.flowchart.edges.length > 100) showToast('warning', 'Lebih dari 100 koneksi — performa mungkin menurun');
    else showToast('success', 'Koneksi ditambahkan');
  }

  function deleteSelected() {
    if (window.fcSelectedNodes.size === 0) return;
    UndoManager.snapshot();
    const ids = new Set(window.fcSelectedNodes);
    AppState.flowchart.nodes = AppState.flowchart.nodes.filter(n => !ids.has(n.id));
    AppState.flowchart.edges = AppState.flowchart.edges.filter(e => !ids.has(e.from) && !ids.has(e.to));
    window.fcSelectedNodes.clear();
    saveState();
    refreshEdgeSelects();
    renderActiveTab();
  }

  function selectAll() {
    window.fcSelectedNodes.clear();
    AppState.flowchart.nodes.forEach(n => window.fcSelectedNodes.add(n.id));
    rerenderSelection();
  }

  function setDirection(dir) {
    if (dir === AppState.flowchart.direction) return;
    UndoManager.snapshot();
    AppState.flowchart.direction = dir;
    saveState();
    renderActiveTab();
  }

  function resetFlowchart() {
    showModal('Hapus seluruh flowchart? Tindakan ini tidak bisa dibatalkan.', () => {
      UndoManager.snapshot();
      AppState.flowchart.nodes = [];
      AppState.flowchart.edges = [];
      window.fcSelectedNodes.clear();
      saveState();
      refreshEdgeSelects();
      showEmptyState('flowchart');
      showToast('success', 'Flowchart direset');
    });
  }

  /* ========================================================
     initFlowchart — attach listeners (called by app.js)
     ======================================================== */
  function initFlowchart() {
    svgEl = document.getElementById('fc-canvas');
    refreshEdgeSelects();

    document.getElementById('btn-fc-add-node').addEventListener('click', addNode);
    document.getElementById('btn-fc-add-edge').addEventListener('click', addEdge);
    document.getElementById('btn-fc-delete').addEventListener('click', deleteSelected);
    document.getElementById('btn-undo').addEventListener('click', () => UndoManager.undo());
    document.getElementById('btn-redo').addEventListener('click', () => UndoManager.redo());
    document.getElementById('btn-fc-fit').addEventListener('click', fitToScreen);
    document.getElementById('btn-fc-zoom-in').addEventListener('click', () => zoomViewBox(1.1));
    document.getElementById('btn-fc-zoom-out').addEventListener('click', () => zoomViewBox(0.9));
    document.getElementById('btn-fc-export-png').addEventListener('click', exportFlowchartPNG);
    document.getElementById('btn-fc-export-svg').addEventListener('click', exportFlowchartSVG);
    document.getElementById('btn-fc-reset').addEventListener('click', resetFlowchart);

    const dirBtn = document.getElementById('btn-fc-direction');
    dirBtn.textContent = AppState.flowchart.direction;
    dirBtn.addEventListener('click', () => {
      const next = AppState.flowchart.direction === 'TD' ? 'LR' : 'TD';
      dirBtn.textContent = next;
      setDirection(next);
    });

    const mmBtn = document.getElementById('btn-fc-minimap');
    mmBtn.addEventListener('click', () => {
      miniMapVisible = !miniMapVisible;
      const mm = document.getElementById('fc-minimap');
      if (miniMapVisible) { mm.classList.remove('hidden'); updateMiniMap(); }
      else mm.classList.add('hidden');
    });

    // Enter key on node label / edge label
    document.getElementById('fc-node-label').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addNode(); }
    });
    document.getElementById('fc-edge-label').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addEdge(); }
    });

    // Canvas: click empty → clear selection
    svgEl.addEventListener('click', () => {
      if (window.fcSelectedNodes.size > 0) { window.fcSelectedNodes.clear(); rerenderSelection(); }
    });

    // Pan
    svgEl.addEventListener('mousedown', e => {
      if (e.target.closest('.fc-node')) return;
      isPanning = true; panStart = { x: e.clientX, y: e.clientY };
      svgEl.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', e => {
      if (!isPanning) return;
      viewBox.x -= (e.clientX - panStart.x) / scale;
      viewBox.y -= (e.clientY - panStart.y) / scale;
      panStart = { x: e.clientX, y: e.clientY };
      updateViewBox();
    });
    document.addEventListener('mouseup', () => { isPanning = false; if (svgEl) svgEl.style.cursor = 'grab'; });
    document.addEventListener('mouseleave', () => { isPanning = false; });

    // Zoom (wheel)
    svgEl.addEventListener('wheel', e => {
      e.preventDefault();
      scale = Math.max(0.2, Math.min(4, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      updateViewBox();
    }, { passive: false });

    // Touch pinch
    let lastDist = null;
    svgEl.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
      }
    });
    svgEl.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !lastDist) return;
      const nd = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY);
      scale = Math.max(0.2, Math.min(4, scale * (nd / lastDist)));
      lastDist = nd; updateViewBox(); e.preventDefault();
    }, { passive: false });

    // Keyboard shortcuts [Pitfall 12 guard]
    document.addEventListener('keydown', e => {
      if (AppState.activeTab !== 'flowchart') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); UndoManager.undo(); }
        if (e.key === 'y' || e.key === 'Z') { e.preventDefault(); UndoManager.redo(); }
        if (e.key === 'a') { e.preventDefault(); selectAll(); }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (window.fcSelectedNodes.size > 0) { e.preventDefault(); deleteSelected(); }
      }
      if (e.key === 'Escape') { window.fcSelectedNodes.clear(); rerenderSelection(); }
      if (e.key === 'f' || e.key === 'F') fitToScreen();
    });

    UndoManager.reset();
  }

  // Expose
  window.renderFlowchart = renderFlowchart;
  window.initFlowchart = initFlowchart;
})();
