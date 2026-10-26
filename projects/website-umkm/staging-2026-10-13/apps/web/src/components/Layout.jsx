import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, ArrowRight, Mail, MessageCircle, MapPin } from 'lucide-react';
import { SITE, PRODUCTS } from '@/data/site';
import PromoPopup from '@/components/PromoPopup';

const NAV = [
  { to: '/', label: 'Beranda' },
  { to: '/diagnosis-10-medan', label: 'Diagnosis 10 Medan' },
  { to: '/paket', label: 'Panglima UMKM' },
  { to: '/program', label: 'Program Profesi' },
  { to: '/artikel', label: 'Artikel' },
  { to: '/tentang', label: 'Tentang' },
  { to: '/kontak', label: 'Kontak' },
];

const LOGO_URL = 'data:image/webp;base64,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';

export function Logo({ className = '' }) {
  return (
    <Link to="/" className={`inline-flex items-center ${className}`} aria-label={SITE.name}>
      <img
        src={LOGO_URL}
        alt="Logo UMKM Naik Kelas"
        className="h-12 w-12 rounded-md object-contain sm:h-14 sm:w-14"
      />
      <span className="ml-2.5 leading-tight">
        <span className="block font-display text-xl tracking-wide text-foreground">UMKM NAIK KELAS</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--gold))]">Strategi Sun Tzu</span>
      </span>
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[80rem] items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-neutral-600 hover:text-primary'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/paket"
            className="hidden min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-px active:scale-[0.98] sm:inline-flex"
          >
            Butuh Pendampingan <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Buka menu"
            className="grid h-11 w-11 place-items-center rounded-xl border border-black/10 text-neutral-800 lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-black/5 bg-white lg:hidden">
          <nav className="mx-auto flex max-w-[80rem] flex-col px-5 py-3">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `min-h-[46px] border-b border-black/5 py-3 text-base font-semibold ${
                    isActive ? 'text-primary' : 'text-neutral-700'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <Link
              to="/paket"
              className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-full bg-primary px-5 font-bold text-primary-foreground"
            >
              Butuh Pendampingan
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="bg-[hsl(var(--ink))] text-neutral-300">
      <div className="mx-auto grid max-w-[80rem] gap-10 px-5 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Logo UMKM Naik Kelas" className="h-12 w-12 rounded-md bg-white p-1 object-contain" />
            <span className="font-display text-2xl tracking-wide text-white">UMKM NAIK KELAS</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-neutral-400">
            Peta strategi untuk pemilik usaha Indonesia. Diagnosis dulu, baru strategi.
          </p>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--gold))]">Jelajahi</p>
          <ul className="space-y-2 text-sm">
            {NAV.map((n) => (
              <li key={n.to}>
                <Link className="transition-colors hover:text-white" to={n.to}>{n.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--gold))]">Artikel & Legal</p>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/artikel">Semua Artikel</Link></li>
            <li><Link className="hover:text-white" to="/artikel/mengatasi-perang-harga-ecommerce-umkm">Menang Tanpa Banting Harga</Link></li>
            <li><Link className="hover:text-white" to="/kebijakan-privasi">Kebijakan Privasi</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--gold))]">Kontak</p>
          <ul className="space-y-2 text-sm">
            {SITE.email && (
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-[hsl(var(--gold))]" />{SITE.email}</li>
            )}
            <li className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-[hsl(var(--gold))]" />WhatsApp +62 822-3405-1276</li>
            <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[hsl(var(--gold))]" />{SITE.location}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-[80rem] px-5 py-5 text-xs text-neutral-500">
          © {new Date().getFullYear()} UMKM Naik Kelas. Seluruh hak cipta dilindungi.
        </div>
      </div>
    </footer>
  );
}

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <PromoPopup />
    </div>
  );
}
