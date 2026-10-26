import React from 'react';
import { Helmet } from 'react-helmet';

const LEAD_ENDPOINT = 'https://script.google.com/macros/s/REPLACE_APPS_SCRIPT_DEPLOYMENT_ID/exec';

const MEDAN_OPTIONS = [
  'Pemasaran',
  'Penjualan',
  'Operasional',
  'Keuangan',
  'SDM',
  'Digital',
  'Produksi',
  'Distribusi',
  'Negosiasi',
  'Ekspansi',
];

const getUtmParams = () => {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '',
    utm_content: params.get('utm_content') || '',
    utm_term: params.get('utm_term') || '',
  };
};

const trackWaitlist = (eventName, params = {}) => {
  if (typeof window === 'undefined') return;
  if (typeof window.fbq === 'function') {
    window.fbq('trackCustom', eventName, params);
  }
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(), {
      event_category: 'waitlist',
      ...params,
    });
  }
};

export default function WaitlistPage() {
  return (
    <>
      <Helmet>
        <title>Waitlist Pendampingan UMKM — 3 Slot September 2026</title>
        <meta
          name="description"
          content="Daftar waitlist pendampingan UMKM 4 minggu untuk memperbaiki 3 medan terlemah hasil Diagnosis 10 Medan."
        />
        <link rel="canonical" href="https://umkmnaikkelas.id/waitlist" />
      </Helmet>

      <main className="bg-[#fffaf3] text-neutral-950">
        <section className="bg-[#6f1515] px-5 py-16 text-white sm:py-20">
          <div className="mx-auto max-w-5xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[hsl(var(--gold))]">
              Waitlist Pendampingan • September 2026
            </p>
            <h1 className="mx-auto mt-4 max-w-4xl font-display text-3xl font-bold leading-tight sm:text-5xl">
              Daftar Waitlist Pendampingan UMKM — 3 Slot Terbatas September 2026
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-sm leading-relaxed text-red-50 sm:text-base">
              Untuk pemilik UMKM yang sudah diagnosis 10 medan, tahu 3 prioritas, tapi butuh pendampingan agar benar-benar jalan.
            </p>
          </div>
        </section>

        <section className="px-5 py-14 sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6">
              <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="font-display text-2xl font-bold">Apa yang Anda dapatkan</h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-neutral-700">
                  <li>• Sesi pendampingan 1-on-1 (online) selama 4 minggu.</li>
                  <li>• Fokus: 3 medan terlemah dari hasil checklist Anda.</li>
                  <li>• Rencana aksi 7 hari yang spesifik, bukan teori.</li>
                  <li>• Follow-up via WhatsApp setiap minggu.</li>
                  <li>• Modul dari buku <em>100 Strategi Sun Tzu: UMKM Naik Kelas</em>.</li>
                </ul>
              </div>

              <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="font-display text-2xl font-bold">Untuk siapa</h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-neutral-700">
                  <li>• Sudah mengisi Checklist Diagnosis 10 Medan.</li>
                  <li>• Punya 3 medan dengan skor 4–6 (rawan).</li>
                  <li>• Serius ingin memperbaiki dalam 30 hari.</li>
                  <li>• Bukan untuk yang hanya ingin teori atau diskon.</li>
                </ul>
              </div>

              <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="font-display text-2xl font-bold">Cara Kerja</h2>
                <ol className="mt-5 space-y-3 text-sm leading-relaxed text-neutral-700">
                  <li><strong>1.</strong> Isi form waitlist di samping.</li>
                  <li><strong>2.</strong> Saya review 3 medan terendah Anda.</li>
                  <li><strong>3.</strong> Jika cocok, saya kirim undangan sesi.</li>
                  <li><strong>4.</strong> Jika belum cocok, Anda tetap dapat tips via email.</li>
                </ol>
              </div>
            </div>

            <div>
              <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-xl sm:p-8 lg:sticky lg:top-6">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Form Waitlist</p>
                <h2 className="mt-2 font-display text-3xl font-bold">Saya Siap Dibantu</h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                  Isi berdasarkan hasil Checklist Diagnosis 10 Medan Anda. Skor dipakai untuk membantu prioritas review.
                </p>

                <form
                  id="waitlist-form"
                  className="mt-6 space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    const payload = new URLSearchParams();
                    const utm = getUtmParams();

                    payload.append('action', 'waitlist');
                    payload.append('name', String(fd.get('name') || '').trim());
                    payload.append('whatsapp', String(fd.get('whatsapp') || '').trim());
                    payload.append('email', String(fd.get('email') || '').trim());
                    payload.append('medan1', String(fd.get('medan1') || '').trim());
                    payload.append('medan2', String(fd.get('medan2') || '').trim());
                    payload.append('medan3', String(fd.get('medan3') || '').trim());
                    payload.append('score1', String(fd.get('score1') || '').trim());
                    payload.append('score2', String(fd.get('score2') || '').trim());
                    payload.append('score3', String(fd.get('score3') || '').trim());
                    payload.append('problem', String(fd.get('problem') || '').trim());
                    payload.append('target30', String(fd.get('target30') || '').trim());
                    payload.append('source', 'umkmnaikkelas.id/waitlist');
                    payload.append('page', window.location.href);
                    Object.entries(utm).forEach(([key, value]) => payload.append(key, value));

                    const button = form.querySelector('button[type="submit"]');
                    const status = document.getElementById('waitlist-submit-status');
                    if (button) { button.disabled = true; button.textContent = 'Mengirim...'; }
                    if (status) status.textContent = '';

                    try {
                      await fetch(LEAD_ENDPOINT, { method: 'POST', mode: 'no-cors', body: payload });
                      trackWaitlist('WaitlistSubmit', { content_name: 'Waitlist Pendampingan September 2026', ...utm });
                      if (status) status.textContent = 'Terima kasih. Form waitlist Anda sudah diterima. Saya akan review 3 medan terendah Anda.';
                      form.reset();
                    } catch (error) {
                      console.error(error);
                      if (status) status.textContent = 'Terjadi kendala saat mengirim. Silakan coba lagi.';
                    } finally {
                      if (button) { button.disabled = false; button.textContent = 'Saya Siap Dibantu'; }
                    }
                  }}
                >
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-neutral-600">Nama</label>
                    <input name="name" required autoComplete="name" className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary" />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-neutral-600">WhatsApp</label>
                      <input name="whatsapp" required inputMode="tel" placeholder="08... / +62..." className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-neutral-600">Email</label>
                      <input name="email" type="email" required autoComplete="email" className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-neutral-600">3 medan terendah (dari checklist)</label>
                    <div className="space-y-3">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="grid gap-3 sm:grid-cols-[1fr_110px]">
                          <select name={`medan${n}`} required className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-primary">
                            <option value="">Medan #{n}</option>
                            {MEDAN_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <input name={`score${n}`} type="number" min="4" max="12" required placeholder="Skor" className="rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary" />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">Masukkan skor asli 4–12 agar kualifikasi tetap akurat.</p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-neutral-600">Masalah paling mengganggu saat ini</label>
                    <textarea name="problem" required rows={4} className="w-full resize-none rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary" />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-neutral-600">Target 30 hari ke depan</label>
                    <textarea name="target30" required rows={3} className="w-full resize-none rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-primary" />
                  </div>

                  <button type="submit" className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-primary px-7 text-sm font-extrabold text-primary-foreground transition hover:opacity-90">
                    Saya Siap Dibantu
                  </button>
                  <p id="waitlist-submit-status" className="text-center text-xs font-semibold text-neutral-600" aria-live="polite" />
                </form>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-black/10 bg-white px-5 py-14">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center font-display text-3xl font-bold">FAQ Singkat</h2>
            <div className="mt-8 grid gap-4">
              <div className="rounded-2xl border border-black/10 bg-neutral-50 p-5">
                <h3 className="font-bold">Berapa investasinya?</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">Akan diinfokan setelah saya review form Anda. Saya hanya menerima yang benar-benar cocok.</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-neutral-50 p-5">
                <h3 className="font-bold">Apakah online?</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">Ya, via Zoom/WA. Cocok untuk Anda yang terbatas aktivitas di luar rumah.</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-neutral-50 p-5">
                <h3 className="font-bold">Berapa lama?</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">4 minggu, 1 sesi per minggu + follow-up WA.</p>
              </div>
            </div>

            <blockquote className="mx-auto mt-10 max-w-3xl text-center font-display text-xl italic leading-relaxed text-neutral-700">
              “Menang bukan berarti bergerak paling cepat. Menang dimulai dari membaca medan dengan tepat.”
            </blockquote>
          </div>
        </section>
      </main>
    </>
  );
}
