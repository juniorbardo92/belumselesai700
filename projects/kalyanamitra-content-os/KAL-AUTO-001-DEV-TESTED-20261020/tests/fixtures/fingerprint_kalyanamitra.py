"""FUNGSI KANONIS TUNGGAL untuk normalisasi teks & fingerprint.
Dipakai OLEH KEDUA SISI: pembuat baseline 108 jadwal DAN publisher Kalyanamitra.
Jangan ada salinan kedua; impor dari berkas ini (B2).

RIWAYAT
-------
v1.0.0  normalize_text, fingerprint, fingerprint_utas (gabung "\n").
v1.0.1  fingerprint_utas: pemisah antar-post menjadi parameter `separator`
        dengan NILAI DEFAULT "" (tanpa pemisah).

        Alasan (diverifikasi ulang terhadap jadwal NYATA lewat Repliz GET):
          * `fingerprint(description)`            == `fingerprint_kanonis`
            yang tersimpan di baseline : 108/108 COCOK.
          * `fingerprint_utas(posts, "\n")`       == `fingerprint_kanonis_utas`
            yang tersimpan di baseline : 0/108 COCOK  (v1.0.0 TIDAK mereproduksi)
          * `fingerprint_utas(posts, "")`         == `fingerprint_kanonis_utas`
            yang tersimpan di baseline : 108/108 COCOK
        Baseline kanonis dibangun dengan penggabungan TANPA pemisah. Default
        v1.0.0 (pemisah "\n") hanya akan membuat lapis sidik jari utas DIAM-DIAM
        tidak pernah cocok -> duplikat lolos (false negative). Karena itu default
        diselaraskan ke "" supaya kedua sisi memakai hasil yang identik.

        Efek samping (collision) praktis nol: post adalah paragraf panjang;
        dua utas berbeda yang hasil gabungan-nya sama mustahil secara praktis.
"""
import hashlib
import re
import unicodedata

VERSION = "1.0.1"

# Pemisah default antar-post untuk fingerprint_utas. WAJIB "" agar identik
# dengan baseline kanonis 108 jadwal (lihat RIWAYAT di atas).
SEPARATOR_UTAS_DEFAULT = ""


def normalize_text(text: str) -> str:
    if not text:
        return ""
    t = unicodedata.normalize("NFKC", text)
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Cf")
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"[ \t\u00a0]+", " ", t)
    t = re.sub(r"\n{2,}", "\n", t)
    return t.strip().casefold()


def fingerprint(text: str) -> str:
    """Sidik jari teks tunggal (16 hex pertama sha256 dari teks ternormalisasi)."""
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()[:16]


def fingerprint_utas(posts, separator: str = SEPARATOR_UTAS_DEFAULT) -> str:
    """Sidik jari satu utas: gabungan teks semua post.

    `separator` default "" (kompatibel & terverifikasi terhadap baseline kanonis).
    Jangan mengubah default tanpa menyelaraskan ulang baseline 108 jadwal.
    """
    if isinstance(posts, str):
        parts = [posts]
    else:
        parts = [
            p if isinstance(p, str) else (p.get("text") or p.get("caption") or "")
            for p in posts
        ]
    return fingerprint(separator.join(parts))


def jalur_dari_jadwal(doc: dict) -> list:
    """Ambil daftar teks utas dari dokumen jadwal Repliz (description + replies)."""
    posts = [doc.get("description") or ""]
    for r in (doc.get("replies") or []):
        posts.append(r.get("description") or r.get("text") or "")
    return posts
