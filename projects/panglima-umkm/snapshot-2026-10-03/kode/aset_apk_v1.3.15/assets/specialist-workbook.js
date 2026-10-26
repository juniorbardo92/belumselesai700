(function () {
  "use strict";

  const bridge = window.PanglimaSpecialist;
  const app = document.getElementById("app");
  if (!bridge || !app) return;
  let packet;
  try { packet = JSON.parse(bridge.snapshot()); } catch (_) { packet = null; }
  if (!packet || !packet.workbook || !packet.answers) {
    app.textContent = "Workbook belum tersedia. Kembali dan aktifkan kembali jalur Anda.";
    return;
  }

  const book = packet.workbook;
  const answers = packet.answers;
  document.body.classList.toggle("specialist-dark", packet.darkMode === true);
  const moduleName = String(packet.moduleName || "");
  const participantName = String(packet.participantName || "Peserta");
  const MODULES = ["Pemasaran", "Penjualan", "Operasional", "Keuangan", "Tim", "Digital",
    "Produksi", "Distribusi", "Negosiasi", "Ekspansi"];
  // Kisah yang sudah tampil dalam pendamping baca buku pada aplikasi UMKM.
  const STORIES = [
    "Sun Bin tidak terpancing menghadapi pasukan yang lebih besar. Ia mempelajari watak Pang Juan, menghitung kekuatan sendiri, lalu memilih siasat berdasarkan informasi itu.",
    "Ban Chao melihat perubahan sikap Raja Guang, mencari penyebabnya, lalu bertindak pada waktu yang tepat. Ia tidak mengambil keputusan dari tebakan.",
    "Wu Qi membangun kedekatan dengan pasukannya sekaligus menjaga aturan tetap jelas. Kepedulian tidak membuat standar kerja menjadi longgar.",
    "Sun Bin menjaga logistik dan membiarkan lawan menghabiskan sumber daya dalam pengejaran panjang. Ia bergerak ketika cadangannya lebih siap.",
    "Dalam latihan pasukan istana, Sun Tzu menjelaskan komando dengan sederhana dan menunjukkan keteguhan pada standar yang telah ditetapkan.",
    "Ban Chao tidak menebak penyebab perubahan keadaan. Ia mencari informasi dari sumber yang mengetahui situasi, lalu mengambil keputusan berdasarkan fakta.",
    "Han Xin mengukur logistik, kapasitas pasukan, cadangan, dan medan sebelum mengambil langkah. Tanpa angka, keputusan besar hanya menjadi perjudian.",
    "Zhao She tidak menerobos medan yang belum dikenal. Ia memakai pengetahuan pemandu setempat, memetakan rute, dan menguasai jalur penting lebih dulu.",
    "Sun Tzu dan Wu Yuan memakai diplomasi, posisi strategis, dan tawaran jalan damai sehingga tujuan dapat dicapai tanpa benturan besar yang menguras sumber daya.",
    "Han Xin memetakan medan, menghitung variabel, dan menyiapkan beberapa kemungkinan sebelum menghadapi kekuatan yang lebih besar."
  ];
  const SCALE = ["Belum ada", "Ada, belum konsisten", "Berjalan sebagian", "Berjalan baik",
    "Terukur dan terus diperbaiki"];
  // Pertanyaan empat minggu diturunkan dari Rencana 30–60–90 Hari, kartu kerja,
  // dashboard, dan checklist sumber pada workbook PDF masing-masing jalur.
  const WEEK_ACTIONS = {
    insurance: [
      { title: "Kebutuhan nasabah dan izin kontak", questions: [
        "Kebutuhan dan tujuan nasabah mana yang sudah dikonfirmasi melalui percakapan berizin, dan mana yang masih dugaan?",
        "Tindak lanjut apa yang sudah disetujui nasabah, siapa penghubungnya, dan kapan pembaruan berikutnya?"
      ], checks: [0, 6] },
      { title: "Dokumen dan sumber produk resmi", questions: [
        "Produk atau dokumen perusahaan mana yang perlu diperiksa sumber, versi, manfaat, biaya, syarat, dan pengecualiannya?",
        "Pertanyaan produk mana yang belum terjawab dan harus diklarifikasi kepada pihak berwenang sebelum materi disampaikan?"
      ], checks: [1, 2, 3] },
      { title: "Pengajuan, status polis, dan layanan", questions: [
        "Pengajuan mana yang sudah diterima perusahaan, mana yang telah berstatus polis atau layanan resmi, dan mana yang masih terbuka?",
        "Formulir, pembaruan status, dan data nasabah mana yang perlu diperiksa melalui saluran berwenang serta bukti apa yang disimpan?"
      ], checks: [4, 5, 7] },
      { title: "Keputusan nasabah, biaya agen, dan kas", questions: [
        "Keputusan nasabah apa yang tercatat tanpa tekanan, berikut tindakan, pemilik, tenggat, dan bukti selesainya?",
        "Berapa biaya agen, komisi yang benar-benar diterima, dan kas tersedia; langkah mana dilanjutkan, diperbaiki, diuji ulang, atau ditunda?"
      ], checks: [8, 9] }
    ],
    property: [
      { title: "Dua kelompok kebutuhan dan izin listing", questions: [
        "Apa kebutuhan pemilik dan pencari hunian yang sudah dikonfirmasi secara terpisah, dan apa yang masih perlu ditanyakan?",
        "Listing mana yang sumbernya jelas dan sudah memiliki kewenangan atau izin pemasaran yang dapat diperiksa?"
      ], checks: [0, 1] },
      { title: "Fakta, harga, dan materi listing", questions: [
        "Untuk setiap listing, dari mana sumber harga, status, kondisi, dan tanggal pembaruannya?",
        "Foto atau data apa yang telah diizinkan untuk dipublikasikan, dan pertanyaan apa yang harus diklarifikasi ke pihak berwenang?"
      ], checks: [2, 3, 4] },
      { title: "Kunjungan dan status penawaran", questions: [
        "Kunjungan mana yang jadwal dan batas aksesnya telah disepakati kedua pihak, serta apa hasil kunjungannya?",
        "Penawaran dan perubahannya mana yang sudah dicatat dengan sumber status yang sah tanpa menjanjikan persetujuan?"
      ], checks: [5, 6] },
      { title: "Pembaruan listing, layanan, dan kas", questions: [
        "Materi listing lama mana yang harus diperbarui atau ditarik, dan siapa yang telah menerima pembaruan dengan bukti?",
        "Berapa biaya dan kewajiban usaha, imbalan yang benar-benar diterima, serta kas tersedia untuk keputusan 30 hari berikutnya?"
      ], checks: [7, 8, 9] }
    ],
    mlm: [
      { title: "Kebutuhan produk dan pilihan kemitraan", questions: [
        "Kebutuhan produk apa yang dinyatakan pelanggan dan tindak lanjut mana yang mendapat persetujuan?",
        "Siapa yang menyatakan minat menjadi mitra secara terpisah dari minat membeli produk, dan pilihan apa yang dicatat?"
      ], checks: [0, 1] },
      { title: "Sumber produk, label, dan batas klaim", questions: [
        "Label, harga, syarat, sumber, dan versi informasi produk mana yang telah diperiksa sebelum disampaikan?",
        "Klaim produk atau janji kesehatan maupun pendapatan mana yang harus dihentikan atau diklarifikasi karena belum memiliki dasar resmi?"
      ], checks: [2, 3, 6] },
      { title: "Stok, pesanan, dan bukti penyerahan", questions: [
        "Stok dan bets mana yang benar-benar siap, pesanan mana yang belum terpenuhi, dan apa ketentuan penyerahannya?",
        "Bukti penyerahan, perubahan pesanan, keluhan terbuka, serta izin penggunaan data pelanggan mana yang harus dicatat?"
      ], checks: [4, 7, 8] },
      { title: "Ketentuan bonus, biaya, dan kas", questions: [
        "Biaya, bonus, serta ketentuan kemitraan mana yang telah cocok dengan dokumen resmi yang berlaku?",
        "Berapa penerimaan yang benar-benar masuk, biaya usaha, nilai stok, dan pengambilan pribadi yang harus dipisahkan sebelum mengambil keputusan berikutnya?"
      ], checks: [5, 9] }
    ]
  };
  const NAV = [
    ["home", "⌂", "Beranda"], ["diagnosis", "◉", "Diagnosis"],
    ["actions", "✓", "Aksi"], ["tools", "▦", "Toolkit"], ["account", "♙", "Akun"]
  ];
  const safe = value => String(value == null ? "" : value).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const flat = value => String(value || "").replace(/\s+/g, " ").trim();
  const between = (text, before, after) => {
    const start = text.indexOf(before);
    if (start < 0) return "";
    const from = start + before.length;
    const end = after ? text.indexOf(after, from) : -1;
    return text.slice(from, end < 0 ? undefined : end);
  };
  function statementList(text) {
    return flat(text).split(/\.\s+/).map(part => part.replace(/\.$/, "").trim())
      .filter(Boolean).map(part => part + ".");
  }
  function chapter(index) {
    const start = Number(book.chapterPages[index]);
    const opener = String(book.pages[start] || "");
    const a = String(book.pages[start + 1] || "");
    const b = String(book.pages[start + 2] || "");
    const field = book.sheets[index].fields;
    const rawQuestions = between(opener, "Pernyataan Skor 1-5 Bukti / status", "Skor modul:");
    const titleA = a.match(new RegExp((index + 1) + "A\\.\\s*([\\s\\S]*?)\\nKomponen"));
    const titleB = b.match(new RegExp((index + 1) + "B\\.\\s*([\\s\\S]*?)\\nKomponen"));
    const namedArea = opener.match(/\n\d{2}\s+([^\n]+)\nTujuan:/);
    const intro = between(opener, "Prinsip Sun Tzu\n", "\nKacamata strategi");
    const output = between(opener, "Output yang harus dihasilkan\n", "\nBatas pemeriksaan");
    const limits = between(opener, "Batas pemeriksaan\n", "\nCEK POSISI");
    const openCheck = a.includes("Sumber resmi / pihak") ?
      "Sumber resmi / pihak berwenang" : "Sumber / izin / pihak berwenang";
    return {
      name: namedArea ? flat(namedArea[1]) : MODULES[index],
      goal: flat(book.chapterGoals[index]),
      principle: flat(intro) || flat(book.chapterHooks[index]),
      meaning: flat(book.chapterHooks[index]),
      output: flat(output),
      limits: flat(limits),
      questions: statementList(rawQuestions).slice(0, 4),
      titleA: titleA ? flat(titleA[1]) : "Latihan praktik A–D",
      titleB: titleB ? flat(titleB[1]) : "Latihan praktik E–H",
      first: [["A", field.A], ["B", field.B], ["C", field.C], ["D", field.D],
        ["open", "Pemeriksaan yang masih terbuka"], ["source", openCheck]],
      second: [["E", field.E], ["F", field.F], ["G", field.G], ["H", field.H],
        ["decision", "Satu keputusan utama"], ["measure", "Ukuran hasil / bukti selesai"]],
      instructionA: flat(between(a, "LATIHAN PRAKTIK A-D\n", "\nUMKM Naik Kelas")),
      instructionB: flat(between(b, "LATIHAN PRAKTIK E-H\n", "\nUMKM Naik Kelas")),
      exercise: book.exercises[index * 10]
    };
  }
  function sourceChecklist() {
    const page = String(book.pages[158] || "");
    const lines = page.split("\n");
    const header = lines.findIndex(line => /Strategi\s*•\s*Eksekusi\s*•\s*Evaluasi\s+159/.test(line));
    return (header < 0 ? [] : lines.slice(header + 1))
      .map(line => line.trim()).filter(line => line.endsWith(".")).slice(0, 10);
  }
  const chapters = Array.from({ length: 10 }, (_, i) => chapter(i));
  const pathChecklist = sourceChecklist();
  const savedChapter = Number(answers["topic:active"]);
  let selectedChapter = Number.isInteger(savedChapter) && savedChapter >= 0 && savedChapter < 10 ?
    savedChapter : 0;
  let section = packet.initialSection === "actions" ? "actions" : "home";
  let view = "overview";

  function save(key, value) {
    const text = String(value == null ? "" : value).slice(0, 1500);
    answers[key] = text;
    bridge.save(key, text);
  }
  function get(key) { return String(answers[key] == null ? "" : answers[key]); }
  function valueField(key, label, compact, hint) {
    const tag = compact ? "input" : "textarea";
    const attrs = compact ?
      ' type="text" maxlength="500" value="' + safe(get(key)) + '"' :
      ' maxlength="1500" rows="3"';
    return '<div class="field"><label for="' + safe(key) + '">' + safe(label) + '</label><' +
      tag + ' id="' + safe(key) + '" data-field="' + safe(key) + '"' + attrs +
      ' placeholder="' + safe(hint || "Isi berdasarkan pekerjaan dan bukti nyata") + '">' +
      (compact ? "" : safe(get(key))) + '</' + tag + '></div>';
  }
  function checkBox(key, label) {
    return '<label class="checked-label"><input type="checkbox" data-check="' + safe(key) +
      '"' + (get(key) === "true" ? " checked" : "") + '><span>' + safe(label) + '</span></label>';
  }
  function scoreCount(index) {
    return chapters[index].questions.reduce((n, _, q) =>
      n + (/^[1-5]$/.test(get("topic:" + index + ":score:" + q)) ? 1 : 0), 0);
  }
  function fieldsCount() {
    return Object.keys(answers).filter(key => /^(topic:|action30:)/.test(key) &&
      !/:score:\d+$/.test(key) && String(answers[key]).trim()).length;
  }
  function chapterReady(index) {
    return scoreCount(index) === 4 &&
      !!get("chapter-" + (index + 1) + "-decision").trim() &&
      !!get("chapter-" + (index + 1) + "-kpi").trim();
  }
  function nav() {
    return '<nav class="bottom-nav" aria-label="Navigasi utama">' + NAV.map(([id, icon, label]) =>
      '<button class="nav-button' + (section === id ? " active" : "") +
      '" type="button" data-nav="' + id + '"><span class="icon">' + icon +
      '</span><span class="label">' + label + '</span></button>').join("") + "</nav>";
  }
  function progress() {
    const answered = chapters.reduce((n, _, i) => n + scoreCount(i), 0);
    const completed = chapters.reduce((n, _, i) => n + (scoreCount(i) === 4 ? 1 : 0), 0);
    return { answered, completed };
  }
  function progressBar(current, total, caption) {
    return '<div class="progress-meta"><span>' + safe(caption) + '</span><strong>' +
      Math.round(current / total * 100) + '%</strong></div><div class="progress-track" ' +
      'role="progressbar" aria-valuenow="' + current + '" aria-valuemin="0" aria-valuemax="' + total +
      '"><div class="progress-fill" style="width:' + Math.round(current / total * 100) + '%"></div></div>';
  }
  function toolsList() {
    return '<div class="section-heading"><h2>10 modul workbook resmi</h2></div>' +
      chapters.map((chapter, index) =>
        '<button class="tool-card" type="button" data-chapter="' + index + '"><strong>' +
        (index + 1) + '. ' + safe(chapter.name) + '</strong><span>' +
        safe(chapter.goal) + ' · ' + scoreCount(index) + '/4 penilaian terisi</span></button>').join("");
  }
  function overview() {
    const p = progress();
    return '<section class="page"><div class="eyebrow muted">Halo, ' + safe(participantName) + ' 👋</div>' +
      '<h1 class="page-title">Workbook ' + safe(moduleName) +
      '</h1><p class="page-subtitle">Versi interaktif workbook resmi: 10 area kerja, prinsip Sun Tzu, latihan praktik, dan eksekusi terukur.</p>' +
      '<article class="card"><span class="badge green">Tersimpan offline di perangkat</span>' +
      progressBar(p.answered, 40, p.answered + " dari 40 penilaian modul") +
      '<div class="stat-grid" style="margin-top:15px"><div class="stat"><span class="label">Modul lengkap</span><span class="value">' +
      p.completed + '/10</span></div><div class="stat"><span class="label">Isian tersimpan</span><span class="value">' +
      fieldsCount() + '</span></div></div>' +
      valueField("topic:goal", "Hasil utama yang ingin dicapai") + '</article>' +
      '<article class="card"><h2>Skala penilaian workbook</h2>' + SCALE.map((s, i) =>
        '<div class="domain-row"><span class="domain-name">' + (i + 1) + '. ' + safe(s) + '</span></div>').join("") +
      '<p class="muted small">Gunakan bukti pekerjaan sendiri. Diagnosis jalur tetap dinilai sesuai keterangan pada workbook PDF.</p></article>' +
      '<article class="card"><h2>Diagnosis dulu, strategi kemudian.</h2><p class="small muted">Lengkapi minimal satu area agar modul yang paling relevan terlihat.</p>' +
      '<button class="button compact secondary" type="button" data-nav="diagnosis">Buka Diagnosis 10 Area</button></article>' +
      toolsList() + '</section>';
  }
  function readCard(index, chapter) {
    const reading = chapter.exercise.checklist || [];
    return '<article class="card"><div class="chapter-eyebrow">Insight awal · kisah strategi Sun Tzu</div>' +
      '<h2 style="margin-top:9px">' + safe(chapter.exercise.title) + '</h2><p>' +
      safe(STORIES[index]) + '</p><p class="small muted">Terapkan kisah strategi ini melalui workbook jalur Anda.</p>' +
      '<h3>Makna untuk ' + safe(moduleName) + '</h3><p>' + safe(chapter.meaning) + '</p>' +
      '<p class="notice"><strong>Batas pemeriksaan:</strong> ' + safe(chapter.limits) + '</p>' +
      '<h3 style="margin-top:18px">Checklist pendamping baca</h3>' +
      reading.map((item, i) => checkBox("topic:" + index + ":read:" + i, item)).join("") +
      '<h3 style="margin-top:18px">Catatan refleksi setelah membaca</h3><p class="small muted">' +
      safe(chapter.exercise.reflection) + '</p>' +
      valueField("topic:" + index + ":reflection", "Refleksi dari pekerjaan jalur ini") +
      '<button class="button compact gold chapter-shortcut" type="button" data-book-chapter="' +
      index + '">Buka buku utama · Bab ' + (index + 1) + ', hlm. ' +
      safe(chapter.exercise.bookPages) + '</button></article>';
  }
  function exerciseCard(index, chapter, half) {
    const first = half === "A";
    const prompts = first ? chapter.first : chapter.second;
    const title = first ? chapter.titleA : chapter.titleB;
    const instruction = first ? chapter.instructionA : chapter.instructionB;
    return '<article class="card"><h2>' + (index + 1) + half + '. ' + safe(title) +
      '</h2><p class="small muted">' + safe(instruction) + '</p>' +
      prompts.map(([id, label], n) => {
        const mainKey = /^[A-H]$/.test(id) ? (index + 1) + '-' + id : 'topic:' + index + ':' + id;
        const evidenceKey = 'topic:' + index + ':' + id + ':evidence';
        return '<details class="chapter-field"><summary>' + (n + 1) + '. ' + safe(label) +
          '</summary>' + valueField(mainKey, 'Temuan, tindakan, atau keputusan') +
          valueField(evidenceKey, first ? 'Sumber / bukti / status' :
            'Pemilik / tenggat / bukti') + '</details>';
      }).join("") + '</article>';
  }
  function modulePage(index) {
    const chapter = chapters[index];
    const answered = scoreCount(index);
    const total = chapter.questions.reduce((n, _, i) =>
      n + (Number(get('topic:' + index + ':score:' + i)) || 0), 0);
    return '<section class="page"><button class="button compact secondary back-link" type="button" data-back>← Kembali ke Workbook</button>' +
      '<h1 class="page-title">Modul ' + (index + 1) + ' · ' + safe(chapter.name) +
      '</h1><p class="page-subtitle">' + safe(chapter.goal) + '</p>' +
      '<article class="card"><div class="chapter-eyebrow">Prinsip Sun Tzu</div><h2 class="chapter-principle">' +
      safe(chapter.principle) + '</h2><p><strong>Output modul:</strong> ' + safe(chapter.output) +
      '</p><span class="badge ' + (answered === 4 ? "green" : "neutral") +
      '">Penilaian ' + answered + '/4</span></article>' + readCard(index, chapter) +
      '<article class="card"><h2>Cek posisi saat ini</h2><p class="muted small">Pilih skor 1–5 dan tambahkan bukti dari pekerjaan ' +
      safe(moduleName) + ' yang sebenarnya.</p>' +
      chapter.questions.map((question, q) => {
        const key = 'topic:' + index + ':score:' + q;
        return '<div class="question"><p>' + safe(question) + '</p><div class="answer-options">' +
          SCALE.map((label, n) =>
            '<button class="answer' + (get(key) === String(n + 1) ? " active" : "") +
            '" type="button" data-score="' + key + '" data-value="' + (n + 1) +
            '" aria-pressed="' + (get(key) === String(n + 1)) + '" aria-label="' +
            safe(question + " · " + label) + '">' + (n + 1) + '</button>').join("") +
          '</div>' + valueField('topic:' + index + ':score-note:' + q, 'Bukti / catatan', true) + '</div>';
      }).join("") + '<div class="result-box"><span class="small">Skor modul workbook</span>' +
      '<span class="value">' + (answered === 4 ? total + '/20' : answered + '/4 terjawab') +
      '</span><span class="small">1 = belum ada · 5 = terukur dan terus diperbaiki</span></div></article>' +
      exerciseCard(index, chapter, "A") + exerciseCard(index, chapter, "B") +
      '<article class="card"><h2>Keputusan dan eksperimen 7 hari</h2><p class="small muted">Setiap modul menghasilkan satu keputusan, tindakan, dan bukti yang bisa diperiksa.</p>' +
      valueField('chapter-' + (index + 1) + '-decision', 'Satu keputusan utama') +
      valueField('chapter-' + (index + 1) + '-action', 'Aksi pertama dalam 7 hari') +
      valueField('chapter-' + (index + 1) + '-owner', 'PIC / penanggung jawab', true, participantName) +
      valueField('chapter-' + (index + 1) + '-kpi', 'KPI / bukti selesai', true) +
      valueField('chapter-' + (index + 1) + '-risk', 'Risiko dan mitigasi') +
      '<p class="small muted">Sepuluh strategi terperinci tetap tersedia untuk latihan bertahap dan XP.</p>' +
      '<button class="button compact secondary block" type="button" data-strategy="' +
      index + '">Buka strategi bab ini</button><button class="button block chapter-shortcut" type="button" ' +
      'data-consult="' + index + '"' + (chapterReady(index) ? "" : " disabled") +
      '>Konsultasikan Modul Ini</button><p class="status-line" id="consult-status">' +
      (chapterReady(index) ? "Keputusan dan bukti modul siap dikonsultasikan." :
        "Isi 4 skor, keputusan, dan bukti selesai untuk membuka konsultasi modul.") +
      '</p></article></section>';
  }
  function diagnosis() {
    return '<section class="page"><h1 class="page-title">Diagnosis 10 Area</h1>' +
      '<p class="page-subtitle">Nilai posisi awal dari bukti pekerjaan jalur Anda. Isi skor 1–5 dan bukti, lalu pilih modul prioritas.</p>' +
      chapters.map((chapter, i) => '<article class="card"><h2>' + (i + 1) + '. ' +
        safe(chapter.name) + '</h2><p class="small muted">' + safe(chapter.output) + '</p>' +
        '<div class="answer-options">' + SCALE.map((label, n) =>
          '<button class="answer' + (get('topic:audit:' + i) === String(n + 1) ? " active" : "") +
          '" type="button" data-audit="' + i + '" data-value="' + (n + 1) + '" aria-label="' +
          safe(chapter.name + " · " + label) + '">' + (n + 1) + '</button>').join("") + '</div>' +
        valueField('topic:audit:' + i + ':evidence', 'Bukti utama', true) +
        '<button class="button compact gold" type="button" data-chapter="' + i +
        '">Buka Modul</button></article>').join("") + '</section>';
  }
  function action30() {
    const weeks = WEEK_ACTIONS[book.code];
    if (!weeks) return '<section class="page"><h1>Aksi 30 Hari belum tersedia untuk jalur ini.</h1></section>';
    const sourceAim = flat(between(String(book.pages[160] || ""), "30 HARI\n", "\n60 HARI"));
    return '<section class="page"><h1 class="page-title">Aksi 30 Hari</h1>' +
      '<p class="page-subtitle">Empat minggu kerja ' + safe(moduleName) +
      '. Catat tindakan dan bukti; jawaban tersimpan otomatis di perangkat.</p>' +
      '<article class="card"><h2>Target 30 hari dari workbook</h2><p>' + safe(sourceAim) +
      '</p><p class="small muted">Sumber: Rencana 30–60–90 Hari, Action Plan, dan checklist jalur ' +
      safe(moduleName) + '.</p></article>' +
      weeks.map((plan, week) => {
        const from = [1, 8, 15, 22][week], to = [7, 14, 21, 30][week];
        const previous = 'action30:week:' + (week + 1) + ':';
        return '<article class="card weekly-card"><h2>Minggu ' + (week + 1) + ' · ' +
          safe(plan.title) + '</h2><p class="small muted">Jawab dari pekerjaan nyata dan sumber yang berlaku.</p>' +
          plan.questions.map((question, i) => valueField(
            'action30:v2:week:' + (week + 1) + ':answer:' + i, question)).join("") +
          (get(previous + 'focus') || get(previous + 'proof') ?
            '<details><summary>Catatan tersimpan dari versi sebelumnya</summary>' +
            valueField(previous + 'focus', 'Prioritas lama') +
            valueField(previous + 'proof', 'Bukti lama') + '</details>' : '') +
          '<h3>Checklist ' + safe(moduleName) + '</h3>' +
          plan.checks.map((n, i) => checkBox(
            'action30:v2:week:' + (week + 1) + ':check:' + i, pathChecklist[n])).join("") +
          Array.from({ length: to - from + 1 }, (_, offset) => {
            const day = from + offset, key = 'action30:day:' + day + ':';
            return '<details><summary>Hari ' + day + ' · ' +
              (get(key + 'done') === 'true' ? 'Selesai ✓' : 'Tentukan satu langkah') +
              '</summary>' + valueField(key + 'action', 'Tindakan') +
              valueField(key + 'proof', 'Output / bukti') +
              valueField(key + 'owner', 'Pemilik', true, participantName) +
              valueField(key + 'status', 'Status / catatan', true) +
              checkBox(key + 'done', 'Tindakan dan bukti telah diperiksa') + '</details>';
          }).join("") + '</article>';
      }).join("") + '</section>';
  }
  function tools() {
    return '<section class="page"><h1 class="page-title">Toolkit Workbook</h1><p class="page-subtitle">Pilih satu modul untuk latihan; Aksi 30 Hari mengikuti jalur yang dibeli.</p>' +
      toolsList() + '<button class="tool-card" type="button" data-nav="actions"><strong>✓ Aksi 30 Hari</strong><span>Empat minggu dengan checklist dan bukti ' +
      safe(moduleName) + '.</span></button><button class="tool-card" type="button" data-native="profile">' +
      '<strong>Pengaturan & cadangan</strong><span>Gunakan pengaturan modul yang sudah tersedia.</span></button></section>';
  }
  function account() {
    return '<section class="page"><h1 class="page-title">Akun</h1><article class="card"><span class="badge green">Jalur aktif</span>' +
      '<h2 style="margin-top:12px">Halo, ' + safe(participantName) + ' 👋</h2><p>' +
      safe(moduleName) + '</p><p class="small muted">Jawaban dan refleksi tersimpan otomatis di perangkat.</p>' +
      '<button class="button block secondary" type="button" data-native="profile">Pengaturan, pengingat, ekspor & cadangan</button>' +
      '<button class="button block chapter-shortcut" type="button" data-native="exit">Kembali ke aplikasi</button></article></section>';
  }
  function render(scroll) {
    let content = section === "home" ? (view === "chapter" ? modulePage(selectedChapter) : overview()) :
      section === "diagnosis" ? diagnosis() : section === "actions" ? action30() :
      section === "account" ? account() : tools();
    app.innerHTML = '<div class="shell specialist-shell">' + content + nav() + '</div>';
    if (scroll !== false && window.scrollTo) window.scrollTo(0, 0);
  }
  function navigate(id) {
    section = id;
    view = "overview";
    render();
  }
  function openChapter(index) {
    selectedChapter = index;
    save("topic:active", index);
    section = "home";
    view = "chapter";
    render();
  }
  app.addEventListener("click", event => {
    const target = event.target.closest("[data-nav],[data-chapter],[data-score],[data-audit],[data-back],[data-consult],[data-strategy],[data-book-chapter],[data-native]");
    if (!target) return;
    if (target.dataset.nav) navigate(target.dataset.nav);
    else if (target.dataset.chapter != null) openChapter(Number(target.dataset.chapter));
    else if (target.hasAttribute("data-back")) { view = "overview"; render(); }
    else if (target.dataset.score) { save(target.dataset.score, target.dataset.value); render(false); }
    else if (target.dataset.audit != null) {
      save("topic:audit:" + target.dataset.audit, target.dataset.value);
      render(false);
    } else if (target.dataset.consult != null && !target.disabled &&
      chapterReady(Number(target.dataset.consult))) {
      const chapter = chapters[Number(target.dataset.consult)];
      const question = "Saya peserta " + moduleName + ". Konsultasikan modul " +
        chapter.name + ". Tujuan: " + chapter.goal + " Keputusan saya: " +
        get("chapter-" + (Number(target.dataset.consult) + 1) + "-decision").slice(0, 200) +
        ". Mohon tinjau tindakan, sumber yang perlu diperiksa, dan bukti hasilnya.";
      bridge.consult(Number(target.dataset.consult), question.slice(0, 600));
    } else if (target.dataset.strategy != null) bridge.strategy(Number(target.dataset.strategy));
    else if (target.dataset.bookChapter != null) bridge.book(Number(target.dataset.bookChapter));
    else if (target.dataset.native === "profile") bridge.profile();
    else if (target.dataset.native === "exit") bridge.exit();
  });
  app.addEventListener("input", event => {
    const field = event.target.dataset.field;
    if (!field) return;
    save(field, event.target.value);
    if (view === "chapter") {
      const consult = app.querySelector("[data-consult]");
      const status = app.querySelector("#consult-status");
      if (consult) consult.disabled = !chapterReady(selectedChapter);
      if (status) status.textContent = chapterReady(selectedChapter) ?
        "Keputusan dan bukti modul siap dikonsultasikan." :
        "Isi 4 skor, keputusan, dan bukti selesai untuk membuka konsultasi modul.";
    }
  });
  app.addEventListener("change", event => {
    const key = event.target.dataset.check;
    if (!key) return;
    if (key.endsWith(":done")) {
      const prefix = key.slice(0, -4);
      if (event.target.checked && (!get(prefix + "action").trim() ||
        !get(prefix + "proof").trim())) {
        event.target.checked = false;
        return;
      }
    }
    save(key, event.target.checked ? "true" : "false");
  });
  window.panglimaSpecialistBack = function () {
    if (view === "chapter") { view = "overview"; render(); return true; }
    if (section !== "home") { navigate("home"); return true; }
    return false;
  };
  render();
})();
