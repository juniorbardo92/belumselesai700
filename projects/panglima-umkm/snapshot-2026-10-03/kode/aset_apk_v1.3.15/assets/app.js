(function () {
  "use strict";

  const CONFIG = window.PANGLIMA_CONFIG;
  const STORAGE_KEY = "panglima-umkm-safe-v1";
  const OWN = Object.prototype.hasOwnProperty;
  const PENDING_API_REQUESTS = Object.create(null);

  const DOMAINS = [
    {
      id: "pemasaran", name: "Pemasaran", icon: "\uD83D\uDCE3",
      questions: ["Saya tahu siapa pelanggan utama yang paling cocok dengan produk/jasa saya.", "Pesan pemasaran saya menjelaskan manfaat dan pembeda, bukan hanya harga.", "Saya tahu saluran promosi mana yang paling efektif mendatangkan calon pembeli.", "Saya mengevaluasi pemasaran berdasarkan data, bukan hanya perkiraan."],
      action: "Tentukan satu segmen pelanggan dan satu pesan utama sebelum menambah konten atau iklan.",
      book: "Pemasaran: target pelanggan dan pesan utama"
    },
    {
      id: "penjualan", name: "Penjualan", icon: "\uD83E\uDDFE",
      questions: ["Saya punya proses jelas dari calon pelanggan hingga terjadi pembelian.", "Saya bisa menjelaskan nilai produk tanpa buru-buru memberikan diskon.", "Saya melakukan follow-up pada prospek yang belum membeli.", "Saya mengetahui penawaran mana yang paling mudah closing dan menguntungkan."],
      action: "Buat daftar calon pembeli, jadwalkan follow-up yang sopan, dan catat alasan pembelian.",
      book: "Penjualan: follow-up dan proses closing"
    },
    {
      id: "operasional", name: "Operasional", icon: "\u2699\uFE0F",
      questions: ["Aktivitas harian utama memiliki urutan kerja yang jelas.", "Pekerjaan tidak terlalu bergantung pada saya seorang.", "Kesalahan, keterlambatan, dan pekerjaan ulang relatif terkendali.", "Saya tahu proses mana yang paling sering membuang waktu atau biaya."],
      action: "Tulis tiga SOP paling penting dan pilih satu aktivitas yang bisa didelegasikan minggu ini.",
      book: "Operasional: SOP dan ketergantungan pada owner"
    },
    {
      id: "keuangan", name: "Keuangan", icon: "\uD83D\uDCB0",
      questions: ["Saya memisahkan uang usaha dan uang pribadi.", "Saya tahu margin tiap produk/jasa utama.", "Saya memantau arus kas, bukan hanya omzet.", "Saya tahu biaya mana yang paling berisiko membuat kas bocor."],
      action: "Pisahkan uang usaha, hitung margin produk utama, lalu catat arus kas selama tujuh hari.",
      book: "Keuangan: margin, harga sehat, dan arus kas"
    },
    {
      id: "tim", name: "Tim / SDM", icon: "\uD83E\uDD1D",
      questions: ["Peran dan tanggung jawab orang yang terlibat dalam usaha cukup jelas.", "Tugas penting tidak selalu menunggu instruksi saya.", "Saya punya cara mengevaluasi hasil kerja, bukan hanya kehadiran.", "Orang yang menangani pelanggan memahami standar layanan."],
      action: "Tentukan satu hasil kerja yang terukur untuk setiap orang dan adakan evaluasi singkat mingguan.",
      book: "Tim / SDM: pembagian peran dan evaluasi"
    },
    {
      id: "digital", name: "Digital", icon: "\uD83D\uDCF1",
      questions: ["Informasi usaha saya mudah ditemukan dan terlihat profesional.", "Konten digital saya memiliki tujuan yang jelas.", "Data pelanggan atau prospek tersimpan dan dapat ditindaklanjuti.", "Saya memakai alat digital untuk menghemat waktu atau mengurangi pekerjaan manual."],
      action: "Rapikan profil bisnis, tautan pemesanan, dan pencatatan data pelanggan yang paling penting.",
      book: "Digital: kanal, data pelanggan, dan alat kerja"
    },
    {
      id: "produksi", name: "Produksi", icon: "\uD83C\uDFED",
      questions: ["Kualitas produk/jasa konsisten dari satu pesanan ke pesanan berikutnya.", "Saya tahu kapasitas produksi yang realistis.", "Bahan baku/stok utama direncanakan agar tidak sering kurang atau berlebih.", "Saya mengetahui sumber pemborosan terbesar dalam proses produksi."],
      action: "Hitung biaya produksi aktual dan tentukan standar kualitas serta jumlah produksi yang sehat.",
      book: "Produksi: biaya, kualitas, dan kapasitas"
    },
    {
      id: "distribusi", name: "Distribusi", icon: "\uD83D\uDE9A",
      questions: ["Pelanggan menerima produk/jasa sesuai waktu yang dijanjikan.", "Saya punya pilihan pengiriman/penyaluran yang sesuai kebutuhan pelanggan.", "Biaya distribusi dipantau dan tidak menggerus margin tanpa disadari.", "Keluhan terkait pengiriman atau penyerahan ditangani secara jelas."],
      action: "Petakan stok lambat, biaya distribusi, dan satu perbaikan komunikasi pengiriman.",
      book: "Distribusi: stok, pengiriman, dan biaya"
    },
    {
      id: "negosiasi", name: "Negosiasi", icon: "\uD83D\uDDE3\uFE0F",
      questions: ["Saya mengetahui batas harga, syarat, dan konsesi sebelum bernegosiasi.", "Saya tidak mudah memberi diskon hanya karena pelanggan meminta.", "Saya mencari pertukaran nilai, bukan sekadar menang-kalah.", "Kesepakatan penting dicatat dengan jelas."],
      action: "Tentukan batas harga minimum, syarat pembayaran, dan nilai tambah selain diskon.",
      book: "Negosiasi: batas harga dan nilai tambah"
    },
    {
      id: "ekspansi", name: "Ekspansi", icon: "\uD83E\uDDED",
      questions: ["Saya tahu alasan bisnis mengapa usaha perlu berkembang, bukan sekadar mengikuti tren.", "Operasional dan keuangan saat ini cukup stabil untuk menanggung pertumbuhan.", "Saya menguji pasar sebelum menambah biaya besar, cabang, atau produk baru.", "Saya punya ukuran keberhasilan yang jelas untuk rencana ekspansi."],
      action: "Tunda ekspansi yang belum siap, tentukan satu target 30 hari, dan ukur kapasitas terlebih dahulu.",
      book: "Ekspansi: kapasitas, prioritas, dan target"
    }
  ];

  const BOOK_GUIDES = [
    {
      id: "pemasaran", chapter: 1, title: "Pemasaran", pages: "4-9", strategy: "Kenali Musuh dan Kenali Diri Sendiri",
      story: "Sun Bin tidak terpancing menghadapi pasukan yang lebih besar. Ia mempelajari watak Pang Juan, menghitung kekuatan sendiri, lalu memilih siasat berdasarkan informasi itu.",
      principle: "Pemasaran dimulai dari data tentang pelanggan, pesaing, dan kekuatan usaha sendiri, bukan dari keinginan untuk terlihat ramai.",
      prompts: ["Apa kekuatan usaha saya yang benar-benar dirasakan pelanggan?", "Data apa yang masih perlu saya cari sebelum memilih target dan pesan pemasaran?"],
      checklist: ["Saya menulis kekuatan dan kelemahan usaha dengan jujur.", "Saya membandingkan tiga pesaing berdasarkan data yang terlihat.", "Saya memilih satu pembeda yang relevan bagi pelanggan utama."]
    },
    {
      id: "penjualan", chapter: 2, title: "Penjualan", pages: "61-66", strategy: "Dekati saat Lawan Lengah",
      story: "Ban Chao melihat perubahan sikap Raja Guang, mencari penyebabnya, lalu bertindak pada waktu yang tepat. Ia tidak mengambil keputusan dari tebakan.",
      principle: "Penjualan yang sehat membaca sinyal kesiapan pelanggan dan menindaklanjuti dengan konteks, bukan memaksa semua orang pada waktu yang sama.",
      prompts: ["Pada tahap mana calon pembeli paling sering berhenti?", "Sinyal apa yang menunjukkan seorang prospek siap menerima tindak lanjut?"],
      checklist: ["Saya memetakan tahapan prospek sampai pembelian.", "Saya mencatat alasan prospek belum membeli.", "Saya menyiapkan follow-up yang membantu dan tidak mendesak."]
    },
    {
      id: "operasional", chapter: 3, title: "Operasional", pages: "118-123", strategy: "Disiplin adalah Kekuatan Pasukan",
      story: "Wu Qi membangun kedekatan dengan pasukannya sekaligus menjaga aturan tetap jelas. Kepedulian tidak membuat standar kerja menjadi longgar.",
      principle: "Operasional yang rapi memerlukan standar yang dipahami, teladan dari pemimpin, dan penerapan yang konsisten.",
      prompts: ["Aturan kerja mana yang sering berbeda antara ucapan dan pelaksanaan?", "Bagaimana saya bisa menjaga disiplin tanpa menghilangkan kepedulian?"],
      checklist: ["Saya memilih satu proses yang perlu standar tertulis.", "PIC dan hasil yang diharapkan sudah jelas.", "Saya menetapkan waktu review yang konsisten."]
    },
    {
      id: "keuangan", chapter: 4, title: "Keuangan", pages: "174-178", strategy: "Perang Panjang Menghancurkan Logistik",
      story: "Sun Bin menjaga logistik dan membiarkan lawan menghabiskan sumber daya dalam pengejaran panjang. Ia bergerak ketika cadangannya lebih siap.",
      principle: "Kesibukan panjang tanpa hasil dan batas biaya dapat menguras kas, walaupun usaha terlihat terus bergerak.",
      prompts: ["Aktivitas apa yang paling lama menahan kas tanpa hasil jelas?", "Berapa batas biaya dan waktu sebelum sebuah kegiatan harus dievaluasi?"],
      checklist: ["Saya mengetahui saldo dan kebutuhan kas minimum.", "Saya menetapkan batas biaya untuk kegiatan utama.", "Saya menghentikan atau memperbaiki aktivitas tanpa hasil terukur."]
    },
    {
      id: "tim", chapter: 5, title: "Tim / SDM", pages: "228-232", strategy: "Pemimpin Harus Memberi Teladan",
      story: "Dalam latihan pasukan istana, Sun Tzu menjelaskan komando dengan sederhana dan menunjukkan keteguhan pada standar yang telah ditetapkan.",
      principle: "Perilaku pemimpin menjadi contoh hidup bagi tim; standar sulit dipercaya jika pemimpin sendiri tidak menjalankannya.",
      prompts: ["Kebiasaan saya apa yang sedang ditiru oleh tim?", "Standar apa yang perlu saya contohkan lebih dulu sebelum menuntut tim?"],
      checklist: ["Saya menjelaskan standar dengan bahasa sederhana.", "Saya menjalankan standar yang sama untuk diri sendiri.", "Saya memberi umpan balik berdasarkan perilaku dan hasil."]
    },
    {
      id: "digital", chapter: 6, title: "Digital", pages: "288-292", strategy: "Mata-mata Menentukan Kemenangan",
      story: "Ban Chao tidak menebak penyebab perubahan keadaan. Ia mencari informasi dari sumber yang mengetahui situasi, lalu mengambil keputusan berdasarkan fakta.",
      principle: "Data pelanggan, analitik kanal, dan percakapan nyata adalah jaringan informasi usaha di medan digital.",
      prompts: ["Keputusan digital apa yang masih saya buat berdasarkan asumsi?", "Sumber data mana yang paling dekat dengan perilaku pelanggan saya?"],
      checklist: ["Saya memilih kanal berdasarkan perilaku pelanggan.", "Saya memeriksa data, bukan hanya jumlah pengikut.", "Saya mencatat satu insight digital untuk keputusan berikutnya."]
    },
    {
      id: "produksi", chapter: 7, title: "Produksi", pages: "342-346", strategy: "Persediaan Harus Terukur",
      story: "Han Xin mengukur logistik, kapasitas pasukan, cadangan, dan medan sebelum mengambil langkah. Tanpa angka, keputusan besar hanya menjadi perjudian.",
      principle: "Produksi harus mengikuti permintaan, kapasitas, kualitas, dan stok aman yang benar-benar terukur.",
      prompts: ["Angka produksi atau stok apa yang belum saya ketahui dengan pasti?", "Risiko apa yang muncul jika saya memproduksi berdasarkan perasaan?"],
      checklist: ["Saya mengetahui permintaan rata-rata produk utama.", "Saya menetapkan stok aman dan kapasitas realistis.", "Saya mencatat waste, produk gagal, atau stok lambat."]
    },
    {
      id: "distribusi", chapter: 8, title: "Distribusi", pages: "396-400", strategy: "Kuasai Jalur Pergerakan",
      story: "Zhao She tidak menerobos medan yang belum dikenal. Ia memakai pengetahuan pemandu setempat, memetakan rute, dan menguasai jalur penting lebih dulu.",
      principle: "Distribusi yang kuat memahami rute, biaya, risiko, dan alternatif sebelum menjanjikan kecepatan kepada pelanggan.",
      prompts: ["Di titik mana pengiriman paling sering terlambat atau mahal?", "Jalur alternatif apa yang bisa menjaga layanan saat rute utama bermasalah?"],
      checklist: ["Saya memetakan alur pesanan sampai diterima pelanggan.", "Saya membandingkan biaya dan waktu setiap jalur.", "Saya menyiapkan alternatif untuk risiko pengiriman utama."]
    },
    {
      id: "negosiasi", chapter: 9, title: "Negosiasi", pages: "446-449", strategy: "Menang Tanpa Perang adalah Kemenangan Terbaik",
      story: "Sun Tzu dan Wu Yuan memakai diplomasi, posisi strategis, dan tawaran jalan damai sehingga tujuan dapat dicapai tanpa benturan besar yang menguras sumber daya.",
      principle: "Negosiasi terbaik menjaga margin dan hubungan dengan memperjelas kepentingan, alternatif, dan pertukaran nilai.",
      prompts: ["Apa hasil minimum yang tetap sehat bagi usaha saya?", "Nilai apa yang bisa dipertukarkan selain potongan harga?"],
      checklist: ["Saya menulis target, batas minimum, dan alternatif.", "Saya memahami kepentingan pihak lain.", "Setiap konsesi memiliki imbal balik yang jelas."]
    },
    {
      id: "ekspansi", chapter: 10, title: "Ekspansi", pages: "496-501", strategy: "Jangan Menyerang Tanpa Persiapan",
      story: "Han Xin memetakan medan, menghitung variabel, dan menyiapkan beberapa kemungkinan sebelum menghadapi kekuatan yang lebih besar.",
      principle: "Ekspansi dilakukan setelah fondasi terukur dan skenario risiko disiapkan, bukan karena dorongan untuk cepat membesar.",
      prompts: ["Fondasi apa yang belum siap jika usaha tumbuh dua kali lipat?", "Uji kecil apa yang bisa membuktikan peluang sebelum biaya besar dikeluarkan?"],
      checklist: ["Permintaan, margin, arus kas, dan kapasitas sudah diperiksa.", "Saya menyiapkan pilot dengan batas biaya dan waktu.", "Saya memiliki aturan lanjut, revisi, atau hentikan."]
    }
  ];

  const BOOK_READING_STEPS = [
    "Buka buku fisik pada halaman yang direkomendasikan.",
    "Baca kisah strategi dan penjelasannya sampai selesai.",
    "Jawab bagian Refleksi Diri langsung di buku.",
    "Kerjakan checklist atau latihan pada bagian tersebut."
  ];

  const WORKBOOK_MODULES = [
    {
      id: "pemasaran", goal: "Dikenal, dipercaya, diingat", principle: "Kenali diri dan pasar sebelum bergerak.",
      output: "Target pasar prioritas, masalah pelanggan, pembeda brand, pesan utama, dua channel pemasaran, dan rencana konten 30 hari.",
      questions: ["Target pelanggan utama saya sudah spesifik.", "Saya memiliki data atau percakapan pelanggan yang mendukung keputusan.", "Pelanggan mempunyai alasan memilih brand saya selain harga.", "Konten dan channel pemasaran saya memiliki tujuan yang jelas."],
      exercises: [
        { id: "a", title: "Peta Pasar dan Pelanggan", instruction: "Gunakan data penjualan, observasi, marketplace, wawancara, atau percakapan pelanggan.", columns: ["Temuan saat ini", "Bukti / sumber data"], items: ["Siapa target pelanggan paling potensial?", "Masalah apa yang paling mendesak bagi mereka?", "Apa yang membuat mereka membeli?", "Pesaing apa yang sering mereka bandingkan?", "Tren atau perubahan apa yang memengaruhi pasar?", "Celah pasar apa yang belum dilayani dengan baik?"] },
        { id: "b", title: "Brand, Pesan, Konten, dan Relasi", instruction: "Tentukan satu keputusan praktis untuk setiap elemen.", columns: ["Kondisi sekarang", "Keputusan perbaikan"], items: ["Janji utama brand", "Pembeda yang sulit ditiru", "Pesan nilai, bukan harga", "Tiga pilar konten edukasi", "Dua channel prioritas", "Cara membangun komunitas / relasi"] }
      ]
    },
    {
      id: "penjualan", goal: "Menjual konsisten dan bertumbuh", principle: "Pilih pertempuran yang tepat dan tawarkan solusi.",
      output: "Peta masalah-solusi, pipeline penjualan, standar follow-up, skrip penawaran, dan program repeat order atau referral.",
      questions: ["Saya mengetahui alasan utama pelanggan membeli dan menolak.", "Setiap prospek tercatat dan memiliki jadwal follow-up.", "Penawaran saya menekankan solusi dan hasil pelanggan.", "Ada sistem purna jual, repeat order, atau referral."],
      exercises: [
        { id: "a", title: "Peta Masalah dan Solusi Pelanggan", instruction: "Isi dari sudut pandang pelanggan, bukan dari fitur produk.", columns: ["Jawaban Anda", "Bukti / contoh nyata"], items: ["Target prospek prioritas", "Pemicu mereka mulai mencari solusi", "Masalah utama", "Hasil yang diinginkan", "Solusi yang kita tawarkan", "Keberatan terbesar", "Bukti yang menurunkan keraguan"] },
        { id: "b", title: "Sistem Prospek sampai Loyalitas", instruction: "Tetapkan tindakan dan KPI sederhana pada setiap tahap.", columns: ["Proses saat ini", "Perbaikan / standar KPI"], items: ["Menarik prospek", "Kualifikasi kebutuhan", "Penawaran solusi", "Follow-up", "Closing", "Purna jual", "Repeat order / referral"] }
      ]
    },
    {
      id: "operasional", goal: "Efisien, produktif, terkendali", principle: "Disiplin dalam eksekusi mengubah rencana menjadi hasil.",
      output: "Peta proses utama, tiga SOP prioritas, KPI operasional, dan satu proyek pengurangan waste.",
      questions: ["Proses utama bisnis saya terdokumentasi.", "Setiap pekerjaan penting memiliki PIC dan batas waktu.", "Standar kualitas diperiksa secara konsisten.", "Saya memantau KPI dan penyebab pemborosan."],
      exercises: [
        { id: "a", title: "Peta Proses Utama", instruction: "Pilih satu proses yang paling memengaruhi pelanggan atau biaya.", columns: ["PIC", "Standar waktu", "Standar hasil", "Risiko utama"], items: ["Permintaan / pesanan masuk", "Persiapan", "Pengerjaan", "Pemeriksaan", "Penyerahan / pengiriman", "Follow-up / penutupan"] },
        { id: "b", title: "Audit SOP, KPI, dan Waste", instruction: "Cari satu akar masalah, bukan hanya gejalanya.", columns: ["Masalah / waste", "Akar penyebab", "Perbaikan / KPI"], items: ["Waktu tunggu", "Kesalahan / rework", "Stok berlebih / kurang", "Gerakan / proses tidak perlu", "Komunikasi / handover", "Keluhan pelanggan"] }
      ]
    },
    {
      id: "keuangan", goal: "Sehat, aman, bertumbuh", principle: "Kuasai informasi dan data sebelum mengambil keputusan.",
      output: "Ringkasan arus kas, margin produk utama, aturan pengambilan pribadi, kebutuhan modal kerja, dan rencana dana darurat.",
      questions: ["Keuangan pribadi dan bisnis sudah dipisahkan.", "Arus kas dan laba rugi dicatat rutin.", "Saya mengetahui margin produk atau layanan utama.", "Ada aturan modal kerja, dana darurat, dan investasi."],
      exercises: [
        { id: "a", title: "Audit Arus Kas dan Disiplin Keuangan", instruction: "Gunakan angka rata-rata satu bulan terakhir bila data lengkap belum tersedia.", columns: ["Kondisi / angka saat ini", "Masalah", "Tindakan"], items: ["Kas masuk dari penjualan", "Biaya variabel", "Biaya tetap", "Pengambilan pemilik", "Piutang / utang", "Modal kerja", "Dana darurat / investasi"] },
        { id: "b", title: "Margin Produk atau Layanan", instruction: "Margin kotor = harga jual - biaya langsung. Gunakan angka nyata.", columns: ["Harga jual", "Biaya langsung", "Margin kotor", "Volume / bulan", "Perbaikan"], items: ["Produk / layanan utama 1", "Produk / layanan utama 2", "Produk / layanan utama 3"] }
      ]
    },
    {
      id: "tim", goal: "Tim solid, produktif, loyal", principle: "Bangun tim yang solid dan tempatkan orang pada posisi yang tepat.",
      output: "Peta peran, pembagian wewenang, gap kompetensi, rencana pelatihan, dan sistem apresiasi.",
      questions: ["Setiap anggota tim memahami hasil yang diharapkan.", "Tugas dan wewenang tidak tumpang tindih.", "Ada proses briefing, feedback, dan pelatihan.", "Apresiasi dan reward terkait perilaku serta kinerja."],
      exercises: [
        { id: "a", title: "Orang yang Tepat di Kursi yang Tepat", instruction: "Gunakan satu baris untuk setiap peran penting, termasuk pemilik.", columns: ["Hasil utama", "Tugas inti", "Wewenang", "Orang saat ini / gap"], items: ["Pemilik / pimpinan", "Pemasaran / penjualan", "Operasional / produksi", "Keuangan / admin", "Layanan / distribusi"] },
        { id: "b", title: "Budaya, Pengembangan, dan Reward", instruction: "Hubungkan nilai dengan perilaku yang dapat diamati.", columns: ["Perilaku yang diharapkan", "Cara melatih", "Apresiasi / reward", "Frekuensi review"], items: ["Disiplin", "Kualitas", "Pelayanan", "Kerja sama", "Belajar & berinovasi"] }
      ]
    },
    {
      id: "digital", goal: "Go digital, go global", principle: "Adaptif, cepat belajar, dan gunakan data untuk keputusan.",
      output: "Peta channel digital, prioritas optimasi, satu automasi sederhana, dan dashboard KPI minimum.",
      questions: ["Channel digital dipilih sesuai perilaku pelanggan.", "Profil, katalog, dan pesan online sudah konsisten.", "Iklan atau konten dievaluasi dengan KPI.", "Proses berulang mulai diotomatisasi dan datanya dicatat."],
      exercises: [
        { id: "a", title: "Audit Kehadiran Digital", instruction: "Tidak semua channel harus dipakai. Prioritaskan yang menghasilkan nilai.", columns: ["Tujuan", "Target audiens", "Kondisi saat ini", "KPI / prioritas"], items: ["Website / landing page", "Instagram", "TikTok", "Marketplace", "WhatsApp Business", "Pencarian / SEO / profil bisnis"] },
        { id: "b", title: "Automasi dan Data Minimum", instruction: "Mulai dari proses yang paling berulang atau paling banyak membuat pelanggan menunggu.", columns: ["Masalah manual", "Automasi / template", "Data yang dicatat", "Langkah pertama"], items: ["Pengumpulan leads", "Balasan awal", "Follow-up", "Pesanan & pembayaran", "Layanan purna jual", "Laporan kinerja"] }
      ]
    },
    {
      id: "produksi", goal: "Kualitas terjaga, biaya efisien", principle: "Fokus pada kekuatan inti dan konsisten menjaga standar.",
      output: "Rencana produksi, titik kontrol kualitas, target waste atau yield, dan daftar inovasi prioritas.",
      questions: ["Produksi direncanakan berdasarkan permintaan dan kapasitas.", "Standar bahan, proses, dan hasil sudah jelas.", "Waste dan produk gagal dicatat beserta penyebabnya.", "Inovasi dipilih berdasarkan kebutuhan pasar."],
      exercises: [
        { id: "a", title: "Rencana Permintaan dan Produksi", instruction: "Gunakan produk prioritas atau kelompok produk utama.", columns: ["Permintaan rata-rata", "Kapasitas", "Stok aman", "Frekuensi produksi", "Hambatan"], items: ["Produk prioritas 1", "Produk prioritas 2", "Produk prioritas 3"] },
        { id: "b", title: "Kontrol Kualitas, Waste, dan Yield", instruction: "Pilih ukuran sederhana yang dapat diperiksa rutin.", columns: ["Standar kualitas", "Defect / waste", "Akar penyebab", "Perbaikan / ukuran"], items: ["Bahan baku", "Persiapan", "Proses produksi", "Pengemasan", "Penyimpanan", "Retur / keluhan"] }
      ]
    },
    {
      id: "distribusi", goal: "Tepat produk, tepat waktu, tepat biaya", principle: "Kecepatan dan informasi menentukan kelancaran gerak.",
      output: "Prioritas channel distribusi, standar stok dan pengiriman, evaluasi mitra logistik, dan rencana perluasan pasar.",
      questions: ["Channel distribusi dipilih berdasarkan data, bukan kebiasaan.", "Stok dan titik pemesanan ulang dipantau.", "Standar pengemasan dan waktu pengiriman jelas.", "Keluhan distribusi digunakan untuk perbaikan."],
      exercises: [
        { id: "a", title: "Penilaian Channel Distribusi", instruction: "Beri nilai 1-5 untuk kecocokan pelanggan, jangkauan, biaya, dan kontrol.", columns: ["Pelanggan / jangkauan", "Biaya / kontrol", "Prioritas / keputusan"], items: ["Toko / penjualan langsung", "Reseller / agen", "Marketplace", "Aplikasi pesan antar", "B2B / institusi", "Pameran / event / komunitas"] },
        { id: "b", title: "Standar Stok dan Logistik", instruction: "Tetapkan standar yang dapat diukur dan dipantau.", columns: ["Standar", "Kondisi saat ini", "Risiko", "Aksi / KPI"], items: ["Akurasi stok", "Titik pemesanan ulang", "Pengemasan", "Waktu proses pesanan", "Waktu pengiriman", "Mitra logistik & keluhan"] }
      ]
    },
    {
      id: "negosiasi", goal: "Menang bersama, untung maksimal", principle: "Menang tanpa benturan melalui persiapan dan kepentingan bersama.",
      output: "Lembar persiapan negosiasi, BATNA, batas minimum, daftar konsesi, dan skrip komunikasi.",
      questions: ["Saya menyiapkan data dan target sebelum negosiasi.", "Batas minimum dan alternatif saya sudah jelas.", "Saya memahami kepentingan pihak lain.", "Setiap konsesi memiliki imbal balik."],
      exercises: [
        { id: "a", title: "Persiapan Posisi Negosiasi", instruction: "BATNA adalah alternatif terbaik bila kesepakatan tidak terjadi.", columns: ["Target ideal", "Batas minimum", "Data pendukung", "Kepentingan pihak lain / BATNA"], items: ["Harga", "Volume", "Pembayaran", "Waktu / pengiriman", "Kualitas / layanan", "Isu lain"] },
        { id: "b", title: "Konsesi dan Komunikasi", instruction: "Jangan memberi konsesi gratis. Hubungkan dengan sesuatu yang Anda perlukan.", columns: ["Syarat / imbal balik", "Kalimat komunikasi", "Batas / no-go"], items: ["Diskon / harga", "Volume", "Termin pembayaran", "Waktu pengerjaan", "Eksklusivitas", "Dukungan promosi / layanan"] }
      ]
    },
    {
      id: "ekspansi", goal: "Tumbuh berkelanjutan, naik kelas", principle: "Menang berkelanjutan: perkuat fondasi sebelum memperluas medan.",
      output: "Skor kesiapan ekspansi, peluang prioritas, pilot test, anggaran, KPI, aturan lanjut-hentikan, dan kebutuhan kemitraan.",
      questions: ["Permintaan, margin, dan arus kas sudah cukup stabil.", "SOP dan kualitas dapat berjalan tanpa ketergantungan penuh pada pemilik.", "Tim, pasokan, dan distribusi siap menerima pertumbuhan.", "Peluang ekspansi diuji dengan indikator dan batas risiko."],
      exercises: [
        { id: "a", title: "Audit Kesiapan Ekspansi", instruction: "Beri skor 1-5 dan tulis bukti, bukan hanya keyakinan.", columns: ["Skor 1-5", "Bukti", "Gap utama", "Perbaikan sebelum ekspansi"], items: ["Permintaan & pelanggan", "Margin & arus kas", "Produk & kualitas", "SOP & operasional", "Tim & kepemimpinan", "Pasokan & distribusi", "Digital, data & kontrol"] },
        { id: "b", title: "Rencana Pilot Ekspansi", instruction: "Uji satu peluang dengan biaya dan risiko terbatas sebelum memperbesar investasi.", columns: ["Rencana"], items: ["Pasar / lokasi / segmen yang diuji", "Hipotesis utama", "Bentuk uji kecil", "Durasi dan anggaran maksimum", "Mitra / sumber daya yang diperlukan", "KPI keberhasilan", "Aturan lanjut, revisi, atau hentikan"] }
      ]
    }
  ];

  const WORKBOOK_SCALE = ["Belum ada", "Ada, belum konsisten", "Berjalan sebagian", "Berjalan baik", "Terukur dan terus diperbaiki"];
  const WORKBOOK_DECISION_FIELDS = [
    ["decision", "Satu keputusan utama"], ["action", "Aksi pertama dalam 7 hari"],
    ["pic", "PIC / penanggung jawab"], ["kpi", "KPI / bukti selesai"], ["risk", "Risiko dan mitigasi"]
  ];

  const TASKS = [
    ["Lengkapi profil usaha", "Tulis jenis usaha, pemilik, dan kondisi yang ingin diperbaiki."],
    ["Kerjakan Diagnosis 10 Medan", "Jawab 40 pertanyaan checklist resmi sesuai kondisi nyata usaha."],
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

  const CONSULTATION_SCENARIOS = [
    {
      id: "cash-empty", domainId: "keuangan", title: "Omzet ramai, kas tetap kosong",
      keywords: ["kas kosong", "uang habis", "omzet ramai", "uang usaha habis", "uang tidak ada", "cash flow", "arus kas"],
      insight: "Penjualan yang ramai belum tentu menghasilkan kas sehat. Periksa apakah uang tertahan di stok, piutang, biaya operasional, atau pengambilan pribadi.",
      actions: ["Pisahkan uang pribadi dari rekening atau catatan usaha.", "Catat seluruh pemasukan dan pengeluaran selama tujuh hari.", "Hitung margin tiga produk terlaris sebelum menambah promosi atau stok."],
      tools: ["cashflow", "margin", "leaks"]
    },
    {
      id: "margin", domainId: "keuangan", title: "Margin dan keuntungan belum jelas",
      keywords: ["margin", "keuntungan", "untung", "profit", "hpp", "biaya produksi", "seratus order", "100 order", "rugi"],
      insight: "Omzet bukan keuntungan. Hasil usaha baru dapat dinilai setelah harga jual dikurangi HPP, biaya tambahan, komisi, diskon, dan ongkos distribusi.",
      actions: ["Pilih satu produk utama dan tulis seluruh biaya per transaksi.", "Hitung selisih harga jual dan biaya menggunakan Kalkulator Margin.", "Audit biaya yang sering terlewat sebelum mengubah target penjualan."],
      tools: ["margin", "leaks", "price"]
    },
    {
      id: "pricing", domainId: "keuangan", title: "Menentukan harga jual yang sehat",
      keywords: ["harga jual", "harga minimum", "tentukan harga", "menentukan harga", "pasang harga", "harga produk", "kemahalan"],
      insight: "Harga yang sehat dimulai dari biaya aktual dan margin yang dibutuhkan, bukan sekadar meniru harga pesaing.",
      actions: ["Catat HPP, kemasan, tenaga, biaya admin, dan subsidi ongkir.", "Pilih target margin yang realistis sesuai jenis usaha.", "Hitung batas harga minimum sebelum menawarkan promo atau bundling."],
      tools: ["price", "margin", "leaks"]
    },
    {
      id: "price-war", domainId: "negosiasi", title: "Menghadapi perang harga dan diskon",
      keywords: ["perang harga", "diskon", "kompetitor murah", "pesaing murah", "banting harga", "minta murah", "potong harga"],
      insight: "Diskon tanpa batas dapat membuat penjualan meningkat tetapi margin justru hilang. Negosiasi perlu berpijak pada harga minimum dan nilai produk.",
      actions: ["Hitung batas harga jual yang masih menyisakan margin sehat.", "Siapkan alasan membeli selain harga: kualitas, kemudahan, pelayanan, atau pendampingan.", "Jika memberi promo, tentukan batas waktu, jumlah, dan margin sebelum dipublikasikan."],
      tools: ["price", "margin", "plan"]
    },
    {
      id: "receivables", domainId: "keuangan", title: "Piutang dan pembayaran tertunda",
      keywords: ["piutang", "belum bayar", "tempo", "tagihan", "utang pelanggan", "hutang pelanggan", "pembayaran tertunda"],
      insight: "Pesanan yang sudah dicatat belum menjadi kas jika pembayaran belum masuk. Prioritasnya adalah mengetahui jumlah dan tanggal jatuh tempo yang nyata.",
      actions: ["Buat daftar pelanggan, nilai tagihan, dan tanggal pembayaran yang disepakati.", "Lakukan follow-up sopan dengan menyebut transaksi dan tanggal secara jelas.", "Pertimbangkan uang muka atau aturan pembayaran tertulis untuk transaksi berikutnya."],
      tools: ["cashflow", "plan", "mentoring"]
    },
    {
      id: "debt-risk", domainId: "keuangan", title: "Pinjaman atau kewajiban perlu ditinjau hati-hati",
      keywords: ["pinjaman bank", "pinjol", "cicilan", "kredit usaha", "bunga pinjaman", "utang usaha", "hutang usaha", "pajak"],
      insight: "Keputusan pinjaman, pajak, dan kewajiban pembayaran membutuhkan data lengkap. Asisten offline tidak dapat memastikan kelayakan pinjaman atau memberikan kepastian hukum.",
      actions: ["Catat cicilan, tanggal jatuh tempo, pemasukan, dan biaya wajib yang sudah ada.", "Periksa arus kas tujuh hari sebelum mengambil kewajiban baru.", "Bahas angka dan dokumen pendukung bersama pendamping atau pihak profesional terkait."],
      tools: ["cashflow", "plan", "mentoring"], escalate: true
    },
    {
      id: "owner-bottleneck", domainId: "operasional", title: "Bisnis terlalu bergantung pada pemilik",
      keywords: ["owner", "pemilik", "saya libur", "tidak masuk", "bisnis berhenti", "saya tidak hadir", "semua saya kerjakan", "sendirian"],
      insight: "Usaha yang berhenti ketika pemilik tidak hadir biasanya membutuhkan pembagian tugas, prioritas, dan panduan kerja yang lebih jelas.",
      actions: ["Daftarkan tiga pekerjaan yang paling menyita waktu pemilik.", "Tulis langkah sederhana untuk satu pekerjaan yang berulang.", "Serahkan satu tugas kecil kepada orang yang tepat dan cek hasilnya menggunakan daftar singkat."],
      tools: ["plan", "actions", "mentoring"]
    },
    {
      id: "sop", domainId: "operasional", title: "Merapikan SOP dan proses kerja",
      keywords: ["sop", "proses kerja", "operasional", "pekerjaan berulang", "kesalahan pesanan", "terlambat proses", "alur kerja"],
      insight: "SOP tidak harus rumit. Mulai dari proses yang paling sering menimbulkan kesalahan, keterlambatan, atau ketergantungan pada owner.",
      actions: ["Pilih satu aktivitas yang paling sering diulang atau menimbulkan komplain.", "Tulis urutan kerja, penanggung jawab, dan hasil yang harus diperiksa.", "Uji panduan tersebut selama satu minggu lalu perbaiki bagian yang masih membingungkan."],
      tools: ["plan", "actions", "mentoring"]
    },
    {
      id: "team", domainId: "tim", title: "Koordinasi dan pembagian tugas tim",
      keywords: ["karyawan", "tim", "pegawai", "sdm", "staf", "staff", "delegasi", "bagi tugas", "pembagian tugas"],
      insight: "Masalah tim sering muncul karena tanggung jawab dan standar hasil belum dibicarakan secara jelas, bukan semata karena orangnya tidak mau bekerja.",
      actions: ["Tentukan satu tanggung jawab utama untuk setiap anggota tim.", "Sepakati indikator hasil yang sederhana dan dapat diperiksa.", "Lakukan evaluasi mingguan singkat untuk membahas hambatan dan solusi."],
      tools: ["kpi", "plan", "mentoring"]
    },
    {
      id: "content", domainId: "pemasaran", title: "Konten ramai tetapi pesanan belum mengikuti",
      keywords: ["konten", "posting", "views", "viewer", "viral", "like", "engagement", "reels", "tiktok", "instagram"],
      insight: "Jumlah penonton tidak otomatis menunjukkan niat membeli. Periksa apakah konten menjelaskan masalah pelanggan, manfaat produk, dan langkah pemesanan.",
      actions: ["Pilih satu masalah pelanggan yang bisa dibantu oleh produk.", "Buat konten yang menunjukkan masalah, solusi, dan bukti yang relevan.", "Pastikan calon pembeli memahami cara bertanya atau memesan tanpa CTA berulang."],
      tools: ["kpi", "plan", "diagnosis"]
    },
    {
      id: "ads", domainId: "pemasaran", title: "Iklan berjalan tetapi hasilnya belum sehat",
      keywords: ["iklan", "ads", "meta ads", "facebook ads", "cpc", "ctr", "roas", "boncos", "traffic", "advertising"],
      insight: "Klik yang murah atau jangkauan yang besar belum membuktikan pembelian terjadi. Evaluasi tujuan pembelian, kesiapan halaman, margin, dan kualitas penawaran.",
      actions: ["Periksa apakah tujuan iklan dan ukuran keberhasilannya adalah pembelian, bukan sekadar klik.", "Pastikan halaman tujuan, harga, cara membeli, dan pencatatan pembelian berfungsi.", "Bandingkan biaya iklan dengan margin sebelum menambah anggaran."],
      tools: ["margin", "kpi", "mentoring"]
    },
    {
      id: "audience", domainId: "pemasaran", title: "Target pelanggan dan positioning belum jelas",
      keywords: ["target pasar", "pelanggan ideal", "target audience", "segmentasi", "segment", "positioning", "untuk siapa", "pasar yang tepat"],
      insight: "Pesan yang ingin menjangkau semua orang sering tidak terasa relevan bagi siapa pun. Mulai dari satu kelompok pelanggan dan satu masalah yang spesifik.",
      actions: ["Tulis siapa pelanggan yang paling mungkin membutuhkan produk.", "Catat masalah, alasan membeli, dan keraguan utama mereka.", "Susun satu kalimat yang menjelaskan produk ini membantu siapa dan untuk masalah apa."],
      tools: ["plan", "kpi", "diagnosis"]
    },
    {
      id: "quiet-sales", domainId: "penjualan", title: "Pesanan dan penjualan masih sepi",
      keywords: ["order sepi", "pesanan sepi", "penjualan sepi", "sepi pembeli", "tidak laku", "ga laku", "gak laku", "belum ada order", "pembeli sepi"],
      insight: "Penjualan sepi bisa berasal dari target yang kurang tepat, penawaran yang belum jelas, proses follow-up yang terputus, atau kepercayaan yang belum terbentuk.",
      actions: ["Periksa dari mana calon pembeli datang dan pertanyaan yang paling sering mereka ajukan.", "Pastikan manfaat, harga, bukti, dan langkah pemesanan mudah dipahami.", "Lakukan follow-up sopan kepada prospek yang pernah menunjukkan minat."],
      tools: ["kpi", "plan", "diagnosis"]
    },
    {
      id: "closing", domainId: "penjualan", title: "Calon pembeli bertanya tetapi belum closing",
      keywords: ["closing", "konversi", "tanya harga", "tidak jadi beli", "batal beli", "banyak yang tanya", "checkout", "keranjang"],
      insight: "Sebelum menambah traffic, cari tahu alasan calon pembeli berhenti: harga, kebutuhan, kepercayaan, cara membeli, atau waktu yang belum tepat.",
      actions: ["Catat minimal lima percakapan calon pembeli yang tidak berlanjut.", "Kelompokkan alasan mereka ragu atau batal.", "Perbaiki satu hambatan terbesar lalu ukur perubahan pada KPI mingguan."],
      tools: ["kpi", "plan", "mentoring"]
    },
    {
      id: "follow-up", domainId: "penjualan", title: "Follow-up tanpa terlihat memaksa",
      keywords: ["follow up", "follow-up", "followup", "prospek", "calon pembeli", "tidak dibalas", "chat pelanggan", "balas chat"],
      insight: "Follow-up yang sehat membantu calon pembeli mengambil keputusan. Mulailah dari konteks percakapan, beri informasi bermanfaat, dan tawarkan langkah berikutnya.",
      actions: ["Sebutkan konteks pertanyaan atau produk yang pernah dibahas.", "Berikan satu informasi yang membantu, misalnya manfaat, stok, contoh, atau cara pakai.", "Tutup dengan pertanyaan ringan tanpa mendesak pelanggan membeli."],
      tools: ["plan", "kpi", "mentoring"]
    },
    {
      id: "repeat", domainId: "penjualan", title: "Repeat order dan pelanggan lama",
      keywords: ["repeat order", "repeat", "pelanggan lama", "beli lagi", "loyal", "langganan", "retensi", "pembelian ulang"],
      insight: "Pelanggan lama dapat menjadi sumber penjualan yang lebih sehat jika pengalaman pembelian, kebutuhan lanjutan, dan komunikasi setelah transaksi diperhatikan.",
      actions: ["Daftarkan pelanggan yang pernah membeli beserta produk dan tanggalnya.", "Hubungi mereka dengan konteks yang relevan, bukan langsung menawarkan promo.", "Cari tahu kendala setelah pembelian dan peluang produk pendamping."],
      tools: ["kpi", "plan", "mentoring"]
    },
    {
      id: "stock", domainId: "distribusi", title: "Stok penuh dan kas tertahan",
      keywords: ["stok", "stock", "gudang", "barang menumpuk", "tidak bergerak", "slow moving", "barang lama", "inventory"],
      insight: "Stok yang menumpuk dapat membuat kas terkunci walaupun produk terlihat tersedia. Pisahkan barang cepat laku dari barang yang perputarannya lambat.",
      actions: ["Kelompokkan stok berdasarkan penjualan 30 hari terakhir.", "Tunda pembelian ulang untuk barang yang bergerak lambat.", "Periksa margin sebelum membuat bundling atau promo pelepasan stok."],
      tools: ["cashflow", "margin", "leaks"]
    },
    {
      id: "shipping", domainId: "distribusi", title: "Ongkir, pengiriman, dan distribusi",
      keywords: ["ongkir", "pengiriman", "kurir", "ekspedisi", "distribusi", "retur", "paket terlambat", "kiriman"],
      insight: "Biaya pengiriman dan masalah distribusi bisa mengurangi margin sekaligus menurunkan kepercayaan pelanggan.",
      actions: ["Hitung biaya kirim, subsidi ongkir, kemasan, dan potensi retur per transaksi.", "Berikan estimasi pengiriman yang jelas dan realistis.", "Periksa apakah jalur pengiriman saat ini sebanding dengan margin produk."],
      tools: ["margin", "leaks", "plan"]
    },
    {
      id: "production", domainId: "produksi", title: "Biaya, kualitas, dan kapasitas produksi",
      keywords: ["produksi", "bahan baku", "bahan", "kapasitas", "kualitas produk", "produk rusak", "supplier", "pemasok"],
      insight: "Produksi yang sehat menjaga kualitas sambil menyesuaikan jumlah barang dengan permintaan, bahan baku, dan kapasitas usaha.",
      actions: ["Hitung biaya bahan, tenaga, kemasan, dan potensi barang rusak.", "Tetapkan standar kualitas sederhana untuk produk utama.", "Sesuaikan jumlah produksi dengan data penjualan, bukan hanya perkiraan."],
      tools: ["margin", "leaks", "kpi"]
    },
    {
      id: "digital", domainId: "digital", title: "Merapikan kanal dan pencatatan digital",
      keywords: ["website", "link", "marketplace", "shopee", "tokopedia", "whatsapp bisnis", "google maps", "digital", "database pelanggan"],
      insight: "Alat digital bermanfaat jika memudahkan pelanggan menemukan informasi, bertanya, membeli, dan membantu usaha menyimpan data penting.",
      actions: ["Periksa profil usaha, kontak, tautan pemesanan, dan jam operasional.", "Pastikan data prospek atau transaksi dapat dicatat dengan rapi.", "Perbaiki satu kanal yang paling sering dipakai pelanggan sebelum menambah kanal baru."],
      tools: ["kpi", "plan", "diagnosis"]
    },
    {
      id: "negotiation", domainId: "negosiasi", title: "Negosiasi dengan pelanggan atau mitra",
      keywords: ["negosiasi", "menawar", "tawar", "kerja sama", "reseller", "distributor", "komisi", "kontrak"],
      insight: "Negosiasi yang sehat memerlukan batas harga, nilai tambah, syarat pembayaran, dan ruang keputusan yang sudah disiapkan sebelumnya.",
      actions: ["Hitung batas harga yang tidak membuat produk merugi.", "Tentukan nilai tambah yang bisa ditawarkan selain potongan harga.", "Tulis kesepakatan utama, termasuk pembayaran dan tanggung jawab masing-masing pihak."],
      tools: ["price", "margin", "mentoring"]
    },
    {
      id: "expansion", domainId: "ekspansi", title: "Ekspansi, cabang, atau produk baru",
      keywords: ["ekspansi", "cabang", "buka cabang", "produk baru", "scale", "scaling", "tambah produk", "memperbesar usaha"],
      insight: "Ekspansi lebih aman ketika usaha sudah memahami kapasitas, arus kas, margin, dan kemampuan tim menjalankan proses yang ada.",
      actions: ["Periksa arus kas, margin produk utama, dan kapasitas tim saat ini.", "Tuliskan biaya dan risiko minimum dari rencana ekspansi.", "Tentukan uji coba kecil sebelum mengambil komitmen yang lebih besar."],
      tools: ["cashflow", "kpi", "plan"], escalate: true
    }
  ];

  const CONSULTATION_EXAMPLES = [
    "Omzet ramai tetapi kenapa kas selalu kosong?",
    "Konten saya banyak views, tetapi order tetap sepi.",
    "Bagaimana menentukan harga jual agar tidak rugi?",
    "Bisnis berhenti saat owner tidak masuk.",
    "Gudang penuh, tetapi uang usaha malah habis.",
    "Bagaimana follow-up calon pembeli tanpa memaksa?"
  ];

  const TOOL_LABELS = {
    margin: "Kalkulator Margin",
    price: "Harga Minimum Sehat",
    cashflow: "Cash Flow 7 Hari",
    leaks: "17 Kebocoran Margin",
    kpi: "KPI Mingguan",
    plan: "Action Plan",
    book: "Pendamping Baca Buku",
    workbook: "Workbook UMKM Naik Kelas",
    diagnosis: "Diagnosis 10 Medan",
    actions: "Misi 30 Hari"
  };

  const NAV_ITEMS = [
    { id: "home", icon: "\u2302", label: "Beranda" },
    { id: "diagnosis", icon: "\u25C9", label: "Diagnosis" },
    { id: "actions", icon: "\u2713", label: "Aksi" },
    { id: "tools", icon: "\u25A6", label: "Toolkit" },
    { id: "account", icon: "\u2659", label: "Akun" }
  ];

  const MODULE_TITLES = Object.freeze({
    property: "Modul Agen Properti",
    insurance: "Modul Agen Asuransi",
    mlm: "Modul Mitra MLM / Direct Selling"
  });

  function validModuleCode(value) {
    const code = String(value || "").trim().toLowerCase();
    return OWN.call(MODULE_TITLES, code) ? code : "";
  }

  function defaultState() {
    return {
      activated: false,
      profile: { owner: "", business: "", type: "", goal: "" },
      online: { sessionToken: "", dailyLimit: 0, remainingToday: 0, profileSource: "", deviceBound: false, moduleCode: "", moduleTitle: "" },
      certificate: { status: "", completionDate: "", submittedAt: "", verifiedAt: "", url: "", publicId: "", error: "" },
      answers: {},
      tasks: {},
      leaks: {},
      cashflow: Array.from({ length: 7 }, function () { return { income: 0, expense: 0 }; }),
      kpi: { leads: 0, transactions: 0, revenue: 0, expense: 0 },
      actionPlan: { thirty: "", sixty: "", ninety: "", hotseat: "" },
      settings: { actionPlanReminder: true },
      consultations: [],
      workbook: { scores: {}, fields: {}, priorities: [] },
      book: { reflections: {}, checks: {} }
    };
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const saved = JSON.parse(raw);
      const initial = defaultState();
      const sessionToken = String(saved.online && saved.online.sessionToken || "").slice(0, 2048);
      const savedModuleCode = validModuleCode(saved.online && saved.online.moduleCode);
      return {
        activated: saved.activated === true && (CONFIG.activationMode !== "cloudflare" || Boolean(sessionToken)),
        profile: Object.assign(initial.profile, saved.profile || {}),
        online: {
          sessionToken: sessionToken,
          dailyLimit: Math.max(0, Number(saved.online && saved.online.dailyLimit) || 0),
          remainingToday: Math.max(0, Number(saved.online && saved.online.remainingToday) || 0),
          profileSource: String(saved.online && saved.online.profileSource || "").slice(0, 40),
          deviceBound: Boolean(saved.online && saved.online.deviceBound),
          moduleCode: savedModuleCode,
          moduleTitle: savedModuleCode ? MODULE_TITLES[savedModuleCode] : ""
        },
        certificate: {
          status: String(saved.certificate && saved.certificate.status || "").slice(0, 20),
          completionDate: String(saved.certificate && saved.certificate.completionDate || "").slice(0, 10),
          submittedAt: String(saved.certificate && saved.certificate.submittedAt || "").slice(0, 40),
          verifiedAt: String(saved.certificate && saved.certificate.verifiedAt || "").slice(0, 40),
          url: safeCertificateUrl(saved.certificate && saved.certificate.url),
          publicId: String(saved.certificate && saved.certificate.publicId || "").slice(0, 80),
          error: String(saved.certificate && saved.certificate.error || "").slice(0, 240)
        },
        answers: Object.assign(initial.answers, saved.answers || {}),
        tasks: Object.assign(initial.tasks, saved.tasks || {}),
        leaks: Object.assign(initial.leaks, saved.leaks || {}),
        cashflow: Array.isArray(saved.cashflow) && saved.cashflow.length === 7 ? saved.cashflow : initial.cashflow,
        kpi: Object.assign(initial.kpi, saved.kpi || {}),
        actionPlan: Object.assign(initial.actionPlan, saved.actionPlan || {}),
        settings: {
          actionPlanReminder: !(saved.settings && saved.settings.actionPlanReminder === false)
        },
        consultations: Array.isArray(saved.consultations) ? saved.consultations.filter(function (item) {
          return item && typeof item.question === "string" && typeof item.title === "string" && Array.isArray(item.actions) && Array.isArray(item.tools);
        }).slice(-20) : initial.consultations,
        workbook: {
          scores: Object.assign(initial.workbook.scores, saved.workbook && saved.workbook.scores || {}),
          fields: Object.assign(initial.workbook.fields, saved.workbook && saved.workbook.fields || {}),
          priorities: Array.isArray(saved.workbook && saved.workbook.priorities) ? saved.workbook.priorities.filter(function (id, index, list) {
            return WORKBOOK_MODULES.some(function (module) { return module.id === id; }) && list.indexOf(id) === index;
          }).slice(0, 3) : initial.workbook.priorities
        },
        book: {
          reflections: Object.assign(initial.book.reflections, saved.book && saved.book.reflections || {}),
          checks: Object.assign(initial.book.checks, saved.book && saved.book.checks || {})
        }
      };
    } catch (error) {
      return defaultState();
    }
  }

  let state = loadState();
  let currentView = "home";
  let activeTool = "";
  let activeWorkbookSection = "overview";
  let activeWorkbookModule = "";
  let activeWorkbookWeek = 1;
  let activeBookGuide = "";
  let toolResult = null;
  let toastTimer = null;
  let apiRequestSequence = 0;
  let activationPending = false;
  let tokenRequestPending = false;
  let tokenRequestMessage = "";
  let consultationPending = false;
  let completionPending = false;
  let certificateLookupPending = false;

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      toast("Data belum bisa disimpan. Periksa ruang penyimpanan perangkat.");
    }
  }

  function syncActionPlanReminder(requestPermission) {
    const bridge = window.PanglimaAndroid;
    if (!bridge) return;
    const method = requestPermission ? "setActionPlanReminder" : "syncActionPlanReminder";
    if (typeof bridge[method] !== "function") return;
    try {
      bridge[method](state.settings.actionPlanReminder === true);
    } catch (error) {}
  }

  function cancelPendingApiRequests() {
    Object.keys(PENDING_API_REQUESTS).forEach(function (requestId) {
      window.clearTimeout(PENDING_API_REQUESTS[requestId].timeout);
      delete PENDING_API_REQUESTS[requestId];
    });
    activationPending = false;
    tokenRequestPending = false;
    tokenRequestMessage = "";
    consultationPending = false;
    completionPending = false;
    certificateLookupPending = false;
  }

  function onlineMode() {
    return CONFIG.activationMode === "cloudflare";
  }

  function onlineBridgeAvailable() {
    return onlineMode() && window.PanglimaAndroid &&
      typeof window.PanglimaAndroid.postApi === "function";
  }

  function apiError(code, message, status) {
    const error = new Error(String(message || "Layanan AI online belum tersedia."));
    error.code = String(code || "NETWORK_ERROR");
    error.status = Number(status || 0);
    return error;
  }

  function requestApi(endpoint, payload) {
    return new Promise(function (resolve, reject) {
      if (!onlineBridgeAvailable()) {
        reject(apiError("BRIDGE_UNAVAILABLE", "Koneksi aplikasi ke layanan AI belum tersedia."));
        return;
      }

      const requestId = "panglima-" + String(++apiRequestSequence);
      const timeout = window.setTimeout(function () {
        if (!OWN.call(PENDING_API_REQUESTS, requestId)) return;
        delete PENDING_API_REQUESTS[requestId];
        reject(apiError("REQUEST_TIMEOUT", "Koneksi AI terlalu lama. Panduan offline tetap tersedia."));
      }, 55000);

      PENDING_API_REQUESTS[requestId] = { resolve: resolve, reject: reject, timeout: timeout };
      try {
        window.PanglimaAndroid.postApi(endpoint, JSON.stringify(payload), requestId);
      } catch (error) {
        window.clearTimeout(timeout);
        delete PENDING_API_REQUESTS[requestId];
        reject(apiError("BRIDGE_ERROR", "Koneksi aplikasi ke layanan AI belum tersedia."));
      }
    });
  }

  window.panglimaApiResult = function (requestId, status, body) {
    if (!OWN.call(PENDING_API_REQUESTS, requestId)) return;
    const pending = PENDING_API_REQUESTS[requestId];
    delete PENDING_API_REQUESTS[requestId];
    window.clearTimeout(pending.timeout);

    let result;
    try {
      result = JSON.parse(String(body || ""));
    } catch (error) {
      pending.reject(apiError("INVALID_RESPONSE", "Jawaban layanan AI tidak dapat dibaca.", status));
      return;
    }

    if (!result || result.ok !== true) {
      pending.reject(apiError(result && result.code, result && result.message, status));
      return;
    }
    pending.resolve(result);
  };

  function safeCertificateUrl(value) {
    const url = String(value || "").trim().slice(0, 2048);
    return /^https:\/\/[^\s]+$/i.test(url) ? url : "";
  }

  function syncCertificateCompletion(silent, force) {
    const eligibility = certificateEligibility();
    if (!onlineMode() || !state.online.sessionToken || !eligibility.eligible || completionPending) return false;
    if (!force && (state.certificate.status === "pending" || state.certificate.status === "verified")) return false;

    completionPending = true;
    state.certificate.error = "";
    if (!silent) {
      render();
      toast("Mengirim data penyelesaian untuk verifikasi.");
    }

    requestApi("/v1/completion", {
      sessionToken: state.online.sessionToken,
      diagnosis: {
        answered: eligibility.diagnosis.answered,
        total: eligibility.diagnosis.total
      },
      actions: {
        completed: eligibility.actions.completed,
        total: eligibility.actions.total
      }
    }).then(function (result) {
      completionPending = false;
      const certificate = result.certificate || {};
      state.certificate = {
        status: String(certificate.status || "pending").slice(0, 20),
        completionDate: String(certificate.completionDate || "").slice(0, 10),
        submittedAt: String(certificate.submittedAt || "").slice(0, 40),
        verifiedAt: String(certificate.verifiedAt || "").slice(0, 40),
        url: certificate.status === "verified" ? safeCertificateUrl(state.certificate.url) : "",
        publicId: certificate.status === "verified" ? String(state.certificate.publicId || "").slice(0, 80) : "",
        error: ""
      };
      persist();
      render();
      toast(state.certificate.status === "verified"
        ? "Sertifikat sudah diverifikasi."
        : "Data penyelesaian sudah masuk antrean verifikasi.");
    }, function (error) {
      completionPending = false;
      state.certificate.error = String(error.message || "Sinkronisasi sertifikat belum berhasil.").slice(0, 240);
      if (error.code === "SESSION_EXPIRED" || error.code === "DEVICE_LOCKED" || error.code === "DEVICE_REQUIRED") {
        state.online.sessionToken = "";
        state.activated = false;
      }
      persist();
      render();
      if (!silent) toast(state.certificate.error);
    });
    return true;
  }

  function openCertificate() {
    const cachedUrl = safeCertificateUrl(state.certificate && state.certificate.url);
    if (cachedUrl) {
      openUrl(cachedUrl);
      return true;
    }
    if (!onlineMode() || !state.online.sessionToken || state.certificate.status !== "verified" || certificateLookupPending) return false;

    certificateLookupPending = true;
    state.certificate.error = "";
    render();
    requestApi("/v1/certificate", { sessionToken: state.online.sessionToken }).then(function (result) {
      certificateLookupPending = false;
      const certificate = result.certificate || {};
      const url = safeCertificateUrl(certificate.url);
      if (!url) {
        state.certificate.error = "Tautan sertifikat belum tersedia.";
        persist();
        render();
        toast(state.certificate.error);
        return;
      }
      state.certificate.url = url;
      state.certificate.publicId = String(certificate.publicId || "").slice(0, 80);
      state.certificate.error = "";
      persist();
      render();
      openUrl(url);
    }, function (error) {
      certificateLookupPending = false;
      state.certificate.error = String(error.message || "Sertifikat belum dapat diunduh.").slice(0, 240);
      if (error.code === "SESSION_EXPIRED" || error.code === "DEVICE_LOCKED" || error.code === "DEVICE_REQUIRED") {
        state.online.sessionToken = "";
        state.activated = false;
      }
      persist();
      render();
      toast(state.certificate.error);
    });
    return true;
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

  function classifyChecklistScore(score) {
    if (score <= 6) return { tone: "red", label: "Medan rawan" };
    if (score <= 9) return { tone: "yellow", label: "Perlu diperkuat" };
    return { tone: "green", label: "Relatif kuat" };
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
    return { answered: answered, complete: complete, score: score, checklistScore: complete ? total + answered : null };
  }

  function domainResults(answers) {
    return DOMAINS.map(function (domain, index) {
      const result = scoreDomain(domain, answers);
      return Object.assign({ domain: domain, index: index }, result, result.complete ? classifyChecklistScore(result.checklistScore) : { tone: "neutral", label: "Belum lengkap" });
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

  function certificateEligibility() {
    const diagnosis = diagnosisProgress();
    const actions = actionProgress();
    return {
      diagnosis: diagnosis,
      actions: actions,
      eligible: diagnosis.complete && actions.total === 30 && actions.completed >= 24
    };
  }

  function scoreWorkbookModule(module, scores) {
    let answered = 0;
    let total = 0;
    module.questions.forEach(function (_, index) {
      const key = module.id + "-" + index;
      if (OWN.call(scores || {}, key)) {
        const value = Number(scores[key]);
        if (Number.isInteger(value) && value >= 1 && value <= 5) {
          answered += 1;
          total += value;
        }
      }
    });
    const complete = answered === module.questions.length;
    return { answered: answered, complete: complete, total: complete ? total : null, percent: complete ? Math.round(total / (module.questions.length * 5) * 100) : null };
  }

  function workbookProgress(snapshot) {
    const current = snapshot || state;
    const workbook = current.workbook || { scores: {}, fields: {}, priorities: [] };
    let answered = 0;
    let completed = 0;
    WORKBOOK_MODULES.forEach(function (module) {
      const result = scoreWorkbookModule(module, workbook.scores);
      answered += result.answered;
      if (result.complete) completed += 1;
    });
    return { answered: answered, total: 40, completed: completed, modules: WORKBOOK_MODULES.length, percent: Math.round(answered / 40 * 100), fields: Object.keys(workbook.fields || {}).filter(function (key) { return String(workbook.fields[key] || "").trim() !== ""; }).length };
  }

  function bookGuideById(id) {
    return BOOK_GUIDES.find(function (guide) { return guide.id === id; }) || null;
  }

  function bookProgress(snapshot) {
    const current = snapshot || state;
    const book = current.book || { reflections: {}, checks: {} };
    let completed = 0;
    let chapters = 0;
    let reflections = 0;
    const stepsPerChapter = BOOK_READING_STEPS.length + 3;

    BOOK_GUIDES.forEach(function (guide) {
      let guideCompleted = 0;
      for (let index = 0; index < stepsPerChapter; index += 1) {
        if (book.checks && book.checks[guide.id + "-" + index] === true) {
          completed += 1;
          guideCompleted += 1;
        }
      }
      if (guideCompleted === stepsPerChapter) chapters += 1;
      guide.prompts.forEach(function (_, index) {
        if (String(book.reflections && book.reflections[guide.id + "-" + index] || "").trim()) reflections += 1;
      });
    });

    const total = BOOK_GUIDES.length * stepsPerChapter;
    return { completed: completed, total: total, chapters: chapters, reflections: reflections, percent: Math.round(completed / total * 100) };
  }

  function recommendedBookGuide(snapshot) {
    const current = snapshot || state;
    const ranked = rankCompletedDomains(current.answers || {});
    if (ranked[0]) return bookGuideById(ranked[0].domain.id);
    const book = current.book || { checks: {} };
    const checks = book.checks || {};
    const stepsPerChapter = BOOK_READING_STEPS.length + 3;
    return BOOK_GUIDES.find(function (guide) {
      for (let index = 0; index < stepsPerChapter; index += 1) {
        if (checks[guide.id + "-" + index] !== true) return true;
      }
      return false;
    }) || BOOK_GUIDES[0];
  }

  function workbookField(key) {
    return String(state.workbook.fields[key] || "");
  }

  function selectedWorkbookPriorities(snapshot) {
    const current = snapshot || state;
    if (current.workbook && Array.isArray(current.workbook.priorities) && current.workbook.priorities.length) {
      return current.workbook.priorities.slice(0, 3);
    }
    return rankCompletedDomains(current.answers || {}).slice(0, 3).map(function (result) { return result.domain.id; });
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

  function normalizeConsultation(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  }

  function keywordMatches(normalizedQuestion, keyword) {
    const term = normalizeConsultation(keyword);
    if (!term) return false;
    return (" " + normalizedQuestion + " ").indexOf(" " + term + " ") !== -1;
  }

  function findConsultationScenario(question, answers) {
    const normalized = normalizeConsultation(question);
    const ranked = rankCompletedDomains(answers || {});
    const priorityId = ranked[0] ? ranked[0].domain.id : "";
    let best = null;
    let bestScore = 0;

    CONSULTATION_SCENARIOS.forEach(function (scenario) {
      let score = 0;
      scenario.keywords.forEach(function (keyword) {
        if (keywordMatches(normalized, keyword)) {
          score += keyword.indexOf(" ") >= 0 ? 4 : 1;
        }
      });

      if (score > 0 && scenario.domainId === priorityId) {
        score += 0.5;
      }

      if (score > bestScore) {
        best = scenario;
        bestScore = score;
      }
    });

    return best;
  }

  function fallbackScenario(answers) {
    const ranked = rankCompletedDomains(answers || {});
    const priority = ranked[0];

    if (!priority) {
      return {
        id: "start-diagnosis", domainId: "", title: "Mulai dari Diagnosis 10 Medan",
        insight: "Masalah utama belum bisa dipilih dengan aman karena belum ada satu medan diagnosis yang selesai. Lengkapi diagnosis terlebih dahulu agar rekomendasi tidak dibuat berdasarkan asumsi.",
        actions: ["Jawab empat pertanyaan pada medan yang paling sesuai dengan kendala usaha.", "Selesaikan Diagnosis 10 Medan agar tiga prioritas dapat dibandingkan.", "Tulis masalah yang lebih spesifik, misalnya kas kosong, margin, stok, follow-up, atau penjualan sepi."],
        tools: ["diagnosis", "plan", "mentoring"]
      };
    }

    return {
      id: "diagnosis-priority", domainId: priority.domain.id, title: "Mulai dari medan prioritas " + priority.domain.name,
      insight: "Pertanyaan belum cocok dengan skenario khusus. Rekomendasi sementara menggunakan medan diagnosis lengkap dengan skor terendah.",
      actions: [priority.domain.action, "Pilih satu tindakan yang bisa diselesaikan minggu ini.", "Bahas hasil dan hambatan dengan pendamping sebelum membuat perubahan besar."],
      tools: ["diagnosis", "plan", "mentoring"]
    };
  }

  function buildConsultation(question, snapshot) {
    const current = snapshot || state;
    const cleanedQuestion = String(question || "").trim().slice(0, 600);
    const scenario = findConsultationScenario(cleanedQuestion, current.answers) || fallbackScenario(current.answers);
    const domain = DOMAINS.find(function (item) { return item.id === scenario.domainId; }) || null;
    const result = domain ? scoreDomain(domain, current.answers || {}) : null;
    const workbookModule = domain ? WORKBOOK_MODULES.find(function (item) { return item.id === domain.id; }) : null;
    const workbook = current.workbook || { scores: {}, fields: {}, priorities: [] };
    const workbookResult = workbookModule ? scoreWorkbookModule(workbookModule, workbook.scores || {}) : null;
    const observations = [];

    if (result && result.complete) {
      observations.push("Skor diagnosis " + domain.name + " Anda adalah " + result.checklistScore + "/12 (" + classifyChecklistScore(result.checklistScore).label.toLowerCase() + ").");
    } else if (domain) {
      observations.push("Diagnosis medan " + domain.name + " belum lengkap; rekomendasi masih bersifat awal.");
    }

    if (workbookResult && workbookResult.complete) {
      observations.push("Workbook " + domain.name + " mencatat skor " + workbookResult.total + "/20 berdasarkan empat penilaian dan bukti usaha.");
      const weakest = workbookModule.questions.map(function (question, index) {
        return { question: question, score: Number(workbook.scores[workbookModule.id + "-" + index]) };
      }).sort(function (left, right) { return left.score - right.score; })[0];
      if (weakest && weakest.score <= 2) {
        observations.push("Fokus workbook yang perlu diperkuat: " + weakest.question);
      }
    } else if (workbookResult && workbookResult.answered > 0) {
      observations.push("Workbook " + domain.name + " baru terisi " + workbookResult.answered + "/4 penilaian.");
    }

    const savedDecision = domain && String(workbook.fields && workbook.fields[domain.id + "-decision-decision"] || "").trim();
    if (savedDecision) {
      observations.push("Keputusan strategi yang sudah Anda catat: " + savedDecision.slice(0, 180) + ".");
    }

    if (domain && domain.id === "keuangan") {
      const cash = summarizeCashflow(Array.isArray(current.cashflow) ? current.cashflow : []);
      if (cash.income > 0 || cash.expense > 0) {
        observations.push("Catatan Cash Flow 7 Hari saat ini menunjukkan saldo " + signedRupiah(cash.balance) + ".");
      }
    }

    if (domain && (domain.id === "penjualan" || domain.id === "pemasaran")) {
      const leads = numeric(current.kpi && current.kpi.leads);
      const transactions = numeric(current.kpi && current.kpi.transactions);
      if (leads > 0) {
        observations.push("KPI terakhir mencatat " + leads + " prospek dan " + transactions + " transaksi.");
      }
    }

    return {
      question: cleanedQuestion,
      scenarioId: scenario.id,
      domainId: domain ? domain.id : "",
      domainName: domain ? domain.name : "Diagnosis awal",
      title: scenario.title,
      owner: String(current.profile && current.profile.owner || "Pemilik usaha").slice(0, 80),
      business: String(current.profile && current.profile.business || "usaha Anda").slice(0, 100),
      insight: scenario.insight,
      observations: observations,
      actions: scenario.actions.slice(0, 3),
      tools: scenario.tools.filter(function (tool) { return OWN.call(TOOL_LABELS, tool); }).slice(0, 3),
      escalate: scenario.escalate === true,
      book: domain ? domain.book : "",
      bookGuide: domain ? domain.id : "",
      workbookModule: workbookModule ? workbookModule.id : ""
    };
  }

  function saveConsultation(entry, message) {
    state.consultations.push(entry);
    state.consultations = state.consultations.slice(-20);
    persist();
    render();
    toast(message);
    return true;
  }

  function buildOnlineContext(entry) {
    const ranked = rankCompletedDomains(state.answers).slice(0, 3);
    const guide = bookGuideById(entry.bookGuide || entry.domainId);
    const workbookModule = WORKBOOK_MODULES.find(function (item) {
      return item.id === entry.workbookModule;
    });
    const workbookResult = workbookModule
      ? scoreWorkbookModule(workbookModule, state.workbook.scores || {})
      : null;

    return {
      profile: {
        owner: state.profile.owner,
        business: state.profile.business,
        type: state.profile.type,
        goal: state.profile.goal
      },
      priorities: ranked.map(function (item) {
        return {
          name: item.domain.name,
          score: String(item.checklistScore) + "/12",
          status: item.label
        };
      }),
      cashflow: summarizeCashflow(state.cashflow),
      kpi: {
        leads: state.kpi.leads,
        transactions: state.kpi.transactions,
        revenue: state.kpi.revenue,
        expense: state.kpi.expense
      },
      workbook: {
        module: entry.domainName,
        score: workbookResult && workbookResult.complete ? String(workbookResult.total) + "/20" : "",
        decision: String(state.workbook.fields[entry.domainId + "-decision-decision"] || "").slice(0, 180)
      },
      book: guide ? {
        chapter: guide.chapter,
        title: guide.title,
        pages: guide.pages,
        strategy: guide.strategy,
        principle: guide.principle,
        reflection: String(state.book.reflections[guide.id + "-0"] || "").slice(0, 180)
      } : {},
      suggestedActions: entry.actions.slice(0, 3)
    };
  }

  function buildOnlineConsultation(question, result) {
    const base = buildConsultation(question, state);
    const answer = result && typeof result === "object" ? result : {};
    const actions = Array.isArray(answer.actions) ? answer.actions.filter(function (action) {
      return typeof action === "string" && action.trim();
    }).slice(0, 3) : [];
    while (actions.length < 3 && base.actions[actions.length]) {
      actions.push(base.actions[actions.length]);
    }

    const entry = Object.assign({}, base, {
      source: "ai-online",
      scenarioId: "cloudflare-ai",
      title: String(answer.title || base.title).slice(0, 100),
      insight: String(answer.insight || base.insight).slice(0, 1000),
      actions: actions,
      reflection: String(answer.reflection || "").slice(0, 220),
      warning: String(answer.warning || "").slice(0, 300)
    });
    if (entry.warning) entry.escalate = true;
    return entry;
  }

  function fallbackConsultation(question, message) {
    const entry = buildConsultation(question, state);
    entry.source = "offline";
    return saveConsultation(entry, message);
  }

  function addConsultation(question) {
    const cleaned = String(question || "").trim();
    if (cleaned.length < 10) {
      const error = document.getElementById("consultation-error");
      if (error) error.textContent = "Tuliskan masalah usaha sedikit lebih lengkap, minimal 10 karakter.";
      return false;
    }

    if (!onlineMode() || !state.online.sessionToken) {
      return fallbackConsultation(cleaned, "Rekomendasi panduan offline siap.");
    }

    if (consultationPending) {
      toast("Tunggu jawaban AI Panglima yang sedang diproses.");
      return false;
    }

    const offlineEntry = buildConsultation(cleaned, state);
    consultationPending = true;
    render();
    toast("AI Panglima sedang menyusun strategi usaha Anda.");

    requestApi("/v1/consultation", {
      sessionToken: state.online.sessionToken,
      question: cleaned,
      context: buildOnlineContext(offlineEntry)
    }).then(function (result) {
      consultationPending = false;
      if (result.quota) {
        state.online.dailyLimit = Math.max(0, Number(result.quota.dailyLimit) || 0);
        state.online.remainingToday = Math.max(0, Number(result.quota.remainingToday) || 0);
      }
      saveConsultation(buildOnlineConsultation(cleaned, result.result), "Jawaban AI Panglima siap.");
    }, function (error) {
      consultationPending = false;
      if (error.code === "SESSION_EXPIRED" || error.code === "DEVICE_LOCKED" || error.code === "DEVICE_REQUIRED") {
        state.online.sessionToken = "";
        state.activated = false;
        persist();
        render();
        const activationError = document.getElementById("activation-error");
        if (activationError) activationError.textContent = error.message;
        return;
      }

      if (error.code === "DAILY_LIMIT") {
        state.online.remainingToday = 0;
      }
      fallbackConsultation(cleaned,
        String(error.message || "AI online sedang tidak tersedia.") + " Panduan offline ditampilkan.");
    });
    return true;
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

  function openSpecialistModule(initialSection) {
    const code = validModuleCode(state.online && state.online.moduleCode);
    const token = String(state.online && state.online.sessionToken || "");
    if (!code || !token) {
      toast("Modul spesialis belum tersedia untuk akun ini.");
      return false;
    }
    if (!window.PanglimaAndroid ||
        typeof window.PanglimaAndroid.openModule !== "function") {
      toast("Gunakan aplikasi Panglima versi modul terbaru.");
      return false;
    }
    try {
      if (initialSection === "actions" &&
          typeof window.PanglimaAndroid.openModuleAction === "function") {
        window.PanglimaAndroid.openModuleAction(code, token, state.profile.owner || "");
      } else {
        window.PanglimaAndroid.openModule(code, token, state.profile.owner || "");
      }
      return true;
    } catch (error) {
      toast("Modul belum dapat dibuka. Coba lagi.");
      return false;
    }
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
    const workbook = workbookProgress();
    const book = bookProgress();
    const ranked = rankCompletedDomains(state.answers);
    const cash = summarizeCashflow(state.cashflow);
    return [
      "LAPORAN PENDAMPINGAN PANGLIMA UMKM",
      "Pemilik: " + state.profile.owner,
      "Usaha: " + state.profile.business,
      "Jenis usaha: " + (state.profile.type || "Belum diisi"),
      "Diagnosis: " + diagnosisProgress().answered + "/" + diagnosisProgress().total + " pertanyaan",
      "Medan prioritas: " + (ranked[0] ? ranked[0].domain.name + " (" + ranked[0].checklistScore + "/12)" : "Belum tersedia"),
      "Workbook: " + workbook.answered + "/" + workbook.total + " penilaian \u00B7 " + workbook.completed + "/" + workbook.modules + " modul lengkap",
      "Pendamping baca buku: " + book.chapters + "/10 bab selesai \u00B7 " + book.reflections + "/20 refleksi tercatat",
      "Aksi selesai: " + actions.completed + "/" + actions.total,
      "Saldo arus kas 7 hari: " + signedRupiah(cash.balance),
      "Rencana 30 hari: " + (state.actionPlan.thirty || "Belum diisi"),
      CONFIG.tagline
    ].join("\n");
  }

  function renderActivation() {
    const online = onlineMode();
    const profileFields = online ? '' :
      '<div class="field"><label for="owner">Nama pemilik usaha</label><input id="owner" name="owner" autocomplete="name" required maxlength="80" placeholder="Contoh: Bu Rani"></div>' +
      '<div class="field"><label for="business">Nama usaha</label><input id="business" name="business" required maxlength="100" placeholder="Contoh: Dapur Bu Rani"></div>' +
      '<div class="field"><label for="type">Jenis usaha</label><input id="type" name="type" maxlength="80" placeholder="Kuliner, fashion, jasa, atau lainnya"></div>';
    return '<section class="onboarding">' +
      '<div class="welcome-card"><div class="brand-mark">P</div><div class="eyebrow">Akses khusus pembeli</div><h1>Panglima UMKM</h1><p>Pendamping implementasi 30 hari untuk mengenali prioritas, menjalankan strategi, dan memantau progres.</p></div>' +
      '<div class="card"><h2>Aktivasi pendampingan</h2><p class="muted small">' +
      (online ? 'Masukkan kode akses pribadi. Profil PRE-TEST terisi otomatis, tidak dapat diubah, dan hanya aktif pada satu perangkat.' : 'Lengkapi profil usaha agar diagnosis dan laporan terasa relevan.') + '</p>' +
      '<form id="activation-form">' + profileFields +
      '<div class="field"><label for="activation-code">' + (online ? 'Kode akses peserta' : 'Kode aktivasi demo') + '</label><input id="activation-code" name="activationCode" required autocomplete="off" spellcheck="false" placeholder="Masukkan kode aktivasi"></div>' +
      '<p id="activation-error" class="inline-message"></p><button class="button block" type="submit"' + (activationPending ? ' disabled' : '') + '>' + (activationPending ? 'Memeriksa kode akses...' : 'Masuk ke Aplikasi') + '</button></form></div>' +
      (online
        ? '<div class="card"><h2>Belum menerima token?</h2><p class="muted small">Masukkan email yang sama dengan pembelian dan PRE-TEST. Sistem akan memeriksa data, lalu mengirim token ke email yang terdaftar.</p>' +
          '<form id="token-request-form"><div class="field"><label for="token-request-email">Email pembelian</label><input id="token-request-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required placeholder="user_71ec9927@example.invalid"></div>' +
          '<p id="token-request-message" class="inline-message' + (tokenRequestMessage ? ' success' : '') + '">' + escapeHtml(tokenRequestMessage) + '</p>' +
          '<button class="button gold block" type="submit"' + (tokenRequestPending ? ' disabled' : '') + '>' + (tokenRequestPending ? 'Memeriksa PRE-TEST...' : 'Kirim Token ke Email') + '</button></form>' +
          '<button class="button secondary block request-pretest" data-action="open-pretest" type="button">Isi PRE-TEST terlebih dahulu</button></div>'
        : '') +
      (online
        ? '<div class="notice"><strong>Aktivasi peserta online:</strong> satu kode untuk satu perangkat. Nama, usaha, dan jenis usaha mengikuti data resmi PRE-TEST serta tidak dapat diganti.</div>'
        : '<div class="notice"><strong>Mode SAFE / demo:</strong> gunakan kode <strong>' + escapeHtml(CONFIG.demoActivationCode) + '</strong>. Validasi pembelian asli belum dihubungkan dan tidak menyentuh sistem affiliate.</div>') +
      '</section>';
  }

  function renderNav() {
    return '<nav class="bottom-nav" aria-label="Navigasi utama">' + NAV_ITEMS.map(function (item) {
      const active = currentView === item.id || (currentView === "assistant" || currentView === "workbook" || currentView === "book") && item.id === "tools";
      return '<button class="nav-button' + (active ? ' active' : '') + '" data-view="' + item.id + '" type="button"><span class="icon">' + item.icon + '</span><span class="label">' + item.label + '</span></button>';
    }).join("") + '</nav>';
  }

  function renderHome() {
    const diagnosis = diagnosisProgress();
    const actions = actionProgress();
    const workbook = workbookProgress();
    const book = bookProgress();
    const suggestedBook = recommendedBookGuide();
    const ranked = rankCompletedDomains(state.answers);
    const nextTask = TASKS.find(function (task) { return !state.tasks[task.id]; });
    return '<header class="hero"><div class="eyebrow">Pendamping 30 hari</div><h1>Selamat datang, ' + escapeHtml(state.profile.owner) + '</h1><p>' + escapeHtml(state.profile.business) + ' \u00B7 ' + escapeHtml(CONFIG.tagline) + '</p></header>' +
      '<section class="page"><div class="stat-grid"><div class="stat"><span class="label">Diagnosis terjawab</span><span class="value">' + diagnosis.answered + '/' + diagnosis.total + '</span></div>' +
      '<div class="stat"><span class="label">Misi selesai</span><span class="value">' + actions.completed + '/' + actions.total + '</span></div></div>' +
      (state.online.moduleCode ? '<article class="card specialist-module-card"><span class="badge green">Varian pembelian aktif</span><h2 style="margin-top:12px">' + escapeHtml(state.online.moduleTitle) + '</h2><p class="small muted">Modul ini terbuka khusus untuk token dan perangkat Anda. Isi modul lain tidak ikut dibuka.</p><button class="button block gold" data-action="open-specialist-module" type="button">Buka ' + escapeHtml(state.online.moduleTitle) + '</button></article>' : '') +
      '<div class="section-heading"><h2>Peta perang bisnis</h2><button data-view="diagnosis" type="button">Lihat</button></div>' +
      (ranked[0] ? '<article class="card"><span class="badge ' + ranked[0].tone + '">' + escapeHtml(ranked[0].label) + ' \u00B7 ' + ranked[0].checklistScore + '/12</span><h2 style="margin-top:12px">Medan prioritas: ' + escapeHtml(ranked[0].domain.name) + '</h2><p class="muted small">' + escapeHtml(ranked[0].domain.action) + '</p><button class="button compact gold" data-view="diagnosis" type="button">Lihat rekomendasi</button></article>' :
        '<article class="card"><h2>Temukan medan prioritas</h2><p class="muted small">Selesaikan minimal satu medan diagnosis untuk melihat rekomendasi awal.</p><button class="button compact" data-view="diagnosis" type="button">Mulai Diagnosis</button></article>') +
      '<article class="card"><span class="badge yellow">Buku fisik New Edition</span><h2 style="margin-top:12px">Pendamping Baca Buku</h2><p class="small muted">Buka buku Anda, baca kisah strategi, isi Refleksi Diri dan checklist di buku, lalu bawa satu keputusan ke aplikasi.</p>' + progressBar(book, book.chapters + " dari 10 bab selesai") +
      (suggestedBook ? '<button class="button block gold" data-book="' + escapeHtml(suggestedBook.id) + '" type="button">Buka Panduan Bab ' + suggestedBook.chapter + ' \u00B7 ' + escapeHtml(suggestedBook.title) + '</button>' : '<button class="button block gold" data-book="overview" type="button">Buka Pendamping Buku</button>') + '</article>' +
      (state.online.moduleCode ? '' : '<article class="card"><span class="badge neutral">10 modul \u00B7 Workbook resmi</span><h2 style="margin-top:12px">Workbook UMKM Naik Kelas</h2><p class="small muted">Isi audit 1\u20135, latihan praktik, keputusan 7 hari, strategy canvas, dan roadmap berdasarkan kondisi nyata usaha.</p>' + progressBar(workbook, workbook.answered + " dari " + workbook.total + " penilaian workbook") + '<button class="button block" data-view="workbook" type="button">Buka Workbook Interaktif</button></article>') +
      '<article class="card"><span class="badge green">' + (onlineMode() ? 'AI online - sisa ' + state.online.remainingToday + '/' + state.online.dailyLimit + ' hari ini' : 'Offline - Tanpa biaya API') + '</span><h2 style="margin-top:12px">Asisten Strategi Panglima</h2><p class="small muted">Ceritakan masalah usaha Anda. Dapatkan rekomendasi praktis berdasarkan diagnosis, arus kas, KPI, dan panduan 10 medan.</p><button class="button block" data-view="assistant" type="button">' + (onlineMode() ? 'Mulai Konsultasi AI' : 'Mulai Konsultasi Otomatis') + '</button></article>' +
      '<article class="card"><div class="eyebrow muted">Perintah berikutnya</div><h3 style="margin-top:8px">' + escapeHtml(nextTask ? nextTask.title : "Seluruh misi sudah selesai") + '</h3><p class="small muted">' + escapeHtml(nextTask ? nextTask.detail : "Bagikan laporan perkembangan kepada pendamping.") + '</p>' + progressBar(actions, actions.completed + " dari " + actions.total + " misi selesai") + '</article>' +
      '<div class="section-heading"><h2>Akses cepat</h2></div><div class="quick-grid">' +
      '<button class="quick-action" data-view="diagnosis"><span class="icon">\uD83E\uDDED</span><span class="label">Diagnosis 10 Medan</span></button>' +
      '<button class="quick-action" data-book="overview"><span class="icon">\uD83D\uDCD6</span><span class="label">Insight Buku</span></button>' +
      (state.online.moduleCode ? '<button class="quick-action" data-action="open-specialist-module"><span class="icon">\uD83D\uDCD8</span><span class="label">' + escapeHtml(state.online.moduleTitle) + '</span></button>' : '<button class="quick-action" data-view="workbook"><span class="icon">\uD83D\uDCD8</span><span class="label">Workbook Interaktif</span></button>') +
      '<button class="quick-action" data-view="tools"><span class="icon">\uD83E\uDDEE</span><span class="label">Toolkit Bisnis</span></button></div></section>';
  }

  function renderDiagnosis() {
    const progress = diagnosisProgress();
    const ranked = rankCompletedDomains(state.answers);
    const results = domainResults(state.answers);
    const recommendation = ranked.length ? '<article class="card"><div class="eyebrow muted">Tiga prioritas berdasarkan checklist resmi</div>' + ranked.slice(0, 3).map(function (item, index) {
      return '<div class="domain-row"><div><span class="domain-name">' + (index + 1) + '. ' + escapeHtml(item.domain.name) + '</span><span class="domain-note">' + escapeHtml(item.domain.action) + '</span></div><span class="badge ' + item.tone + '">' + item.checklistScore + '/12</span></div>';
    }).join("") + '<button class="button compact gold" style="margin-top:14px" data-workbook="' + escapeHtml(ranked[0].domain.id) + '" type="button">Lanjutkan ke Workbook</button></article>' : '';
    return '<section class="page"><h1 class="page-title">Diagnosis 10 Medan</h1><p class="page-subtitle">Checklist resmi: 40 pernyataan, skor 1\u20133, dan tiga medan prioritas. Nilai berdasarkan kondisi nyata, bukan harapan.</p>' +
      '<article class="card">' + progressBar(progress, progress.answered + " dari " + progress.total + " pertanyaan") + '</article>' + recommendation +
      results.map(function (result) {
        const domain = result.domain;
        return '<article class="card"><div class="domain-row" style="padding-top:0"><div><span class="domain-name">' + domain.icon + ' ' + escapeHtml(domain.name) + '</span><span class="domain-note">' + result.answered + '/' + domain.questions.length + ' terjawab</span></div>' +
          '<span class="badge ' + result.tone + '">' + (result.complete ? result.checklistScore + '/12 \u00B7 ' : '') + escapeHtml(result.label) + '</span></div>' +
          domain.questions.map(function (question, questionIndex) {
            const key = domain.id + "-" + questionIndex;
            return '<div class="question"><p>' + escapeHtml(question) + '</p><div class="answer-options">' +
              [[0, "1 \u00B7 Lemah"], [1, "2 \u00B7 Cukup"], [2, "3 \u00B7 Kuat"]].map(function (option) {
                const selected = OWN.call(state.answers, key) && Number(state.answers[key]) === option[0];
                return '<button class="answer' + (selected ? ' active' : '') + '" data-answer="' + key + '" data-value="' + option[0] + '" type="button" aria-pressed="' + selected + '">' + option[1] + '</button>';
              }).join("") + '</div></div>';
          }).join("") + (result.complete ? '<p class="notice safe small"><strong>Langkah awal:</strong> ' + escapeHtml(domain.action) + '</p><div style="display:flex;flex-wrap:wrap;gap:8px"><button class="button compact gold" data-book="' + escapeHtml(domain.id) + '" type="button">Buka Insight Buku</button><button class="button compact secondary" data-workbook="' + escapeHtml(domain.id) + '" type="button">Buka Modul Workbook</button></div>' : '') + '</article>';
      }).join("") + '</section>';
  }

  function renderWorkbookInput(key, label, fallback, compact) {
    const value = workbookField(key) || String(fallback || "");
    const safeKey = escapeHtml(key);
    return '<div class="field"><label for="wb-' + safeKey + '">' + escapeHtml(label) + '</label>' +
      (compact ? '<input id="wb-' + safeKey + '" data-workbook-field="' + safeKey + '" maxlength="500" value="' + escapeHtml(value) + '" placeholder="Isi berdasarkan data nyata">' :
        '<textarea id="wb-' + safeKey + '" data-workbook-field="' + safeKey + '" maxlength="1500" placeholder="Tulis jawaban, bukti, atau keputusan nyata">' + escapeHtml(value) + '</textarea>') + '</div>';
  }

  function renderWorkbookSelect(key, label, options) {
    const value = workbookField(key);
    const safeKey = escapeHtml(key);
    return '<div class="field"><label for="wb-' + safeKey + '">' + escapeHtml(label) + '</label><select id="wb-' + safeKey + '" data-workbook-field="' + safeKey + '"><option value="">Belum dipilih</option>' + options.map(function (option) {
      const item = Array.isArray(option) ? option : [String(option), String(option)];
      return '<option value="' + escapeHtml(item[0]) + '"' + (value === String(item[0]) ? ' selected' : '') + '>' + escapeHtml(item[1]) + '</option>';
    }).join("") + '</select></div>';
  }

  function workbookSectionHeader(title, subtitle) {
    return '<section class="page"><button class="button compact secondary" data-workbook="overview" type="button">\u2190 Kembali ke Workbook</button><h1 class="page-title" style="margin-top:16px">' + escapeHtml(title) + '</h1><p class="page-subtitle">' + escapeHtml(subtitle) + '</p>';
  }

  function renderWorkbookOverview() {
    const progress = workbookProgress();
    const priorities = selectedWorkbookPriorities();
    const shortcuts = [
      ["audit", "\uD83D\uDCCB", "Audit Awal dan Akhir", "Skor 1\u20135, bukti, prioritas, dan perubahan 10 area."],
      ["canvas", "\uD83D\uDDFA\uFE0F", "Sun Tzu Strategy Canvas", "Satukan keputusan terbaik dari 10 modul."],
      ["priorities", "\uD83C\uDFAF", "Peta Prioritas 90 Hari", "Pilih maksimal tiga prioritas berdasarkan dampak dan kesiapan."],
      ["roadmap", "\uD83E\uDDED", "Roadmap 30 / 60 / 90 Hari", "Susun fondasi, optimasi, pertumbuhan, dan sumber daya."],
      ["action30", "\uD83D\uDCC6", "Action Plan 30 Hari", "Isi aksi, output, PIC, status, dan catatan per hari."],
      ["reviews", "\uD83D\uDCC8", "Review Mingguan", "Bandingkan KPI target, aktual, insight, dan keputusan."],
      ["declaration", "\u270D\uFE0F", "Deklarasi Eksekusi", "Tentukan komitmen, tiga aksi pertama, dan tanggal mulai."]
    ];
    return '<section class="page"><h1 class="page-title">Workbook UMKM Naik Kelas</h1><p class="page-subtitle">Versi interaktif workbook resmi: 10 area bisnis, prinsip Sun Tzu, latihan praktik, dan eksekusi terukur.</p>' +
      '<article class="card"><span class="badge green">Tersimpan offline di perangkat</span>' + progressBar(progress, progress.answered + " dari " + progress.total + " penilaian modul") +
      '<div class="stat-grid" style="margin-top:15px"><div class="stat"><span class="label">Modul lengkap</span><span class="value">' + progress.completed + '/10</span></div><div class="stat"><span class="label">Isian tersimpan</span><span class="value">' + progress.fields + '</span></div></div>' +
      renderWorkbookInput("goal", "Hasil utama yang ingin dicapai", "", false) + '</article>' +
      '<article class="card"><h2>Skala penilaian workbook</h2>' + WORKBOOK_SCALE.map(function (label, index) {
        return '<div class="domain-row"><span class="domain-name">' + (index + 1) + '. ' + escapeHtml(label) + '</span></div>';
      }).join("") + '<p class="muted small">Skala ini khusus workbook. Diagnosis awal tetap memakai skor checklist resmi 1\u20133.</p></article>' +
      (priorities.length ? '<article class="card"><div class="eyebrow muted">Mulai dari prioritas usaha</div>' + priorities.map(function (id, index) {
        const domain = DOMAINS.find(function (item) { return item.id === id; });
        return domain ? '<div class="domain-row"><div><span class="domain-name">' + (index + 1) + '. ' + escapeHtml(domain.name) + '</span><span class="domain-note">' + escapeHtml(domain.action) + '</span></div><button class="button compact gold" data-workbook="' + escapeHtml(id) + '" type="button">Buka</button></div>' : '';
      }).join("") + '</article>' : '<article class="card"><h2>Diagnosis dulu, strategi kemudian.</h2><p class="small muted">Lengkapi minimal satu medan diagnosis agar workbook menampilkan modul yang paling relevan.</p><button class="button compact secondary" data-view="diagnosis" type="button">Buka Diagnosis 10 Medan</button></article>') +
      '<div class="section-heading"><h2>10 modul workbook resmi</h2></div>' + WORKBOOK_MODULES.map(function (module, index) {
        const domain = DOMAINS[index];
        const result = scoreWorkbookModule(module, state.workbook.scores);
        return '<button class="tool-card" data-workbook="' + escapeHtml(module.id) + '" type="button"><strong>' + domain.icon + ' ' + (index + 1) + '. ' + escapeHtml(domain.name) + '</strong><span>' + escapeHtml(module.goal) + ' \u00B7 ' + (result.complete ? 'Skor ' + result.total + '/20' : result.answered + '/4 penilaian terisi') + '</span></button>';
      }).join("") + '<div class="section-heading"><h2>Strategi dan evaluasi</h2></div>' + shortcuts.map(function (item) {
        return '<button class="tool-card" data-workbook="' + item[0] + '" type="button"><strong>' + item[1] + ' ' + escapeHtml(item[2]) + '</strong><span>' + escapeHtml(item[3]) + '</span></button>';
      }).join("") + '</section>';
  }

  function renderWorkbookModule() {
    const module = WORKBOOK_MODULES.find(function (item) { return item.id === activeWorkbookModule; });
    const domain = DOMAINS.find(function (item) { return item.id === activeWorkbookModule; });
    if (!module || !domain) return renderWorkbookOverview();
    const index = WORKBOOK_MODULES.indexOf(module);
    const result = scoreWorkbookModule(module, state.workbook.scores);
    const diagnosis = scoreDomain(domain, state.answers);
    return workbookSectionHeader("Modul " + (index + 1) + " \u00B7 " + domain.name, module.goal) +
      '<article class="card"><div class="eyebrow muted">Prinsip Sun Tzu</div><h2 style="margin-top:9px">' + escapeHtml(module.principle) + '</h2><p class="small"><strong>Output modul:</strong> ' + escapeHtml(module.output) + '</p>' +
      (diagnosis.complete ? '<span class="badge ' + classifyChecklistScore(diagnosis.checklistScore).tone + '">Diagnosis: ' + diagnosis.checklistScore + '/12</span>' : '<span class="badge neutral">Diagnosis medan belum lengkap</span>') + '<button class="button compact gold" style="margin-top:12px" data-book="' + escapeHtml(module.id) + '" type="button">Buka Kisah dan Refleksi di Buku</button></article>' +
      '<article class="card"><h2>Cek posisi saat ini</h2><p class="muted small">Pilih skor 1\u20135 dan tambahkan bukti kondisi usaha yang sebenarnya.</p>' +
      module.questions.map(function (question, questionIndex) {
        const key = module.id + "-" + questionIndex;
        return '<div class="question"><p>' + escapeHtml(question) + '</p><div class="answer-options" style="grid-template-columns:repeat(5,minmax(0,1fr))">' + [1, 2, 3, 4, 5].map(function (value) {
          const selected = Number(state.workbook.scores[key]) === value;
          return '<button class="answer' + (selected ? ' active' : '') + '" data-workbook-score="' + escapeHtml(key) + '" data-value="' + value + '" type="button" title="' + escapeHtml(WORKBOOK_SCALE[value - 1]) + '" aria-pressed="' + selected + '">' + value + '</button>';
        }).join("") + '</div>' + renderWorkbookInput(module.id + "-evidence-" + questionIndex, "Bukti / catatan", "", true) + '</div>';
      }).join("") + '<div class="result-box"><span class="small">Skor modul workbook</span><span class="value">' + (result.complete ? result.total + '/20' : result.answered + '/4 terjawab') + '</span><span class="small">1 = belum ada \u00B7 5 = terukur dan terus diperbaiki</span></div></article>' +
      module.exercises.map(function (exercise, exerciseIndex) {
        return '<article class="card"><h2>' + (index + 1) + (exerciseIndex === 0 ? 'A' : 'B') + '. ' + escapeHtml(exercise.title) + '</h2><p class="small muted">' + escapeHtml(exercise.instruction) + '</p>' +
          exercise.items.map(function (item, itemIndex) {
            return '<details style="padding:12px 0;border-top:1px solid var(--border)"><summary style="cursor:pointer;font-size:13px;font-weight:700;line-height:1.5">' + (itemIndex + 1) + '. ' + escapeHtml(item) + '</summary>' +
              exercise.columns.map(function (column, columnIndex) {
                return renderWorkbookInput(module.id + "-" + exercise.id + "-" + itemIndex + "-" + columnIndex, column, "", exercise.columns.length > 2);
              }).join("") + '</details>';
          }).join("") + '</article>';
      }).join("") + '<article class="card"><h2>Keputusan dan eksperimen 7 hari</h2><p class="small muted">Setiap modul harus menghasilkan satu keputusan dan aksi yang bisa dijalankan.</p>' + WORKBOOK_DECISION_FIELDS.map(function (item) {
        return renderWorkbookInput(module.id + "-decision-" + item[0], item[1], item[0] === "pic" ? state.profile.owner : "", item[0] === "pic" || item[0] === "kpi");
      }).join("") + '<button class="button block" data-view="assistant" type="button">Konsultasikan Modul Ini</button></article></section>';
  }

  function renderWorkbookCanvas() {
    return workbookSectionHeader("Sun Tzu Strategy Canvas", "Pindahkan keputusan terbaik dari 10 modul ke dalam satu peta bisnis.") + WORKBOOK_MODULES.map(function (module, index) {
      const decision = workbookField(module.id + "-decision-decision");
      return '<article class="card"><h2>' + (index + 1) + '. ' + escapeHtml(DOMAINS[index].name) + '</h2><p class="small muted">' + escapeHtml(module.output) + '</p>' + renderWorkbookInput("canvas-" + module.id, "Keputusan / strategi utama", decision, false) + '</article>';
    }).join("") + '<article class="card"><h2>Keterkaitan antar-area</h2>' + renderWorkbookInput("canvas-connections", "Keterkaitan penting antar-area yang saya lihat", "", false) + '</article></section>';
  }

  function renderWorkbookPriorities() {
    const chosen = state.workbook.priorities;
    const suggested = rankCompletedDomains(state.answers).slice(0, 3);
    return workbookSectionHeader("Peta Prioritas 90 Hari", "Pilih maksimal tiga prioritas: dampak besar, realistis dijalankan, dan aman bagi arus kas.") +
      '<article class="card"><span class="badge ' + (chosen.length === 3 ? 'green' : 'yellow') + '">' + chosen.length + '/3 prioritas dipilih</span>' +
      (suggested.length ? '<p class="small"><strong>Saran dari diagnosis:</strong> ' + suggested.map(function (item) { return escapeHtml(item.domain.name) + ' (' + item.checklistScore + '/12)'; }).join(', ') + '.</p>' : '<p class="small muted">Selesaikan diagnosis untuk melihat rekomendasi tiga medan terlemah.</p>') + '</article>' +
      WORKBOOK_MODULES.map(function (module, index) {
        const domain = DOMAINS[index];
        const selected = chosen.indexOf(module.id) !== -1;
        const diagnosis = scoreDomain(domain, state.answers);
        return '<article class="card"><div class="domain-row" style="padding-top:0"><div><span class="domain-name">' + domain.icon + ' ' + escapeHtml(domain.name) + '</span><span class="domain-note">Diagnosis: ' + (diagnosis.complete ? diagnosis.checklistScore + '/12' : 'belum lengkap') + '</span></div><button class="button compact ' + (selected ? '' : 'secondary') + '" data-workbook-priority="' + escapeHtml(module.id) + '" type="button">' + (selected ? 'Dipilih' : 'Pilih') + '</button></div>' +
          renderWorkbookSelect("priority-" + module.id + "-impact", "Dampak terhadap usaha", [["1", "1 \u00B7 Sangat rendah"], ["2", "2 \u00B7 Rendah"], ["3", "3 \u00B7 Sedang"], ["4", "4 \u00B7 Tinggi"], ["5", "5 \u00B7 Sangat tinggi"]]) +
          renderWorkbookSelect("priority-" + module.id + "-ease", "Kemudahan dijalankan", [["1", "1 \u00B7 Sangat sulit"], ["2", "2 \u00B7 Sulit"], ["3", "3 \u00B7 Cukup realistis"], ["4", "4 \u00B7 Mudah"], ["5", "5 \u00B7 Sangat mudah"]]) +
          renderWorkbookInput("priority-" + module.id + "-risk", "Risiko yang perlu dijaga", "", true) +
          (selected ? '<div class="notice safe" style="margin-top:12px"><strong>Prioritas #' + (chosen.indexOf(module.id) + 1) + '</strong></div>' +
            renderWorkbookInput("priority-" + module.id + "-outcome", "Hasil 90 hari", "", false) + renderWorkbookInput("priority-" + module.id + "-why", "Mengapa penting?", "", true) +
            renderWorkbookInput("priority-" + module.id + "-kpi", "KPI / ukuran berhasil", "", true) + renderWorkbookInput("priority-" + module.id + "-pic", "PIC / penanggung jawab", state.profile.owner, true) : '') + '</article>';
      }).join("") + '</section>';
  }

  function renderWorkbookRoadmap() {
    const phases = [["thirty", "Hari 1\u201330", "Fondasi", state.actionPlan.thirty], ["sixty", "Hari 31\u201360", "Optimasi", state.actionPlan.sixty], ["ninety", "Hari 61\u201390", "Pertumbuhan", state.actionPlan.ninety]];
    const resources = [["time", "Waktu"], ["budget", "Anggaran"], ["people", "Orang / kompetensi"], ["tools", "Tools / teknologi"], ["partners", "Mitra / jaringan"]];
    return workbookSectionHeader("Roadmap 90 Hari", "Bulan pertama memperkuat fondasi, bulan kedua mengoptimalkan, bulan ketiga menumbuhkan hasil yang terbukti.") +
      phases.map(function (phase) {
        return '<article class="card"><span class="badge neutral">' + escapeHtml(phase[1]) + '</span><h2 style="margin-top:12px">Fokus: ' + escapeHtml(phase[2]) + '</h2>' +
          renderWorkbookInput("roadmap-" + phase[0] + "-outcome", "Hasil utama", phase[3], false) + renderWorkbookInput("roadmap-" + phase[0] + "-actions", "Aksi kunci", "", false) +
          renderWorkbookInput("roadmap-" + phase[0] + "-kpi", "KPI", "", true) + renderWorkbookInput("roadmap-" + phase[0] + "-risk", "Risiko / mitigasi", "", true) + '</article>';
      }).join("") + '<article class="card"><h2>Sumber daya yang harus disiapkan</h2>' + resources.map(function (resource) {
        return '<details style="padding:12px 0;border-top:1px solid var(--border)"><summary style="cursor:pointer;font-weight:700">' + escapeHtml(resource[1]) + '</summary>' +
          renderWorkbookInput("resource-" + resource[0] + "-available", "Sudah tersedia", "", true) + renderWorkbookInput("resource-" + resource[0] + "-gap", "Kekurangan", "", true) +
          renderWorkbookInput("resource-" + resource[0] + "-obtain", "Cara memperoleh", "", true) + '</details>';
      }).join("") + '</article></section>';
  }

  function renderWorkbookActionPlan() {
    const progress = actionProgress();
    const boundaries = [[1, 7], [8, 14], [15, 21], [22, 30]];
    const range = boundaries[activeWorkbookWeek - 1] || boundaries[0];
    const selectedTasks = TASKS.filter(function (task) { return task.day >= range[0] && task.day <= range[1]; });
    return workbookSectionHeader("Action Plan 30 Hari", "Isi aksi, hasil, PIC, status, dan catatan. Status misi tetap memakai data aplikasi yang sudah ada.") +
      '<article class="card">' + progressBar(progress, progress.completed + " dari " + progress.total + " aksi selesai") + '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:14px">' + [1, 2, 3, 4].map(function (week) {
        return '<button class="button compact ' + (activeWorkbookWeek === week ? '' : 'secondary') + '" data-workbook-week="' + week + '" type="button">Minggu ' + week + '</button>';
      }).join("") + '</div></article>' + selectedTasks.map(function (task) {
        const done = state.tasks[task.id] === true;
        return '<article class="card"><label class="task-row' + (done ? ' done' : '') + '"><input type="checkbox" data-task="' + task.id + '"' + (done ? ' checked' : '') + '><span class="task-copy"><strong>Hari ' + task.day + ' \u00B7 ' + escapeHtml(task.title) + '</strong><span>' + escapeHtml(task.detail) + '</span></span></label>' +
          renderWorkbookInput("day-" + task.day + "-action", "Aksi", task.title, true) + renderWorkbookInput("day-" + task.day + "-output", "Output yang dihasilkan", "", true) +
          renderWorkbookInput("day-" + task.day + "-pic", "PIC", state.profile.owner, true) + renderWorkbookInput("day-" + task.day + "-notes", "Catatan", "", false) + '</article>';
      }).join("") + '</section>';
  }

  function renderWorkbookReviews() {
    return workbookSectionHeader("Review Mingguan dan Scorecard", "Bandingkan target dengan hasil nyata, lalu putuskan: lanjutkan, perbaiki, uji ulang, atau hentikan.") +
      [1, 2, 3, 4].map(function (week) {
        return '<article class="card"><h2>Minggu ' + week + '</h2>' + renderWorkbookInput("review-" + week + "-completed", "Aksi selesai", "", true) +
          renderWorkbookInput("review-" + week + "-target", "KPI target", "", true) + renderWorkbookInput("review-" + week + "-actual", "KPI aktual", "", true) +
          renderWorkbookInput("review-" + week + "-insight", "Insight", "", false) + renderWorkbookSelect("review-" + week + "-decision", "Keputusan", [["lanjutkan", "Lanjutkan"], ["perbaiki", "Perbaiki"], ["uji-ulang", "Uji ulang"], ["hentikan", "Hentikan"]]) +
          renderWorkbookSelect("review-" + week + "-score", "Skor minggu", [1, 2, 3, 4, 5]) + '</article>';
      }).join("") + '<article class="card"><h2>Insight terbesar selama 30 hari</h2>' + renderWorkbookInput("review-biggest-insight", "Apa yang paling penting dipelajari?", "", false) + '</article></section>';
  }

  function renderWorkbookAudit() {
    let initialTotal = 0;
    let finalTotal = 0;
    let initialCount = 0;
    let finalCount = 0;
    DOMAINS.forEach(function (domain) {
      const initial = Number(workbookField("audit-start-" + domain.id));
      const final = Number(workbookField("audit-final-" + domain.id));
      if (initial >= 1 && initial <= 5) { initialTotal += initial; initialCount += 1; }
      if (final >= 1 && final <= 5) { finalTotal += final; finalCount += 1; }
    });
    return workbookSectionHeader("Audit Awal dan Akhir", "Nilai 10 area menggunakan bukti 30\u201390 hari terakhir. Bandingkan perubahan berdasarkan kondisi nyata.") +
      '<article class="card"><div class="stat-grid"><div class="stat"><span class="label">Skor awal</span><span class="value">' + initialTotal + '/50</span><span class="muted small">' + initialCount + '/10 area</span></div><div class="stat"><span class="label">Skor akhir</span><span class="value">' + finalTotal + '/50</span><span class="muted small">' + finalCount + '/10 area</span></div></div></article>' + DOMAINS.map(function (domain, index) {
        return '<article class="card"><h2>' + (index + 1) + '. ' + escapeHtml(domain.name) + '</h2>' + renderWorkbookSelect("audit-start-" + domain.id, "Skor awal", [1, 2, 3, 4, 5]) +
          renderWorkbookSelect("audit-priority-" + domain.id, "Prioritas", [["H", "H \u00B7 Tinggi"], ["M", "M \u00B7 Sedang"], ["L", "L \u00B7 Rendah"]]) +
          renderWorkbookInput("audit-evidence-" + domain.id, "Bukti utama / catatan", "", false) + renderWorkbookSelect("audit-final-" + domain.id, "Skor akhir", [1, 2, 3, 4, 5]) +
          renderWorkbookInput("audit-change-" + domain.id, "Bukti perubahan", "", false) + '</article>';
      }).join("") + '</section>';
  }

  function renderWorkbookDeclaration() {
    return workbookSectionHeader("Deklarasi Eksekusi", "Selesai mengisi bukan akhir. Eksekusi adalah awal.") + '<article class="card"><h2>Komitmen saya</h2><p class="small">Saya berkomitmen menggunakan strategi secara etis, memberi nilai nyata kepada pelanggan, menjalankan prioritas dengan disiplin, mencatat hasil, serta memperbaiki keputusan berdasarkan data.</p>' +
      renderWorkbookInput("declaration-name", "Nama", state.profile.owner, true) + renderWorkbookInput("declaration-business", "Nama usaha", state.profile.business, true) +
      renderWorkbookInput("declaration-actions", "Tiga aksi pertama", "", false) + renderWorkbookInput("declaration-stop", "Kebiasaan yang akan dihentikan", "", false) +
      renderWorkbookInput("declaration-date", "Tanggal mulai", "", true) + '</article><article class="card"><h2>Prinsip eksekusi</h2><p class="small">Kenali diri dan pasar. Rencanakan. Siapkan sumber daya. Eksekusi disiplin. Evaluasi. Tumbuh berkelanjutan.</p><button class="button block" data-action="share-report" type="button">Bagikan Laporan Perkembangan</button></article></section>';
  }

  function renderWorkbook() {
    if (activeWorkbookSection === "module") return renderWorkbookModule();
    if (activeWorkbookSection === "canvas") return renderWorkbookCanvas();
    if (activeWorkbookSection === "priorities") return renderWorkbookPriorities();
    if (activeWorkbookSection === "roadmap") return renderWorkbookRoadmap();
    if (activeWorkbookSection === "action30") return renderWorkbookActionPlan();
    if (activeWorkbookSection === "reviews") return renderWorkbookReviews();
    if (activeWorkbookSection === "audit") return renderWorkbookAudit();
    if (activeWorkbookSection === "declaration") return renderWorkbookDeclaration();
    return renderWorkbookOverview();
  }

  function renderBookReflection(guide, index) {
    const key = guide.id + "-" + index;
    const value = String(state.book.reflections[key] || "");
    return '<div class="field"><label for="book-reflection-' + escapeHtml(key) + '">' + escapeHtml(guide.prompts[index]) + '</label><textarea id="book-reflection-' + escapeHtml(key) + '" data-book-reflection="' + escapeHtml(key) + '" maxlength="1200" placeholder="Jawab setelah menulis refleksi lengkap di buku fisik">' + escapeHtml(value) + '</textarea></div>';
  }

  function renderBookOverview() {
    const progress = bookProgress();
    const suggested = recommendedBookGuide();
    return '<section class="page"><h1 class="page-title">Pendamping Baca Buku</h1><p class="page-subtitle">100 Strategi Sun Tzu UMKM Naik Kelas - New Edition.</p>' +
      '<article class="card"><span class="badge yellow">Buku fisik tetap menjadi sumber utama</span><h2 style="margin-top:12px">Baca, refleksikan, lalu terapkan</h2><p class="small muted">Aplikasi memberi arah baca dan tempat mencatat progres. Kisah lengkap, Refleksi Diri, checklist, dan latihan resmi dikerjakan dengan membuka buku Anda.</p>' + progressBar(progress, progress.chapters + " dari 10 bab selesai") + '<div class="stat-grid" style="margin-top:15px"><div class="stat"><span class="label">Checklist baca</span><span class="value">' + progress.completed + '/' + progress.total + '</span></div><div class="stat"><span class="label">Refleksi aplikasi</span><span class="value">' + progress.reflections + '/20</span></div></div></article>' +
      (suggested ? '<article class="card"><div class="eyebrow muted">Rekomendasi berikutnya</div><h2 style="margin-top:9px">Bab ' + suggested.chapter + ' \u00B7 ' + escapeHtml(suggested.title) + '</h2><p class="small muted">Strategi: ' + escapeHtml(suggested.strategy) + ' \u00B7 halaman ' + escapeHtml(suggested.pages) + '</p><button class="button block gold" data-book="' + escapeHtml(suggested.id) + '" type="button">Ambil Buku dan Mulai</button></article>' : '') +
      '<div class="section-heading"><h2>10 bab New Edition</h2></div>' + BOOK_GUIDES.map(function (guide) {
        const stepTotal = BOOK_READING_STEPS.length + guide.checklist.length;
        let checked = 0;
        for (let index = 0; index < stepTotal; index += 1) {
          if (state.book.checks[guide.id + "-" + index] === true) checked += 1;
        }
        return '<button class="tool-card" data-book="' + escapeHtml(guide.id) + '" type="button"><strong>\uD83D\uDCD6 Bab ' + guide.chapter + '. ' + escapeHtml(guide.title) + '</strong><span>' + escapeHtml(guide.strategy) + ' \u00B7 hlm. ' + escapeHtml(guide.pages) + ' \u00B7 ' + checked + '/' + stepTotal + ' langkah</span></button>';
      }).join("") + '</section>';
  }

  function renderBookGuide() {
    const guide = bookGuideById(activeBookGuide);
    if (!guide) return renderBookOverview();
    const domain = DOMAINS.find(function (item) { return item.id === guide.id; });
    const allSteps = BOOK_READING_STEPS.concat(guide.checklist);
    return '<section class="page"><button class="button compact secondary" data-book="overview" type="button">\u2190 Kembali ke Pendamping Buku</button><h1 class="page-title" style="margin-top:16px">Bab ' + guide.chapter + ' \u00B7 ' + escapeHtml(guide.title) + '</h1><p class="page-subtitle">Strategi 1: ' + escapeHtml(guide.strategy) + '</p>' +
      '<article class="card"><span class="badge yellow">Sekarang ambil buku fisik Anda</span><h2 style="margin-top:12px">Buka halaman ' + escapeHtml(guide.pages) + '</h2><p class="small"><strong>Rujukan:</strong> Bab ' + guide.chapter + ' ' + escapeHtml(guide.title) + ', Strategi 1 - ' + escapeHtml(guide.strategy) + '.</p><p class="notice"><strong>Penting:</strong> jangan berhenti pada ringkasan aplikasi. Baca kisah, penjelasan, Refleksi Diri, checklist, dan latihan lengkap langsung di buku.</p></article>' +
      '<article class="card"><div class="eyebrow muted">Ringkasan kisah strategi</div><h2 style="margin-top:9px">Insight awal</h2><p class="small">' + escapeHtml(guide.story) + '</p><div class="notice safe"><strong>Makna untuk UMKM:</strong> ' + escapeHtml(guide.principle) + '</div></article>' +
      '<article class="card"><h2>Checklist pendamping baca</h2><p class="small muted">Empat langkah pertama memastikan isi resmi dikerjakan di buku. Tiga langkah terakhir membantu penerapan pada usaha.</p>' + allSteps.map(function (step, index) {
        const key = guide.id + "-" + index;
        const checked = state.book.checks[key] === true;
        return '<label class="check-row"><input type="checkbox" data-book-check="' + escapeHtml(key) + '"' + (checked ? ' checked' : '') + '><span class="task-copy"><strong>' + (index + 1) + '. ' + escapeHtml(step) + '</strong></span></label>';
      }).join("") + '</article>' +
      '<article class="card"><h2>Catatan refleksi setelah membaca</h2><p class="small muted">Jawaban lengkap tetap ditulis di buku. Simpan inti keputusan di aplikasi agar dapat dibawa ke workbook dan konsultasi.</p>' + guide.prompts.map(function (_, index) { return renderBookReflection(guide, index); }).join("") + '</article>' +
      '<article class="card"><h2>Ubah bacaan menjadi tindakan</h2><p class="small muted">Setelah bagian buku selesai, pindahkan satu keputusan dan satu aksi tujuh hari ke modul workbook ' + escapeHtml(domain ? domain.name : guide.title) + '.</p><button class="button block gold" data-workbook="' + escapeHtml(guide.id) + '" type="button">Lanjut ke Workbook ' + escapeHtml(guide.title) + '</button></article></section>';
  }

  function renderBook() {
    return activeBookGuide ? renderBookGuide() : renderBookOverview();
  }

  function renderActions() {
    const progress = actionProgress();
    const weeks = [
      { title: "Minggu 1 \u00B7 Diagnosis & Prioritas", start: 1, end: 7 },
      { title: "Minggu 2 \u00B7 Pemasaran & Penjualan", start: 8, end: 14 },
      { title: "Minggu 3 \u00B7 Operasional & Keuangan", start: 15, end: 21 },
      { title: "Minggu 4 \u00B7 KPI & Tindak Lanjut", start: 22, end: 30 }
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
      (state.online.moduleCode ? '<button class="tool-card specialist-tool" data-action="open-specialist-module"><strong>\uD83D\uDD10 ' + escapeHtml(state.online.moduleTitle) + '</strong><span>Modul terenkripsi untuk jalur produk dan perangkat Anda.</span></button>' : '') +
      '<button class="tool-card" data-book="overview"><strong>\uD83D\uDCD6 Pendamping Baca Buku</strong><span>Rujukan 10 bab New Edition, ringkasan kisah strategi, refleksi, dan checklist yang dikerjakan bersama buku fisik.</span></button>' +
      (state.online.moduleCode ? '' : '<button class="tool-card" data-view="workbook"><strong>\uD83D\uDCD8 Workbook UMKM Naik Kelas</strong><span>10 modul resmi, 40 penilaian 1\u20135, latihan praktik, canvas, roadmap, dan review.</span></button>') +
      '<button class="tool-card" data-view="assistant"><strong>\uD83D\uDCAC ' + (onlineMode() ? 'Konsultasi AI Panglima' : 'Asisten Strategi Otomatis') + '</strong><span>' + (onlineMode() ? 'AI online berdasarkan kondisi usaha dan Diagnosis 10 Medan. Panduan offline tetap tersedia.' : 'Konsultasi offline berdasarkan kondisi usaha dan Diagnosis 10 Medan. Tanpa biaya API.') + '</span></button>' +
      '<button class="tool-card" data-tool="margin"><strong>\uD83E\uDDEE Kalkulator Margin</strong><span>Hitung keuntungan per produk setelah biaya utama dan biaya tambahan.</span></button>' +
      '<button class="tool-card" data-tool="price"><strong>\uD83C\uDFF7\uFE0F Harga Minimum Sehat</strong><span>Tentukan harga jual minimum berdasarkan margin target.</span></button>' +
      '<button class="tool-card" data-tool="cashflow"><strong>\uD83D\uDCB8 Cash Flow 7 Hari</strong><span>Catat arus kas masuk, keluar, dan saldo selama satu minggu.</span></button>' +
      '<button class="tool-card" data-tool="leaks"><strong>\uD83D\uDD0E Checklist 17 Kebocoran Margin</strong><span>' + leaksDone + ' dari 17 titik sudah diaudit.</span></button>' +
      '<button class="tool-card" data-tool="kpi"><strong>\uD83D\uDCCA KPI Mingguan</strong><span>Pantau prospek, transaksi, omzet, biaya, dan konversi.</span></button>' +
      '<button class="tool-card" data-tool="plan"><strong>\uD83D\uDDFA\uFE0F Action Plan 30 / 60 / 90 Hari</strong><span>Susun langkah lanjutan dan pertanyaan untuk hot seat.</span></button></section>';
  }

  function renderConsultationEntry(entry, index) {
    const diagnosis = Array.isArray(entry.observations) ? entry.observations : [];
    const guide = bookGuideById(entry.bookGuide || entry.domainId);
    const isAiOnline = entry.source === "ai-online";
    const sourceTitle = isAiOnline
      ? "Konsultan AI Panglima"
      : "Panduan Offline Otomatis";
    const sourceDescription = isAiOnline
      ? "Jawaban dibuat oleh model AI online berdasarkan data usaha dan diagnosis Anda."
      : "Panduan offline ini berasal dari rekomendasi bawaan aplikasi, bukan jawaban AI online.";
    const sourceBackground = isAiOnline ? "#eaf8f1" : "#fff7e8";
    return '<article class="card"><div class="eyebrow muted">Pertanyaan Anda</div><p style="margin:9px 0 15px;font-weight:700">' + escapeHtml(entry.question) + '</p>' +
      '<div style="padding:15px;background:#f8f5f1;border-radius:15px">' +
      '<div style="padding:12px 14px;margin-bottom:12px;border-radius:12px;background:' + sourceBackground + '">' +
      '<strong>' + escapeHtml(sourceTitle) + '</strong>' +
      '<div class="small muted" style="margin-top:4px">' + escapeHtml(sourceDescription) + '</div></div>' +
      '<span class="badge ' + (entry.escalate ? 'yellow' : 'green') + '">' + escapeHtml(entry.domainName) + '</span>' +
      '<h2 style="margin-top:12px">' + escapeHtml(entry.title) + '</h2><p class="small">' + escapeHtml(entry.insight) + '</p>' +
      (diagnosis.length ? '<div class="notice safe" style="margin-top:12px">' + diagnosis.map(function (item) { return escapeHtml(item); }).join('<br>') + '</div>' : '') +
      '<h3 style="margin-top:16px">Tiga langkah untuk ' + escapeHtml(entry.business) + '</h3>' + entry.actions.map(function (action, actionIndex) {
        return '<div class="task-row"><span class="badge neutral">' + (actionIndex + 1) + '</span><span class="task-copy"><strong>' + escapeHtml(action) + '</strong></span></div>';
      }).join("") +
      (guide ? '<p class="muted small"><strong>Buka buku fisik:</strong> Bab ' + guide.chapter + ' ' + escapeHtml(guide.title) + ', Strategi 1 - ' + escapeHtml(guide.strategy) + ', hlm. ' + escapeHtml(guide.pages) + '.</p>' : (entry.book ? '<p class="muted small"><strong>Bagian buku:</strong> ' + escapeHtml(entry.book) + '</p>' : '')) +
      (entry.reflection ? '<p class="notice safe" style="margin-top:12px"><strong>Refleksi AI:</strong> ' + escapeHtml(entry.reflection) + '</p>' : '') +
      (entry.warning ? '<p class="notice" style="margin-top:12px"><strong>Perhatian:</strong> ' + escapeHtml(entry.warning) + '</p>' : '') +
      (entry.escalate && !entry.warning ? '<p class="notice" style="margin-top:12px"><strong>Perlu pendamping:</strong> bahas angka, risiko, atau dokumen penting dengan pendamping sebelum mengambil keputusan.</p>' : '') +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">' + entry.tools.map(function (tool) {
        return '<button class="button compact secondary" data-recommendation="' + escapeHtml(tool) + '" data-entry="' + index + '" type="button">' + escapeHtml(TOOL_LABELS[tool]) + '</button>';
      }).join("") + (guide ? '<button class="button compact gold" data-book="' + escapeHtml(guide.id) + '" type="button">Buka Insight Buku</button>' : '') + (entry.workbookModule ? '<button class="button compact secondary" data-workbook="' + escapeHtml(entry.workbookModule) + '" type="button">Buka Workbook ' + escapeHtml(entry.domainName) + '</button>' : '') + '</div></div></article>';
  }

  function renderAssistant() {
    const history = state.consultations.slice().reverse();
    const ranked = rankCompletedDomains(state.answers);
    const workbook = workbookProgress();
    const book = bookProgress();
    const online = onlineMode();
    return '<section class="page"><h1 class="page-title">' + (online ? 'Konsultasi AI Panglima' : 'Asisten Strategi Panglima') + '</h1><p class="page-subtitle">' + (online ? 'AI online membaca konteks usaha Anda. Saat koneksi atau kuota tidak tersedia, panduan offline tetap dapat digunakan.' : 'Konsultasi otomatis berbasis panduan usaha. Sepenuhnya offline, tanpa API, tanpa biaya per pertanyaan.') + '</p>' +
      '<article class="card"><span class="badge green">' + (online ? 'AI online - sisa ' + state.online.remainingToday + '/' + state.online.dailyLimit + ' konsultasi hari ini' : 'Offline - Tanpa biaya tambahan') + '</span>' +
      (ranked[0] ? '<p class="small"><strong>Medan prioritas saat ini:</strong> ' + escapeHtml(ranked[0].domain.name) + ' (' + ranked[0].checklistScore + '/12).</p>' : '<p class="small muted">Lengkapi diagnosis agar rekomendasi semakin sesuai dengan kondisi usaha.</p>') +
      (workbook.answered ? '<p class="small"><strong>Workbook terisi:</strong> ' + workbook.answered + '/40 penilaian \u00B7 ' + workbook.completed + '/10 modul selesai.</p>' : '') +
      '<p class="small"><strong>Pendamping baca:</strong> ' + book.chapters + '/10 bab selesai. Setiap rekomendasi mengarahkan kembali ke buku fisik.</p>' +
      '<form id="consultation-form"><div class="field"><label for="consultation-question">Apa kendala usaha Anda?</label><textarea id="consultation-question" name="question" maxlength="600" required placeholder="Contoh: Omzet ramai, tetapi uang kas selalu habis. Apa yang harus saya periksa?"></textarea></div><p id="consultation-error" class="inline-message"></p><button class="button block" type="submit"' + (consultationPending ? ' disabled' : '') + '>' + (consultationPending ? 'AI sedang menyusun jawaban...' : online ? 'Konsultasi dengan AI Panglima' : 'Dapatkan Rekomendasi') + '</button></form></article>' +
      '<div class="section-heading"><h2>Contoh pertanyaan</h2></div>' + CONSULTATION_EXAMPLES.map(function (question, index) {
        return '<button class="tool-card" data-example="' + index + '" type="button"><strong>' + escapeHtml(question) + '</strong><span>Ketuk untuk melihat panduan yang sesuai.</span></button>';
      }).join("") +
      (history.length ? '<div class="section-heading"><h2>Riwayat konsultasi</h2><span class="badge neutral">' + history.length + '/20</span></div>' + history.map(renderConsultationEntry).join("") : '') +
      '<p class="notice"><strong>Catatan:</strong> ' + (online ? 'jawaban AI menggunakan konteks diagnosis usaha dan tetap perlu dipertimbangkan bersama pendamping.' : 'ini adalah asisten berbasis panduan yang sudah disiapkan, bukan layanan AI online.') + ' Hasil tidak menjanjikan omzet atau keuntungan tertentu.</p></section>';
  }

  function toolHeader(title, subtitle) {
    return '<section class="page"><button class="button compact secondary" data-tool="back" type="button">\u2190 Kembali</button><h1 class="page-title" style="margin-top:16px">' + escapeHtml(title) + '</h1><p class="page-subtitle">' + escapeHtml(subtitle) + '</p>';
  }

  function moneyField(name, label, value) {
    return '<div class="field"><label for="' + name + '">' + escapeHtml(label) + '</label><input id="' + name + '" name="' + name + '" type="number" inputmode="numeric" min="0" step="1" value="' + escapeHtml(value || '') + '" placeholder="0"></div>';
  }

  function renderSelectedTool() {
    if (activeTool === "margin") {
      return toolHeader("Kalkulator Margin", "Masukkan harga jual dan seluruh biaya per produk.") + '<article class="card"><form id="margin-form">' + moneyField("selling", "Harga jual", "") + moneyField("productCost", "HPP / biaya produk", "") + moneyField("operatingCost", "Biaya tambahan", "") + '<button class="button block" type="submit">Hitung Margin</button></form>' +
        (toolResult && toolResult.kind === "margin" ? '<div class="result-box"><span class="small">Keuntungan per produk</span><span class="value">' + signedRupiah(toolResult.value.profit) + '</span><span class="small">Margin: <strong>' + toolResult.value.margin.toFixed(1) + '%</strong> \u00B7 Total biaya: ' + rupiah(toolResult.value.cost) + '</span></div>' : '') + '</article></section>';
    }

    if (activeTool === "price") {
      return toolHeader("Harga Minimum Sehat", "Rumus: total biaya dibagi satu dikurangi margin target.") + '<article class="card"><form id="price-form">' + moneyField("productCost", "HPP / biaya produk", "") + moneyField("operatingCost", "Biaya tambahan", "") + '<div class="field"><label for="targetMargin">Target margin (%)</label><input id="targetMargin" name="targetMargin" type="number" inputmode="decimal" min="0" max="99.9" step="0.1" placeholder="Contoh: 30"></div><p id="price-error" class="inline-message"></p><button class="button block" type="submit">Hitung Harga Minimum</button></form>' +
        (toolResult && toolResult.kind === "price" ? '<div class="result-box"><span class="small">Harga minimum sehat</span><span class="value">' + rupiah(toolResult.value.minimumPrice) + '</span><span class="small">Total biaya: ' + rupiah(toolResult.value.cost) + ' \u00B7 Target margin: ' + toolResult.value.targetMargin + '%</span></div>' : '') + '</article></section>';
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

  function renderCertificateCard(eligibility) {
    const certificate = state.certificate || {};
    let message = "Lengkapi diagnosis dan minimal 80% misi. Sertifikat resmi tetap diterbitkan setelah verifikasi pendamping.";
    let label = "Belum memenuhi syarat";
    let tone = "yellow";
    if (eligibility.eligible) {
      label = "Siap diverifikasi";
      tone = "green";
      message = "Syarat internal terpenuhi. Data penyelesaian akan dikirim otomatis dan tetap diperiksa pendamping.";
    }
    if (certificate.status === "pending") {
      label = "Menunggu verifikasi";
      message = "Tanggal penyelesaian " + (certificate.completionDate || "-") + " sudah tercatat. Pendamping akan memeriksa sebelum Certifier menerbitkan sertifikat.";
    } else if (certificate.status === "verified") {
      label = certificate.url ? "Sertifikat tersedia" : "Terverifikasi";
      message = certificate.url
        ? "Sertifikat resmi sudah tersedia dan dapat diunduh."
        : "Penyelesaian sudah diverifikasi" + (certificate.completionDate ? " dengan tanggal " + certificate.completionDate : "") + ". Periksa kembali sampai Certifier selesai menerbitkan.";
    } else if (certificate.status === "rejected") {
      label = "Perlu perbaikan";
      tone = "yellow";
      message = "Pendamping meminta perbaikan sebelum sertifikat diterbitkan.";
    }
    return '<article class="card"><h2>Status sertifikat</h2><p class="small muted">' + escapeHtml(message) + '</p>' +
      '<span class="badge ' + tone + '">' + escapeHtml(label) + '</span>' +
      (certificate.error ? '<p class="inline-message">' + escapeHtml(certificate.error) + '</p>' : '') +
      (onlineMode() && certificate.status === "verified" ? '<button class="button secondary block" data-action="download-certificate" type="button"' + (certificateLookupPending ? ' disabled' : '') + '>' +
        (certificateLookupPending ? 'Mencari sertifikat...' : (certificate.url ? 'Unduh Sertifikat' : 'Periksa & Unduh Sertifikat')) + '</button>' : '') +
      (onlineMode() && eligibility.eligible && certificate.status !== "verified" ? '<button class="button secondary block" data-action="sync-certificate" type="button"' + (completionPending ? ' disabled' : '') + '>' +
        (completionPending ? 'Menyinkronkan...' : (certificate.status ? 'Periksa Status' : 'Kirim untuk Verifikasi')) + '</button>' : '') +
      '</article>';
  }

  function renderAccount() {
    const progress = actionProgress();
    const diagnosis = diagnosisProgress();
    const workbook = workbookProgress();
    const book = bookProgress();
    const eligibility = certificateEligibility();
    return '<section class="page"><h1 class="page-title">Akun Pembeli</h1><p class="page-subtitle">Profil dan progres aplikasi tersimpan lokal di perangkat ini.</p>' +
      '<article class="card"><div class="eyebrow muted">Profil usaha</div><h2 style="margin-top:8px">' + escapeHtml(state.profile.business) + '</h2><p class="small muted">' + escapeHtml(state.profile.owner) + ' \u00B7 ' + escapeHtml(state.profile.type || "Jenis usaha belum tersedia") + '</p>' +
      (onlineMode() ? '<p class="small muted">' + (state.online.profileSource === 'pretest' ? 'Profil PRE-TEST terkunci dan tidak dapat diubah.' : 'Identitas peserta resmi terkunci dan tidak dapat diubah.') + '</p>' : '') +
      '<span class="badge green">' + (onlineMode() ? (state.online.deviceBound ? 'Aktif - terkunci pada perangkat ini' : 'Aktif - AI Panglima online') : 'Aktif - Mode demo SAFE') + '</span>' +
      (state.online.moduleCode ? '<p class="small" style="margin-top:12px"><strong>Varian aktif:</strong> ' + escapeHtml(state.online.moduleTitle) + '</p><button class="button secondary block" data-action="open-specialist-module" type="button">Buka Modul</button>' : '') + '</article>' +
      '<article class="card"><h2>Laporan perkembangan</h2><p class="small muted">Diagnosis ' + diagnosis.answered + '/' + diagnosis.total + ' \u00B7 Buku ' + book.chapters + '/10 bab \u00B7 Workbook ' + workbook.answered + '/40 \u00B7 Aksi selesai ' + progress.completed + '/' + progress.total + '</p><button class="button block" data-action="share-report" type="button">Bagikan Laporan</button></article>' +
      renderCertificateCard(eligibility) +
      '<article class="card"><h2>Pengingat Action Plan</h2><p class="small muted">Notifikasi harian pukul 09.00 untuk mengerjakan Action Plan.</p><label class="check-row"><input type="checkbox" data-action-plan-reminder' + (state.settings.actionPlanReminder ? ' checked' : '') + '><span class="task-copy"><strong>Notifikasi pengingat</strong><span>Dapat diaktifkan atau dinonaktifkan kapan saja.</span></span><span class="badge ' + (state.settings.actionPlanReminder ? 'green' : 'neutral') + '">' + (state.settings.actionPlanReminder ? 'ON' : 'OFF') + '</span></label></article>' +
      '<article class="card"><h2>Tentang aplikasi</h2><p class="small muted">Versi ' + escapeHtml(appVersion()) + '</p><button class="button secondary block" data-action="website" type="button">Buka Website Resmi</button></article>' +
      '<article class="card"><h2>Keluar dari aplikasi</h2><p class="small muted">Mengakhiri sesi pada perangkat ini. Workbook dan progres lokal tetap tersimpan.</p><button class="button secondary block" data-action="logout" type="button">Keluar / Logout</button></article>' +
      '<article class="card"><h2>Reset data lokal</h2><p class="small muted">Menghapus sesi, profil, progres, jawaban workbook, dan catatan modul dari perangkat ini. Akun dan data PRE-TEST pada server tetap tersedia.</p><button class="button secondary block" data-action="reset" type="button">Reset Aplikasi</button></article></section>';
  }

  function appVersion() {
    if (window.PanglimaAndroid && typeof window.PanglimaAndroid.appVersion === "function") {
      try { return String(window.PanglimaAndroid.appVersion() || ""); } catch (_) {}
    }
    return String(CONFIG.appVersion || "tidak tersedia");
  }

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    if (!state.activated) {
      app.innerHTML = renderActivation();
      return;
    }
    if (state.online.moduleCode && (currentView === "workbook" || currentView === "actions")) currentView = "home";

    const pages = { home: renderHome, diagnosis: renderDiagnosis, book: renderBook, workbook: renderWorkbook, actions: renderActions, tools: renderTools, assistant: renderAssistant, account: renderAccount };
    const page = OWN.call(pages, currentView) ? pages[currentView]() : renderHome();
    app.innerHTML = '<div class="shell">' + page + renderNav() + '</div>';
  }

  function navigate(view) {
    if (view === "workbook" && state.online.moduleCode) {
      openSpecialistModule();
      return;
    }
    if (view === "actions" && state.online.moduleCode) {
      openSpecialistModule("actions");
      return;
    }
    currentView = view;
    if (view !== "tools") {
      activeTool = "";
      toolResult = null;
    }
    render();
    if (view === "account") syncActionPlanReminder(true);
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
  }

  function formValue(form, name) {
    const field = form.elements.namedItem(name);
    return field ? String(field.value || "").trim() : "";
  }

  function activateOnline(code) {
    const accessCode = String(code || "").trim().toUpperCase();
    const errorElement = document.getElementById("activation-error");

    if (!/^[A-Z0-9-]{10,64}$/.test(accessCode)) {
      if (errorElement) errorElement.textContent = "Kode akses peserta belum sesuai.";
      return false;
    }
    if (activationPending) return false;

    activationPending = true;
    render();
    requestApi("/v1/activate", { accessCode: accessCode }).then(function (result) {
      activationPending = false;
      const participant = result.participant || {};
      const sessionToken = String(result.sessionToken || "").slice(0, 2048);
      const owner = String(participant.owner || "").trim().slice(0, 80);
      const business = String(participant.business || "").trim().slice(0, 100);
      const activatedModuleCode = validModuleCode(participant.module && participant.module.code);
      if (!sessionToken || !owner || !business) {
        render();
        const invalidSession = document.getElementById("activation-error");
        if (invalidSession) invalidSession.textContent = "Profil resmi peserta belum tersedia. Hubungi pendamping.";
        return;
      }

      state.profile = {
        owner: owner,
        business: business,
        type: String(participant.type || "").trim().slice(0, 80),
        goal: state.profile.goal || ""
      };
      state.online = {
        sessionToken: sessionToken,
        dailyLimit: Math.max(0, Number(participant.dailyLimit) || 0),
        remainingToday: Math.max(0, Number(participant.remainingToday) || 0),
        profileSource: String(participant.profileSource || "registered").slice(0, 40),
        deviceBound: participant.deviceBound === true,
        moduleCode: activatedModuleCode,
        moduleTitle: activatedModuleCode ? MODULE_TITLES[activatedModuleCode] : ""
      };
      state.activated = true;
      persist();
      navigate("home");
      if (activatedModuleCode) {
        toast(state.online.moduleTitle + " aktif untuk perangkat ini.");
        window.setTimeout(openSpecialistModule, 350);
      } else {
        toast("Akses peserta aktif. Konsultasi AI Panglima siap digunakan.");
      }
    }, function (error) {
      activationPending = false;
      render();
      const activationError = document.getElementById("activation-error");
      if (activationError) activationError.textContent = error.message;
    });
    return true;
  }

  function requestTokenByEmail(rawEmail) {
    const email = String(rawEmail || "").trim().toLowerCase();
    const messageElement = document.getElementById("token-request-message");
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      tokenRequestMessage = "";
      if (messageElement) messageElement.textContent = "Masukkan email pembelian yang valid.";
      return false;
    }
    if (tokenRequestPending) return false;

    tokenRequestPending = true;
    tokenRequestMessage = "";
    render();
    requestApi("/v1/onboarding/request-token", { email: email }).then(function (result) {
      tokenRequestPending = false;
      tokenRequestMessage = String(result.message ||
        "Jika data cocok, token akan dikirim ke email maksimal 5 menit.").slice(0, 300);
      render();
      toast("Permintaan token diterima. Periksa email Anda.");
    }, function (error) {
      tokenRequestPending = false;
      tokenRequestMessage = "";
      render();
      const errorElement = document.getElementById("token-request-message");
      if (errorElement) errorElement.textContent = error.message;
    });
    return true;
  }

  function handleSubmit(event) {
    const form = event.target;
    if (!form || !form.id) return;
    event.preventDefault();

    if (form.id === "activation-form") {
      const code = formValue(form, "activationCode");
      if (onlineMode()) {
        activateOnline(code);
        return;
      }
      const owner = formValue(form, "owner");
      const business = formValue(form, "business");
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

    if (form.id === "token-request-form") {
      requestTokenByEmail(formValue(form, "email"));
      return;
    }

    if (form.id === "consultation-form") {
      addConsultation(formValue(form, "question"));
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
    const target = event.target.closest("[data-view], [data-tool], [data-answer], [data-action], [data-example], [data-recommendation], [data-book], [data-workbook], [data-workbook-score], [data-workbook-priority], [data-workbook-week]");
    if (!target) return;

    if (target.dataset.view) {
      if (target.dataset.view === "workbook") {
        activeWorkbookSection = "overview";
        activeWorkbookModule = "";
      }
      navigate(target.dataset.view);
      return;
    }

    if (OWN.call(target.dataset, "book")) {
      const id = target.dataset.book;
      if (id === "overview") {
        activeBookGuide = "";
      } else if (bookGuideById(id)) {
        activeBookGuide = id;
      } else {
        return;
      }
      currentView = "book";
      activeTool = "";
      toolResult = null;
      render();
      if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
      return;
    }

    if (OWN.call(target.dataset, "workbook")) {
      if (state.online.moduleCode) {
        openSpecialistModule();
        return;
      }
      const section = target.dataset.workbook;
      const module = WORKBOOK_MODULES.find(function (item) { return item.id === section; });
      const allowed = ["overview", "canvas", "priorities", "roadmap", "action30", "reviews", "audit", "declaration"];
      if (!module && allowed.indexOf(section) === -1) return;
      activeWorkbookSection = module ? "module" : section;
      activeWorkbookModule = module ? module.id : "";
      if (section === "action30") activeWorkbookWeek = 1;
      currentView = "workbook";
      activeTool = "";
      toolResult = null;
      render();
      if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
      return;
    }

    if (OWN.call(target.dataset, "workbookScore")) {
      const key = target.dataset.workbookScore;
      const value = Number(target.dataset.value);
      const valid = WORKBOOK_MODULES.some(function (module) {
        return module.questions.some(function (_, index) { return key === module.id + "-" + index; });
      });
      if (!valid || !Number.isInteger(value) || value < 1 || value > 5) return;
      state.workbook.scores[key] = value;
      persist();
      render();
      return;
    }

    if (OWN.call(target.dataset, "workbookPriority")) {
      const id = target.dataset.workbookPriority;
      if (!WORKBOOK_MODULES.some(function (module) { return module.id === id; })) return;
      const index = state.workbook.priorities.indexOf(id);
      if (index >= 0) {
        state.workbook.priorities.splice(index, 1);
      } else {
        if (state.workbook.priorities.length >= 3) {
          toast("Pilih maksimal tiga prioritas agar fokus usaha tidak terpecah.");
          return;
        }
        state.workbook.priorities.push(id);
      }
      persist();
      render();
      return;
    }

    if (OWN.call(target.dataset, "workbookWeek")) {
      const week = Number(target.dataset.workbookWeek);
      if (!Number.isInteger(week) || week < 1 || week > 4) return;
      activeWorkbookWeek = week;
      render();
      if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
      return;
    }

    if (OWN.call(target.dataset, "example")) {
      const question = CONSULTATION_EXAMPLES[Number(target.dataset.example)];
      if (question) addConsultation(question);
      return;
    }

    if (OWN.call(target.dataset, "recommendation")) {
      const destination = target.dataset.recommendation;
      if (destination === "diagnosis" || destination === "actions" || destination === "workbook") {
        if (destination === "workbook") activeWorkbookSection = "overview";
        navigate(destination);
        return;
      }
      if (OWN.call(TOOL_LABELS, destination)) {
        currentView = "tools";
        activeTool = destination;
        toolResult = null;
        render();
        if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
      }
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
      syncCertificateCompletion(true, false);
      return;
    }

    if (target.dataset.action === "open-specialist-module") {
      openSpecialistModule();
      return;
    }

    if (target.dataset.action === "share-report") {
      shareText(reportText());
      return;
    }

    if (target.dataset.action === "sync-certificate") {
      syncCertificateCompletion(false, true);
      return;
    }

    if (target.dataset.action === "download-certificate") {
      openCertificate();
      return;
    }

    if (target.dataset.action === "logout") {
      if (!window.confirm("Keluar dari aplikasi? Workbook dan progres lokal tetap tersimpan.")) return;
      cancelPendingApiRequests();
      state.activated = false;
      state.online.sessionToken = "";
      state.online.moduleCode = "";
      state.online.moduleTitle = "";
      currentView = "home";
      activeTool = "";
      persist();
      render();
      toast("Anda telah keluar. Workbook dan progres tetap tersimpan.");
      return;
    }

    if (target.dataset.action === "website") {
      openUrl(CONFIG.websiteUrl);
      return;
    }

    if (target.dataset.action === "open-pretest") {
      openUrl(CONFIG.pretestUrl);
      return;
    }

    if (target.dataset.action === "reset") {
      if (!window.confirm("Hapus seluruh data aplikasi dan modul yang tersimpan di perangkat ini? Data PRE-TEST pada server tidak dihapus.")) return;
      if (window.PanglimaAndroid && typeof window.PanglimaAndroid.resetLocalData === "function") {
        try {
          if (window.PanglimaAndroid.resetLocalData() !== true) {
            toast("Reset belum selesai. Coba lagi.");
            return;
          }
        } catch (_) {
          toast("Reset belum selesai. Coba lagi.");
          return;
        }
      }
      cancelPendingApiRequests();
      window.localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      state.settings.actionPlanReminder = false;
      currentView = "home";
      activeTool = "";
      activeWorkbookSection = "overview";
      activeWorkbookModule = "";
      activeWorkbookWeek = 1;
      activeBookGuide = "";
      toolResult = null;
      syncActionPlanReminder(false);
      render();
      toast("Data lokal, termasuk jawaban modul, telah dihapus.");
      return;
    }
  }

  function handleChange(event) {
    const target = event.target;
    if (OWN.call(target.dataset, "actionPlanReminder")) {
      state.settings.actionPlanReminder = target.checked === true;
      persist();
      syncActionPlanReminder(true);
      render();
      toast(state.settings.actionPlanReminder ? "Pengingat Action Plan aktif." : "Pengingat Action Plan nonaktif.");
      return;
    }

    if (OWN.call(target.dataset, "bookReflection")) {
      const key = String(target.dataset.bookReflection || "");
      const valid = BOOK_GUIDES.some(function (guide) {
        return guide.prompts.some(function (_, index) { return key === guide.id + "-" + index; });
      });
      if (!valid) return;
      state.book.reflections[key] = String(target.value || "").trim().slice(0, 1200);
      persist();
      return;
    }

    if (OWN.call(target.dataset, "bookCheck")) {
      const key = String(target.dataset.bookCheck || "");
      const valid = BOOK_GUIDES.some(function (guide) {
        const stepTotal = BOOK_READING_STEPS.length + guide.checklist.length;
        for (let index = 0; index < stepTotal; index += 1) {
          if (key === guide.id + "-" + index) return true;
        }
        return false;
      });
      if (!valid) return;
      state.book.checks[key] = target.checked === true;
      persist();
      render();
      return;
    }

    if (OWN.call(target.dataset, "workbookField")) {
      const key = String(target.dataset.workbookField || "");
      if (!/^[a-z0-9-]+$/.test(key)) return;
      state.workbook.fields[key] = String(target.value || "").trim().slice(0, 1500);
      persist();
      if (/^audit-(start|final)-/.test(key)) render();
      return;
    }

    if (target.dataset.task) {
      state.tasks[target.dataset.task] = target.checked === true;
      persist();
      render();
      syncCertificateCompletion(true, false);
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
    if (currentView === "book" && activeBookGuide) {
      activeBookGuide = "";
      render();
      return true;
    }
    if (currentView === "workbook" && activeWorkbookSection !== "overview") {
      activeWorkbookSection = "overview";
      activeWorkbookModule = "";
      render();
      return true;
    }
    if (currentView !== "home") {
      navigate("home");
      return true;
    }
    return false;
  };

  window.panglimaOpenConsultation = function (question) {
    if (!state.activated || !state.online.moduleCode) return;
    navigate("assistant");
    const field = document.getElementById("consultation-question");
    if (field) {
      field.value = String(question || "").slice(0, 600);
      field.focus();
    }
  };

  window.panglimaOpenBookChapter = function (chapter) {
    if (!state.activated || !state.online.moduleCode || !Number.isInteger(chapter) ||
        chapter < 0 || chapter >= BOOK_GUIDES.length) return;
    activeBookGuide = BOOK_GUIDES[chapter].id;
    navigate("book");
  };

  window.PANGLIMA_TEST_API = Object.freeze({
    domains: DOMAINS,
    bookGuides: BOOK_GUIDES,
    bookReadingSteps: BOOK_READING_STEPS,
    workbookModules: WORKBOOK_MODULES,
    workbookScale: WORKBOOK_SCALE,
    tasks: TASKS,
    leaks: LEAKS,
    consultationScenarios: CONSULTATION_SCENARIOS,
    consultationExamples: CONSULTATION_EXAMPLES,
    classifyScore: classifyScore,
    classifyChecklistScore: classifyChecklistScore,
    scoreDomain: scoreDomain,
    scoreWorkbookModule: scoreWorkbookModule,
    workbookProgress: workbookProgress,
    bookProgress: bookProgress,
    recommendedBookGuide: recommendedBookGuide,
    selectedWorkbookPriorities: selectedWorkbookPriorities,
    rankCompletedDomains: rankCompletedDomains,
    calculateMargin: calculateMargin,
    calculateMinimumPrice: calculateMinimumPrice,
    summarizeCashflow: summarizeCashflow,
    normalizeConsultation: normalizeConsultation,
    findConsultationScenario: findConsultationScenario,
    buildConsultation: buildConsultation,
    escapeHtml: escapeHtml,
    defaultState: defaultState
  });

  function init() {
    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
    document.addEventListener("submit", handleSubmit);
    syncActionPlanReminder(false);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}());
