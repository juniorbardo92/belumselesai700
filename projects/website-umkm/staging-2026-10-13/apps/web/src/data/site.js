import { PROFESSION_IMG_HQ_1 } from '@/components/ui/aspect-ratio';
import { PROFESSION_IMG_HQ_2 } from '@/components/ui/skeleton';
import { PROFESSION_IMG_HQ_3 } from '@/components/ui/spinner';
import { PROFESSION_IMG_HQ_4 } from '@/components/ui/separator';
import { ARTICLE_IMG_CHUNK_1 } from '@/components/CountUp';
import { ARTICLE_IMG_CHUNK_2 } from '@/components/Reveal';
import { ARTICLE_IMG_CHUNK_3 } from '@/components/Seo';
import { ARTICLE_IMG_CHUNK_4 } from '@/hooks/use-mobile';
import { ARTICLE_IMG_CHUNK_5 } from '@/hooks/use-toast';
import { ARTICLE_IMG_CHUNK_6 } from '@/components/ScrollToTop';
import { ARTICLE_IMG_CHUNK_7 } from '@/components/Countdown';
import { ARTICLE_IMG_CHUNK_8 } from '@/components/PromoPopup';
import { PROFESSION_ARTICLE_IMAGES_A } from '@/lib/format';
import { PROFESSION_ARTICLE_IMAGES_B } from '@/lib/utils';
const PROFESSION_ARTICLE_IMAGES = { ...PROFESSION_ARTICLE_IMAGES_A, ...PROFESSION_ARTICLE_IMAGES_B };

export const SITE = {
  name: 'UMKM Naik Kelas',
  url: 'https://umkmnaikkelas.id',
  tagline: 'Jangan Berbisnis Tanpa Peta',
  email: '',
  whatsapp: '6282234051276',
  location: 'Indonesia',
  author: 'W. Gunawan',
  authorRole: 'Certified BNSP Pendamping UMKM',
};

// Ubah tanggal di sini saja untuk mengatur countdown promo (format ISO).
export const PROMO = {
  active: false,
  title: 'Promo Merdeka 81%',
  message: 'Paket Strategi Private dari Rp999.000 menjadi Rp199.000. Terbatas untuk 8 orang sampai 8 Agustus 2026.',
  deadline: '2026-08-08T23:59:59+07:00',
  ctaLabel: 'Ambil Promo Private',
  ctaUrl: 'https://lynk.id/wgunawan168/13xroeodllel',
};

export const PRODUCTS = [
  {
    id: 'buku',
    name: 'Buku 100 Strategi Sun Tzu: UMKM Naik Kelas – New Edition',
    short: 'Belajar mandiri',
    price: 'Rp168.000',
    note: 'Belum termasuk ongkir',
    url: 'https://lynk.id/wgunawan168/x4wnrp41mz10',
    highlight: true,
    desc: 'Buku fisik 500+ halaman untuk membaca medan bisnis dan menerjemahkan strategi menjadi tindakan yang lebih terarah.',
    features: [
      'Buku fisik New Edition 500+ halaman',
      'Workbook dan checklist implementasi',
      'Refleksi serta latihan praktis',
      'Pembahasan 10 bidang penting UMKM',
    ],
  },
  {
    id: 'strategi',
    name: 'Paket Strategi',
    short: 'Buku + kelas pemetaan',
    oldPrice: 'Rp249.000',
    price: 'Rp199.000',
    note: 'Belum termasuk ongkir',
    url: 'https://lynk.id/wgunawan168/zdkx923vk735',
    desc: 'Untuk pemilik usaha yang ingin memetakan kondisi 10 bidang dan menyusun Action Plan 30 Hari.',
    features: [
      'Seluruh manfaat Paket Buku',
      '1 kelas Zoom selama 2 jam',
      'Bedah Business Health Check 10 Medan',
      'Template Action Plan 30 Hari',
      'Rekaman dan grup pendampingan 7 hari',
    ],
  },
  {
    id: 'panglima',
    name: 'Paket Panglima UMKM 30 Hari',
    short: 'Bundling pendampingan utama',
    oldPrice: 'Rp449.000',
    price: 'Rp349.000',
    note: 'Belum termasuk ongkir',
    url: 'https://go.umkmnaikkelas.id/go/kas-umkm-lynk',
    popular: true,
    desc: 'Program utama untuk bergerak dari diagnosis menuju eksekusi dan evaluasi selama 30 hari.',
    features: [
      'Buku New Edition',
      'Business Health Check 10 Medan',
      '4 sesi Zoom @90 menit',
      'Pendampingan WhatsApp 30 hari',
      'Review tugas mingguan',
      'KPI dan Action Plan 30 Hari',
      'Rekaman, sertifikat, dan 1 hot seat',
    ],
  },
  {
    id: 'private',
    name: 'Paket Strategi Private',
    short: 'Pendampingan personal',
    oldPrice: 'Rp999.000',
    price: 'Rp799.000',
    note: 'Belum termasuk ongkir',
    url: 'https://lynk.id/wgunawan168/13xroeodllel',
    promo: true,
    desc: 'Pendampingan personal untuk meninjau bidang prioritas dan menyusun rencana 30–60–90 hari.',
    features: [
      'Seluruh manfaat Paket Panglima',
      '2 konsultasi privat @120 menit',
      'Audit sederhana usaha',
      'Review 4 bidang prioritas',
      'Rencana personal 30–60–90 hari',
      'WhatsApp personal 30 hari',
    ],
  },
];

export const MEDAN = [
  { n: '01', title: 'Pemasaran', desc: 'Membaca pasar, pesan, target, kanal, dan biaya mendapatkan perhatian pelanggan.' },
  { n: '02', title: 'Penjualan', desc: 'Mengubah perhatian menjadi transaksi melalui penawaran dan proses closing yang lebih jelas.' },
  { n: '03', title: 'Operasional', desc: 'Merapikan proses kerja agar masalah yang sama tidak terus berulang.' },
  { n: '04', title: 'Keuangan', desc: 'Memahami margin, arus kas, biaya, dan batas aman keputusan bisnis.' },
  { n: '05', title: 'Tim / SDM', desc: 'Menetapkan peran, tanggung jawab, ukuran kinerja, dan ritme evaluasi.' },
  { n: '06', title: 'Digital', desc: 'Memilih kanal digital dan data yang benar-benar membantu tujuan usaha.' },
  { n: '07', title: 'Produksi', desc: 'Menjaga mutu, kapasitas, waktu, dan biaya produksi secara konsisten.' },
  { n: '08', title: 'Distribusi', desc: 'Mengelola stok, pengemasan, pengiriman, dan mitra distribusi.' },
  { n: '09', title: 'Negosiasi', desc: 'Membangun posisi tawar yang sehat dengan pelanggan, supplier, dan mitra.' },
  { n: '10', title: 'Ekspansi', desc: 'Menilai kesiapan bertumbuh sebelum menambah pasar, produk, atau cabang.' },
];

export const PROBLEMS = [
  { title: 'Promosi berjalan, respons rendah', desc: 'Konten dan iklan terus dibuat, tetapi calon pelanggan belum melihat alasan kuat untuk membeli.' },
  { title: 'Keputusan hanya memakai intuisi', desc: 'Prioritas berubah-ubah karena usaha belum dipetakan menggunakan data dan diagnosis yang sama.' },
  { title: 'Semua masalah terasa mendesak', desc: 'Owner sibuk memadamkan masalah harian dan sulit memilih satu fokus perbaikan.' },
  { title: 'Belajar banyak, eksekusi tersendat', desc: 'Materi sudah dikumpulkan, tetapi belum diterjemahkan menjadi PIC, jadwal, KPI, dan review.' },
  { title: 'Terjebak perang harga', desc: 'Penjualan mungkin ramai, tetapi margin dan kas terus tertekan karena pembeda belum kuat.' },
  { title: 'Bisnis bergantung pada owner', desc: 'Keputusan dan pekerjaan menumpuk pada satu orang karena sistem belum dirapikan.' },
];

export const TESTIMONIALS = [
  {
    name: 'Peserta 01',
    biz: 'Dokumentasi WhatsApp disamarkan',
    text: 'Peserta menyebut kesempatan mendapat pendampingan langsung sebagai pengalaman yang membuatnya lebih bersemangat untuk belajar dan bergerak.',
  },
  {
    name: 'Peserta 02',
    biz: 'Dokumentasi WhatsApp disamarkan',
    text: 'Pendampingan mendorong peserta untuk membongkar ulang strategi yang sudah berjalan dan melihat bagian yang perlu diperbaiki.',
  },
  {
    name: 'Peserta 03',
    biz: 'Dokumentasi WhatsApp disamarkan',
    text: 'Peserta mulai menyiapkan roadmap, mengumpulkan pertanyaan, dan membawa hasil kerja untuk dibahas dalam sesi konsultasi.',
  },
  {
    name: 'Peserta 04',
    biz: 'Dokumentasi WhatsApp disamarkan',
    text: 'Materi digunakan untuk merapikan respons kepada pelanggan agar lebih cepat, profesional, dan terarah.',
  },
  {
    name: 'Peserta 05',
    biz: 'Dokumentasi WhatsApp disamarkan',
    text: 'Peserta menguji analisis SWOT saat bazar untuk membaca kekuatan, persaingan, dan peluang penjualan secara lebih sadar.',
  },
];

export const THREADS_PROOF = {
  handle: 'Threads UMKM',
  verified: true,
  views: 788,
  ageHours: 17,
  image: 'https://loyal-upgrade-sun-tzu-umkm.juniorbardo92.chatgpt.site/assets/threads-views-788.jpeg',
  note: 'Salah satu thread edukasi praktis tentang UMKM memperoleh 788 views saat tangkapan layar dibuat.',
};

export const FAQS = [
  {
    q: 'Apakah buku sudah termasuk dalam paket pendampingan?',
    a: 'Ya. Paket Strategi, Paket Panglima UMKM 30 Hari, dan Paket Strategi Private sudah mencakup buku fisik New Edition. Ongkos kirim dihitung berdasarkan alamat penerima.',
  },
  {
    q: 'Apa perbedaan New Edition dengan edisi sebelumnya?',
    a: 'New Edition berisi lebih dari 500 halaman, pembahasan 10 bidang penting UMKM, serta alat bantu implementasi seperti workbook, checklist, Business Health Check, dan rencana aksi.',
  },
  {
    q: 'Apakah cocok untuk UMKM yang baru mulai?',
    a: 'Ya. Buku dapat digunakan untuk belajar mandiri, sedangkan paket pendampingan membantu pemilik usaha yang ingin memetakan masalah dan memilih langkah yang lebih terarah.',
  },
  {
    q: 'Mengapa Paket Panglima paling direkomendasikan?',
    a: 'Karena peserta tidak hanya menerima buku, tetapi juga diagnosis usaha, empat sesi kelas, review mingguan, pendampingan WhatsApp, KPI sederhana, dan Action Plan 30 Hari.',
  },
  {
    q: 'Apakah program menjamin omzet meningkat?',
    a: 'Tidak. Program tidak menjanjikan hasil instan. Peserta dibantu membaca kondisi usaha, menentukan masalah prioritas, dan menjalankan perbaikan yang lebih terarah.',
  },
  {
    q: 'Bagaimana proses pembelian dan pengiriman?',
    a: 'Pilih paket lalu selesaikan pemesanan melalui halaman checkout Lynk.id. Untuk pertanyaan mengenai alamat, ongkir, pembayaran, jadwal kelas, atau pendampingan, hubungi tim melalui WhatsApp.',
  },
];

export const ARTICLE_FAQS = [
  {
    q: 'Apakah UMKM masih boleh memberi diskon sesekali?',
    a: 'Boleh. Diskon dapat digunakan untuk tujuan yang jelas, misalnya menghabiskan stok tertentu atau menjalankan kampanye terbatas. Yang berbahaya adalah menjadikannya satu-satunya alasan pelanggan membeli tanpa menghitung batas aman margin.',
  },
  {
    q: 'Bagaimana cara bersaing dengan toko e-commerce bermodal besar?',
    a: 'Hindari bertarung hanya pada harga. Pilih ceruk yang lebih spesifik, perjelas manfaat, berikan layanan yang sulit disalin, dan bangun alasan membeli yang relevan bagi target pelanggan.',
  },
  {
    q: 'Apa langkah pertama jika kas sudah menipis akibat perang harga?',
    a: 'Hentikan promo yang tidak terukur, hitung kewajiban jangka pendek, periksa margin setiap produk, dan tentukan batas harga terendah yang masih aman. Setelah itu, pilih stok serta aktivitas yang perlu dipertahankan, diperbaiki, atau dihentikan.',
  },
];

// Featured image artikel disimpan sebagai static asset agar source code tetap ringan.


const ARTICLE_FEATURE_IMAGES_HQ = {
  ...ARTICLE_IMG_CHUNK_1,
  ...ARTICLE_IMG_CHUNK_2,
  ...ARTICLE_IMG_CHUNK_3,
  ...ARTICLE_IMG_CHUNK_4,
  ...ARTICLE_IMG_CHUNK_5,
  ...ARTICLE_IMG_CHUNK_6,
  ...ARTICLE_IMG_CHUNK_7,
  ...ARTICLE_IMG_CHUNK_8,
};

// Compatibility export for ArticlePages version that still imports HQ_A.
export const ARTICLE_FEATURE_IMAGES_HQ_A = ARTICLE_FEATURE_IMAGES_HQ;


const PROFESSION_FEATURE_IMAGES_HQ = {
  ...PROFESSION_IMG_HQ_1,
  ...PROFESSION_IMG_HQ_2,
  ...PROFESSION_IMG_HQ_3,
  ...PROFESSION_IMG_HQ_4,
};

export const ARTICLES = [
{
  "slug": "cara-mendapatkan-listing-properti-eksklusif",
  "sourceSlug": "cara-mendapatkan-listing-properti-eksklusif",
  "title": "Cara Mendapatkan Listing Properti Eksklusif Tanpa Perang Fee",
  "metaTitle": "Cara Mendapatkan Listing Properti Eksklusif Tanpa Perang Fee",
  "description": "Pelajari cara agen properti mendapatkan listing eksklusif dengan diagnosis kebutuhan pemilik, positioning, bukti kerja, dan sistem follow-up tanpa perang fee.",
  "excerpt": "Listing eksklusif tidak datang hanya karena agen paling murah. Pemilik properti memilih agen yang memberi kepastian proses, komunikasi jelas, dan strategi pemasaran yang masuk akal.",
  "category": "Agen Properti",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['cara-mendapatkan-listing-properti-eksklusif'],
  "imageAlt": "Agen properti berdiskusi dengan pemilik properti mengenai strategi pemasaran dan listing eksklusif.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "cara-prospecting-agen-asuransi-tanpa-spam",
  "sourceSlug": "cara-prospecting-agen-asuransi-tanpa-spam",
  "title": "Cara Prospecting Agen Asuransi Tanpa Spam dan Tanpa Memaksa",
  "metaTitle": "Cara Prospecting Agen Asuransi Tanpa Spam dan Tanpa Memaksa",
  "description": "Pelajari prospecting agen asuransi tanpa spam: segmentasi, pemicu kebutuhan, konten edukasi, dan follow-up yang membangun kepercayaan.",
  "excerpt": "Prospecting asuransi tidak harus dimulai dengan menawarkan polis. Pendekatan yang lebih kuat dimulai dari memahami risiko, tahap hidup, dan kebutuhan calon nasabah.",
  "category": "Agen Asuransi",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['cara-prospecting-agen-asuransi-tanpa-spam'],
  "imageAlt": "Agen asuransi membuka percakapan kebutuhan dengan calon nasabah secara konsultatif.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "prospecting-direct-selling-tanpa-spam",
  "sourceSlug": "prospecting-direct-selling-tanpa-spam",
  "title": "Prospecting Direct Selling Tanpa Spam: Cara Membuka Percakapan yang Sehat",
  "metaTitle": "Prospecting Direct Selling Tanpa Spam: Cara Membuka Percakapan yang Sehat",
  "description": "Pelajari prospecting direct selling tanpa spam dengan segmentasi, izin, edukasi, dan follow-up yang relevan agar hubungan tidak rusak karena hard selling.",
  "excerpt": "Prospecting direct selling yang efektif tidak dimulai dari copy-paste pesan ke semua kontak. Pendekatan yang sehat dimulai dari relevansi, izin, dan kebutuhan.",
  "category": "MLM / Direct Selling",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['prospecting-direct-selling-tanpa-spam'],
  "imageAlt": "Mitra direct selling membuka percakapan prospecting secara personal tanpa spam.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "follow-up-leads-properti-tanpa-terlihat-memaksa",
  "sourceSlug": "follow-up-leads-properti-tanpa-terlihat-memaksa",
  "title": "Follow-Up Leads Properti Tanpa Terlihat Memaksa",
  "metaTitle": "Follow-Up Leads Properti Tanpa Terlihat Memaksa",
  "description": "Panduan follow-up leads properti agar tidak ghosting: segmentasi prospek, timing, pertanyaan diagnosis, dan sistem tindak lanjut yang profesional.",
  "excerpt": "Masalah agen properti bukan selalu kurang leads. Sering kali leads sudah ada, tetapi follow-up tidak terstruktur sehingga prospek hilang sebelum siap mengambil keputusan.",
  "category": "Agen Properti",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['follow-up-leads-properti-tanpa-terlihat-memaksa'],
  "imageAlt": "Agen properti melakukan follow-up prospek secara profesional melalui telepon dan pencatatan pipeline.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "fact-finding-kebutuhan-nasabah-asuransi",
  "sourceSlug": "fact-finding-kebutuhan-nasabah-asuransi",
  "title": "Fact Finding Asuransi: Cara Menggali Kebutuhan Nasabah Sebelum Menawarkan Polis",
  "metaTitle": "Fact Finding Asuransi: Cara Menggali Kebutuhan Nasabah Sebelum Menawarkan Polis",
  "description": "Panduan fact finding agen asuransi untuk memahami kebutuhan, tanggungan, risiko, arus kas, dan prioritas nasabah sebelum merekomendasikan produk.",
  "excerpt": "Rekomendasi polis yang baik dimulai dari diagnosis. Fact finding membantu agen memahami kondisi calon nasabah sebelum berbicara tentang manfaat dan premi.",
  "category": "Agen Asuransi",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['fact-finding-kebutuhan-nasabah-asuransi'],
  "imageAlt": "Agen asuransi melakukan fact finding bersama pasangan untuk memahami kebutuhan perlindungan.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "presentasi-produk-direct-selling-yang-meyakinkan",
  "sourceSlug": "presentasi-produk-direct-selling-yang-meyakinkan",
  "title": "Presentasi Produk Direct Selling yang Meyakinkan Tanpa Berlebihan",
  "metaTitle": "Presentasi Produk Direct Selling yang Meyakinkan Tanpa Berlebihan",
  "description": "Cara presentasi produk direct selling dengan diagnosis kebutuhan, bukti yang relevan, struktur manfaat, dan komunikasi yang etis tanpa klaim berlebihan.",
  "excerpt": "Presentasi produk yang kuat bukan yang paling panjang. Yang paling efektif adalah presentasi yang relevan dengan masalah calon pembeli dan mudah dipahami.",
  "category": "MLM / Direct Selling",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['presentasi-produk-direct-selling-yang-meyakinkan'],
  "imageAlt": "Mitra direct selling mempresentasikan produk secara relevan kepada calon pelanggan.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "teknik-negosiasi-agen-properti",
  "sourceSlug": "teknik-negosiasi-agen-properti",
  "title": "Teknik Negosiasi Agen Properti: Menjaga Deal Tanpa Mengorbankan Harga",
  "metaTitle": "Teknik Negosiasi Agen Properti: Menjaga Deal Tanpa Mengorbankan Harga",
  "description": "Pelajari teknik negosiasi agen properti untuk menjembatani buyer dan seller, menjaga harga, membaca kepentingan, dan menghindari perang diskon.",
  "excerpt": "Negosiasi properti bukan sekadar mencari angka tengah. Agen perlu memahami kepentingan kedua pihak agar deal tetap sehat tanpa merusak nilai properti.",
  "category": "Agen Properti",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['teknik-negosiasi-agen-properti'],
  "imageAlt": "Agen properti memfasilitasi negosiasi buyer dan seller dengan strategi dan data transaksi.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "cara-menjawab-keberatan-premi-asuransi",
  "sourceSlug": "cara-menjawab-keberatan-premi-asuransi",
  "title": "Cara Menjawab Keberatan Premi Asuransi Tanpa Debat",
  "metaTitle": "Cara Menjawab Keberatan Premi Asuransi Tanpa Debat",
  "description": "Pelajari cara agen asuransi menangani keberatan premi, “mahal”, “nanti dulu”, dan “sudah punya” dengan diagnosis, klarifikasi, dan komunikasi yang etis.",
  "excerpt": "Keberatan premi bukan selalu penolakan. Sering kali nasabah belum memahami prioritas, belum percaya, atau belum melihat relevansi perlindungan yang ditawarkan.",
  "category": "Agen Asuransi",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['cara-menjawab-keberatan-premi-asuransi'],
  "imageAlt": "Agen asuransi menjelaskan pilihan dan menjawab keberatan premi secara tenang dan transparan.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "onboarding-duplikasi-tim-mlm",
  "sourceSlug": "onboarding-duplikasi-tim-mlm",
  "title": "Onboarding dan Duplikasi Tim MLM: Bangun Sistem yang Bisa Diikuti Anggota Baru",
  "metaTitle": "Onboarding dan Duplikasi Tim MLM: Bangun Sistem yang Bisa Diikuti Anggota Baru",
  "description": "Panduan onboarding dan duplikasi tim MLM/direct selling: langkah 7 hari, SOP, materi inti, aktivitas harian, dan coaching agar tim tidak bergantung pada leader.",
  "excerpt": "Duplikasi bukan menyuruh semua anggota menjadi sama. Duplikasi adalah membuat proses inti cukup sederhana sehingga anggota baru tahu apa yang harus dilakukan berikutnya.",
  "category": "MLM / Direct Selling",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['onboarding-duplikasi-tim-mlm'],
  "imageAlt": "Leader MLM atau direct selling menjelaskan alur onboarding kepada anggota tim baru.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "personal-branding-agen-properti",
  "sourceSlug": "personal-branding-agen-properti",
  "title": "Personal Branding Agen Properti: Dipercaya Sebelum Ditanya Harga",
  "metaTitle": "Personal Branding Agen Properti: Dipercaya Sebelum Ditanya Harga",
  "description": "Cara membangun personal branding agen properti lewat niche, bukti kerja, konten edukasi, dan positioning agar tidak hanya bersaing berdasarkan fee.",
  "excerpt": "Personal branding agen properti bukan soal tampil mewah. Yang lebih penting adalah membuat pasar memahami siapa yang Anda bantu, masalah apa yang Anda kuasai, dan bagaimana Anda bekerja.",
  "category": "Agen Properti",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['personal-branding-agen-properti'],
  "imageAlt": "Agen properti profesional membangun personal branding dan kepercayaan pasar.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "follow-up-renewal-referral-agen-asuransi",
  "sourceSlug": "follow-up-renewal-referral-agen-asuransi",
  "title": "Follow-Up, Renewal, dan Referral Agen Asuransi: Bangun Bisnis dari Nasabah Lama",
  "metaTitle": "Follow-Up, Renewal, dan Referral Agen Asuransi: Bangun Bisnis dari Nasabah Lama",
  "description": "Bangun sistem follow-up agen asuransi untuk renewal, review polis, layanan nasabah, dan referral agar bisnis tidak selalu bergantung pada prospek baru.",
  "excerpt": "Agen asuransi yang hanya fokus mencari nasabah baru melewatkan aset penting: hubungan dengan nasabah lama. Layanan setelah penjualan dapat menjadi sumber retensi dan referral.",
  "category": "Agen Asuransi",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['follow-up-renewal-referral-agen-asuransi'],
  "imageAlt": "Agen asuransi melakukan review polis, renewal, dan meminta referral secara profesional.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "repeat-order-direct-selling",
  "sourceSlug": "repeat-order-direct-selling",
  "title": "Cara Meningkatkan Repeat Order Direct Selling Tanpa Diskon Terus-Menerus",
  "metaTitle": "Cara Meningkatkan Repeat Order Direct Selling Tanpa Diskon Terus-Menerus",
  "description": "Strategi repeat order direct selling melalui onboarding pelanggan, follow-up penggunaan, edukasi, bundling, dan layanan tanpa perang diskon.",
  "excerpt": "Repeat order tidak seharusnya bergantung pada promo. Pelanggan kembali ketika produk relevan, pengalaman baik, dan komunikasi setelah pembelian terjaga.",
  "category": "MLM / Direct Selling",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['repeat-order-direct-selling'],
  "imageAlt": "Mitra direct selling mendampingi pelanggan menggunakan produk untuk membangun repeat order.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "sistem-pipeline-agen-properti-30-hari",
  "sourceSlug": "sistem-pipeline-agen-properti-30-hari",
  "title": "Sistem Pipeline Agen Properti 30 Hari agar Leads Tidak Hilang",
  "metaTitle": "Sistem Pipeline Agen Properti 30 Hari agar Leads Tidak Hilang",
  "description": "Bangun pipeline agen properti 30 hari: target aktivitas, follow-up, viewing, listing, negosiasi, dan review mingguan agar bisnis tidak bergantung pada mood.",
  "excerpt": "Agen properti sering sibuk tetapi tidak tahu aktivitas mana yang benar-benar mendekatkan ke closing. Pipeline 30 hari membantu mengubah kerja harian menjadi sistem yang terukur.",
  "category": "Agen Properti",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['sistem-pipeline-agen-properti-30-hari'],
  "imageAlt": "Agen properti meninjau pipeline dan Action Plan 30 Hari pada dashboard kerja.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "personal-branding-agen-asuransi",
  "sourceSlug": "personal-branding-agen-asuransi",
  "title": "Personal Branding Agen Asuransi: Bangun Kepercayaan Tanpa Hard Selling",
  "metaTitle": "Personal Branding Agen Asuransi: Bangun Kepercayaan Tanpa Hard Selling",
  "description": "Cara agen asuransi membangun personal branding melalui edukasi, transparansi, niche, dan konsistensi layanan tanpa bergantung pada hard selling.",
  "excerpt": "Di industri asuransi, kepercayaan adalah aset utama. Personal branding yang baik membuat calon nasabah memahami kompetensi dan cara kerja Anda sebelum berbicara tentang produk.",
  "category": "Agen Asuransi",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['personal-branding-agen-asuransi'],
  "imageAlt": "Agen asuransi profesional membangun personal branding berbasis kepercayaan dan layanan.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
{
  "slug": "leadership-leader-mlm-direct-selling",
  "sourceSlug": "leadership-leader-mlm-direct-selling",
  "title": "Leadership Leader MLM/Direct Selling: Bangun Tim yang Mandiri, Bukan Bergantung",
  "metaTitle": "Leadership Leader MLM/Direct Selling: Bangun Tim yang Mandiri, Bukan Bergantung",
  "description": "Pelajari leadership MLM/direct selling untuk membangun tim mandiri melalui coaching, target aktivitas, komunikasi, evaluasi, dan budaya kerja yang sehat.",
  "excerpt": "Leader yang selalu menyelamatkan tim justru bisa membuat anggota bergantung. Kepemimpinan yang baik membantu anggota belajar mengambil keputusan dan bertanggung jawab.",
  "category": "MLM / Direct Selling",
  "date": "2026-09-20",
  "modified": "2026-09-20",
  "readingTime": "3 menit",
  "image": PROFESSION_FEATURE_IMAGES_HQ['leadership-leader-mlm-direct-selling'],
  "imageAlt": "Leader MLM atau direct selling memimpin review dan perencanaan aktivitas tim.",
  "authorType": "Organization",
  "authorName": "UMKM Naik Kelas"
},
  {
    slug: "lead-berkualitas-umkm",
    sourceSlug: "lead-berkualitas-umkm",
    parentSlug: "strategi-pemasaran-umkm",
    title: "Banyak Promosi, Lead Tetap Sepi? Cara Mendapatkan Lead Berkualitas untuk UMKM",
    metaTitle: "Cara Mendapatkan Lead Berkualitas untuk UMKM",
    description: "Promosi ramai tetapi calon pelanggan berkualitas tetap sedikit? Pelajari cara memperbaiki target, pesan, channel, penawaran, dan kualifikasi lead UMKM.",
    excerpt: "Panduan diagnosis pemasaran untuk membedakan traffic, inquiry, dan qualified lead agar promosi tidak hanya ramai tetapi menghasilkan calon pelanggan yang relevan.",
    category: "Pemasaran",
    date: "2026-08-28",
    modified: "2026-09-02",
    readingTime: "9 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['lead-berkualitas-umkm'],
    imageAlt: "Pemilik UMKM mendiagnosis target, pesan, channel, dan funnel untuk mendapatkan lead yang lebih berkualitas.",
    faq: [
      {
        q: "Apa yang dimaksud lead berkualitas untuk UMKM?",
        a: "Lead berkualitas adalah calon pelanggan yang cukup sesuai dengan target bisnis, mempunyai kebutuhan yang relevan, dapat dijangkau, dan menunjukkan sinyal bahwa mereka layak diproses lebih lanjut oleh penjualan.",
      },
      {
        q: "Mengapa promosi ramai tetapi lead tetap sedikit?",
        a: "Penyebabnya dapat berada pada target yang terlalu luas, pesan yang tidak relevan, channel yang salah, penawaran yang kurang jelas, atau tidak adanya mekanisme untuk mengubah perhatian menjadi inquiry.",
      },
      {
        q: "Apakah banyak chat berarti pemasaran sudah berhasil?",
        a: "Belum tentu. Banyak chat adalah sinyal respons, tetapi kualitasnya perlu diperiksa. Pemasaran lebih sehat ketika inquiry yang masuk semakin relevan dan dapat diteruskan menjadi qualified lead.",
      },
      {
        q: "Kapan masalah lead berpindah menjadi masalah penjualan?",
        a: "Jika jumlah qualified lead sudah cukup tetapi banyak yang tidak bergerak ke penawaran, follow-up, atau closing, diagnosis berikutnya lebih dekat ke Medan Penjualan.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "meningkatkan-konversi-penjualan-umkm",
    sourceSlug: "meningkatkan-konversi-penjualan-umkm",
    parentSlug: "strategi-penjualan-umkm",
    title: "Calon Pembeli Banyak, Closing Sedikit? Cara Meningkatkan Konversi Penjualan UMKM",
    metaTitle: "Cara Meningkatkan Konversi Penjualan UMKM Tanpa Diskon",
    description: "Calon pembeli banyak tetapi closing rendah? Pelajari cara meningkatkan konversi penjualan UMKM melalui kualifikasi, discovery, offer, bukti, follow-up, dan next step.",
    excerpt: "Diagnosis conversion rate UMKM tanpa langsung banting harga: cek kualitas prospek, discovery, penawaran, bukti, objection, follow-up, dan friction closing.",
    category: "Penjualan",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "10 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['meningkatkan-konversi-penjualan-umkm'],
    imageAlt: "Funnel penjualan UMKM yang menunjukkan banyak calon pembeli tetapi sedikit closing serta titik perbaikan konversi.",
    faq: [
      {
        q: "Apa yang dimaksud conversion rate penjualan UMKM?",
        a: "Conversion rate adalah persentase prospek relevan yang berhasil menjadi pembeli dalam periode atau proses penjualan tertentu.",
      },
      {
        q: "Mengapa calon pembeli banyak tetapi closing sedikit?",
        a: "Penyebabnya dapat berupa kualitas prospek rendah, discovery lemah, offer membingungkan, bukti kurang, keberatan tidak terjawab, follow-up tidak konsisten, atau proses pembelian terlalu rumit.",
      },
      {
        q: "Apakah diskon selalu meningkatkan conversion rate?",
        a: "Tidak. Diskon dapat mendorong sebagian transaksi, tetapi tidak memperbaiki masalah seperti prospek salah target, penawaran tidak jelas, kurangnya kepercayaan, atau follow-up yang buruk.",
      },
      {
        q: "Apa langkah pertama jika conversion rate turun?",
        a: "Pisahkan funnel per tahap dan cari titik penurunan terbesar. Jangan mengubah seluruh strategi sekaligus sebelum mengetahui apakah masalah berada pada prospek, offer, objection, follow-up, atau closing.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "owner-bottleneck-umkm",
    sourceSlug: "owner-bottleneck-umkm",
    parentSlug: "strategi-operasional-umkm",
    title: "Semua Harus Lewat Owner? Cara Mengatasi Owner Bottleneck pada UMKM",
    metaTitle: "Owner Bottleneck UMKM: Cara Agar Bisnis Tidak Macet",
    description: "Semua keputusan harus lewat owner? Kenali owner bottleneck pada UMKM dan perbaiki workflow, decision rights, SOP, PIC, escalation rule, serta ritme kontrol.",
    excerpt: "Panduan mengurangi ketergantungan bisnis pada owner tanpa kehilangan kontrol: petakan keputusan rutin, batas kewenangan, PIC, SOP, dan eskalasi.",
    category: "Operasional",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "9 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['owner-bottleneck-umkm'],
    imageAlt: "Owner UMKM menjadi titik bottleneck karena seluruh keputusan dan pekerjaan harus melewati satu orang.",
    faq: [
      {
        q: "Apa yang dimaksud owner bottleneck?",
        a: "Owner bottleneck adalah kondisi ketika terlalu banyak pekerjaan, informasi, atau keputusan rutin berhenti pada owner sehingga kecepatan bisnis dibatasi oleh kapasitas satu orang.",
      },
      {
        q: "Apakah solusi owner bottleneck adalah langsung mendelegasikan semuanya?",
        a: "Tidak. Delegasi perlu didahului kejelasan proses, hasil, PIC, batas keputusan, informasi yang dibutuhkan, dan kondisi yang harus dieskalasikan.",
      },
      {
        q: "Bagaimana membedakan owner bottleneck dengan masalah karyawan?",
        a: "Jika banyak anggota tim berhenti pada titik keputusan yang sama, akar masalah cenderung berada pada sistem atau kewenangan. Jika masalah hanya berulang pada individu tertentu meski sistem sudah jelas, diagnosis SDM menjadi lebih relevan.",
      },
      {
        q: "Apa pekerjaan pertama yang sebaiknya dilepas owner?",
        a: "Mulailah dari keputusan rutin yang sering berulang, risikonya dapat dibatasi, mempunyai data atau aturan yang jelas, dan paling banyak menyita waktu owner.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "modal-kerja-umkm",
    sourceSlug: "modal-kerja-umkm",
    parentSlug: "omzet-besar-kas-kosong",
    title: "Omzet Naik, Modal Kerja Menipis? Cara Mengelola Modal Kerja UMKM",
    metaTitle: "Modal Kerja UMKM: Cara Menghitung dan Mengelolanya",
    description: "Omzet naik tetapi kas operasional menipis? Pelajari modal kerja UMKM, siklus kas, piutang, stok, utang supplier, kebutuhan kas, dan tanda pertumbuhan terlalu cepat.",
    excerpt: "Panduan memahami kebutuhan modal kerja ketika penjualan tumbuh: hitung uang yang tertahan di stok dan piutang serta bandingkan dengan kewajiban usaha.",
    category: "Keuangan",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "10 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['modal-kerja-umkm'],
    imageAlt: "Aliran modal kerja UMKM dari kas ke stok, penjualan, piutang, lalu kembali menjadi kas untuk operasional.",
    faq: [
      {
        q: "Apa yang dimaksud modal kerja UMKM?",
        a: "Modal kerja adalah sumber daya lancar yang dibutuhkan bisnis untuk menjalankan operasi sehari-hari selama jeda antara uang keluar untuk stok atau biaya dan uang penjualan kembali menjadi kas.",
      },
      {
        q: "Mengapa omzet naik tetapi modal kerja justru menipis?",
        a: "Pertumbuhan dapat membutuhkan stok, bahan, tenaga, promosi, dan biaya lebih dahulu sementara pembayaran pelanggan atau pencairan channel datang kemudian.",
      },
      {
        q: "Apa bedanya modal kerja dan laba?",
        a: "Laba mengukur hasil ekonomi menurut pendapatan dan biaya, sedangkan modal kerja berkaitan dengan kemampuan membiayai operasi sehari-hari serta waktu uang tertahan di piutang dan persediaan.",
      },
      {
        q: "Apa yang harus diperiksa ketika modal kerja mulai tertekan?",
        a: "Periksa saldo kas, piutang dan umur piutang, stok lambat, jadwal pembayaran supplier, kewajiban dekat, margin transaksi, serta forecast cash flow.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "delegasi-karyawan-umkm",
    sourceSlug: "delegasi-karyawan-umkm",
    parentSlug: "strategi-mengelola-karyawan-umkm",
    title: "Sudah Delegasi, Kenapa Tetap Ditanya? Cara Delegasi Karyawan UMKM yang Lebih Jelas",
    metaTitle: "Cara Delegasi Karyawan UMKM agar Tidak Selalu Bertanya",
    description: "Sudah delegasi tetapi tim tetap kembali bertanya? Pelajari cara memberi hasil, standar, batas keputusan, deadline, dan aturan eskalasi agar delegasi UMKM lebih mandiri.",
    excerpt: "Panduan delegasi UMKM yang praktis: jelaskan hasil, konteks, standar, batas keputusan, deadline, checkpoint, dan kapan tim harus eskalasi.",
    category: "SDM",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "9 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['delegasi-karyawan-umkm'],
    imageAlt: "Owner UMKM mendelegasikan pekerjaan dengan target, standar, deadline, dan batas keputusan yang jelas.",
    faq: [
      {
        q: "Mengapa karyawan tetap bertanya setelah pekerjaan didelegasikan?",
        a: "Sering kali yang dipindahkan hanya aktivitasnya, sementara hasil yang diharapkan, standar selesai, informasi, batas keputusan, atau kondisi eskalasi belum jelas.",
      },
      {
        q: "Apa bedanya delegasi dengan sekadar memberi tugas?",
        a: "Memberi tugas menjelaskan apa yang dikerjakan. Delegasi yang baik juga menjelaskan hasil, kewenangan, sumber daya, batas risiko, waktu, serta bagaimana hasil akan ditinjau.",
      },
      {
        q: "Apakah semua keputusan harus ikut didelegasikan?",
        a: "Tidak. Keputusan rutin dengan risiko terkendali dapat dipindahkan lebih dekat ke PIC, sedangkan keputusan strategis, bernilai besar, atau berisiko tinggi tetap dapat dipegang owner.",
      },
      {
        q: "Apa indikator delegasi mulai berhasil?",
        a: "Pertanyaan rutin berkurang, PIC dapat mengambil keputusan dalam batas yang disepakati, hasil lebih konsisten, dan eskalasi datang dengan data serta rekomendasi, bukan hanya pertanyaan kosong.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "aplikasi-digital-umkm-terlalu-banyak",
    sourceSlug: "aplikasi-digital-umkm-terlalu-banyak",
    parentSlug: "digitalisasi-umkm-tepat-sasaran",
    title: "Tambah Aplikasi, Kerja Malah Makin Ribet? Cara Memilih Tools Digital UMKM",
    metaTitle: "Cara Memilih Aplikasi Digital UMKM agar Kerja Tidak Makin Ribet",
    description: "Semakin banyak aplikasi tetapi kerja makin rumit? Pelajari cara memilih tools digital UMKM berdasarkan masalah proses, integrasi, sumber data, biaya, dan hasil yang terukur.",
    excerpt: "Digitalisasi yang sehat dimulai dari masalah bisnis, bukan daftar aplikasi. Audit proses, tentukan source of truth, lalu pilih tool minimum yang benar-benar membantu.",
    category: "Digital",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "9 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['aplikasi-digital-umkm-terlalu-banyak'],
    imageAlt: "Owner UMKM menyederhanakan banyak aplikasi menjadi alur digital yang lebih terhubung dan mudah digunakan.",
    faq: [
      {
        q: "Berapa banyak aplikasi yang ideal untuk UMKM?",
        a: "Tidak ada jumlah universal. Gunakan sesedikit mungkin tool yang mampu menyelesaikan kebutuhan proses dan data dengan baik, tanpa membuat pekerjaan berpindah-pindah secara tidak perlu.",
      },
      {
        q: "Apa tanda aplikasi justru menambah masalah?",
        a: "Data harus diinput berulang, informasi berbeda antar aplikasi, tim bingung sumber data yang benar, biaya bertambah tanpa penghematan waktu, atau proses manual tetap sama banyak.",
      },
      {
        q: "Apakah UMKM harus memakai aplikasi berbayar?",
        a: "Tidak selalu. Spreadsheet atau tool sederhana dapat cukup jika volume dan kompleksitas masih rendah. Upgrade ketika kebutuhan proses, kontrol, integrasi, keamanan, atau audit memang membutuhkannya.",
      },
      {
        q: "Apa langkah pertama sebelum membeli aplikasi baru?",
        a: "Petakan masalah proses yang ingin diselesaikan, ukuran keberhasilan, siapa pengguna utama, data apa yang dibutuhkan, serta bagaimana tool baru akan terhubung dengan proses yang sudah ada.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "kapasitas-produksi-umkm",
    sourceSlug: "kapasitas-produksi-umkm",
    parentSlug: "strategi-produksi-umkm",
    title: "Pesanan Naik, Produksi Mulai Kewalahan? Cara Menghitung Kapasitas Produksi UMKM",
    metaTitle: "Cara Menghitung Kapasitas Produksi UMKM Sebelum Tambah Order",
    description: "Pesanan naik tetapi produksi mulai kewalahan? Pelajari cara menghitung kapasitas nyata UMKM dari waktu tersedia, cycle time, bottleneck, downtime, rework, dan buffer.",
    excerpt: "Jangan menerima order hanya berdasarkan kapasitas teoritis. Hitung kapasitas efektif, temukan bottleneck, dan sisakan buffer untuk variasi produksi.",
    category: "Produksi",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "10 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['kapasitas-produksi-umkm'],
    imageAlt: "Lini produksi UMKM dengan indikator kapasitas aman dan overload saat jumlah pesanan meningkat.",
    faq: [
      {
        q: "Apa yang dimaksud kapasitas produksi nyata?",
        a: "Kapasitas produksi nyata adalah output yang realistis dicapai setelah memperhitungkan waktu kerja efektif, setup, downtime, rework, keterlambatan bahan, dan bottleneck.",
      },
      {
        q: "Mengapa kapasitas teoritis sering berbeda dari hasil aktual?",
        a: "Karena kapasitas teoritis biasanya mengabaikan variasi proses, pergantian produk, maintenance, istirahat, quality check, antrian, serta pekerjaan ulang.",
      },
      {
        q: "Apakah order harus ditolak ketika kapasitas penuh?",
        a: "Tidak selalu. UMKM dapat mengatur lead time, membagi batch, mengubah prioritas, menambah shift sementara, atau menggunakan mitra. Namun keputusan harus mempertimbangkan kualitas, biaya, dan kemampuan kas.",
      },
      {
        q: "Apa hubungan kapasitas dan bottleneck?",
        a: "Kapasitas sistem biasanya dibatasi oleh tahap paling sempit. Menambah kapasitas pada proses yang bukan bottleneck belum tentu meningkatkan output total.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "stok-tidak-merata-umkm",
    sourceSlug: "stok-tidak-merata-umkm",
    parentSlug: "strategi-distribusi-umkm",
    title: "Barang Ada, Tapi Salah Tempat? Cara Mengatasi Stok Tidak Merata pada UMKM",
    metaTitle: "Stok Tidak Merata? Cara Atur Stok UMKM per Lokasi",
    description: "Stok menumpuk di satu lokasi tetapi kosong di lokasi lain? Atur minimum stock, transfer, replenishment, dan alokasi agar stok UMKM lebih merata.",
    excerpt: "Panduan distribusi stok UMKM agar barang tersedia di tempat yang tepat: ukur penjualan per lokasi, stok tersedia, days of stock, dan kebutuhan replenishment.",
    category: "Distribusi",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "9 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['stok-tidak-merata-umkm'],
    imageAlt: "Distribusi stok UMKM yang tidak merata antara beberapa lokasi penjualan dan gudang.",
    faq: [
      {
        q: "Mengapa stok bisa menumpuk di satu lokasi tetapi habis di lokasi lain?",
        a: "Penyebab umum adalah alokasi awal berdasarkan perkiraan, pola permintaan berbeda, replenishment lambat, data stok terlambat, atau transfer antar lokasi tidak mempunyai aturan.",
      },
      {
        q: "Data minimum apa yang perlu dipantau?",
        a: "Pantau stok tersedia, penjualan per periode, barang dalam perjalanan, lead time replenishment, stok minimum, serta produk yang lambat dan cepat bergerak per lokasi.",
      },
      {
        q: "Apakah solusi stok tidak merata adalah menambah stok?",
        a: "Belum tentu. Menambah stok total dapat memperbesar uang yang terkunci. Sering kali solusi pertama adalah redistribusi, perbaikan alokasi, dan replenishment yang lebih cepat.",
      },
      {
        q: "Kapan stok perlu dipindahkan antar lokasi?",
        a: "Ketika satu lokasi mempunyai kelebihan relatif terhadap laju penjualan sementara lokasi lain berisiko stockout, dan biaya transfer masih masuk akal dibanding potensi kehilangan penjualan.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "negosiasi-diskon-klien-umkm",
    sourceSlug: "negosiasi-diskon-klien-umkm",
    parentSlug: "teknik-negosiasi-bisnis-umkm",
    title: "Klien Minta Diskon Terus? Cara Negosiasi Tanpa Langsung Potong Harga",
    metaTitle: "Cara Negosiasi Diskon dengan Klien tanpa Merusak Margin",
    description: "Klien terus meminta diskon? Pelajari cara negosiasi harga UMKM dengan menukar volume, scope, termin, waktu, komitmen, dan nilai tanpa langsung merusak margin.",
    excerpt: "Jangan memberi potongan tanpa imbal balik. Gunakan prinsip give-get, harga minimum, pilihan paket, dan trade-off untuk menjaga nilai transaksi.",
    category: "Negosiasi",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "9 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['negosiasi-diskon-klien-umkm'],
    imageAlt: "Owner UMKM bernegosiasi dengan klien mengenai harga, volume, scope, dan termin pembayaran.",
    faq: [
      {
        q: "Apa yang sebaiknya dilakukan ketika klien langsung meminta diskon?",
        a: "Cari tahu alasan dan variabel yang sedang dibandingkan sebelum memberi potongan. Diskusikan kebutuhan, scope, volume, waktu, termin, dan nilai yang paling penting bagi klien.",
      },
      {
        q: "Apa itu prinsip give-get dalam negosiasi?",
        a: "Setiap konsesi sebaiknya ditukar dengan sesuatu yang bernilai bagi bisnis, misalnya volume lebih besar, pembayaran lebih cepat, scope lebih sempit, durasi lebih panjang, atau komitmen tertentu.",
      },
      {
        q: "Apakah UMKM harus selalu menolak diskon?",
        a: "Tidak. Diskon dapat digunakan jika masih berada di atas batas aman dan mempunyai tujuan serta imbal balik yang jelas.",
      },
      {
        q: "Mengapa harga minimum penting sebelum negosiasi?",
        a: "Tanpa batas minimum, owner mudah memberi konsesi bertahap sampai transaksi tidak lagi menutup biaya atau memberikan kontribusi yang sehat.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "kesiapan-buka-cabang-umkm",
    sourceSlug: "kesiapan-buka-cabang-umkm",
    parentSlug: "strategi-ekspansi-umkm",
    title: "Ramai Belum Berarti Siap Buka Cabang: Checklist Kesiapan Ekspansi UMKM",
    metaTitle: "Checklist Kesiapan Buka Cabang untuk UMKM",
    description: "Usaha ramai belum otomatis siap buka cabang. Periksa profitabilitas unit, SOP, cash flow, tim, demand lokal, supply, kontrol, dan kemampuan model untuk diduplikasi.",
    excerpt: "Checklist sebelum buka cabang: pastikan unit pertama sehat, proses terdokumentasi, tim siap, modal kerja cukup, dan demand lokasi baru sudah diuji.",
    category: "Ekspansi",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "10 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['kesiapan-buka-cabang-umkm'],
    imageAlt: "UMKM menilai kesiapan sistem, cash flow, tim, dan demand sebelum membuka cabang baru.",
    faq: [
      {
        q: "Kapan UMKM mulai layak mempertimbangkan cabang baru?",
        a: "Ketika unit yang ada mempunyai economics yang cukup sehat, proses utama dapat direplikasi, tim tidak seluruhnya bergantung pada owner, modal kerja cukup, dan ada bukti demand di lokasi baru.",
      },
      {
        q: "Apakah antrean panjang berarti bisnis siap ekspansi?",
        a: "Belum tentu. Antrean dapat muncul karena kapasitas atau operasional belum efisien. Periksa dulu apakah permintaan stabil dan model yang ada benar-benar menguntungkan.",
      },
      {
        q: "Apa risiko terbesar membuka cabang terlalu cepat?",
        a: "Kas terpecah, owner menjadi bottleneck di dua lokasi, kualitas turun, stok bertambah, manajemen tim melemah, dan masalah unit pertama ikut diduplikasi.",
      },
      {
        q: "Bagaimana menguji pasar sebelum menyewa lokasi permanen?",
        a: "Gunakan uji berbiaya lebih rendah seperti pop-up, event, delivery radius baru, reseller, pre-order lokal, atau kampanye khusus wilayah untuk melihat demand sebelum membuat komitmen jangka panjang.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "meningkatkan-repeat-order-umkm",
    sourceSlug: "meningkatkan-repeat-order-umkm",
    parentSlug: "strategi-penjualan-umkm",
    title: "Banyak Pembeli Baru, Repeat Order Rendah? Cara Meningkatkan Repeat Order UMKM",
    metaTitle: "Cara Meningkatkan Repeat Order UMKM secara Terukur",
    description: "Banyak pembeli baru tetapi sedikit yang kembali? Pelajari cara meningkatkan repeat order UMKM melalui pengalaman pertama, timing, segmentasi, reminder, replenishment, dan follow-up.",
    excerpt: "Repeat order dimulai setelah transaksi pertama: ukur siklus pembelian, pengalaman pelanggan, alasan tidak kembali, dan follow-up sesuai timing kebutuhan.",
    category: "Penjualan",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "9 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['meningkatkan-repeat-order-umkm'],
    imageAlt: "Alur pelanggan UMKM dari pembelian pertama menuju pengalaman, follow-up, dan repeat order.",
    faq: [
      {
        q: "Apa yang dimaksud repeat order rate?",
        a: "Secara sederhana, repeat order rate menunjukkan proporsi pelanggan yang melakukan pembelian kembali dalam periode yang ditentukan. Definisi periode harus disesuaikan dengan siklus produk.",
      },
      {
        q: "Mengapa pelanggan puas belum tentu membeli lagi?",
        a: "Produk mungkin belum habis, kebutuhan tidak berulang, pelanggan lupa, alternatif lebih mudah, pengalaman setelah pembelian kurang baik, atau bisnis tidak menghubungi kembali pada waktu yang relevan.",
      },
      {
        q: "Apakah voucher selalu efektif meningkatkan repeat order?",
        a: "Tidak selalu. Voucher dapat mendorong transaksi, tetapi repeat yang sehat juga bergantung pada kualitas produk, pengalaman, relevansi timing, kemudahan pembelian, dan alasan kembali.",
      },
      {
        q: "Kapan follow-up repeat order sebaiknya dikirim?",
        a: "Gunakan perkiraan siklus penggunaan atau pembelian produk, bukan jadwal yang sama untuk semua pelanggan. Timing yang relevan lebih penting daripada frekuensi tinggi.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "stok-mati-umkm",
    sourceSlug: "stok-mati-umkm",
    parentSlug: "strategi-distribusi-umkm",
    title: "Gudang Penuh, Kas Terkunci? Cara Mengatasi Stok Mati pada UMKM",
    metaTitle: "Cara Mengatasi Stok Mati UMKM agar Kas Tidak Terkunci",
    description: "Gudang penuh tetapi kas menipis? Pelajari cara mengidentifikasi stok mati UMKM, membaca umur stok, menghentikan reorder, redistribusi, bundling, markdown, dan pencegahan.",
    excerpt: "Stok yang tidak bergerak adalah uang yang berhenti bekerja. Pisahkan slow moving dan dead stock, lalu pilih tindakan berdasarkan umur, demand, margin, dan biaya simpan.",
    category: "Distribusi",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "10 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['stok-mati-umkm'],
    imageAlt: "Gudang UMKM penuh stok tidak bergerak yang mengunci kas operasional.",
    faq: [
      {
        q: "Apa yang dimaksud stok mati?",
        a: "Stok mati adalah persediaan yang tidak bergerak dalam periode yang secara bisnis sudah melewati siklus penjualan normal dan kecil kemungkinannya terjual tanpa tindakan khusus.",
      },
      {
        q: "Apakah slow moving sama dengan stok mati?",
        a: "Tidak. Slow moving masih bergerak tetapi lebih lambat dari target, sedangkan dead stock hampir tidak bergerak atau permintaannya sudah sangat rendah.",
      },
      {
        q: "Apa langkah pertama setelah menemukan stok mati?",
        a: "Hentikan reorder untuk SKU tersebut, verifikasi jumlah dan umur stok, cari penyebab, lalu nilai pilihan transfer, bundling, markdown, retur supplier, repurpose, atau penghentian.",
      },
      {
        q: "Mengapa stok mati berbahaya bagi cash flow?",
        a: "Uang sudah keluar untuk membeli atau memproduksi barang tetapi belum kembali menjadi kas, sementara bisnis tetap menanggung biaya ruang, risiko kerusakan, dan kebutuhan modal kerja lain.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "harga-minimum-sehat-umkm",
    sourceSlug: "harga-minimum-sehat-umkm",
    parentSlug: "omzet-besar-kas-kosong",
    title: "Jual Banyak Tapi Margin Makin Tipis? Cara Menghitung Harga Minimum Sehat UMKM",
    metaTitle: "Cara Menghitung Harga Minimum Sehat UMKM sebelum Diskon",
    description: "Jual banyak tetapi margin makin tipis? Pelajari cara menentukan harga minimum sehat UMKM dari HPP, biaya transaksi, fulfillment, promo, dan kontribusi minimum.",
    excerpt: "Tetapkan price floor sebelum memberi diskon. Pisahkan biaya variabel per transaksi, biaya channel, promo, fulfillment, dan kebutuhan kontribusi untuk biaya tetap.",
    category: "Keuangan",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "10 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['harga-minimum-sehat-umkm'],
    imageAlt: "Harga minimum sehat UMKM sebagai batas bawah untuk melindungi margin saat penjualan dan diskon meningkat.",
    faq: [
      {
        q: "Apa yang dimaksud harga minimum sehat UMKM?",
        a: "Harga minimum sehat adalah batas harga terendah yang ditetapkan berdasarkan biaya transaksi dan kontribusi minimum yang dibutuhkan bisnis, sehingga promo tidak diputuskan hanya berdasarkan tekanan pasar.",
      },
      {
        q: "Apakah harga minimum sama dengan HPP?",
        a: "Tidak. HPP hanya salah satu komponen. Harga minimum perlu mempertimbangkan biaya transaksi lain seperti fee channel, kemasan, fulfillment, komisi, subsidi, dan kebutuhan kontribusi bisnis.",
      },
      {
        q: "Apakah semua biaya tetap harus dimasukkan per produk?",
        a: "Untuk keputusan jangka menengah, biaya tetap perlu ditutup oleh total kontribusi bisnis. Alokasi per produk dapat membantu, tetapi jangan membuat angka palsu yang terlalu presisi jika dasar alokasinya lemah.",
      },
      {
        q: "Kapan diskon masih aman?",
        a: "Ketika harga setelah diskon masih berada di atas batas yang sudah ditentukan, tujuan promonya jelas, volume atau manfaat tambahannya realistis, dan dampaknya terhadap kas dapat ditanggung.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "diagnosis-10-medan-umkm",
    sourceSlug: "diagnosis-10-medan-umkm",
    parentSlug: "diagnosis-sebelum-strategi",
    title: "Masalah Bisnis Anda Sebenarnya Ada di Mana? Cara Diagnosis 10 Medan UMKM",
    metaTitle: "Diagnosis 10 Medan UMKM: Cara Menentukan Prioritas Bisnis",
    description: "Bingung masalah bisnis sebenarnya ada di mana? Gunakan Diagnosis 10 Medan UMKM untuk memisahkan gejala, menemukan akar masalah, memilih prioritas, dan menyusun aksi 30 hari.",
    excerpt: "Peta diagnosis 10 medan membantu owner membedakan masalah pemasaran, penjualan, operasional, keuangan, SDM, digital, produksi, distribusi, negosiasi, dan ekspansi.",
    category: "Diagnosis 10 Medan",
    date: "2026-08-28",
    modified: "2026-08-28",
    readingTime: "11 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['diagnosis-10-medan-umkm'],
    imageAlt: "Pemilik UMKM menggunakan peta Business Health Check 10 Medan untuk menentukan akar masalah dan prioritas bisnis.",
    faq: [
      {
        q: "Apa itu Diagnosis 10 Medan UMKM?",
        a: "Diagnosis 10 Medan adalah kerangka untuk memeriksa masalah bisnis melalui Pemasaran, Penjualan, Operasional, Keuangan, SDM, Digital, Produksi, Distribusi, Negosiasi, dan Ekspansi sebelum memilih tindakan.",
      },
      {
        q: "Apakah semua medan harus diperbaiki sekaligus?",
        a: "Tidak. Tujuan diagnosis justru memilih satu sampai tiga medan dengan dampak terbesar agar sumber daya tidak tersebar.",
      },
      {
        q: "Bagaimana membedakan gejala dan akar masalah?",
        a: "Gejala adalah hal yang terlihat, misalnya omzet turun atau owner sibuk. Akar masalah dicari dengan melihat data, alur proses, timing, dan hubungan sebab-akibat antar medan.",
      },
      {
        q: "Seberapa sering Business Health Check dilakukan?",
        a: "Lakukan ketika muncul perubahan penting atau secara berkala sesuai ritme bisnis. Yang lebih penting adalah menggunakan bukti yang sama dan meninjau apakah tindakan sebelumnya benar-benar memperbaiki indikator prioritas.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "forecast-cash-flow-7-hari-umkm",
    sourceSlug: "forecast-cash-flow-7-hari-umkm",
    parentSlug: "omzet-besar-kas-kosong",
    title: "Cara Membuat Forecast Cash Flow 7 Hari untuk UMKM",
    metaTitle: "Forecast Cash Flow 7 Hari untuk UMKM: Panduan Praktis",
    description: "Pelajari cara membuat forecast cash flow 7 hari untuk UMKM agar kebutuhan kas, piutang, pembayaran supplier, dan risiko kekurangan uang terlihat lebih awal.",
    excerpt: "Panduan praktis membuat forecast kas 7 hari: saldo awal, uang masuk, kewajiban, pengeluaran, saldo akhir, dan tindakan ketika muncul defisit.",
    category: "Keuangan",
    date: "2026-08-18",
    modified: "2026-08-18",
    readingTime: "8 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['forecast-cash-flow-7-hari-umkm'],
    imageAlt: "Forecast cash flow 7 hari UMKM dengan saldo awal, uang masuk, pengeluaran, dan saldo akhir.",
    faq: [
      {
        q: "Apa itu forecast cash flow 7 hari?",
        a: "Forecast cash flow 7 hari adalah perkiraan sederhana arus kas masuk dan keluar untuk tujuh hari ke depan berdasarkan saldo tersedia, penerimaan yang realistis, serta kewajiban yang akan jatuh tempo.",
      },
      {
        q: "Apakah forecast sama dengan laporan cash flow?",
        a: "Tidak. Laporan cash flow melihat pergerakan uang yang sudah terjadi, sedangkan forecast mencoba memperkirakan apa yang kemungkinan terjadi ke depan agar owner dapat mengambil tindakan lebih cepat.",
      },
      {
        q: "Apakah semua penjualan boleh langsung dimasukkan sebagai uang masuk?",
        a: "Tidak. Masukkan sebagai uang masuk hanya transaksi yang realistis diterima pada hari tersebut. Penjualan kredit atau invoice yang belum pasti dibayar sebaiknya dipisahkan sebagai estimasi atau skenario.",
      },
      {
        q: "Apa yang dilakukan jika forecast menunjukkan saldo negatif?",
        a: "Cari penyebab utama defisit lalu prioritaskan tindakan yang paling sehat, misalnya mempercepat penagihan, menunda pengeluaran non-kritis, mengatur ulang jadwal pembayaran, atau menyesuaikan pembelian stok.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "karyawan-umkm-tidak-mandiri",
    sourceSlug: "karyawan-umkm-tidak-mandiri",
    parentSlug: "strategi-mengelola-karyawan-umkm",
    title: "Karyawan UMKM Tidak Mandiri? Diagnosis 4 Akar Masalahnya",
    metaTitle: "Karyawan UMKM Tidak Mandiri? 4 Akar Masalahnya",
    description: "Karyawan sering menunggu instruksi owner? Diagnosis 4 akar masalahnya: kejelasan peran, kemampuan, batas keputusan, dan sistem feedback sebelum menyalahkan tim.",
    excerpt: "Panduan diagnosis agar owner dapat membedakan masalah orang, proses, kompetensi, dan kewenangan sebelum menambah aturan atau mengganti karyawan.",
    category: "SDM",
    date: "2026-08-18",
    modified: "2026-08-18",
    readingTime: "8 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['karyawan-umkm-tidak-mandiri'],
    imageAlt: "Owner UMKM dan tim mendiagnosis kejelasan peran, kompetensi, kewenangan, serta feedback kerja.",
    faq: [
      {
        q: "Mengapa karyawan UMKM sering menunggu instruksi owner?",
        a: "Penyebabnya dapat berbeda-beda, seperti peran yang tidak jelas, kemampuan yang belum cukup, kewenangan yang terlalu sempit, atau tidak adanya feedback dan ukuran hasil yang konsisten.",
      },
      {
        q: "Apakah karyawan yang sering bertanya berarti tidak kompeten?",
        a: "Belum tentu. Pertanyaan berulang dapat muncul karena SOP tidak jelas, standar hasil berubah, akses informasi terbatas, atau keputusan memang selalu ditarik kembali ke owner.",
      },
      {
        q: "Apa bedanya masalah SDM dengan masalah operasional?",
        a: "Masalah SDM berfokus pada orang, kompetensi, peran, target, feedback, dan pengembangan. Masalah operasional berfokus pada alur kerja, SOP, handoff, bottleneck, standar, dan kontrol.",
      },
      {
        q: "Apa langkah pertama agar tim lebih mandiri?",
        a: "Pilih satu pekerjaan yang sering kembali ke owner, lalu jelaskan hasil yang diharapkan, PIC, batas keputusan, informasi yang dibutuhkan, dan kapan harus melakukan eskalasi.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "negosiasi-supplier-umkm-margin",
    sourceSlug: "negosiasi-supplier-umkm-margin",
    parentSlug: "teknik-negosiasi-bisnis-umkm",
    title: "Cara Negosiasi dengan Supplier Tanpa Mengorbankan Margin",
    metaTitle: "Cara Negosiasi Supplier UMKM Tanpa Korbankan Margin",
    description: "Pelajari cara negosiasi dengan supplier untuk menjaga margin, cash flow, kualitas, lead time, MOQ, dan syarat pembayaran tanpa hanya mengejar harga termurah.",
    excerpt: "Panduan menyiapkan posisi negosiasi supplier dan membahas total nilai transaksi: harga, termin, MOQ, kualitas, lead time, retur, dan kepastian pasokan.",
    category: "Negosiasi",
    date: "2026-08-18",
    modified: "2026-08-18",
    readingTime: "8 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['negosiasi-supplier-umkm-margin'],
    imageAlt: "Pemilik UMKM bernegosiasi dengan supplier mengenai harga, MOQ, termin pembayaran, kualitas, dan lead time.",
    faq: [
      {
        q: "Apakah negosiasi supplier harus selalu meminta harga lebih murah?",
        a: "Tidak. Nilai transaksi juga dipengaruhi termin pembayaran, MOQ, lead time, konsistensi kualitas, retur, ongkir, prioritas stok, dan fleksibilitas pemesanan.",
      },
      {
        q: "Apa yang harus disiapkan sebelum negosiasi dengan supplier?",
        a: "Siapkan data volume pembelian, kebutuhan kualitas, batas biaya, pola pembayaran, kebutuhan lead time, alternatif supplier, serta syarat yang paling penting dan yang masih dapat ditukar.",
      },
      {
        q: "Bagaimana menjaga hubungan supplier saat menawar?",
        a: "Fokuskan pembicaraan pada kebutuhan bisnis dan pilihan solusi, bukan menekan secara personal. Jelaskan volume, konsistensi, rencana kerja sama, serta trade-off yang dapat diberikan kedua pihak.",
      },
      {
        q: "Mengapa harga murah belum tentu membuat margin lebih sehat?",
        a: "Harga satuan murah dapat disertai MOQ besar, stok menumpuk, kualitas tidak stabil, biaya retur, lead time panjang, atau pembayaran terlalu cepat sehingga total biaya dan kebutuhan kas justru meningkat.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "bottleneck-produksi-umkm",
    sourceSlug: "bottleneck-produksi-umkm",
    parentSlug: "strategi-produksi-umkm",
    title: "Cara Menemukan Bottleneck Produksi sebelum Membeli Mesin Baru",
    metaTitle: "Bottleneck Produksi UMKM: Cek Sebelum Beli Mesin",
    description: "Sebelum membeli mesin baru, pelajari cara menemukan bottleneck produksi UMKM dari antrean kerja, waktu proses, rework, downtime, setup, dan kapasitas nyata.",
    excerpt: "Panduan diagnosis bottleneck untuk mengetahui titik yang benar-benar membatasi output sebelum UMKM menambah mesin, tenaga, atau kapasitas.",
    category: "Produksi",
    date: "2026-08-18",
    modified: "2026-08-18",
    readingTime: "8 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['bottleneck-produksi-umkm'],
    imageAlt: "Alur produksi UMKM dengan titik bottleneck, antrean, waktu proses, rework, dan kapasitas.",
    faq: [
      {
        q: "Apa yang dimaksud bottleneck produksi?",
        a: "Bottleneck adalah tahap proses yang membatasi aliran output keseluruhan karena kapasitas, waktu, kualitas, ketersediaan alat, atau cara kerja di titik tersebut lebih terbatas dibanding kebutuhan proses.",
      },
      {
        q: "Apakah antrean panjang selalu berarti harus membeli mesin?",
        a: "Tidak. Antrean dapat disebabkan setup terlalu lama, jadwal tidak seimbang, rework, material terlambat, pergantian prioritas, atau proses sebelumnya menghasilkan pekerjaan lebih cepat daripada tahap berikutnya.",
      },
      {
        q: "Data apa yang perlu dicatat untuk menemukan bottleneck?",
        a: "Catat volume masuk, volume selesai, waktu proses, waktu menunggu, downtime, rework, perubahan setup, dan antrean pada setiap tahap selama periode yang cukup mewakili kondisi normal.",
      },
      {
        q: "Kapan pembelian mesin baru mulai layak dipertimbangkan?",
        a: "Setelah bottleneck terbukti konsisten, perbaikan proses sederhana sudah diuji, permintaan cukup nyata, dan tambahan kapasitas memberi manfaat yang sebanding dengan biaya serta kebutuhan kas.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: "follow-up-calon-pembeli-umkm",
    sourceSlug: "follow-up-calon-pembeli-umkm",
    parentSlug: "strategi-penjualan-umkm",
    title: "Cara Follow Up Calon Pembeli UMKM Tanpa Terlihat Memaksa",
    metaTitle: "Cara Follow Up Calon Pembeli UMKM Tanpa Memaksa",
    description: "Pelajari cara follow up calon pembeli UMKM dengan konteks, value, pertanyaan, dan next step yang jelas agar peluang closing naik tanpa terasa mengejar.",
    excerpt: "Panduan follow-up penjualan yang relevan: membaca konteks prospek, memberi nilai, menangani keberatan, menentukan next step, dan tahu kapan berhenti.",
    category: "Penjualan",
    date: "2026-08-18",
    modified: "2026-08-18",
    readingTime: "8 menit",
    image: ARTICLE_FEATURE_IMAGES_HQ['follow-up-calon-pembeli-umkm'],
    imageAlt: "Pemilik UMKM melakukan follow up calon pembeli melalui WhatsApp dengan pesan yang relevan dan tidak memaksa.",
    faq: [
      {
        q: "Berapa kali calon pembeli sebaiknya di-follow up?",
        a: "Tidak ada jumlah yang cocok untuk semua transaksi. Sesuaikan dengan nilai produk, urgensi kebutuhan, sinyal minat, siklus keputusan, dan respons prospek. Setiap follow-up sebaiknya mempunyai alasan yang relevan.",
      },
      {
        q: "Apa yang harus ditulis saat prospek tidak membalas?",
        a: "Ingatkan konteks secara singkat, beri informasi atau bantuan yang relevan, lalu ajukan satu pertanyaan atau next step yang mudah dijawab. Hindari mengirim pesan yang hanya berbunyi menanyakan jadi atau tidak.",
      },
      {
        q: "Kapan follow-up sebaiknya dihentikan?",
        a: "Hentikan atau turunkan intensitas ketika prospek menyatakan tidak berminat, kebutuhan sudah tidak relevan, atau beberapa upaya yang wajar tidak mendapat respons. Simpan hubungan dengan sopan tanpa terus menekan.",
      },
      {
        q: "Apa bedanya follow-up penjualan dan spam?",
        a: "Follow-up mempunyai konteks, relevansi, dan tujuan yang jelas berdasarkan interaksi sebelumnya. Spam dikirim berulang tanpa memperhatikan kebutuhan, izin, atau respons penerima.",
      },
    ],
    authorType: "Organization",
    authorName: "UMKM Naik Kelas",
  },
  {
    slug: '7-kebocoran-cash-flow-umkm',
    sourceSlug: '7-kebocoran-cash-flow-umkm',
    parentSlug: 'omzet-besar-kas-kosong',
    title: '7 Kebocoran Cash Flow UMKM yang Membuat Uang Cepat Habis',
    metaTitle: '7 Kebocoran Cash Flow UMKM yang Sering Tidak Terlihat',
    description: 'Kenali 7 kebocoran cash flow UMKM yang membuat uang cepat habis, dari piutang, stok, diskon, biaya channel, hingga belanja pertumbuhan.',
    excerpt: 'Checklist diagnosis untuk menemukan ke mana uang usaha menghilang meski penjualan terlihat ramai.',
    category: 'Keuangan',
    date: '2026-08-18',
    modified: '2026-08-18',
    readingTime: '8 menit',
    image: "",
    imageAlt: 'Pemilik UMKM memeriksa kebocoran cash flow dari piutang, stok, diskon, biaya channel, dan pengeluaran usaha.',
    faq: [
      {
        q: 'Apa yang dimaksud kebocoran cash flow UMKM?',
        a: 'Kebocoran cash flow adalah kondisi ketika uang keluar, tertahan, atau kembali lebih lambat daripada yang disadari owner. Penyebabnya dapat berupa piutang, stok, diskon, biaya channel, pengeluaran berulang, penarikan owner, atau belanja pertumbuhan yang terlalu cepat.'
      },
      {
        q: 'Apakah omzet tinggi berarti cash flow pasti sehat?',
        a: 'Tidak. Omzet menunjukkan nilai penjualan, sedangkan cash flow menunjukkan pergerakan uang yang benar-benar masuk dan keluar. Penjualan dapat terlihat tinggi ketika uang masih tertahan di piutang atau persediaan.'
      },
      {
        q: 'Seberapa sering UMKM perlu memeriksa cash flow?',
        a: 'Frekuensi pemeriksaan sebaiknya mengikuti ritme transaksi dan kewajiban bisnis. Untuk banyak UMKM, review mingguan membantu melihat risiko lebih cepat daripada menunggu laporan bulanan.'
      },
      {
        q: 'Apa langkah pertama setelah menemukan kebocoran cash flow?',
        a: 'Urutkan kebocoran berdasarkan dampak rupiah dan urgensi. Perbaiki satu sampai tiga titik terbesar terlebih dahulu, lalu pantau perubahan saldo, piutang, stok, dan kewajiban secara berkala.'
      }
    ],
    authorType: 'Organization',
    authorName: 'UMKM Naik Kelas'
  },
  {
    "slug": "strategi-pemasaran-umkm",
    "sourceSlug": "strategi-pemasaran-umkm",
    "title": "Strategi Pemasaran UMKM: Cara Mendapatkan Pelanggan Tanpa Membakar Anggaran Iklan",
    "metaTitle": "Strategi Pemasaran UMKM untuk Mendapatkan Pelanggan",
    "description": "Pelajari strategi pemasaran UMKM untuk menemukan target pelanggan, memilih channel, mengukur CAC, dan mendapatkan pelanggan tanpa membuang anggaran iklan.",
    "excerpt": "Panduan untuk mendiagnosis kesiapan pemasaran, menentukan target pelanggan, memilih channel, membangun funnel, dan mengukur CAC tanpa membakar anggaran.",
    "category": "Pemasaran",
    "date": "2026-08-07",
    "modified": "2026-08-07",
    "readingTime": "7 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['strategi-pemasaran-umkm'],
    "imageAlt": "Peta strategi pemasaran UMKM dengan target pelanggan, channel, CAC, dan qualified lead.",
    "faq": [
      {
        "q": "Berapa anggaran iklan yang ideal untuk UMKM?",
        "a": "Tidak ada satu persentase yang ideal untuk semua UMKM. Anggaran sebaiknya ditentukan dari margin kontribusi produk, target pelanggan baru, CAC yang masih dapat diterima, kemampuan cash flow, dan nilai pelanggan. Mulailah dari pengujian yang terukur, lalu tingkatkan anggaran pada channel yang terbukti menghasilkan pelanggan secara sehat."
      },
      {
        "q": "Apa bedanya strategi pemasaran dan strategi penjualan?",
        "a": "Pemasaran bertugas menarik perhatian dan mendatangkan calon pelanggan yang relevan. Penjualan mengambil alih ketika prospek sudah cukup sesuai dan tertarik, lalu membantu mereka memahami penawaran, menjawab keberatan, melakukan follow-up, dan mengambil keputusan pembelian."
      },
      {
        "q": "Haruskah UMKM selalu memakai diskon untuk menarik pelanggan?",
        "a": "Tidak. Diskon adalah salah satu alat promosi, bukan fondasi strategi pemasaran. UMKM dapat menggunakan edukasi, diferensiasi, bundling, bukti sosial, layanan, kemudahan, atau penawaran lain yang relevan. Jika memakai diskon, hitung dampaknya terhadap margin dan tujuan kampanye."
      },
      {
        "q": "Bagaimana mengetahui kampanye pemasaran perlu diperbaiki?",
        "a": "Lihat rangkaian metriknya, bukan satu angka. Periksa apakah channel mendatangkan audiens yang tepat, berapa yang menjadi inquiry atau qualified lead, berapa biaya mendapatkannya, dan apakah prospek tersebut menghasilkan transaksi yang sehat. Jika trafik tinggi tetapi calon pelanggan relevan sangat sedikit, masalahnya berbeda dengan kampanye yang menghasilkan banyak lead berkualitas tetapi gagal dikonversi oleh proses penjualan."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "strategi-penjualan-umkm",
    "sourceSlug": "strategi-penjualan-umkm",
    "title": "Strategi Penjualan UMKM: Cara Meningkatkan Konversi Tanpa Banting Harga",
    "metaTitle": "Strategi Penjualan UMKM: Naikkan Konversi Tanpa Banting Harga",
    "description": "Pelajari strategi penjualan UMKM untuk meningkatkan konversi, menjaga margin, dan memenangkan pelanggan tanpa bergantung pada diskon atau banting harga.",
    "excerpt": "Panduan diagnosis funnel penjualan, qualified lead, offer, objection, follow-up, dan closing agar konversi meningkat tanpa selalu mengandalkan diskon.",
    "category": "Penjualan",
    "date": "2026-08-07",
    "modified": "2026-08-07",
    "readingTime": "6 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['strategi-penjualan-umkm'],
    "imageAlt": "Strategi penjualan UMKM dari qualified lead hingga closing tanpa banting harga.",
    "faq": [
      {
        "q": "Bagaimana cara meningkatkan penjualan tanpa banting harga?",
        "a": "Fokuskan perbaikan pada kualitas prospek, discovery kebutuhan, value yang disampaikan, struktur penawaran, bukti, penanganan keberatan, dan follow-up. Diskon dapat digunakan pada konteks tertentu, tetapi tidak perlu menjadi respons otomatis setiap kali prospek ragu."
      },
      {
        "q": "Apa bedanya pemasaran dan penjualan?",
        "a": "Pemasaran mendatangkan calon pelanggan dan membantu membentuk ketertarikan. Penjualan mengambil alih ketika prospek sudah cukup relevan, lalu membantu mereka memahami penawaran, menjawab keberatan, melakukan follow-up, dan mengambil keputusan pembelian."
      },
      {
        "q": "Mengapa pelanggan selalu membandingkan harga?",
        "a": "Perbandingan harga dapat terjadi karena produk memang mudah dibandingkan, value belum terlihat jelas, risiko pembelian belum terjawab, atau pelanggan mempunyai alternatif lain. Jangan langsung menyimpulkan masalahnya hanya pada branding atau hanya pada harga."
      },
      {
        "q": "Apakah teknik closing agresif efektif untuk UMKM?",
        "a": "Tidak ada satu teknik closing yang cocok untuk semua transaksi. Pendekatan yang terlalu agresif dapat merusak kepercayaan, terutama untuk pembelian yang membutuhkan pertimbangan. Fokuskan proses pada kebutuhan, value, bukti, dan next step yang jelas."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "strategi-operasional-umkm",
    "sourceSlug": "strategi-operasional-umkm",
    "title": "Strategi Operasional UMKM: Cara Membangun Sistem agar Bisnis Tidak Bergantung pada Owner",
    "metaTitle": "Strategi Operasional UMKM: Bangun Sistem Bisnis yang Efektif",
    "description": "Pelajari strategi operasional UMKM untuk membangun workflow, SOP, PIC, batas keputusan, dan kontrol agar bisnis tidak selalu bergantung pada owner.",
    "excerpt": "Panduan membangun workflow, SOP, PIC, decision rights, escalation rule, dan kontrol operasional agar bisnis tidak selalu menunggu owner.",
    "category": "Operasional",
    "date": "2026-08-07",
    "modified": "2026-08-07",
    "readingTime": "6 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['strategi-operasional-umkm'],
    "imageAlt": "Strategi operasional UMKM dengan workflow, SOP, PIC, dan kontrol agar bisnis tidak bergantung pada owner.",
    "faq": [
      {
        "q": "Bagaimana cara membuat SOP untuk UMKM yang baru mulai?",
        "a": "Mulailah dari proses yang paling sering diulang atau paling berisiko menimbulkan kesalahan. SOP minimum sebaiknya menjelaskan kapan proses dimulai, siapa PIC, langkah utama, standar hasil, kapan dianggap selesai, dan apa yang dilakukan ketika terjadi pengecualian."
      },
      {
        "q": "Kapan pekerjaan operasional sebaiknya didelegasikan?",
        "a": "Ketika pekerjaan rutin mulai menghambat owner menjalankan keputusan yang lebih strategis, proses tersebut layak dievaluasi untuk didelegasikan. Prioritaskan tugas yang berulang, dapat distandarkan, risikonya dapat dikendalikan, dan mempunyai PIC serta batas keputusan yang jelas."
      },
      {
        "q": "Apa bedanya masalah Operasional dan masalah SDM?",
        "a": "Operasional berfokus pada bagaimana pekerjaan mengalir: workflow, SOP, handoff, bottleneck, standar, dan kontrol. SDM berfokus pada orang yang menjalankannya: peran, kemampuan, target, feedback, evaluasi, dan pengembangan."
      },
      {
        "q": "Kapan UMKM membutuhkan software atau otomatisasi operasional?",
        "a": "Setelah proses manual cukup dipahami dan masalah yang ingin diselesaikan sudah jelas. Jika teknologi dipasang pada proses yang belum rapi, bisnis berisiko hanya mendigitalkan kekacauan. Evaluasi manfaat, biaya, kemampuan tim, integrasi, dan kebutuhan kontrol sebelum memilih tool."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "omzet-besar-kas-kosong",
    "sourceSlug": "cara-mengelola-cash-flow-umkm",
    "title": "Omzet Besar tapi Kas Selalu Kosong? Cara Mengelola Cash Flow UMKM agar Tidak Bocor",
    "metaTitle": "Omzet Besar, Kas Kosong? Cara Mengelola Cash Flow UMKM",
    "description": "Omzet tinggi belum tentu membuat bisnis sehat. Pelajari cara mengelola cash flow UMKM, menemukan kebocoran kas, mengatur modal kerja, dan menjaga arus kas.",
    "excerpt": "Panduan membedakan omzet, laba, cash flow, dan saldo kas; mengelola modal kerja, piutang, stok, forecast, serta dashboard arus kas UMKM.",
    "category": "Keuangan",
    "date": "2026-08-02",
    "modified": "2026-09-22",
    "readingTime": "6 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['omzet-besar-kas-kosong'],
    "imageAlt": "Dashboard cash flow UMKM dengan saldo kas, piutang, stok, dan forecast arus kas.",
    "faq": [
      {
        "q": "Apa bedanya omzet, laba, cash flow, dan saldo kas?",
        "a": "Omzet menunjukkan nilai penjualan. Laba menunjukkan hasil setelah pendapatan dikurangi biaya sesuai pencatatan bisnis. Cash flow menunjukkan pergerakan uang yang benar-benar masuk dan keluar selama periode tertentu. Saldo kas menunjukkan berapa uang yang tersedia pada suatu waktu."
      },
      {
        "q": "Mengapa bisnis bisa untung tetapi tetap kekurangan uang kas?",
        "a": "Karena waktu pengakuan pendapatan dan biaya tidak selalu sama dengan waktu uang diterima atau dibayar. Kas dapat tertahan di piutang atau persediaan, sementara gaji, supplier, sewa, cicilan, dan kewajiban lain tetap harus dibayar."
      },
      {
        "q": "Berapa margin yang sehat untuk UMKM?",
        "a": "Tidak ada satu persentase margin yang sehat untuk semua bisnis. Margin perlu dievaluasi berdasarkan struktur biaya, harga jual, model bisnis, kebutuhan modal kerja, serta kemampuan usaha menutup biaya dan menghasilkan laba secara konsisten. Gunakan data historis bisnis sendiri dan benchmark industri yang benar-benar relevan bila tersedia."
      },
      {
        "q": "Kapan UMKM membutuhkan software untuk mengelola keuangan?",
        "a": "Spreadsheet dapat cukup untuk transaksi yang masih sederhana dan dikendalikan dengan disiplin. Ketika volume transaksi, channel, stok, piutang, kebutuhan integrasi, atau kebutuhan audit meningkat, software keuangan dapat menjadi lebih relevan. Pilih berdasarkan kebutuhan proses, bukan sekadar fitur."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "strategi-mengelola-karyawan-umkm",
    "sourceSlug": "strategi-mengelola-karyawan-umkm",
    "title": "Strategi Mengelola Karyawan UMKM: Cara Membangun Tim Mandiri dan Solid",
    "metaTitle": "Cara Mengelola Karyawan UMKM agar Tim Mandiri dan Solid",
    "description": "Pelajari cara mengelola karyawan UMKM mulai dari pembagian peran, target kerja, evaluasi kinerja, feedback, delegasi, hingga pengembangan tim yang mandiri.",
    "excerpt": "Panduan people management UMKM: role clarity, job fit, onboarding, KPI, feedback, performance review, delegasi, dan pengembangan calon pemimpin.",
    "category": "SDM",
    "date": "2026-08-07",
    "modified": "2026-08-07",
    "readingTime": "6 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['strategi-mengelola-karyawan-umkm'],
    "imageAlt": "Strategi mengelola karyawan UMKM dengan peran, target, feedback, dan delegasi yang jelas.",
    "faq": [
      {
        "q": "Bagaimana cara membuat karyawan UMKM lebih mandiri?",
        "a": "Mulailah dari kejelasan peran, target, kemampuan, onboarding, feedback, dan batas keputusan. Mandiri bukan berarti bekerja tanpa arahan sama sekali, melainkan mampu menjalankan tanggung jawab dalam standar dan kewenangan yang jelas."
      },
      {
        "q": "Apa bedanya job description dan SOP?",
        "a": "Job description atau role menjelaskan siapa bertanggung jawab atas hasil apa. SOP menjelaskan bagaimana suatu proses dijalankan. Role clarity berada di Medan SDM; desain proses dan SOP dibahas lebih dalam di Medan Operasional."
      },
      {
        "q": "Apakah tim kecil membutuhkan struktur organisasi?",
        "a": "Tim kecil tetap membutuhkan pembagian tanggung jawab yang jelas, meskipun belum memerlukan organigram kompleks. Yang penting adalah setiap hasil mempunyai pemilik, jalur koordinasi dipahami, dan keputusan tidak jatuh di antara dua peran."
      },
      {
        "q": "Kapan UMKM sebaiknya mengevaluasi gaji atau bonus?",
        "a": "Evaluasi kompensasi perlu mempertimbangkan tanggung jawab posisi, kinerja, kemampuan bisnis, kondisi pasar tenaga kerja, kebijakan perusahaan, dan ketentuan yang berlaku. Jika memakai bonus berbasis kinerja, indikatornya harus jelas, dipahami karyawan, dan cukup banyak berada dalam kendali mereka."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "digitalisasi-umkm-tepat-sasaran",
    "sourceSlug": "digitalisasi-umkm-tepat-sasaran",
    "title": "Digitalisasi UMKM Anti-Boncos: Cara Memilih Aplikasi dan Otomatisasi yang Benar-Benar Dibutuhkan",
    "metaTitle": "Digitalisasi UMKM: Pilih Aplikasi dan Otomatisasi yang Tepat",
    "description": "Pelajari digitalisasi UMKM tanpa membuang anggaran. Diagnosis kebutuhan, lalu pilih aplikasi, AI, dan otomatisasi sesuai masalah bisnis.",
    "excerpt": "Panduan digitalisasi UMKM berbasis masalah, proses, digital maturity, TCO, integrasi, otomatisasi, AI, data, dan keamanan.",
    "category": "Digital",
    "date": "2026-08-07",
    "modified": "2026-08-07",
    "readingTime": "7 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['digitalisasi-umkm-tepat-sasaran'],
    "imageAlt": "Digitalisasi UMKM dengan kerangka Masalah, Proses, dan Tool yang tepat sasaran.",
    "faq": [
      {
        "q": "Perlukah UMKM pemula membuat aplikasi sendiri?",
        "a": "Untuk kebanyakan UMKM tahap awal, aplikasi sendiri biasanya bukan prioritas pertama. Evaluasi dahulu apakah pelanggan benar-benar membutuhkan fungsi khusus dan apakah kebutuhan tersebut belum dapat dilayani oleh platform yang sudah ada."
      },
      {
        "q": "Bagaimana mengetahui software benar-benar membantu bisnis?",
        "a": "Tentukan indikator sebelum implementasi, misalnya waktu proses, error, kapasitas tim, biaya, conversion assistance, atau risiko yang ingin dikurangi. Bandingkan kondisi sebelum dan sesudah, serta periksa apakah tim benar-benar menggunakan tool tersebut."
      },
      {
        "q": "Bagaimana cara mengamankan data bisnis saat digitalisasi?",
        "a": "Gunakan aplikasi resmi, aktifkan autentikasi multifaktor (MFA/2FA) bila tersedia, buat akun per pengguna, atur hak akses, lakukan backup sesuai kebutuhan, cabut akses ketika staf keluar, dan waspadai phishing. Untuk data sensitif, pahami kebijakan layanan dan siapa yang dapat mengakses data."
      },
      {
        "q": "Apa yang harus dicek sebelum menggunakan AI untuk data bisnis?",
        "a": "Periksa jenis data yang akan diunggah, kebijakan privasi, retensi data, izin penggunaan data, pengaturan akun, hak penggunaan output, dan kebutuhan bisnis. Hindari memasukkan data sensitif bila Anda belum memahami kebijakan dan risiko layanan yang digunakan."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "strategi-produksi-umkm",
    "sourceSlug": "strategi-produksi-umkm",
    "title": "Strategi Produksi UMKM: Cara Menaikkan Kapasitas Tanpa Menurunkan Kualitas",
    "metaTitle": "Strategi Produksi UMKM: Naikkan Kapasitas, Jaga Kualitas",
    "description": "Pelajari strategi produksi UMKM untuk menaikkan kapasitas, menemukan bottleneck, mengurangi waste, menjaga kualitas, dan menilai kebutuhan mesin.",
    "excerpt": "Panduan capacity, bottleneck, standardisasi, QC, reject/rework, waste, demand planning, downtime, dan keputusan investasi produksi.",
    "category": "Produksi",
    "date": "2026-08-07",
    "modified": "2026-08-07",
    "readingTime": "7 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['strategi-produksi-umkm'],
    "imageAlt": "Strategi produksi UMKM untuk menaikkan kapasitas dengan bottleneck dan quality control terukur.",
    "faq": [
      {
        "q": "Bagaimana cara meningkatkan kapasitas produksi UMKM tanpa menurunkan kualitas?",
        "a": "Mulailah dengan mengukur kapasitas, output aktual, bottleneck, reject atau rework, dan downtime. Standarkan spesifikasi produk dan proses, kurangi waste, lalu tambah orang, shift, atau mesin hanya jika benar-benar menyelesaikan bottleneck yang sudah teridentifikasi."
      },
      {
        "q": "Bagaimana cara mengetahui bottleneck produksi?",
        "a": "Cari tahap dengan antrean paling panjang, output paling lambat, downtime paling sering, atau proses yang membatasi output keseluruhan. Bandingkan kapasitas setiap tahap agar investasi tidak diarahkan ke bagian yang sebenarnya bukan pembatas."
      },
      {
        "q": "Kapan UMKM perlu membeli mesin produksi baru?",
        "a": "Pertimbangkan setelah memastikan mesin memang bottleneck, kapasitas saat ini sudah dimanfaatkan dengan cukup baik, permintaan cukup konsisten, dan masalah bukan berasal dari setup, maintenance, layout, SDM, atau bahan. Hitung juga total biaya investasi dan dampaknya pada cash flow."
      },
      {
        "q": "Apa bedanya masalah Produksi dan masalah Operasional?",
        "a": "Produksi berfokus pada proses menghasilkan produk: kapasitas, throughput, kualitas, waste, reject, downtime, dan alat. Operasional mencakup alur kerja bisnis yang lebih luas dari order masuk sampai layanan pelanggan."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "strategi-distribusi-umkm",
    "sourceSlug": "strategi-distribusi-umkm",
    "title": "Strategi Distribusi UMKM: Cara Memperluas Pasar Tanpa Kehilangan Kendali",
    "metaTitle": "Strategi Distribusi UMKM: Perluas Pasar dan Kendalikan Stok",
    "description": "Pelajari strategi distribusi UMKM untuk memilih channel, mengelola stok, fulfillment, reseller, dan logistik agar produk mudah dibeli.",
    "excerpt": "Panduan memilih channel, menghitung economics, menempatkan stok, mengelola fulfillment, partner, konflik channel, dan visibilitas distribusi.",
    "category": "Distribusi",
    "date": "2026-08-07",
    "modified": "2026-09-22",
    "readingTime": "7 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['strategi-distribusi-umkm'],
    "imageAlt": "Strategi distribusi UMKM dengan channel, stok, fulfillment, reseller, dan visibilitas yang terkendali.",
    "faq": [
      {
        "q": "Apa bedanya reseller, distributor, dan dropship dalam strategi distribusi?",
        "a": "Perbedaannya terutama pada siapa yang memegang stok, siapa yang memenuhi order, skala hubungan, dan tanggung jawab channel. Dropship biasanya tidak memegang stok, reseller dapat membeli atau memegang stok untuk dijual kembali, sedangkan distributor umumnya mengambil fungsi distribusi yang lebih luas. Detail praktik dapat berbeda menurut model bisnis dan perjanjian."
      },
      {
        "q": "Bagaimana menentukan margin reseller atau distributor?",
        "a": "Mulai dari economics channel: harga jual, biaya produk, fulfillment, logistik, retur, dukungan promosi, risiko stok, termin pembayaran, dan fungsi yang diambil alih partner. Sisakan economics yang membuat channel menarik bagi partner sekaligus tetap sehat bagi bisnis. Tidak ada satu persentase yang cocok untuk semua UMKM."
      },
      {
        "q": "Kapan UMKM perlu menempatkan stok lebih dekat dengan pelanggan?",
        "a": "Ketika lead time atau biaya pengiriman dari pusat mulai menghambat layanan, volume wilayah cukup konsisten, dan economics penyimpanan atau fulfillment lokal dapat dibenarkan. Evaluasi risiko inventory dan kemampuan kontrol sebelum memindahkan stok."
      },
      {
        "q": "Bagaimana menghindari kehilangan kendali saat channel bertambah?",
        "a": "Bangun visibilitas atas stok, penjualan, retur, biaya, piutang, dan performa partner. Tetapkan aturan kerja sama, penanggung jawab (PIC), reporting, dan sumber data utama sehingga owner tidak bergantung pada laporan informal dari masing-masing channel."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "teknik-negosiasi-bisnis-umkm",
    "sourceSlug": "teknik-negosiasi-bisnis-umkm",
    "title": "Teknik Negosiasi Bisnis UMKM: Cara Menghadapi Klien dan Supplier Tanpa Mengorbankan Margin",
    "metaTitle": "Cara Negosiasi UMKM agar Margin Aman: Klien & Supplier",
    "description": "Pelajari cara menyiapkan BATNA, batas harga, konsesi, termin, dan trade-off saat bernegosiasi dengan klien atau supplier tanpa mengorbankan margin.",
    "excerpt": "Panduan BATNA, batas, kepentingan, variabel, konsesi, trade-off, negosiasi B2B/B2C, supplier, economics, dan dokumentasi deal.",
    "category": "Negosiasi",
    "date": "2026-08-07",
    "modified": "2026-09-02",
    "readingTime": "6 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['teknik-negosiasi-bisnis-umkm'],
    "imageAlt": "Teknik negosiasi bisnis UMKM dengan BATNA, batas, klien, dan supplier.",
    "faq": [
      {
        "q": "Apa yang harus dilakukan jika pelanggan meminta diskon?",
        "a": "Jangan langsung menerima atau menolak. Cari tahu alasan permintaan dan lihat apakah ada variabel lain yang dapat dipertukarkan, seperti volume, paket, scope, pembayaran, atau delivery. Setiap konsesi sebaiknya mempunyai alasan dan pertukaran yang jelas."
      },
      {
        "q": "Bagaimana cara menegosiasikan termin pembayaran dengan klien B2B?",
        "a": "Hitung dahulu kebutuhan modal kerja dan batas yang sanggup ditanggung, lalu negosiasikan struktur seperti uang muka, milestone, atau termin sesuai karakter transaksi. Pastikan syarat tertulis dan dampaknya terhadap cash flow dipahami."
      },
      {
        "q": "Bagaimana bernegosiasi jika supplier hanya sedikit?",
        "a": "Tingkatkan alternatif bila memungkinkan dan negosiasikan variabel selain harga: volume, forecast, lead time, service level, MOQ, spesifikasi, atau pembayaran. Hindari membuat komitmen eksklusif tanpa memahami nilai dan risikonya."
      },
      {
        "q": "Kapan sebaiknya UMKM menolak sebuah deal?",
        "a": "Ketika syarat berada di luar batas yang telah ditetapkan dan alternatif yang tersedia lebih baik daripada menerima kesepakatan tersebut. Keputusan sebaiknya didasarkan pada economics, risiko, kapasitas, dan BATNA, bukan emosi."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "strategi-ekspansi-umkm",
    "sourceSlug": "strategi-ekspansi-umkm",
    "title": "Strategi Ekspansi UMKM: Syarat Penting Sebelum Membuka Cabang Baru",
    "metaTitle": "Strategi Ekspansi UMKM Sebelum Membuka Cabang Baru",
    "description": "Pelajari syarat ekspansi UMKM sebelum membuka cabang baru, mulai dari cash flow, SOP, tim, permintaan pasar, unit economics hingga kesiapan operasional.",
    "excerpt": "Panduan kesiapan ekspansi: unit economics, demand validation, cash flow, replicability, leadership, capacity, distribution, data visibility, dan scenario planning.",
    "category": "Ekspansi",
    "date": "2026-08-07",
    "modified": "2026-08-07",
    "readingTime": "7 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['strategi-ekspansi-umkm'],
    "imageAlt": "Strategi ekspansi UMKM dengan unit economics, demand, cash flow, tim, sistem, dan kesiapan cabang.",
    "faq": [
      {
        "q": "Kapan UMKM siap membuka cabang kedua?",
        "a": "Ketika unit pertama mempunyai economics yang cukup sehat dan dapat dipahami, proses inti dapat direplikasi, ada tim yang mampu menjalankan unit, kemampuan kas mencukupi, serta permintaan di lokasi baru sudah divalidasi."
      },
      {
        "q": "Lebih baik ekspansi dengan modal sendiri atau investor?",
        "a": "Tidak ada satu sumber modal yang selalu paling tepat. Evaluasi biaya modal, kebutuhan kas, tingkat kontrol yang ingin dipertahankan, risiko, kecepatan ekspansi, kemampuan membayar kembali bila menggunakan utang, serta nilai strategis yang dibawa mitra atau investor."
      },
      {
        "q": "Apa risiko utama membuka cabang baru?",
        "a": "Risiko dapat berasal dari demand yang tidak sesuai asumsi, biaya lokasi, kekurangan modal kerja, penurunan kualitas, ketidaksiapan tim, kapasitas supply, logistik, serta lemahnya kontrol data dan operasional. Prioritas risiko berbeda untuk setiap model bisnis."
      },
      {
        "q": "Bagaimana cara menguji pasar sebelum menyewa lokasi permanen?",
        "a": "Gunakan bukti permintaan yang sudah tersedia dan, bila model bisnis memungkinkan, lakukan pengujian dengan komitmen yang lebih kecil sebelum membuat investasi permanen. Tujuannya bukan memperoleh kepastian penuh, tetapi mengurangi asumsi yang belum teruji."
      }
    ],
    "authorType": "Organization",
    "authorName": "UMKM Naik Kelas"
  },
  {
    "slug": "mengatasi-perang-harga-ecommerce-umkm",
    "title": "Terjebak Perang Harga di E-Commerce? Ini Cara UMKM Menang Tanpa Banting Harga",
    "description": "Pelajari cara UMKM menghadapi perang harga e-commerce tanpa banting harga: hitung batas harga, perkuat diferensiasi, susun bundling, dan jaga margin.",
    "category": "Strategi Penjualan",
    "date": "2026-08-06",
    "modified": "2026-08-06",
    "readingTime": "10 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['mengatasi-perang-harga-ecommerce-umkm'],
    "imageAlt": "Ilustrasi strategi UMKM memenangkan persaingan e-commerce tanpa perang harga menggunakan taktik Sun Tzu",
    "authorType": "Person",
    "authorName": "W. Gunawan"
  },
  {
    "slug": "diagnosis-sebelum-strategi",
    "title": "Diagnosis Sebelum Strategi: Kenapa UMKM Sering Salah Obat",
    "description": "Banyak UMKM langsung menambah iklan padahal masalahnya bisa berada di kas, proses, atau tim. Pelajari urutan diagnosis sebelum menyusun strategi.",
    "category": "Diagnosis 10 Medan",
    "date": "2026-08-04",
    "modified": "2026-08-04",
    "readingTime": "6 menit",
    "image": ARTICLE_FEATURE_IMAGES_HQ['diagnosis-sebelum-strategi'],
    "imageAlt": "Pemilik UMKM berdiskusi strategi di depan papan 10 medan bisnis",
    "authorType": "Person",
    "authorName": "W. Gunawan"
  }
];
