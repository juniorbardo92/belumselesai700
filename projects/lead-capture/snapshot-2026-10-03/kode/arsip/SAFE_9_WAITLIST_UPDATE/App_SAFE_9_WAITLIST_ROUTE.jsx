import React, { useEffect } from 'react';
import {
  Route,
  Routes,
  BrowserRouter as Router,
  useLocation,
} from 'react-router-dom';

import ScrollToTop from './components/ScrollToTop';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import WaitlistPage from './pages/WaitlistPage';

import {
  DiagnosisPage,
  PaketPage,
  TentangPage,
  KontakPage,
  PrivasiPage,
} from './pages/SimplePages';

import {
  ArtikelPage,
  ArtikelDetailPage,
} from './pages/ArticlePages';


/* =========================================================
   META PIXEL TRACKING
   ========================================================= */

function MetaTracking() {
  const location = useLocation();

  /*
   * 1. VIEW CONTENT
   *
   * Dikirim ketika pengunjung membuka landing page utama.
   *
   * PageView TIDAK dibuat di sini karena PageView
   * sudah dikirim oleh Meta Pixel base code di <head>.
   */
  useEffect(() => {
    if (
      location.pathname === '/' &&
      typeof window.fbq === 'function'
    ) {
      window.fbq('track', 'ViewContent', {
        content_name: 'Landing Page UMKM Naik Kelas',
        content_type: 'website',
      });
    }
  }, [location.pathname]);


  /*
   * 2. LYNK OUTBOUND CLICK
   *
   * Otomatis mendeteksi SEMUA link di website
   * yang mengarah ke lynk.id.
   *
   * Jadi tidak perlu menambahkan onClick
   * satu per satu pada tombol:
   *
   * - Beli Buku
   * - Paket Strategi
   * - Paket Panglima UMKM
   * - Paket Strategi Private
   * - CTA artikel
   * - Header
   * - Menu mobile
   * - Product card
   * - Popup
   */
  useEffect(() => {
    const handleLynkClick = (event) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest('a[href*="lynk.id"]');

      if (!link) {
        return;
      }

      if (typeof window.fbq !== 'function') {
        return;
      }

      window.fbq('trackCustom', 'LynkOutboundClick', {
        destination_url: link.href,
        link_text:
          link.textContent?.trim() || 'Lynk CTA',
        source_page: window.location.pathname,
      });
    };

    document.addEventListener(
      'click',
      handleLynkClick,
      true
    );

    return () => {
      document.removeEventListener(
        'click',
        handleLynkClick,
        true
      );
    };
  }, []);

  return null;
}


/* =========================================================
   MAIN APP
   ========================================================= */

function App() {
  return (
    <Router>

      <ScrollToTop />

      {/* Meta Pixel event tracking */}
      <MetaTracking />

      <Layout>

        <Routes>

          {/* Homepage */}
          <Route
            path="/"
            element={<HomePage />}
          />

          {/* Waitlist Pendampingan */}
          <Route
            path="/waitlist"
            element={<WaitlistPage />}
          />

          {/* Halaman utama */}
          <Route
            path="/diagnosis-10-medan"
            element={<DiagnosisPage />}
          />

          <Route
            path="/paket"
            element={<PaketPage />}
          />

          <Route
            path="/artikel"
            element={<ArtikelPage />}
          />


          {/* =====================================================
              ARTIKEL 10 MEDAN
             ===================================================== */}

          <Route
            path="/artikel/strategi-pemasaran-umkm"
            element={
              <ArtikelDetailPage
                slug="strategi-pemasaran-umkm"
              />
            }
          />

          <Route
            path="/artikel/strategi-penjualan-umkm"
            element={
              <ArtikelDetailPage
                slug="strategi-penjualan-umkm"
              />
            }
          />

          <Route
            path="/artikel/strategi-operasional-umkm"
            element={
              <ArtikelDetailPage
                slug="strategi-operasional-umkm"
              />
            }
          />

          <Route
            path="/artikel/omzet-besar-kas-kosong"
            element={
              <ArtikelDetailPage
                slug="omzet-besar-kas-kosong"
              />
            }
          />

          <Route
            path="/artikel/strategi-mengelola-karyawan-umkm"
            element={
              <ArtikelDetailPage
                slug="strategi-mengelola-karyawan-umkm"
              />
            }
          />

          <Route
            path="/artikel/digitalisasi-umkm-tepat-sasaran"
            element={
              <ArtikelDetailPage
                slug="digitalisasi-umkm-tepat-sasaran"
              />
            }
          />

          <Route
            path="/artikel/strategi-produksi-umkm"
            element={
              <ArtikelDetailPage
                slug="strategi-produksi-umkm"
              />
            }
          />

          <Route
            path="/artikel/strategi-distribusi-umkm"
            element={
              <ArtikelDetailPage
                slug="strategi-distribusi-umkm"
              />
            }
          />

          <Route
            path="/artikel/teknik-negosiasi-bisnis-umkm"
            element={
              <ArtikelDetailPage
                slug="teknik-negosiasi-bisnis-umkm"
              />
            }
          />

          <Route
            path="/artikel/strategi-ekspansi-umkm"
            element={
              <ArtikelDetailPage
                slug="strategi-ekspansi-umkm"
              />
            }
          />


          {/* =====================================================
              ARTIKEL LAIN YANG SUDAH ADA
             ===================================================== */}

          <Route
            path="/artikel/mengatasi-perang-harga-ecommerce-umkm"
            element={
              <ArtikelDetailPage
                slug="mengatasi-perang-harga-ecommerce-umkm"
              />
            }
          />

          <Route
            path="/artikel/diagnosis-sebelum-strategi"
            element={
              <ArtikelDetailPage
                slug="diagnosis-sebelum-strategi"
              />
            }
          />


          {/* =====================================================
              HALAMAN INFORMASI
             ===================================================== */}

          <Route
            path="/tentang"
            element={<TentangPage />}
          />

          <Route
            path="/kontak"
            element={<KontakPage />}
          />

          <Route
            path="/kebijakan-privasi"
            element={<PrivasiPage />}
          />


          {/* =====================================================
              FALLBACK
             ===================================================== */}

          <Route
            path="*"
            element={<HomePage />}
          />

        </Routes>

      </Layout>

    </Router>
  );
}

export default App;