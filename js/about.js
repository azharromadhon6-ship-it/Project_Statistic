/* ============================================================
   about.js — populates the #about section with 7 tool guide cards.
   Loaded LAST so window.switchTab is available when users click
   a card's "Buka tool" button. No external deps.
   ============================================================ */
(function () {

  // Inline SVG icons matching each tab's navbar glyph.
  const ICONS = {
    flowchart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    pareto:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 16v-4M12 16V8M17 16v-2"/></svg>',
    controlchart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17l4-6 4 2 4-7 6 8"/><path d="M3 7h18M3 21h18" stroke-dasharray="3,3"/></svg>',
    histogram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="13" width="4" height="8"/><rect x="9" y="8" width="4" height="13"/><rect x="15" y="4" width="4" height="17"/></svg>',
    fishbone:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12h16"/><rect x="18" y="9" width="4" height="6"/><path d="M6 12l-3-4M10 12l-3-4M14 12l-3-4M6 12l-3 4M10 12l-3 4M14 12l-3 4"/></svg>',
    scatter:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M3 3v18"/><circle cx="7" cy="16" r="1.5"/><circle cx="10" cy="11" r="1.5"/><circle cx="13" cy="14" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="19" cy="6" r="1.5"/></svg>',
    runchart:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M3 3v18"/><polyline points="5,15 8,11 11,13 14,8 17,12 20,9"/></svg>'
  };

  // Tool guide content — each entry produces one card.
  const TOOLS = [
    {
      id: 'flowchart',
      title: 'Flowchart',
      subtitle: 'Peta Alur Proses',
      kegunaan: 'Menggambarkan urutan langkah dalam suatu proses secara visual menggunakan simbol standar.',
      steps: [
        'Tambah node → pilih tipe (Start/End/Process/Decision) → beri label → klik Tambah Node',
        'Hubungkan node → pilih Dari & Ke → klik Tambah Koneksi',
        'Klik Export PNG/SVG untuk menyimpan diagram'
      ],
      tips: 'Mulai selalu dengan node "Start" dan akhiri dengan node "End".'
    },
    {
      id: 'pareto',
      title: 'Pareto Chart',
      subtitle: 'Prioritas Masalah (80/20)',
      kegunaan: 'Menemukan 20% penyebab yang berkontribusi 80% terhadap masalah (Hukum Pareto).',
      steps: [
        'Isi kategori dan frekuensi kejadian',
        'Set Threshold % (default 80)',
        'Klik Render Chart',
        'Bar merah = "Vital Few" — fokus perbaikan di sini'
      ],
      tips: 'Urutkan data dari frekuensi terbesar ke terkecil sebelum input, atau biarkan sistem mengurutkan otomatis.'
    },
    {
      id: 'controlchart',
      title: 'Control Chart',
      subtitle: 'Kendali Proses Statistik (SPC)',
      kegunaan: 'Memantau stabilitas proses dari waktu ke waktu menggunakan batas kendali UCL dan LCL.',
      steps: [
        'Pilih tipe: I-MR (data individual) atau X̄-R (data subgroup)',
        'Input minimal 8 nilai pengukuran',
        'Klik Render Chart',
        'Titik MERAH = Out of Control (OOC) — investigasi penyebab khusus'
      ],
      tips: 'I-MR untuk satu pengukuran per waktu. X̄-R untuk rata-rata beberapa pengukuran per waktu.'
    },
    {
      id: 'histogram',
      title: 'Histogram',
      subtitle: 'Distribusi Data',
      kegunaan: 'Melihat sebaran dan bentuk distribusi data proses, serta menghitung kapabilitas (Cp/Cpk).',
      steps: [
        'Input nilai pengukuran (minimal 5)',
        'Isi LSL dan USL jika ada batas spesifikasi',
        'Pilih Method Bin (Sturges = otomatis)',
        'Klik Render Chart',
        'Cp/Cpk < 1.0 = proses tidak kapabel'
      ],
      tips: 'Cpk ≥ 1.33 adalah target proses yang baik.'
    },
    {
      id: 'fishbone',
      title: 'Fishbone (Ishikawa)',
      subtitle: 'Analisis Akar Masalah',
      kegunaan: 'Mengidentifikasi dan mengkategorikan penyebab potensial dari suatu masalah/efek.',
      steps: [
        'Isi Problem Statement di kotak Effect',
        'Pilih kategori 6M yang relevan',
        'Tambah causes di setiap kategori',
        'Klik Render Diagram'
      ],
      tips: '6M = Man, Machine, Material, Method, Measurement, Environment. Gunakan minimal 3 kategori untuk analisis yang komprehensif.'
    },
    {
      id: 'scatter',
      title: 'Scatter Diagram',
      subtitle: 'Korelasi Dua Variabel',
      kegunaan: 'Melihat hubungan/korelasi antara dua variabel proses.',
      steps: [
        'Isi pasangan nilai X dan Y (minimal 5)',
        'Aktifkan "Garis Regresi" untuk melihat tren',
        'Klik Render Chart'
      ],
      tips: 'Korelasi positif = titik naik ke kanan. Korelasi negatif = titik turun ke kanan. Tidak ada pola = tidak ada korelasi.'
    },
    {
      id: 'runchart',
      title: 'Run Chart',
      subtitle: 'Tren Proses dari Waktu ke Waktu',
      kegunaan: 'Melihat apakah proses menunjukkan tren, siklus, atau pergeseran dari median.',
      steps: [
        'Input nilai urut berdasarkan waktu (minimal 10)',
        'Aktifkan Median dan Trend untuk analisis lengkap',
        'Klik Render Chart'
      ],
      tips: 'Run Chart lebih sederhana dari Control Chart — gunakan saat data belum cukup untuk menghitung batas kendali statistik.'
    }
  ];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function buildCard(tool) {
    const card = el('article', 'about-card');
    card.dataset.tool = tool.id;

    // Header: icon + titles
    const header = el('div', 'about-card-header');
    const icon = el('span', 'about-icon');
    icon.setAttribute('aria-hidden', 'true');
    // Static SVG strings come from a controlled constant, never user input — safe.
    icon.innerHTML = ICONS[tool.id] || '';
    const h3 = el('h3');
    h3.appendChild(document.createTextNode(tool.title));
    const small = el('small'); small.textContent = tool.subtitle;
    h3.appendChild(small);
    header.append(icon, h3);
    card.appendChild(header);

    // Kegunaan
    card.appendChild(el('p', 'about-kegunaan', tool.kegunaan));

    // Steps label + ordered list
    card.appendChild(el('div', 'about-steps-label', 'Cara pakai'));
    const ol = el('ol', 'about-steps');
    tool.steps.forEach(step => ol.appendChild(el('li', null, step)));
    card.appendChild(ol);

    // Tip
    card.appendChild(el('p', 'about-tips', '💡 Tips: ' + tool.tips));

    // "Buka tool" link — uses switchTab if it's available (lazy lookup at click time)
    const openBtn = el('button', 'btn-secondary btn-icon', null);
    openBtn.type = 'button';
    openBtn.style.marginTop = '0.6rem';
    openBtn.style.alignSelf = 'flex-start';
    openBtn.textContent = 'Buka ' + tool.title + ' →';
    openBtn.addEventListener('click', () => {
      if (typeof window.switchTab === 'function') {
        window.switchTab(tool.id);
        const tabBar = document.querySelector('.tabs');
        if (tabBar) tabBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        location.hash = '#tab-' + tool.id;
      }
    });
    card.appendChild(openBtn);

    return card;
  }

  function renderAbout() {
    const section = document.getElementById('about');
    if (!section) return;
    section.innerHTML = '';

    const h2 = el('h2', null, 'Panduan Penggunaan');
    section.appendChild(h2);

    const intro = el('p', 'about-intro',
      'Ringkasan singkat tiap tool — kegunaan, langkah-langkah pemakaian, dan tips. Klik tombol di setiap kartu untuk langsung membuka tool tersebut.');
    section.appendChild(intro);

    const grid = el('div', 'about-grid');
    TOOLS.forEach(t => grid.appendChild(buildCard(t)));
    section.appendChild(grid);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAbout);
  } else {
    renderAbout();
  }

})();
