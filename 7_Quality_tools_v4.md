# 🧠 AI Agent Specification — Seven Quality Tools Web App
### Fokus: Flowchart Builder & Pareto Chart Generator
**Target Hosting:** Netlify (static, no backend)
**Stack:** Pure HTML + CSS + JavaScript (Vanilla, zero dependencies kecuali CDN)
**Versi Spec:** 4.0 — Production-Grade Edition
**Dokumen ini bersifat DETERMINISTIC: setiap instruksi memiliki satu dan hanya satu interpretasi yang valid.**

---

## 📋 DAFTAR ISI

| Bagian | Judul | Keterangan |
|--------|-------|------------|
| §0 | Master System Workflow | Arsitektur, dependensi, lifecycle, peta aksi |
| §0.8 | Helper Function Registry | Semua fungsi utilitas wajib — BACA SEBELUM KODE |
| §0.9 | Security Considerations | CSP, sanitasi input, XSS prevention |
| §0.10 | Performance & Scalability | Batas kapasitas, strategi optimasi |
| §1 | Layout Software | Struktur halaman, breakpoint, file structure |
| §2 | I/O Diagrams | Spesifikasi input/output per tool |
| §3 | Algoritma | Flowchart engine, Pareto engine, CSV import |
| §4 | Color, Icon, Font, UX & UI | Design system, komponen, animasi |
| §5 | Catatan Implementasi | CDN order, Netlify config, state management, DOM registry |

> **INSTRUKSI AGENT — WAJIB DIBACA SEBELUM MENULIS SATU BARIS KODE:**
> 1. Baca §0 secara penuh (arsitektur + lifecycle + pola mutasi state).
> 2. Baca §0.8 (semua helper function) — jangan implementasikan fungsi yang tidak ada di sini.
> 3. Baca §5.4 DOM ID Registry — gunakan ID ini secara persis, tidak boleh diubah.
> 4. Baca §5.6 Pitfalls — ini adalah bug yang PASTI terjadi jika diabaikan.
> 5. Ikuti §5.7 Phase Checkpoints — build secara bertahap, jangan skip phase.

---

## 0. 🗺️ MASTER SYSTEM WORKFLOW

### 0.1 Arsitektur Tingkat Tinggi

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client-Only)                        │
│                                                                     │
│  ┌────────────┐    ┌──────────────┐    ┌───────────────────────┐   │
│  │  DOM / UI  │◄──►│  AppState    │◄──►│  localStorage         │   │
│  │  (HTML)    │    │  (JS Object) │    │  (sqt_state_v1)       │   │
│  └─────┬──────┘    └──────┬───────┘    └───────────────────────┘   │
│        │ Events           │ Mutations                               │
│        ▼                  ▼                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    EVENT BUS (inline)                        │   │
│  │  User Action → Validate → Snapshot → Mutate → Save → Render │   │
│  └──────┬───────────────────────┬───────────────────────────────┘  │
│         │                       │                                   │
│  ┌──────▼──────┐        ┌───────▼──────┐                           │
│  │ FLOWCHART   │        │   PARETO     │                           │
│  │ ENGINE      │        │   ENGINE     │                           │
│  │ flowchart.js│        │   pareto.js  │                           │
│  │             │        │              │                           │
│  │ • BFS Layout│        │ • Sort & Calc│                           │
│  │ • SVG Render│        │ • Chart.js v4│                           │
│  │ • Undo/Redo │        │ • Annotation │                           │
│  │ • Zoom/Pan  │        │ • Export     │                           │
│  └──────┬──────┘        └───────┬──────┘                           │
│         │                       │                                   │
│  ┌──────▼───────────────────────▼──────┐                           │
│  │         OUTPUT LAYER                 │                           │
│  │  SVG Canvas  │  Chart Canvas  │ DOM  │                           │
│  └──────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Prinsip Arsitektur (wajib ditaati):**
- Tidak ada state global selain `AppState` dan `fcSelectedNodes`.
- Tidak ada circular dependency (app.js tidak mengimport engine; engine mengimport dari app.js).
- Semua mutasi state melewati pola A→B→C→D→E (lihat §0.5).
- `fcSelectedNodes` (Set) TIDAK pernah di-persist ke localStorage.

---

### 0.2 Dependensi Modul & Load Order

```
index.html
  └── loads (in order, CRITICAL — jangan diubah):
       1. css/main.css               ← CSS variables, reset, global layout
       2. css/navbar.css             ← Navbar & hero section
       3. css/flowchart.css          ← Styles khusus flowchart tool
       4. css/pareto.css             ← Styles khusus pareto chart

       (di akhir <body>, sebelum js/ lokal:)
       5. CDN: Chart.js v4.4.3       ← WAJIB ada sebelum plugin apapun
       6. CDN: chartjs-plugin-annotation@3.0.1  ← WAJIB setelah Chart.js
       7. CDN: chartjs-plugin-datalabels@2.2.0  ← OPSIONAL (uncomment jika diperlukan)
       8. js/app.js                  ← AppState, utils (§0.8), tab router, lifecycle
       9. js/flowchart-undo.js       ← UndoManager (hanya dipakai flowchart.js)
      10. js/flowchart.js            ← depends on: app.js + flowchart-undo.js
      11. js/pareto.js               ← depends on: app.js + Chart.js

app.js WAJIB export ke window (global):
  • window.AppState
  • window.fcSelectedNodes    ← Set, terpisah dari AppState
  • window.saveState()
  • window.restoreState()
  • window.showToast(type, msg, duration?)
  • window.triggerDownload(url, filename)
  • window.generateId()
  • window.getCSSVar(name)
  • window.showModal(message, onConfirm)
  • window.closeModal()
  • window.showEmptyState(tool)
  • window.clearState()
  • window.renderActiveTab()
  • window.getOptionsFromUI()
  • window.populateInputTable(rows)
  • window.sanitizeText(str)

flowchart-undo.js WAJIB export ke window:
  • window.UndoManager

Dependency rules:
  ✅ flowchart.js  → memanggil fungsi dari app.js + UndoManager
  ✅ pareto.js     → memanggil fungsi dari app.js
  ❌ app.js        → TIDAK boleh memanggil fungsi dari flowchart.js/pareto.js
  ❌ pareto.js     → TIDAK boleh memanggil fungsi dari flowchart.js (dan sebaliknya)
```

---

### 0.3 Siklus Hidup Aplikasi (Lifecycle)

```
Browser memuat index.html
│
├─► Script CSS dan CDN dimuat sesuai order §0.2
│
├─► DOMContentLoaded fires (di js/app.js)
│     │
│     ├─[1]─► hasData = restoreState()
│     │          ├─ Baca localStorage('sqt_state_v1')
│     │          ├─ Validasi schema parsed object (lihat §5.3)
│     │          ├─ Jika valid: merge ke AppState, return true
│     │          ├─ Jika tidak valid / tidak ada: return false
│     │          └─ Jika error: log + return false (graceful)
│     │
│     ├─[2]─► initTabs()
│     │          ├─ Attach click pada #tab-flowchart, #tab-pareto
│     │          └─ Set tab aktif visual = AppState.activeTab (tanpa render)
│     │
│     ├─[3]─► window.initFlowchart()  [didefinisikan di flowchart.js]
│     │          ├─ Attach semua event listener panel kiri
│     │          ├─ Attach event listener SVG canvas (wheel, mousedown, etc.)
│     │          ├─ Init UndoManager.reset()
│     │          └─ Attach keyboard shortcuts (document keydown)
│     │
│     ├─[4]─► window.initPareto()  [didefinisikan di pareto.js]
│     │          ├─ Render baris tabel dari AppState.pareto.rows
│     │          │   JIKA rows kosong: render 2 baris kosong default
│     │          └─ Attach event listeners (Add Row, Remove, Import, Paste, etc.)
│     │
│     └─[5]─► renderInitialState()
│                ├─ IF hasData === true:
│                │     showRestorePrompt()
│                │       ├─ User klik "Lanjutkan" → renderActiveTab()
│                │       └─ User klik "Mulai Baru" → clearState() → showEmptyState()
│                └─ ELSE:
│                      renderActiveTab()
```

---

### 0.4 Siklus Tab Switching

```
User klik tab [Flowchart] atau [Pareto]
│
└─► switchTab(newTab)
      ├─ GUARD: IF newTab === AppState.activeTab → RETURN (no-op)
      ├─ AppState.activeTab = newTab
      ├─ Sembunyikan panel lama: getElementById('panel-' + oldTab).classList.add('hidden')
      ├─ Tampilkan panel baru: getElementById('panel-' + newTab).classList.remove('hidden')
      ├─ Update tab button state:
      │     tab-flowchart: aria-selected='true', class 'active' jika newTab === 'flowchart'
      │     tab-pareto: aria-selected='true', class 'active' jika newTab === 'pareto'
      ├─ saveState()
      └─ renderActiveTab()
```

`renderActiveTab()` — lihat implementasi penuh di §0.8.

---

### 0.5 Siklus Mutasi State (Pola Universal — WAJIB DIIKUTI)

> **Setiap perubahan data mengikuti pola A→B→C→D→E ini tanpa terkecuali.**
> Jika salah satu langkah dilewati, sistem menjadi tidak konsisten.

```
User Action (klik tombol / input / keyboard)
│
├─[A]─► VALIDATE input
│          ├─ Jika gagal: showToast('error', pesanSpesifik)
│          └─ STOP — jangan lanjutkan ke B

├─[B]─► SNAPSHOT (Flowchart ONLY — skip untuk Pareto)
│          └─ UndoManager.snapshot()  ← harus SEBELUM mutasi

├─[C]─► MUTATE AppState
│          └─ Modifikasi AppState.flowchart.* ATAU AppState.pareto.*
│             TIDAK BOLEH memodifikasi keduanya sekaligus dalam satu aksi

├─[D]─► SAVE
│          └─ saveState()  ← tulis ke localStorage (dengan try-catch)

└─[E]─► RENDER
           ├─ renderFlowchart() jika mutasi flowchart
           └─ renderParetoChart() jika mutasi pareto
              (beberapa aksi tidak memerlukan full re-render — lihat §0.6)
```

---

### 0.6 Peta Aksi User → Handler

#### Flowchart Actions

| User Action | Handler | Snapshot? | Re-render? |
|---|---|---|---|
| Klik "Add Node" | `addNode()` | ✅ sebelum mutasi | ✅ full re-render |
| Klik "Delete Node" | `deleteNode(id)` | ✅ sebelum mutasi | ✅ full re-render |
| Klik "Add Connection" | `addEdge(from, to, label)` | ✅ sebelum mutasi | ✅ full re-render |
| Klik "Delete Edge" | `deleteEdge(id)` | ✅ sebelum mutasi | ✅ full re-render |
| Klik node di canvas | `selectNode(id)` | ❌ | ✅ highlight only |
| Drag pan SVG | `panViewBox(dx, dy)` | ❌ | ✅ setAttribute viewBox only |
| Scroll wheel | `zoomViewBox(delta)` | ❌ | ✅ setAttribute viewBox only |
| Toggle Layout (TD/LR) | `setDirection(dir)` | ✅ sebelum mutasi | ✅ full re-render |
| Ctrl+Z | `UndoManager.undo()` | ❌ (internal) | ✅ full re-render |
| Ctrl+Y / Ctrl+Shift+Z | `UndoManager.redo()` | ❌ (internal) | ✅ full re-render |
| Del / Backspace | `deleteSelected()` | ✅ sebelum mutasi | ✅ full re-render |
| Fit to Screen (F) | `fitToScreen()` | ❌ | ✅ setAttribute viewBox only |
| Export PNG | `exportFlowchartPNG()` | ❌ | ❌ |
| Export SVG | `exportFlowchartSVG()` | ❌ | ❌ |
| Reset | `resetFlowchart()` → modal | ✅ sebelum mutasi | ✅ full / empty state |

#### Pareto Actions

| User Action | Handler | Save? | Re-render? |
|---|---|---|---|
| Blur field kategori/frekuensi | `updateRow(id, field, val)` | ✅ | ❌ |
| Enter di field frekuensi | `addRow()` + fokus ke baris baru | ✅ | ❌ |
| Klik "+ Tambah Baris" | `addRow()` | ✅ | ❌ |
| Klik "×" hapus baris | `removeRow(id)` | ✅ | ❌ |
| Ctrl+Enter (global) | `renderParetoChart()` | ✅ | ✅ full |
| Klik "Render / Update Chart" | `renderParetoChart()` | ✅ | ✅ full |
| Ubah Threshold (blur/enter) | `updateThreshold(val)` | ✅ | ✅ full jika chart aktif |
| Import CSV | `importCSVFile(file)` | ✅ | ✅ full |
| Paste Clipboard | `pasteFromClipboard()` | ✅ | ✅ full |
| Export PNG | `exportChartPNG()` | ❌ | ❌ |
| Export CSV | `exportCSVData()` | ❌ | ❌ |
| Reset | `resetPareto()` → modal | ✅ | ✅ empty state |

---

### 0.7 Strategi Error & Fallback (5 Tingkat)

```
Tingkat 1 — Validasi Input (pra-mutasi, blocking):
  Contoh: label kosong, nilai ≤ 0, node From === To
  → showToast('error', pesanSpesifik)
  → STOP — AppState tidak berubah

Tingkat 2 — Warning Non-Blocking (post-mutasi):
  Contoh: orphan node, siklus, kategori duplikat
  → showToast('warning', pesanSpesifik)
  → Lanjutkan render dengan degradasi graceful

Tingkat 3 — Runtime Error (catch global):
  window.addEventListener('error', (event) => {
    console.error('[SQT Error]', event.error)
    showToast('error', `Error tak terduga: ${event.message}`)
    // TIDAK throw ulang — cegah halaman crash
  })
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[SQT Promise]', event.reason)
    showToast('error', 'Operasi async gagal — coba lagi')
    event.preventDefault()
  })

Tingkat 4 — localStorage Fallback:
  Jika saveState() gagal:
    → Log ke console.warn
    → Tampilkan banner warning SATU KALI (window._localStorageWarnShown)
    → Disable restore prompt
    → Aplikasi tetap berjalan tanpa persistensi

Tingkat 5 — CDN Fallback:
  Jika Chart.js tidak ter-load:
    → Guard: IF typeof Chart === 'undefined'
    → Disable tombol Render Chart
    → showToast('error', 'Chart.js gagal dimuat. Periksa koneksi internet.')
  Jika annotation plugin tidak ter-load:
    → Guard: IF typeof annotationPlugin === 'undefined'
    → Render chart tanpa garis threshold
    → showToast('warning', 'Plugin anotasi tidak aktif')
```

---

### 0.8 Helper Function Registry (WAJIB diimplementasikan di app.js)

> Semua fungsi berikut HARUS ada di `app.js` dan di-expose ke `window` sebelum engine script dimuat.
> Tidak ada fungsi yang boleh didefinisikan ulang di flowchart.js atau pareto.js.

#### `generateId()` → string

```js
// Format: 'sqt_' + 9 karakter alphanumerik acak, collision-resistant
function generateId() {
  return 'sqt_' + Math.random().toString(36).slice(2, 11)
}
// Contoh output: 'sqt_k7x2m9n4a'
// Dipanggil oleh: addNode(), addEdge(), addRow(), parseDelimited()
window.generateId = generateId
```

#### `getCSSVar(name)` → string

```js
// Membaca CSS custom property dari :root saat dipanggil (tidak di-cache)
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
// Contoh: getCSSVar('--accent-amber') → '#F59E0B'
// CATATAN: Panggil saat render, bukan di-cache ke variabel global
window.getCSSVar = getCSSVar
```

#### `sanitizeText(str)` → string

```js
// Membersihkan string user input untuk mencegah XSS
// Wajib dipanggil untuk setiap nilai teks dari user sebelum digunakan di DOM
function sanitizeText(str) {
  return String(str)
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/['"<>&]/g, c => ({ "'":"&#39;","\"":"&quot;","<":"&lt;",">":"&gt;","&":"&amp;" })[c])
    .trim()
    .slice(0, 200)             // hard limit panjang
}
// PENGGUNAAN: Setiap textContent/attribute dari data user — BUKAN innerHTML
window.sanitizeText = sanitizeText
```

#### `showToast(type, msg, duration?)` → void

```js
// type: 'success' | 'warning' | 'error'
// msg: string (plain text — TIDAK boleh HTML untuk mencegah XSS)
// duration: ms, default: success=3500, warning/error=5000
function showToast(type, msg, duration) {
  const container = document.getElementById('toast-container')
  // Batasi max 3 toast sekaligus (hapus paling lama jika lebih)
  while (container.children.length >= 3) {
    container.removeChild(container.firstChild)
  }
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.setAttribute('role', 'alert')
  toast.setAttribute('aria-live', 'polite')
  toast.textContent = msg  // ← textContent (bukan innerHTML) untuk cegah XSS
  toast.addEventListener('click', () => toast.remove())
  container.appendChild(toast)
  const ms = duration ?? (type === 'success' ? 3500 : 5000)
  setTimeout(() => toast?.remove(), ms)
}
window.showToast = showToast
```

#### `triggerDownload(url, filename)` → void

```js
// Memicu download file dari data URL atau blob URL
// WAJIB: revoke blob URL setelah download untuk mencegah memory leak
function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Delay revoke agar browser sempat memproses download
  if (url.startsWith('blob:')) {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
window.triggerDownload = triggerDownload
```

#### `showModal(message, onConfirm)` → void

```js
// Menampilkan modal konfirmasi shared
// message: string teks pesan; onConfirm: callback jika user klik "OK"
function showModal(message, onConfirm) {
  const modal  = document.getElementById('modal-confirm')
  const msgEl  = document.getElementById('modal-confirm-msg')
  const btnOk  = document.getElementById('modal-confirm-ok')
  const btnCxl = document.getElementById('modal-confirm-cancel')

  msgEl.textContent = message  // textContent, bukan innerHTML
  modal.classList.remove('hidden')
  modal.setAttribute('aria-hidden', 'false')
  btnCxl.focus()  // focus trap awal ke Batal

  // Clone tombol OK untuk menghapus listener lama (hindari duplicate)
  const newBtnOk = btnOk.cloneNode(true)
  btnOk.parentNode.replaceChild(newBtnOk, btnOk)
  newBtnOk.addEventListener('click', () => { closeModal(); onConfirm() }, { once: true })
  btnCxl.onclick = closeModal

  // Escape menutup modal
  modal._escHandler = (e) => { if (e.key === 'Escape') closeModal() }
  document.addEventListener('keydown', modal._escHandler)
}
window.showModal = showModal
```

#### `closeModal()` → void

```js
function closeModal() {
  const modal = document.getElementById('modal-confirm')
  modal.classList.add('hidden')
  modal.setAttribute('aria-hidden', 'true')
  if (modal._escHandler) {
    document.removeEventListener('keydown', modal._escHandler)
    delete modal._escHandler
  }
}
window.closeModal = closeModal
```

#### `showEmptyState(tool)` → void

```js
// tool: 'flowchart' | 'pareto'
function showEmptyState(tool) {
  const SVG_NS = 'http://www.w3.org/2000/svg'
  if (tool === 'flowchart') {
    const canvas = document.getElementById('fc-canvas')
    canvas.innerHTML = ''
    canvas.setAttribute('viewBox', '0 0 520 280')
    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('class', 'empty-state')
    // Membuat empty state via DOM API (bukan innerHTML) untuk keamanan
    const rect1 = document.createElementNS(SVG_NS, 'rect')
    Object.entries({ x:'200',y:'60',width:'120',height:'44',rx:'22',
      fill:'none', stroke:'var(--border-base)', 'stroke-width':'1.5',
      'stroke-dasharray':'5,3' }).forEach(([k,v]) => rect1.setAttribute(k,v))
    const t1 = document.createElementNS(SVG_NS, 'text')
    Object.entries({ x:'260',y:'87','text-anchor':'middle',
      fill:'var(--text-muted)','font-family':'var(--font-body)','font-size':'13'
    }).forEach(([k,v]) => t1.setAttribute(k,v))
    t1.textContent = 'START'
    const line1 = document.createElementNS(SVG_NS, 'line')
    Object.entries({ x1:'260',y1:'104',x2:'260',y2:'130',
      stroke:'var(--border-base)','stroke-width':'1.5','stroke-dasharray':'5,3'
    }).forEach(([k,v]) => line1.setAttribute(k,v))
    const rect2 = document.createElementNS(SVG_NS, 'rect')
    Object.entries({ x:'180',y:'130',width:'160',height:'44',rx:'8',
      fill:'none',stroke:'var(--border-base)','stroke-width':'1.5','stroke-dasharray':'5,3'
    }).forEach(([k,v]) => rect2.setAttribute(k,v))
    const t2 = document.createElementNS(SVG_NS, 'text')
    Object.entries({ x:'260',y:'157','text-anchor':'middle',
      fill:'var(--text-muted)','font-family':'var(--font-body)','font-size':'13'
    }).forEach(([k,v]) => t2.setAttribute(k,v))
    t2.textContent = 'Proses'
    const t3 = document.createElementNS(SVG_NS, 'text')
    Object.entries({ x:'260',y:'210','text-anchor':'middle',
      fill:'var(--text-muted)','font-family':'var(--font-body)','font-size':'13'
    }).forEach(([k,v]) => t3.setAttribute(k,v))
    t3.textContent = 'Tambahkan node pertama Anda menggunakan panel kiri.'
    g.append(rect1, t1, line1, rect2, t2, t3)
    canvas.appendChild(g)

  } else if (tool === 'pareto') {
    const wrapper = document.getElementById('pareto-canvas-wrapper')
    const div = document.createElement('div')
    div.className = 'empty-state-pareto'
    // Isi dengan teks aman (tidak ada user data)
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
    `
    // Aman: hanya template statis, tidak ada data user
    wrapper.innerHTML = ''
    wrapper.appendChild(div)
  }
}
window.showEmptyState = showEmptyState
```

#### `clearState()` → void

```js
// Mereset seluruh AppState ke kondisi awal dan membersihkan localStorage
function clearState() {
  AppState.flowchart.nodes     = []
  AppState.flowchart.edges     = []
  AppState.flowchart.direction = 'TD'
  AppState.flowchart.scale     = 1
  AppState.flowchart.viewBox   = { x: 0, y: 0, w: 800, h: 600 }
  AppState.pareto.title        = ''
  AppState.pareto.threshold    = 80
  AppState.pareto.unit         = ''
  AppState.pareto.yLabel       = ''
  AppState.pareto.rows         = []
  fcSelectedNodes.clear()
  try { localStorage.removeItem('sqt_state_v1') } catch(e) { /* ignore */ }
  saveState()
}
window.clearState = clearState
```

#### `renderActiveTab()` → void

```js
// Render konten tab yang sedang aktif berdasarkan AppState
// CATATAN: renderFlowchart() dan renderParetoChart() didefinisikan di engine-nya masing-masing
// tetapi renderActiveTab() harus bisa dipanggil dari app.js juga.
// Solusi: engine me-register dirinya ke window saat initFlowchart()/initPareto() dipanggil.
function renderActiveTab() {
  const tab = AppState.activeTab
  if (tab === 'flowchart') {
    const { nodes, edges, direction } = AppState.flowchart
    if (nodes.length >= 2) {
      if (typeof window.renderFlowchart === 'function') {
        window.renderFlowchart(nodes, edges, direction)
      }
    } else {
      showEmptyState('flowchart')
    }
  } else if (tab === 'pareto') {
    const { rows } = AppState.pareto
    if (rows.length >= 2) {
      if (typeof window.renderParetoChart === 'function') {
        window.renderParetoChart(rows, getOptionsFromUI())
      }
    } else {
      showEmptyState('pareto')
    }
  }
}
window.renderActiveTab = renderActiveTab
```

#### `getOptionsFromUI()` → object

```js
// Membaca opsi konfigurasi chart dari field input UI
// Dipanggil oleh: renderActiveTab(), importCSVFile(), pasteFromClipboard()
function getOptionsFromUI() {
  const titleEl     = document.getElementById('pareto-title')
  const thresholdEl = document.getElementById('pareto-threshold')
  const unitEl      = document.getElementById('pareto-unit')
  const yLabelEl    = document.getElementById('pareto-ylabel')
  const rawTh = parseInt(thresholdEl?.value, 10)
  return {
    title     : sanitizeText(titleEl?.value || '') || 'Pareto Chart',
    threshold : (!isNaN(rawTh) && rawTh >= 1 && rawTh <= 99) ? rawTh : AppState.pareto.threshold,
    unitLabel : sanitizeText(unitEl?.value || ''),
    yAxisLabel: sanitizeText(yLabelEl?.value || '')
  }
}
window.getOptionsFromUI = getOptionsFromUI
```

#### `populateInputTable(rows)` → void

```js
// Mengisi ulang tabel input Pareto dari array data
// rows: Array<{ id: string, category: string, value: number }>
// CATATAN: addRowToDOM() adalah fungsi internal pareto.js yang membuat <tr>
// populateInputTable harus dipanggil SETELAH initPareto() — karena addRowToDOM
// didefinisikan di dalam scope initPareto atau sebagai window.addRowToDOM
function populateInputTable(rows) {
  const tbody = document.getElementById('pareto-rows-container')
  if (!tbody) return
  tbody.innerHTML = ''
  if (rows.length === 0) {
    // Tambah 2 baris kosong default
    if (typeof window.addRowToDOM === 'function') {
      window.addRowToDOM(generateId(), '', '')
      window.addRowToDOM(generateId(), '', '')
    }
  } else {
    rows.forEach(row => {
      if (typeof window.addRowToDOM === 'function') {
        window.addRowToDOM(row.id, row.category, row.value)
      }
    })
  }
}
window.populateInputTable = populateInputTable
```

#### `showRestorePrompt()` → void

```js
function showRestorePrompt() {
  const banner = document.getElementById('restore-prompt')
  if (!banner) { renderActiveTab(); return }
  banner.classList.remove('hidden')
  banner.setAttribute('aria-hidden', 'false')

  document.getElementById('btn-restore-continue').addEventListener('click', () => {
    banner.classList.add('hidden')
    renderActiveTab()
  }, { once: true })

  document.getElementById('btn-restore-discard').addEventListener('click', () => {
    banner.classList.add('hidden')
    clearState()
    populateInputTable([])
    showEmptyState(AppState.activeTab)
  }, { once: true })
}
```

#### `showPasteTextarea()` → void

```js
// Fallback textarea untuk paste manual jika Clipboard API tidak tersedia/ditolak
function showPasteTextarea() {
  let modal = document.getElementById('modal-paste-fallback')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'modal-paste-fallback'
    modal.className = 'modal-overlay hidden'
    // innerHTML aman di sini karena hanya template statis (bukan data user)
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
      </div>`
    document.body.appendChild(modal)
  }
  modal.classList.remove('hidden')

  document.getElementById('btn-paste-cancel').onclick = () => modal.classList.add('hidden')
  document.getElementById('btn-paste-submit').onclick = () => {
    const text = document.getElementById('paste-textarea').value
    if (!text.trim()) { showToast('warning', 'Textarea kosong'); return }
    // Tambahkan header dummy agar parseDelimited bekerja
    const withHeader = 'Kategori,Nilai\n' + text
    const data = window.parseDelimited ? window.parseDelimited(withHeader) : []
    if (data.length >= 2) {
      AppState.pareto.rows = data
      populateInputTable(data)
      if (typeof window.renderParetoChart === 'function') {
        window.renderParetoChart(data, getOptionsFromUI())
      }
      saveState()
      showToast('success', `${data.length} baris berhasil di-paste`)
      modal.classList.add('hidden')
    } else {
      showToast('warning', 'Data tidak cukup — butuh minimal 2 baris valid')
    }
  }
}
window.showPasteTextarea = showPasteTextarea
```

---

### 0.9 Security Considerations

| Area | Risiko | Mitigasi Wajib |
|------|--------|----------------|
| XSS via user input | Label node / kategori disisipkan ke DOM/SVG | SELALU `textContent` atau `sanitizeText()` — TIDAK pernah `innerHTML` dari user input |
| XSS via CSV import | Konten file CSV berisi script tag | `sanitizeText()` pada setiap nilai string sebelum masuk DOM |
| localStorage poisoning | Manipulasi localStorage dari konsol browser | Validasi schema setelah JSON.parse() di restoreState() — lihat §5.3 |
| Prototype pollution | Spread operator pada parsed JSON | Validasi tipe eksplisit per field di restoreState() sebelum assign ke AppState |
| Blob URL memory leak | Blob URL tidak di-revoke | `triggerDownload()` auto-revoke setelah 1000ms delay |
| CORS font dalam PNG export | Canvas tainted karena Google Fonts | `img.onerror` export fallback dengan system font |
| File size DoS | File CSV sangat besar memblokir UI | Hard limit 1MB di `importCSVFile()` sebelum FileReader dibuat |
| CSP inline event handler | `onclick="..."` di SVG elemen | Tidak gunakan attribute event handler — HANYA `addEventListener` |

**Fungsi sanitasi wajib (sudah di-spec di §0.8):**
```js
// Dipanggil pada: label node, kategori, judul chart, semua input teks bebas dari user
sanitizeText(userInput)  // strip HTML, escape special chars, limit length
```

---

### 0.10 Performance & Scalability Constraints

| Parameter | Batas Lunak (warning) | Batas Keras (tolak) | Perilaku |
|-----------|----------------------|---------------------|---------|
| Jumlah node flowchart | 50 | 100 | > 50: toast warning; > 100: tolak `addNode()` |
| Jumlah edge flowchart | 100 | 200 | > 100: toast warning; > 200: tolak `addEdge()` |
| Jumlah baris Pareto | 20 | 50 | > 20: toast warning; > 50: tolak `addRow()` |
| Panjang label node | 40 char | 60 char | > 60: potong + '…' otomatis |
| Ukuran file CSV | 500KB | 1MB | > 1MB: tolak import dengan error toast |
| History undo steps | 20 | 30 | > 30: hapus snapshot paling lama (FIFO) |

**Strategi render:**
- Pareto: render Chart.js hanya saat klik "Render" atau import/paste (bukan real-time saat typing)
- Flowchart: tidak perlu debounce karena render manual (klik tombol)
- Mini-map: gunakan `requestAnimationFrame` agar tidak blokir thread utama

---

## 1. 📐 LAYOUT SOFTWARE

### 1.1 Struktur Halaman (Single Page Application)

```
┌──────────────────────────────────────────────────────┐
│  NAVBAR                                              │
│  Logo | "Seven Quality Tools" | FC | Pareto | About  │
└──────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────┐
│  HERO SECTION                                        │
│  Judul Besar + Subtitle + CTA Button                 │
└──────────────────────────────────────────────────────┘
┌────────────────────────┬─────────────────────────────┐
│  TABS: [FC] [Pareto]   │                             │
│                        │  TOOL WORKSPACE             │
│  LEFT PANEL (input):   │  (Render area aktif)        │
│  - Form fields         │                             │
│  - Action buttons      │  Center/Right:              │
│  - Data table (Pareto) │  - SVG Canvas / Chart       │
│                        │  - Toolbar overlay (FC)     │
└────────────────────────┴─────────────────────────────┘
┌──────────────────────────────────────────────────────┐
│  EXPORT BAR: [PNG] [SVG/CSV] [Reset]                 │
└──────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────┐
│  FOOTER: © 2025 | Seven Quality Tools | CC BY        │
└──────────────────────────────────────────────────────┘
```

### 1.2 Breakpoints Responsif

| Breakpoint | Lebar | Layout |
|---|---|---|
| Mobile | < 640px | Kolom tunggal — panel input **di atas** canvas |
| Tablet | 640–1024px | 2 kolom: panel 35% / canvas 65% |
| Desktop | > 1024px | 2 kolom: panel 30% / canvas 70% |

**Mobile notes:**
- Tombol toolbar flowchart: susun 2 baris agar tidak overflow
- Pareto input table: max-height dikurangi ke 200px
- Font minimum: 14px di semua elemen interaktif

### 1.3 File Structure untuk Netlify

```
project-root/
├── index.html              ← Entry point utama (SPA)
├── netlify.toml            ← Headers + CSP (lihat §5.2)
├── css/
│   ├── main.css            ← CSS variables, reset, global typography
│   ├── navbar.css          ← Navbar, hero section
│   ├── flowchart.css       ← SVG canvas, toolbar, node styles
│   └── pareto.css          ← Input table, chart wrapper, stat cards
└── js/
    ├── app.js              ← AppState + SEMUA helper functions (§0.8)
    ├── flowchart-undo.js   ← UndoManager class (standalone)
    ├── flowchart.js        ← Flowchart engine (depends: app.js, flowchart-undo.js)
    └── pareto.js           ← Pareto engine (depends: app.js, Chart.js CDN)
```

---

## 2. 📊 BAGIAN I/O (Input / Output Diagram)

### A. FLOWCHART TOOL

**Input Fields:**

| Field | Tipe | ID Element | Validasi |
|---|---|---|---|
| Step Label | `<input type="text">` | `fc-node-label` | Wajib, max 60 char, trim |
| Node Type | `<select>` | `fc-node-type` | Nilai: start\|end\|process\|decision\|io\|connector |
| Edge From | `<select>` | `fc-edge-from` | ID node yang sudah ada |
| Edge To | `<select>` | `fc-edge-to` | ID berbeda dari From |
| Edge Label | `<input type="text">` | `fc-edge-label` | Opsional; "Yes"/"No" → warna khusus |
| Node Color | `<input type="color">` | `fc-node-color` | Hex 6 digit, regex `/^#[0-9A-Fa-f]{6}$/` |
| Direction | `<button>` toggle | `btn-fc-direction` | "TD" atau "LR" |

**Output:** SVG canvas + download PNG (2× retina) + download SVG

**Validasi pre-render:**
1. `nodes.length < 2` → error toast, stop
2. Cycle detected → warning toast, lanjut
3. Orphan node → warning toast, lanjut (tempatkan di kolom terpisah)

---

### B. PARETO CHART TOOL

**Input Fields:**

| Field | Tipe | ID Element | Validasi |
|---|---|---|---|
| Judul Chart | `<input type="text">` | `pareto-title` | Opsional, default "Pareto Chart", max 100 char |
| Threshold % | `<input type="number">` | `pareto-threshold` | Integer 1–99, default 80 |
| Unit Label | `<input type="text">` | `pareto-unit` | Opsional, max 20 char |
| Y-Axis Label | `<input type="text">` | `pareto-ylabel` | Opsional, default = unit label |
| Kategori (per baris) | `<input type="text">` | Dinamis di tbody | Wajib, unik, max 50 char |
| Frekuensi (per baris) | `<input type="text">` | Dinamis di tbody | Wajib, > 0, format angka lokal |

**Format CSV Import yang didukung:**

```
Delimiter: koma (,)     → "Cacat A,45"
Delimiter: titik koma   → "Cacat A;45"
Delimiter: tab          → "Cacat A\t45"
BOM UTF-8 (Excel)       → \uFEFF di awal file → di-strip otomatis
Format angka lokal:
  1234    → 1234
  1.234   → 1234  (ID ribuan)
  1,234   → 1234  (US ribuan)
  1.234,5 → 1234.5 (ID desimal)
  1,234.5 → 1234.5 (US desimal)
```

**Output:** Chart.js dual-axis + panel statistik + tabel ringkasan + download PNG + download CSV

---

## 3. ⚙️ ALGORITMA

### A. Algoritma Flowchart Renderer — VERSI LENGKAP

> Setiap FASE harus diimplementasikan **dalam urutan yang tertulis**. Tidak ada pengecualian.

```
FUNCTION renderFlowchart(nodes, edges, direction='TD'):

══════════════════════════════════════════════════════
PRE-CONDITION
══════════════════════════════════════════════════════
  IF nodes.length < 2:
    showEmptyState('flowchart')
    RETURN

══════════════════════════════════════════════════════
FASE 0 — KONSTANTA & NODE MAP
══════════════════════════════════════════════════════
  NODE_W=160, NODE_H=50
  DIAMOND_W=160, DIAMOND_H=80
  CIRCLE_R=20
  GAP_X=48, GAP_Y=72, PADDING=40
  SVG_NS = 'http://www.w3.org/2000/svg'

  getNodeDim(node):
    IF node.type==='decision':  RETURN {w:DIAMOND_W, h:DIAMOND_H}
    IF node.type==='connector': RETURN {w:CIRCLE_R*2, h:CIRCLE_R*2}
    RETURN {w:NODE_W, h:NODE_H}

  nodeMap = {}
  FOR each node: nodeMap[node.id] = { ...node, ...getNodeDim(node) }

══════════════════════════════════════════════════════
FASE 1 — CYCLE DETECTION (DFS)
══════════════════════════════════════════════════════
  visited=Set(), recStack=Set()

  dfsHasCycle(nodeId):
    visited.add(nodeId); recStack.add(nodeId)
    FOR each edge WHERE edge.from===nodeId:
      n = edge.to
      IF !visited.has(n): IF dfsHasCycle(n): RETURN true
      ELSE IF recStack.has(n): RETURN true
    recStack.delete(nodeId); RETURN false

  cycleFound = false
  FOR each node NOT in visited:
    IF dfsHasCycle(node.id): cycleFound=true; BREAK
  IF cycleFound: showToast('warning','Diagram mengandung siklus')

══════════════════════════════════════════════════════
FASE 2 — ORPHAN CHECK  [FIX B16]
══════════════════════════════════════════════════════
  // nodes.length>1 diperiksa DI LUAR filter, bukan di dalam
  IF edges.length > 0:
    connected = new Set(edges.flatMap(e=>[e.from,e.to]))
    orphans = nodes.filter(n => !connected.has(n.id))
  ELSE:
    orphans = [...nodes]  // semua orphan jika tidak ada edge

  IF orphans.length>0 AND nodes.length>1:
    showToast('warning', orphans.length+' node belum terhubung')

══════════════════════════════════════════════════════
FASE 3 — BFS LAYOUT  [FIX B1, B11, B12]
══════════════════════════════════════════════════════
  // 3a. Root node
  root = nodes.find(n=>n.type==='start') || nodes[0]

  // 3b. BFS — handle disconnected subgraph [FIX B11]
  levelMap={}, levelGroups={}, visited_bfs=new Set()

  bfsFrom(startId, baseLevel):
    queue=[startId]; levelMap[startId]=baseLevel
    WHILE queue tidak kosong:
      cId = queue.shift()
      IF visited_bfs.has(cId): CONTINUE
      visited_bfs.add(cId)
      lv = levelMap[cId]
      levelGroups[lv] = levelGroups[lv]||[]
      levelGroups[lv].push(cId)
      FOR each edge WHERE edge.from===cId:
        childId = edge.to
        IF !nodeMap[childId]: CONTINUE  // [FIX B12] guard undefined
        IF !visited_bfs.has(childId):
          IF levelMap[childId]===undefined: levelMap[childId]=lv+1
          queue.push(childId)

  bfsFrom(root.id, 0)

  // Handle node yang tidak terjangkau dari root (disconnected)
  maxLv = Math.max(...Object.values(levelMap), 0)
  FOR each node NOT in visited_bfs:
    maxLv++; bfsFrom(node.id, maxLv)

  // 3c. Provisional width [FIX B1] — dihitung SEBELUM assign koordinat
  maxPerLevel = Math.max(...Object.values(levelGroups).map(g=>g.length), 1)
  provisionalW = Math.max(maxPerLevel*(NODE_W+GAP_X)+PADDING*2, 600)

  // 3d. Assign X,Y per node
  FOR each level lv IN levelGroups (ascending):
    group = levelGroups[lv]; n = group.length
    totalW = n*NODE_W + (n-1)*GAP_X
    startX = (provisionalW - totalW) / 2

    FOR i, nodeId IN group:
      nm = nodeMap[nodeId]
      IF direction==='TD':
        nm.x = startX + i*(NODE_W+GAP_X)
        nm.y = PADDING + lv*(NODE_H+GAP_Y)
        IF nm.type==='decision': nm.y -= (DIAMOND_H-NODE_H)/2
      ELSE: // LR
        totalH = n*NODE_H + (n-1)*GAP_Y
        startY = (provisionalW - totalH) / 2
        nm.x = PADDING + lv*(NODE_W+GAP_X)
        nm.y = startY + i*(NODE_H+GAP_Y)

  // 3e. Hitung svgWidth/svgHeight dari bounding box AKTUAL [FIX B1]
  allX = Object.values(nodeMap).map(n=>n.x + getNodeDim(n).w)
  allY = Object.values(nodeMap).map(n=>n.y + getNodeDim(n).h)
  svgWidth  = Math.max(Math.max(...allX)+PADDING, 600)
  svgHeight = Math.max(Math.max(...allY)+PADDING, 400)

  // 3f. Center helpers
  FOR each nm in nodeMap:
    dim = getNodeDim(nm)
    nm.cx=nm.x+dim.w/2; nm.cy=nm.y+dim.h/2
    nm.top=nm.y; nm.bottom=nm.y+dim.h
    nm.left=nm.x; nm.right=nm.x+dim.w
    nm.w=dim.w; nm.h=dim.h

══════════════════════════════════════════════════════
FASE 4 — SVG INIT + LAYER STRUCTURE  [FIX B18]
══════════════════════════════════════════════════════
  svgEl = document.getElementById('fc-canvas')
  svgEl.setAttribute('viewBox','0 0 '+svgWidth+' '+svgHeight)
  svgEl.setAttribute('width', svgWidth)
  svgEl.setAttribute('height', svgHeight)
  svgEl.innerHTML = ''

  // <defs>: markers + filter
  defs = createNS('defs')
  // marker#arrow       → fill var(--text-secondary)
  // marker#arrow-yes   → fill var(--accent-green)
  // marker#arrow-no    → fill var(--accent-red)
  // filter#node-shadow → feDropShadow dx=0 dy=2 stdDeviation=3
  svgEl.appendChild(defs)

  // [FIX B18] Layer 1 = edge (bawah), Layer 2 = node (atas)
  edgeLayer = createNS('g'); edgeLayer.className='edge-layer'
  nodeLayer = createNS('g'); nodeLayer.className='node-layer'
  svgEl.appendChild(edgeLayer)   // PERTAMA → di bawah
  svgEl.appendChild(nodeLayer)   // KEDUA  → di atas

  createNS = (tag) => document.createElementNS(SVG_NS, tag)

══════════════════════════════════════════════════════
FASE 5 — EDGE RENDERER  [FIX B5, B9, B19]
══════════════════════════════════════════════════════
  FOR each edge:
    from = nodeMap[edge.from]; to = nodeMap[edge.to]
    IF !from OR !to: continue  // guard

    // Titik keluar/masuk berdasarkan direction + tipe node
    IF direction==='TD':
      start={x:from.cx, y:from.bottom}; end={x:to.cx, y:to.top}
      IF from.type==='decision':
        isYes = ['Yes','ya','Y'].includes(edge.label)
        isNo  = ['No','tidak','N'].includes(edge.label)
        IF isYes: start={x:from.right, y:from.cy}; end={x:to.cx, y:to.top}
        IF isNo:  start={x:from.left,  y:from.cy}; end={x:to.cx, y:to.top}
    ELSE: // LR
      start={x:from.right, y:from.cy}; end={x:to.left, y:to.cy}
      IF from.type==='decision':
        isYes = ['Yes','ya','Y'].includes(edge.label)
        isNo  = ['No','tidak','N'].includes(edge.label)
        // [FIX B5] LR: Yes=bawah, No=atas
        IF isYes: start={x:from.cx, y:from.bottom}; end={x:to.left, y:to.cy}
        IF isNo:  start={x:from.cx, y:from.top};    end={x:to.left, y:to.cy}

    dx=end.x-start.x; dy=end.y-start.y

    // Elbow routing
    IF Math.abs(dx)<2:
      d = 'M '+start.x+' '+start.y+' L '+end.x+' '+end.y
    ELSE:
      mid = start.y + dy*0.5
      d = 'M '+start.x+' '+start.y+
          ' L '+start.x+' '+mid+
          ' L '+end.x+' '+mid+
          ' L '+end.x+' '+end.y

    // [FIX B9] dasharray dinamis — bukan hardcode 300
    edgeLen = Math.sqrt(dx*dx + dy*dy) + 100

    marker = edge.label==='Yes' ? 'arrow-yes'
           : edge.label==='No'  ? 'arrow-no' : 'arrow'

    path = createNS('path')
    path.setAttribute('d', d)
    path.setAttribute('fill','none')
    path.setAttribute('stroke', getCSSVar('--text-muted'))
    path.setAttribute('stroke-width','1.5')
    path.setAttribute('stroke-dasharray', String(edgeLen))
    path.setAttribute('stroke-dashoffset', String(edgeLen))
    path.setAttribute('marker-end','url(#'+marker+')')
    path.classList.add('fc-edge')
    edgeLayer.appendChild(path)

    // Label edge  [FIX B19] textContent
    IF edge.label:
      lbl = createNS('text')
      lbl.setAttribute('x', (start.x+end.x)/2)
      lbl.setAttribute('y', (start.y+end.y)/2-6)
      lbl.setAttribute('text-anchor','middle')
      lbl.setAttribute('font-size','11')
      lbl.setAttribute('fill', edge.label==='Yes' ? getCSSVar('--accent-green')
                               : edge.label==='No' ? getCSSVar('--accent-red')
                               : getCSSVar('--text-secondary'))
      lbl.textContent = sanitizeText(edge.label)  // [FIX B19]
      edgeLayer.appendChild(lbl)

══════════════════════════════════════════════════════
FASE 6 — NODE RENDERER  [FIX B4, B10, B19]
══════════════════════════════════════════════════════
  wordWrap(text, maxChars=18):
    words=String(text).split(' '); lines=[]; cur=''
    FOR w in words:
      IF (cur+' '+w).trim().length<=maxChars: cur=(cur+' '+w).trim()
      ELSE:
        IF cur: lines.push(cur)
        cur = w.length>maxChars ? (lines.push(w.slice(0,maxChars-1)+'…'),'') : w
    IF cur: lines.push(cur)
    RETURN lines.length ? lines : ['']

  FOR each node:
    nm = nodeMap[node.id]
    g = createNS('g')
    g.setAttribute('class','fc-node')
    g.setAttribute('data-node-id', node.id)
    g.style.cursor = 'pointer'

    // Shape per tipe
    SWITCH node.type:
      'start':
        el=createNS('ellipse')
        el.setAttribute('cx',nm.cx); el.setAttribute('cy',nm.cy)
        el.setAttribute('rx',NODE_W/2); el.setAttribute('ry',NODE_H/2)
        el.setAttribute('fill', node.color||getCSSVar('--accent-green'))
        el.setAttribute('filter','url(#node-shadow)')

      'end':
        el=createNS('ellipse')
        el.setAttribute('cx',nm.cx); el.setAttribute('cy',nm.cy)
        el.setAttribute('rx',NODE_W/2); el.setAttribute('ry',NODE_H/2)
        el.setAttribute('fill', node.color||getCSSVar('--accent-red'))
        el.setAttribute('stroke',node.color||getCSSVar('--accent-red'))
        el.setAttribute('stroke-width','3')
        el.setAttribute('filter','url(#node-shadow)')
        g.appendChild(el)
        // Double-ring inner
        inner=createNS('ellipse')
        inner.setAttribute('cx',nm.cx); inner.setAttribute('cy',nm.cy)
        inner.setAttribute('rx',NODE_W/2-5); inner.setAttribute('ry',NODE_H/2-5)
        inner.setAttribute('fill','none')
        inner.setAttribute('stroke','#ffffff30')
        inner.setAttribute('stroke-width','1.5')
        el=inner  // append inner juga

      'process':
        el=createNS('rect')
        el.setAttribute('x',nm.x); el.setAttribute('y',nm.y)
        el.setAttribute('width',NODE_W); el.setAttribute('height',NODE_H)
        el.setAttribute('rx','6')
        el.setAttribute('fill', node.color||getCSSVar('--bg-surface'))
        el.setAttribute('stroke',getCSSVar('--border-focus'))
        el.setAttribute('stroke-width','1.5')
        el.setAttribute('filter','url(#node-shadow)')

      'decision':
        cx=nm.cx; cy=nm.cy
        pts=cx+','+(cy-DIAMOND_H/2)+' '+(cx+DIAMOND_W/2)+','+cy+' '+
            cx+','+(cy+DIAMOND_H/2)+' '+(cx-DIAMOND_W/2)+','+cy
        el=createNS('polygon')
        el.setAttribute('points',pts)
        el.setAttribute('fill', node.color||getCSSVar('--accent-amber'))
        el.setAttribute('fill-opacity','0.15')
        el.setAttribute('stroke',getCSSVar('--accent-amber'))
        el.setAttribute('stroke-width','1.5')
        el.setAttribute('filter','url(#node-shadow)')

      'io':
        skew=15
        pts=(nm.x+skew)+','+nm.y+' '+(nm.x+NODE_W)+','+nm.y+' '+
            (nm.x+NODE_W-skew)+','+(nm.y+NODE_H)+' '+nm.x+','+(nm.y+NODE_H)
        el=createNS('polygon')
        el.setAttribute('points',pts)
        el.setAttribute('fill', node.color||getCSSVar('--bg-surface'))
        el.setAttribute('stroke',getCSSVar('--accent-purple'))
        el.setAttribute('stroke-width','1.5')

      'connector':
        el=createNS('circle')
        el.setAttribute('cx',nm.cx); el.setAttribute('cy',nm.cy)
        el.setAttribute('r',CIRCLE_R)
        el.setAttribute('fill', node.color||getCSSVar('--accent-purple'))
        el.setAttribute('fill-opacity','0.2')
        el.setAttribute('stroke',getCSSVar('--accent-purple'))
        el.setAttribute('stroke-width','1.5')

    g.appendChild(el)

    // [FIX B4] Selection ring — baca dari fcSelectedNodes, BUKAN AppState.selected
    IF fcSelectedNodes.has(node.id):
      IF node.type==='connector':
        ring=createNS('circle')
        ring.setAttribute('cx',nm.cx); ring.setAttribute('cy',nm.cy)
        ring.setAttribute('r',CIRCLE_R+4)
      ELSE:
        ring=createNS('rect')
        ring.setAttribute('x',nm.x-4); ring.setAttribute('y',nm.y-4)
        ring.setAttribute('width',nm.w+8); ring.setAttribute('height',nm.h+8)
        ring.setAttribute('rx','8')
      ring.setAttribute('fill','none')
      ring.setAttribute('stroke',getCSSVar('--brand-main'))
      ring.setAttribute('stroke-width','2')
      ring.setAttribute('stroke-dasharray','4,2')
      g.insertBefore(ring, g.firstChild)

    // ClipPath — [FIX B10] connector pakai circle, bukan rect
    clipId = 'clip-'+node.id
    clip=createNS('clipPath'); clip.setAttribute('id',clipId)
    IF node.type==='connector':
      ce=createNS('circle')
      ce.setAttribute('cx',nm.cx); ce.setAttribute('cy',nm.cy)
      ce.setAttribute('r',CIRCLE_R-2)
    ELSE:
      ce=createNS('rect')
      ce.setAttribute('x',nm.x+4); ce.setAttribute('y',nm.y+4)
      ce.setAttribute('width',nm.w-8); ce.setAttribute('height',nm.h-8)
    clip.appendChild(ce); defs.appendChild(clip)

    // Label — [FIX B19] textContent
    maxCh = node.type==='decision' ? 14 : 18
    lines = wordWrap(sanitizeText(node.label), maxCh)
    lineH=14; tH=lines.length*lineH; sY=nm.cy-tH/2+lineH/2
    FOR i,line in lines:
      txt=createNS('text')
      txt.setAttribute('x',nm.cx); txt.setAttribute('y',sY+i*lineH)
      txt.setAttribute('text-anchor','middle')
      txt.setAttribute('dominant-baseline','middle')
      txt.setAttribute('fill',getCSSVar('--text-primary'))
      txt.setAttribute('font-size','12')
      txt.setAttribute('clip-path','url(#'+clipId+')')
      txt.textContent = line  // [FIX B19]
      g.appendChild(txt)

    nodeLayer.appendChild(g)

══════════════════════════════════════════════════════
FASE 7 — EVENT LISTENERS
══════════════════════════════════════════════════════
  // Selection — [FIX B4] fcSelectedNodes
  FOR each .fc-node:
    addEventListener('click', e => {
      e.stopPropagation()
      id = e.currentTarget.dataset.nodeId
      IF e.ctrlKey||e.metaKey:
        fcSelectedNodes.has(id) ? fcSelectedNodes.delete(id) : fcSelectedNodes.add(id)
      ELSE: fcSelectedNodes.clear(); fcSelectedNodes.add(id)
      rerenderSelection()
    })

  svgEl.addEventListener('click', ()=>{ fcSelectedNodes.clear(); rerenderSelection() })

  // Pan
  isPanning=false; panStart=null
  svgEl.addEventListener('mousedown', e=>{
    IF e.target.closest('.fc-node'): RETURN
    isPanning=true; panStart={x:e.clientX,y:e.clientY}; svgEl.style.cursor='grabbing'
  })
  document.addEventListener('mousemove', e=>{
    IF !isPanning: RETURN
    viewBox.x -= (e.clientX-panStart.x)/scale
    viewBox.y -= (e.clientY-panStart.y)/scale
    panStart={x:e.clientX,y:e.clientY}; updateViewBox()
  })
  document.addEventListener('mouseup', ()=>{ isPanning=false; svgEl.style.cursor='grab' })
  document.addEventListener('mouseleave', ()=>{ isPanning=false })

  // Zoom
  svgEl.addEventListener('wheel', e=>{
    e.preventDefault()
    scale = Math.max(0.2, Math.min(4, scale*(e.deltaY<0?1.1:0.9)))
    updateViewBox()
  }, {passive:false})

  updateViewBox():
    svgEl.setAttribute('viewBox',
      viewBox.x+' '+viewBox.y+' '+(viewBox.w/scale)+' '+(viewBox.h/scale))

  // Touch pinch-zoom
  lastDist=null
  svgEl.addEventListener('touchstart', e=>{
    IF e.touches.length===2: lastDist=Math.hypot(
      e.touches[0].clientX-e.touches[1].clientX,
      e.touches[0].clientY-e.touches[1].clientY)
  })
  svgEl.addEventListener('touchmove', e=>{
    IF e.touches.length!==2 || !lastDist: RETURN
    nd=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                  e.touches[0].clientY-e.touches[1].clientY)
    scale=Math.max(0.2,Math.min(4,scale*(nd/lastDist))); lastDist=nd
    updateViewBox(); e.preventDefault()
  },{passive:false})

  // Keyboard — [FIX Pitfall 12] guard input
  document.addEventListener('keydown', e=>{
    IF e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.isContentEditable: RETURN
    IF e.ctrlKey||e.metaKey:
      IF e.key==='z': e.preventDefault(); UndoManager.undo()
      IF e.key==='y'||e.key==='Z': e.preventDefault(); UndoManager.redo()
      IF e.key==='a': e.preventDefault(); selectAll()
    IF e.key==='Delete'||e.key==='Backspace':
      IF fcSelectedNodes.size>0: e.preventDefault(); deleteSelected()
    IF e.key==='Escape': fcSelectedNodes.clear(); rerenderSelection()
    IF e.key==='f'||e.key==='F': fitToScreen()
  })

  // Fit to Screen — [FIX B14] dimensi aktual per node
  fitToScreen():
    IF nodes.length===0: RETURN
    nms = nodes.map(n=>nodeMap[n.id]).filter(Boolean)
    minX=Math.min(...nms.map(n=>n.x))-PADDING
    minY=Math.min(...nms.map(n=>n.y))-PADDING
    maxX=Math.max(...nms.map(n=>n.x+n.w))+PADDING
    maxY=Math.max(...nms.map(n=>n.y+n.h))+PADDING
    svgEl.setAttribute('viewBox',minX+' '+minY+' '+(maxX-minX)+' '+(maxY-minY))
    scale=1

══════════════════════════════════════════════════════
FASE 8 — UNDO / REDO  [FIX B15]
══════════════════════════════════════════════════════
  UndoManager = {
    history:[], future:[], maxSize:30,

    snapshot(){
      s = JSON.parse(JSON.stringify({...AppState.flowchart, selected:[]}))
      this.history.push(s); this.future=[]
      IF this.history.length>this.maxSize: this.history.shift()
      this.updateButtons()
    },

    undo(){
      IF this.history.length<2: RETURN
      this.future.push(this.history.pop())
      r = JSON.parse(JSON.stringify(this.history.at(-1)))
      r.selected=new Set()
      Object.assign(AppState.flowchart, r); fcSelectedNodes.clear()
      // [FIX B15] renderFlowchart + fitToScreen keduanya dipanggil
      renderFlowchart(AppState.flowchart.nodes, AppState.flowchart.edges,
                      AppState.flowchart.direction)
      fitToScreen(); saveState(); this.updateButtons()
    },

    redo(){
      IF this.future.length===0: RETURN
      s=this.future.pop(); this.history.push(s)
      r=JSON.parse(JSON.stringify(s)); r.selected=new Set()
      Object.assign(AppState.flowchart, r); fcSelectedNodes.clear()
      // [FIX B15] identik dengan undo()
      renderFlowchart(AppState.flowchart.nodes, AppState.flowchart.edges,
                      AppState.flowchart.direction)
      fitToScreen(); saveState(); this.updateButtons()
    },

    updateButtons(){
      u=document.getElementById('btn-undo'); r=document.getElementById('btn-redo')
      IF u: u.disabled=this.history.length<2
      IF r: r.disabled=this.future.length===0
    }
  }

  // ATURAN: snapshot() WAJIB dipanggil SEBELUM:
  // addNode, deleteNode, addEdge, deleteEdge, setDirection, deleteSelected, resetFlowchart

══════════════════════════════════════════════════════
FASE 9 — MINI-MAP (Opsional)
══════════════════════════════════════════════════════
  updateMiniMap():
    IF !miniMapVisible: RETURN
    mm=document.getElementById('fc-minimap'); IF !mm: RETURN
    mm.innerHTML=svgEl.innerHTML
    mm.setAttribute('viewBox','0 0 '+svgWidth+' '+svgHeight)
    mm.style.pointerEvents='none'
    vb=svgEl.viewBox.baseVal
    vr=document.createElementNS(SVG_NS,'rect')
    vr.setAttribute('x',String(vb.x)); vr.setAttribute('y',String(vb.y))
    vr.setAttribute('width',String(vb.width)); vr.setAttribute('height',String(vb.height))
    vr.setAttribute('stroke',getCSSVar('--brand-main'))
    vr.setAttribute('fill',getCSSVar('--brand-subtle'))
    vr.setAttribute('stroke-width',String(8/0.15))
    mm.appendChild(vr)

══════════════════════════════════════════════════════
FASE 10 — EXPORT  [FIX B6, B7, B8]
══════════════════════════════════════════════════════
  injectInlineStyles(svgClone):
    cs = getComputedStyle(document.documentElement)
    FOR el of svgClone.querySelectorAll('*'):
      FOR attr of ['fill','stroke','color','font-family']:
        v=el.getAttribute(attr)
        IF v && v.includes('var(--'):
          m=v.match(/var\((--[^)]+)\)/)
          IF m: r=cs.getPropertyValue(m[1]).trim(); IF r: el.setAttribute(attr,r)
      // Resolve inline style juga
      IF el.style?.cssText?.includes('var(--'):
        FOR p of el.style:
          sv=el.style.getPropertyValue(p)
          IF sv.includes('var(--'):
            m=sv.match(/var\((--[^)]+)\)/)
            IF m: r=cs.getPropertyValue(m[1]).trim(); IF r: el.style.setProperty(p,r)

  exportFlowchartPNG():
    cl=svgEl.cloneNode(true); injectInlineStyles(cl)
    ss=new XMLSerializer().serializeToString(cl)
    canvas=document.createElement('canvas')
    canvas.width=svgWidth*2; canvas.height=svgHeight*2
    ctx=canvas.getContext('2d')
    ctx.fillStyle=getCSSVar('--bg-secondary')||'#1A1D27'
    ctx.fillRect(0,0,canvas.width,canvas.height)
    img=new Image()
    blob=new Blob([ss],{type:'image/svg+xml;charset=utf-8'})
    url=URL.createObjectURL(blob)
    img.onload=()=>{
      ctx.drawImage(img,0,0,canvas.width,canvas.height)
      URL.revokeObjectURL(url)  // [FIX B7]
      triggerDownload(canvas.toDataURL('image/png'),'flowchart.png')
    }
    img.onerror=()=>{
      URL.revokeObjectURL(url)
      showToast('warning','Font tidak ter-embed, menggunakan system font')
      triggerDownload(canvas.toDataURL('image/png'),'flowchart.png')  // [FIX B6] fallback
    }
    img.src=url

  exportFlowchartSVG():
    cl=svgEl.cloneNode(true); injectInlineStyles(cl)
    ss=new XMLSerializer().serializeToString(cl)
    blob=new Blob([ss],{type:'image/svg+xml;charset=utf-8'})
    triggerDownload(URL.createObjectURL(blob),'flowchart.svg')
    // [FIX B7] triggerDownload auto-revoke blob URL setelah 1000ms
```

---

### B. Algoritma Pareto Chart — VERSI LENGKAP

```
FUNCTION renderParetoChart(rawData, options):
  options = {
    title:     string  (default:"Pareto Chart"),
    threshold: number  (default:80, clamp 1-99),
    unitLabel: string  (default:"Frekuensi"),
    yAxisLabel:string  (default:unitLabel)
  }

══════════════════════════════════════════════════════
FASE 1 — SANITASI & VALIDASI
══════════════════════════════════════════════════════
  cleaned = rawData.filter(d =>
    d.category && d.category.trim()!=='' &&
    d.value!==null && d.value!==undefined && d.value!==''
  )
  IF cleaned.length<2: showToast('error','Minimal 2 kategori'); RETURN

  data=[]; errors=[]
  FOR d of cleaned:
    v = normalizeNumber(String(d.value))  // lihat §3C
    IF isNaN(v)||v<=0: errors.push('"'+d.category+'": "'+d.value+'"'); CONTINUE
    data.push({category:d.category.trim(), value:v})

  IF errors.length>0:
    showToast('error', errors.length+' baris tidak valid: '+errors.slice(0,3).join('; '))
    IF data.length<2: RETURN

  cats=data.map(d=>d.category.toLowerCase())
  dups=cats.filter((c,i)=>cats.indexOf(c)!==i)
  IF dups.length>0: showToast('warning','Duplikat: '+[...new Set(dups)].join(', '))

══════════════════════════════════════════════════════
FASE 2 — SORT & KALKULASI 2-PASS  [FIX B2]
══════════════════════════════════════════════════════
  sorted=[...data].sort((a,b)=>b.value-a.value)
  total=sorted.reduce((s,d)=>s+d.value,0)
  IF total===0: showToast('error','Total tidak boleh nol'); RETURN

  // PASS 1: cumPct TANPA isVital
  cumSum=0
  temp=sorted.map((d,i)=>{
    cumSum+=d.value
    pct=d.value/total*100; cp=cumSum/total*100
    RETURN {rank:i+1,category:d.category,value:d.value,
            pct:Math.round(pct*10)/10, cumPct:Math.round(cp*10)/10}
  })

  // PASS 2: isVital referensi PASS 1  [FIX B2]
  enriched=temp.map((d,i)=>({
    ...d,
    isVital: i===0 ? true : temp[i-1].cumPct < options.threshold
  }))

  vitalCount   = enriched.filter(d=>d.isVital).length
  trivialCount = enriched.length-vitalCount
  crossIdx     = enriched.findIndex(d=>d.cumPct>=options.threshold)
  IF crossIdx===-1: crossIdx=enriched.length-1

══════════════════════════════════════════════════════
FASE 3 — DESTROY CHART LAMA
══════════════════════════════════════════════════════
  IF window.paretoChartInstance:
    window.paretoChartInstance.destroy()
    window.paretoChartInstance=null

══════════════════════════════════════════════════════
FASE 4 — WARNA
══════════════════════════════════════════════════════
  barColors   = enriched.map(d=>d.isVital
    ?getCSSVar('--chart-bar-vital'):getCSSVar('--chart-bar-useful'))
  pointColors = enriched.map(d=>d.cumPct>=options.threshold
    ?getCSSVar('--accent-red'):getCSSVar('--chart-line'))

══════════════════════════════════════════════════════
FASE 5 — RENDER CHART.JS v4  [FIX B17]
══════════════════════════════════════════════════════
  // [FIX B17] Guard sebelum register
  IF typeof annotationPlugin!=='undefined': Chart.register(annotationPlugin)
  IF typeof ChartDataLabels!=='undefined':  Chart.register(ChartDataLabels)

  ctx=document.getElementById('pareto-canvas').getContext('2d')

  window.paretoChartInstance=new Chart(ctx, {
    type:'bar',
    data:{
      labels:enriched.map(d=>d.category),
      datasets:[
        {type:'bar', label:options.unitLabel||'Frekuensi',
         data:enriched.map(d=>d.value), backgroundColor:barColors, borderColor:barColors,
         borderWidth:1, borderRadius:4, borderSkipped:false, yAxisID:'y', order:2},
        {type:'line', label:'% Kumulatif', data:enriched.map(d=>d.cumPct),
         borderColor:getCSSVar('--chart-line'), borderWidth:2,
         pointRadius:5, pointBackgroundColor:pointColors, pointHoverRadius:7,
         tension:0.3, fill:false, yAxisID:'y2', order:1}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      animation:{duration:600,easing:'easeOutQuart'},
      scales:{
        x:{
          grid:{color:getCSSVar('--border-base')},
          ticks:{color:getCSSVar('--text-secondary'),
                 font:{family:getCSSVar('--font-body'),size:11},
                 maxRotation:35,minRotation:0,
                 callback:(v,i)=>{l=enriched[i]?.category||''; RETURN l.length>15?l.slice(0,13)+'…':l}}
        },
        y:{
          type:'linear',position:'left',min:0,
          suggestedMax:Math.ceil((enriched[0]?.value||1)*1.15),
          grid:{color:getCSSVar('--border-base')},
          ticks:{color:getCSSVar('--text-secondary'),font:{family:getCSSVar('--font-mono'),size:11}},
          title:{display:true,text:options.yAxisLabel||options.unitLabel||'Frekuensi',
                 color:getCSSVar('--text-secondary'),font:{size:12}}
        },
        y2:{
          type:'linear',position:'right',min:0,max:100,
          grid:{drawOnChartArea:false},
          ticks:{color:getCSSVar('--accent-amber'),font:{family:getCSSVar('--font-mono'),size:11},
                 callback:v=>v+'%'},
          title:{display:true,text:'% Kumulatif',color:getCSSVar('--accent-amber'),font:{size:12}}
        }
      },
      plugins:{
        legend:{labels:{color:getCSSVar('--text-secondary'),font:{family:getCSSVar('--font-body'),size:12}}},
        tooltip:{
          backgroundColor:getCSSVar('--bg-secondary'),borderColor:getCSSVar('--border-base'),
          borderWidth:1,titleColor:getCSSVar('--text-primary'),bodyColor:getCSSVar('--text-secondary'),
          position:'nearest',
          callbacks:{
            title:items=>enriched[items[0].dataIndex]?.category||'',
            beforeBody:items=>{d=enriched[items[0].dataIndex];RETURN 'Rank #'+d.rank+' | '+(d.isVital?'★ Vital Few':'· Useful Many')},
            label:item=>item.datasetIndex===0?' Nilai: '+item.raw+' '+(options.unitLabel||''):' Kumulatif: '+item.raw+'%',
            afterBody:items=>'Kontribusi: '+enriched[items[0].dataIndex].pct+'%'
          }
        },
        annotation:{
          clip:false,
          annotations:{
            thresholdLine:{
              type:'line',scaleID:'y2',value:options.threshold,
              borderColor:getCSSVar('--accent-amber'),borderWidth:2,borderDash:[6,4],
              label:{display:true,content:options.threshold+'% Threshold',position:'end',
                     backgroundColor:getCSSVar('--accent-amber'),color:'#000',
                     font:{size:11,weight:'bold'},padding:{x:6,y:4},borderRadius:4}
            },
            vitalCutLine:{
              type:'line',scaleID:'x',value:crossIdx+0.5,
              borderColor:getCSSVar('--border-focus')+'80',borderWidth:1,borderDash:[3,3],
              label:{display:true,content:'Vital Few →',position:'start',
                     color:getCSSVar('--text-muted'),font:{size:10}}
            }
          }
        }
      }
    }
  })

══════════════════════════════════════════════════════
FASE 6 — PANEL STATISTIK  [FIX B19]
══════════════════════════════════════════════════════
  sp=document.getElementById('pareto-stats'); IF !sp: RETURN
  sp.innerHTML=''
  mkCard=(lbl,val,sub,cls)=>{
    c=el('div','stat-card'+(cls?' '+cls:'')); c.appendChild(span('stat-label',lbl))
    c.appendChild(span('stat-value',val))
    IF sub: c.appendChild(span('stat-sub',sub))
    RETURN c
  }
  el=(t,c)=>{e=document.createElement(t);IF c:e.className=c;RETURN e}
  span=(c,t)=>{s=el('span',c);s.textContent=t;RETURN s}
  sp.appendChild(mkCard('Total',total.toLocaleString('id-ID')+' '+(options.unitLabel||'').trim(),null,null))
  sp.appendChild(mkCard('Vital Few',vitalCount+'/'+enriched.length+' kategori','(menyumbang ≥'+options.threshold+'% masalah)','vital'))
  sp.appendChild(mkCard('Useful Many',trivialCount+' kategori',null,null))

══════════════════════════════════════════════════════
FASE 7 — TABEL RINGKASAN  [FIX B19]
══════════════════════════════════════════════════════
  tbl=document.getElementById('pareto-summary-table'); IF !tbl: RETURN
  tbl.innerHTML=''
  // Build DOM tanpa innerHTML dengan user data
  thead=el('thead'); tr=el('tr')
  FOR col of ['Rank','Kategori','Nilai','%','Kum%','Status']:
    th=el('th'); th.textContent=col; tr.appendChild(th)
  thead.appendChild(tr); tbl.appendChild(thead)
  tbody=el('tbody')
  FOR d of enriched:
    tr=el('tr'); IF d.isVital: tr.className='vital-row'
    FOR [v,c] of [[d.rank,''],[d.category,''],[d.value.toLocaleString('id-ID'),'num'],
                  [d.pct+'%','num'],[d.cumPct+'%','num'],
                  [d.isVital?'★ Vital Few':'· Useful Many','status '+(d.isVital?'vital':'trivial')]]:
      td=el('td'); IF c: td.className=c; td.textContent=String(v); tr.appendChild(td)
    tbody.appendChild(tr)
  tbl.appendChild(tbody)

══════════════════════════════════════════════════════
FASE 8 — EXPORT  [FIX B8]
══════════════════════════════════════════════════════
  exportChartPNG():
    IF !window.paretoChartInstance: showToast('error','Render chart dulu'); RETURN
    // [FIX B8] Hapus quality param — hanya berlaku untuk JPEG, bukan PNG
    triggerDownload(window.paretoChartInstance.toBase64Image('image/png'),'pareto-chart.png')

  exportCSVData():
    IF !enriched||enriched.length===0: RETURN
    hdr='Rank,Kategori,Nilai,Persen (%),Kumulatif (%),Status\n'
    rows=enriched.map(d=>d.rank+',"'+d.category.replace(/"/g,'""')+'",'+d.value+','+
          d.pct+','+d.cumPct+',"'+(d.isVital?'Vital Few':'Useful Many')+'"').join('\n')
    blob=new Blob(['\uFEFF'+hdr+rows],{type:'text/csv;charset=utf-8'})
    triggerDownload(URL.createObjectURL(blob),'pareto-data.csv')
```

---

### C. Algoritma CSV Import & Paste Clipboard

```
══════════════════════════════════════════════════════
normalizeNumber(str)  [FIX B3]
══════════════════════════════════════════════════════
// Menangani 5 pola format angka tanpa merusak desimal
FUNCTION normalizeNumber(str):
  s=str.trim(); IF s==='': RETURN NaN

  // Pola 1: integer murni "1234"
  IF /^\d+$/.test(s): RETURN parseFloat(s)

  // Pola 2: desimal US "1.5" atau "1234.56"
  IF /^\d+\.\d+$/.test(s): RETURN parseFloat(s)

  // Pola 3: ribuan ID "1.234" atau "1.234.567"
  //   dot = thousand separator JIKA setiap group setelah dot = 3 digit
  IF /^\d{1,3}(\.\d{3})+$/.test(s): RETURN parseFloat(s.replace(/\./g,''))

  // Pola 4: desimal ID "1.234,5" atau "1234,5" atau "1,5"
  IF /^[\d.]+,\d+$/.test(s): RETURN parseFloat(s.replace(/\./g,'').replace(',','.'))

  // Pola 5: fallback parseFloat langsung
  v=parseFloat(s); IF !isNaN(v): RETURN v
  RETURN NaN

══════════════════════════════════════════════════════
splitCSVLine(line, delimiter)
══════════════════════════════════════════════════════
// State machine: handle quoted fields dengan benar
FUNCTION splitCSVLine(line, delim):
  result=[]; inQ=false; cur=''
  FOR c of line:
    IF c==='"': inQ=!inQ
    ELSE IF c===delim && !inQ: result.push(cur); cur=''
    ELSE: cur+=c
  result.push(cur)
  RETURN result

══════════════════════════════════════════════════════
parseDelimited(rawText)  — expose as window.parseDelimited
══════════════════════════════════════════════════════
FUNCTION parseDelimited(raw):
  IF !raw||typeof raw!=='string': RETURN []
  text=raw.replace(/^\uFEFF/,'')          // strip BOM
       .replace(/\r\n/g,'\n').replace(/\r/g,'\n')  // normalize CRLF
  lines=text.split('\n').filter(l=>l.trim()!=='')
  IF lines.length<2: showToast('error','File tidak memiliki data'); RETURN []

  // Deteksi delimiter dari baris pertama
  f=lines[0]
  delim=(f.match(/\t/g)||[]).length>0?'\t'
       :(f.match(/;/g)||[]).length>0?';':','

  result=[]; errors=[]
  FOR i,line of lines.slice(1):
    cols=splitCSVLine(line,delim)
    IF cols.length<2: errors.push('Baris '+(i+2)+': kolom kurang'); CONTINUE
    cat=cols[0].trim().replace(/^"|"$/g,'')
    rv =cols[1].trim().replace(/^"|"$/g,'')
    IF cat==='': errors.push('Baris '+(i+2)+': kategori kosong'); CONTINUE
    v=normalizeNumber(rv)
    IF isNaN(v)||v<=0: errors.push('Baris '+(i+2)+': "'+rv+'" tidak valid'); CONTINUE
    result.push({id:generateId(),category:cat,value:v})

  IF errors.length>0:
    showToast('warning',errors.length+' baris dilewati: '+
      (errors.length<=3?errors.join(' | '):errors.slice(0,3).join(' | ')+'…'))
  RETURN result

══════════════════════════════════════════════════════
importCSVFile(file)
══════════════════════════════════════════════════════
FUNCTION importCSVFile(file):
  IF !file: RETURN
  IF file.size>1_000_000: showToast('error','File terlalu besar (maks 1MB)'); RETURN
  IF !file.name.match(/\.(csv|tsv|txt)$/i):
    showToast('error','Format tidak didukung (.csv/.tsv/.txt)'); RETURN
  r=new FileReader()
  r.onerror=()=>showToast('error','Gagal membaca file')
  r.onload=e=>{
    data=parseDelimited(e.target.result)
    IF data.length>=2:
      AppState.pareto.rows=data; populateInputTable(data)
      renderParetoChart(data,getOptionsFromUI()); saveState()
      showToast('success',data.length+' baris berhasil diimport')
    ELSE: showToast('warning','Data tidak cukup (minimal 2 baris)')
  }
  r.readAsText(file,'UTF-8')

══════════════════════════════════════════════════════
pasteFromClipboard()
══════════════════════════════════════════════════════
FUNCTION pasteFromClipboard():
  IF !navigator.clipboard?.readText: showPasteTextarea(); RETURN
  navigator.clipboard.readText()
    .then(text=>{
      IF !text.trim(): showToast('warning','Clipboard kosong'); RETURN
      data=parseDelimited(text)
      IF data.length>=2:
        AppState.pareto.rows=data; populateInputTable(data)
        renderParetoChart(data,getOptionsFromUI()); saveState()
        showToast('success',data.length+' baris berhasil di-paste')
      ELSE: showToast('warning','Data tidak cukup'); showPasteTextarea()
    })
    .catch(err=>{
      console.warn('[SQT] Clipboard error:',err)
      showToast('warning','Clipboard tidak tersedia — gunakan textarea')
      showPasteTextarea()
    })
```

---

## 4. 🎨 COLOR, ICON, FONT, UX & UI

### 4.1 Palet Warna

```css
:root {
  /* Background */
  --bg-primary:    #0F1117;
  --bg-secondary:  #1A1D27;
  --bg-surface:    #242837;

  /* Brand */
  --brand-main:    #2563EB;
  --brand-light:   #3B82F6;
  --brand-subtle:  #1E3A8A20;

  /* Accent */
  --accent-amber:  #F59E0B;
  --accent-green:  #10B981;
  --accent-red:    #EF4444;
  --accent-purple: #8B5CF6;

  /* Text */
  --text-primary:   #F1F5F9;
  --text-secondary: #94A3B8;
  --text-muted:     #475569;

  /* Border */
  --border-base:  #2E3347;
  --border-focus: #2563EB;

  /* Chart */
  --chart-bar-vital:  #2563EB;
  --chart-bar-useful: #334155;
  --chart-line:       #F59E0B;

  /* Status */
  --status-success: #10B981;
  --status-warning: #F59E0B;
  --status-error:   #EF4444;
}
```

### 4.2 Tipografi

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;600;700&family=Fraunces:ital,wght@0,700;1,700&display=swap');

:root {
  --font-heading: 'Fraunces', serif;
  --font-body:    'Outfit', sans-serif;
  --font-mono:    'DM Mono', monospace;
  --text-xs:   0.75rem;  --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg:   1.125rem; --text-xl: 1.5rem;   --text-2xl:  2rem;
  --text-hero: clamp(2.5rem, 5vw, 4rem);
}
```

### 4.3 Ikonografi — Heroicons (inline SVG)

| Fungsi | Icon Name | Ukuran |
|---|---|---|
| Flowchart tab | `rectangle-group` | 20px |
| Pareto tab | `chart-bar-square` | 20px |
| Add node/row | `plus-circle` | 18px |
| Delete | `trash` | 18px |
| Connect nodes | `arrow-right-circle` | 18px |
| Download PNG | `photo` | 18px |
| Download SVG/CSV | `document-arrow-down` | 18px |
| Import CSV | `arrow-up-tray` | 18px |
| Paste | `clipboard-document` | 18px |
| Reset | `arrow-path` | 18px |
| Undo | `arrow-uturn-left` | 18px |
| Redo | `arrow-uturn-right` | 18px |
| Zoom In | `magnifying-glass-plus` | 18px |
| Zoom Out | `magnifying-glass-minus` | 18px |
| Fit Screen | `arrows-pointing-out` | 18px |
| Mini-map | `map` | 18px |
| Grid snap | `squares-2x2` | 18px |
| Layout TD | `arrow-down` | 18px |
| Layout LR | `arrow-right` | 18px |
| Success toast | `check-circle` | 16px |
| Error toast | `exclamation-triangle` | 16px |

### 4.4 Komponen UI

#### Tab Selector
- Aktif: `--brand-main`, `border-bottom: 2px solid`, text putih, `aria-selected="true"`
- Non-aktif: `--text-secondary`, hover subtle bg, `aria-selected="false"`
- Transisi: `all 0.2s ease`

#### Input Panel (Kiri)
- Container: `bg: --bg-secondary`, `border: --border-base`, `border-radius: 12px`
- Section label: uppercase, `letter-spacing: 0.08em`, `color: --text-muted`
- Input field: `bg: --bg-surface`, focus ring `--border-focus`, `border-radius: 8px`, `padding: 10px 14px`
- Tombol primer: `--brand-main`, hover `--brand-light` + `translateY(-1px)`
- Tombol sekunder: transparan, border `--border-base`, hover `--bg-surface`

#### Canvas/Chart Area (Kanan)
- `bg: --bg-secondary`, `border: 1px solid --border-base`, `border-radius: 12px`, `min-height: 480px`
- SVG cursor: `grab` default → `grabbing` saat pan
- Pareto chart: `height: 400px`, `width: 100%`
- Toolbar overlay kanan atas (flowchart): `[Fit⤢] [+] [-] [TD|LR] [Grid] [Map] [↩] [↪]`

#### Tabel Input Pareto
- `max-height: 340px`, `overflow-y: auto` jika > 8 baris
- Input angka: `text-align: right`, font `--font-mono`
- Inline validation: border merah + ⚠ icon saat blur jika nilai tidak valid
- Keyboard: `Enter` di field nilai → tambah baris baru; `Ctrl+Enter` → render

#### Toast Notification
- `position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999`
- Animasi masuk: `translateX(110%)` → `translateX(0)`, `0.3s ease`
- Auto-dismiss: 3500ms (success), 5000ms (warning/error)
- Klik untuk dismiss; max 3 tampil sekaligus (FIFO)

#### Modal Konfirmasi Reset
- Overlay: `rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)`
- Animasi: `scale(0.9)` → `scale(1)`, `0.2s ease`
- Focus trap: `Tab` hanya antara [Batal] dan [Hapus Semua]
- `Escape` → tutup (sama dengan Batal)

#### Empty State
- Flowchart: SVG ASCII diagram + teks "Tambahkan node pertama Anda..."
- Pareto: ASCII bar chart + teks "Masukkan data kategori & frekuensi..."
- Posisi: center dalam area canvas

### 4.5 Prinsip UX

| Prinsip | Implementasi |
|---|---|
| Immediate Feedback | Canvas update setelah render; tombol disabled + spinner saat kalkulasi |
| Progressive Disclosure | Opsi lanjutan (warna node, Y-label) dalam `<details>` collapsible |
| Error Prevention | Validasi inline saat blur; tombol Render disabled jika < 2 data |
| Undo Safety | Ctrl+Z/Redo (flowchart); Reset wajib konfirmasi modal |
| Keyboard Accessible | Tab navigasi, Enter submit, Esc tutup modal, F = fit screen |
| Mobile Friendly | Panel di atas canvas < 640px; font ≥ 14px; touch pinch-zoom |
| Empty State | Ilustrasi + panduan teks yang actionable |
| Data Persistence | Auto-save tiap mutasi ke `localStorage` key `sqt_state_v1` |
| Restore on Reload | Banner "Lanjutkan sesi sebelumnya?" jika ada data tersimpan |

### 4.6 Animasi & Micro-Interactions

```css
/* Global transitions */
*, *::before, *::after {
  transition: color 0.15s ease, background-color 0.15s ease,
              border-color 0.15s ease, opacity 0.15s ease;
}

/* Node appear */
@keyframes nodeAppear {
  from { opacity:0; transform:scale(0.75); }
  to   { opacity:1; transform:scale(1); }
}
.fc-node { animation: nodeAppear 0.2s ease forwards; }

/* Edge draw — [FIX B9] dasharray/dashoffset di-set DINAMIS per edge di JS */
/* JS: path.setAttribute('stroke-dasharray', edgeLen) */
/* JS: path.setAttribute('stroke-dashoffset', edgeLen) */
@keyframes drawEdge {
  to { stroke-dashoffset: 0; }
}
.fc-edge { animation: drawEdge 0.35s ease forwards; }

/* Panel transition */
.tool-panel { animation: fadeSlideIn 0.25s ease forwards; }
@keyframes fadeSlideIn {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0); }
}

/* Toast */
@keyframes toastIn {
  from { transform:translateX(110%); opacity:0; }
  to   { transform:translateX(0); opacity:1; }
}

button:active { transform: scale(0.97); }
```

---

## 5. 🔧 CATATAN IMPLEMENTASI UNTUK AI AGENT

### 5.1 Dependencies via CDN (Urutan KRITIS — jangan diubah)

```html
<!-- Di dalam <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;600;700&family=Fraunces:ital,wght@0,700;1,700&display=swap" rel="stylesheet">

<!-- Di akhir <body>, SEBELUM js/ lokal -->

<!-- 1. Chart.js v4 — WAJIB -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>

<!-- 2. Annotation plugin — WAJIB setelah Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js"></script>

<!-- 3. DataLabels plugin — OPSIONAL; uncomment jika ingin label di atas bar -->
<!-- <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"></script> -->

<!-- 4. TIDAK perlu library flowchart — SVG manual sesuai §3A -->

<!-- 5. JS lokal — URUTAN WAJIB -->
<script src="js/app.js"></script>           <!-- harus PERTAMA -->
<script src="js/flowchart-undo.js"></script> <!-- harus sebelum flowchart.js -->
<script src="js/flowchart.js"></script>
<script src="js/pareto.js"></script>        <!-- harus TERAKHIR -->
```

> ⚠️ `annotationPlugin` HARUS di-register di pareto.js:
> ```js
> if (typeof annotationPlugin !== 'undefined') Chart.register(annotationPlugin)
> ```

### 5.2 Netlify Config (`netlify.toml`)

```toml
[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options        = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy        = "strict-origin-when-cross-origin"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'none';"
```

### 5.3 State Management (app.js)

```js
const AppState = {
  activeTab: 'flowchart',     // 'flowchart' | 'pareto'
  flowchart: {
    nodes:    [],             // { id, type, label, x?, y?, color? }
    edges:    [],             // { id, from, to, label }
    direction:'TD',           // 'TD' | 'LR'
    scale:    1,
    viewBox:  {x:0,y:0,w:800,h:600}
    // TIDAK ADA 'selected' — gunakan fcSelectedNodes terpisah
  },
  pareto: {
    title:'', threshold:80, unit:'', yLabel:'',
    rows:[]                   // { id, category, value }
  }
}

// [FIX B4] Set terpisah — tidak di-persist, tidak di-serialize
let fcSelectedNodes = new Set()

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
        // TIDAK include 'selected'
      },
      pareto: {...AppState.pareto}
    }))
  } catch(e) {
    console.warn('[SQT] saveState gagal:', e)
    if (!window._storageWarnShown) {
      showToast('warning','Auto-save tidak tersedia di mode ini')
      window._storageWarnShown = true
    }
  }
}

function restoreState() {
  try {
    const raw = localStorage.getItem('sqt_state_v1')
    if (!raw) return false
    const p = JSON.parse(raw)
    if (typeof p !== 'object' || p === null) return false

    // [FIX B13] Full schema validation
    if (p.flowchart) {
      const fc = p.flowchart
      if (!Array.isArray(fc.nodes))    fc.nodes    = []
      if (!Array.isArray(fc.edges))    fc.edges    = []
      if (!['TD','LR'].includes(fc.direction)) fc.direction = 'TD'
      if (typeof fc.scale !== 'number')  fc.scale   = 1
      if (typeof fc.viewBox !== 'object') fc.viewBox = {x:0,y:0,w:800,h:600}

      // Validate node shape + tipe
      const validTypes = ['start','end','process','decision','io','connector']
      fc.nodes = fc.nodes.filter(n =>
        n && typeof n.id==='string' && typeof n.label==='string' &&
        validTypes.includes(n.type)
      )
      // Validate edge referensi node yang ada
      const ids = new Set(fc.nodes.map(n=>n.id))
      fc.edges = fc.edges.filter(e =>
        e && typeof e.id==='string' && ids.has(e.from) && ids.has(e.to)
      )
      Object.assign(AppState.flowchart, fc)
    }

    if (p.pareto) {
      const pr = p.pareto
      if (!Array.isArray(pr.rows)) pr.rows = []
      if (typeof pr.threshold !== 'number') pr.threshold = 80
      pr.threshold = Math.max(1, Math.min(99, pr.threshold))
      pr.rows = pr.rows.filter(r =>
        r && typeof r.id==='string' && typeof r.category==='string' &&
        typeof r.value==='number' && r.value > 0
      )
      Object.assign(AppState.pareto, pr)
    }

    if (typeof p.activeTab === 'string') AppState.activeTab = p.activeTab
    fcSelectedNodes = new Set()  // reset selection

    return AppState.flowchart.nodes.length > 0 ||
           AppState.pareto.rows.length > 0
  } catch(e) {
    console.warn('[SQT] restoreState gagal:', e)
    return false
  }
}
```

### 5.4 DOM ID Registry (Referensi Wajib)

> Agent HARUS menggunakan ID berikut secara **persis**. Tidak boleh ada perubahan.

| ID Element | Tipe | Dipakai oleh | Keterangan |
|---|---|---|---|
| `tab-flowchart` | `<button>` | app.js | Tab selector Flowchart |
| `tab-pareto` | `<button>` | app.js | Tab selector Pareto |
| `panel-flowchart` | `<div>` | app.js | Panel tool Flowchart |
| `panel-pareto` | `<div>` | app.js | Panel tool Pareto |
| `fc-canvas` | `<svg>` | flowchart.js | Canvas SVG utama |
| `fc-minimap` | `<svg>` | flowchart.js | Mini-map SVG |
| `fc-node-label` | `<input>` | flowchart.js | Input label node baru |
| `fc-node-type` | `<select>` | flowchart.js | Dropdown tipe node |
| `fc-node-color` | `<input type=color>` | flowchart.js | Picker warna node |
| `fc-edge-from` | `<select>` | flowchart.js | Node asal koneksi |
| `fc-edge-to` | `<select>` | flowchart.js | Node tujuan koneksi |
| `fc-edge-label` | `<input>` | flowchart.js | Label edge (Yes/No/custom) |
| `btn-fc-add-node` | `<button>` | flowchart.js | Tambah node |
| `btn-fc-add-edge` | `<button>` | flowchart.js | Tambah koneksi |
| `btn-fc-delete` | `<button>` | flowchart.js | Hapus node terpilih |
| `btn-undo` | `<button>` | flowchart-undo.js | Undo |
| `btn-redo` | `<button>` | flowchart-undo.js | Redo |
| `btn-fc-fit` | `<button>` | flowchart.js | Fit to Screen |
| `btn-fc-zoom-in` | `<button>` | flowchart.js | Zoom In |
| `btn-fc-zoom-out` | `<button>` | flowchart.js | Zoom Out |
| `btn-fc-direction` | `<button>` | flowchart.js | Toggle TD/LR |
| `btn-fc-minimap` | `<button>` | flowchart.js | Toggle Mini-map |
| `btn-fc-export-png` | `<button>` | flowchart.js | Export PNG |
| `btn-fc-export-svg` | `<button>` | flowchart.js | Export SVG |
| `btn-fc-reset` | `<button>` | flowchart.js | Reset Flowchart |
| `pareto-canvas` | `<canvas>` | pareto.js | Canvas Chart.js |
| `pareto-rows-container` | `<tbody>` | pareto.js | Container baris tabel |
| `pareto-stats` | `<div>` | pareto.js | Panel statistik |
| `pareto-summary-table` | `<table>` | pareto.js | Tabel ringkasan output |
| `pareto-title` | `<input>` | pareto.js | Judul chart |
| `pareto-threshold` | `<input>` | pareto.js | Threshold % |
| `pareto-unit` | `<input>` | pareto.js | Unit label |
| `pareto-ylabel` | `<input>` | pareto.js | Y-axis label |
| `btn-pareto-render` | `<button>` | pareto.js | Render chart |
| `btn-pareto-add-row` | `<button>` | pareto.js | Tambah baris |
| `btn-pareto-import-csv` | `<input type=file>` | pareto.js | File input CSV (hidden) |
| `btn-pareto-paste` | `<button>` | pareto.js | Paste clipboard |
| `btn-pareto-export-png` | `<button>` | pareto.js | Export PNG chart |
| `btn-pareto-export-csv` | `<button>` | pareto.js | Export CSV data |
| `btn-pareto-reset` | `<button>` | pareto.js | Reset Pareto |
| `modal-confirm` | `<div>` | app.js | Modal konfirmasi |
| `modal-confirm-msg` | `<p>` | app.js | Pesan dalam modal |
| `modal-confirm-ok` | `<button>` | app.js | Tombol konfirmasi |
| `modal-confirm-cancel` | `<button>` | app.js | Tombol batal |
| `toast-container` | `<div>` | app.js | Container toast |
| `restore-prompt` | `<div>` | app.js | Banner restore |
| `empty-state-flowchart` | `<div>` | app.js | Empty state FC |
| `empty-state-pareto` | `<div>` | app.js | Empty state Pareto |

### 5.5 Urutan Eksekusi Benar (Critical Order)

```
DOMContentLoaded:
  [1] restoreState()        → returns hasData
  [2] initTabs()
  [3] initFlowchart()       → UndoManager.snapshot() di akhir
  [4] initPareto()
  [5] initGlobalErrorHandlers()   ← WAJIB sebelum renderInitialState
  [6] renderInitialState()
        hasData → showRestorePrompt()
        ELSE    → showEmptyState(AppState.activeTab)
```

### 5.6 Pitfalls yang Wajib Dihindari Agent

| # | Pitfall | Solusi | FAIL Signal |
|---|---|---|---|
| 1 | Lupa destroy Chart.js sebelum re-render | `window.paretoChartInstance?.destroy()` di Fase 3 | "Canvas is already in use" |
| 2 | `isVital` self-reference dalam `.map()` | Hitung di PASS 2 setelah `tempEnriched` selesai | Semua baris Vital Few atau semua Useful Many |
| 3 | SVG `<text>` overflow keluar node | `<clipPath>` per node (Fase 6) | Teks melampaui boundary shape |
| 4 | `annotationPlugin` tidak ter-register | Guard `typeof annotationPlugin!=='undefined'` | TypeError di Chart constructor |
| 5 | ChartDataLabels tanpa CDN | Guard `typeof ChartDataLabels!=='undefined'` | ReferenceError saat register |
| 6 | `Set` di-serialize ke JSON | Simpan selection di `fcSelectedNodes` terpisah, bukan di AppState | Selection hilang setelah reload |
| 7 | BFS infinite loop jika ada cycle | `visited_bfs` Set; cycle detection di Fase 1 | Browser hang/tab crash |
| 8 | localStorage tidak tersedia | try-catch di saveState/restoreState; banner warning | QuotaExceededError tanpa fallback |
| 9 | Canvas PNG export blank | `injectInlineStyles()` sebelum serialize; `img.onerror` fallback | File PNG putih/kosong |
| 10 | Decision arrow bertumpuk | TD: Yes=kanan, No=kiri; LR: Yes=bawah, No=atas [FIX B5] | Arrow tumpang tindih |
| 11 | Chart tooltip terpotong | `position:'nearest'` + `clip:false` di annotation | Tooltip tidak muncul di tepi |
| 12 | Keyboard shortcut di input field | Guard `e.target.tagName==='INPUT'` | Del menghapus node saat mengetik |
| 13 | `mouseup` di luar window | `mouseleave` listener di `document` reset `isPanning` | Pan tidak berhenti saat keluar browser |
| 14 | Format angka lokal CSV salah parse | `normalizeNumber()` 5-pola [FIX B3] | "1.234" → NaN atau 1 |
| 15 | viewBox tidak sinkron setelah undo | `fitToScreen()` setelah `renderFlowchart()` [FIX B15] | Canvas tergeser setelah undo |
| 16 | `svgWidth` dipakai sebelum dihitung | `provisionalSvgW` dulu, recalculate setelah BFS [FIX B1] | Node keluar batas canvas |
| 17 | clipPath rect untuk connector | Gunakan `<circle>` clipPath [FIX B10] | Teks connector terpotong kotak |
| 18 | Edge tertimpa node | `edgeLayer` di bawah `nodeLayer` [FIX B18] | Arrow tidak terlihat |
| 19 | `innerHTML` dengan user data | `textContent` + `sanitizeText()` [FIX B19] | XSS vulnerability |
| 20 | `nodes.find()` undefined childId | Guard `IF !nodeMap[childId]: CONTINUE` [FIX B12] | BFS crash "Cannot read" |
| 21 | `restoreState()` tanpa validasi | Full schema validation [FIX B13] | Crash dari data localStorage korup |
| 22 | `fitToScreen()` abaikan diamond | Gunakan `nm.w`/`nm.h` per node [FIX B14] | Diamond terpotong setelah Fit |
| 23 | CSV quoted field dengan koma | `splitCSVLine()` state machine [FIX B3 lanjutan] | Field terpotong salah |

### 5.7 Build Checkpoints (Phase Verification)

#### Phase 1 — Fondasi

| # | Task | PASS | FAIL |
|---|---|---|---|
| 1.1 | HTML + CSS variables | Semua `var(--)` ter-resolve di DevTools | Nilai CSS var kosong/unresolved |
| 1.2 | Navbar + Hero | Tampil mobile & desktop, font load | Font fallback sans-serif |
| 1.3 | Tab router | Klik tab → panel berganti, `AppState.activeTab` update | Panel tidak berganti |
| 1.4 | AppState + save/restore | Isi data → refresh → restore prompt muncul | Data hilang setelah refresh |
| 1.5 | showToast + Modal | 3 tipe toast muncul, modal focus-trap berjalan | Toast tidak muncul |
| 1.6 | Global error handlers | `window.onerror` → toast; tidak ada uncaught error blank | Console error tanpa UI feedback |

#### Phase 2 — Pareto Chart

| # | Task | PASS | FAIL |
|---|---|---|---|
| 2.1 | Input table add/remove | Tambah 3, hapus 1 → AppState.pareto.rows sinkron | DOM tidak sinkron AppState |
| 2.2 | Render chart basic | 5 data → klik Render → dual-axis chart muncul | "Canvas already in use" |
| 2.3 | Threshold annotation | Threshold 80 → garis amber di 80%, label terlihat | Garis tidak muncul |
| 2.4 | Panel statistik + tabel | Total, Vital Few count, status benar | isVital semua true atau false |
| 2.5 | Import CSV multi-delimiter | .csv koma/semicolon/tab → data muncul | Parse error / data kosong |
| 2.6 | Paste + textarea fallback | Paste → render; gagal → textarea muncul | Error tanpa fallback |
| 2.7 | Export PNG + CSV | Download PNG; CSV dengan BOM (Excel dapat buka) | File kosong / encoding salah |
| 2.8 | Threshold dinamis | Ubah threshold → chart re-render, vitalCount berubah | Count tidak berubah |

#### Phase 3 — Flowchart Engine

| # | Task | PASS | FAIL |
|---|---|---|---|
| 3.1 | 5 shape types | Setiap tipe → shape yang benar di SVG | Shape salah tipe |
| 3.2 | Select + delete | Klik → ring highlight; Del → node + edges hilang | Edge orphan tertinggal |
| 3.3 | Edge + routing | 2 node → elbow arrow di edgeLayer (bawah nodeLayer) | Arrow tertimpa node |
| 3.4 | BFS layout TD | 5 node → layout rapi, tidak overlap | Node saling menimpa |
| 3.5 | Layout LR | Toggle → node bergeser, arrow ikut | Arrow tidak menyesuaikan |
| 3.6 | Undo/Redo 30 steps | Add 3 → Ctrl+Z 3× → canvas kosong; btn state benar | State tidak kembali |
| 3.7 | Zoom/Pan + touch | Scroll zoom; drag pan; pinch mobile | isPanning tidak reset |
| 3.8 | Fit Screen (F) | Pan jauh → F → semua node (termasuk diamond) terlihat | Diamond terpotong |
| 3.9 | Word wrap + clipPath | Label panjang → wrap multi-baris, tidak overflow | Teks keluar shape |
| 3.10 | Export PNG + SVG | PNG 2× resolution; SVG bisa dibuka browser | PNG blank / warna SVG hilang |

#### Phase 4 — Polish (Opsional)

| # | Task | PASS |
|---|---|---|
| 4.1 | Mini-map | Toggle → overlay muncul; viewport rect bergerak saat pan |
| 4.2 | Auto-save | addNode → localStorage update (DevTools Application tab) |
| 4.3 | Restore prompt | Refresh → banner muncul; Lanjutkan → data kembali |
| 4.4 | Mobile responsif | Panel di atas canvas, semua button accessible |

### 5.8 Contoh Input/Output Reference Cases

#### Case A: Flowchart 3-Node (TD)

**Input:**
```js
nodes = [
  { id:'n1', type:'start',   label:'Mulai'             },
  { id:'n2', type:'process', label:'Periksa Kualitas'  },
  { id:'n3', type:'end',     label:'Selesai'           }
]
edges = [
  { id:'e1', from:'n1', to:'n2', label:'' },
  { id:'e2', from:'n2', to:'n3', label:'' }
]
direction = 'TD'
```

**Expected Layout Output:**
```
BFS: levelMap = { n1:0, n2:1, n3:2 }
provisionalSvgW = max(1*(160+48)+40*2, 600) = 600

Koordinat:
  n1 → x=220, y=40   (center: 300, 65)
  n2 → x=220, y=162  (center: 300, 187)
  n3 → x=220, y=284  (center: 300, 309)

svgWidth  = max(220+160+40, 600) = 600
svgHeight = max(284+50+40, 400) = 400
```

#### Case B: Pareto 5-Kategori, Threshold 80%

**Input:**
```js
rawData = [
  { id:'r1', category:'Cacat Goresan', value:45 },
  { id:'r2', category:'Cacat Warna',   value:30 },
  { id:'r3', category:'Cacat Ukuran',  value:15 },
  { id:'r4', category:'Cacat Kemasan', value: 7 },
  { id:'r5', category:'Cacat Lain',    value: 3 }
]
options.threshold = 80
```

**Expected enriched (PASS 2):**
```
total = 100
i=0: Goresan, cumPct=45.0, isVital=true  (i===0)
i=1: Warna,   cumPct=75.0, isVital=true  (temp[0].cumPct=45.0 < 80)
i=2: Ukuran,  cumPct=90.0, isVital=true  (temp[1].cumPct=75.0 < 80)
i=3: Kemasan, cumPct=97.0, isVital=false (temp[2].cumPct=90.0 >= 80)
i=4: Lain,    cumPct=100.  isVital=false (temp[3].cumPct=97.0 >= 80)

vitalCount=3, trivialCount=2, crossIdx=2
```

#### Case C: normalizeNumber Edge Cases

| Input | Output | Pola |
|---|---|---|
| `"1234"` | `1234` | Integer |
| `"1.5"` | `1.5` | US decimal |
| `"1.234"` | `1234` | ID ribuan |
| `"1.234.567"` | `1234567` | ID ribuan multi |
| `"1.234,5"` | `1234.5` | ID desimal |
| `"1,5"` | `1.5` | ID desimal sederhana |
| `"0.5"` | `0.5` | Fraction |
| `"abc"` | `NaN` | Invalid |
| `""` | `NaN` | Empty |
| `"-5"` | `-5` | Negatif (akan ditolak validasi > 0) |

---

*Spesifikasi v4.0 — Hardened Production Edition*
*Dirancang untuk AI agent dalam satu sesi build. Client-side penuh, tanpa backend. Kompatibel Netlify Free Tier.*

*Perubahan dari v3.0: 19 bug fix (B1–B19), 14 fungsi helper didefinisikan lengkap (§0.8), 3 section baru (§0.9 Security, §0.10 Performance, §5.8 Reference Cases), pitfalls diperluas 15→23 dengan kolom FAIL Signal, checkpoints ditambah Phase 1.6 (global error handlers), normalizeNumber() dengan 5-pola deteksi angka internasional, edge routing decision node diperbaiki untuk TD dan LR, layer structure SVG dipisah edgeLayer/nodeLayer.*


---

## 📋 ADDENDUM v4.1 — TIGA TOOL BARU

> **Perubahan v4.1:** Menambahkan tiga tool baru — Control Chart, Histogram, dan Fishbone Diagram.
> Semua section yang ada di v4.0 tetap berlaku; addendum ini melengkapi (bukan mengganti).

### Perubahan Struktural

| Area | Perubahan |
|---|---|
| §0.2 Dependensi | +3 CSS file, +3 JS file baru |
| §0.3 Lifecycle | +3 init function baru |
| §0.4 Tab Switching | Tab selector diperluas ke 5 tool |
| §0.6 Peta Aksi | +3 tabel aksi baru |
| §1.3 File Structure | +3 CSS, +3 JS, updated AppState |
| §2 I/O | +§2C Control Chart, §2D Histogram, §2E Fishbone |
| §3 Algoritma | +§3D Control Chart, §3E Histogram, §3F Fishbone |
| §5.3 AppState | +controlChart, +histogram, +fishbone state |
| §5.4 DOM IDs | +47 ID baru (total ~93 ID) |
| §5.6 Pitfalls | +6 pitfall baru (total 29) |
| §5.7 Checkpoints | +Phase 5, 6, 7 |

---

## 0-EXT. EKSTENSI MASTER SYSTEM WORKFLOW

### 0.2-EXT Dependensi Modul (Updated untuk 5 Tool)

```
index.html
  └── loads (in order, CRITICAL):
       1–7. [sama seperti v4.0 — CSS + CDN]

       8. CDN: Chart.js v4.4.3
       9. CDN: chartjs-plugin-annotation@3.0.1
      10. CDN: chartjs-plugin-datalabels@2.2.0 (OPSIONAL)

      11. js/app.js              ← AppState (diperluas), semua utils
      12. js/flowchart-undo.js   ← UndoManager
      13. js/flowchart.js        ← Flowchart engine
      14. js/pareto.js           ← Pareto engine
      15. js/controlchart.js     ← Control Chart engine  [BARU]
      16. js/histogram.js        ← Histogram engine      [BARU]
      17. js/fishbone.js         ← Fishbone engine       [BARU]

CSS tambahan (di <head>, setelah css v4.0):
      css/controlchart.css       [BARU]
      css/histogram.css          [BARU]
      css/fishbone.css           [BARU]

controlchart.js exports (window global):
  window.renderControlChart(data, options)

histogram.js exports (window global):
  window.renderHistogram(data, options)

fishbone.js exports (window global):
  window.renderFishbone(state)

Dependency rules (tambahan):
  controlchart.js → memanggil app.js utils (getCSSVar, showToast, triggerDownload)
  histogram.js    → memanggil app.js utils + Chart.js
  fishbone.js     → memanggil app.js utils (SVG manual, tidak perlu Chart.js)
  TIDAK ADA cross-dependency antar engine
```

### 0.3-EXT Lifecycle (Updated)

```
DOMContentLoaded:
  [1] restoreState()
  [2] initTabs()              ← sekarang handle 5 tab
  [3] initFlowchart()
  [4] initPareto()
  [5] initControlChart()      [BARU]
  [6] initHistogram()         [BARU]
  [7] initFishbone()          [BARU]
  [8] initGlobalErrorHandlers()
  [9] renderInitialState()
```

### 0.4-EXT Tab Switching (Updated — 5 Tool)

```
Tab selector: [Flowchart] [Pareto] [Control Chart] [Histogram] [Fishbone]

switchTab(newTab):
  newTab ∈ 'flowchart'|'pareto'|'controlchart'|'histogram'|'fishbone'
  AppState.activeTab = newTab
  ... (pola sama dengan v4.0)
  renderActiveTab() diperluas:
    'controlchart' → renderControlChart(rows, getControlChartOptions())
    'histogram'    → renderHistogram(values, getHistogramOptions())
    'fishbone'     → renderFishbone(AppState.fishbone)
```

### 0.6-EXT Peta Aksi User → Handler (Tambahan)

#### Control Chart Actions

| User Action | Handler | Re-render? |
|---|---|---|
| Input nilai subgroup | `updateCCRow(id, field, val)` + `saveState()` | NO (on-blur) |
| Enter di field nilai | `addCCRow()` + fokus baris baru | NO |
| Klik "Render Chart" | `renderControlChart()` | YES full |
| Import CSV | `importCCCSV(file)` | YES full |
| Ubah sigma multiplier | `updateSigma(val)` + `saveState()` | YES full |
| Export PNG | `exportCCPNG()` | NO |
| Export CSV | `exportCCCSV()` | NO |
| Reset | `resetControlChart()` → modal | YES empty |

#### Histogram Actions

| User Action | Handler | Re-render? |
|---|---|---|
| Input nilai | `updateHistRow(id, val)` + `saveState()` | NO (on-blur) |
| Klik "+ Tambah Nilai" | `addHistRow()` | NO |
| Import CSV | `importHistCSV(file)` | YES full |
| Paste Clipboard | `pasteHistClipboard()` | YES full |
| Ubah jumlah bin | `updateBinCount(val)` | YES full |
| Ubah method bin | `updateBinMethod(val)` | YES full |
| Toggle kurva normal | `toggleNormalCurve()` | YES full |
| Export PNG | `exportHistPNG()` | NO |
| Reset | `resetHistogram()` → modal | YES empty |

#### Fishbone Actions

| User Action | Handler | Re-render? |
|---|---|---|
| Edit problem statement | `updateEffect(text)` + `saveState()` | YES full |
| Add cause ke kategori | `addCause(categoryId, text)` | YES full |
| Delete cause | `deleteCause(categoryId, causeId)` | YES full |
| Edit cause | `editCause(categoryId, causeId, text)` | YES full |
| Add sub-cause | `addSubCause(categoryId, causeId, text)` | YES full |
| Toggle kategori custom | `toggleCustomCategory()` | YES full |
| Export PNG | `exportFishbonePNG()` | NO |
| Export SVG | `exportFishboneSVG()` | NO |
| Reset | `resetFishbone()` → modal | YES empty |

---

## 2-EXT. BAGIAN I/O — TOOL BARU

### C. CONTROL CHART TOOL

**Konsep:** Shewhart Control Chart (Individual/Moving Range chart untuk data tunggal, atau X̄/R chart untuk subgroup).

```
INPUT                           PROSES                         OUTPUT
----------------------------------------------------------------------
[Judul Chart]                   Validasi:                      Chart Gabungan:
[Tipe Chart]: I-MR / X-bar R   • Min 8 data poin             • Line chart (nilai)
[Sigma Multiplier]: 1-4σ        • Nilai numerik positif        • UCL (garis merah)
  (default 3)                                                  • LCL (garis merah)
[Unit Label]                    Kalkulasi I-MR:                • CL/Mean (garis hijau)
                                • X̄  = mean semua nilai
[Tabel Data Entry]:             • MR = |Xi - Xi-1|            Panel Statistik:
  Kolom: Nilai (number)         • MR̄ = mean moving range      • Total titik data
  [+ Add Row]                   • UCL = X̄ + σ*d2inv*MR̄       • Mean (X̄)
  [× Remove Row]                • LCL = X̄ - σ*d2inv*MR̄       • Std Dev (σ)
                                  (d2=1.128 untuk n=2)         • UCL / LCL nilai
[Import CSV Button]             • Flag OOC: Xi > UCL           • Jumlah titik OOC
[Paste Clipboard]                 atau Xi < LCL
                                                               Highlight:
                                Kalkulasi X-bar/R:             • Titik OOC: merah
                                • Untuk setiap subgroup:         + marker besar
                                  X̄i = mean subgroup          • Titik normal: biru
                                  Ri = max - min subgroup
                                • X̄̄ = mean semua X̄i           Download:
                                • R̄ = mean semua Ri            • PNG chart
                                • UCL_x = X̄̄ + A2*R̄           • CSV dengan
                                • LCL_x = X̄̄ - A2*R̄             kalkulasi lengkap
                                • UCL_r = D4*R̄
                                  (tabel A2, D4 per n)
----------------------------------------------------------------------
```

**Input Fields Control Chart:**

| Field | Tipe | ID Element | Validasi |
|---|---|---|---|
| Judul | `<input type="text">` | `cc-title` | Opsional, max 100 char |
| Tipe Chart | `<select>` | `cc-type` | "imr" (Individual MR) atau "xbar" (X-bar R) |
| Sigma Multiplier | `<input type="number">` | `cc-sigma` | Float 1.0–4.0, default 3.0 |
| Subgroup Size | `<input type="number">` | `cc-subgroup-size` | Integer 2–10, hanya aktif saat tipe "xbar" |
| Unit Label | `<input type="text">` | `cc-unit` | Opsional, max 20 char |
| Nilai (per baris) | `<input type="text">` | Dinamis tbody | Wajib, numerik, handle format lokal |

**Tabel Konstanta Control Chart (built-in — tidak dari CDN):**

```js
// Konstanta untuk X-bar/R chart (nilai standar Shewhart)
const CC_CONSTANTS = {
  2:  { A2:1.880, D3:0,     D4:3.267, d2:1.128 },
  3:  { A2:1.023, D3:0,     D4:2.574, d2:1.693 },
  4:  { A2:0.729, D3:0,     D4:2.282, d2:2.059 },
  5:  { A2:0.577, D3:0,     D4:2.114, d2:2.326 },
  6:  { A2:0.483, D3:0,     D4:2.004, d2:2.534 },
  7:  { A2:0.419, D3:0.076, D4:1.924, d2:2.704 },
  8:  { A2:0.373, D3:0.136, D4:1.864, d2:2.847 },
  9:  { A2:0.337, D3:0.184, D4:1.816, d2:2.970 },
  10: { A2:0.308, D3:0.223, D4:1.777, d2:3.078 }
}
```

---

### D. HISTOGRAM TOOL

**Konsep:** Frequency distribution chart dengan opsional normal distribution overlay.

```
INPUT                           PROSES                         OUTPUT
----------------------------------------------------------------------
[Judul Chart]                   Sanitasi & Validasi:           Chart:
[Method Bins]:                  • Nilai numerik                • Bar histogram
  Auto (Sturges)                • Min 5 data poin               (frekuensi/densitas)
  Manual (input angka)          • Tidak semua sama             • Kurva normal overlay
  Freedman-Diaconis                                              (opsional, toggle)
[Jumlah Bins] (1-50)           Hitung Range:
[Spec Limit Bawah] (opsional)  • xMin = min(data)             Panel Statistik:
[Spec Limit Atas]  (opsional)  • xMax = max(data)             • N (jumlah data)
[Toggle Kurva Normal]          • range = xMax - xMin          • Mean (X̄)
[Unit Label]                                                   • Std Dev (σ)
                                Hitung Bin Width:              • Min / Max
[Tabel Data Entry]:             • Sturges: k=1+3.322*log10(n) • Cp / Cpk
  Kolom: Nilai (number)          binW=range/k                    (jika spec limit ada)
  [+ Add Row]                  • F-D: IQR=Q3-Q1
  [× Remove Row]                 binW=2*IQR/n^(1/3)           Highlight:
                                • Manual: input langsung       • Bin < LSL: merah
[Import CSV Button]                                            • Bin > USL: merah
[Paste Clipboard]              Frekuensi per bin:             • Bin dalam spec: hijau
                                FOR i in range(k):
                                  bin[i].lower = xMin+i*binW   Download:
                                  bin[i].upper = xMin+(i+1)*w  • PNG chart
                                  bin[i].count =               • CSV data mentah
                                    data.filter(x >=lower
                                                x < upper)
----------------------------------------------------------------------
```

**Input Fields Histogram:**

| Field | Tipe | ID Element | Validasi |
|---|---|---|---|
| Judul | `<input type="text">` | `hist-title` | Opsional, max 100 char |
| Method Bin | `<select>` | `hist-bin-method` | "sturges" \| "fd" \| "manual" |
| Jumlah Bin | `<input type="number">` | `hist-bin-count` | Integer 1–50, aktif jika method="manual" |
| Spec Limit Bawah (LSL) | `<input type="text">` | `hist-lsl` | Opsional, numerik |
| Spec Limit Atas (USL) | `<input type="text">` | `hist-usl` | Opsional, numerik; USL > LSL |
| Kurva Normal | `<input type="checkbox">` | `hist-normal-curve` | Boolean, default false |
| Unit Label | `<input type="text">` | `hist-unit` | Opsional, max 20 char |
| Nilai (per baris) | `<input type="text">` | Dinamis tbody | Wajib, numerik, handle format lokal |

---

### E. FISHBONE (CAUSE & EFFECT) TOOL

**Konsep:** Diagram Ishikawa untuk identifikasi akar penyebab masalah. Default 6M categories.

```
INPUT                           PROSES                         OUTPUT
----------------------------------------------------------------------
[Problem Statement]             Validasi:                      SVG Canvas:
  (effect — kotak di kanan)     • Problem statement wajib      ┌─────────────┐
                                • Min 1 kategori aktif         │   EFFECT    │
[Kategori (6M default)]:        • Cause tidak boleh kosong     │ (kotak kanan│
  ☑ Man                                                        └──────┬──────┘
  ☑ Machine                     Layout Engine:                        │
  ☑ Material                    • Tulang utama horizontal      ───────┼───────
  ☑ Method                      • Kategori pada tulang         (spine/backbone)
  ☑ Measurement                   diagonal ±45° dari spine     /  │  │  │  \
  ☑ Environment                 • Sub-tulang cabang dari bone  
  ☐ + Custom Category           • Teks label menyesuaikan      Tiap kategori:
                                  arah tulang                  • Tulang diagonal
[Per Kategori]:                                                • Label kategori
  + Add Cause                   Export:                        • Sebab (cause)
  - Delete Cause                • SVG serialize                • Sub-sebab
  + Add Sub-cause               • PNG via canvas               (sub-cause)
  Edit Cause inline
                                                               Download:
                                                               • PNG (2× retina)
                                                               • SVG (vector)
----------------------------------------------------------------------
```

**Input Fields Fishbone:**

| Field | Tipe | ID Element | Validasi |
|---|---|---|---|
| Problem Statement | `<textarea>` | `fb-effect` | Wajib, max 120 char |
| Kategori aktif | `<input type="checkbox">` | `fb-cat-{id}` | Min 1 aktif |
| Nama kategori custom | `<input type="text">` | `fb-custom-cat-label` | Opsional, max 30 char |
| Cause text | `<input type="text">` per cause | Dinamis | Wajib, max 60 char |
| Sub-cause text | `<input type="text">` per sub | Dinamis | Opsional, max 60 char |

---

## 3-EXT. ALGORITMA — TOOL BARU

### D. Algoritma Control Chart

```
FUNCTION renderControlChart(rawData, options):
options = {
  title:         string  (default:'Control Chart'),
  type:          string  'imr' | 'xbar'  (default:'imr'),
  sigmaMultiplier: number (default:3, range 1-4),
  subgroupSize:  integer (default:2, range 2-10, hanya untuk xbar),
  unitLabel:     string  (default:'Nilai')
}

════════════════════════════════════════
FASE 1 — VALIDASI INPUT
════════════════════════════════════════
  IF rawData.length < 8:
    showToast('error','Minimal 8 data poin diperlukan untuk Control Chart')
    RETURN

  values = []
  errors = []
  FOR d of rawData:
    v = normalizeNumber(String(d.value))  // reuse dari §3C
    IF isNaN(v): errors.push('Baris '+(i+1)+': "'+d.value+'" bukan angka'); CONTINUE
    values.push(v)

  IF errors.length > 0:
    showToast('warning', errors.length+' baris dilewati')
    IF values.length < 8: RETURN

  sigma = Math.max(1, Math.min(4, options.sigmaMultiplier || 3))

════════════════════════════════════════
FASE 2 — KALKULASI STATISTIK
════════════════════════════════════════
  // --- I-MR Chart (Individual & Moving Range) ---
  IF options.type === 'imr':
    n     = values.length
    xBar  = values.reduce((s,v)=>s+v,0) / n

    // Moving Range: |Xi - Xi-1|
    MRs   = values.slice(1).map((v,i) => Math.abs(v - values[i]))
    MRBar = MRs.reduce((s,v)=>s+v,0) / MRs.length

    // d2 = 1.128 untuk n=2 (subgroup size MR selalu 2)
    d2   = CC_CONSTANTS[2].d2   // 1.128
    sigmaEst = MRBar / d2       // estimasi sigma proses

    UCL  = xBar + sigma * sigmaEst
    LCL  = Math.max(0, xBar - sigma * sigmaEst)
    // LCL di-floor ke 0 jika data non-negatif — opsional tergantung konteks
    CL   = xBar

    // Flag Out-of-Control (OOC)
    OOC_points = values.map((v,i) => ({
      index: i, value: v,
      isOOC: v > UCL || v < LCL
    }))

    plotData = values           // sumbu X = urutan, Y = nilai individual
    plotMR   = [null, ...MRs]  // null untuk titik pertama

    // Statistik turunan
    stats = {
      n, mean: xBar, stdDev: sigmaEst,
      UCL, LCL, CL,
      UCL_MR: CC_CONSTANTS[2].D4 * MRBar,
      LCL_MR: 0,
      CL_MR:  MRBar,
      oocCount: OOC_points.filter(p=>p.isOOC).length
    }

  // --- X-bar/R Chart ---
  ELSE IF options.type === 'xbar':
    n = options.subgroupSize || 2
    k = Math.floor(values.length / n)   // jumlah subgroup lengkap

    IF k < 3:
      showToast('error','Butuh minimal '+( 3*n)+' data untuk X-bar/R chart dengan n='+n)
      RETURN

    const = CC_CONSTANTS[n]
    IF !const:
      showToast('error','Subgroup size '+n+' tidak didukung (2-10)'); RETURN

    // Kelompokkan ke subgroup
    subgroups = Array.from({length:k}, (_,i) => values.slice(i*n, (i+1)*n))

    xBars = subgroups.map(sg => sg.reduce((s,v)=>s+v,0)/sg.length)
    Rs    = subgroups.map(sg => Math.max(...sg)-Math.min(...sg))

    xBarBar = xBars.reduce((s,v)=>s+v,0)/k
    RBar    = Rs.reduce((s,v)=>s+v,0)/k

    UCL_x = xBarBar + const.A2 * RBar
    LCL_x = Math.max(0, xBarBar - const.A2 * RBar)
    UCL_r = const.D4 * RBar
    LCL_r = const.D3 * RBar

    OOC_x = xBars.map((v,i)=>({index:i, value:v, isOOC: v>UCL_x||v<LCL_x}))
    OOC_r = Rs.map((v,i)=>({index:i, value:v, isOOC: v>UCL_r||v<LCL_r}))

    plotData  = xBars
    plotRange = Rs
    stats = {
      n, k, mean:xBarBar, RBar,
      sigmaEst: RBar/const.d2,
      UCL_x, LCL_x, CL_x:xBarBar,
      UCL_r, LCL_r, CL_r:RBar,
      oocX: OOC_x.filter(p=>p.isOOC).length,
      oocR: OOC_r.filter(p=>p.isOOC).length
    }

════════════════════════════════════════
FASE 3 — DESTROY CHART LAMA
════════════════════════════════════════
  IF window.ccChartInstance: window.ccChartInstance.destroy()
  IF window.ccMRChartInstance: window.ccMRChartInstance.destroy()
  window.ccChartInstance = null
  window.ccMRChartInstance = null

════════════════════════════════════════
FASE 4 — WARNA TITIK
════════════════════════════════════════
  // OOC = merah besar, normal = biru kecil
  IF type === 'imr':
    ptColors = OOC_points.map(p => p.isOOC
      ? getCSSVar('--accent-red') : getCSSVar('--chart-bar-vital'))
    ptRadius = OOC_points.map(p => p.isOOC ? 8 : 4)
  ELSE:
    ptColors_x = OOC_x.map(p => p.isOOC ? getCSSVar('--accent-red') : getCSSVar('--chart-bar-vital'))
    ptColors_r = OOC_r.map(p => p.isOOC ? getCSSVar('--accent-red') : getCSSVar('--accent-amber'))

════════════════════════════════════════
FASE 5 — RENDER CHART.JS
════════════════════════════════════════
  // I-MR: satu chart (bisa split menjadi 2 canvas jika perlu)
  // X-bar/R: dua chart — atas X-bar, bawah R chart
  IF typeof annotationPlugin !== 'undefined': Chart.register(annotationPlugin)

  buildLineAnnotation(label, value, color, dash=[]):
    RETURN {
      type:'line', scaleID:'y', value,
      borderColor:color, borderWidth:2, borderDash:dash,
      label:{display:true, content:label, position:'end',
             backgroundColor:color+'DD', color:'#fff',
             font:{size:10,weight:'bold'}, padding:{x:4,y:2}}
    }

  // Chart 1: Individual (atau X-bar)
  ccConfig = {
    type:'line',
    data:{
      labels: plotData.map((_,i)=>'#'+(i+1)),
      datasets:[{
        label: type==='imr' ? 'Xi' : 'X̄',
        data: plotData,
        borderColor: getCSSVar('--chart-bar-vital'),
        borderWidth:2,
        pointBackgroundColor: ptColors || ptColors_x,
        pointRadius:       ptRadius  || ptRadius_x || 5,
        pointHoverRadius: 8,
        tension:0,
        fill:false
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{duration:400},
      scales:{
        x:{
          grid:{color:getCSSVar('--border-base')},
          ticks:{color:getCSSVar('--text-secondary'), font:{size:11}}
        },
        y:{
          grid:{color:getCSSVar('--border-base')},
          ticks:{color:getCSSVar('--text-secondary'), font:{family:getCSSVar('--font-mono'),size:11}},
          title:{display:true, text:options.unitLabel||'Nilai',
                 color:getCSSVar('--text-secondary'), font:{size:12}}
        }
      },
      plugins:{
        legend:{labels:{color:getCSSVar('--text-secondary')}},
        tooltip:{
          backgroundColor:getCSSVar('--bg-secondary'), borderColor:getCSSVar('--border-base'),
          borderWidth:1, titleColor:getCSSVar('--text-primary'), bodyColor:getCSSVar('--text-secondary'),
          callbacks:{
            afterLabel: item => {
              pt = OOC_points ? OOC_points[item.dataIndex] : OOC_x[item.dataIndex]
              RETURN pt.isOOC ? '⚠ OUT OF CONTROL' : 'In Control'
            }
          }
        },
        annotation:{
          clip:false,
          annotations:{
            UCL: buildLineAnnotation('UCL='+stats.UCL?.toFixed(3)||stats.UCL_x?.toFixed(3),
                   stats.UCL||stats.UCL_x, getCSSVar('--accent-red'), [6,4]),
            CL:  buildLineAnnotation('X̄='+stats.mean?.toFixed(3)||stats.xBarBar?.toFixed(3),
                   stats.CL||stats.CL_x, getCSSVar('--accent-green')),
            LCL: buildLineAnnotation('LCL='+stats.LCL?.toFixed(3)||stats.LCL_x?.toFixed(3),
                   stats.LCL||stats.LCL_x, getCSSVar('--accent-red'), [6,4])
          }
        }
      }
    }
  }
  window.ccChartInstance = new Chart(
    document.getElementById('cc-chart-canvas').getContext('2d'), ccConfig)

  // Chart 2 (hanya untuk I-MR): Moving Range chart
  IF type === 'imr':
    mrData = MRs  // length = n-1
    mrConfig = { ...// sama struktur, dengan UCL_MR, LCL_MR=0, CL_MR }
    window.ccMRChartInstance = new Chart(
      document.getElementById('cc-mr-canvas').getContext('2d'), mrConfig)

════════════════════════════════════════
FASE 6 — PANEL STATISTIK
════════════════════════════════════════
  statEl = document.getElementById('cc-stats')
  IF !statEl: RETURN
  statEl.innerHTML = ''
  // Build DOM nodes (textContent, no innerHTML with user data)
  // Tampilkan: N, Mean, StdDev, UCL, LCL, Sigma Multiplier, OOC count
  // Jika oocCount > 0: badge merah "PROSES TIDAK STABIL"
  // Jika oocCount = 0: badge hijau "PROSES STABIL"

════════════════════════════════════════
FASE 7 — EXPORT
════════════════════════════════════════
  exportCCPNG():
    IF !window.ccChartInstance: showToast('error','Render chart dulu'); RETURN
    triggerDownload(window.ccChartInstance.toBase64Image('image/png'),'control-chart.png')

  exportCCCSV():
    BOM = '\uFEFF'
    header = 'No,Nilai,Status,MR\n'  // I-MR example
    rows = values.map((v,i)=>{
      ooc = OOC_points[i].isOOC ? 'OOC' : 'OK'
      mr = i===0 ? '' : MRs[i-1].toFixed(4)
      RETURN (i+1)+','+v+','+ooc+','+mr
    }).join('\n')
    blob = new Blob([BOM+header+rows], {type:'text/csv;charset=utf-8'})
    triggerDownload(URL.createObjectURL(blob),'control-chart-data.csv')
```

---

### E. Algoritma Histogram

```
FUNCTION renderHistogram(rawData, options):
options = {
  title:     string  (default:'Histogram'),
  binMethod: string  'sturges'|'fd'|'manual' (default:'sturges'),
  binCount:  integer (hanya jika binMethod='manual', default:10),
  lsl:       number  (optional, Lower Spec Limit),
  usl:       number  (optional, Upper Spec Limit),
  showNormalCurve: boolean (default:false),
  unitLabel: string  (default:'Nilai')
}

════════════════════════════════════════
FASE 1 — VALIDASI & PARSE
════════════════════════════════════════
  IF rawData.length < 5:
    showToast('error','Minimal 5 data diperlukan untuk Histogram')
    RETURN

  values = []
  FOR d of rawData:
    v = normalizeNumber(String(d.value))
    IF !isNaN(v): values.push(v)

  IF values.length < 5:
    showToast('error','Minimal 5 nilai numerik valid')
    RETURN

  // Validasi spec limits
  IF options.lsl !== undefined AND options.usl !== undefined:
    IF options.lsl >= options.usl:
      showToast('error','LSL harus lebih kecil dari USL'); RETURN

════════════════════════════════════════
FASE 2 — STATISTIK DASAR
════════════════════════════════════════
  n    = values.length
  xMin = Math.min(...values)
  xMax = Math.max(...values)
  xBar = values.reduce((s,v)=>s+v,0) / n
  variance = values.reduce((s,v)=>s+(v-xBar)**2, 0) / (n-1)  // sample variance
  stdDev   = Math.sqrt(variance)

  // Quartiles untuk Freedman-Diaconis
  sorted = [...values].sort((a,b)=>a-b)
  Q1 = sorted[Math.floor(n*0.25)]
  Q3 = sorted[Math.floor(n*0.75)]
  IQR= Q3 - Q1

════════════════════════════════════════
FASE 3 — HITUNG BIN
════════════════════════════════════════
  IF xMin === xMax:
    showToast('error','Semua nilai identik — histogram tidak dapat dibuat'); RETURN

  // Hitung jumlah bin (k)
  SWITCH options.binMethod:
    'sturges': k = Math.ceil(1 + 3.322 * Math.log10(n))
    'fd':      binWidth_fd = 2 * IQR * Math.pow(n, -1/3)
               k = IQR===0 ? 10 : Math.ceil((xMax-xMin)/binWidth_fd)
    'manual':  k = Math.max(1, Math.min(50, options.binCount || 10))

  k = Math.max(2, Math.min(50, k))  // clamp 2-50
  binWidth = (xMax - xMin) / k

  // Buat bin array
  bins = Array.from({length:k}, (_,i) => ({
    lower: xMin + i*binWidth,
    upper: xMin + (i+1)*binWidth,
    count: 0,
    label: ''
  }))

  // Hitung frekuensi
  FOR v of values:
    idx = Math.min(Math.floor((v-xMin)/binWidth), k-1)  // clamp untuk xMax
    bins[idx].count++

  // Label bin (midpoint)
  bins.forEach(b => {
    mid = (b.lower+b.upper)/2
    b.label = mid.toFixed(2)
  })

════════════════════════════════════════
FASE 4 — KAPABILITAS PROSES (Cp/Cpk)
════════════════════════════════════════
  // Hanya hitung jika KEDUA spec limit tersedia
  IF options.lsl !== undefined AND options.usl !== undefined:
    Cp  = (options.usl - options.lsl) / (6 * stdDev)
    Cpl = (xBar - options.lsl)       / (3 * stdDev)
    Cpu = (options.usl - xBar)       / (3 * stdDev)
    Cpk = Math.min(Cpl, Cpu)
    // Interpretasi:
    //   Cp < 1.0  → proses tidak kapabel
    //   Cp 1.0-1.33 → kapabel tapi butuh monitoring
    //   Cp > 1.33 → proses kapabel
  ELSE:
    Cp=null; Cpk=null

════════════════════════════════════════
FASE 5 — DESTROY & WARNA BIN
════════════════════════════════════════
  IF window.histChartInstance: window.histChartInstance.destroy()
  window.histChartInstance = null

  // Warna bin: merah jika di luar spec, hijau jika di dalam, biru jika no spec
  barColors = bins.map(b => {
    IF options.lsl !== undefined AND b.upper <= options.lsl: RETURN getCSSVar('--accent-red')
    IF options.usl !== undefined AND b.lower >= options.usl: RETURN getCSSVar('--accent-red')
    IF options.lsl !== undefined OR options.usl !== undefined: RETURN getCSSVar('--accent-green')
    RETURN getCSSVar('--chart-bar-vital')
  })

════════════════════════════════════════
FASE 6 — KURVA NORMAL (opsional)
════════════════════════════════════════
  // Hanya jika options.showNormalCurve === true
  IF options.showNormalCurve:
    // Sampling kurva normal pada midpoint tiap bin
    normalDensity(x, mean, sd):
      RETURN (1/(sd*Math.sqrt(2*Math.PI))) * Math.exp(-0.5*((x-mean)/sd)**2)

    // Scale ke frekuensi (bukan densitas): multiply by n*binWidth
    normalPoints = bins.map(b => {
      mid = (b.lower+b.upper)/2
      RETURN normalDensity(mid, xBar, stdDev) * n * binWidth
    })

════════════════════════════════════════
FASE 7 — RENDER CHART.JS
════════════════════════════════════════
  IF typeof annotationPlugin !== 'undefined': Chart.register(annotationPlugin)

  datasets = [
    {
      type:'bar',
      label: 'Frekuensi',
      data:  bins.map(b=>b.count),
      backgroundColor: barColors,
      borderColor: barColors.map(c=>c+'CC'),
      borderWidth:1,
      borderRadius:2,
      categoryPercentage:1.0,   // bar menyatu (tidak ada gap)
      barPercentage:1.0
    }
  ]

  IF options.showNormalCurve:
    datasets.push({
      type:'line',
      label:'Distribusi Normal',
      data: normalPoints,
      borderColor: getCSSVar('--accent-amber'),
      borderWidth:2,
      pointRadius:0,
      tension:0.4,
      fill:false
    })

  // Annotations: LSL, USL
  annotations = {}
  IF options.lsl !== undefined:
    // Temukan posisi LSL di antara bin
    lslPos = (options.lsl - xMin) / binWidth - 0.5
    annotations.LSL = {
      type:'line', scaleID:'x', value:lslPos,
      borderColor:getCSSVar('--accent-red'), borderWidth:2, borderDash:[6,4],
      label:{display:true, content:'LSL='+options.lsl, position:'start',
             backgroundColor:getCSSVar('--accent-red'), color:'#fff',
             font:{size:10,weight:'bold'}}
    }
  IF options.usl !== undefined:
    uslPos = (options.usl - xMin) / binWidth - 0.5
    annotations.USL = {
      type:'line', scaleID:'x', value:uslPos,
      borderColor:getCSSVar('--accent-red'), borderWidth:2, borderDash:[6,4],
      label:{display:true, content:'USL='+options.usl, position:'end',
             backgroundColor:getCSSVar('--accent-red'), color:'#fff',
             font:{size:10,weight:'bold'}}
    }
  annotations.Mean = {
    type:'line', scaleID:'x', value:(xBar-xMin)/binWidth-0.5,
    borderColor:getCSSVar('--accent-green'), borderWidth:2,
    label:{display:true, content:'X̄='+xBar.toFixed(2), position:'center',
           backgroundColor:getCSSVar('--accent-green'), color:'#fff', font:{size:10}}
  }

  window.histChartInstance = new Chart(
    document.getElementById('hist-canvas').getContext('2d'), {
    type:'bar',
    data:{ labels:bins.map(b=>b.label), datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{duration:500},
      scales:{
        x:{
          grid:{color:getCSSVar('--border-base')},
          ticks:{color:getCSSVar('--text-secondary'), maxRotation:45},
          title:{display:true, text:options.unitLabel||'Nilai',
                 color:getCSSVar('--text-secondary')}
        },
        y:{
          min:0, grid:{color:getCSSVar('--border-base')},
          ticks:{color:getCSSVar('--text-secondary'), font:{family:getCSSVar('--font-mono'),size:11}},
          title:{display:true, text:'Frekuensi', color:getCSSVar('--text-secondary')}
        }
      },
      plugins:{
        legend:{labels:{color:getCSSVar('--text-secondary')}},
        tooltip:{
          backgroundColor:getCSSVar('--bg-secondary'), borderColor:getCSSVar('--border-base'),
          borderWidth:1, titleColor:getCSSVar('--text-primary'),
          callbacks:{
            title: items => {
              b=bins[items[0].dataIndex]
              RETURN b.lower.toFixed(3)+' – '+b.upper.toFixed(3)
            },
            label: item => ' Frekuensi: '+item.raw,
            afterLabel: item => {
              pct = (item.raw/n*100).toFixed(1)
              RETURN ' Relatif: '+pct+'%'
            }
          }
        },
        annotation:{clip:false, annotations}
      }
    }
  })

════════════════════════════════════════
FASE 8 — PANEL STATISTIK
════════════════════════════════════════
  // Tampilkan: N, Mean, StdDev, Min, Max, Bins count, Bin Width
  // Jika spec: + Cp, Cpk, % dalam spec
  statEl=document.getElementById('hist-stats'); IF !statEl: RETURN
  statEl.innerHTML=''
  // Build DOM dengan createElement/textContent
  inSpec = options.lsl!==undefined && options.usl!==undefined
    ? values.filter(v=>v>=options.lsl&&v<=options.usl).length
    : null
  // Badge: Cpk >= 1.33 → "KAPABEL", 1.0-1.33 → "MARGINAL", < 1.0 → "TIDAK KAPABEL"

════════════════════════════════════════
FASE 9 — EXPORT
════════════════════════════════════════
  exportHistPNG():
    triggerDownload(window.histChartInstance.toBase64Image('image/png'),'histogram.png')

  exportHistCSV():
    BOM='\uFEFF'; header='Bin Lower,Bin Upper,Midpoint,Frekuensi,Relatif (%)\n'
    rows=bins.map(b=>{
      pct=(b.count/n*100).toFixed(2)
      RETURN b.lower.toFixed(4)+','+b.upper.toFixed(4)+','+
             ((b.lower+b.upper)/2).toFixed(4)+','+b.count+','+pct
    }).join('\n')
    blob=new Blob([BOM+header+rows],{type:'text/csv;charset=utf-8'})
    triggerDownload(URL.createObjectURL(blob),'histogram-data.csv')
```

---

### F. Algoritma Fishbone (Ishikawa) Diagram

```
FUNCTION renderFishbone(state):
state = AppState.fishbone = {
  effect: string,           // problem statement
  categories: [             // array kategori (min 1, max 8)
    {
      id: string,
      label: string,        // "Man", "Machine", dll
      active: boolean,
      causes: [             // array penyebab
        { id, text, subCauses:[{id, text}] }
      ]
    }
  ]
}

DEFAULT_CATEGORIES (6M):
  [ {id:'man', label:'Man'}, {id:'machine', label:'Machine'},
    {id:'material', label:'Material'}, {id:'method', label:'Method'},
    {id:'measurement', label:'Measurement'}, {id:'environment', label:'Environment'} ]

════════════════════════════════════════
FASE 0 — VALIDASI
════════════════════════════════════════
  IF !state.effect || state.effect.trim()==='':
    showEmptyState('fishbone')
    RETURN
  activeCategories = state.categories.filter(c=>c.active)
  IF activeCategories.length===0:
    showToast('error','Aktifkan minimal 1 kategori'); RETURN

════════════════════════════════════════
FASE 1 — DIMENSI & LAYOUT KONSTANTA
════════════════════════════════════════
  SVG_W      = 1200  // lebar SVG total
  SVG_H      = 700   // tinggi SVG total
  SPINE_Y    = SVG_H / 2          // garis tengah horizontal (tulang belakang)
  SPINE_X1   = 80                  // start tulang belakang (kiri)
  SPINE_X2   = SVG_W - 200        // end tulang belakang (sebelum kotak effect)
  BOX_W      = 160                 // lebar kotak effect
  BOX_H      = 80                  // tinggi kotak effect
  BOX_X      = SVG_W - BOX_W - 20
  BOX_Y      = SPINE_Y - BOX_H/2

  BONE_ANGLE = 45                  // sudut tulang kategori (derajat)
  BONE_LEN   = 200                 // panjang tulang kategori

  // Posisi tulang kategori di sepanjang spine
  // Distribusikan secara merata, atas dan bawah secara bergantian
  n_active = activeCategories.length
  // Atas: categories dengan index genap (0,2,4,...)
  // Bawah: categories dengan index ganjil (1,3,5,...)
  topCats    = activeCategories.filter((_,i)=>i%2===0)
  bottomCats = activeCategories.filter((_,i)=>i%2!==0)
  maxSide    = Math.max(topCats.length, bottomCats.length)

  // Hitung interval X antar tulang
  usableWidth = SPINE_X2 - SPINE_X1 - 80  // sedikit margin kiri-kanan
  interval    = maxSide > 1 ? usableWidth / maxSide : usableWidth / 2

════════════════════════════════════════
FASE 2 — INISIALISASI SVG
════════════════════════════════════════
  svgEl = document.getElementById('fb-canvas')
  svgEl.setAttribute('viewBox','0 0 '+SVG_W+' '+SVG_H)
  svgEl.setAttribute('width', SVG_W)
  svgEl.setAttribute('height', SVG_H)
  svgEl.innerHTML = ''
  SVG_NS = 'http://www.w3.org/2000/svg'
  createNS = tag => document.createElementNS(SVG_NS, tag)

  // Background
  bg = createNS('rect')
  bg.setAttribute('width',SVG_W); bg.setAttribute('height',SVG_H)
  bg.setAttribute('fill', getCSSVar('--bg-secondary'))
  svgEl.appendChild(bg)

════════════════════════════════════════
FASE 3 — GAMBAR TULANG BELAKANG (SPINE)
════════════════════════════════════════
  // Garis horizontal utama
  spine = createNS('line')
  spine.setAttribute('x1',SPINE_X1); spine.setAttribute('y1',SPINE_Y)
  spine.setAttribute('x2',SPINE_X2); spine.setAttribute('y2',SPINE_Y)
  spine.setAttribute('stroke', getCSSVar('--text-primary'))
  spine.setAttribute('stroke-width','3')
  svgEl.appendChild(spine)

  // Panah di ujung kanan
  arrowPts = SPINE_X2+','+SPINE_Y+' '+(SPINE_X2-15)+','+(SPINE_Y-10)+' '+(SPINE_X2-15)+','+(SPINE_Y+10)
  arrow = createNS('polygon')
  arrow.setAttribute('points', arrowPts)
  arrow.setAttribute('fill', getCSSVar('--text-primary'))
  svgEl.appendChild(arrow)

════════════════════════════════════════
FASE 4 — KOTAK EFFECT (KANAN)
════════════════════════════════════════
  rect = createNS('rect')
  rect.setAttribute('x',BOX_X); rect.setAttribute('y',BOX_Y)
  rect.setAttribute('width',BOX_W); rect.setAttribute('height',BOX_H)
  rect.setAttribute('rx','8')
  rect.setAttribute('fill', getCSSVar('--accent-red'))
  rect.setAttribute('fill-opacity','0.15')
  rect.setAttribute('stroke', getCSSVar('--accent-red'))
  rect.setAttribute('stroke-width','2')
  svgEl.appendChild(rect)

  // Teks effect — wordWrap reuse dari flowchart.js
  effectLines = wordWrap(sanitizeText(state.effect), 18)
  lineH_fb = 18; startY_e = BOX_Y + BOX_H/2 - (effectLines.length*lineH_fb)/2 + lineH_fb/2
  FOR i, line of effectLines:
    t=createNS('text')
    t.setAttribute('x', BOX_X+BOX_W/2); t.setAttribute('y', startY_e+i*lineH_fb)
    t.setAttribute('text-anchor','middle'); t.setAttribute('dominant-baseline','middle')
    t.setAttribute('fill', getCSSVar('--text-primary'))
    t.setAttribute('font-size','13'); t.setAttribute('font-weight','600')
    t.textContent = line
    svgEl.appendChild(t)

════════════════════════════════════════
FASE 5 — GAMBAR TULANG KATEGORI + CAUSES
════════════════════════════════════════
  // Hitung posisi X setiap tulang kategori
  assignBoneX(cats, side):
    // 'top' atau 'bottom'
    n = cats.length
    FOR i, cat of cats:
      // Distribusikan dari kanan ke kiri
      boneX = SPINE_X2 - 60 - (n-1-i) * interval - interval/2
      cat.boneX = boneX

  assignBoneX(topCats, 'top')
  assignBoneX(bottomCats, 'bottom')

  // Render semua tulang
  FOR cat of activeCategories:
    isTop = topCats.includes(cat)
    boneX = cat.boneX
    angle = isTop ? -BONE_ANGLE : BONE_ANGLE  // atas = negatif, bawah = positif
    rad   = angle * Math.PI / 180

    // Ujung luar tulang kategori (diagonal)
    outerX = boneX - Math.cos(rad)*BONE_LEN
    outerY = SPINE_Y - Math.sin(rad)*BONE_LEN

    // Gambar tulang diagonal
    bone = createNS('line')
    bone.setAttribute('x1',outerX); bone.setAttribute('y1',outerY)
    bone.setAttribute('x2',boneX);  bone.setAttribute('y2',SPINE_Y)
    bone.setAttribute('stroke', getCSSVar('--accent-amber'))
    bone.setAttribute('stroke-width','2.5')
    svgEl.appendChild(bone)

    // Label kategori di ujung luar
    catLabel = createNS('text')
    catLabel.setAttribute('x', outerX)
    catLabel.setAttribute('y', isTop ? outerY - 12 : outerY + 18)
    catLabel.setAttribute('text-anchor','middle')
    catLabel.setAttribute('fill', getCSSVar('--accent-amber'))
    catLabel.setAttribute('font-size','13')
    catLabel.setAttribute('font-weight','700')
    catLabel.setAttribute('font-family', getCSSVar('--font-body'))
    catLabel.textContent = sanitizeText(cat.label)
    svgEl.appendChild(catLabel)

    // --- Render causes ---
    causes = cat.causes.filter(c=>c.text.trim()!=='')
    FOR ci, cause of causes:
      // Posisi penyebab di sepanjang tulang utama
      t_pos  = (ci+1) / (causes.length+1)  // 0-1 sepanjang tulang
      cX     = outerX + (boneX-outerX)*t_pos
      cY     = outerY + (SPINE_Y-outerY)*t_pos

      // Sub-tulang horizontal dari tulang diagonal ke kanan/kiri
      causeLen = 90
      // Sub-tulang sejajar spine
      subEndX = isTop ? cX + causeLen : cX + causeLen
      // Sebenarnya tegak lurus tulang kategori:
      subAngle = isTop ? 0 : 0  // Simplifikasi: selalu horizontal
      // Label di samping sub-tulang
      causeLine = createNS('line')
      causeLine.setAttribute('x1', cX); causeLine.setAttribute('y1', cY)
      causeLine.setAttribute('x2', subEndX); causeLine.setAttribute('y2', cY)
      causeLine.setAttribute('stroke', getCSSVar('--text-secondary'))
      causeLine.setAttribute('stroke-width','1.5')
      svgEl.appendChild(causeLine)

      // Titik persimpangan pada tulang utama
      dot = createNS('circle')
      dot.setAttribute('cx',cX); dot.setAttribute('cy',cY); dot.setAttribute('r','4')
      dot.setAttribute('fill', getCSSVar('--accent-amber'))
      svgEl.appendChild(dot)

      // Teks penyebab
      causeTxt = createNS('text')
      causeTxt.setAttribute('x', subEndX + (isTop ? 4 : 4))
      causeTxt.setAttribute('y', cY + (isTop ? -5 : 12))
      causeTxt.setAttribute('text-anchor','start')
      causeTxt.setAttribute('fill', getCSSVar('--text-primary'))
      causeTxt.setAttribute('font-size','11')
      causeTxt.textContent = sanitizeText(cause.text.slice(0,30))
      svgEl.appendChild(causeTxt)

      // --- Sub-causes ---
      subCauses = cause.subCauses?.filter(s=>s.text.trim()!=='') || []
      FOR si, sub of subCauses:
        subT = (si+1)/(subCauses.length+1)
        // Posisi di sepanjang sub-tulang
        subX = cX + (subEndX-cX)*subT
        subY = cY
        // Tanda kecil ke atas/bawah
        miniLen = 25
        miniY = isTop ? subY - miniLen : subY + miniLen
        miniLine = createNS('line')
        miniLine.setAttribute('x1',subX); miniLine.setAttribute('y1',subY)
        miniLine.setAttribute('x2',subX); miniLine.setAttribute('y2',miniY)
        miniLine.setAttribute('stroke', getCSSVar('--text-muted'))
        miniLine.setAttribute('stroke-width','1')
        svgEl.appendChild(miniLine)
        // Teks sub-cause
        subTxt = createNS('text')
        subTxt.setAttribute('x', subX)
        subTxt.setAttribute('y', isTop ? miniY-4 : miniY+10)
        subTxt.setAttribute('text-anchor','middle')
        subTxt.setAttribute('fill', getCSSVar('--text-muted'))
        subTxt.setAttribute('font-size','9')
        subTxt.textContent = sanitizeText(sub.text.slice(0,20))
        svgEl.appendChild(subTxt)

════════════════════════════════════════
FASE 6 — JUDUL
════════════════════════════════════════
  // Judul diagram di atas kiri
  title = createNS('text')
  title.setAttribute('x', SVG_W/2); title.setAttribute('y', 28)
  title.setAttribute('text-anchor','middle')
  title.setAttribute('fill', getCSSVar('--text-primary'))
  title.setAttribute('font-size','16'); title.setAttribute('font-weight','700')
  title.setAttribute('font-family', getCSSVar('--font-heading'))
  title.textContent = 'Fishbone Diagram'
  svgEl.appendChild(title)

════════════════════════════════════════
FASE 7 — EXPORT
════════════════════════════════════════
  // Gunakan teknik yang sama dengan exportFlowchartPNG/SVG di §3A Fase 10
  exportFishbonePNG():
    cl=svgEl.cloneNode(true); injectInlineStyles(cl)  // reuse dari app.js
    ss=new XMLSerializer().serializeToString(cl)
    canvas=document.createElement('canvas')
    canvas.width=SVG_W*2; canvas.height=SVG_H*2
    ctx=canvas.getContext('2d')
    ctx.fillStyle=getCSSVar('--bg-secondary')||'#1A1D27'
    ctx.fillRect(0,0,canvas.width,canvas.height)
    img=new Image()
    blob=new Blob([ss],{type:'image/svg+xml;charset=utf-8'})
    url=URL.createObjectURL(blob)
    img.onload=()=>{
      ctx.drawImage(img,0,0,canvas.width,canvas.height)
      URL.revokeObjectURL(url)
      triggerDownload(canvas.toDataURL('image/png'),'fishbone.png')
    }
    img.onerror=()=>{
      URL.revokeObjectURL(url)
      triggerDownload(canvas.toDataURL('image/png'),'fishbone.png')
    }
    img.src=url

  exportFishboneSVG():
    cl=svgEl.cloneNode(true); injectInlineStyles(cl)
    ss=new XMLSerializer().serializeToString(cl)
    blob=new Blob([ss],{type:'image/svg+xml;charset=utf-8'})
    triggerDownload(URL.createObjectURL(blob),'fishbone.svg')
```

---

## 5-EXT. CATATAN IMPLEMENTASI — TOOL BARU

### 5.3-EXT AppState (Updated — 5 Tool)

```js
// Update AppState di app.js — tambahkan 3 sub-state baru
const AppState = {
  activeTab: 'flowchart',  // +3 nilai: 'controlchart'|'histogram'|'fishbone'

  // ... flowchart dan pareto tetap sama ...

  controlChart: {          // [BARU]
    title:    '',
    type:     'imr',       // 'imr' | 'xbar'
    sigma:    3,
    subgroupSize: 2,
    unit:     '',
    rows:     []           // { id, value }
  },

  histogram: {             // [BARU]
    title:     '',
    binMethod: 'sturges',  // 'sturges' | 'fd' | 'manual'
    binCount:  10,
    lsl:       null,
    usl:       null,
    showNormal:false,
    unit:      '',
    rows:      []          // { id, value }
  },

  fishbone: {              // [BARU]
    effect: '',            // problem statement
    categories: [
      { id:'man',         label:'Man',         active:true,  causes:[] },
      { id:'machine',     label:'Machine',     active:true,  causes:[] },
      { id:'material',    label:'Material',    active:true,  causes:[] },
      { id:'method',      label:'Method',      active:true,  causes:[] },
      { id:'measurement', label:'Measurement', active:true,  causes:[] },
      { id:'environment', label:'Environment', active:true,  causes:[] }
      // causes item: { id, text, subCauses:[{id, text}] }
    ]
  }
}

// Update restoreState() — tambahkan validasi untuk 3 state baru
// (pola sama seperti flowchart dan pareto di §5.3)
function restoreState() {
  // ... existing code ...
  if (p.controlChart) {
    const cc = p.controlChart
    if (!Array.isArray(cc.rows)) cc.rows = []
    if (!['imr','xbar'].includes(cc.type)) cc.type = 'imr'
    cc.sigma = Math.max(1, Math.min(4, cc.sigma || 3))
    cc.subgroupSize = Math.max(2, Math.min(10, cc.subgroupSize || 2))
    cc.rows = cc.rows.filter(r => r && typeof r.id==='string' && typeof r.value==='number')
    Object.assign(AppState.controlChart, cc)
  }
  if (p.histogram) {
    const h = p.histogram
    if (!Array.isArray(h.rows)) h.rows = []
    if (!['sturges','fd','manual'].includes(h.binMethod)) h.binMethod='sturges'
    h.binCount = Math.max(1, Math.min(50, h.binCount || 10))
    h.rows = h.rows.filter(r => r && typeof r.id==='string' && typeof r.value==='number')
    Object.assign(AppState.histogram, h)
  }
  if (p.fishbone) {
    const fb = p.fishbone
    if (typeof fb.effect !== 'string') fb.effect = ''
    if (!Array.isArray(fb.categories)) fb.categories = DEFAULT_CATEGORIES
    fb.categories = fb.categories.filter(c =>
      c && typeof c.id==='string' && typeof c.label==='string'
    )
    fb.categories.forEach(c => {
      if (!Array.isArray(c.causes)) c.causes = []
      c.causes = c.causes.filter(ca => ca && typeof ca.text==='string')
      c.causes.forEach(ca => {
        if (!Array.isArray(ca.subCauses)) ca.subCauses = []
      })
    })
    Object.assign(AppState.fishbone, fb)
  }
  // ...
}
```

### 5.4-EXT DOM ID Registry — Tool Baru

#### Control Chart IDs

| ID Element | Tipe | Dipakai oleh | Keterangan |
|---|---|---|---|
| `tab-controlchart` | `<button>` | app.js | Tab selector Control Chart |
| `panel-controlchart` | `<div>` | app.js | Panel tool Control Chart |
| `cc-chart-canvas` | `<canvas>` | controlchart.js | Canvas chart utama (Individual/X-bar) |
| `cc-mr-canvas` | `<canvas>` | controlchart.js | Canvas MR chart (hanya untuk I-MR) |
| `cc-title` | `<input>` | controlchart.js | Judul chart |
| `cc-type` | `<select>` | controlchart.js | Tipe: imr / xbar |
| `cc-sigma` | `<input type=number>` | controlchart.js | Sigma multiplier (1–4) |
| `cc-subgroup-size` | `<input type=number>` | controlchart.js | Subgroup size (aktif saat xbar) |
| `cc-unit` | `<input>` | controlchart.js | Unit label |
| `cc-rows-container` | `<tbody>` | controlchart.js | Container baris data |
| `cc-stats` | `<div>` | controlchart.js | Panel statistik |
| `cc-summary-table` | `<table>` | controlchart.js | Tabel kalkulasi |
| `btn-cc-render` | `<button>` | controlchart.js | Render chart |
| `btn-cc-add-row` | `<button>` | controlchart.js | Tambah baris |
| `btn-cc-import-csv` | `<input type=file>` | controlchart.js | Import CSV |
| `btn-cc-paste` | `<button>` | controlchart.js | Paste clipboard |
| `btn-cc-export-png` | `<button>` | controlchart.js | Export PNG |
| `btn-cc-export-csv` | `<button>` | controlchart.js | Export CSV |
| `btn-cc-reset` | `<button>` | controlchart.js | Reset (→ modal) |
| `empty-state-controlchart` | `<div>` | app.js | Empty state Control Chart |

#### Histogram IDs

| ID Element | Tipe | Dipakai oleh | Keterangan |
|---|---|---|---|
| `tab-histogram` | `<button>` | app.js | Tab selector Histogram |
| `panel-histogram` | `<div>` | app.js | Panel tool Histogram |
| `hist-canvas` | `<canvas>` | histogram.js | Canvas chart |
| `hist-title` | `<input>` | histogram.js | Judul chart |
| `hist-bin-method` | `<select>` | histogram.js | Method: sturges/fd/manual |
| `hist-bin-count` | `<input type=number>` | histogram.js | Jumlah bin (aktif jika manual) |
| `hist-lsl` | `<input>` | histogram.js | Lower Spec Limit |
| `hist-usl` | `<input>` | histogram.js | Upper Spec Limit |
| `hist-normal-curve` | `<input type=checkbox>` | histogram.js | Toggle kurva normal |
| `hist-unit` | `<input>` | histogram.js | Unit label |
| `hist-rows-container` | `<tbody>` | histogram.js | Container baris data |
| `hist-stats` | `<div>` | histogram.js | Panel statistik (N, Mean, σ, Cp, Cpk) |
| `btn-hist-render` | `<button>` | histogram.js | Render chart |
| `btn-hist-add-row` | `<button>` | histogram.js | Tambah nilai |
| `btn-hist-import-csv` | `<input type=file>` | histogram.js | Import CSV |
| `btn-hist-paste` | `<button>` | histogram.js | Paste clipboard |
| `btn-hist-export-png` | `<button>` | histogram.js | Export PNG |
| `btn-hist-export-csv` | `<button>` | histogram.js | Export CSV |
| `btn-hist-reset` | `<button>` | histogram.js | Reset (→ modal) |
| `empty-state-histogram` | `<div>` | app.js | Empty state Histogram |

#### Fishbone IDs

| ID Element | Tipe | Dipakai oleh | Keterangan |
|---|---|---|---|
| `tab-fishbone` | `<button>` | app.js | Tab selector Fishbone |
| `panel-fishbone` | `<div>` | app.js | Panel tool Fishbone |
| `fb-canvas` | `<svg>` | fishbone.js | Canvas SVG fishbone |
| `fb-effect` | `<textarea>` | fishbone.js | Problem statement (effect) |
| `fb-cat-man` | `<input type=checkbox>` | fishbone.js | Toggle kategori Man |
| `fb-cat-machine` | `<input type=checkbox>` | fishbone.js | Toggle kategori Machine |
| `fb-cat-material` | `<input type=checkbox>` | fishbone.js | Toggle kategori Material |
| `fb-cat-method` | `<input type=checkbox>` | fishbone.js | Toggle kategori Method |
| `fb-cat-measurement` | `<input type=checkbox>` | fishbone.js | Toggle kategori Measurement |
| `fb-cat-environment` | `<input type=checkbox>` | fishbone.js | Toggle kategori Environment |
| `fb-custom-cat-label` | `<input>` | fishbone.js | Nama kategori custom |
| `fb-causes-container` | `<div>` | fishbone.js | Container input causes per kategori |
| `btn-fb-render` | `<button>` | fishbone.js | Render diagram |
| `btn-fb-export-png` | `<button>` | fishbone.js | Export PNG |
| `btn-fb-export-svg` | `<button>` | fishbone.js | Export SVG |
| `btn-fb-reset` | `<button>` | fishbone.js | Reset (→ modal) |
| `empty-state-fishbone` | `<div>` | app.js | Empty state Fishbone |

### 5.6-EXT Pitfalls Tambahan (Total 29)

| # | Pitfall | Solusi | FAIL Signal |
|---|---|---|---|
| 24 | Control Chart canvas tidak di-destroy | `window.ccChartInstance?.destroy()` + `ccMRChartInstance?.destroy()` | "Canvas already in use" untuk chart ke-2 |
| 25 | Konstanta A2/D3/D4 tidak sesuai n | Gunakan `CC_CONSTANTS[n]` lookup table built-in | UCL/LCL salah hitung |
| 26 | LCL negatif pada data non-negatif | `LCL = Math.max(0, calculated_LCL)` untuk data yang tidak bisa negatif | LCL tampil di bawah nol |
| 27 | Histogram bin tunggal (semua data sama) | Guard: `IF xMin===xMax: showToast error; RETURN` | Division by zero saat hitung binWidth |
| 28 | Fishbone SVG terlalu rapat jika banyak causes | Limit max causes per kategori = 8; jika lebih → toast warning + potong | Teks causes overlap/bertumpuk |
| 29 | `wordWrap` dari flowchart.js tidak tersedia di fishbone.js | Expose `window.wordWrap` dari flowchart.js, atau duplikat fungsi di app.js | Teks effect tidak ter-wrap |

### 5.7-EXT Build Checkpoints — Tool Baru

#### Phase 5 — Control Chart Engine

| # | Task | PASS | FAIL |
|---|---|---|---|
| 5.1 | Input table + validasi | 10+ data poin → render; < 8 → error toast | No minimum check |
| 5.2 | I-MR chart render | Nilai muncul sebagai line; UCL/LCL amber/red; Mean hijau | Annotation tidak muncul |
| 5.3 | OOC highlighting | Titik melewati UCL/LCL → merah + radius besar | Titik OOC tidak berbeda |
| 5.4 | X-bar/R chart | Subgroup 5, n=5 → X-bar chart + R chart terpisah | Hanya 1 chart yang muncul |
| 5.5 | Panel statistik | Mean, σ, UCL, LCL, OOC count ditampilkan benar | OOC count salah |
| 5.6 | Export PNG + CSV | Download PNG; CSV berisi kolom Status (OOC/OK) | File kosong |

#### Phase 6 — Histogram Engine

| # | Task | PASS | FAIL |
|---|---|---|---|
| 6.1 | Auto bin (Sturges) | 20 data → k = ceil(1+3.322*log10(20)) = 6 bin | k salah |
| 6.2 | Histogram render | Bar menyatu (categoryPercentage=1, barPercentage=1) | Ada gap antar bar |
| 6.3 | Kurva normal overlay | Toggle ON → kurva mulus di atas bar | Kurva tidak muncul |
| 6.4 | Spec limit LSL/USL | LSL/USL diinput → bar di luar spec merah, di dalam hijau | Warna tidak berubah |
| 6.5 | Cp/Cpk kalkulasi | LSL=2, USL=8, Mean=5, σ=1 → Cp=1.0, Cpk=1.0 | Nilai salah |
| 6.6 | Import CSV nilai | CSV 1 kolom (nilai saja) → terisi di tabel | Error parse |

#### Phase 7 — Fishbone Engine

| # | Task | PASS | FAIL |
|---|---|---|---|
| 7.1 | Empty state | Effect kosong → empty state muncul | Render tetap berjalan |
| 7.2 | SVG layout dasar | 6 kategori → 3 tulang atas, 3 bawah, seimbang | Tulang bertumpuk |
| 7.3 | Causes per kategori | 3 causes per kategori → 3 sub-tulang terdistribusi merata | Sub-tulang di posisi sama |
| 7.4 | Sub-causes | Sub-cause ditambahkan → tanda kecil tegak lurus | Sub-cause tidak muncul |
| 7.5 | Kategori toggle | Uncheck Machine → tulang Machine hilang dari SVG | Tulang tetap muncul |
| 7.6 | Export PNG | PNG 2× resolusi, background terisi, teks terbaca | PNG blank/putih |
| 7.7 | Export SVG | SVG bisa dibuka di browser + Inkscape | SVG error / warna hilang |

### 5.8-EXT Reference Cases — Tool Baru

#### Case D: Control Chart I-MR (10 Titik)

```
Input values: [22.1, 23.5, 21.8, 24.2, 22.9, 25.1, 21.5, 23.8, 22.4, 24.7]
sigma = 3

Expected:
  n=10, X̄=23.20
  MRs = [1.4, 1.7, 2.4, 1.3, 2.2, 3.6, 2.3, 1.4, 2.3]
  MR̄  = 2.067
  d2   = 1.128
  σ̂   = MR̄/d2 = 1.832

  UCL  = 23.20 + 3*1.832 = 28.70
  LCL  = 23.20 - 3*1.832 = 17.70
  CL   = 23.20

  OOC: tidak ada (semua nilai 21.5–25.1 dalam range 17.7–28.7)
  Status: PROSES STABIL
```

#### Case E: Histogram Sturges (15 Data, Spec Limits)

```
Input values: [4.2, 5.1, 4.8, 5.5, 4.6, 5.9, 4.3, 5.2, 4.7, 5.6,
               4.1, 5.3, 4.9, 5.8, 4.4]
LSL=4.0, USL=6.0, method=sturges

Expected:
  n=15, xMin=4.1, xMax=5.9
  k = ceil(1 + 3.322*log10(15)) = ceil(1+3.91) = ceil(4.91) = 5 bin
  binWidth = (5.9-4.1)/5 = 0.36

  Bins:
    [4.10–4.46]: count=4 → dalam spec → hijau
    [4.46–4.82]: count=3 → dalam spec → hijau
    [4.82–5.18]: count=3 → dalam spec → hijau
    [5.18–5.54]: count=2 → dalam spec → hijau
    [5.54–5.90]: count=3 → dalam spec → hijau

  X̄=5.027, σ≈0.563
  Cp  = (6.0-4.0)/(6*0.563) = 2.0/3.378 = 0.592 → TIDAK KAPABEL
  Cpl = (5.027-4.0)/(3*0.563) = 0.608
  Cpu = (6.0-5.027)/(3*0.563) = 0.576
  Cpk = min(0.608, 0.576) = 0.576 → proses tidak kapabel
```

#### Case F: Fishbone State → Layout

```
Input state:
  effect: "Produk Cacat Tinggi"
  categories (active): Man, Machine, Material, Method
  Man.causes:     ["Kurang Training", "Kelelahan"]
  Machine.causes: ["Kalibrasi Usang", "Mesin Tua"]
  Material.causes:["Kualitas Supplier Rendah"]
  Method.causes:  ["SOP Tidak Jelas"]

Expected SVG layout (TD=atas, BT=bawah):
  Spine: x1=80, y1=350, x2=1000, y2=350  (SPINE_Y=350 untuk SVG_H=700)
  Man (TOP,    idx=0): boneX≈800, angle=-45°, outerX≈659, outerY≈209
  Machine (BOT,idx=1): boneX≈600, angle=+45°, outerX≈459, outerY≈491
  Material (TOP,idx=2): boneX≈400, angle=-45°, outerX≈259, outerY≈209
  Method (BOT, idx=3): boneX≈200, angle=+45°, outerX≈59,  outerY≈491

  Causes "Kurang Training" dan "Kelelahan" → 2 sub-tulang pada tulang Man
    t_pos=0.333 dan t_pos=0.667 sepanjang tulang Man
```

---

*Spesifikasi v4.1 — Seven Quality Tools Edition*
*Menambahkan Control Chart, Histogram, dan Fishbone kepada Flowchart + Pareto yang sudah ada di v4.0.*
*Total tool: 5. Total file JS: 7. Total DOM ID: ~93. Total pitfalls: 29. Build phases: 7.*


---

## 📋 ADDENDUM v4.2 — DUA TOOL BARU: SCATTER CHART & RUN CHART

> **Perubahan v4.2:** Menambahkan dua tool baru — Scatter Chart (Diagram Tebar Korelasi) dan Run Chart (Diagram Deret Waktu).
> Semua section dari v4.0 dan v4.1 tetap berlaku; addendum ini melengkapi (bukan mengganti).

### Perubahan Struktural v4.2

| Area | Perubahan |
|---|---|
| §0.2 Dependensi | +2 CSS file, +2 JS file baru |
| §0.3 Lifecycle | +2 init function baru (`initScatter`, `initRunChart`) |
| §0.4 Tab Switching | Tab selector diperluas ke 7 tool |
| §0.6 Peta Aksi | +2 tabel aksi baru |
| §1.3 File Structure | +2 CSS, +2 JS, updated AppState |
| §2 I/O | +§2F Scatter Chart, §2G Run Chart |
| §3 Algoritma | +§3G Scatter Chart, §3H Run Chart |
| §5.3 AppState | +scatter, +runChart state |
| §5.4 DOM IDs | +38 ID baru (total ~131 ID) |
| §5.6 Pitfalls | +8 pitfall baru (total 37) |
| §5.7 Checkpoints | +Phase 8, 9 |
| §5.8 Reference Cases | +Case G (Scatter), Case H (Run Chart) |

---

## 0-EXT2. EKSTENSI MASTER SYSTEM WORKFLOW (v4.2)

### 0.2-EXT2 Dependensi Modul (Updated — 7 Tool)

```
index.html
  └── loads (in order, CRITICAL):
       1–10. [sama seperti v4.1 — CSS + CDN + Chart.js + plugins]

      11. js/app.js
      12. js/flowchart-undo.js
      13. js/flowchart.js
      14. js/pareto.js
      15. js/controlchart.js
      16. js/histogram.js
      17. js/fishbone.js
      18. js/scatter.js         ← Scatter Chart engine  [BARU v4.2]
      19. js/runchart.js        ← Run Chart engine      [BARU v4.2]

CSS tambahan (di <head>, setelah css v4.1):
      css/scatter.css           [BARU v4.2]
      css/runchart.css          [BARU v4.2]

scatter.js exports (window global):
  window.renderScatter(data, options)
  window.initScatter()

runchart.js exports (window global):
  window.renderRunChart(data, options)
  window.initRunChart()

Dependency rules (tambahan v4.2):
  scatter.js   → memanggil app.js utils + Chart.js CDN
  runchart.js  → memanggil app.js utils + Chart.js CDN
  TIDAK ADA cross-dependency antar engine (aturan tetap)
```

### 0.3-EXT2 Lifecycle (Updated — 7 Tool)

```
DOMContentLoaded:
  [1]  restoreState()
  [2]  initTabs()              ← handle 7 tab
  [3]  initFlowchart()
  [4]  initPareto()
  [5]  initControlChart()
  [6]  initHistogram()
  [7]  initFishbone()
  [8]  initScatter()           [BARU v4.2]
  [9]  initRunChart()          [BARU v4.2]
  [10] initGlobalErrorHandlers()
  [11] renderInitialState()
```

### 0.4-EXT2 Tab Switching (Updated — 7 Tool)

```
Tab selector:
  [Flowchart] [Pareto] [Control Chart] [Histogram] [Fishbone] [Scatter] [Run Chart]

switchTab(newTab):
  newTab ∈ 'flowchart'|'pareto'|'controlchart'|'histogram'|'fishbone'|'scatter'|'runchart'
  AppState.activeTab = newTab
  ... (pola sama dengan v4.0)
  renderActiveTab() diperluas:
    'scatter'   → renderScatter(rows, getScatterOptions())
    'runchart'  → renderRunChart(rows, getRunChartOptions())
```

### 0.6-EXT2 Peta Aksi User → Handler (Tambahan v4.2)

#### Scatter Chart Actions

| User Action | Handler | Re-render? |
|---|---|---|
| Input nilai X atau Y (blur) | `updateScatterRow(id, field, val)` + `saveState()` | NO |
| Enter di field Y | `addScatterRow()` + fokus baris baru | NO |
| Klik "Render Chart" | `renderScatter()` | YES full |
| Klik "+ Tambah Titik" | `addScatterRow()` | NO |
| Klik "×" hapus baris | `removeScatterRow(id)` | NO |
| Import CSV | `importScatterCSV(file)` | YES full |
| Paste Clipboard | `pasteScatterClipboard()` | YES full |
| Toggle Regression Line | `toggleRegressionLine()` | YES full |
| Toggle Confidence Ellipse | `toggleConfidenceEllipse()` | YES full |
| Ctrl+Enter | `renderScatter()` | YES full |
| Export PNG | `exportScatterPNG()` | NO |
| Export CSV | `exportScatterCSV()` | NO |
| Reset | `resetScatter()` → modal | YES empty |

#### Run Chart Actions

| User Action | Handler | Re-render? |
|---|---|---|
| Input nilai (blur) | `updateRunRow(id, field, val)` + `saveState()` | NO |
| Enter di field nilai | `addRunRow()` + fokus baris baru | NO |
| Klik "Render Chart" | `renderRunChart()` | YES full |
| Klik "+ Tambah Nilai" | `addRunRow()` | NO |
| Klik "×" hapus baris | `removeRunRow(id)` | NO |
| Import CSV | `importRunCSV(file)` | YES full |
| Paste Clipboard | `pasteRunClipboard()` | YES full |
| Toggle Median Line | `toggleMedianLine()` | YES full |
| Toggle Trend Annotations | `toggleRunAnnotations()` | YES full |
| Ubah Significance Level | `updateRunAlpha(val)` | YES full |
| Ctrl+Enter | `renderRunChart()` | YES full |
| Export PNG | `exportRunPNG()` | NO |
| Export CSV | `exportRunCSV()` | NO |
| Reset | `resetRunChart()` → modal | YES empty |

---

## 2-EXT2. BAGIAN I/O — DIAGRAM SCATTER & RUN CHART

### F. SCATTER CHART TOOL

**Konsep:** Scatter diagram (diagram tebar) untuk menganalisis hubungan/korelasi antara dua variabel X dan Y. Sesuai dengan Seven Quality Tools tradisional.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SCATTER CHART — I/O DIAGRAM                     │
└─────────────────────────────────────────────────────────────────────┘

INPUT                           PROSES                         OUTPUT
----------------------------------------------------------------------
[Judul Chart]                   Sanitasi & Validasi:           Chart Scatter:
[Label Sumbu X]                 • Min 5 pasang data (X,Y)     • Titik-titik data
[Label Sumbu Y]                 • Kedua kolom numerik         • Garis regresi linear
[Toggle Regression Line]        • Tidak boleh semua X sama    • (opsional)
[Toggle Confidence Band]        • Tidak boleh semua Y sama    • Confidence band
  (95% band di sekitar line)                                     ±95% (opsional)
                                Kalkulasi Regresi Linear:
[Tabel Data Entry]:             • Ȳ = ΣY/n, X̄ = ΣX/n          Panel Statistik:
  Kolom A: Label (opsional)     • Sxx = Σ(Xi-X̄)²              • n (jumlah titik)
  Kolom B: Nilai X              • Sxy = Σ(Xi-X̄)(Yi-Ȳ)         • r (Pearson)
  Kolom C: Nilai Y              • β₁  = Sxy / Sxx (slope)     • r² (determinasi)
  [+ Tambah Titik]              • β₀  = Ȳ - β₁*X̄ (intercept) • Interpretasi r
  [× Hapus Baris]               • Ŷ   = β₀ + β₁*X             • Persamaan regresi
                                                                 (Ŷ = β₀ + β₁X)
[Import CSV]                    Kalkulasi Pearson r:           • Slope, Intercept
[Paste Clipboard]               • r = Sxy / √(Sxx * Syy)      • P-value (t-test)
                                • r² = r*r
                                • t = r * √(n-2) / √(1-r²)    Tabel Ringkasan:
[Format CSV Import]:            • df = n-2                     • X̄, Ȳ, X min/max
  Kolom 1: Label (bisa kosong)  • P-value: t-distribution      • Y min/max
  Kolom 2: X                      lookup (approx formula)      • Σ(xi-x̄)²
  Kolom 3: Y                                                   • Persamaan regresi
  ATAU: 2 kolom saja (X, Y)
                                Confidence Band (95%):         Download:
                                • SE = σ̂ * √(1/n + (X-X̄)²/Sxx) • PNG chart
                                • σ̂ = √(SSresidual/(n-2))       • CSV dengan
                                • Band = Ŷ ± t*(0.975,n-2)*SE     kolom r, residual
----------------------------------------------------------------------

Validasi Pre-Render:
  1. pairs.length < 5          → error toast: "Minimal 5 pasang data"
  2. Semua X identik           → error toast: "Nilai X tidak boleh semua sama"
  3. Semua Y identik           → error toast: "Nilai Y tidak boleh semua sama"
  4. r > 0.7                   → info toast: "Korelasi positif kuat"
  5. r < -0.7                  → info toast: "Korelasi negatif kuat"
  6. |r| < 0.3                 → info toast: "Korelasi lemah/tidak signifikan"
```

**Input Fields Scatter Chart:**

| Field | Tipe | ID Element | Validasi |
|---|---|---|---|
| Judul Chart | `<input type="text">` | `sc-title` | Opsional, max 100 char |
| Label X | `<input type="text">` | `sc-xlabel` | Opsional, max 50 char, default "X" |
| Label Y | `<input type="text">` | `sc-ylabel` | Opsional, max 50 char, default "Y" |
| Tampilkan Reg. Line | `<input type="checkbox">` | `sc-show-regression` | Default: true |
| Tampilkan Conf. Band | `<input type="checkbox">` | `sc-show-band` | Default: false (hanya aktif jika regression ON) |
| Label titik (per baris) | `<input type="text">` | Dinamis tbody | Opsional, max 30 char |
| Nilai X (per baris) | `<input type="text">` | Dinamis tbody | Wajib, numerik, format lokal |
| Nilai Y (per baris) | `<input type="text">` | Dinamis tbody | Wajib, numerik, format lokal |

**Format CSV Import Scatter:**

```
Kolom 2 (X dan Y saja, tanpa header label):
  23,45
  25,48
  22,41

Kolom 3 (Label, X, Y):
  "Batch A",23,45
  "Batch B",25,48

Header baris pertama selalu dilewati (sama dengan parseDelimited §3C).
BOM UTF-8 di-strip otomatis.
Delimiter: koma / titik koma / tab (auto-detect).
Format angka: normalizeNumber() 5-pola (§3C).
```

---

### G. RUN CHART TOOL

**Konsep:** Run Chart (diagram deret waktu) untuk memvisualisasikan data urutan waktu, mendeteksi trend, shift, dan astronomical points berdasarkan aturan non-random signals.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     RUN CHART — I/O DIAGRAM                         │
└─────────────────────────────────────────────────────────────────────┘

INPUT                           PROSES                         OUTPUT
----------------------------------------------------------------------
[Judul Chart]                   Sanitasi & Validasi:           Chart Run:
[Label Sumbu X (waktu)]         • Min 10 data poin             • Line chart nilai
[Label Sumbu Y (nilai)]         • Nilai numerik                • Titik data
[Toggle Median Line]            • Tidak semua nilai sama       • Median (garis hijau)
[Toggle Annotation Runs]                                       • Highlight titik:
[Toggle Trend Detection]        Kalkulasi Median:                - Above median (biru)
                                • Sort nilai → median            - Below median (abu)
[Tabel Data Entry]:               (avg 2 tengah jika n genap)    - Astronomical (merah)
  Kolom A: Label/Waktu          • Tandai tiap titik:           • Annotation teks
    (opsional, mis: "Jan-25")     'above' | 'below' | 'on'       untuk run signals
  Kolom B: Nilai                  ('on median' tidak dihitung)
  [+ Tambah Nilai]                                              Panel Statistik:
  [× Hapus Baris]               Analisis Run (Non-Random):     • n titik data
                                                               • Median
[Import CSV]                    [1] Total Runs Count:          • Runs aktual
[Paste Clipboard]                   Hitung jumlah run          • Runs expected
                                    (kelompok berturutan         (teoritis)
                                    di sisi yang sama)         • Longest run
                                    Threshold signal:          • Signal deteksi:
                                    ≥ 8 titik berurutan          ✓ STABIL atau
                                    di satu sisi = shift         ⚠ SIGNAL
                                    signal
                                                               Tabel Ringkasan:
                                [2] Trend Detection:           • Mean, Median
                                    ≥ 6 titik naik/turun       • Std Dev
                                    berurutan = trend          • Min, Max
                                    signal                     • Astronomical pts
                                                               • Signal list
                                [3] Astronomical Points:
                                    Titik > 3 IQR dari
                                    median = outlier           Download:
                                                               • PNG chart
                                [4] Expected Runs:             • CSV dengan
                                    E(r) = (2*na*nb/(na+nb))+1   kolom signal
                                    na=above, nb=below
----------------------------------------------------------------------

Validasi Pre-Render:
  1. rows.length < 10          → error toast: "Minimal 10 data poin"
  2. Semua nilai identik       → error toast: "Semua nilai identik — tidak bisa dianalisis"
  3. Run shift ≥ 8 terdeteksi  → warning toast: "⚠ Run Shift terdeteksi di titik [X]"
  4. Trend ≥ 6 terdeteksi      → warning toast: "⚠ Trend terdeteksi di titik [X]–[Y]"
  5. Astronomical points > 0  → warning toast: "[n] Astronomical Point terdeteksi"
```

**Input Fields Run Chart:**

| Field | Tipe | ID Element | Validasi |
|---|---|---|---|
| Judul Chart | `<input type="text">` | `rc-title` | Opsional, max 100 char |
| Label X (waktu/urutan) | `<input type="text">` | `rc-xlabel` | Opsional, max 50 char, default "Urutan" |
| Label Y (nilai) | `<input type="text">` | `rc-ylabel` | Opsional, max 50 char, default "Nilai" |
| Tampilkan Median | `<input type="checkbox">` | `rc-show-median` | Default: true |
| Tampilkan Anotasi | `<input type="checkbox">` | `rc-show-annotations` | Default: true |
| Deteksi Trend | `<input type="checkbox">` | `rc-detect-trend` | Default: true |
| Label (per baris) | `<input type="text">` | Dinamis tbody | Opsional, max 30 char |
| Nilai (per baris) | `<input type="text">` | Dinamis tbody | Wajib, numerik, format lokal |

---

## 3-EXT2. ALGORITMA — SCATTER CHART & RUN CHART

### G. Algoritma Scatter Chart — VERSI LENGKAP

```
FUNCTION renderScatter(rawData, options):
options = {
  title:          string  (default:'Scatter Diagram'),
  xLabel:         string  (default:'X'),
  yLabel:         string  (default:'Y'),
  showRegression: boolean (default:true),
  showBand:       boolean (default:false)
}

════════════════════════════════════════
FASE 1 — SANITASI & VALIDASI INPUT
════════════════════════════════════════
  pairs = []
  errors = []
  FOR i, d of rawData:
    vx = normalizeNumber(String(d.x))  // reuse dari §3C
    vy = normalizeNumber(String(d.y))
    IF isNaN(vx) OR isNaN(vy):
      errors.push('Baris '+(i+1)+': nilai tidak valid (X="'+d.x+'", Y="'+d.y+'")')
      CONTINUE
    pairs.push({
      label: sanitizeText(d.label || String(i+1)),
      x: vx, y: vy
    })

  IF errors.length > 0:
    showToast('warning', errors.length+' baris dilewati')

  IF pairs.length < 5:
    showToast('error','Minimal 5 pasang data (X,Y) untuk Scatter Diagram')
    RETURN

  // Guard: semua X identik (divisor = 0 di regresi)
  xs = pairs.map(p=>p.x); ys = pairs.map(p=>p.y)
  IF Math.max(...xs)===Math.min(...xs):
    showToast('error','Semua nilai X identik — regresi tidak bisa dihitung'); RETURN
  IF Math.max(...ys)===Math.min(...ys):
    showToast('error','Semua nilai Y identik — regresi tidak bisa dihitung'); RETURN

════════════════════════════════════════
FASE 2 — STATISTIK DASAR
════════════════════════════════════════
  n  = pairs.length
  Xbar = xs.reduce((s,v)=>s+v,0)/n
  Ybar = ys.reduce((s,v)=>s+v,0)/n

  // Sum-of-squares
  Sxx = xs.reduce((s,v)=>s+(v-Xbar)**2, 0)
  Syy = ys.reduce((s,v)=>s+(v-Ybar)**2, 0)
  Sxy = pairs.reduce((s,p)=>s+(p.x-Xbar)*(p.y-Ybar), 0)

  // Pearson Correlation
  r   = Sxy / Math.sqrt(Sxx * Syy)
  r2  = r * r

  // Regresi linear: Ŷ = β₀ + β₁X
  beta1 = Sxy / Sxx         // slope
  beta0 = Ybar - beta1*Xbar // intercept
  predict = (x) => beta0 + beta1 * x

  // Sum Squared Error (residuals)
  SSres = pairs.reduce((s,p)=>s+(p.y - predict(p.x))**2, 0)
  df    = n - 2
  sigmaHat = Math.sqrt(SSres / df)  // estimasi SE regresi

  // T-test untuk signifikansi r
  // t = r * sqrt(n-2) / sqrt(1 - r²)
  tStat = (df > 0 && r2 < 1)
    ? Math.abs(r) * Math.sqrt(df) / Math.sqrt(1 - r2)
    : Infinity

  // Approx P-value dari distribusi t (formula Abramowitz & Stegun)
  // Untuk keperluan display — bukan statistika inferensial penuh
  approxPValue(t, df):
    IF t === Infinity: RETURN 0
    x = df / (df + t*t)
    // Incomplete beta regularized approx (beta dist CDF)
    // Simple approximation: p ≈ 2*(1 - normal_cdf_approx(t))
    // Karena ini client-side murni, gunakan pendekatan numerik:
    a = df / 2; b = 0.5
    // Menggunakan approximation: betai(a, b, x)
    // Fallback: threshold interpretation saja
    IF t > 3.5: RETURN 0.001
    IF t > 2.5: RETURN 0.01
    IF t > 2.0: RETURN 0.05
    IF t > 1.5: RETURN 0.10
    RETURN 0.20
  // CATATAN: P-value ini APROKSIMASI untuk interpretasi UI, bukan uji statistik klinis

  pValue = approxPValue(tStat, df)

  // Interpretasi kekuatan korelasi
  interpretR(r):
    abs_r = Math.abs(r)
    dir   = r >= 0 ? 'Positif' : 'Negatif'
    IF abs_r >= 0.9: RETURN dir + ' Sangat Kuat'
    IF abs_r >= 0.7: RETURN dir + ' Kuat'
    IF abs_r >= 0.5: RETURN dir + ' Sedang'
    IF abs_r >= 0.3: RETURN dir + ' Lemah'
    RETURN 'Sangat Lemah / Tidak Signifikan'

  // Toast otomatis interpretasi
  IF Math.abs(r) >= 0.7: showToast('success', 'Korelasi '+interpretR(r)+' (r='+r.toFixed(3)+')')
  ELSE IF Math.abs(r) < 0.3: showToast('warning','Korelasi lemah (r='+r.toFixed(3)+') — hubungan tidak jelas')

════════════════════════════════════════
FASE 3 — TITIK REGRESI & CONFIDENCE BAND
════════════════════════════════════════
  xMin = Math.min(...xs); xMax = Math.max(...xs)
  xRange = xMax - xMin
  // Buat 50 titik sepanjang sumbu X untuk garis regresi
  REGRESSION_POINTS = 50
  regLinePoints = Array.from({length:REGRESSION_POINTS}, (_,i)=>{
    x = xMin + (i/(REGRESSION_POINTS-1)) * xRange
    y = predict(x)
    RETURN {x, y}
  })

  // Confidence Band ±t*(0.975,df)*SE(X)
  // SE(X) = σ̂ * sqrt(1/n + (X-X̄)²/Sxx)
  t975 = df >= 30 ? 1.96     // approx normal
       : df >= 20 ? 2.086
       : df >= 15 ? 2.131
       : df >= 10 ? 2.228
       : df >= 5  ? 2.571
       : 3.182                // df=4

  IF options.showBand:
    bandUpper = regLinePoints.map(pt=>{
      se = sigmaHat * Math.sqrt(1/n + (pt.x-Xbar)**2/Sxx)
      RETURN {x:pt.x, y:pt.y + t975*se}
    })
    bandLower = regLinePoints.map(pt=>{
      se = sigmaHat * Math.sqrt(1/n + (pt.x-Xbar)**2/Sxx)
      RETURN {x:pt.x, y:pt.y - t975*se}
    })

════════════════════════════════════════
FASE 4 — DESTROY CHART LAMA
════════════════════════════════════════
  IF window.scatterChartInstance:
    window.scatterChartInstance.destroy()
    window.scatterChartInstance = null

════════════════════════════════════════
FASE 5 — WARNA TITIK
════════════════════════════════════════
  // Warna titik berdasarkan residual (opsional — default semua sama)
  // Titik yang jauh dari garis regresi (residual > 2*sigmaHat) → oranye
  ptColors = pairs.map(p=>{
    residual = Math.abs(p.y - predict(p.x))
    IF residual > 2*sigmaHat: RETURN getCSSVar('--accent-amber')
    RETURN getCSSVar('--chart-bar-vital')
  })

════════════════════════════════════════
FASE 6 — RENDER CHART.JS v4
════════════════════════════════════════
  IF typeof annotationPlugin !== 'undefined': Chart.register(annotationPlugin)

  datasets = [
    // Dataset 1: titik data scatter
    {
      type: 'scatter',
      label: options.xLabel+' vs '+options.yLabel,
      data: pairs.map(p=>({x:p.x, y:p.y, label:p.label})),
      backgroundColor: ptColors,
      pointRadius: 6,
      pointHoverRadius: 9,
      order: 2
    }
  ]

  IF options.showRegression:
    datasets.push({
      type: 'line',
      label: 'Regresi: Ŷ='+beta0.toFixed(3)+(beta1>=0?'+':'')+beta1.toFixed(3)+'X',
      data: regLinePoints,
      borderColor: getCSSVar('--accent-red'),
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0,
      order: 1
    })

  IF options.showBand AND options.showRegression:
    // Upper band
    datasets.push({
      type:'line', label:'95% CI Band (atas)',
      data: bandUpper, borderColor: getCSSVar('--accent-red')+'40',
      borderWidth:1, borderDash:[4,4], pointRadius:0, fill:false, tension:0, order:0
    })
    // Lower band
    datasets.push({
      type:'line', label:'95% CI Band (bawah)',
      data: bandLower, borderColor: getCSSVar('--accent-red')+'40',
      borderWidth:1, borderDash:[4,4], pointRadius:0,
      fill:'-1',  // fill ke dataset atas (areal band)
      backgroundColor: getCSSVar('--accent-red')+'10',
      tension:0, order:0
    })

  scatterConfig = {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: {duration:500, easing:'easeOutQuart'},
      interaction: {mode:'nearest', intersect:true},
      scales: {
        x: {
          type:'linear', position:'bottom',
          grid: {color:getCSSVar('--border-base')},
          ticks: {color:getCSSVar('--text-secondary'), font:{family:getCSSVar('--font-mono'),size:11}},
          title: {
            display:true, text:sanitizeText(options.xLabel||'X'),
            color:getCSSVar('--text-secondary'), font:{size:12}
          }
        },
        y: {
          type:'linear',
          grid: {color:getCSSVar('--border-base')},
          ticks: {color:getCSSVar('--text-secondary'), font:{family:getCSSVar('--font-mono'),size:11}},
          title: {
            display:true, text:sanitizeText(options.yLabel||'Y'),
            color:getCSSVar('--text-secondary'), font:{size:12}
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: getCSSVar('--text-secondary'),
            font: {family:getCSSVar('--font-body'),size:12},
            filter: item => item.datasetIndex === 0 || options.showRegression
          }
        },
        tooltip: {
          backgroundColor: getCSSVar('--bg-secondary'),
          borderColor: getCSSVar('--border-base'), borderWidth:1,
          titleColor: getCSSVar('--text-primary'), bodyColor: getCSSVar('--text-secondary'),
          callbacks: {
            title: items => {
              pt = pairs[items[0].dataIndex]
              RETURN pt ? pt.label : '#'+(items[0].dataIndex+1)
            },
            label: item => {
              IF item.datasetIndex===0:  // scatter titik
                residual = item.raw.y - predict(item.raw.x)
                RETURN [
                  ' X: '+item.raw.x,
                  ' Y: '+item.raw.y,
                  ' Ŷ: '+predict(item.raw.x).toFixed(3),
                  ' Residual: '+residual.toFixed(3)
                ]
              RETURN item.dataset.label+': '+item.raw.y?.toFixed(3)
            }
          }
        },
        annotation: {
          clip:false,
          annotations: {
            // Garis Xbar vertical
            xMean: {
              type:'line', scaleID:'x', value:Xbar,
              borderColor: getCSSVar('--text-muted')+'60',
              borderWidth:1, borderDash:[4,4],
              label:{display:true, content:'X̄='+Xbar.toFixed(2), position:'start',
                     backgroundColor:'transparent', color:getCSSVar('--text-muted'), font:{size:9}}
            },
            // Garis Ybar horizontal
            yMean: {
              type:'line', scaleID:'y', value:Ybar,
              borderColor: getCSSVar('--text-muted')+'60',
              borderWidth:1, borderDash:[4,4],
              label:{display:true, content:'Ȳ='+Ybar.toFixed(2), position:'end',
                     backgroundColor:'transparent', color:getCSSVar('--text-muted'), font:{size:9}}
            }
          }
        }
      }
    }
  }

  window.scatterChartInstance = new Chart(
    document.getElementById('sc-canvas').getContext('2d'), scatterConfig)

════════════════════════════════════════
FASE 7 — PANEL STATISTIK
════════════════════════════════════════
  statEl = document.getElementById('sc-stats')
  IF !statEl: RETURN
  statEl.innerHTML = ''

  // Build DOM cards (createElement/textContent — NO innerHTML dengan user data)
  mkCard(label, value, sub, cls):
    c=el('div','stat-card'+(cls?' '+cls:'')); c.appendChild(span('stat-label',label))
    c.appendChild(span('stat-value',value))
    IF sub: c.appendChild(span('stat-sub',sub))
    RETURN c

  el=(t,c)=>{e=document.createElement(t);if(c)e.className=c;return e}
  span=(c,t)=>{s=el('span',c);s.textContent=t;return s}

  rColor = Math.abs(r)>=0.7 ? 'vital' : Math.abs(r)>=0.5 ? '' : 'trivial'

  statEl.appendChild(mkCard('n (Pasang Data)', n+' titik', null, null))
  statEl.appendChild(mkCard('Pearson r', r.toFixed(4),
    interpretR(r), rColor))
  statEl.appendChild(mkCard('Koefisien r²', r2.toFixed(4),
    'Variasi Y yang dijelaskan X', null))
  statEl.appendChild(mkCard('Persamaan Regresi',
    'Ŷ='+beta0.toFixed(3)+(beta1>=0?'+':'')+beta1.toFixed(3)+'X',
    'Slope='+beta1.toFixed(4)+' | Intercept='+beta0.toFixed(4), null))
  statEl.appendChild(mkCard('P-value (approx)',
    pValue <= 0.001 ? '< 0.001' : '≈'+pValue,
    pValue<0.05 ? 'Korelasi Signifikan (α=0.05)' : 'Tidak Signifikan', null))

════════════════════════════════════════
FASE 8 — TABEL RINGKASAN
════════════════════════════════════════
  tbl=document.getElementById('sc-summary-table'); IF !tbl: RETURN
  tbl.innerHTML=''
  // Kolom: Label, X, Y, Ŷ (prediksi), Residual, Residual²
  thead=el('thead'); tr=el('tr')
  FOR col of ['Label','X','Y','Ŷ (Prediksi)','Residual','Residual²']:
    th=el('th'); th.textContent=col; tr.appendChild(th)
  thead.appendChild(tr); tbl.appendChild(thead)
  tbody=el('tbody')
  FOR p of pairs:
    yHat = predict(p.x)
    resid = p.y - yHat
    tr=el('tr')
    FOR [v,c] of [
      [p.label,''],
      [p.x.toFixed(3),'num'],
      [p.y.toFixed(3),'num'],
      [yHat.toFixed(3),'num'],
      [resid.toFixed(3), 'num '+(Math.abs(resid)>2*sigmaHat?'vital':'')],
      [(resid**2).toFixed(4),'num']
    ]:
      td=el('td'); if(c)td.className=c; td.textContent=String(v); tr.appendChild(td)
    tbody.appendChild(tr)
  tbl.appendChild(tbody)

════════════════════════════════════════
FASE 9 — EXPORT
════════════════════════════════════════
  exportScatterPNG():
    IF !window.scatterChartInstance: showToast('error','Render chart dulu'); RETURN
    triggerDownload(window.scatterChartInstance.toBase64Image('image/png'),'scatter-diagram.png')

  exportScatterCSV():
    IF !pairs||pairs.length===0: RETURN
    BOM='\\uFEFF'
    header='Label,X,Y,Y_Hat,Residual,Residual_Squared\\n'
    summary='\\n# Statistik Ringkasan\\n'
      +'n,'+n+'\\nr,'+r.toFixed(6)+'\\nr2,'+r2.toFixed(6)+'\\n'
      +'Beta0 (Intercept),'+beta0.toFixed(6)+'\\n'
      +'Beta1 (Slope),'+beta1.toFixed(6)+'\\n'
    rows=pairs.map(p=>{
      yh=predict(p.x); res=p.y-yh
      RETURN '"'+p.label.replace(/"/g,'""')+'",'+p.x+','+p.y+','+yh.toFixed(4)+','+res.toFixed(4)+','+(res**2).toFixed(6)
    }).join('\\n')
    blob=new Blob([BOM+header+rows+summary],{type:'text/csv;charset=utf-8'})
    triggerDownload(URL.createObjectURL(blob),'scatter-data.csv')
```

---

### H. Algoritma Run Chart — VERSI LENGKAP

```
FUNCTION renderRunChart(rawData, options):
options = {
  title:           string  (default:'Run Chart'),
  xLabel:          string  (default:'Urutan'),
  yLabel:          string  (default:'Nilai'),
  showMedian:      boolean (default:true),
  showAnnotations: boolean (default:true),
  detectTrend:     boolean (default:true)
}

════════════════════════════════════════
FASE 1 — SANITASI & VALIDASI INPUT
════════════════════════════════════════
  points = []
  errors = []
  FOR i, d of rawData:
    v = normalizeNumber(String(d.value))
    IF isNaN(v): errors.push('Baris '+(i+1)+': "'+d.value+'" bukan angka'); CONTINUE
    points.push({ index:i, label:sanitizeText(d.label||String(i+1)), value:v })

  IF errors.length > 0: showToast('warning', errors.length+' baris dilewati')

  IF points.length < 10:
    showToast('error','Minimal 10 data poin untuk Run Chart')
    RETURN

  values = points.map(p=>p.value)
  IF Math.max(...values)===Math.min(...values):
    showToast('error','Semua nilai identik — Run Chart tidak dapat dianalisis')
    RETURN

════════════════════════════════════════
FASE 2 — HITUNG MEDIAN
════════════════════════════════════════
  sorted = [...values].sort((a,b)=>a-b)
  n      = values.length
  median = n%2===1
    ? sorted[Math.floor(n/2)]
    : (sorted[n/2-1]+sorted[n/2])/2

════════════════════════════════════════
FASE 3 — KLASIFIKASI TITIK
════════════════════════════════════════
  // Tandai setiap titik: 'above'|'below'|'on'
  // PENTING: Titik tepat di median ('on') TIDAK dihitung sebagai bagian dari run
  //          dan TIDAK memutus run sebelumnya
  classified = points.map(p=>({
    ...p,
    side: p.value > median ? 'above'
        : p.value < median ? 'below'
        : 'on'  // 'on' = tidak dihitung dalam analisis run
  }))

════════════════════════════════════════
FASE 4 — ANALISIS RUN
════════════════════════════════════════
  // Hapus titik 'on median' untuk hitung run
  meaningful = classified.filter(p=>p.side!=='on')
  na = meaningful.filter(p=>p.side==='above').length  // n atas
  nb = meaningful.filter(p=>p.side==='below').length  // n bawah

  // Hitung jumlah run aktual
  // Run = kelompok berturutan titik di sisi yang sama
  runCount = 0; prevSide = null; currentRunLen = 0; maxRunLen = 0
  runDetails = []   // [{start, end, side, length}]
  runStart = 0

  FOR i, p of meaningful:
    IF p.side !== prevSide:
      IF prevSide !== null:
        runDetails.push({start:runStart, end:i-1, side:prevSide, length:currentRunLen})
        maxRunLen = Math.max(maxRunLen, currentRunLen)
      runCount++; runStart=i; currentRunLen=1; prevSide=p.side
    ELSE:
      currentRunLen++

  // Tambah run terakhir
  IF meaningful.length>0:
    runDetails.push({start:runStart, end:meaningful.length-1, side:prevSide, length:currentRunLen})
    maxRunLen = Math.max(maxRunLen, currentRunLen)

  // Expected runs (formula non-random test)
  // E(r) = (2*na*nb / (na+nb)) + 1
  expectedRuns = na+nb > 0 ? (2*na*nb/(na+nb)) + 1 : 0

  // Variance of runs: σ²(r) = 2*na*nb*(2*na*nb - na - nb) / ((na+nb)² * (na+nb-1))
  nr = na + nb
  IF nr > 1:
    varRuns = (2*na*nb*(2*na*nb - na - nb)) / (nr*nr*(nr-1))
    sdRuns  = Math.sqrt(Math.max(0, varRuns))
  ELSE:
    varRuns = 0; sdRuns = 0

════════════════════════════════════════
FASE 5 — DETEKSI SIGNAL NON-RANDOM
════════════════════════════════════════
  signals = []   // [{type, message, startIdx, endIdx}]

  // [Signal 1] Run Shift: ≥ 8 titik berurutan di satu sisi median
  //   (Nelson Rules / Wheeler's Rule: 8 atau lebih)
  FOR run of runDetails:
    IF run.length >= 8:
      signals.push({
        type: 'shift',
        message: 'Run Shift: '+run.length+' titik berturutan di '+(run.side==='above'?'atas':'bawah')+' median',
        startIdx: meaningful[run.start].index,
        endIdx:   meaningful[run.end].index
      })

  // [Signal 2] Trend: ≥ 6 titik naik ATAU turun berturutan (tidak harus melewati median)
  IF options.detectTrend:
    trendLen = 1; trendDir = null; trendStart = 0
    FOR i=1 of values.length:
      dir = values[i] > values[i-1] ? 'up' : values[i] < values[i-1] ? 'down' : 'flat'
      IF dir === 'flat':
        trendLen=1; trendDir=null; trendStart=i; CONTINUE
      IF dir === trendDir:
        trendLen++
        IF trendLen >= 6:
          signals.push({
            type:'trend',
            message:'Trend '+(trendDir==='up'?'Naik':'Turun')+': '+trendLen+' titik berturutan (mulai titik #'+(trendStart+1)+')',
            startIdx: trendStart,
            endIdx:   i
          })
          // Reset setelah deteksi agar tidak duplikat
          trendLen=1; trendDir=null; trendStart=i
      ELSE:
        trendLen=2; trendDir=dir; trendStart=i-1

  // [Signal 3] Astronomical Points: nilai > 3*IQR dari median
  Q1 = sorted[Math.floor(n*0.25)]
  Q3 = sorted[Math.floor(n*0.75)]
  IQR = Q3 - Q1
  astroThresholdHigh = median + 3*IQR
  astroThresholdLow  = median - 3*IQR

  astronomicalPoints = points.filter(p =>
    p.value > astroThresholdHigh || p.value < astroThresholdLow)

  IF astronomicalPoints.length > 0:
    signals.push({
      type:'astronomical',
      message:astronomicalPoints.length+' Astronomical Point(s) terdeteksi',
      startIdx: null, endIdx: null
    })

  // Toast untuk setiap signal
  FOR sig of [...new Map(signals.map(s=>[s.type,s])).values()]:  // deduplicate by type
    showToast('warning', '⚠ '+sig.message)

════════════════════════════════════════
FASE 6 — DESTROY CHART LAMA
════════════════════════════════════════
  IF window.runChartInstance:
    window.runChartInstance.destroy()
    window.runChartInstance = null

════════════════════════════════════════
FASE 7 — WARNA TITIK
════════════════════════════════════════
  ptColors = classified.map(p=>{
    IF astronomicalPoints.some(a=>a.index===p.index):
      RETURN getCSSVar('--accent-red')    // astronomical: merah
    IF p.side==='above': RETURN getCSSVar('--chart-bar-vital')  // biru: above
    IF p.side==='below': RETURN getCSSVar('--text-muted')       // abu: below
    RETURN getCSSVar('--accent-amber')    // on median: amber
  })

  ptRadius = classified.map(p=>
    astronomicalPoints.some(a=>a.index===p.index) ? 9 : 5)

════════════════════════════════════════
FASE 8 — RENDER CHART.JS v4
════════════════════════════════════════
  IF typeof annotationPlugin !== 'undefined': Chart.register(annotationPlugin)

  datasets = [
    {
      type:'line',
      label: sanitizeText(options.yLabel||'Nilai'),
      data: classified.map(p=>p.value),
      borderColor: getCSSVar('--chart-bar-vital'),
      borderWidth: 2,
      pointBackgroundColor: ptColors,
      pointRadius: ptRadius,
      pointHoverRadius: 10,
      tension: 0,
      fill: false,
      order: 1
    }
  ]

  // Annotations object
  annotations = {}

  // Median line
  IF options.showMedian:
    annotations.median = {
      type:'line', scaleID:'y', value:median,
      borderColor: getCSSVar('--accent-green'),
      borderWidth: 2,
      label:{
        display:true,
        content:'Median='+median.toFixed(3),
        position:'start',
        backgroundColor: getCSSVar('--accent-green')+'CC',
        color:'#fff',
        font:{size:11,weight:'bold'},
        padding:{x:6,y:3}
      }
    }

  // Highlight run shift zones (box annotations)
  IF options.showAnnotations:
    runShiftSignals = signals.filter(s=>s.type==='shift')
    FOR i, sig of runShiftSignals:
      annotations['shift_'+i] = {
        type:'box',
        xMin: sig.startIdx - 0.5,
        xMax: sig.endIdx   + 0.5,
        backgroundColor: getCSSVar('--accent-red')+'20',
        borderColor: getCSSVar('--accent-red')+'60',
        borderWidth: 1
      }

    // Trend zone highlight
    trendSignals = signals.filter(s=>s.type==='trend')
    FOR i, sig of trendSignals:
      annotations['trend_'+i] = {
        type:'box',
        xMin: sig.startIdx - 0.5,
        xMax: sig.endIdx   + 0.5,
        backgroundColor: getCSSVar('--accent-amber')+'20',
        borderColor: getCSSVar('--accent-amber')+'60',
        borderWidth: 1
      }

  runChartConfig = {
    type:'line',
    data: {
      labels: classified.map(p=>p.label),
      datasets
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      animation:{duration:500, easing:'easeOutQuart'},
      interaction:{mode:'index', intersect:false},
      scales:{
        x:{
          grid:{color:getCSSVar('--border-base')},
          ticks:{
            color:getCSSVar('--text-secondary'),
            font:{family:getCSSVar('--font-body'),size:11},
            maxTicksLimit:20, maxRotation:45,
            callback:(v,i)=>{l=classified[i]?.label||''; RETURN l.length>12?l.slice(0,10)+'…':l}
          },
          title:{display:true, text:sanitizeText(options.xLabel||'Urutan'),
                 color:getCSSVar('--text-secondary'), font:{size:12}}
        },
        y:{
          grid:{color:getCSSVar('--border-base')},
          ticks:{color:getCSSVar('--text-secondary'), font:{family:getCSSVar('--font-mono'),size:11}},
          title:{display:true, text:sanitizeText(options.yLabel||'Nilai'),
                 color:getCSSVar('--text-secondary'), font:{size:12}}
        }
      },
      plugins:{
        legend:{labels:{color:getCSSVar('--text-secondary'),font:{family:getCSSVar('--font-body'),size:12}}},
        tooltip:{
          backgroundColor:getCSSVar('--bg-secondary'), borderColor:getCSSVar('--border-base'),
          borderWidth:1, titleColor:getCSSVar('--text-primary'), bodyColor:getCSSVar('--text-secondary'),
          callbacks:{
            afterLabel: item => {
              p = classified[item.dataIndex]
              isAstro = astronomicalPoints.some(a=>a.index===p.index)
              lines = [' Sisi Median: '+(p.side==='above'?'Atas ▲':p.side==='below'?'Bawah ▼':'Tepat di Median')]
              IF isAstro: lines.push(' ⚠ ASTRONOMICAL POINT')
              RETURN lines
            }
          }
        },
        annotation:{clip:false, annotations}
      }
    }
  }

  window.runChartInstance = new Chart(
    document.getElementById('rc-canvas').getContext('2d'), runChartConfig)

════════════════════════════════════════
FASE 9 — PANEL STATISTIK
════════════════════════════════════════
  statEl=document.getElementById('rc-stats'); IF !statEl: RETURN
  statEl.innerHTML=''

  mkCard=(lbl,val,sub,cls)=>{
    c=el('div','stat-card'+(cls?' '+cls:'')); c.appendChild(span('stat-label',lbl))
    c.appendChild(span('stat-value',val))
    IF sub: c.appendChild(span('stat-sub',sub))
    RETURN c
  }
  el=(t,c)=>{e=document.createElement(t);if(c)e.className=c;return e}
  span=(c,t)=>{s=el('span',c);s.textContent=t;return s}

  isStable = signals.filter(s=>s.type!=='astronomical').length===0
  statusCls = isStable ? 'vital' : 'trivial'
  statusTxt = isStable ? '✓ TIDAK ADA SIGNAL NON-RANDOM' : '⚠ SIGNAL TERDETEKSI'

  statEl.appendChild(mkCard('n (Data Poin)', n, null, null))
  statEl.appendChild(mkCard('Median', median.toFixed(4), null, null))
  statEl.appendChild(mkCard('Status', statusTxt, null, statusCls))
  statEl.appendChild(mkCard('Run Aktual', runCount,
    'Expected: '+expectedRuns.toFixed(1)+(sdRuns>0?' (±'+sdRuns.toFixed(1)+')':''), null))
  statEl.appendChild(mkCard('Run Terpanjang', maxRunLen,
    maxRunLen>=8?'⚠ Melebihi batas (8)':'Dalam batas', maxRunLen>=8?'trivial':null))
  IF astronomicalPoints.length>0:
    statEl.appendChild(mkCard('Astronomical Points',
      astronomicalPoints.length+' titik',
      'Nilai > Median ± 3×IQR', 'trivial'))

════════════════════════════════════════
FASE 10 — TABEL RINGKASAN SIGNAL
════════════════════════════════════════
  tbl=document.getElementById('rc-summary-table'); IF !tbl: RETURN
  tbl.innerHTML=''

  // Tabel sinyal yang terdeteksi
  thead=el('thead'); tr=el('tr')
  FOR col of ['Tipe Signal','Deskripsi','Titik Awal','Titik Akhir','Status']:
    th=el('th'); th.textContent=col; tr.appendChild(th)
  thead.appendChild(tr); tbl.appendChild(thead)

  tbody=el('tbody')
  IF signals.length===0:
    tr=el('tr'); td=el('td'); td.colSpan=5
    td.textContent='Tidak ada signal non-random terdeteksi — proses tampak stabil'
    td.style.textAlign='center'; tr.appendChild(td); tbody.appendChild(tr)
  ELSE:
    FOR sig of signals:
      tr=el('tr'); tr.className='vital-row'
      FOR [v,c] of [
        [sig.type.charAt(0).toUpperCase()+sig.type.slice(1),''],
        [sig.message,''],
        [sig.startIdx!==null?'#'+(sig.startIdx+1):'—','num'],
        [sig.endIdx!==null?'#'+(sig.endIdx+1):'—','num'],
        ['⚠ Signal','status vital']
      ]:
        td=el('td'); if(c)td.className=c; td.textContent=String(v); tr.appendChild(td)
      tbody.appendChild(tr)
  tbl.appendChild(tbody)

════════════════════════════════════════
FASE 11 — EXPORT
════════════════════════════════════════
  exportRunPNG():
    IF !window.runChartInstance: showToast('error','Render chart dulu'); RETURN
    triggerDownload(window.runChartInstance.toBase64Image('image/png'),'run-chart.png')

  exportRunCSV():
    IF !classified||classified.length===0: RETURN
    BOM='\\uFEFF'
    header='Label,Nilai,Posisi_Median,Astronomical\\n'
    rows=classified.map(p=>{
      astro=astronomicalPoints.some(a=>a.index===p.index)?'YA':'TIDAK'
      sideLabel=p.side==='above'?'Atas':p.side==='below'?'Bawah':'Tepat di Median'
      RETURN '"'+p.label.replace(/"/g,'""')+'",'+p.value+','+sideLabel+','+astro
    }).join('\\n')
    signalSection='\\n# Sinyal Terdeteksi\\n'+
      (signals.length===0?'Tidak ada signal\\n':
       signals.map(s=>s.type+': '+s.message).join('\\n'))+'\\n'
    statsSection='\\n# Statistik\\n'
      +'Median,'+median+'\\nn,'+n+'\\nRun Aktual,'+runCount+'\\n'
      +'Run Expected,'+expectedRuns.toFixed(2)+'\\nRun Terpanjang,'+maxRunLen+'\\n'
    blob=new Blob([BOM+header+rows+signalSection+statsSection],{type:'text/csv;charset=utf-8'})
    triggerDownload(URL.createObjectURL(blob),'run-chart-data.csv')
```

---

## 5-EXT2. CATATAN IMPLEMENTASI — SCATTER & RUN CHART

### 5.3-EXT2 AppState (Updated — 7 Tool)

```js
// Update AppState di app.js — tambahkan 2 sub-state baru
const AppState = {
  activeTab: 'flowchart',  // +2 nilai: 'scatter'|'runchart'

  // ... flowchart, pareto, controlChart, histogram, fishbone tetap sama ...

  scatter: {               // [BARU v4.2]
    title:          '',
    xLabel:         'X',
    yLabel:         'Y',
    showRegression: true,
    showBand:       false,
    rows:           []     // { id, label, x, y }
  },

  runChart: {              // [BARU v4.2]
    title:           '',
    xLabel:          'Urutan',
    yLabel:          'Nilai',
    showMedian:      true,
    showAnnotations: true,
    detectTrend:     true,
    rows:            []    // { id, label, value }
  }
}

// Update restoreState() — validasi 2 state baru
function restoreState() {
  // ... existing code untuk semua tool lama ...

  if (p.scatter) {
    const sc = p.scatter
    if (!Array.isArray(sc.rows)) sc.rows = []
    if (typeof sc.showRegression !== 'boolean') sc.showRegression = true
    if (typeof sc.showBand !== 'boolean') sc.showBand = false
    sc.rows = sc.rows.filter(r =>
      r && typeof r.id==='string' &&
      typeof r.x==='number' && typeof r.y==='number'
    )
    Object.assign(AppState.scatter, sc)
  }

  if (p.runChart) {
    const rc = p.runChart
    if (!Array.isArray(rc.rows)) rc.rows = []
    if (typeof rc.showMedian !== 'boolean') rc.showMedian = true
    if (typeof rc.showAnnotations !== 'boolean') rc.showAnnotations = true
    if (typeof rc.detectTrend !== 'boolean') rc.detectTrend = true
    rc.rows = rc.rows.filter(r =>
      r && typeof r.id==='string' && typeof r.value==='number'
    )
    Object.assign(AppState.runChart, rc)
  }
  // ...
}

// Fungsi helper baru yang wajib ditambahkan ke app.js:
function getScatterOptions() {
  return {
    title:          sanitizeText(document.getElementById('sc-title')?.value||'') || 'Scatter Diagram',
    xLabel:         sanitizeText(document.getElementById('sc-xlabel')?.value||'') || 'X',
    yLabel:         sanitizeText(document.getElementById('sc-ylabel')?.value||'') || 'Y',
    showRegression: document.getElementById('sc-show-regression')?.checked ?? true,
    showBand:       document.getElementById('sc-show-band')?.checked ?? false
  }
}
window.getScatterOptions = getScatterOptions

function getRunChartOptions() {
  return {
    title:           sanitizeText(document.getElementById('rc-title')?.value||'') || 'Run Chart',
    xLabel:          sanitizeText(document.getElementById('rc-xlabel')?.value||'') || 'Urutan',
    yLabel:          sanitizeText(document.getElementById('rc-ylabel')?.value||'') || 'Nilai',
    showMedian:      document.getElementById('rc-show-median')?.checked ?? true,
    showAnnotations: document.getElementById('rc-show-annotations')?.checked ?? true,
    detectTrend:     document.getElementById('rc-detect-trend')?.checked ?? true
  }
}
window.getRunChartOptions = getRunChartOptions
```

### 5.4-EXT2 DOM ID Registry — Scatter & Run Chart

#### Scatter Chart IDs

| ID Element | Tipe | Dipakai oleh | Keterangan |
|---|---|---|---|
| `tab-scatter` | `<button>` | app.js | Tab selector Scatter Chart |
| `panel-scatter` | `<div>` | app.js | Panel tool Scatter Chart |
| `sc-canvas` | `<canvas>` | scatter.js | Canvas Chart.js scatter |
| `sc-title` | `<input>` | scatter.js | Judul chart |
| `sc-xlabel` | `<input>` | scatter.js | Label sumbu X |
| `sc-ylabel` | `<input>` | scatter.js | Label sumbu Y |
| `sc-show-regression` | `<input type=checkbox>` | scatter.js | Toggle garis regresi |
| `sc-show-band` | `<input type=checkbox>` | scatter.js | Toggle confidence band 95% |
| `sc-rows-container` | `<tbody>` | scatter.js | Container baris data (Label, X, Y) |
| `sc-stats` | `<div>` | scatter.js | Panel statistik (r, r², persamaan) |
| `sc-summary-table` | `<table>` | scatter.js | Tabel ringkasan (X, Y, Ŷ, residual) |
| `btn-sc-render` | `<button>` | scatter.js | Render chart |
| `btn-sc-add-row` | `<button>` | scatter.js | Tambah titik data |
| `btn-sc-import-csv` | `<input type=file>` | scatter.js | Import CSV (hidden) |
| `btn-sc-paste` | `<button>` | scatter.js | Paste clipboard |
| `btn-sc-export-png` | `<button>` | scatter.js | Export PNG |
| `btn-sc-export-csv` | `<button>` | scatter.js | Export CSV dengan residual |
| `btn-sc-reset` | `<button>` | scatter.js | Reset (→ modal) |
| `empty-state-scatter` | `<div>` | app.js | Empty state Scatter |

#### Run Chart IDs

| ID Element | Tipe | Dipakai oleh | Keterangan |
|---|---|---|---|
| `tab-runchart` | `<button>` | app.js | Tab selector Run Chart |
| `panel-runchart` | `<div>` | app.js | Panel tool Run Chart |
| `rc-canvas` | `<canvas>` | runchart.js | Canvas Chart.js line |
| `rc-title` | `<input>` | runchart.js | Judul chart |
| `rc-xlabel` | `<input>` | runchart.js | Label sumbu X (waktu/urutan) |
| `rc-ylabel` | `<input>` | runchart.js | Label sumbu Y (nilai) |
| `rc-show-median` | `<input type=checkbox>` | runchart.js | Toggle garis median |
| `rc-show-annotations` | `<input type=checkbox>` | runchart.js | Toggle highlight zona signal |
| `rc-detect-trend` | `<input type=checkbox>` | runchart.js | Toggle deteksi trend |
| `rc-rows-container` | `<tbody>` | runchart.js | Container baris data (Label, Nilai) |
| `rc-stats` | `<div>` | runchart.js | Panel statistik (median, runs, signal) |
| `rc-summary-table` | `<table>` | runchart.js | Tabel signal terdeteksi |
| `btn-rc-render` | `<button>` | runchart.js | Render chart |
| `btn-rc-add-row` | `<button>` | runchart.js | Tambah nilai |
| `btn-rc-import-csv` | `<input type=file>` | runchart.js | Import CSV (hidden) |
| `btn-rc-paste` | `<button>` | runchart.js | Paste clipboard |
| `btn-rc-export-png` | `<button>` | runchart.js | Export PNG |
| `btn-rc-export-csv` | `<button>` | runchart.js | Export CSV dengan kolom signal |
| `btn-rc-reset` | `<button>` | runchart.js | Reset (→ modal) |
| `empty-state-runchart` | `<div>` | app.js | Empty state Run Chart |

### 5.6-EXT2 Pitfalls Tambahan (Total 37)

| # | Pitfall | Solusi | FAIL Signal |
|---|---|---|---|
| 30 | Scatter canvas tidak di-destroy sebelum re-render | `window.scatterChartInstance?.destroy()` sebelum `new Chart()` | "Canvas already in use" |
| 31 | Division by zero di regresi (Sxx=0, semua X sama) | Guard: `IF Math.max(...xs)===Math.min(...xs)` sebelum Fase 2 | NaN/Infinity di beta1 |
| 32 | Confidence band `fill:'-1'` tidak bekerja tanpa dataset di atasnya | Dataset upper band HARUS di-push SEBELUM lower band; lower band referensi '-1' | Band tidak ter-fill / error Chart.js |
| 33 | P-value scatter mengklaim presisi statistik klinis | Gunakan approxPValue() sebagai approksimasi; label "approx" di UI | Menyesatkan pengguna tentang signifikansi |
| 34 | Run Chart: titik tepat di median menghentikan run | `side='on'` → filter keluar dari `meaningful` sebelum hitung run; run tidak terputus | Run count salah; false signal |
| 35 | Run Chart: signal Shift duplikat (run 8 dilaporkan berkali-kali) | Reset setelah `trendLen>=6` + deduplicate signals by type sebelum toast | Toast berulang; sinyal ganda di tabel |
| 36 | Run Chart: expectedRuns formula: na+nb=0 (semua on median) | Guard: `IF nr > 0` sebelum hitung expectedRuns | Division by zero |
| 37 | Scatter CSV 2-kolom vs 3-kolom tidak terdeteksi otomatis | parseScatterDelimited(): IF cols.length===2 → label=auto, x=col0, y=col1; IF cols.length>=3 → label=col0, x=col1, y=col2 | Import gagal / kolom salah |

### 5.7-EXT2 Build Checkpoints — Scatter & Run Chart

#### Phase 8 — Scatter Chart Engine

| # | Task | PASS | FAIL |
|---|---|---|---|
| 8.1 | Input table 3-kolom (Label, X, Y) | Tambah 5 baris → AppState.scatter.rows sinkron | DOM tidak sinkron AppState |
| 8.2 | Validasi minimum 5 pasang | 4 baris → error toast muncul | Render dengan data kurang |
| 8.3 | Render titik scatter | 10 pasang → titik tampil; sumbu X dan Y auto-range | Titik tidak muncul |
| 8.4 | Garis regresi | Toggle ON → garis merah lurus melewati scatter | Garis tidak muncul/salah arah |
| 8.5 | Confidence band | Toggle ON → area abu-abu di sekitar garis | Band tidak ter-fill |
| 8.6 | Nilai r, r², persamaan | Data korelasi kuat → r≥0.9; panel menampilkan benar | r=NaN atau salah hitung |
| 8.7 | Tooltip residual | Hover titik → tooltip tampilkan X, Y, Ŷ, Residual | Tooltip kosong |
| 8.8 | Import CSV 2-kolom | CSV 2 kolom (tanpa label) → X dan Y terisi | Error parse / data kosong |
| 8.9 | Import CSV 3-kolom | CSV 3 kolom (Label, X, Y) → semua kolom terisi | Kolom mismatch |
| 8.10 | Export PNG + CSV | PNG download; CSV berisi kolom residual | File kosong |

#### Phase 9 — Run Chart Engine

| # | Task | PASS | FAIL |
|---|---|---|---|
| 9.1 | Input table 2-kolom (Label, Nilai) | 12 baris → AppState.runChart.rows sinkron | DOM tidak sinkron |
| 9.2 | Validasi minimum 10 poin | 8 baris → error toast muncul | Render dengan data kurang |
| 9.3 | Garis median | Toggle ON → garis hijau di median; label "Median=X.XX" | Garis tidak muncul |
| 9.4 | Warna titik above/below | Titik atas median: biru; bawah: abu; on: amber | Warna identik semua |
| 9.5 | Deteksi Run Shift ≥8 | Buat 9 titik berturutan di atas median → warning toast + highlight merah | Tidak ada toast/highlight |
| 9.6 | Deteksi Trend ≥6 | Buat 6 titik naik berturutan → warning toast + highlight amber | Tidak ada signal |
| 9.7 | Astronomical Points | Titik 3×IQR di atas median → titik merah besar | Titik tidak dibedakan |
| 9.8 | Tabel signal | Signal terdeteksi → muncul di tabel ringkasan bawah | Tabel kosong saat ada signal |
| 9.9 | Panel statistik | Runs aktual vs expected, longest run ditampilkan benar | Nilai runs salah |
| 9.10 | Export PNG + CSV | PNG download; CSV berisi kolom Posisi_Median dan Astronomical | File kosong |

### 5.8-EXT2 Reference Cases — Scatter & Run Chart

#### Case G: Scatter Chart — Korelasi Kuat Positif

```
Input pairs (n=8):
  Label     X     Y
  "A"       2     4.1
  "B"       4     7.9
  "C"       6    11.8
  "D"       8    16.2
  "E"      10    19.7
  "F"      12    24.1
  "G"      14    28.3
  "H"      16    32.0

Expected Kalkulasi:
  n=8
  X̄ = (2+4+6+8+10+12+14+16)/8 = 72/8 = 9.0
  Ȳ = (4.1+7.9+11.8+16.2+19.7+24.1+28.3+32.0)/8 = 144.1/8 = 18.0125

  Sxx = (2-9)²+(4-9)²+(6-9)²+(8-9)²+(10-9)²+(12-9)²+(14-9)²+(16-9)²
      = 49+25+9+1+1+9+25+49 = 168

  Sxy = (2-9)(4.1-18.0125) + ... ≈ 336.9
  Syy ≈ 672.9

  beta1 = Sxy/Sxx = 336.9/168 ≈ 2.006
  beta0 = Ȳ - beta1*X̄ = 18.0125 - 2.006*9.0 ≈ -0.041

  r  = Sxy/sqrt(Sxx*Syy) = 336.9/sqrt(168*672.9) ≈ 0.9997
  r² = 0.9994

  Interpretasi: "Positif Sangat Kuat" → toast success
  Persamaan: Ŷ ≈ -0.041 + 2.006X

  tStat = 0.9997 * sqrt(6) / sqrt(1-0.9994) ≈ 97.3
  pValue = < 0.001 (sangat signifikan)
```

#### Case H: Run Chart — Deteksi Signal Non-Random

```
Input values (n=20, urutan waktu):
  Titik  : 1    2    3    4    5    6    7    8    9   10
  Nilai  : 5.2  4.8  5.5  6.1  4.9  5.3  5.0  4.7  5.8  5.1
  Titik  : 11   12   13   14   15   16   17   18   19   20
  Nilai  : 7.2  7.8  8.1  8.5  7.9  8.3  8.6  7.5  8.0  8.4

Expected Kalkulasi:
  n=20
  sorted: [4.7,4.8,4.9,5.0,5.1,5.2,5.3,5.5,5.8,6.1,7.2,7.5,7.8,7.9,8.0,8.1,8.3,8.4,8.5,8.6]
  median = avg(sorted[9], sorted[10]) = (6.1+7.2)/2 = 6.65

  Klasifikasi (side):
    Titik  1–9:  semua < 6.65 → 'below' (9 titik berturutan di bawah)
    Titik 10:    6.1 < 6.65   → 'below'
    ← TOTAL 10 titik berturutan di bawah median!
    Titik 11–20: semua > 6.65 → 'above'

  meaningful (semua 'on' = kosong):
    below: titik 1–10 (na=10 titik? Salah — 'above' = titik 11-20)
    above: titik 11–20

  na (above) = 10, nb (below) = 10
  runs aktual = 2 (satu run below, satu run above)
  expectedRuns = (2*10*10/(10+10)) + 1 = 100/20 + 1 = 6.0

  Signal Shift:
    Run 'below': length=10 → ≥8 → SIGNAL terdeteksi!
    → Toast: "⚠ Run Shift: 10 titik berturutan di bawah median"
    → Highlight merah titik 1–10

  Signal Trend (titik 11–20: 7.2,7.8,8.1,8.5,7.9,8.3,8.6,7.5,8.0,8.4):
    Urutan: 7.2→7.8(up)→8.1(up)→8.5(up)→7.9(down): tren naik 3, reset
    Tidak ada 6+ titik berturutan naik/turun → TIDAK ada trend signal

  Astronomical Points:
    Q1 = sorted[5] = 5.2, Q3 = sorted[14] = 8.0
    IQR = 8.0-5.2 = 2.8
    Upper threshold = 6.65 + 3*2.8 = 15.05
    Lower threshold = 6.65 - 3*2.8 = -1.75
    Semua nilai dalam [4.7, 8.6] → TIDAK ada astronomical point

  Status: SIGNAL TERDETEKSI (1 shift signal)
  Panel: median=6.65, runs=2, expected=6.0, longest run=10
```

---

*Spesifikasi v4.2 — Scatter Chart & Run Chart Edition*
*Menambahkan Scatter Diagram (Pearson r, regresi linear, confidence band) dan Run Chart (analisis run, deteksi shift/trend, astronomical points) kepada 5 tool yang sudah ada di v4.1.*
*Total tool: 7. Total file JS: 9. Total DOM ID: ~131. Total pitfalls: 37. Build phases: 9.*

*Perubahan dari v4.1: +2 tool (Scatter, Run Chart), +38 DOM ID, +8 pitfall (total 37), +2 build phases, +2 reference cases (G, H), AppState diperluas dengan sub-state scatter & runChart, tambah helper getScatterOptions() dan getRunChartOptions() di app.js.*

