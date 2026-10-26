/**
 * UMKM Naik Kelas | SEO safe-head postbuild, 2026-10-13
 * Only writes HTML wrappers to dist after `vite build`; DOES NOT touch images,
 * source components, React hydration, Javascript bundles, or upload/zoom features.
 * It intentionally does NOT claim SSR/H1 prerender; content stays React-rendered.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');
const dist = path.resolve(web, '../../dist/apps/web');
const siteBase = 'https://umkmnaikkelas.id';
const indexFile = path.join(dist, 'index.html');
const rawIndex = fs.readFileSync(indexFile, 'utf8');
const e = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATIC = {
  '/': ['UMKM Naik Kelas — Jangan Berbisnis Tanpa Peta | Buku 100 Strategi Sun Tzu', 'Buku 100 Strategi Sun Tzu: UMKM Naik Kelas New Edition dan pendampingan bisnis dengan Business Health Check 10 Medan. Hentikan perang harga dan kebocoran kas.'],
  '/buku': ['Jangan Berbisnis Tanpa Peta | Buku UMKM Naik Kelas Rp168.000', 'Buku 100 Strategi Sun Tzu: UMKM Naik Kelas New Edition, dengan panduan diagnosis 10 Medan dan strategi bisnis untuk UMKM.'],
  '/panglima': ['Panglima UMKM 30 Hari | Dari Sibuk Menjadi Punya Arah & Prioritas', 'Panglima UMKM membantu owner membangun 3 prioritas yang jelas, Action Plan 30 Hari, PIC, KPI dan ritme evaluasi mingguan melalui diagnosis 10 Medan.'],
  '/program': ['Program Profesi Panglima UMKM | Asuransi, Properti, Direct Selling', 'Program Panglima UMKM untuk Agen Asuransi, Agen Properti, dan MLM atau Direct Selling. Fokus prioritas, pipeline, Action Plan dan KPI.'],
  '/program/agen-asuransi': ['Agen Asuransi | Panglima UMKM 30 Hari', 'Pendampingan strategi Agen Asuransi: diagnosis kebutuhan, prospek, pipeline, tindak lanjut dan Action Plan yang terukur.'],
  '/program/agen-properti': ['Agen Properti | Panglima UMKM 30 Hari', 'Pendampingan strategi Agen Properti: listing, prospek, pipeline, negosiasi dan Action Plan yang terukur.'],
  '/program/mlm-direct-selling': ['MLM / Direct Selling | Panglima UMKM 30 Hari', 'Program strategi MLM dan Direct Selling: prospecting, presentasi, tindak lanjut, retensi dan Action Plan yang terukur.'],
  '/diagnosis-10-medan': ['Business Health Check 10 Medan — Diagnosis Bisnis UMKM | UMKM Naik Kelas', 'Periksa kondisi bisnis Anda di 10 medan: pemasaran, penjualan, operasional, keuangan, tim, digital, produksi, distribusi, negosiasi, dan ekspansi.'],
  '/paket': ['Paket Panglima UMKM 30 Hari | Diagnosis, Prioritas & Action Plan', 'Program pendampingan Panglima UMKM 30 Hari untuk owner UMKM: Diagnosis 10 Medan, maksimal 3 prioritas, Action Plan, KPI, 4 sesi Zoom, WhatsApp, dan review mingguan.'],
  '/affiliate': ['Panglima Affiliate Program | Jual Hasil, Bangun Komisi', 'Bergabung sebagai Partner Panglima UMKM untuk merekomendasikan program dan memperoleh jalur referral resmi.'],
  '/artikel': ['Artikel Strategi Bisnis UMKM — UMKM Naik Kelas', 'Kumpulan panduan Business Health Check 10 Medan untuk UMKM: pemasaran, penjualan, operasional, keuangan, SDM, digital, produksi, distribusi, negosiasi, dan ekspansi.'],
  '/tentang': ['Tentang W. Gunawan — Penulis 100 Strategi Sun Tzu | UMKM Naik Kelas', 'Profil W. Gunawan, Certified BNSP Pendamping UMKM dan penulis buku 100 Strategi Sun Tzu: UMKM Naik Kelas.'],
  '/kontak': ['Kontak — UMKM Naik Kelas', 'Hubungi UMKM Naik Kelas untuk pertanyaan seputar buku, paket pendampingan, undangan, atau kerja sama.'],
  '/kebijakan-privasi': ['Kebijakan Privasi — UMKM Naik Kelas', 'Kebijakan privasi UMKM Naik Kelas mengenai penggunaan data pengunjung dan pembeli.'],
};

function loadArticleCatalog() {
  const code = fs.readFileSync(path.join(web, 'src/data/site.js'), 'utf8');
  // Image imports intentionally replaced with empty objects FOR METADATA EXTRACTION ONLY.
  // No source file or actual image is modified. This avoids loading giant base64 files.
  const variables = [...code.matchAll(/^import\s+\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\s+from\s+[^;]+;\s*$/gm)].map(m => m[1]);
  const noImports = code.replace(/^import\s+\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\s+from\s+[^;]+;\s*$/gm, '');
  if (variables.length !== 14 || /\bimport\b/.test(noImports.slice(0, 300))) throw Error('Struktur import site.js berubah; hentikan untuk mencegah metadata salah');
  const context = variables.map(v => `const ${v} = {};`).join('\n') + '\n' + noImports.replace(/\bexport\s+const\s+/g, 'const ') + '\n globalThis.__seo_articles = ARTICLES;';
  const sandbox = {};
  vm.runInNewContext(context, sandbox, { timeout: 4000 });
  const arr = sandbox.__seo_articles;
  if (!Array.isArray(arr) || arr.length < 20) throw Error('Daftar artikel tidak ditemukan atau tidak lengkap');
  return arr;
}

const all = new Map(Object.entries(STATIC));
const articles = loadArticleCatalog();
for (const a of articles) {
  if (!a.slug || !a.title || !a.description || !/^[a-z0-9-]+$/.test(a.slug)) throw Error('Artikel tidak lengkap: ' + JSON.stringify({slug:a.slug,title:a.title}));
  const urlPath = `/artikel/${a.slug}`;
  if (all.has(urlPath)) throw Error('Duplikasi slug: ' + urlPath);
  all.set(urlPath, [a.metaTitle || `${a.title} | UMKM Naik Kelas`, a.description]);
}

function cleanHead(html, pathname, meta) {
  const match = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (!match) throw Error('Tidak menemukan <head> dalam Vite output');
  let head = match[1];
  // Replace only SEO tags (never pixel, analytics, scripts, image, assets or unrelated metadata).
  head = head.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/gi, '')
    .replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi, '')
    .replace(/<meta\b(?=[^>]*\bproperty=["']og:(?:title|description|url)["'])[^>]*>/gi, '')
    .replace(/<meta\b(?=[^>]*\bname=["']twitter:(?:title|description)["'])[^>]*>/gi, '');
  const [title, description] = meta;
  const canonical = `${siteBase}${pathname}`;
  const tags = `\n  <!-- UMKM static SEO metadata (React + image system unchanged) -->\n` +
    `  <title>${e(title)}</title>\n` +
    `  <meta data-react-helmet="true" name="description" content="${e(description)}" />\n` +
    `  <link data-react-helmet="true" rel="canonical" href="${e(canonical)}" />\n` +
    `  <meta data-react-helmet="true" property="og:title" content="${e(title)}" />\n` +
    `  <meta data-react-helmet="true" property="og:description" content="${e(description)}" />\n` +
    `  <meta data-react-helmet="true" property="og:url" content="${e(canonical)}" />\n` +
    `  <meta data-react-helmet="true" name="twitter:title" content="${e(title)}" />\n` +
    `  <meta data-react-helmet="true" name="twitter:description" content="${e(description)}" />\n`;
  const newHead = head + tags;
  const updated = html.replace(match[0], `<head>${newHead}</head>`);
  if ((updated.match(/<title\b/gi) || []).length !== 1) throw Error('Title bukan 1: ' + pathname);
  if ((updated.match(/rel="canonical"/gi) || []).length !== 1) throw Error('Canonical bukan 1: ' + pathname);
  if (!updated.includes('<div id="root"></div>')) throw Error('React root berubah: ' + pathname);
  if (!updated.includes('https://connect.facebook.net/') || !updated.includes('www.googletagmanager.com/')) throw Error('Script tracking hilang: ' + pathname);
  return updated;
}

// Clean up only route wrappers generated by an earlier run of this tool.
const manifestPath = path.join(dist, 'seo-route-manifest.json');
if (fs.existsSync(manifestPath)) {
  const previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const old of previous.routes || []) {
    if (old.pathname === '/' || all.has(old.pathname)) continue;
    const oldFile = path.join(dist, old.pathname.slice(1), 'index.html');
    if (fs.existsSync(oldFile) && fs.readFileSync(oldFile, 'utf8').includes('UMKM static SEO metadata')) {
      fs.rmSync(oldFile);
    }
  }
}
const manifest = [];
for (const [pathname, meta] of all) {
  const dest = pathname === '/' ? indexFile : path.join(dist, pathname.slice(1), 'index.html');
  // Never overwrite an existing asset/other entrypoint.
  if (pathname !== '/' && fs.existsSync(dest) && !fs.readFileSync(dest, 'utf8').includes('UMKM static SEO metadata')) throw Error('Tidak akan menimpa HTML yang bukan keluaran SEO: ' + dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const body = cleanHead(rawIndex, pathname, meta);
  fs.writeFileSync(dest, body);
  manifest.push({ pathname, title: meta[0], canonical: `${siteBase}${pathname}` });
}
fs.writeFileSync(path.join(dist, 'seo-route-manifest.json'), JSON.stringify({generated:new Date().toISOString(), count:manifest.length, note:'Head metadata only: H1 remains client rendered; does not change images', routes:manifest}, null, 2));
console.log(`SEO_IMAGE_SAFE_OK routes=${manifest.length} articles=${articles.length} image_components_unchanged=true`);
console.log('PENTING: Periksa jumlah route terhadap website LIVE sebelum deploy. Jangan overwrite build produksi jika versi ZIP tertinggal.');
