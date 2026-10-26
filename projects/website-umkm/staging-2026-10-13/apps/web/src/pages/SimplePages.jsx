import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { MessageCircle, MapPin, Clock, ArrowRight, Check, ShieldCheck, BookOpen, Target } from 'lucide-react';
import Seo from '@/components/Seo';
import Reveal from '@/components/Reveal';
import { PageHero, Breadcrumb, ProductCard, Kicker, SectionTitle } from '@/components/Bits';
import { SITE, PRODUCTS, MEDAN } from '@/data/site';

function Meta({ title, description, path, image }) {
  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${SITE.url}${path}`} />
      </Helmet>
      <Seo title={title} description={description} url={`${SITE.url}${path}`} siteName={SITE.name} image={image} />
    </>
  );
}

export function DiagnosisPage() {
  return (
    <>
      <Meta
        title="Business Health Check 10 Medan — Diagnosis Bisnis UMKM | UMKM Naik Kelas"
        description="Periksa kondisi bisnis Anda di 10 medan: pemasaran, penjualan, operasional, keuangan, tim, digital, produksi, distribusi, negosiasi, dan ekspansi."
        path="/diagnosis-10-medan"
      />
      <PageHero
        kicker="Diagnosis sebelum strategi"
        title="Business Health Check 10 Medan"
        subtitle="Sepuluh area yang perlu dibaca sebelum menentukan gerakan. Temukan masalah prioritas, pilih satu sasaran, lalu susun rencana aksi yang realistis."
      >
        <div className="mt-8">
          <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Diagnosis 10 Medan' }]} />
        </div>
      </PageHero>
      <section className="bg-white px-5 py-16">
        <div className="mx-auto grid max-w-[72rem] gap-4 md:grid-cols-2">
          {MEDAN.map((m, i) => (
            <Reveal key={m.n} delay={i * 0.04}>
              <div className="flex h-full gap-4 rounded-2xl border border-black/10 p-6">
                <span className="font-display text-3xl text-primary">{m.n}</span>
                <div>
                  <h2 className="font-display text-2xl text-neutral-900">{m.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{m.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mx-auto mt-14 max-w-[72rem] rounded-3xl bg-neutral-50 p-8 ring-1 ring-black/10 sm:p-12">
          <Kicker>Langkah berikutnya</Kicker>
          <SectionTitle className="mt-4">Ubah hasil diagnosis menjadi Action Plan</SectionTitle>
          <p className="mt-4 max-w-xl text-neutral-600">
            Panglima UMKM membantu mengubah hasil diagnosis menjadi maksimal tiga prioritas, Action Plan 30 Hari, KPI, dan ritme review agar perbaikan tidak berhenti sebagai catatan.
          </p>
          <Link to="/paket" className="mt-7 inline-flex min-h-[50px] items-center gap-2 rounded-full bg-primary px-7 font-bold text-primary-foreground active:scale-[0.98]">
            Lihat Panglima UMKM <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

export function PaketPage() {
  const panglima = PRODUCTS.find((product) => product.id === 'panglima');

  const outcomes = [
    {
      title: 'Tahu masalah mana yang harus didahulukan',
      desc: 'Diagnosis 10 Medan membantu memisahkan gejala dari masalah yang paling menahan bisnis saat ini.',
    },
    {
      title: 'Punya maksimal 3 prioritas',
      desc: 'Energi tidak disebar ke terlalu banyak pekerjaan. Fokus diarahkan ke sedikit sasaran yang paling berdampak.',
    },
    {
      title: 'Action Plan yang bisa dijalankan',
      desc: 'Setiap prioritas diterjemahkan menjadi aksi, PIC, deadline, dan KPI agar progres dapat diperiksa.',
    },
    {
      title: 'Keputusan mingguan berbasis bukti',
      desc: 'Target dibandingkan dengan aktual lalu diputuskan: lanjutkan, perbaiki, uji ulang, atau hentikan.',
    },
  ];

  const process = [
    ['01', 'Diagnosis', 'Baca kondisi usaha melalui 10 Medan dan bukti yang tersedia.'],
    ['02', 'Prioritas', 'Pilih maksimal tiga masalah yang paling layak dikerjakan lebih dulu.'],
    ['03', 'Eksekusi', 'Jalankan Action Plan dengan PIC, deadline, KPI, Zoom, dan follow-up.'],
    ['04', 'Evaluasi', 'Review hasil mingguan dan tentukan tindakan berikutnya berdasarkan data.'],
  ];

  return (
    <>
      <Meta
        title="Paket Panglima UMKM 30 Hari | Diagnosis, Prioritas & Action Plan"
        description="Program pendampingan Panglima UMKM 30 Hari untuk owner UMKM: Diagnosis 10 Medan, maksimal 3 prioritas, Action Plan, KPI, 4 sesi Zoom, WhatsApp, dan review mingguan."
        path="/paket"
      />

      <PageHero
        kicker="Program utama UMKM Naik Kelas"
        title="Paket Panglima UMKM 30 Hari"
        subtitle="Untuk owner UMKM yang ingin berhenti menebak-nebak prioritas: diagnosis dulu, pilih masalah yang paling berdampak, jalankan Action Plan, lalu evaluasi berdasarkan bukti."
      >
        <div className="mt-8">
          <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Panglima UMKM' }]} />
        </div>
      </PageHero>

      <section className="bg-white px-5 py-16">
        <div className="mx-auto grid max-w-[72rem] gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <Reveal>
            <div>
              <Kicker>Hasil yang dibangun</Kicker>
              <SectionTitle className="mt-4">
                Bukan sekadar ikut pendampingan. Bangun arah kerja yang lebih jelas.
              </SectionTitle>
              <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
                Panglima UMKM dirancang untuk membantu owner mengubah bisnis yang sibuk menjadi bisnis yang punya prioritas, penanggung jawab, ukuran keberhasilan, dan ritme evaluasi.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {outcomes.map((item) => (
                  <article key={item.title} className="rounded-2xl border border-black/10 bg-neutral-50 p-5">
                    <Check className="h-5 w-5 text-primary" strokeWidth={2.4} />
                    <h2 className="mt-3 text-base font-black text-neutral-900">{item.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.desc}</p>
                  </article>
                ))}
              </div>
            </div>
          </Reveal>

          {panglima && (
            <Reveal delay={0.08}>
              <ProductCard product={panglima} />
            </Reveal>
          )}
        </div>
      </section>

      <section className="bg-neutral-50 px-5 py-16">
        <div className="mx-auto max-w-[72rem]">
          <Reveal>
            <Kicker>Proses 30 hari</Kicker>
            <SectionTitle className="mt-4">Diagnosis → Prioritas → Eksekusi → Evaluasi</SectionTitle>
          </Reveal>

          <div className="mt-9 grid gap-4 md:grid-cols-4">
            {process.map(([number, title, desc], index) => (
              <Reveal key={number} delay={index * 0.05}>
                <article className="h-full rounded-2xl border border-black/10 bg-white p-5">
                  <span className="text-xs font-black text-primary">{number}</span>
                  <h2 className="mt-2 font-display text-2xl text-neutral-900">{title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">{desc}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-16">
        <div className="mx-auto grid max-w-[72rem] gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-black/10 p-7 sm:p-8">
            <Kicker>Yang perlu diketahui</Kicker>
            <h2 className="mt-4 font-display text-3xl text-neutral-900">Panglima adalah program utama untuk owner UMKM umum</h2>
            <ul className="mt-6 grid gap-3">
              {[
                'Harga Panglima mengikuti harga yang tampil pada checkout Lynk.id resmi.',
                'Buku New Edition termasuk dalam Paket Panglima; ongkos kirim dihitung berdasarkan alamat penerima.',
                'Jadwal Zoom dan pendampingan dikonfirmasi setelah transaksi berhasil.',
                'Program membantu proses diagnosis, prioritas, eksekusi, dan evaluasi; tidak menjamin omzet atau profit tertentu.',
              ].map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-neutral-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl bg-[hsl(var(--ink))] p-7 text-white sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[hsl(var(--gold))]">
              Bekerja di profesi tertentu?
            </p>
            <h2 className="mt-3 font-display text-3xl leading-tight">
              Gunakan Program Profesi jika medan kerja Anda Asuransi, Properti, atau MLM / Direct Selling.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-neutral-300">
              Program Profesi memakai kerangka Panglima yang sama, tetapi contoh, pipeline, dan penerapannya disesuaikan dengan profesi masing-masing.
            </p>
            <Link
              to="/program"
              className="mt-7 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[hsl(var(--gold))] px-6 text-sm font-black text-[hsl(var(--ink))] active:scale-[0.98]"
            >
              Lihat Program Profesi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function TentangPage() {
  return (
    <>
      <Meta
        title="Tentang W. Gunawan — Penulis 100 Strategi Sun Tzu | UMKM Naik Kelas"
        description="Profil W. Gunawan, Certified BNSP Pendamping UMKM dan penulis buku 100 Strategi Sun Tzu: UMKM Naik Kelas."
        path="/tentang"
      />
      <PageHero
        kicker="Penulis & pendamping"
        title="W. Gunawan"
        subtitle="Menerjemahkan prinsip Sun Tzu menjadi kerangka diagnosis, prioritas, dan action plan yang lebih mudah digunakan pemilik UMKM."
      >
        <div className="mt-8"><Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Tentang' }]} /></div>
      </PageHero>
      <section className="bg-white px-5 py-16">
        <div className="mx-auto grid max-w-[72rem] gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="relative overflow-hidden rounded-3xl bg-[hsl(var(--ink))] p-10 text-white ring-1 ring-black/10">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/35 blur-3xl" />
            <span className="relative font-display text-8xl text-[hsl(var(--gold))]">WG</span>
            <p className="relative mt-5 text-xl font-bold">W. Gunawan</p>
            <p className="relative mt-1 text-sm text-neutral-400">{SITE.authorRole}</p>
            <div className="relative mt-10 grid gap-4">
              <div className="flex gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <BookOpen className="h-5 w-5 shrink-0 text-[hsl(var(--gold))]" />
                <p className="text-sm text-neutral-300">Penulis Buku 100 Strategi Sun Tzu: UMKM Naik Kelas — New Edition.</p>
              </div>
              <div className="flex gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <Target className="h-5 w-5 shrink-0 text-[hsl(var(--gold))]" />
                <p className="text-sm text-neutral-300">Pengembang pendekatan Business Health Check 10 Medan untuk memilih masalah prioritas.</p>
              </div>
            </div>
          </div>
          <div className="space-y-5 text-[15px] leading-relaxed text-neutral-700">
            <p className="font-display text-3xl leading-snug text-neutral-900">
              &ldquo;Peserta tidak pulang hanya dengan semangat, tetapi dengan strategi dan action plan yang jelas.&rdquo;
            </p>
            <p>
              Buku dan program UMKM Naik Kelas dikembangkan untuk membantu pemilik usaha membaca kondisi bisnis sebelum memilih tindakan. Pendekatannya tidak dimulai dari janji omzet instan, tetapi dari diagnosis yang jujur terhadap pemasaran, penjualan, operasional, keuangan, tim, digital, produksi, distribusi, negosiasi, dan ekspansi.
            </p>
            <p>
              Prinsip Sun Tzu digunakan sebagai cara berpikir: kenali diri, kenali medan, pilih prioritas, dan hindari pertempuran yang menguras sumber daya. Dalam konteks UMKM, salah satu penerapannya adalah berhenti menjadikan perang harga sebagai satu-satunya cara bersaing.
            </p>
            <p>
              Ekosistem UMKM Naik Kelas sekarang dibagi lebih jelas: Buku New Edition sebagai dasar belajar, Panglima UMKM 30 Hari sebagai program utama untuk owner UMKM umum, dan Program Profesi untuk penerapan khusus Agen Asuransi, Agen Properti, serta MLM / Direct Selling.
            </p>
            <Link to="/kontak" className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground">
              Ajak berdiskusi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function KontakPage() {
  const cards = [
    { icon: MessageCircle, t: 'WhatsApp', d: '+62 822-3405-1276', href: `https://wa.me/${SITE.whatsapp}`, cta: 'Chat sekarang' },
    { icon: Clock, t: 'Jam layanan', d: 'Silakan kirim pesan. Tim akan merespons pada jam layanan yang tersedia.' },
    { icon: MapPin, t: 'Jangkauan', d: `${SITE.location} — sesi kelas dan pendampingan dapat dilakukan secara daring.` },
    { icon: ShieldCheck, t: 'Pembayaran', d: 'Gunakan hanya tautan Lynk.id resmi yang tersedia pada halaman Panglima UMKM atau Program Profesi.' },
  ];

  return (
    <>
      <Meta
        title="Kontak — UMKM Naik Kelas"
        description="Hubungi UMKM Naik Kelas untuk pertanyaan seputar buku, paket pendampingan, undangan, atau kerja sama."
        path="/kontak"
      />
      <PageHero kicker="Hubungi kami" title="Mari bicara strategi" subtitle="Tanya soal buku, paket pendampingan, jadwal kelas, undangan, atau kerja sama komunitas UMKM.">
        <div className="mt-8"><Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Kontak' }]} /></div>
      </PageHero>
      <section className="bg-white px-5 py-16">
        <div className="mx-auto grid max-w-[72rem] gap-6 md:grid-cols-2">
          {cards.map((c) => (
            <div key={c.t} className="rounded-2xl border border-black/10 p-7">
              <c.icon className="h-6 w-6 text-primary" strokeWidth={1.8} />
              <h2 className="mt-4 font-display text-2xl text-neutral-900">{c.t}</h2>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">{c.d}</p>
              {c.href && (
                <a href={c.href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
                  {c.cta} <ArrowRight className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function PrivasiPage() {
  return (
    <>
      <Meta title="Kebijakan Privasi — UMKM Naik Kelas" description="Kebijakan privasi UMKM Naik Kelas mengenai penggunaan data pengunjung dan pembeli." path="/kebijakan-privasi" />
      <PageHero kicker="Legal" title="Kebijakan Privasi" subtitle="Terakhir diperbarui: 6 Agustus 2026." />
      <section className="bg-white px-5 py-16">
        <div className="mx-auto max-w-[56rem] space-y-6 text-[15px] leading-relaxed text-neutral-700">
          {[
            ['Data yang diberikan', 'Kami dapat menerima data yang Anda berikan secara sukarela ketika menghubungi tim atau menyelesaikan pembelian melalui layanan pihak ketiga.'],
            ['Penggunaan data', 'Data digunakan untuk menjawab pertanyaan, memproses kebutuhan pembeli, mengatur pengiriman, serta menyampaikan informasi kelas atau pendampingan yang dipilih.'],
            ['Pembayaran', 'Transaksi diproses melalui Lynk.id. Situs ini tidak menyimpan data kartu atau kredensial pembayaran Anda.'],
            ['Analitik dan cookie', 'Situs dapat menggunakan teknologi analitik dasar untuk memahami kunjungan halaman dan memperbaiki pengalaman pengguna.'],
            ['Permintaan terkait data', `Untuk pertanyaan atau permintaan terkait data, hubungi tim melalui WhatsApp +62 822-3405-1276.`],
          ].map(([t, d]) => (
            <div key={t}>
              <h2 className="font-display text-2xl text-neutral-900">{t}</h2>
              <p className="mt-2">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
