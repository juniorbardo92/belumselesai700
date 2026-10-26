(function () {
  "use strict";

  const CONFIG = window.PANGLIMA_CONFIG;
  const STORAGE_KEY = "panglima-umkm-safe-v1";
  const OWN = Object.prototype.hasOwnProperty;

  const DOMAINS = [
    {
      id: "pemasaran", name: "Pemasaran", icon: "📣",
      questions: ["Calon pembeli ideal sudah didefinisikan dengan jelas.", "Konten menjelaskan masalah pelanggan, bukan hanya menampilkan produk.", "Ada cara sederhana untuk mengetahui kanal pemasaran yang menghasilkan."],
      action: "Tentukan satu segmen pelanggan dan satu pesan utama sebelum menambah konten atau iklan.",
      book: "Pemasaran: target pelanggan dan pesan utama"
    },
    {
      id: "penjualan", name: "Penjualan", icon: "🧾",
      questions: ["Pertanyaan calon pembeli ditindaklanjuti secara konsisten.", "Alasan calon pembeli batal sudah dicatat.", "Ada langkah berikutnya yang jelas setelah pelanggan bertanya."],
      action: "Buat daftar calon pembeli, jadwalkan follow-up yang sopan, dan catat alasan pembelian.",
      book: "Penjualan: follow-up dan proses closing"
    },
    {
      id: "operasional", name: "Operasional", icon: "⚙️",
      questions: ["Pekerjaan harian tetap berjalan meskipun pemilik tidak hadir.", "Aktivitas yang berulang memiliki panduan kerja sederhana.", "Kesalahan pesanan atau keterlambatan dicatat dan diperbaiki."],
      action: "Tulis tiga SOP paling penting dan pilih satu aktivitas yang bisa didelegasikan minggu ini.",
      book: "Operasional: SOP dan ketergantungan pada owner"
    },
    {
      id: "keuangan", name: "Keuangan", icon: "💰",
      questions: ["Uang pribadi dan uang usaha sudah dipisahkan.", "Margin setiap produk utama dihitung secara rutin.", "Arus kas masuk dan keluar dicatat setidaknya setiap minggu."],
      action: "Pisahkan uang usaha, hitung margin produk utama, lalu catat arus kas selama tujuh hari.",
      book: "Keuangan: margin, harga sehat, dan arus kas"
    },
    {
      id: "tim", name: "Tim / SDM", icon: "🤝",
      questions: ["Setiap anggota tim memahami tanggung jawab utamanya.", "Pemilik memiliki cara mengecek hasil tanpa mengawasi setiap menit.", "Masalah koordinasi tim dibicarakan dan dicatat secara berkala."],
      action: "Tentukan satu hasil kerja yang terukur untuk setiap orang dan adakan evaluasi singkat mingguan.",
      book: "Tim / SDM: pembagian peran dan evaluasi"
    },
    {
      id: "digital", name: "Digital", icon: "📱",
      questions: ["Informasi kontak dan cara pemesanan mudah ditemukan secara online.", "Usaha menyimpan data pelanggan atau transaksi dengan rapi.", "Alat digital yang dipakai benar-benar membantu pekerjaan atau penjualan."],
      action: "Rapikan profil bisnis, tautan pemesanan, dan pencatatan data pelanggan yang paling penting.",
      book: "Digital: kanal, data pelanggan, dan alat kerja"
    },
    {
      id: "produksi", name: "Produksi", icon: "🏭",
      questions: ["Biaya bahan baku dan biaya produksi diketahui untuk produk utama.", "Kualitas produk dijaga dengan standar sederhana.", "Jumlah produksi disesuaikan dengan permintaan dan kapasitas."],
      action: "Hitung biaya produksi aktual dan tentukan standar kualitas serta jumlah produksi yang sehat.",
      book: "Produksi: biaya, kualitas, dan kapasitas"
    },
    {
      id: "distribusi", name: "Distribusi", icon: "🚚",
      questions: ["Stok yang cepat laku dan lambat bergerak dapat dibedakan.", "Biaya pengiriman atau distribusi sudah diperhitungkan.", "Pelanggan menerima informasi pengiriman yang jelas."],
      action: "Petakan stok lambat, biaya distribusi, dan satu perbaikan komunikasi pengiriman.",
      book: "Distribusi: stok, pengiriman, dan biaya"
    },
    {
      id: "negosiasi", name: "Negosiasi", icon: "🗣️",
      questions: ["Usaha mengetahui harga minimum yang masih sehat sebelum memberi diskon.", "Syarat kerja sama atau pembayaran dikomunikasikan dengan jelas.", "Negosiasi tidak hanya bergantung pada menurunkan harga."],
      action: "Tentukan batas harga minimum, syarat pembayaran, dan nilai tambah selain diskon.",
      book: "Negosiasi: batas harga dan nilai tambah"
    },
    {
      id: "ekspansi", name: "Ekspansi", icon: "🧭",
      questions: ["Usaha memahami kapasitas yang tersedia sebelum menambah produk atau cabang.", "Keputusan bertumbuh didasarkan pada angka, bukan hanya ikut tren.", "Ada prioritas 30 hari yang disepakati dan dapat dipantau."],
      action: "Tunda ekspansi yang belum siap, tentukan satu target 30 hari, dan ukur kapasitas terlebih dahulu.",
      book: "Ekspansi: kapasitas, prioritas, dan target"
    }
  ];

  const TASKS = [
    ["Lengkapi profil usaha", "Tulis jenis usaha, pemilik, dan kondisi yang ingin diperbaiki."],
    ["Kerjakan Diagnosis 10 Medan", "Jawab 30 pertanyaan sesuai kondisi nyata usaha."],
    ["Pilih medan paling kritis", "Periksa skor merah atau skor terendah yang sudah lengkap."],
    ["Tentukan tiga masalah utama", "Pilih masalah yang paling mengganggu operasional atau kas."],
    ["Hitung margin produk utama", "Gunakan kalkulator margin pada menu Toolkit."],
    ["Periksa kebocoran margin", "Mulai audit Checklist 17 Kebocoran Margin."],
    ["Susun prioritas minggu pertama", "Bagikan hasil diagnosis kepada pendamping saat diperlukan."],
    ["Definisikan pelanggan ideal", "Tulis siapa yang dibantu dan masalah yang mereka hadapi."],
    ["Perjelas nilai produk", "Jelaskan alasan pelanggan memilih tanpa langsung memberi diskon."],
    ["Audit konten pemasaran", "Pilih konten yang membantu pelanggan memahami masalahnya."],
    ["Rapikan cara pemesanan", "Pastikan kontak dan langkah membeli mudah dipahami."],
    ["Susun follow-up yang sopan", "Tentukan pesan, konteks, dan langkah berikutnya."],
    ["Catat alasan gagal closing", "Pisahkan kendala harga, kepercayaan, kebutuhan, dan waktu."],
    ["Evaluasi pemasaran dan penjualan", "Catat prospek, transaksi, dan satu perubahan yang berhasil."],
    ["Pisahkan uang pribadi dan usaha", "Mulai rekening atau pencatatan terpisah untuk usaha."],
    ["Mulai pencatatan arus kas", "Isi pemasukan dan pengeluaran pada Cash Flow 7 Hari."],
    ["Hitung harga minimum sehat", "Gunakan biaya aktual dan margin target yang realistis."],
    ["Periksa stok lambat", "Tandai produk yang menahan kas terlalu lama."],
    ["Tulis satu SOP penting", "Dokumentasikan proses yang paling sering berulang."],
    ["Delegasikan satu pekerjaan", "Pilih aktivitas yang tidak harus selalu dikerjakan owner."],
    ["Evaluasi operasional dan kas", "Cek saldo tujuh hari serta hambatan kerja yang berulang."],
    ["Tetapkan KPI mingguan", "Tulis target omzet, prospek, transaksi, dan biaya."],
    ["Perbaiki titik bocor prioritas", "Pilih satu kebocoran margin yang paling mudah ditangani."],
    ["Hubungi pelanggan lama", "Lakukan follow-up bernilai tanpa komunikasi memaksa."],
    ["Periksa kapasitas sebelum ekspansi", "Nilai stok, tim, waktu, dan arus kas yang tersedia."],
    ["Siapkan pertanyaan hot seat", "Tulis satu masalah nyata yang ingin dibedah bersama."],
    ["Ulangi diagnosis medan kritis", "Periksa apakah kebiasaan atau pencatatan sudah membaik."],
    ["Susun rencana 30 hari berikutnya", "Tentukan satu target utama dan tiga tindakan pendukung."],
    ["Susun rencana 60 dan 90 hari", "Lanjutkan hanya jika kapasitas dan arus kas mendukung."],
    ["Buat laporan perjalanan", "Bagikan rangkuman progres dan siapkan tindak lanjut." ]
  ].map(function (task, index) {
    return { id: "day-" + (index + 1), day: index + 1, title: task[0], detail: task[1] };
  });

  const LEAKS = [
    "Harga jual belum memasukkan seluruh biaya produksi.",
    "Diskon diberikan tanpa mengetahui margin minimum.",
    "Ongkir atau subsidi pengiriman tidak dihitung.",
    "Biaya admin marketplace atau pembayaran terlewat.",
    "Produk rusak atau retur tidak dicatat sebagai biaya.",
    "Stok lambat menahan kas terlalu lama.",
    "Bahan baku terbuang karena perencanaan kurang tepat.",
    "Pencatatan uang pribadi dan usaha masih bercampur.",
    "Komisi atau biaya promosi tidak masuk perhitungan produk.",
    "Bundling dibuat tanpa menghitung margin gabungan.",
    "Pelanggan berutang tanpa batas waktu yang jelas.",
    "Pembelian stok mengikuti tren, bukan permintaan nyata.",
    "Harga belum diperbarui setelah biaya bahan naik.",
    "Jam kerja atau biaya tenaga belum diperhitungkan.",
    "Peralatan dan perawatan tidak disisihkan dalam biaya.",
    "Repeat order rendah sehingga biaya mencari pelanggan meningkat.",
    "Produk ramai terjual, tetapi keuntungan per transaksi tidak dipantau."
  ];

  const NAV_ITEMS = [
    { id: "home", icon: "⌂", label: "Beranda" },
    { id: "diagnosis", icon: "◉", label: "Diagnosis" },
    { id: "actions", icon: "✓", label: "Aksi" },
    { id: "tools", icon: "▦", label: "Toolkit" },
    { id: "account", icon: "♙", label: "Akun" }
  ];

  function defaultState() {
    return {
      activated: false,
      profile: { owner: "", business: "", type: "", goal: "" },
      answers: {},
      tasks: {},
      leaks: {},
      cashflow: Array.from({ length: 7 }, function () { return { income: 0, expense: 0 }; }),
      kpi: { leads: 0, transactions: 0, revenue: 0, expense: 0 },
      actionPlan: { thirty: "", sixty: "", ninety: "", hotseat: "" }
    };
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const saved = JSON.parse(raw);
      const initial = defaultState();
      return {
        activated: saved.activated === true,
        profile: Object.assign(initial.profile, saved.profile || {}),
        answers: Object.assign(initial.answers, saved.answers || {}),
        tasks: Object.assign(initial.tasks, saved.tasks || {}),
        leaks: Object.assign(initial.leaks, saved.leaks || {}),
        cashflow: Array.isArray(saved.cashflow) && saved.cashflow.length === 7 ? saved.cashflow : initial.cashflow,
        kpi: Object.assign(initial.kpi, saved.kpi || {}),
        actionPlan: Object.assign(initial.actionPlan, saved.actionPlan || {})
      };
    } catch (error) {
      return defaultState();
    }
  }

  let state = loadState();
  let currentView = "home";
  let activeTool = "";
  let toolResult = null;
  let toastTimer = null;

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      toast("Data belum bisa disimpan. Periksa ruang penyimpanan perangkat.");
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function numeric(value) {
    const parsed = Number(String(value == null ? "0" : value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function rupiah(value) {
    return "Rp" + Math.round(numeric(value)).toLocaleString("id-ID");
  }

  function signedRupiah(value) {
    const amount = Number(value) || 0;
    return (amount < 0 ? "-" : "") + rupiah(Math.abs(amount));
  }

  function classifyScore(score) {
    if (score < 50) return { tone: "red", label: "Kritis" };
    if (score < 75) return { tone: "yellow", label: "Perlu perhatian" };
    return { tone: "green", label: "Relatif sehat" };
  }

  function scoreDomain(domain, answers) {
    let answered = 0;
    let total = 0;
    domain.questions.forEach(function (_, index) {
      const key = domain.id + "-" + index;
      if (OWN.call(answers, key)) {
        const value = Number(answers[key]);
        if (Number.isInteger(value) && value >= 0 && value <= 2) {
          answered += 1;
          total += value;
        }
      }
    });
    const complete = answered === domain.questions.length;
    const score = complete ? Math.round(total / (domain.questions.length * 2) * 100) : null;
    return { answered: answered, complete: complete, score: score };
  }

  function domainResults(answers) {
    return DOMAINS.map(function (domain, index) {
      const result = scoreDomain(domain, answers);
      return Object.assign({ domain: domain, index: index }, result, result.complete ? classifyScore(result.score) : { tone: "neutral", label: "Belum lengkap" });
    });
  }

  function rankCompletedDomains(answers) {
    return domainResults(answers).filter(function (result) { return result.complete; }).sort(function (left, right) {
      return left.score - right.score || left.index - right.index;
    });
  }

  function diagnosisProgress() {
    const answered = domainResults(state.answers).reduce(function (sum, result) { return sum + result.answered; }, 0);
    const total = DOMAINS.reduce(function (sum, domain) { return sum + domain.questions.length; }, 0);
    return { answered: answered, total: total, percent: Math.round(answered / total * 100), complete: answered === total };
  }

  function actionProgress() {
    const completed = TASKS.filter(function (task) { return state.tasks[task.id] === true; }).length;
    return { completed: completed, total: TASKS.length, percent: Math.round(completed / TASKS.length * 100) };
  }

  function calculateMargin(selling, productCost, operatingCost) {
    const price = numeric(selling);
    const cost = numeric(productCost) + numeric(operatingCost);
    const profit = price - cost;
    return { selling: price, cost: cost, profit: profit, margin: price > 0 ? profit / price * 100 : 0 };
  }

  function calculateMinimumPrice(productCost, operatingCost, targetMargin) {
    const cost = numeric(productCost) + numeric(operatingCost);
    const margin = numeric(targetMargin);
    if (margin >= 100) return null;
    return { cost: cost, targetMargin: margin, minimumPrice: cost / (1 - margin / 100) };
  }

  function summarizeCashflow(entries) {
    const totals = entries.reduce(function (result, entry) {
      result.income += numeric(entry.income);
      result.expense += numeric(entry.expense);
      return result;
    }, { income: 0, expense: 0 });
    totals.balance = totals.income - totals.expense;
    return totals;
  }

  function progressBar(progress, label) {
    return '<div class="progress-meta"><span>' + escapeHtml(label) + '</span><strong>' + progress.percent + '%</strong></div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + progress.percent + '%"></div></div>';
  }

  function toast(message) {
    const element = document.getElementById("toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { element.classList.remove("show"); }, 2200);
  }

  function openUrl(url) {
    if (typeof url !== "string" || !/^https:\/\//i.test(url)) {
      toast("Tautan resmi belum dikonfigurasi.");
      return;
    }
    if (window.PanglimaAndroid && typeof window.PanglimaAndroid.openExternal === "function") {
      window.PanglimaAndroid.openExternal(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function shareText(content) {
    if (window.PanglimaAndroid && typeof window.PanglimaAndroid.shareText === "function") {
      window.PanglimaAndroid.shareText(content);
      return;
    }
    if (navigator.share) {
      navigator.share({ text: content }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(content).then(function () { toast("Laporan disalin."); }).catch(function () { toast("Laporan belum bisa dibagikan."); });
      return;
    }
    toast("Fitur berbagi tersedia di aplikasi Android.");
  }

  function reportText() {
    const actions = actionProgress();
    const ranked = rankCompletedDomains(state.answers);
    const cash = summarizeCashflow(state.cashflow);
    return [
      "LAPORAN PENDAMPINGAN PANGLIMA UMKM",
      "Pemilik: " + state.profile.owner,
      "Usaha: " + state.profile.business,
      "Jenis usaha: " + (state.profile.type || "Belum diisi"),
      "Diagnosis: " + diagnosisProgress().answered + "/" + diagnosisProgress().total + " pertanyaan",
      "Medan prioritas: " + (ranked[0] ? ranked[0].domain.name + " (" + ranked[0].score + "%)" : "Belum tersedia"),
      "Aksi selesai: " + actions.completed + "/" + actions.total,
      "Saldo arus kas 7 hari: " + signedRupiah(cash.balance),
      "Rencana 30 hari: " + (state.actionPlan.thirty || "Belum diisi"),
      CONFIG.tagline
    ].join("\n");
  }

  function renderActivation() {
    return '<section class="onboarding">' +
      '<div class="welcome-card"><div class="brand-mark">P</div><div class="eyebrow">Akses khusus pembeli</div><h1>Panglima UMKM</h1><p>Pendamping implementasi 30 hari untuk mengenali prioritas, menjalankan strategi, dan memantau progres.</p></div>' +
      '<div class="card"><h2>Aktivasi pendampingan</h2><p class="muted small">Lengkapi profil usaha agar diagnosis dan laporan terasa relevan.</p>' +
      '<form id="activation-form"><div class="field"><label for="owner">Nama pemilik usaha</label><input id="owner" name="owner" autocomplete="name" required maxlength="80" placeholder="Contoh: Bu Rani"></div>' +
      '<div class="field"><label for="business">Nama usaha</label><input id="business" name="business" required maxlength="100" placeholder="Contoh: Dapur Bu Rani"></div>' +
      '<div class="field"><label for="type">Jenis usaha</label><input id="type" name="type" maxlength="80" placeholder="Kuliner, fashion, jasa, atau lainnya"></div>' +
      '<div class="field"><label for="activation-code">Kode aktivasi demo</label><input id="activation-code" name="activationCode" required autocomplete="off" spellcheck="false" placeholder="Masukkan kode aktivasi"></div>' +
      '<p id="activation-error" class="inline-message"></p><button class="button block" type="submit">Masuk ke Aplikasi</button></form></div>' +
      '<div class="notice"><strong>Mode SAFE / demo:</strong> gunakan kode <strong>' + escapeHtml(CONFIG.demoActivationCode) + '</strong>. Validasi pembelian asli belum dihubungkan dan tidak menyentuh sistem affiliate.</div>' +
      '</section>';
  }

  function renderNav() {
    return '<nav class="bottom-nav" aria-label="Navigasi utama">' + NAV_ITEMS.map(function (item) {
      const active = currentView === item.id || currentView === "mentoring" && item.id === "account";
      return '<button class="nav-button' + (active ? ' active' : '') + '" data-view="' + item.id + '" type="button"><span class="icon">' + item.icon + '</span><span class="label">' + item.label + '</span></button>';
    }).join("") + '</nav>';
  }

  function renderHome() {
    const diagnosis = diagnosisProgress();
    const actions = actionProgress();
    const ranked = rankCompletedDomains(state.answers);
    const nextTask = TASKS.find(function (task) { return !state.tasks[task.id]; });
    return '<header class="hero"><div class="eyebrow">Pendamping 30 hari</div><h1>Selamat datang, ' + escapeHtml(state.profile.owner) + '</h1><p>' + escapeHtml(state.profile.business) + ' · ' + escapeHtml(CONFIG.tagline) + '</p></header>' +
      '<section class="page"><div class="stat-grid"><div class="stat"><span class="label">Diagnosis terjawab</span><span class="value">' + diagnosis.answered + '/' + diagnosis.total + '</span></div>' +
      '<div class="stat"><span class="label">Misi selesai</span><span class="value">' + actions.completed + '/' + actions.total + '</span></div></div>' +
      '<div class="section-heading"><h2>Peta perang bisnis</h2><button data-view="diagnosis" type="button">Lihat</button></div>' +
      (ranked[0] ? '<article class="card"><span class="badge ' + ranked[0].tone + '">' + escapeHtml(ranked[0].label) + ' · ' + ranked[0].score + '%</span><h2 style="margin-top:12px">Medan prioritas: ' + escapeHtml(ranked[0].domain.name) + '</h2><p class="muted small">' + escapeHtml(ranked[0].domain.action) + '</p><button class="button compact gold" data-view="diagnosis" type="button">Lihat rekomendasi</button></article>' :
        '<article class="card"><h2>Temukan medan prioritas</h2><p class="muted small">Selesaikan minimal satu medan diagnosis untuk melihat rekomendasi awal.</p><button class="button compact" data-view="diagnosis" type="button">Mulai Diagnosis</button></article>') +
      '<article class="card"><div class="eyebrow muted">Perintah berikutnya</div><h3 style="margin-top:8px">' + escapeHtml(nextTask ? nextTask.title : "Seluruh misi sudah selesai") + '</h3><p class="small muted">' + escapeHtml(nextTask ? nextTask.detail : "Bagikan laporan perkembangan kepada pendamping.") + '</p>' + progressBar(actions, actions.completed + " dari " + actions.total + " misi selesai") + '</article>' +
      '<div class="section-heading"><h2>Akses cepat</h2></div><div class="quick-grid">' +
      '<button class="quick-action" data-view="diagnosis"><span class="icon">🧭</span><span class="label">Diagnosis 10 Medan</span></button>' +
      '<button class="quick-action" data-view="actions"><span class="icon">📋</span><span class="label">Misi 30 Hari</span></button>' +
      '<button class="quick-action" data-view="tools"><span class="icon">🧮</span><span class="label">Toolkit Bisnis</span></button>' +
      '<button class="quick-action" data-view="mentoring"><span class="icon">🎥</span><span class="label">Pendampingan</span></button></div></section>';
  }

  function renderDiagnosis() {
    const progress = diagnosisProgress();
    const ranked = rankCompletedDomains(state.answers);
    const results = domainResults(state.answers);
    const recommendation = ranked.length ? '<article class="card"><div class="eyebrow muted">Prioritas sementara</div><h2 style="margin-top:8px">' + escapeHtml(ranked[0].domain.name) + ' · ' + ranked[0].score + '%</h2><p class="small">' + escapeHtml(ranked[0].domain.action) + '</p><p class="muted small"><strong>Bagian buku:</strong> ' + escapeHtml(ranked[0].domain.book) + '</p></article>' : '';
    return '<section class="page"><h1 class="page-title">Diagnosis 10 Medan</h1><p class="page-subtitle">Jawab sesuai kondisi usaha saat ini. Skor hanya muncul jika semua pertanyaan dalam satu medan sudah terisi.</p>' +
      '<article class="card">' + progressBar(progress, progress.answered + " dari " + progress.total + " pertanyaan") + '</article>' + recommendation +
      results.map(function (result) {
        const domain = result.domain;
        return '<article class="card"><div class="domain-row" style="padding-top:0"><div><span class="domain-name">' + domain.icon + ' ' + escapeHtml(domain.name) + '</span><span class="domain-note">' + result.answered + '/' + domain.questions.length + ' terjawab</span></div>' +
          '<span class="badge ' + result.tone + '">' + (result.complete ? result.score + '% · ' : '') + escapeHtml(result.label) + '</span></div>' +
          domain.questions.map(function (question, questionIndex) {
            const key = domain.id + "-" + questionIndex;
            return '<div class="question"><p>' + escapeHtml(question) + '</p><div class="answer-options">' +
              [[0, "Belum"], [1, "Sebagian"], [2, "Sudah"]].map(function (option) {
                const selected = OWN.call(state.answers, key) && Number(state.answers[key]) === option[0];
                return '<button class="answer' + (selected ? ' active' : '') + '" data-answer="' + key + '" data-value="' + option[0] + '" type="button" aria-pressed="' + selected + '">' + option[1] + '</button>';
              }).join("") + '</div></div>';
          }).join("") + (result.complete ? '<p class="notice safe small"><strong>Langkah awal:</strong> ' + escapeHtml(domain.action) + '</p>' : '') + '</article>';
      }).join("") + '</section>';
  }

  function renderActions() {
    const progress = actionProgress();
    const weeks = [
      { title: "Minggu 1 · Diagnosis & Prioritas", start: 1, end: 7 },
      { title: "Minggu 2 · Pemasaran & Penjualan", start: 8, end: 14 },
      { title: "Minggu 3 · Operasional & Keuangan", start: 15, end: 21 },
      { title: "Minggu 4 · KPI & Tindak Lanjut", start: 22, end: 30 }
    ];
    return '<section class="page"><h1 class="page-title">Aksi 30 Hari</h1><p class="page-subtitle">Satu tindakan kecil setiap hari. Cukup jalankan yang relevan dan diskusikan kendala bersama pendamping.</p>' +
      '<article class="card">' + progressBar(progress, progress.completed + " dari " + progress.total + " misi selesai") + '</article>' +
      weeks.map(function (week) {
        const items = TASKS.filter(function (task) { return task.day >= week.start && task.day <= week.end; });
        const completed = items.filter(function (task) { return state.tasks[task.id] === true; }).length;
        return '<div class="week-heading"><h3>' + escapeHtml(week.title) + '</h3><span class="badge neutral">' + completed + '/' + items.length + '</span></div><article class="card">' +
          items.map(function (task) {
            const done = state.tasks[task.id] === true;
            return '<label class="task-row' + (done ? ' done' : '') + '"><input type="checkbox" data-task="' + task.id + '"' + (done ? ' checked' : '') + '><span class="task-copy"><strong>' + task.day + '. ' + escapeHtml(task.title) + '</strong><span>' + escapeHtml(task.detail) + '</span></span></label>';
          }).join("") + '</article>';
      }).join("") + '</section>';
  }

  function renderTools() {
    if (activeTool) return renderSelectedTool();
    const leaksDone = LEAKS.filter(function (_, index) { return state.leaks[index] === true; }).length;
    return '<section class="page"><h1 class="page-title">Toolkit Panglima</h1><p class="page-subtitle">Semua perhitungan disimpan di perangkat. Tidak ada data yang dikirim ke portal affiliate.</p>' +
      '<button class="tool-card" data-tool="margin"><strong>🧮 Kalkulator Margin</strong><span>Hitung keuntungan per produk setelah biaya utama dan biaya tambahan.</span></button>' +
      '<button class="tool-card" data-tool="price"><strong>🏷️ Harga Minimum Sehat</strong><span>Tentukan harga jual minimum berdasarkan margin target.</span></button>' +
      '<button class="tool-card" data-tool="cashflow"><strong>💸 Cash Flow 7 Hari</strong><span>Catat arus kas masuk, keluar, dan saldo selama satu minggu.</span></button>' +
      '<button class="tool-card" data-tool="leaks"><strong>🔎 Checklist 17 Kebocoran Margin</strong><span>' + leaksDone + ' dari 17 titik sudah diaudit.</span></button>' +
      '<button class="tool-card" data-tool="kpi"><strong>📊 KPI Mingguan</strong><span>Pantau prospek, transaksi, omzet, biaya, dan konversi.</span></button>' +
      '<button class="tool-card" data-tool="plan"><strong>🗺️ Action Plan 30 / 60 / 90 Hari</strong><span>Susun langkah lanjutan dan pertanyaan untuk hot seat.</span></button></section>';
  }

  function toolHeader(title, subtitle) {
    return '<section class="page"><button class="button compact secondary" data-tool="back" type="button">← Kembali</button><h1 class="page-title" style="margin-top:16px">' + escapeHtml(title) + '</h1><p class="page-subtitle">' + escapeHtml(subtitle) + '</p>';
  }

  function moneyField(name, label, value) {
    return '<div class="field"><label for="' + name + '">' + escapeHtml(label) + '</label><input id="' + name + '" name="' + name + '" type="number" inputmode="numeric" min="0" step="1" value="' + escapeHtml(value || '') + '" placeholder="0"></div>';
  }

  function renderSelectedTool() {
    if (activeTool === "margin") {
      return toolHeader("Kalkulator Margin", "Masukkan harga jual dan seluruh biaya per produk.") + '<article class="card"><form id="margin-form">' + moneyField("selling", "Harga jual", "") + moneyField("productCost", "HPP / biaya produk", "") + moneyField("operatingCost", "Biaya tambahan", "") + '<button class="button block" type="submit">Hitung Margin</button></form>' +
        (toolResult && toolResult.kind === "margin" ? '<div class="result-box"><span class="small">Keuntungan per produk</span><span class="value">' + signedRupiah(toolResult.value.profit) + '</span><span class="small">Margin: <strong>' + toolResult.value.margin.toFixed(1) + '%</strong> · Total biaya: ' + rupiah(toolResult.value.cost) + '</span></div>' : '') + '</article></section>';
    }

    if (activeTool === "price") {
      return toolHeader("Harga Minimum Sehat", "Rumus: total biaya dibagi satu dikurangi margin target.") + '<article class="card"><form id="price-form">' + moneyField("productCost", "HPP / biaya produk", "") + moneyField("operatingCost", "Biaya tambahan", "") + '<div class="field"><label for="targetMargin">Target margin (%)</label><input id="targetMargin" name="targetMargin" type="number" inputmode="decimal" min="0" max="99.9" step="0.1" placeholder="Contoh: 30"></div><p id="price-error" class="inline-message"></p><button class="button block" type="submit">Hitung Harga Minimum</button></form>' +
        (toolResult && toolResult.kind === "price" ? '<div class="result-box"><span class="small">Harga minimum sehat</span><span class="value">' + rupiah(toolResult.value.minimumPrice) + '</span><span class="small">Total biaya: ' + rupiah(toolResult.value.cost) + ' · Target margin: ' + toolResult.value.targetMargin + '%</span></div>' : '') + '</article></section>';
    }

    if (activeTool === "cashflow") {
      const totals = summarizeCashflow(state.cashflow);
      return toolHeader("Cash Flow 7 Hari", "Isi setiap hari. Data otomatis tersimpan setelah kolom selesai diubah.") + '<article class="card"><div class="stat-grid"><div class="stat"><span class="label">Total masuk</span><span class="value" style="font-size:17px">' + rupiah(totals.income) + '</span></div><div class="stat"><span class="label">Total keluar</span><span class="value" style="font-size:17px">' + rupiah(totals.expense) + '</span></div></div><div class="result-box"><span class="small">Saldo tujuh hari</span><span class="value">' + signedRupiah(totals.balance) + '</span></div></article><article class="card">' +
        state.cashflow.map(function (entry, index) {
          return '<div class="cash-day"><h4>Hari ' + (index + 1) + '</h4><div class="calculator-grid"><div class="field"><label>Pemasukan</label><input type="number" min="0" inputmode="numeric" data-cash-day="' + index + '" data-cash-kind="income" value="' + numeric(entry.income) + '"></div><div class="field"><label>Pengeluaran</label><input type="number" min="0" inputmode="numeric" data-cash-day="' + index + '" data-cash-kind="expense" value="' + numeric(entry.expense) + '"></div></div></div>';
        }).join("") + '</article></section>';
    }

    if (activeTool === "leaks") {
      const count = LEAKS.filter(function (_, index) { return state.leaks[index] === true; }).length;
      return toolHeader("17 Kebocoran Margin", "Centang jika titik tersebut sudah diperiksa, bukan jika masalah dianggap pasti selesai.") + '<article class="card">' + progressBar({ percent: Math.round(count / LEAKS.length * 100) }, count + " dari 17 titik sudah diaudit") + '</article><article class="card">' +
        LEAKS.map(function (item, index) { return '<label class="check-row"><input type="checkbox" data-leak="' + index + '"' + (state.leaks[index] === true ? ' checked' : '') + '><span class="task-copy"><strong>' + (index + 1) + '. ' + escapeHtml(item) + '</strong></span></label>'; }).join("") + '</article></section>';
    }

    if (activeTool === "kpi") {
      const leads = numeric(state.kpi.leads);
      const transactions = numeric(state.kpi.transactions);
      const conversion = leads ? transactions / leads * 100 : 0;
      const profit = numeric(state.kpi.revenue) - numeric(state.kpi.expense);
      return toolHeader("KPI Mingguan", "Pantau indikator sederhana. Angka ini adalah catatan operasional, bukan laporan akuntansi.") + '<article class="card"><form id="kpi-form">' + moneyField("leads", "Jumlah calon pembeli", state.kpi.leads) + moneyField("transactions", "Jumlah transaksi", state.kpi.transactions) + moneyField("revenue", "Omzet mingguan", state.kpi.revenue) + moneyField("expense", "Biaya mingguan", state.kpi.expense) + '<button class="button block" type="submit">Simpan KPI</button></form><div class="result-box"><span class="small">Konversi prospek</span><span class="value">' + conversion.toFixed(1) + '%</span><span class="small">Selisih omzet dan biaya: ' + signedRupiah(profit) + '</span></div></article></section>';
    }

    if (activeTool === "plan") {
      return toolHeader("Action Plan", "Tentukan satu prioritas yang realistis sebelum menambah rencana baru.") + '<article class="card"><form id="plan-form">' +
        [['thirty', 'Prioritas 30 hari'], ['sixty', 'Arah 60 hari'], ['ninety', 'Arah 90 hari'], ['hotseat', 'Pertanyaan hot seat']].map(function (entry) {
          return '<div class="field"><label for="' + entry[0] + '">' + escapeHtml(entry[1]) + '</label><textarea id="' + entry[0] + '" name="' + entry[0] + '" maxlength="1500" placeholder="Tulis langkah yang ingin dilakukan">' + escapeHtml(state.actionPlan[entry[0]]) + '</textarea></div>';
        }).join("") + '<button class="button block" type="submit">Simpan Rencana</button></form></article></section>';
    }

    activeTool = "";
    return renderTools();
  }

  function renderMentoring() {
    const configuredWhatsapp = /^\d{8,16}$/.test(String(CONFIG.whatsappNumber || ""));
    return '<section class="page"><h1 class="page-title">Pendampingan</h1><p class="page-subtitle">Jadwal, tautan sesi, dan WhatsApp resmi dapat diisi setelah dikonfirmasi. Tidak ada perubahan pada sistem affiliate.</p>' +
      '<article class="card"><h2>Jadwal sesi Zoom</h2>' + CONFIG.mentoringSessions.map(function (session, index) {
        const ready = /^https:\/\//i.test(session.url || "");
        return '<div class="session-card"><strong>' + escapeHtml(session.title) + '</strong><p>' + escapeHtml(session.schedule) + '</p><button class="button compact' + (ready ? '' : ' secondary') + '" type="button" data-session="' + index + '"' + (ready ? '' : ' disabled') + '>' + (ready ? 'Buka Zoom' : 'Tautan belum tersedia') + '</button></div>';
      }).join("") + '</article><article class="card"><h2>Konsultasi WhatsApp</h2><p class="small muted">Gunakan kanal pendampingan yang sudah berjalan tanpa membuat chat internal baru.</p><button class="button block' + (configuredWhatsapp ? '' : ' secondary') + '" data-action="whatsapp" type="button"' + (configuredWhatsapp ? '' : ' disabled') + '>' + (configuredWhatsapp ? 'Hubungi Pendamping' : 'Nomor resmi belum diisi') + '</button></article>' +
      '<article class="card"><h2>Pertanyaan hot seat</h2><p class="small muted">' + escapeHtml(state.actionPlan.hotseat || "Belum ada pertanyaan. Simpan terlebih dahulu melalui Toolkit → Action Plan.") + '</p><button class="button compact gold" data-action="open-plan" type="button">Buka Action Plan</button></article></section>';
  }

  function renderAccount() {
    const progress = actionProgress();
    const diagnosis = diagnosisProgress();
    const eligible = diagnosis.complete && progress.percent >= 80;
    return '<section class="page"><h1 class="page-title">Akun Pembeli</h1><p class="page-subtitle">Profil dan progres aplikasi tersimpan lokal di perangkat ini.</p>' +
      '<article class="card"><div class="eyebrow muted">Profil usaha</div><h2 style="margin-top:8px">' + escapeHtml(state.profile.business) + '</h2><p class="small muted">' + escapeHtml(state.profile.owner) + ' · ' + escapeHtml(state.profile.type || "Jenis usaha belum diisi") + '</p><span class="badge green">Aktif · Mode demo SAFE</span></article>' +
      '<article class="card"><h2>Laporan perkembangan</h2><p class="small muted">Diagnosis ' + diagnosis.answered + '/' + diagnosis.total + ' · Aksi selesai ' + progress.completed + '/' + progress.total + '</p><button class="button block" data-action="share-report" type="button">Bagikan Laporan</button></article>' +
      '<article class="card"><h2>Status sertifikat</h2><p class="small muted">' + (eligible ? 'Syarat internal terpenuhi: diagnosis lengkap dan minimal 80% misi selesai. Penerbitan sertifikat tetap diverifikasi oleh pendamping.' : 'Lengkapi diagnosis dan minimal 80% misi. Sertifikat resmi tetap diterbitkan oleh pendamping.') + '</p><span class="badge ' + (eligible ? 'green' : 'yellow') + '">' + (eligible ? 'Siap diverifikasi' : 'Belum memenuhi syarat') + '</span></article>' +
      '<article class="card"><h2>Pendampingan</h2><p class="small muted">Buka jadwal Zoom, hot seat, dan WhatsApp resmi.</p><button class="button secondary block" data-view="mentoring" type="button">Lihat Pendampingan</button></article>' +
      '<article class="card"><h2>Tentang aplikasi</h2><p class="small muted">Versi 1.0.0 SAFE · Mandiri · Tanpa izin internet · Tidak terhubung ke affiliate, approval, referral, atau komisi.</p><button class="button secondary block" data-action="website" type="button">Buka Website Resmi</button></article>' +
      '<article class="card"><h2>Reset data lokal</h2><p class="small muted">Menghapus profil dan progres pada perangkat ini saja. Sistem lain tidak terpengaruh.</p><button class="button secondary block" data-action="reset" type="button">Reset Aplikasi</button></article></section>';
  }

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    if (!state.activated) {
      app.innerHTML = renderActivation();
      return;
    }

    const pages = { home: renderHome, diagnosis: renderDiagnosis, actions: renderActions, tools: renderTools, mentoring: renderMentoring, account: renderAccount };
    const page = OWN.call(pages, currentView) ? pages[currentView]() : renderHome();
    app.innerHTML = '<div class="shell">' + page + renderNav() + '</div>';
  }

  function navigate(view) {
    currentView = view;
    if (view !== "tools") {
      activeTool = "";
      toolResult = null;
    }
    render();
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
  }

  function formValue(form, name) {
    const field = form.elements.namedItem(name);
    return field ? String(field.value || "").trim() : "";
  }

  function handleSubmit(event) {
    const form = event.target;
    if (!form || !form.id) return;
    event.preventDefault();

    if (form.id === "activation-form") {
      const owner = formValue(form, "owner");
      const business = formValue(form, "business");
      const code = formValue(form, "activationCode");
      if (!owner || !business) {
        document.getElementById("activation-error").textContent = "Nama pemilik dan usaha wajib diisi.";
        return;
      }
      if (CONFIG.activationMode !== "demo-local" || code.toUpperCase() !== String(CONFIG.demoActivationCode).toUpperCase()) {
        document.getElementById("activation-error").textContent = "Kode demo belum sesuai. Gunakan kode yang tertera pada petunjuk SAFE.";
        return;
      }
      state.profile = { owner: owner, business: business, type: formValue(form, "type"), goal: "" };
      state.activated = true;
      persist();
      navigate("home");
      toast("Selamat datang di pendampingan Panglima UMKM.");
      return;
    }

    if (form.id === "margin-form") {
      toolResult = { kind: "margin", value: calculateMargin(formValue(form, "selling"), formValue(form, "productCost"), formValue(form, "operatingCost")) };
      render();
      return;
    }

    if (form.id === "price-form") {
      const result = calculateMinimumPrice(formValue(form, "productCost"), formValue(form, "operatingCost"), formValue(form, "targetMargin"));
      if (!result) {
        document.getElementById("price-error").textContent = "Target margin harus di bawah 100%.";
        return;
      }
      toolResult = { kind: "price", value: result };
      render();
      return;
    }

    if (form.id === "kpi-form") {
      ["leads", "transactions", "revenue", "expense"].forEach(function (key) { state.kpi[key] = numeric(formValue(form, key)); });
      persist();
      render();
      toast("KPI mingguan tersimpan.");
      return;
    }

    if (form.id === "plan-form") {
      ["thirty", "sixty", "ninety", "hotseat"].forEach(function (key) { state.actionPlan[key] = formValue(form, key).slice(0, 1500); });
      persist();
      render();
      toast("Action plan tersimpan.");
    }
  }

  function handleClick(event) {
    const target = event.target.closest("[data-view], [data-tool], [data-answer], [data-action], [data-session]");
    if (!target) return;

    if (target.dataset.view) {
      navigate(target.dataset.view);
      return;
    }

    if (OWN.call(target.dataset, "tool")) {
      activeTool = target.dataset.tool === "back" ? "" : target.dataset.tool;
      currentView = "tools";
      toolResult = null;
      render();
      if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
      return;
    }

    if (target.dataset.answer) {
      state.answers[target.dataset.answer] = Number(target.dataset.value);
      persist();
      render();
      return;
    }

    if (OWN.call(target.dataset, "session")) {
      const session = CONFIG.mentoringSessions[Number(target.dataset.session)];
      if (session) openUrl(session.url);
      return;
    }

    if (target.dataset.action === "share-report") {
      shareText(reportText());
      return;
    }

    if (target.dataset.action === "website") {
      openUrl(CONFIG.websiteUrl);
      return;
    }

    if (target.dataset.action === "whatsapp") {
      const number = String(CONFIG.whatsappNumber || "");
      if (!/^\d{8,16}$/.test(number)) return;
      const text = "Halo, saya " + state.profile.owner + " dari " + state.profile.business + ". Saya ingin menanyakan pendampingan Paket Panglima UMKM.";
      openUrl("https://wa.me/" + number + "?text=" + encodeURIComponent(text));
      return;
    }

    if (target.dataset.action === "open-plan") {
      currentView = "tools";
      activeTool = "plan";
      render();
      return;
    }

    if (target.dataset.action === "reset") {
      if (!window.confirm("Hapus profil dan seluruh progres lokal pada perangkat ini?")) return;
      state = defaultState();
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (error) {}
      currentView = "home";
      activeTool = "";
      render();
      toast("Data lokal telah dihapus.");
    }
  }

  function handleChange(event) {
    const target = event.target;
    if (target.dataset.task) {
      state.tasks[target.dataset.task] = target.checked === true;
      persist();
      render();
      return;
    }

    if (OWN.call(target.dataset, "leak")) {
      state.leaks[target.dataset.leak] = target.checked === true;
      persist();
      render();
      return;
    }

    if (OWN.call(target.dataset, "cashDay")) {
      const day = Number(target.dataset.cashDay);
      const kind = target.dataset.cashKind;
      if (day >= 0 && day < state.cashflow.length && (kind === "income" || kind === "expense")) {
        state.cashflow[day][kind] = numeric(target.value);
        persist();
        render();
      }
    }
  }

  window.panglimaBack = function () {
    if (!state.activated) return false;
    if (activeTool) {
      activeTool = "";
      toolResult = null;
      render();
      return true;
    }
    if (currentView !== "home") {
      navigate("home");
      return true;
    }
    return false;
  };

  window.PANGLIMA_TEST_API = Object.freeze({
    domains: DOMAINS,
    tasks: TASKS,
    leaks: LEAKS,
    classifyScore: classifyScore,
    scoreDomain: scoreDomain,
    rankCompletedDomains: rankCompletedDomains,
    calculateMargin: calculateMargin,
    calculateMinimumPrice: calculateMinimumPrice,
    summarizeCashflow: summarizeCashflow,
    escapeHtml: escapeHtml,
    defaultState: defaultState
  });

  function init() {
    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
    document.addEventListener("submit", handleSubmit);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}());

