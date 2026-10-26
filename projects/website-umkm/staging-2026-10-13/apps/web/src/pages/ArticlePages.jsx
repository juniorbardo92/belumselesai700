import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowRight, Calendar, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Reveal from '@/components/Reveal';
import { PageHero, Breadcrumb, ProductCard } from '@/components/Bits';
import { SITE, ARTICLES, PRODUCTS, ARTICLE_FAQS } from '@/data/site';
import { ARTICLE_HTML_EXISTING_A } from '@/lib/format';
import { ARTICLE_HTML_EXISTING_B } from '@/lib/utils';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';

const SUPPORTING_ARTICLE_IMAGES = {};

function getCrawlableImage(image) {
  if (typeof image !== 'string' || !image.trim()) return undefined;
  try {
    const url = new URL(image.trim(), `${SITE.url.replace(/\/$/, '')}/`);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function ArticleMeta({ title, description, url, image, type = 'website', schema }) {
  const crawlableImage = getCrawlableImage(image);
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index,follow,max-image-preview:large" />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:type" content={type} />
      <meta property="og:locale" content="id_ID" />
      {crawlableImage && <meta property="og:image" content={crawlableImage} />}
      <meta name="twitter:card" content={crawlableImage ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {crawlableImage && <meta name="twitter:image" content={crawlableImage} />}
      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema).replace(/</g, '\\u003c')}
        </script>
      )}
    </Helmet>
  );
}

// Tiga tautan masuk kontekstual untuk setiap panduan prioritas.
const CONTEXTUAL_GUIDES = [
  {
    target: 'meningkatkan-konversi-penjualan-umkm',
    sources: ['strategi-penjualan-umkm', 'follow-up-calon-pembeli-umkm', 'teknik-negosiasi-bisnis-umkm'],
    heading: 'Panduan lanjutan: tingkatkan konversi penjualan',
    text: 'Telusuri tahap prospek, penawaran, follow-up, dan closing yang paling banyak kehilangan calon pembeli melalui ',
    label: 'cara meningkatkan konversi penjualan UMKM',
  },
  {
    target: 'delegasi-karyawan-umkm',
    sources: ['strategi-mengelola-karyawan-umkm', 'owner-bottleneck-umkm', 'strategi-operasional-umkm'],
    heading: 'Panduan lanjutan: delegasi yang lebih jelas',
    text: 'Saat pekerjaan terus kembali ke owner, perjelas hasil, standar selesai, batas keputusan, dan aturan eskalasi melalui ',
    label: 'cara delegasi karyawan UMKM',
  },
  {
    target: 'stok-tidak-merata-umkm',
    sources: ['strategi-distribusi-umkm', 'stok-mati-umkm', 'omzet-besar-kas-kosong'],
    heading: 'Panduan lanjutan: atur stok per lokasi',
    text: 'Jika barang menumpuk di satu lokasi tetapi habis di lokasi lain, evaluasi alokasi dan transfer sebelum menambah pembelian melalui ',
    label: 'cara mengatasi stok tidak merata pada UMKM',
  },
];

function ContextualGuides({ slug }) {
  const guides = CONTEXTUAL_GUIDES.filter((guide) =>
    guide.sources.includes(slug) && ARTICLES.some((article) => article.slug === guide.target)
  );
  return guides.map((guide) => (
    <aside key={guide.target} className="mt-12 rounded-2xl border border-primary/20 bg-primary/5 p-6">
      <h2 className="text-xl font-extrabold text-neutral-900">{guide.heading}</h2>
      <p className="mt-3 text-sm leading-7 text-neutral-700">
        {guide.text}
        <Link to={`/artikel/${guide.target}`} className="font-bold text-primary underline underline-offset-2">
          {guide.label}
        </Link>
        .
      </p>
    </aside>
  ));
}

function getDisplayImage(article) {
  if (!article) return undefined;
  if (SUPPORTING_ARTICLE_IMAGES[article.slug]) return SUPPORTING_ARTICLE_IMAGES[article.slug];
  if (typeof article.image === 'string' && article.image.trim()) return article.image;
  if (article.parentSlug) {
    const parent = ARTICLES.find((item) => item.slug === article.parentSlug);
    if (parent?.image) return parent.image;
  }
  return undefined;
}

function SafeArticleVisual({
  src,
  alt = '',
  category = 'Strategi UMKM',
  className = '',
  eager = false,
  sizes,
  srcSet,
}) {
  const [failedSrc, setFailedSrc] = React.useState(null);

  if (!src || failedSrc === src) {
    return (
      <div
        className={`relative overflow-hidden bg-gradient-to-br from-neutral-950 via-neutral-900 to-primary ${className}`}
        role="img"
        aria-label={alt || `Ilustrasi artikel ${category}`}
      >
        <div className="absolute inset-0 flex flex-col justify-end p-5 text-white">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-300">
            100 Strategi Sun Tzu
          </span>
          <span className="mt-2 max-w-[18rem] font-display text-2xl leading-tight">
            {category}
          </span>
          <span className="mt-2 text-xs font-semibold text-white/70">
            Diagnosis dulu, strategi kemudian.
          </span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}

export { getDisplayImage as getArticleDisplayImage };

export function ArtikelPage() {
  const title = 'Artikel Strategi Bisnis UMKM — UMKM Naik Kelas';
  const description = 'Kumpulan panduan Business Health Check 10 Medan untuk UMKM: pemasaran, penjualan, operasional, keuangan, SDM, digital, produksi, distribusi, negosiasi, dan ekspansi.';
  return (
    <>
      <ArticleMeta
        title={title}
        description={description}
        url={`${SITE.url.replace(/\/$/, '')}/artikel`}
        image={getDisplayImage(ARTICLES[0])}
      />
      <PageHero kicker="Ruang belajar" title="Artikel" subtitle="Panduan praktis untuk membaca masalah, memilih prioritas, dan membangun bisnis tanpa mengandalkan perang harga.">
        <div className="mt-8"><Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Artikel' }]} /></div>
      </PageHero>
      <section className="bg-white px-5 py-16">
        <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-3">
          {ARTICLES.map((a, i) => (
            <Reveal key={a.slug} delay={i * 0.06}>
              <Link to={`/artikel/${a.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl ring-1 ring-black/10">
                <SafeArticleVisual
                  src={getDisplayImage(a)}
                  alt={a.imageAlt || a.title}
                  category={a.category}
                  className="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <div className="flex flex-1 flex-col p-6">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{a.category}</span>
                  <h2 className="mt-2 text-lg font-extrabold leading-snug text-neutral-900 group-hover:text-primary">{a.title}</h2>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-neutral-600">{a.description}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary">Baca artikel <ArrowRight className="h-4 w-4" /></span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}

const BODY = {
  'mengatasi-perang-harga-ecommerce-umkm': [
    ['p', 'Membuka dasbor e-commerce dan melihat pesanan meningkat memang terasa melegakan. Namun, tanda bahayanya muncul ketika penjualan terlihat ramai sementara kas operasional justru semakin tipis. Kondisi ini sering terjadi ketika harga terus diturunkan tanpa menghitung seluruh biaya yang mengikuti setiap transaksi.'],
    ['p', 'Masalahnya bukan sekadar diskon. Akar persoalannya biasanya berada pada kombinasi margin yang tidak dipahami, produk yang sulit dibedakan, biaya platform yang terlewat, dan keputusan pemasaran yang hanya mengikuti gerakan kompetitor. Di sinilah prinsip “Diagnosis Sebelum Strategi” menjadi penting.'],
    ['h2', 'Mengapa UMKM mudah terseret perang harga?'],
    ['h3', '1. Omzet dianggap sama dengan laba'],
    ['p', 'Omzet hanya menunjukkan nilai penjualan. Ia belum menjawab berapa uang yang tersisa setelah harga pokok, biaya admin marketplace, iklan, subsidi ongkir, kemasan, retur, tenaga kerja, dan biaya operasional lain dibayar. Volume pesanan yang tinggi dapat terlihat hebat, tetapi tetap melemahkan bisnis apabila laba per transaksi terlalu kecil.'],
    ['h3', '2. Produk tidak memiliki pembeda yang jelas'],
    ['p', 'Ketika produk, foto, manfaat, layanan, dan pengalaman belanja terlihat sama dengan toko lain, calon pembeli akan lebih mudah membandingkan harga. Akibatnya, pemilik usaha merasa harus selalu lebih murah untuk mendapatkan pesanan.'],
    ['h3', '3. Diskon digunakan tanpa tujuan yang terukur'],
    ['p', 'Diskon dapat menjadi alat yang berguna apabila tujuannya jelas—misalnya menghabiskan stok tertentu, mengenalkan produk baru, atau meningkatkan nilai keranjang. Namun, diskon yang berjalan terus-menerus tanpa batas margin hanya memindahkan tekanan dari penjualan ke arus kas.'],
    ['callout', 'Perang harga bukan selalu masalah pemasaran. Ia bisa berawal dari biaya produksi, distribusi, stok, struktur paket, atau proses penjualan yang belum rapi.'],
    ['h2', 'Bahaya tersembunyi dari banting harga terus-menerus'],
    ['h3', 'Margin menipis dan kas kehilangan ruang bernapas'],
    ['p', 'Saat harga turun, sebagian besar biaya tidak ikut turun. Kardus, lakban, komisi platform, biaya iklan, upah, listrik, dan risiko retur tetap ada. Margin yang terlalu tipis membuat usaha tidak memiliki cadangan untuk memperbaiki kualitas, mengembangkan produk, atau menghadapi penjualan yang melambat.'],
    ['h3', 'Pelanggan hanya mengenal Anda sebagai toko murah'],
    ['p', 'Pelanggan yang datang hanya karena harga cenderung mudah berpindah ketika menemukan penjual yang lebih murah. Dalam jangka panjang, bisnis juga semakin sulit menaikkan harga karena pasar sudah terbiasa menunggu promo.'],
    ['h3', 'Operasional makin berat'],
    ['p', 'Pesanan yang meningkat dengan laba sangat kecil tetap membutuhkan waktu untuk memproses, mengemas, menangani chat, menindaklanjuti komplain, dan mengelola retur. Owner dan tim dapat bekerja lebih keras tanpa mendapatkan ruang keuangan yang sebanding.'],
    ['h2', 'Diagnosis 10 Medan sebelum memilih strategi'],
    ['p', 'Sebelum menurunkan harga atau menambah iklan, periksa kondisi usaha melalui 10 medan: Pemasaran, Penjualan, Operasional, Keuangan, Tim/SDM, Digital, Produksi, Distribusi, Negosiasi, dan Ekspansi. Tujuannya bukan memberi nilai baik atau buruk, melainkan menemukan area yang paling memengaruhi masalah saat ini.'],
    ['ul', [
      'Medan Keuangan: berapa margin bersih setiap produk setelah seluruh biaya transaksi?',
      'Medan Pemasaran: apakah pesan dan target pasar sudah cukup spesifik?',
      'Medan Penjualan: apakah penawaran memiliki alasan membeli selain harga?',
      'Medan Produksi: apakah biaya bahan, waktu, dan pemborosan sudah terkendali?',
      'Medan Distribusi: apakah stok, pengiriman, komisi, dan retur sudah dihitung?',
      'Medan Digital: apakah iklan dan marketplace dinilai berdasarkan biaya per pesanan dan laba?',
    ]],
    ['h2', '5 cara UMKM keluar dari perang harga'],
    ['h3', '1. Pilih ceruk yang lebih spesifik'],
    ['p', 'Jangan selalu menyerang pasar umum yang dikuasai pemain bermodal besar. Pilih kelompok pelanggan, masalah, ukuran paket, atau konteks penggunaan yang lebih spesifik. Produk yang dirancang untuk kebutuhan tertentu akan lebih sulit dibandingkan hanya berdasarkan harga satuan.'],
    ['h3', '2. Bangun pembeda yang sulit disalin'],
    ['p', 'Pembeda tidak harus selalu berupa produk baru. Ia dapat berupa panduan penggunaan, respons chat yang jelas, konsultasi sebelum membeli, standar pengemasan, garansi, kecepatan proses, pilihan personalisasi, atau layanan setelah pembelian.'],
    ['h3', '3. Naikkan nilai melalui paket bertingkat'],
    ['p', 'Alih-alih memotong harga satu produk, susun paket yang memberi pilihan. Contohnya: paket coba, paket hemat, dan paket lengkap. Dengan cara ini, pelanggan membandingkan manfaat antarpaket, bukan hanya harga satuan dengan kompetitor.'],
    ['h3', '4. Benahi retensi pelanggan'],
    ['p', 'Pertumbuhan yang lebih sehat tidak hanya berasal dari transaksi pertama. Siapkan pesan tindak lanjut, pengingat penggunaan, penawaran pembelian ulang, dan pelayanan yang konsisten. Pelanggan yang kembali dapat mengurangi ketergantungan pada iklan dan diskon untuk mencari pembeli baru.'],
    ['h3', '5. Hitung batas harga terendah'],
    ['p', 'Tentukan harga minimum yang masih menjaga laba dan kas. Masukkan harga pokok, biaya kemasan, admin platform, iklan, subsidi ongkir, retur, tenaga kerja, serta biaya operasional yang relevan. Setelah batas ini diketahui, keputusan promo tidak lagi dibuat hanya karena panik melihat harga kompetitor.'],
    ['h2', 'Contoh sederhana: jangan hanya melihat harga jual'],
    ['p', 'Misalnya sebuah produk dijual Rp50.000. Setelah harga pokok Rp25.000, biaya platform Rp5.000, iklan Rp7.000, kemasan Rp2.000, dan estimasi retur atau komplain Rp1.000, sisa sebelum biaya operasional lain hanya Rp10.000. Jika harga dipotong Rp8.000 tanpa perubahan biaya, ruang laba hampir habis. Angka contoh ini bersifat ilustratif; gunakan data bisnis Anda sendiri.'],
    ['h2', 'Berhenti bereaksi, mulai memegang peta'],
    ['p', 'Keluar dari perang harga bukan berarti tidak pernah memberikan diskon. Artinya, Anda memahami kapan diskon digunakan, produk mana yang aman dipromosikan, berapa batas marginnya, dan nilai apa yang harus diperkuat agar pelanggan tidak hanya melihat harga.'],
    ['p', 'Buku 100 Strategi Sun Tzu: UMKM Naik Kelas — New Edition dan Business Health Check 10 Medan dirancang untuk membantu pemilik usaha mengubah masalah yang terasa bercampur menjadi prioritas, tindakan, PIC, jadwal, dan ukuran hasil yang lebih jelas.'],
  ],
  'diagnosis-sebelum-strategi': [
    ['p', 'Banyak pemilik usaha langsung menambah iklan ketika penjualan turun. Padahal penyebabnya dapat berada pada stok, margin, proses pemenuhan pesanan, kualitas penawaran, atau pembagian kerja tim. Salah diagnosis membuat usaha menjalankan tindakan yang tidak menyentuh akar masalah.'],
    ['h2', 'Urutan diagnosis yang lebih aman'],
    ['ol', [
      'Periksa angka: kas, margin, biaya tetap, biaya per transaksi, dan titik impas.',
      'Periksa proses: dari pesanan masuk sampai produk diterima pelanggan.',
      'Periksa penawaran: target, masalah pelanggan, manfaat, bukti, dan alasan membeli.',
      'Periksa orang: siapa bertanggung jawab, kapan pekerjaan selesai, dan bagaimana hasil ditinjau.',
      'Pilih satu sampai tiga prioritas untuk 30 hari, bukan memperbaiki semuanya sekaligus.',
    ]],
    ['p', 'Business Health Check 10 Medan memberi kerangka pemeriksaan yang dapat digunakan berulang. Hasilnya bukan vonis, melainkan bahan untuk memilih gerakan yang lebih tepat.'],
  ],
  'omzet-besar-kas-kosong': [
    ['p', 'Penjualan ramai tetapi rekening selalu menipis menunjukkan bahwa omzet belum berubah menjadi kas yang sehat. Pemeriksaan perlu dimulai dari aliran uang dan proses yang menyertainya.'],
    ['h2', 'Lima titik yang perlu diperiksa'],
    ['ol', [
      'Stok lambat bergerak yang menahan uang terlalu lama.',
      'Diskon, biaya platform, iklan, dan subsidi ongkir yang belum masuk perhitungan margin.',
      'Piutang pelanggan, reseller, atau mitra yang tidak memiliki jadwal penagihan jelas.',
      'Pengeluaran pribadi dan usaha yang masih tercampur.',
      'Belanja iklan yang dinilai dari omzet, bukan biaya per pesanan dan laba.',
    ]],
    ['p', 'Urutkan masalah berdasarkan nilai rupiah dan dampaknya terhadap operasional. Perbaiki yang paling besar lebih dahulu, lalu pantau perubahan kas secara mingguan.'],
  ],
};

const ARTICLE_HTML_PROFESI = {
  "cara-mendapatkan-listing-properti-eksklusif": "<h2>Mengapa agen sering gagal mendapat listing eksklusif?</h2>\n<p>Banyak agen properti masuk ke pertemuan dengan satu tujuan: segera mendapatkan mandat jual. Akibatnya pembicaraan terlalu cepat pindah ke komisi, harga, dan janji \"cepat laku\". Padahal pemilik properti biasanya sedang menilai sesuatu yang lebih mendasar: apakah agen ini memahami situasi saya, apakah komunikasinya bisa dipercaya, dan apakah proses kerjanya jelas.</p>\n<p>Di sinilah prinsip <strong>Diagnosis dulu. Strategi kemudian.</strong> menjadi penting. Sebelum menawarkan pemasaran, pahami dulu alasan pemilik menjual, tenggat waktu, kondisi legalitas, kisaran harga yang diharapkan, dan tingkat urgensinya. Listing eksklusif lahir dari rasa percaya bahwa agen mampu memimpin proses, bukan sekadar memasang iklan.</p>\n<h2>1. Bedakan \"harga yang diinginkan\" dan \"harga yang bisa diuji pasar\"</h2>\n<p>Agen yang langsung menyetujui semua angka pemilik terlihat menyenangkan di awal, tetapi bisa menciptakan masalah di belakang. Jelaskan dengan sopan perbedaan antara harga emosional dan harga yang realistis untuk diuji.</p>\n<p>Gunakan tiga lapisan data sederhana:</p>\n<ul>\n<li>properti pembanding yang benar-benar relevan,</li>\n<li>kondisi fisik dan legalitas properti,</li>\n<li>respon pasar pada properti sejenis.</li>\n</ul>\n<p>Tujuannya bukan memaksa pemilik menurunkan harga, tetapi membuat keputusan berbasis medan yang nyata.</p>\n<h2>2. Tawarkan sistem kerja, bukan hanya janji</h2>\n<p>Listing eksklusif lebih mudah diperoleh jika pemilik tahu apa yang akan terjadi setelah surat penunjukan ditandatangani. Buat alur kerja yang terlihat profesional, misalnya:</p>\n<ol>\n<li>audit dokumen dan kondisi unit,</li>\n<li>penentuan positioning,</li>\n<li>produksi foto/video,</li>\n<li>distribusi ke kanal yang relevan,</li>\n<li>penyaringan calon pembeli,</li>\n<li>jadwal viewing,</li>\n<li>laporan respon pasar mingguan,</li>\n<li>strategi negosiasi dan closing.</li>\n</ol>\n<p>Pemilik tidak hanya membeli akses ke jaringan Anda. Mereka membeli <strong>kepastian proses</strong>.</p>\n<h2>3. Hindari perang fee</h2>\n<p>Menurunkan fee tanpa strategi biasanya hanya membuat agen bekerja lebih berat dengan margin lebih tipis. Bila pemilik membandingkan komisi, jangan buru-buru membalas dengan diskon. Alihkan pembicaraan ke nilai kerja yang dapat diukur: kualitas materi pemasaran, kecepatan respon, laporan berkala, filtering buyer, dan kemampuan negosiasi.</p>\n<p>Fee yang sehat memberi ruang bagi agen untuk menjalankan proses dengan serius. Jika fee terlalu ditekan, kualitas pelayanan biasanya ikut menurun.</p>\n<h2>4. Bangun bukti kerja yang mudah dipahami</h2>\n<p>Pemilik properti tidak selalu butuh presentasi panjang. Mereka butuh bukti yang relevan. Siapkan satu halaman sederhana berisi:</p>\n<ul>\n<li>contoh foto/video listing,</li>\n<li>contoh laporan mingguan,</li>\n<li>contoh alur screening calon pembeli,</li>\n<li>testimoni atau studi kasus yang diizinkan,</li>\n<li>standar komunikasi Anda.</li>\n</ul>\n<p>Bukti konkret mengurangi kebutuhan untuk terlalu banyak meyakinkan lewat kata-kata.</p>\n<h2>5. Follow-up dengan konteks</h2>\n<p>Jangan follow-up hanya dengan \"bagaimana Pak/Bu, jadi listing dengan saya?\". Bawa konteks baru. Misalnya: perubahan harga pembanding, insight dari calon pembeli, atau saran kecil untuk meningkatkan daya tarik unit.</p>\n<p>Follow-up yang memberi nilai menunjukkan bahwa Anda sudah bekerja bahkan sebelum transaksi terjadi.</p>\n<h2>Checklist sebelum meminta listing eksklusif</h2>\n<ul>\n<li>Saya sudah memahami alasan pemilik menjual.</li>\n<li>Saya tahu target waktu dan batas toleransi harga.</li>\n<li>Saya sudah menjelaskan rencana pemasaran.</li>\n<li>Saya punya standar laporan yang jelas.</li>\n<li>Saya tidak menjadikan diskon fee sebagai senjata utama.</li>\n<li>Saya punya bukti kerja yang bisa ditunjukkan.</li>\n</ul>\n<h2>Kesimpulan</h2>\n<p>Agen properti yang kuat tidak perlu menang dengan fee paling rendah. Ia perlu terlihat paling siap membaca medan, mengelola proses, dan menjaga kepentingan pemilik. Listing eksklusif adalah hasil dari kepercayaan pada sistem kerja.</p>\n<p><strong>Diagnosis dulu. Strategi kemudian.</strong></p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Pelajari kerangka strategi yang lebih lengkap melalui <strong>Paket Jalur Agen Properti</strong> dan Buku <em>100 Strategi Sun Tzu: UMKM Naik Kelas</em>. <a href=\"/program/agen-properti\">Lihat Program Agen Properti</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-pemasaran-umkm\">Strategi Pemasaran UMKM</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/teknik-negosiasi-bisnis-umkm\">Teknik Negosiasi Bisnis UMKM</a></li>\n</ul>",
  "cara-prospecting-agen-asuransi-tanpa-spam": "<h2>Prospecting bukan mengirim penawaran sebanyak-banyaknya</h2>\n<p>Agen asuransi sering merasa harus terus mencari orang baru. Masalahnya, jika setiap percakapan langsung berubah menjadi penawaran, calon nasabah cepat defensif.</p>\n<p>Prospecting yang sehat dimulai dengan relevansi. Siapa yang benar-benar memiliki kebutuhan yang dapat Anda bantu pahami?</p>\n<h2>1. Segmentasikan berdasarkan situasi hidup</h2>\n<p>Contoh segmen:</p>\n<ul>\n<li>keluarga muda,</li>\n<li>orang tua dengan anak sekolah,</li>\n<li>profesional dengan tanggungan,</li>\n<li>pemilik usaha,</li>\n<li>orang yang baru membeli rumah,</li>\n<li>orang yang sedang menyiapkan pensiun.</li>\n</ul>\n<p>Setiap segmen punya risiko dan prioritas berbeda. Jangan gunakan pesan yang sama untuk semuanya.</p>\n<h2>2. Mulai dari pertanyaan, bukan produk</h2>\n<p>Gunakan pertanyaan yang membuat calon nasabah berpikir:</p>\n<ul>\n<li>\"Kalau penghasilan berhenti enam bulan, kewajiban apa yang tetap harus dibayar?\"</li>\n<li>\"Proteksi apa yang sudah Anda punya sekarang?\"</li>\n<li>\"Kalau ada risiko besar, siapa yang paling terdampak?\"</li>\n</ul>\n<p>Tujuannya adalah membantu mereka melihat gap, bukan membuat mereka takut.</p>\n<h2>3. Gunakan konten edukasi untuk membuka percakapan</h2>\n<p>Konten yang berguna antara lain:</p>\n<ul>\n<li>perbedaan proteksi dan investasi,</li>\n<li>cara membaca manfaat polis,</li>\n<li>kesalahan umum saat membeli asuransi,</li>\n<li>checklist sebelum memilih perlindungan.</li>\n</ul>\n<p>Konten membuat calon nasabah datang dengan konteks yang lebih baik.</p>\n<h2>4. Follow-up dengan izin</h2>\n<p>Sebelum mengirim materi berikutnya, tanyakan izin. Misalnya: \"Kalau saya kirim checklist singkat untuk mengecek kebutuhan proteksi, boleh?\"</p>\n<p>Izin kecil mengurangi kesan memaksa dan meningkatkan kualitas percakapan.</p>\n<h2>5. Ukur kualitas, bukan hanya jumlah kontak</h2>\n<p>Catat:</p>\n<ul>\n<li>berapa orang yang mau berdiskusi,</li>\n<li>berapa yang menyelesaikan fact finding,</li>\n<li>berapa yang meminta ilustrasi,</li>\n<li>berapa yang mengambil keputusan.</li>\n</ul>\n<p>Dengan data ini Anda tahu masalah ada di prospecting, diagnosis, presentasi, atau follow-up.</p>\n<h2>Kesimpulan</h2>\n<p>Prospecting yang kuat membuat calon nasabah merasa dibantu memahami risiko, bukan diburu untuk membeli produk.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Pelajari alur prospecting dan diagnosis melalui <strong>Paket Jalur Agen Asuransi</strong>. <a href=\"/program/agen-asuransi\">Lihat Program Agen Asuransi</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-pemasaran-umkm\">Strategi Pemasaran UMKM</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/digitalisasi-umkm-tepat-sasaran\">Digitalisasi UMKM Tepat Sasaran</a></li>\n</ul>",
  "prospecting-direct-selling-tanpa-spam": "<h2>Masalah utama prospecting adalah relevansi</h2>\n<p>Mengirim pesan yang sama ke puluhan orang memang cepat, tetapi sering merusak kepercayaan. Teman dan kontak pribadi merasa dijadikan target, bukan diajak berdiskusi.</p>\n<p>Prospecting yang lebih sehat dimulai dari siapa yang mungkin relevan dengan produk atau peluang yang Anda bawa.</p>\n<h2>1. Pisahkan pasar produk dan peluang bisnis</h2>\n<p>Tidak semua pembeli produk ingin menjadi mitra. Tidak semua calon mitra tertarik karena produknya. Pisahkan kedua jalur agar komunikasi lebih tepat.</p>\n<h2>2. Gunakan izin sebelum presentasi</h2>\n<p>Contoh:</p>\n<p>\"Saya sedang belajar membantu orang yang punya masalah X. Kalau relevan, boleh saya kirim ringkasan singkat?\"</p>\n<p>Izin kecil mengurangi resistensi.</p>\n<h2>3. Gunakan pengalaman dan edukasi, bukan klaim bombastis</h2>\n<p>Ceritakan proses penggunaan produk atau pengalaman kerja secara proporsional. Hindari janji hasil yang tidak dapat dijamin.</p>\n<h2>4. Catat respon dan alasan penolakan</h2>\n<p>Penolakan adalah data. Catat apakah masalahnya harga, kebutuhan, kepercayaan, timing, atau cara presentasi. Dari sini Anda bisa memperbaiki pesan.</p>\n<h2>5. Bangun sumber leads di luar lingkaran teman</h2>\n<p>Konten edukasi, komunitas, event, dan referral membantu bisnis tidak bergantung pada daftar kontak pribadi.</p>\n<h2>Kesimpulan</h2>\n<p>Prospecting yang baik menjaga hubungan sekaligus membuka peluang. Tujuannya bukan menghubungi sebanyak mungkin orang, tetapi menemukan orang yang tepat dengan cara yang tepat.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Pelajari kerangka prospecting dan positioning melalui <strong>Paket Jalur MLM/Direct Selling</strong>. <a href=\"/program/mlm-direct-selling\">Lihat Program MLM / Direct Selling</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-pemasaran-umkm\">Strategi Pemasaran UMKM</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/digitalisasi-umkm-tepat-sasaran\">Digitalisasi UMKM Tepat Sasaran</a></li>\n</ul>",
  "follow-up-leads-properti-tanpa-terlihat-memaksa": "<h2>Leads banyak belum tentu pipeline sehat</h2>\n<p>Salah satu jebakan agen properti adalah mengukur aktivitas dari jumlah chat masuk. Padahal chat yang ramai belum tentu menghasilkan viewing, penawaran, atau closing. Yang dibutuhkan adalah sistem untuk membedakan prospek yang serius, yang masih eksplorasi, dan yang belum siap.</p>\n<p>Follow-up yang baik bukan mengejar orang setiap hari. Follow-up adalah membantu prospek bergerak dari kebingungan menuju keputusan.</p>\n<h2>1. Segmentasikan leads sejak awal</h2>\n<p>Gunakan tiga kelompok sederhana:</p>\n<ul>\n<li><strong>Panas:</strong> sudah punya kebutuhan, budget, dan target waktu jelas.</li>\n<li><strong>Hangat:</strong> tertarik tetapi masih membandingkan atau menunggu kondisi tertentu.</li>\n<li><strong>Dingin:</strong> baru bertanya, belum jelas kebutuhan dan timing-nya.</li>\n</ul>\n<p>Jangan memperlakukan ketiganya dengan cara yang sama. Prospek panas perlu kecepatan. Prospek hangat perlu edukasi. Prospek dingin perlu alasan untuk tetap mengingat Anda.</p>\n<h2>2. Ganti pertanyaan \"masih minat?\" dengan pertanyaan diagnosis</h2>\n<p>Pertanyaan umum seperti \"masih minat unit ini?\" mudah diabaikan. Gunakan pertanyaan yang membantu prospek menjelaskan posisi mereka.</p>\n<p>Contoh:</p>\n<ul>\n<li>\"Yang masih mengganjal sekarang lebih ke harga, lokasi, atau skema pembayaran?\"</li>\n<li>\"Kalau unit ini belum cocok, tiga hal apa yang paling penting untuk unit berikutnya?\"</li>\n<li>\"Target pindah atau investasi Anda kira-kira kapan?\"</li>\n</ul>\n<p>Jawaban ini memperbaiki kualitas data Anda dan membantu Anda menawarkan unit yang lebih relevan.</p>\n<h2>3. Gunakan follow-up berbasis momentum</h2>\n<p>Jangan mengirim pesan tanpa alasan. Gunakan momentum seperti:</p>\n<ul>\n<li>ada perubahan harga,</li>\n<li>ada unit pembanding baru,</li>\n<li>jadwal open house,</li>\n<li>update legalitas,</li>\n<li>insight pembiayaan,</li>\n<li>perubahan ketersediaan unit.</li>\n</ul>\n<p>Dengan cara ini, follow-up terasa informatif, bukan menekan.</p>\n<h2>4. Catat next action, bukan hanya status</h2>\n<p>CRM sederhana pun cukup jika disiplin. Untuk setiap lead, catat:</p>\n<ul>\n<li>kebutuhan utama,</li>\n<li>kisaran budget,</li>\n<li>lokasi pilihan,</li>\n<li>hambatan utama,</li>\n<li>tanggal follow-up berikutnya,</li>\n<li>tindakan berikutnya.</li>\n</ul>\n<p>Kolom \"next action\" lebih berguna daripada status \"prospek\" yang terlalu umum.</p>\n<h2>5. Tentukan kapan harus berhenti mengejar</h2>\n<p>Tidak semua lead harus dikejar terus. Bila prospek tidak responsif setelah beberapa follow-up berkualitas, pindahkan ke nurturing ringan. Kirim insight pasar berkala, bukan pesan penjualan berulang.</p>\n<p>Ini melindungi energi agen dan menjaga citra profesional.</p>\n<h2>Pola follow-up 7 hari sederhana</h2>\n<p><strong>Hari 0:</strong> jawab cepat dan diagnosis kebutuhan. <strong>Hari 1:</strong> kirim 1–3 opsi paling relevan. <strong>Hari 3:</strong> cek hambatan utama. <strong>Hari 5:</strong> kirim insight atau pembanding. <strong>Hari 7:</strong> simpulkan dan minta izin untuk follow-up berikutnya.</p>\n<p>Setelah itu, frekuensi dapat diperlambat sesuai respons.</p>\n<h2>Kesimpulan</h2>\n<p>Follow-up bukan soal seberapa sering Anda menghubungi prospek, tetapi seberapa relevan setiap kontak yang Anda lakukan. Sistem yang baik membuat agen terlihat membantu, bukan mengejar.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Gunakan pendekatan diagnosis dan pipeline yang lebih terarah melalui <strong>Paket Jalur Agen Properti</strong>. <a href=\"/program/agen-properti\">Lihat Program Agen Properti</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/strategi-operasional-umkm\">Strategi Operasional UMKM</a></li>\n<li><a href=\"/artikel/digitalisasi-umkm-tepat-sasaran\">Digitalisasi UMKM Tepat Sasaran</a></li>\n</ul>",
  "fact-finding-kebutuhan-nasabah-asuransi": "<h2>Mengapa fact finding penting?</h2>\n<p>Tanpa fact finding, agen mudah menawarkan produk berdasarkan asumsi. Padahal dua orang dengan usia dan pendapatan sama bisa punya kebutuhan yang sangat berbeda.</p>\n<p>Fact finding bukan interogasi. Ini percakapan terstruktur untuk memahami risiko dan prioritas.</p>\n<h2>1. Mulai dari tujuan hidup</h2>\n<p>Tanyakan apa yang sedang diprioritaskan: pendidikan anak, menjaga pendapatan keluarga, melindungi aset, kesehatan, atau pensiun.</p>\n<p>Tujuan memberi konteks terhadap angka.</p>\n<h2>2. Petakan kewajiban</h2>\n<p>Catat kewajiban utama seperti:</p>\n<ul>\n<li>cicilan,</li>\n<li>biaya pendidikan,</li>\n<li>biaya hidup keluarga,</li>\n<li>tanggungan orang tua,</li>\n<li>kebutuhan usaha.</li>\n</ul>\n<p>Tujuannya untuk memahami konsekuensi jika terjadi gangguan pendapatan.</p>\n<h2>3. Audit proteksi yang sudah ada</h2>\n<p>Jangan menganggap calon nasabah belum punya perlindungan. Tanyakan apa yang sudah dimiliki dari kantor, BPJS, polis lama, atau proteksi keluarga.</p>\n<p>Ini mencegah rekomendasi berlebihan.</p>\n<h2>4. Sesuaikan dengan kemampuan arus kas</h2>\n<p>Proteksi yang bagus tetapi tidak sanggup dipertahankan akan menjadi masalah. Rekomendasi harus mempertimbangkan kemampuan membayar secara konsisten.</p>\n<p>Agen perlu berani mengatakan bahwa solusi tertentu belum cocok bila premi mengganggu keuangan utama.</p>\n<h2>5. Dokumentasikan kebutuhan dan alasan rekomendasi</h2>\n<p>Catat mengapa produk tertentu dipilih. Dokumentasi membantu agen menjelaskan keputusan secara transparan dan mengurangi miskomunikasi di kemudian hari.</p>\n<h2>Kesimpulan</h2>\n<p>Fact finding membuat rekomendasi lebih personal, rasional, dan dapat dipertanggungjawabkan. Diagnosis yang baik mengurangi kebutuhan untuk hard selling.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Gunakan kerangka diagnosis yang lebih rapi melalui <strong>Paket Jalur Agen Asuransi</strong>. <a href=\"/program/agen-asuransi\">Lihat Program Agen Asuransi</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/omzet-besar-kas-kosong\">Omzet Besar, Kas Kosong</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/teknik-negosiasi-bisnis-umkm\">Teknik Negosiasi Bisnis UMKM</a></li>\n</ul>",
  "presentasi-produk-direct-selling-yang-meyakinkan": "<h2>Presentasi bukan ceramah produk</h2>\n<p>Banyak presentasi direct selling dipenuhi fitur, sejarah perusahaan, dan daftar manfaat. Calon pembeli akhirnya bingung karena tidak tahu bagian mana yang relevan bagi mereka.</p>\n<p>Gunakan prinsip sederhana: <strong>diagnosis sebelum presentasi</strong>.</p>\n<h2>1. Mulai dari kebutuhan</h2>\n<p>Tanyakan apa yang sedang dicari calon pembeli dan masalah apa yang ingin mereka selesaikan. Jangan menawarkan semua produk sekaligus.</p>\n<h2>2. Pilih tiga manfaat paling relevan</h2>\n<p>Hubungkan fitur ke manfaat yang nyata. Hindari jargon yang sulit dipahami.</p>\n<h2>3. Gunakan bukti secara hati-hati</h2>\n<p>Gunakan informasi resmi, pengalaman yang jujur, dan testimoni yang sesuai aturan. Hindari klaim kesehatan, pendapatan, atau hasil yang tidak dapat dijamin.</p>\n<h2>4. Beri ruang untuk pertanyaan</h2>\n<p>Presentasi yang baik bersifat dua arah. Dengarkan keberatan dan jangan buru-buru membantah.</p>\n<h2>5. Tutup dengan next step kecil</h2>\n<p>Tidak semua orang harus langsung membeli. Next step bisa berupa mencoba sampel, membaca informasi, atau menjadwalkan diskusi lanjutan.</p>\n<h2>Kesimpulan</h2>\n<p>Presentasi yang meyakinkan adalah presentasi yang relevan, jelas, dan etis. Kepercayaan lebih penting daripada tekanan closing.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Gunakan struktur presentasi yang lebih terarah melalui <strong>Paket Jalur MLM/Direct Selling</strong>. <a href=\"/program/mlm-direct-selling\">Lihat Program MLM / Direct Selling</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/teknik-negosiasi-bisnis-umkm\">Teknik Negosiasi Bisnis UMKM</a></li>\n<li><a href=\"/artikel/strategi-pemasaran-umkm\">Strategi Pemasaran UMKM</a></li>\n</ul>",
  "teknik-negosiasi-agen-properti": "<h2>Negosiasi bukan mencari angka tengah</h2>\n<p>Dalam transaksi properti, buyer ingin harga terbaik dan seller ingin nilai tertinggi. Agen yang hanya menjadi penyampai angka sering terjebak di tengah. Padahal peran agen adalah membaca kepentingan, risiko, dan ruang gerak kedua pihak.</p>\n<p>Negosiasi yang baik dimulai dari pertanyaan: <strong>apa yang sebenarnya penting bagi masing-masing pihak selain harga?</strong></p>\n<h2>1. Pisahkan posisi dan kepentingan</h2>\n<p>Posisi buyer mungkin: \"Saya hanya mau di Rp1,8 miliar.\" Kepentingannya bisa: cicilan tetap aman, renovasi tidak terlalu besar, atau kebutuhan pindah cepat.</p>\n<p>Posisi seller mungkin: \"Tidak boleh kurang dari Rp2 miliar.\" Kepentingannya bisa: butuh dana dalam 30 hari, ingin pembeli serius, atau tidak ingin proses berlarut.</p>\n<p>Ketika kepentingan ditemukan, ruang negosiasi menjadi lebih luas daripada sekadar angka.</p>\n<h2>2. Jangan bocorkan batas pihak terlalu cepat</h2>\n<p>Agen harus menjaga kepercayaan. Jangan menggunakan informasi sensitif dari satu pihak untuk menekan pihak lain secara ceroboh. Informasi batas harga, urgensi, dan kondisi personal harus dikelola dengan etis.</p>\n<p>Gunakan data untuk membantu keputusan, bukan untuk memanipulasi.</p>\n<h2>3. Siapkan beberapa paket keputusan</h2>\n<p>Daripada satu tawaran tunggal, siapkan beberapa alternatif:</p>\n<ul>\n<li>harga sedikit lebih tinggi dengan jadwal pembayaran lebih fleksibel,</li>\n<li>harga lebih rendah dengan transaksi lebih cepat,</li>\n<li>harga tetap dengan furnitur tertentu dikeluarkan,</li>\n<li>harga tertentu dengan tanggal serah terima yang disesuaikan.</li>\n</ul>\n<p>Pilihan membuat negosiasi lebih produktif karena pihak tidak merasa hanya punya opsi \"ya atau tidak\".</p>\n<h2>4. Gunakan data pembanding sebagai jangkar</h2>\n<p>Data pembanding membantu kedua pihak melihat transaksi secara rasional. Pilih pembanding yang benar-benar relevan dari sisi lokasi, luas, usia bangunan, kondisi, dan legalitas.</p>\n<p>Jangan gunakan data yang menyesatkan hanya demi memenangkan argumen. Kredibilitas agen lebih berharga daripada satu deal.</p>\n<h2>5. Jaga ritme komunikasi</h2>\n<p>Negosiasi sering gagal bukan karena angka, tetapi karena komunikasi buruk: terlalu lambat, terlalu emosional, atau informasi berubah-ubah. Tetapkan ritme yang jelas dan rangkum setiap perkembangan penting secara tertulis.</p>\n<h2>Checklist sebelum menyampaikan counter-offer</h2>\n<ul>\n<li>Saya tahu kepentingan utama buyer.</li>\n<li>Saya tahu kepentingan utama seller.</li>\n<li>Saya sudah mengecek data pembanding.</li>\n<li>Saya punya minimal dua alternatif struktur deal.</li>\n<li>Saya tidak membocorkan informasi sensitif.</li>\n<li>Saya tahu batas waktu keputusan.</li>\n</ul>\n<h2>Kesimpulan</h2>\n<p>Agen properti yang kuat bukan yang paling agresif, tetapi yang mampu menjaga proses tetap rasional. Negosiasi yang baik membuat kedua pihak merasa keputusan mereka masuk akal dan dapat dipertanggungjawabkan.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Dalami strategi negosiasi dan pengambilan keputusan melalui <strong>Paket Jalur Agen Properti</strong>. <a href=\"/program/agen-properti\">Lihat Program Agen Properti</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/teknik-negosiasi-bisnis-umkm\">Teknik Negosiasi Bisnis UMKM</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/omzet-besar-kas-kosong\">Omzet Besar, Kas Kosong</a></li>\n</ul>",
  "cara-menjawab-keberatan-premi-asuransi": "<h2>Jangan langsung membantah keberatan</h2>\n<p>Ketika calon nasabah mengatakan \"mahal\", respons pertama agen sering berupa penjelasan panjang. Padahal kata \"mahal\" bisa berarti banyak hal: budget terbatas, manfaat belum dipahami, prioritas lain lebih tinggi, atau kepercayaan belum terbentuk.</p>\n<p>Tugas agen adalah mencari makna di balik keberatan.</p>\n<h2>1. Klarifikasi sebelum menjawab</h2>\n<p>Tanyakan:</p>\n<ul>\n<li>\"Mahal dibandingkan dengan budget yang disiapkan atau dibandingkan manfaatnya?\"</li>\n<li>\"Bagian mana yang masih belum terasa relevan?\"</li>\n<li>\"Kalau preminya lebih rendah, manfaat apa yang paling penting tetap ada?\"</li>\n</ul>\n<p>Pertanyaan ini membuka ruang dialog.</p>\n<h2>2. Kembali ke kebutuhan yang sudah ditemukan</h2>\n<p>Jangan mengulang fitur. Hubungkan kembali ke risiko dan tujuan yang sebelumnya dibahas.</p>\n<p>Jika kebutuhan belum jelas, jangan memaksa closing. Kembali ke fact finding.</p>\n<h2>3. Tawarkan skenario, bukan tekanan</h2>\n<p>Misalnya:</p>\n<ul>\n<li>manfaat inti dengan premi lebih rendah,</li>\n<li>prioritas proteksi dulu, tambahan nanti,</li>\n<li>penyesuaian masa atau struktur manfaat sesuai produk yang tersedia.</li>\n</ul>\n<p>Pastikan semua opsi dijelaskan sesuai ketentuan produk dan tidak menjanjikan sesuatu yang tidak tercantum resmi.</p>\n<h2>4. Beri ruang untuk berpikir</h2>\n<p>Keputusan proteksi sebaiknya tidak lahir dari tekanan. Berikan ringkasan tertulis dan waktu untuk membaca.</p>\n<p>Agen yang berani memberi ruang justru terlihat lebih percaya diri.</p>\n<h2>5. Jangan gunakan rasa takut berlebihan</h2>\n<p>Risiko perlu dijelaskan, tetapi hindari eksploitasi rasa takut. Komunikasi yang etis lebih kuat untuk hubungan jangka panjang.</p>\n<h2>Kesimpulan</h2>\n<p>Menangani keberatan bukan lomba memenangkan argumen. Tujuannya adalah membantu calon nasabah membuat keputusan yang dipahami dan sesuai kebutuhan.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Pelajari strategi komunikasi dan negosiasi melalui <strong>Paket Jalur Agen Asuransi</strong>. <a href=\"/program/agen-asuransi\">Lihat Program Agen Asuransi</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/teknik-negosiasi-bisnis-umkm\">Teknik Negosiasi Bisnis UMKM</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/omzet-besar-kas-kosong\">Omzet Besar, Kas Kosong</a></li>\n</ul>",
  "onboarding-duplikasi-tim-mlm": "<h2>Tim tumbuh, tetapi leader makin sibuk?</h2>\n<p>Itu tanda sistem belum terduplikasi. Jika setiap anggota baru harus selalu menunggu arahan leader, pertumbuhan justru menambah beban.</p>\n<p>Onboarding harus menjawab tiga pertanyaan: apa yang harus dipelajari, apa yang harus dilakukan, dan bagaimana tahu bahwa langkahnya benar.</p>\n<h2>1. Batasi materi awal</h2>\n<p>Jangan memberi puluhan video di hari pertama. Fokus pada:</p>\n<ul>\n<li>pemahaman produk inti,</li>\n<li>etika komunikasi,</li>\n<li>cara membuat daftar prospek yang relevan,</li>\n<li>cara membuka percakapan,</li>\n<li>cara follow-up,</li>\n<li>aturan klaim dan kepatuhan.</li>\n</ul>\n<h2>2. Buat agenda 7 hari</h2>\n<p>Contoh:</p>\n<p><strong>Hari 1:</strong> orientasi dan tujuan. <strong>Hari 2:</strong> produk inti. <strong>Hari 3:</strong> latihan percakapan. <strong>Hari 4:</strong> konten dan prospecting. <strong>Hari 5:</strong> follow-up. <strong>Hari 6:</strong> review aktivitas. <strong>Hari 7:</strong> evaluasi dan target minggu berikutnya.</p>\n<h2>3. Gunakan checklist, bukan hanya motivasi</h2>\n<p>Checklist membuat anggota tahu apakah aktivitas sudah dilakukan. Motivasi membantu, tetapi sistem menjaga konsistensi.</p>\n<h2>4. Leader berperan sebagai coach</h2>\n<p>Daripada menjawab semua hal, ajarkan anggota memecahkan masalah. Tanyakan: apa yang sudah dicoba, respons apa yang didapat, dan apa langkah berikutnya.</p>\n<h2>5. Ukur aktivitas yang dapat dikendalikan</h2>\n<p>Pada tahap awal, ukur aktivitas seperti percakapan, follow-up, presentasi, dan review. Jangan hanya fokus pada omzet atau jumlah rekrut.</p>\n<h2>Kesimpulan</h2>\n<p>Duplikasi adalah desain sistem. Semakin sederhana proses inti, semakin mudah tim bergerak tanpa ketergantungan penuh pada leader.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Bangun sistem tim 30 hari melalui <strong>Paket Jalur MLM/Direct Selling</strong>. <a href=\"/program/mlm-direct-selling\">Lihat Program MLM / Direct Selling</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-mengelola-karyawan-umkm\">Strategi Mengelola Karyawan UMKM</a></li>\n<li><a href=\"/artikel/strategi-operasional-umkm\">Strategi Operasional UMKM</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n</ul>",
  "personal-branding-agen-properti": "<h2>Mengapa personal branding penting bagi agen properti?</h2>\n<p>Properti adalah transaksi bernilai besar. Calon klien tidak hanya menilai produk, tetapi juga orang yang mendampingi prosesnya. Karena itu, kepercayaan sering terbentuk jauh sebelum klien mengirim pesan pertama.</p>\n<p>Personal branding yang kuat membuat Anda dikenal karena kompetensi tertentu, bukan sekadar karena sering posting listing.</p>\n<h2>1. Pilih niche yang mudah dipahami</h2>\n<p>Daripada mencoba terlihat bisa menjual semua jenis properti di semua lokasi, pilih fokus yang jelas. Contoh:</p>\n<ul>\n<li>rumah second di wilayah tertentu,</li>\n<li>apartemen untuk investor pemula,</li>\n<li>properti komersial untuk UMKM,</li>\n<li>rumah keluarga di kisaran budget tertentu.</li>\n</ul>\n<p>Niche membantu pasar mengingat Anda dan membuat konten Anda lebih tajam.</p>\n<h2>2. Tampilkan proses kerja, bukan hanya hasil</h2>\n<p>Konten agen sering penuh dengan \"sold\" dan \"closing\". Itu bagus, tetapi calon klien juga ingin tahu bagaimana Anda bekerja.</p>\n<p>Tampilkan hal seperti:</p>\n<ul>\n<li>cara screening buyer,</li>\n<li>cara menyiapkan unit sebelum dipasarkan,</li>\n<li>cara membaca pembanding harga,</li>\n<li>checklist dokumen,</li>\n<li>insight dari viewing.</li>\n</ul>\n<p>Konten seperti ini membangun kepercayaan karena menunjukkan kompetensi nyata.</p>\n<h2>3. Gunakan format edukasi yang konsisten</h2>\n<p>Pilih 3–4 pilar konten:</p>\n<ul>\n<li>edukasi buyer,</li>\n<li>edukasi seller,</li>\n<li>analisis area,</li>\n<li>proses kerja agen.</li>\n</ul>\n<p>Konsistensi lebih penting daripada mengejar semua tren.</p>\n<h2>4. Bangun bukti sosial secara etis</h2>\n<p>Gunakan testimoni dengan izin. Jika ada informasi sensitif, samarkan nomor telepon, alamat, atau data pribadi. Fokuskan testimoni pada pengalaman proses: komunikasi, kejelasan, ketepatan, dan pendampingan.</p>\n<h2>5. Selaraskan profil, konten, dan tindakan</h2>\n<p>Personal branding gagal jika konten terlihat profesional tetapi respons chat lambat, jadwal berantakan, atau informasi tidak akurat. Brand bukan hanya apa yang Anda posting. Brand adalah pengalaman klien saat berinteraksi dengan Anda.</p>\n<h2>Kesimpulan</h2>\n<p>Tujuan personal branding bukan agar semua orang mengenal Anda. Tujuannya agar orang yang tepat mengingat Anda saat kebutuhan properti muncul.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Bangun positioning yang lebih terarah melalui <strong>Paket Jalur Agen Properti</strong>. <a href=\"/program/agen-properti\">Lihat Program Agen Properti</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-pemasaran-umkm\">Strategi Pemasaran UMKM</a></li>\n<li><a href=\"/artikel/digitalisasi-umkm-tepat-sasaran\">Digitalisasi UMKM Tepat Sasaran</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n</ul>",
  "follow-up-renewal-referral-agen-asuransi": "<h2>Bisnis tidak berhenti setelah polis aktif</h2>\n<p>Bagi nasabah, pengalaman sebenarnya justru dimulai setelah pembelian. Mereka akan menilai apakah agen tetap responsif ketika butuh penjelasan, perubahan data, atau bantuan memahami proses.</p>\n<p>Layanan purna jual yang baik menciptakan kepercayaan jangka panjang.</p>\n<h2>1. Buat kalender review berkala</h2>\n<p>Jadwalkan review berdasarkan momen penting:</p>\n<ul>\n<li>ulang tahun polis,</li>\n<li>perubahan status keluarga,</li>\n<li>perubahan pekerjaan,</li>\n<li>kelahiran anak,</li>\n<li>perubahan kebutuhan finansial.</li>\n</ul>\n<p>Review bukan kesempatan otomatis untuk menjual lagi. Tujuannya memastikan perlindungan masih relevan.</p>\n<h2>2. Buat SOP komunikasi nasabah</h2>\n<p>Tetapkan standar:</p>\n<ul>\n<li>waktu respon,</li>\n<li>cara menyimpan dokumen,</li>\n<li>pengingat review,</li>\n<li>jalur eskalasi bila ada pertanyaan yang perlu bantuan perusahaan.</li>\n</ul>\n<p>SOP membuat kualitas layanan konsisten.</p>\n<h2>3. Minta referral setelah ada pengalaman positif</h2>\n<p>Jangan meminta referral di awal. Minta setelah nasabah merasakan layanan yang baik.</p>\n<p>Contoh: \"Kalau ada teman atau keluarga yang sedang bingung memahami proteksi, saya senang membantu mereka berdiskusi dulu tanpa kewajiban membeli.\"</p>\n<h2>4. Gunakan database dengan disiplin</h2>\n<p>Minimal catat:</p>\n<ul>\n<li>tanggal mulai polis,</li>\n<li>review berikutnya,</li>\n<li>kebutuhan utama,</li>\n<li>perubahan penting,</li>\n<li>komunikasi terakhir.</li>\n</ul>\n<p>Database sederhana jauh lebih berguna daripada mengandalkan ingatan.</p>\n<h2>Kesimpulan</h2>\n<p>Bisnis agen yang sehat tidak selalu dimulai dari prospek baru. Hubungan yang dirawat dengan baik dapat menghasilkan retensi, kepercayaan, dan referral secara natural.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Bangun sistem layanan 30 hari melalui <strong>Paket Jalur Agen Asuransi</strong>. <a href=\"/program/agen-asuransi\">Lihat Program Agen Asuransi</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-operasional-umkm\">Strategi Operasional UMKM</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/strategi-mengelola-karyawan-umkm\">Strategi Mengelola Karyawan UMKM</a></li>\n</ul>",
  "repeat-order-direct-selling": "<h2>Penjualan pertama bukan akhir</h2>\n<p>Bisnis direct selling yang sehat perlu pelanggan yang kembali karena produk memang relevan, bukan karena selalu ada diskon.</p>\n<h2>1. Pastikan pelanggan tahu cara menggunakan produk</h2>\n<p>Banyak repeat order gagal karena pelanggan tidak menggunakan produk dengan benar atau tidak memahami ekspektasi yang wajar.</p>\n<p>Berikan panduan sederhana setelah pembelian.</p>\n<h2>2. Follow-up berdasarkan waktu penggunaan</h2>\n<p>Jadwalkan follow-up saat pelanggan sudah punya pengalaman cukup untuk memberi feedback. Tanyakan pengalaman, kendala, dan kebutuhan berikutnya.</p>\n<h2>3. Catat pola konsumsi</h2>\n<p>Jika produk punya siklus penggunaan, catat perkiraan kapan pelanggan mungkin membutuhkan ulang. Jangan menunggu sampai mereka lupa.</p>\n<h2>4. Gunakan bundling berdasarkan kebutuhan</h2>\n<p>Bundling yang baik menambah nilai, bukan sekadar menurunkan harga. Gabungkan produk yang memang saling melengkapi.</p>\n<h2>5. Pisahkan pelanggan loyal dan pemburu promo</h2>\n<p>Data membantu Anda melihat siapa yang membeli karena kebutuhan dan siapa yang hanya aktif saat diskon. Strategi follow-up keduanya tidak harus sama.</p>\n<h2>Kesimpulan</h2>\n<p>Repeat order dibangun dari pengalaman pelanggan yang baik, edukasi, dan sistem follow-up. Diskon boleh digunakan, tetapi bukan fondasi utama retensi.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Pelajari sistem retensi yang lebih terarah melalui <strong>Paket Jalur MLM/Direct Selling</strong>. <a href=\"/program/mlm-direct-selling\">Lihat Program MLM / Direct Selling</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/strategi-operasional-umkm\">Strategi Operasional UMKM</a></li>\n<li><a href=\"/artikel/omzet-besar-kas-kosong\">Omzet Besar, Kas Kosong</a></li>\n</ul>",
  "sistem-pipeline-agen-properti-30-hari": "<h2>Sibuk belum tentu produktif</h2>\n<p>Agen properti bisa menghabiskan hari dengan membalas chat, membuka listing, membuat konten, dan melakukan viewing. Namun tanpa pipeline, sulit mengetahui apakah aktivitas tersebut menghasilkan kemajuan.</p>\n<p>Pipeline 30 hari membantu memisahkan aktivitas penting dari kesibukan yang tidak menggerakkan deal.</p>\n<h2>Tahap pipeline yang sederhana</h2>\n<p>Gunakan tahapan berikut:</p>\n<ol>\n<li>prospek baru,</li>\n<li>sudah terdiagnosis,</li>\n<li>opsi dikirim,</li>\n<li>viewing dijadwalkan,</li>\n<li>negosiasi,</li>\n<li>closing,</li>\n<li>referral / repeat.</li>\n</ol>\n<p>Setiap prospek harus berada pada satu tahap dan punya next action.</p>\n<h2>Target aktivitas mingguan</h2>\n<p>Contoh target yang bisa disesuaikan:</p>\n<ul>\n<li>20 percakapan prospek baru,</li>\n<li>10 follow-up berkualitas,</li>\n<li>5 kebutuhan terdiagnosis,</li>\n<li>3 viewing,</li>\n<li>1–2 negosiasi aktif,</li>\n<li>1 permintaan referral.</li>\n</ul>\n<p>Jangan menyalin angka ini mentah-mentah. Sesuaikan dengan pasar, sumber leads, dan kapasitas Anda.</p>\n<h2>Review setiap Jumat</h2>\n<p>Tanyakan:</p>\n<ul>\n<li>tahap mana yang paling banyak macet?</li>\n<li>berapa lead tanpa next action?</li>\n<li>dari mana lead terbaik datang?</li>\n<li>berapa viewing yang berubah menjadi penawaran?</li>\n<li>masalah terbesar ada di pemasaran, penjualan, atau follow-up?</li>\n</ul>\n<p>Review seperti ini membuat perbaikan lebih objektif.</p>\n<h2>Gunakan alat sesederhana mungkin</h2>\n<p>Spreadsheet, Notion, atau CRM apa pun bisa dipakai. Jangan memilih alat yang terlalu rumit sebelum proses dasarnya disiplin.</p>\n<p>Kolom minimum:</p>\n<ul>\n<li>nama prospek,</li>\n<li>kebutuhan,</li>\n<li>budget,</li>\n<li>area,</li>\n<li>tahap pipeline,</li>\n<li>tanggal terakhir kontak,</li>\n<li>next action,</li>\n<li>tanggal next action.</li>\n</ul>\n<h2>Kesimpulan</h2>\n<p>Pipeline mengubah bisnis agen dari kerja berbasis ingatan menjadi sistem. Dengan sistem, Anda bisa melihat medan mana yang bocor sebelum menyalahkan pasar atau jumlah leads.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Gunakan kerangka 30 hari yang lebih terarah melalui <strong>Paket Jalur Agen Properti</strong>. <a href=\"/program/agen-properti\">Lihat Program Agen Properti</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-operasional-umkm\">Strategi Operasional UMKM</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n<li><a href=\"/artikel/digitalisasi-umkm-tepat-sasaran\">Digitalisasi UMKM Tepat Sasaran</a></li>\n</ul>",
  "personal-branding-agen-asuransi": "<h2>Brand agen dibangun dari kejelasan dan konsistensi</h2>\n<p>Personal branding bukan sekadar foto profesional atau desain feed. Yang lebih penting adalah apakah calon nasabah memahami siapa yang Anda bantu dan bagaimana Anda bekerja.</p>\n<h2>1. Pilih fokus edukasi</h2>\n<p>Contoh fokus:</p>\n<ul>\n<li>proteksi keluarga muda,</li>\n<li>proteksi pemilik usaha,</li>\n<li>edukasi kesehatan dan finansial,</li>\n<li>membaca polis dengan bahasa sederhana.</li>\n</ul>\n<p>Fokus membuat konten lebih mudah dikenali.</p>\n<h2>2. Jangan jadikan konten sebagai katalog</h2>\n<p>Jika semua konten hanya berisi produk dan promo, audiens cepat lelah. Buat konten yang menjawab pertanyaan nyata:</p>\n<ul>\n<li>apa beda manfaat rawat inap dan santunan,</li>\n<li>bagaimana membaca pengecualian,</li>\n<li>kapan perlu review polis,</li>\n<li>apa yang harus disiapkan sebelum konsultasi.</li>\n</ul>\n<h2>3. Tampilkan proses layanan</h2>\n<p>Tunjukkan bagaimana Anda melakukan fact finding, review kebutuhan, dan follow-up. Ini membantu audiens melihat bahwa Anda punya sistem, bukan hanya target penjualan.</p>\n<h2>4. Jaga kepatuhan dan akurasi</h2>\n<p>Hindari klaim berlebihan. Gunakan informasi resmi dan jelaskan batasan produk dengan jelas. Kredibilitas jangka panjang lebih penting daripada konten yang sensasional.</p>\n<h2>5. Selaraskan konten dengan pengalaman nyata</h2>\n<p>Jika Anda mengklaim respons cepat, pastikan pelayanan memang cepat. Jika mengedepankan edukasi, jangan memaksa closing. Konsistensi antara pesan dan tindakan adalah inti brand.</p>\n<h2>Kesimpulan</h2>\n<p>Personal branding agen asuransi yang kuat membuat calon nasabah merasa aman untuk bertanya. Dari situlah percakapan penjualan yang sehat dimulai.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Bangun positioning yang lebih terarah melalui <strong>Paket Jalur Agen Asuransi</strong>. <a href=\"/program/agen-asuransi\">Lihat Program Agen Asuransi</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-pemasaran-umkm\">Strategi Pemasaran UMKM</a></li>\n<li><a href=\"/artikel/digitalisasi-umkm-tepat-sasaran\">Digitalisasi UMKM Tepat Sasaran</a></li>\n<li><a href=\"/artikel/strategi-penjualan-umkm\">Strategi Penjualan UMKM</a></li>\n</ul>",
  "leadership-leader-mlm-direct-selling": "<h2>Leader bukan pusat semua keputusan</h2>\n<p>Jika semua pertanyaan, konflik, dan keputusan kecil selalu kembali ke satu leader, organisasi sulit berkembang. Pertumbuhan jumlah anggota akan langsung meningkatkan beban leader.</p>\n<p>Kepemimpinan yang sehat membangun kapasitas tim.</p>\n<h2>1. Jelaskan standar perilaku</h2>\n<p>Tim perlu tahu bagaimana berkomunikasi, bagaimana menyampaikan klaim, bagaimana menangani pelanggan, dan bagaimana bekerja secara etis.</p>\n<p>Standar yang jelas mengurangi kebingungan.</p>\n<h2>2. Coaching dengan pertanyaan</h2>\n<p>Daripada langsung memberi solusi, tanyakan:</p>\n<ul>\n<li>apa masalah utamanya?</li>\n<li>apa yang sudah dicoba?</li>\n<li>data apa yang ada?</li>\n<li>pilihan apa yang mungkin?</li>\n<li>langkah berikutnya apa?</li>\n</ul>\n<p>Ini melatih kemampuan berpikir anggota.</p>\n<h2>3. Bedakan performa dan potensi</h2>\n<p>Tidak semua anggota memiliki target yang sama. Ada yang ingin menjadi pelanggan, penjual aktif, atau membangun tim. Jangan memaksa semua orang masuk jalur yang sama.</p>\n<h2>4. Review berdasarkan aktivitas dan kualitas</h2>\n<p>Evaluasi bukan hanya angka akhir. Lihat kualitas follow-up, konsistensi, kepatuhan, dan kemampuan membangun hubungan.</p>\n<h2>5. Siapkan calon leader berikutnya</h2>\n<p>Delegasikan tanggung jawab secara bertahap: memimpin review kecil, mendampingi anggota baru, atau mengelola satu proyek sederhana.</p>\n<h2>Kesimpulan</h2>\n<p>Leadership yang kuat tidak membuat tim semakin bergantung. Ia menciptakan lebih banyak orang yang mampu mengambil keputusan dengan standar yang sama.</p>\n<blockquote><p><strong>Langkah berikutnya:</strong> Bangun sistem leadership dan duplikasi melalui <strong>Paket Jalur MLM/Direct Selling</strong>. <a href=\"/program/mlm-direct-selling\">Lihat Program MLM / Direct Selling</a>.</p></blockquote>\n<h2>Baca juga</h2>\n<ul>\n<li><a href=\"/artikel/strategi-mengelola-karyawan-umkm\">Strategi Mengelola Karyawan UMKM</a></li>\n<li><a href=\"/artikel/strategi-operasional-umkm\">Strategi Operasional UMKM</a></li>\n<li><a href=\"/artikel/strategi-ekspansi-umkm\">Strategi Ekspansi UMKM</a></li>\n</ul>"
};

const ARTICLE_HTML = {
  ...ARTICLE_HTML_EXISTING_A,
  ...ARTICLE_HTML_EXISTING_B,
  ...ARTICLE_HTML_PROFESI,
};

function ContentBlock({ block, index }) {
  const [type, content] = block;
  if (type === 'h2') return <h2 key={index} className="mt-12 font-display text-3xl leading-tight text-neutral-900 sm:text-4xl">{content}</h2>;
  if (type === 'h3') return <h3 key={index} className="mt-8 text-xl font-extrabold leading-snug text-neutral-900">{content}</h3>;
  if (type === 'ol' || type === 'ul') {
    const Tag = type;
    return (
      <Tag key={index} className={`mt-5 space-y-3 pl-6 text-[15px] leading-relaxed text-neutral-700 ${type === 'ol' ? 'list-decimal' : 'list-disc'}`}>
        {content.map((item) => <li key={item}>{item}</li>)}
      </Tag>
    );
  }
  if (type === 'callout') {
    return (
      <aside key={index} className="mt-8 flex gap-3 rounded-2xl border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/10 p-5 text-sm leading-relaxed text-neutral-800">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p>{content}</p>
      </aside>
    );
  }
  return <p key={index} className="mt-5 text-[15px] leading-8 text-neutral-700">{content}</p>;
}

export function ArtikelDetailPage({ slug: forcedSlug }) {
  const params = useParams();
  const slug = forcedSlug || params.slug;
  const article = ARTICLES.find((a) => a.slug === slug);
  if (!article) return <Navigate to="/artikel" replace />;
  const body = BODY[article.slug] || [];
  const htmlBody = ARTICLE_HTML[article.slug] || '';
  const supportingArticles = ARTICLES.filter((a) => a.parentSlug === article.slug);
  const url = `${SITE.url.replace(/\/$/, '')}/artikel/${article.slug}`;
  const related = ARTICLES.filter((a) => a.slug !== article.slug)
    .sort((a, b) => {
      const score = (item) => {
        if (item.slug === article.parentSlug) return 0;
        if (article.parentSlug && item.parentSlug === article.parentSlug) return 1;
        if (item.parentSlug === article.slug) return 2;
        if (item.category === article.category) return 3;
        return 4;
      };
      return score(a) - score(b);
    })
    .slice(0, 4);
  const panglima = PRODUCTS.find((p) => p.id === 'panglima');
  const legacyFaq = article.slug === 'mengatasi-perang-harga-ecommerce-umkm' ? ARTICLE_FAQS : [];
  const faqForSchema = (Array.isArray(article.faq) && article.faq.length ? article.faq : legacyFaq)
    .filter((faq) => typeof faq.q === 'string' && faq.q.trim() && typeof faq.a === 'string' && faq.a.trim());
  const displayImage = getDisplayImage(article);
  const pageTitle = article.metaTitle || `${article.title} | ${SITE.name}`;
  const crawlableImage = getCrawlableImage(displayImage) || null;
  const articleAuthor = article.authorName || SITE.author;
  const effectiveModified = article.modified || article.date;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      description: article.description,
      ...(crawlableImage ? { image: [crawlableImage] } : {}),
      datePublished: article.date,
      dateModified: effectiveModified,
      inLanguage: 'id-ID',
      author: article.authorType === 'Organization'
        ? { '@type': 'Organization', name: articleAuthor, url: SITE.url }
        : { '@type': 'Person', name: articleAuthor, url: `${SITE.url}/tentang` },
      publisher: {
        '@type': 'Organization',
        name: SITE.name,
        url: SITE.url,
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Beranda', item: SITE.url },
        { '@type': 'ListItem', position: 2, name: 'Artikel', item: `${SITE.url}/artikel` },
        { '@type': 'ListItem', position: 3, name: article.title, item: url },
      ],
    },
    ...(faqForSchema.length ? [{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqForSchema.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    }] : []),
  ];

  return (
    <>
      <ArticleMeta
        title={pageTitle}
        description={article.description}
        image={crawlableImage}
        url={url}
        type="article"
        schema={schema}
      />

      <article className="bg-white">
        <header className="mx-auto max-w-[52rem] px-5 pb-8 pt-12">
          <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Artikel', href: '/artikel' }, { label: article.category }]} />
          <span className="mt-6 inline-block rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
            {article.category}
          </span>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] text-neutral-900 sm:text-5xl">{article.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-neutral-600">{article.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-5 border-y border-black/10 py-4 text-xs text-neutral-500">
            <span className="font-bold text-neutral-800">{article.authorType === 'Organization' ? 'Disusun oleh ' : 'Oleh '}{articleAuthor}</span>
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{new Date(`${article.date}T00:00:00+07:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{article.readingTime} baca</span>
          </div>
        </header>
        <figure className="mx-auto max-w-[42.5rem] px-5">
          <SafeArticleVisual
            src={displayImage}
            srcSet={
              article.image800 &&
                article.image1200 &&
                displayImage === article.image &&
                getCrawlableImage(article.image800) &&
                getCrawlableImage(article.image1200) &&
                crawlableImage
                ? `${getCrawlableImage(article.image800)} 800w, ${getCrawlableImage(article.image1200)} 1200w, ${crawlableImage} 1600w`
                : undefined
            }
            sizes="(max-width: 680px) calc(100vw - 40px), 640px"
            alt={article.imageAlt || article.title}
            category={article.category}
            eager
            className="aspect-[16/9] w-full rounded-3xl object-cover ring-1 ring-black/10"
          />
        </figure>
        <div className="mx-auto max-w-[52rem] px-5 pb-16 pt-8">
          {htmlBody ? (
            <div
              className="article-body text-[15px] leading-8 text-neutral-700 [&_p]:mt-5 [&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:leading-tight [&_h2]:text-neutral-900 sm:[&_h2]:text-4xl [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-extrabold [&_h3]:leading-snug [&_h3]:text-neutral-900 [&_ul]:mt-5 [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pl-6 [&_ol]:mt-5 [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-6 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-extrabold [&_strong]:text-neutral-900 [&_table]:mt-8 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_caption]:mb-3 [&_caption]:text-left [&_caption]:text-sm [&_caption]:font-bold [&_th]:border [&_th]:border-black/10 [&_th]:bg-neutral-100 [&_th]:p-3 [&_th]:text-left [&_th]:font-bold [&_td]:border [&_td]:border-black/10 [&_td]:p-3"
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          ) : (
            body.map((block, index) => <ContentBlock key={`${block[0]}-${index}`} block={block} index={index} />)
          )}

          <ContextualGuides slug={article.slug} />

          {supportingArticles.length > 0 && (
            <section className="mt-14 border-t border-black/10 pt-10" aria-labelledby="supporting-guides-title">
              <h2 id="supporting-guides-title" className="font-display text-3xl text-neutral-900">
                Panduan lanjutan di Medan {article.category}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                Lanjutkan diagnosis ke masalah yang lebih spesifik melalui panduan berikut.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {supportingArticles.map((supporting) => (
                  <Link
                    key={supporting.slug}
                    to={`/artikel/${supporting.slug}`}
                    className="rounded-2xl border border-black/10 bg-neutral-50 p-5 transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <h3 className="font-extrabold leading-snug text-neutral-900">{supporting.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">{supporting.excerpt || supporting.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {faqForSchema.length > 0 && (
            <section className="mt-14 border-t border-black/10 pt-10">
              <h2 className="font-display text-3xl text-neutral-900">Pertanyaan yang sering diajukan</h2>
              <Accordion type="single" collapsible className="mt-5 w-full">
                {faqForSchema.map((f, i) => (
                  <AccordionItem key={f.q} value={`faq-${i}`}>
                    <AccordionTrigger className="text-left font-bold hover:no-underline">{f.q}</AccordionTrigger>
                    <AccordionContent className="leading-relaxed text-neutral-600">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          )}

          <aside className="mt-14 rounded-3xl bg-[hsl(var(--ink))] p-8 text-white sm:p-10">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-[hsl(var(--gold))]" />
              <div>
                <h2 className="font-display text-3xl">Dari diagnosis ke eksekusi 30 hari</h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                  Panglima UMKM membantu Anda menemukan bottleneck utama, memilih maksimal 3 prioritas, menyusun Action Plan 30 Hari, menetapkan KPI, dan mengevaluasi progres setiap minggu agar keputusan benar-benar bergerak menjadi tindakan.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/panglima" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-6 font-bold text-white">
                Mulai Pendampingan 30 Hari <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/diagnosis-10-medan" className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/25 px-6 font-bold text-white hover:bg-white/10">
                Pelajari Diagnosis 10 Medan
              </Link>
            </div>
          </aside>
        </div>
      </article>

      <section className="bg-neutral-50 px-5 py-16">
        <div className="mx-auto max-w-[72rem]">
          <h2 className="font-display text-3xl text-neutral-900">Artikel terkait</h2>
          <div className="mt-7 grid gap-6 md:grid-cols-2">
            {related.map((a) => (
              <Link key={a.slug} to={`/artikel/${a.slug}`} className="group rounded-2xl bg-white p-6 ring-1 ring-black/10">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{a.category}</span>
                <h3 className="mt-2 text-lg font-extrabold text-neutral-900 group-hover:text-primary">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{a.description}</p>
              </Link>
            ))}
          </div>
          <div className="mt-12 max-w-md" data-direct-panglima-checkout>
            {panglima && <ProductCard product={panglima} compact />}
          </div>
        </div>
      </section>
    </>
  );
}
