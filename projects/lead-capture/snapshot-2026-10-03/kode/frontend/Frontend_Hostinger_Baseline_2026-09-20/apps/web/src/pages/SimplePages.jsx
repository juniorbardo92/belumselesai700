import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { MessageCircle, MapPin, Clock, ArrowRight, Check, ShieldCheck, BookOpen, Target } from 'lucide-react';
import Seo from '@/components/Seo';
import Reveal from '@/components/Reveal';
import { PageHero, Breadcrumb, ProductCard, Kicker, SectionTitle } from '@/components/Bits';
import Countdown from '@/components/Countdown';
import { SITE, PRODUCTS, MEDAN, PROMO } from '@/data/site';

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
            Paket Strategi mencakup buku, kelas pemetaan 10 bidang, dan template Action Plan 30 Hari agar hasil pemeriksaan tidak berhenti sebagai catatan.
          </p>
          <Link to="/paket" className="mt-7 inline-flex min-h-[50px] items-center gap-2 rounded-full bg-primary px-7 font-bold text-primary-foreground active:scale-[0.98]">
            Lihat Paket <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

export function PaketPage() {
  return (
    <>
      <Meta
        title="Paket Pendampingan & Buku — UMKM Naik Kelas"
        description="Pilih Buku 100 Strategi Sun Tzu New Edition, Paket Strategi, Paket Panglima UMKM, atau Paket Strategi Private."
        path="/paket"
      />
      <PageHero
        kicker="Produk & pendampingan"
        title="Pilih jalur naik kelas Anda"
        subtitle="Mulai dari buku untuk belajar mandiri, kelas pemetaan, pendampingan 30 hari, sampai konsultasi privat bersama W. Gunawan."
      >
        <div className="mt-8"><Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Paket' }]} /></div>
        {PROMO.active && (
          <div className="mt-8">
            <p className="mb-3 text-sm font-semibold text-[hsl(var(--gold))]">{PROMO.title} berakhir dalam:</p>
            <Countdown />
          </div>
        )}
      </PageHero>
      <section className="bg-white px-5 py-16">
        <div className="mx-auto grid max-w-[80rem] gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PRODUCTS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.06}><ProductCard product={p} /></Reveal>
          ))}
        </div>
        <div className="mx-auto mt-14 max-w-[72rem] rounded-2xl border border-black/10 p-8">
          <h2 className="font-display text-3xl text-neutral-900">Hal yang perlu diketahui</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              'Pembayaran diproses melalui halaman Lynk.id resmi pada tombol tiap paket.',
              'Ongkos kirim buku dihitung berdasarkan alamat penerima.',
              'Paket Strategi, Panglima, dan Private sudah mencakup buku New Edition.',
              'Jadwal kelas dan pendampingan dikonfirmasi melalui WhatsApp setelah pembelian.',
            ].map((f) => (
              <li key={f} className="flex gap-2.5 text-sm text-neutral-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />{f}
              </li>
            ))}
          </ul>
          <Link
            to="/panglima"
            className="mt-7 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground active:scale-[0.98]"
          >
            Lihat detail Paket Panglima UMKM 30 Hari <ArrowRight className="h-4 w-4" />
          </Link>
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
              Setiap paket dirancang dengan tingkat bantuan yang berbeda. Pemilik usaha dapat belajar mandiri melalui buku, mengikuti kelas pemetaan, menjalani pendampingan 30 hari, atau memilih sesi privat sesuai kebutuhan.
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
    { icon: ShieldCheck, t: 'Pembayaran', d: 'Gunakan hanya tautan Lynk.id resmi yang tersedia pada halaman Paket.' },
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
