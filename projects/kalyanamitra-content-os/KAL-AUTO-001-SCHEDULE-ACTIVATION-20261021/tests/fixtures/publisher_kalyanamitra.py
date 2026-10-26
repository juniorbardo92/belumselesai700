#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
publisher_kalyanamitra.py  (Jalur B)  v2.0.0
============================================
Publisher Kalyanamitra dengan jaminan ANTI-DUPLIKASI 3 LAPIS.

Pola diambil dari /opt/umkm-engine/scripts/publish_repliz_once.py (yang sudah
terbukti): verify_account, fetch_schedules, occupied_slots, next_free_slot,
idempotensi `WHERE repliz_schedule_id IS NULL`, tulis balik ID setelah sukses,
dan TIDAK ADA retry POST otomatis (gagal/timeout -> RECONCILE).

PERUBAHAN v2.0.0 (finalisasi Jalur B)
-------------------------------------
B2  Sidik jari TIDAK LAGI didefinisikan ulang di berkas ini. Modul ini
    MENGIMPOR fungsi kanonis tunggal:
        fingerprint_kalyanamitra.py  (normalize_text, fingerprint, fingerprint_utas)
    Jalur berkas diatur lewat KALYANAMITRA_FINGERPRINT_DIR
    (default /var/lib/hermes-ai/provisioning). Tidak ada salinan kode.
B7  LARANGAN DUPLIKASI DIPISAHKAN DARI ADAPTASI LINTAS PLATFORM.
    * Lapis sidik jari berlaku PER PLATFORM. Sidik jari Threads TIDAK PERNAH
      memblokir carousel Instagram yang sah (turunan dari sumber yang sama),
      meskipun teksnya identik.
    * Lintas platform HANYA diblokir bila ada PENAUTAN EKSPLISIT yang
      menyatakan duplikat, yaitu `source_content_id` kandidat sudah dipakai
      oleh jadwal yang ada (akun mana pun).
B6  Cabang pemilihan hari/slot jam malam: bila waktu Asia/Jakarta sudah
    melewati batas jam (default 20:45 WIB) ATAU hari ini sudah penuh,
    kandidat digeser ke hari berikutnya. Zona dihitung eksplisit di
    Asia/Jakarta, dikonversi ke UTC saat dikirim.

LAPIS
-----
Lapis 1  slot waktu terisi, granularitas (akun, hari, menit) zona Asia/Jakarta,
         ditambah cap jumlah jadwal per hari (KALYANAMITRA_MAX_PER_DAY)
         dan batas jam malam (KALYANAMITRA_CUTOFF_JAM).
Lapis 2  sidik jari teks konten (PER PLATFORM) dibandingkan terhadap jadwal
         yang sudah ada: diambil LIVE dari API + dari berkas baseline.
Lapis 3  kunci idempotensi DB: klaim atomik `repliz_schedule_id IS NULL`
         + UNIQUE partial index (dibuat oleh migrate_publish_columns.py).

Kill switch & flag yang DIHORMATI (tidak ada POST bila salah satu gagal):
  PUBLISH_ENABLED=true            (wajib; ENGINE_MODE=draft_only tetap menang)
  REPLIZ_ENABLED=true             (wajib)
  INSTAGRAM_ENABLED=true          (wajib HANYA bila target = instagram)
  DUPLICATE_CHECK_ENABLED=true    (wajib; bila false -> publisher MENOLAK jalan)
  ENGINE_MODE != draft_only       (bila masih draft_only -> otomatis dry-run)
  SOURCE_AUDIT_REQUIRED=true      -> review.source_verified wajib True
  REVIEW_REQUIRED=true            -> review.status wajib APPROVED
  validator validate_dharma_json.py wajib exit 0 (bila path validator ada)

JANGAN mencetak kredensial. Semua keluaran status bersifat machine-readable:
    <content_id>=<STATUS> ...
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from requests.auth import HTTPBasicAuth

# --------------------------------------------------------------------------
# B2 — FUNGSI KANONIS TUNGGAL (impor, JANGAN salin)
# --------------------------------------------------------------------------

FINGERPRINT_DIR = os.environ.get("KALYANAMITRA_FINGERPRINT_DIR", "/var/lib/hermes-ai/provisioning")
if FINGERPRINT_DIR not in sys.path:
    sys.path.insert(0, FINGERPRINT_DIR)
from fingerprint_kalyanamitra import (  # noqa: E402
    VERSION as FINGERPRINT_VERSION,
    fingerprint as fp_teks,
    fingerprint_utas as fp_utas,
    jalur_dari_jadwal as fp_jalur_dari_jadwal,
)

FINGERPRINT_MIN_VERSION = "1.0.1"  # v1.0.0 = fingerprint_utas TIDAK cocok baseline (0/108)


def _tur_versi(v: str) -> tuple:
    return tuple(int(x) for x in str(v).split(".") if x.isdigit())


def cek_versi_kanonis(versi: str, minimal: str = FINGERPRINT_MIN_VERSION) -> list[str]:
    """Gerbang versi fungsi kanonis.

    v1.0.0 memakai pemisah "\\n" antar-post padahal baseline dibangun TANPA
    pemisah -> sidik jari utas tidak pernah cocok (0/108) dan duplikat LOLOS
    diam-diam. Karena itu publisher MENOLAK jalan pada versi < minimal.
    """
    if _tur_versi(versi) >= _tur_versi(minimal):
        return []
    return [f"FUNGSI_KANONIS_TERLALU_LAMA({versi}<{minimal}):sidik_jari_utas_tidak_selaras_baseline"]

# --------------------------------------------------------------------------
# Konstanta
# --------------------------------------------------------------------------

JAKARTA = ZoneInfo("Asia/Jakarta")
DEFAULT_API = "https://api.repliz.com/public"

DEFAULT_ENV_FILE = "/opt/kalyanamitra/.env"
DEFAULT_DB = "/opt/kalyanamitra/data/kalyanamitra.db"
DEFAULT_BASELINE = (
    "/var/lib/hermes-ai/provisioning/baseline-kalyanamitra-des2026.json"
)
DEFAULT_VALIDATOR = "/opt/kalyanamitra/scripts/validate_dharma_json.py"

# Dua akun Kalyanamitra yang sah (dari baseline Des 2026 + tarikan akun Repliz).
# ALLOWLIST: publisher menolak akun apa pun di luar daftar ini.
AKUN_KALYANAMITRA = {
    "threads": "6a8d2c7862caae1e0405397a",
    "instagram": "6a8d2c6762caae1e04053962",
}
# Peta balik accountId -> platform. Dipakai oleh lapis 2 PER PLATFORM (B7).
PLATFORM_PER_AKUN = {v: k for k, v in AKUN_KALYANAMITRA.items()}

# Grid slot default (sama dengan engine UMKM yang terbukti).
DEFAULT_SLOTS = ["15:00", "15:30", "16:00", "16:30", "17:00"]

# Cap jadwal per (akun, hari). Diambil dari distribusi baseline (maks 5/hari).
DEFAULT_MAX_PER_DAY = 5

# Batas jam malam WIB (B6). Setelah jam ini kandidat digeser ke besok.
DEFAULT_CUTOFF_JAM = "20:45"

# Status publikasi yang DIANGGAP sudah "terpegang" -> tidak boleh POST ulang.
STATUS_TERKUNCI = ("SUBMITTING", "RECONCILE", "SCHEDULED", "PUBLISHED")

SUKSES_KODE = frozenset({"POSTED", "SHIFTED_POSTED", "DRY_RUN"})
TOLAK_KODE = frozenset(
    {
        "DUPLIKAT_BASELINE",
        "DUPLIKAT_EKSPLISIT",
        "DUPLIKAT_SLOT",
        "DIKLAIM_LAIN",
        "BUKAN_KANDIDAT",
        "KONTEN_TIDAK_VALID",
        "TARGET_TIDAK_DIDUKUNG",
        "AKUN_TIDAK_VALID",
    }
)
GAGAL_KODE = frozenset({"RECONCILE", "BLOCKED", "ERROR"})


# --------------------------------------------------------------------------
# Utilitas
# --------------------------------------------------------------------------


def load_env(path: Path) -> None:
    """Baca .env tanpa menimpa env yang sudah ada (os.environ.setdefault)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def env_bool(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).strip().lower() == "true"


def redact(text: str) -> str:
    """Buang apa pun yang menyerupai kredensial dari keluaran."""
    import re as _re

    text = _re.sub(
        r"(?i)(access[_-]?key|secret[_-]?key|api[_-]?key|token|password)"
        r"[\"'=:\s]+\S+",
        r"\1=<REDACTED>",
        text,
    )
    for name in ("REPLIZ_ACCESS_KEY", "REPLIZ_SECRET_KEY"):
        value = os.environ.get(name)
        if value:
            text = text.replace(value, "<REDACTED>")
    return text


def parse_slots(raw: str | None) -> list[time]:
    if not raw:
        raw = ",".join(DEFAULT_SLOTS)
    out = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        hh, mm = part.split(":")
        out.append(time(int(hh), int(mm)))
    return sorted(set(out))


def parse_jam(raw: str | None, default: str = DEFAULT_CUTOFF_JAM) -> time:
    raw = (raw or default).strip()
    hh, mm = raw.split(":")
    return time(int(hh), int(mm))


def now_jakarta() -> datetime:
    """Waktu sekarang zona Asia/Jakarta.

    KALYANAMITRA_NOW hanya dihormati bila KALYANAMITRA_UAT_ALLOW_NOW_OVERRIDE=true
    (kait UAT deterministik; di produksi dua env itu tidak dipasang).
    """
    if env_bool("KALYANAMITRA_UAT_ALLOW_NOW_OVERRIDE"):
        override = os.environ.get("KALYANAMITRA_NOW")
        if override:
            dt = datetime.fromisoformat(override.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=JAKARTA)
            return dt.astimezone(JAKARTA)
    return datetime.now(JAKARTA)


def iso_utc(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=JAKARTA)
    return (
        dt.astimezone(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        value = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(value)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def parse_slot_diminta(value: str | None) -> datetime | None:
    """Parsing argumen --slot (berorientasi operator).

    Bila tanpa penanda zona, dianggap WIB (Asia/Jakarta), BUKAN UTC —
    supaya `--slot 2026-12-05T15:30` berarti 15:30 WIB seperti yang dibaca
    operator. Respons API tetap memakai parse_dt (UTC bila tanpa penanda).
    """
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception as exc:
        raise SystemExit(f"SLOT_DIMINTA_TIDAK_VALID:{value}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=JAKARTA)
    return dt


# --------------------------------------------------------------------------
# Konfigurasi
# --------------------------------------------------------------------------


class Config:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        load_env(Path(args.env_file))

        self.api = (args.api_base or os.environ.get("REPLIZ_API_BASE") or DEFAULT_API).rstrip("/")
        self.access_key = os.environ.get("REPLIZ_ACCESS_KEY")
        self.secret_key = os.environ.get("REPLIZ_SECRET_KEY")

        self.target = (args.akun or os.environ.get("REPLIZ_TARGET_AKUN") or "").strip().lower()

        self.db_path = Path(args.db or os.environ.get("KALYANAMITRA_DB") or DEFAULT_DB)
        self.baseline_path = Path(
            args.baseline or os.environ.get("KALYANAMITRA_BASELINE") or DEFAULT_BASELINE
        )
        self.validator_path = Path(
            args.validator or os.environ.get("KALYANAMITRA_VALIDATOR") or DEFAULT_VALIDATOR
        )
        self.slots = parse_slots(os.environ.get("KALYANAMITRA_SLOTS"))
        self.max_per_day = int(
            os.environ.get("KALYANAMITRA_MAX_PER_DAY", str(DEFAULT_MAX_PER_DAY))
        )
        self.lead_minutes = int(os.environ.get("KALYANAMITRA_LEAD_MINUTES", "10"))
        self.window_days = int(os.environ.get("KALYANAMITRA_WINDOW_DAYS", "62"))
        self.cutoff_jam = parse_jam(os.environ.get("KALYANAMITRA_CUTOFF_JAM"))

        self.publish_enabled = env_bool("PUBLISH_ENABLED")
        self.repliz_enabled = env_bool("REPLIZ_ENABLED")
        self.instagram_enabled = env_bool("INSTAGRAM_ENABLED")
        self.duplicate_check = env_bool("DUPLICATE_CHECK_ENABLED")
        self.source_audit_required = env_bool("SOURCE_AUDIT_REQUIRED", "true")
        self.review_required = env_bool("REVIEW_REQUIRED", "true")
        self.engine_mode = (os.environ.get("ENGINE_MODE") or "").strip().lower()

        if self.target == "threads":
            self.account_id = os.environ.get("REPLIZ_KALYANAMITRA_THREADS_ACCOUNT_ID")
            self.username = os.environ.get("REPLIZ_KALYANAMITRA_THREADS_USERNAME")
        elif self.target == "instagram":
            self.account_id = os.environ.get("REPLIZ_KALYANAMITRA_IG_ACCOUNT_ID")
            self.username = os.environ.get("REPLIZ_KALYANAMITRA_IG_USERNAME")
        else:
            self.account_id = None
            self.username = None

    # --- gerbang keras; setiap kegagalan berarti TIDAK ADA POST ----------

    def gate(self) -> list[str]:
        """Kembalikan daftar alasan pemblokiran (kosong = boleh jalan)."""
        problems: list[str] = []
        if not self.access_key or not self.secret_key:
            problems.append("PUBLISHER_CONFIG_INCOMPLETE(REPLIZ_ACCESS_KEY/REPLIZ_SECRET_KEY)")
        if self.target not in AKUN_KALYANAMITRA:
            problems.append(
                "TARGET_AKUN_BELUM_DITENTUKAN(isi REPLIZ_TARGET_AKUN=threads|instagram)"
            )
        else:
            if not self.account_id:
                problems.append("PUBLISHER_CONFIG_INCOMPLETE(account id target)")
            elif self.account_id != AKUN_KALYANAMITRA[self.target]:
                problems.append(
                    f"ACCOUNT_ID_DILUAR_ALLOWLIST_KALYANAMITRA({self.target})"
                )
            if not self.username:
                problems.append("PUBLISHER_CONFIG_INCOMPLETE(username target)")
        if not self.publish_enabled:
            problems.append("SAFETY_STOP:PUBLISH_ENABLED=false")
        if not self.repliz_enabled:
            problems.append("SAFETY_STOP:REPLIZ_ENABLED=false")
        if self.target == "instagram" and not self.instagram_enabled:
            problems.append("SAFETY_STOP:INSTAGRAM_ENABLED=false")
        if not self.duplicate_check:
            problems.append("SAFETY_STOP:DUPLICATE_CHECK_ENABLED=false")
        # Gerbang versi fungsi kanonis: versi < minimal membuat lapis sidik jari
        # utas tidak selaras baseline (duplikat lolos diam-diam).
        problems.extend(cek_versi_kanonis(FINGERPRINT_VERSION))
        return problems

    def gerbang_mode(self) -> str:
        """Keputusan eksplisit yang menentukan POST boleh/tidak."""
        if self.engine_mode == "draft_only":
            return "DRAFT_ONLY"
        if self.engine_mode != "publish":
            return "MODE_TIDAK_DIKENAL"
        return "PUBLISH"


# --------------------------------------------------------------------------
# Klien API Repliz (GET untuk verifikasi; POST hanya di jalur kirim)
# --------------------------------------------------------------------------


def unwrap(data):
    if not isinstance(data, dict):
        return {}
    for key in ("data", "doc", "account", "schedule"):
        value = data.get(key)
        if isinstance(value, dict):
            return value
    return data


def extract_list(data) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("docs", "data", "schedules", "accounts", "items"):
            value = data.get(key)
            if isinstance(value, list):
                return value
    return []


class ReplizClient:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.auth = HTTPBasicAuth(cfg.access_key, cfg.secret_key)
        self.post_count = 0
        self.post_hosts: list[str] = []

    def verify_account(self) -> dict:
        """Verifikasi akun SEBELUM kirim: id + username + platform + isConnected."""
        r = requests.get(
            f"{self.cfg.api}/account/{self.cfg.account_id}",
            auth=self.auth,
            timeout=20,
        )
        r.raise_for_status()
        account = unwrap(r.json())

        actual_id = account.get("id") or account.get("_id")
        username = str(account.get("username", "")).strip().lower()
        platform = str(account.get("type") or account.get("platform") or "").lower()
        connected = account.get("isConnected") is True

        if str(actual_id) != str(self.cfg.account_id):
            raise RuntimeError("WRONG_ACCOUNT_ID")
        if username != str(self.cfg.username).strip().lower():
            raise RuntimeError(f"WRONG_USERNAME:{username}")
        if platform != self.cfg.target:
            raise RuntimeError(f"WRONG_PLATFORM:{platform}")
        if not connected:
            raise RuntimeError("ACCOUNT_NOT_CONNECTED")
        if str(actual_id) not in AKUN_KALYANAMITRA.values():
            raise RuntimeError("ACCOUNT_NOT_KALYANAMITRA")
        return account

    def fetch_schedules(self) -> list:
        """Ambil SEMUA jadwal, TELUSURI SAMPAI totalDocs terpenuhi.

        PENTING (temuan UAT): jangan berhenti hanya karena `hasNextPage` tidak
        ada. Bila satu halaman mengembalikan tepat sebanyak `limit`, halaman
        berikutnya WAJIB diambil — kalau tidak, jadwal terakhir terpotong dan
        lapis-1 (slot terisi) salah hitung -> risiko slot ganda.
        """
        docs: list = []
        page = 1
        limit = 100
        total_docs = None
        while page <= 200:
            r = requests.get(
                f"{self.cfg.api}/schedule",
                params={"page": page, "limit": limit},
                auth=self.auth,
                timeout=30,
            )
            if r.status_code == 400:
                limit = 20
                r = requests.get(
                    f"{self.cfg.api}/schedule",
                    params={"page": page, "limit": limit},
                    auth=self.auth,
                    timeout=30,
                )
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list):
                docs.extend(data)
                break
            batch = extract_list(data)
            docs.extend(batch)
            if total_docs is None and isinstance(data, dict):
                total_docs = data.get("totalDocs")
            penuh = len(batch) >= limit
            lanjut = bool(isinstance(data, dict) and data.get("hasNextPage")) or penuh
            if not lanjut or not batch:
                break
            if isinstance(data, dict) and data.get("nextPage"):
                page = int(data["nextPage"])
            else:
                page += 1
        self.total_docs_api = total_docs
        # Validasi: bila API menyebut totalDocs dan kita kurang -> tandai.
        # TIDAK memblokir, tetapi dilaporkan (dan dipakai lapis 1 sbg peringatan).
        self.truncated = bool(total_docs is not None and len(docs) < int(total_docs))
        return docs

    def get_schedule(self, schedule_id: str) -> dict:
        """GET detail jadwal kandidat fingerprint; tidak pernah mengubah Repliz."""
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", str(schedule_id)):
            raise ValueError("INVALID_SCHEDULE_ID")
        r = requests.get(
            f"{self.cfg.api}/schedule/{schedule_id}",
            auth=self.auth,
            timeout=20,
        )
        r.raise_for_status()
        doc = unwrap(r.json())
        if not isinstance(doc, dict):
            raise ValueError("INVALID_SCHEDULE_DETAIL")
        return doc

    def post_schedule(self, payload: dict):
        url = f"{self.cfg.api}/schedule"
        self.post_count += 1
        self.post_hosts.append(requests.utils.urlparse(url).netloc)
        return requests.post(url, json=payload, auth=self.auth, timeout=30)


# --------------------------------------------------------------------------
# LAPIS 1 — slot waktu (per akun + hari, zona Asia/Jakarta)
# --------------------------------------------------------------------------


def account_of(item: dict):
    value = item.get("accountId")
    if isinstance(value, dict):
        return value.get("id") or value.get("_id")
    if value:
        return value
    account = item.get("account")
    if isinstance(account, dict):
        return account.get("id") or account.get("_id")
    return None


def platform_of(item: dict, account_id=None):
    """Tentukan platform sebuah jadwal.

    URUTAN PRIORITAS (penting): peta accountId allowlist DIDAHULUKAN, lalu
    `account.type` tertanam, baru `type` dokumen. Field `type` pada dokumen
    jadwal Repliz adalah TIPE POST ("text"/"image"/"album"), BUKAN platform —
    dan `account` tertanam bisa ketinggalan (basil salinan) sehingga tidak boleh
    dijadikan sumber pertama.
    """
    acc_id = str(account_id or account_of(item) or "")
    if acc_id in PLATFORM_PER_AKUN:
        return PLATFORM_PER_AKUN[acc_id]
    acc = item.get("account")
    if isinstance(acc, dict):
        t2 = str(acc.get("type") or "").strip().lower()
        if t2 in AKUN_KALYANAMITRA:
            return t2
    t = str(item.get("type") or "").strip().lower()
    if t in AKUN_KALYANAMITRA:
        return t
    return None


def lapis1_okupansi(schedules: list, account_id: str):
    """Kembalikan (menit_terisi, hitung_hari).

    menit_terisi : set[(tanggal_iso, "HH:MM")]  -> 0 tabrakan menit
    hitung_hari  : dict[tanggal_iso] -> jumlah jadwal pada hari itu
    """
    menit: set = set()
    hari: dict = {}
    for item in schedules:
        if str(account_of(item)) != str(account_id):
            continue
        dt = parse_dt(item.get("scheduleAt"))
        if not dt:
            continue
        local = dt.astimezone(JAKARTA)
        day = local.date().isoformat()
        menit.add((day, local.strftime("%H:%M")))
        hari[day] = hari.get(day, 0) + 1
    return menit, hari


class SlotPenuh(Exception):
    pass


def lapis1_pilih_slot(
    menit: set,
    hari: dict,
    slots: list,
    max_per_day: int,
    diminta: datetime | None = None,
    now: datetime | None = None,
    lead_minutes: int = 10,
    window_days: int = 62,
    strict: bool = False,
    cutoff_jam: time = time(20, 45),
):
    """Pilih slot bebas. Kembalikan (datetime, geser: bool, alasan: str).

    Aturan:
      * zona      : semua perhitungan di Asia/Jakarta; `now` selalu
                    dikonversi ke Asia/Jakarta lebih dulu.
      * batas jam : bila `diminta` kosong dan waktu WIB >= cutoff_jam
                    (default 20:45 WIB) -> hari ini dilewati, mulai BESOK (B6).
      * cap hari  : hari dengan hitung_hari >= max_per_day dilewati (-> besok).
      * tabrakan  : (tanggal, HH:MM) yang sudah terisi dilewati
      * lead time : slot harus > now + lead_minutes
      * bila `diminta` diisi dan slotnya sudah terisi:
            strict=True  -> SlotPenuh (DITOLAK)
            strict=False -> digeser ke slot bebas berikutnya
    """
    now = now or now_jakarta()
    if now.tzinfo is None:
        now = now.replace(tzinfo=JAKARTA)
    now = now.astimezone(JAKARTA)
    minimum = now + timedelta(minutes=lead_minutes)

    alasan_dasar = "DIGESER_KE_SLOT_BEBAS"

    if diminta is not None:
        if diminta.tzinfo is None:
            diminta = diminta.replace(tzinfo=JAKARTA)
        diminta = diminta.astimezone(JAKARTA)
        key = (diminta.date().isoformat(), diminta.strftime("%H:%M"))
        hari_penuh = hari.get(diminta.date().isoformat(), 0) >= max_per_day
        if key in menit or hari_penuh:
            if strict:
                raise SlotPenuh(
                    f"SLOT_TERISI:{key[0]}:{key[1]}"
                    + (":HARI_PENUH" if hari_penuh else "")
                )
            start_day = diminta.date()
        else:
            if diminta <= minimum:
                # terlalu dekat; biarkan penggeseran mencari slot berikutnya
                start_day = diminta.date()
            else:
                return diminta, False, "SLOT_DIMINTA_BEBAS"
    else:
        start_day = now.date()
        # B6: batas jam malam -> langsung geser ke besok
        if now.time().replace(tzinfo=None) >= cutoff_jam:
            start_day = start_day + timedelta(days=1)
            alasan_dasar = (
                f"DIGESER_BESOK_SETELAH_BATAS_JAM_"
                f"{cutoff_jam.strftime('%H:%M')}_WIB"
            )

    for offset in range(window_days):
        day = start_day + timedelta(days=offset)
        if hari.get(day.isoformat(), 0) >= max_per_day:
            # hari ini penuh (cap tercapai) -> lanjut besok
            if offset == 0 and alasan_dasar == "DIGESER_KE_SLOT_BEBAS":
                alasan_dasar = "DIGESER_BESOK_HARI_INI_PENUH"
            continue
        for slot in slots:
            candidate = datetime.combine(day, slot, tzinfo=JAKARTA)
            if candidate <= minimum:
                continue
            if (day.isoformat(), slot.strftime("%H:%M")) in menit:
                continue
            alasan = alasan_dasar
            if day != start_day and alasan == "DIGESER_KE_SLOT_BEBAS":
                alasan = "DIGESER_BESOK_SLOT_PENUH"
            return candidate, True, alasan

    raise SlotPenuh(f"NO_FREE_SLOT_{window_days}_DAYS")


# --------------------------------------------------------------------------
# LAPIS 2 — sidik jari teks, PER PLATFORM (B7)
# --------------------------------------------------------------------------


def sidik_jari_utas_dari_jadwal(doc: dict) -> str:
    """Sidik jari utas sebuah jadwal Repliz (description + replies)."""
    return fp_utas(fp_jalur_dari_jadwal(doc))


def sumber_eksplisit(doc: dict):
    """Ambil penautan eksplisit `source_content_id` dari jadwal/draf, bila ada."""
    for holder in (doc, doc.get("meta") if isinstance(doc.get("meta"), dict) else {}):
        if not isinstance(holder, dict):
            continue
        for key in ("source_content_id", "sourceContentId", "source_content_ids"):
            value = holder.get(key)
            if isinstance(value, list):
                value = value[0] if value else None
            if value:
                return str(value)
    return None


def lapis2_bangun_pustaka(schedules: list, baseline_path: Path) -> dict:
    """Indeks fingerprint tetap kanonis, tetapi simpan semua referensi bentrok.

    Teks lengkap jadwal LIVE disimpan hanya di memori (tidak dicetak/disalin ke DB).
    Baseline 108 jadwal tidak memiliki teks; GET detail dipakai saat perlu.
    """
    pustaka = {"desc": {}, "utas": {}, "sumber": {}, "meta": {}}

    def _reg(bucket, platform, key, ref):
        if not platform or not key:
            return
        items = bucket.setdefault(platform, {})
        if bucket is pustaka["utas"]:
            refs = items.setdefault(key, [])
            for older in refs:
                if older.get("_id") == ref.get("_id"):
                    if ref.get("_teks") is not None:
                        older["_teks"] = ref["_teks"]
                    return
            refs.append(ref)
        else:
            items.setdefault(key, ref)

    live_platforms = set()
    for doc in schedules:
        platform = platform_of(doc)
        if platform not in AKUN_KALYANAMITRA:
            continue
        sid = sumber_eksplisit(doc)
        ref = {"_id": doc.get("_id") or doc.get("id"),
               "scheduleAt": doc.get("scheduleAt"), "sumber": "live"}
        if sid:
            pustaka["sumber"].setdefault(sid, ref)
        posts = fp_jalur_dari_jadwal(doc)
        if not "".join(posts).strip():
            continue
        # Detail list yang tidak lengkap jangan diperlakukan sebagai teks penuh.
        if isinstance(doc.get("description"), str) and isinstance(doc.get("replies"), list):
            if all(isinstance(r, dict) and isinstance(r.get("description"), str)
                   for r in doc["replies"]):
                ref["_teks"] = posts
        live_platforms.add(platform)
        _reg(pustaka["utas"], platform, sidik_jari_utas_dari_jadwal(doc), ref)

    n_base = 0
    legacy = 0
    if baseline_path and Path(baseline_path).exists():
        data = json.loads(Path(baseline_path).read_text(encoding="utf-8"))
        jadwal = data.get("jadwal", data) if isinstance(data, dict) else data
        for item in jadwal:
            platform = platform_of(item)
            if platform not in AKUN_KALYANAMITRA:
                continue
            ref = {"_id": item.get("_id"), "scheduleAt": item.get("scheduleAt"),
                   "sumber": "baseline"}
            _reg(pustaka["utas"], platform, item.get("fingerprint_kanonis_utas"), ref)
            fp_desc = item.get("fingerprint_kanonis")
            if not fp_desc and item.get("fingerprint_teks"):
                fp_desc = item["fingerprint_teks"]
                legacy += 1
            _reg(pustaka["desc"], platform, fp_desc, ref)
            sid = sumber_eksplisit(item)
            if sid:
                pustaka["sumber"].setdefault(sid, ref)
            n_base += 1

    pustaka["meta"] = {
        "n_baseline": n_base,
        "n_baseline_legacy_fingerprint_teks": legacy,
        "n_live": len(schedules),
        "platform_live": sorted(live_platforms),
        "platform_desc": sorted(pustaka["desc"]),
        "platform_utas": sorted(pustaka["utas"]),
        "n_sumber_eksplisit": len(pustaka["sumber"]),
        "versi_fungsi_kanonis": FINGERPRINT_VERSION,
    }
    return pustaka


def lapis2_putuskan(pustaka: dict, platform: str, fp_desc: str, fp_uta: str,
                     source_id, texts: list[str] | None = None, detail_fetcher=None):
    """Fingerprint hanya memilih kandidat. Duplikat wajib teks asli IDENTIK.

    Bila GET detail gagal atau tidak lengkap, tahan pengiriman agar tidak
    terjadi duplikasi yang tidak bisa diverifikasi. Tidak mencetak teks.
    Aturan source_content_id eksplisit dan pemisahan platform dipertahankan.
    """
    if source_id:
        source_hit = pustaka["sumber"].get(str(source_id))
        if source_hit:
            return (
                "DUPLIKAT_EKSPLISIT",
                f"SOURCE_CONTENT_ID_{source_id}_SUDAH_DIPAKAI:{source_hit.get('_id')}"
                " (penautan=eksplisit, berlaku lintas platform)",
            )

    hits = (pustaka["utas"].get(platform) or {}).get(fp_uta, [])
    if not hits:
        return None
    if texts is None or not isinstance(texts, list):
        return "BLOCKED_VERIFY_DUPLIKAT", "TEKS_KANDIDAT_TIDAK_TERSEDIA"
    unresolved = False
    for ref in hits:
        existing = ref.get("_teks")
        if existing is None:
            if detail_fetcher is None or not ref.get("_id"):
                unresolved = True
                continue
            try:
                doc = detail_fetcher(str(ref["_id"]))
                if (str(doc.get("_id") or doc.get("id")) != str(ref["_id"])
                    or str(account_of(doc)) != AKUN_KALYANAMITRA[platform]
                    or parse_dt(doc.get("scheduleAt")) != parse_dt(ref.get("scheduleAt"))
                    or not isinstance(doc.get("description"), str)
                    or not isinstance(doc.get("replies"), list)
                    or not all(isinstance(r, dict) and isinstance(r.get("description"), str)
                               for r in doc["replies"])):
                    unresolved = True
                    continue
                existing = fp_jalur_dari_jadwal(doc)
            except (ValueError, KeyError, TypeError, requests.RequestException):
                unresolved = True
                continue
        if (not isinstance(existing, list) or len(existing) != len(texts)
            or not all(isinstance(t, str) and t.strip() for t in existing)
            or fp_utas(existing) != fp_uta):
            unresolved = True
            continue
        if existing == texts:
            return "DUPLIKAT_BASELINE", (
                f"UTAS_IDENTIK_PERSIS_PLATFORM_{platform}:{ref.get('_id')}"
                f"@{ref.get('scheduleAt')} sumber={ref.get('sumber')}"
            )
    if unresolved:
        return "BLOCKED_VERIFY_DUPLIKAT", "FINGERPRINT_SAMA_DETAIL_TIDAK_LENGKAP_ATAU_GET_GAGAL"
    return None


# --------------------------------------------------------------------------
# LAPIS 3 — kunci idempotensi DB
# --------------------------------------------------------------------------


def lapis3_klaim(con: sqlite3.Connection, content_id: str, scheduled_at: str) -> bool:
    """Klaim atomik. True = boleh POST; False = sudah diklaim pihak lain."""
    cur = con.execute(
        """
        UPDATE content_queue
        SET publish_status='SUBMITTING',
            scheduled_at=?,
            publish_attempts=COALESCE(publish_attempts,0)+1,
            publish_error=NULL
        WHERE content_id=?
          AND repliz_schedule_id IS NULL
          AND (publish_status IS NULL
               OR publish_status NOT IN ('SUBMITTING','RECONCILE','SCHEDULED','PUBLISHED'))
        """,
        (scheduled_at, content_id),
    )
    con.commit()
    return cur.rowcount == 1


# --------------------------------------------------------------------------
# Konten & payload
# --------------------------------------------------------------------------


def baca_konten(row, cfg: Config):
    path = Path(row["output_path"]) if row["output_path"] else None
    if not path or not path.exists():
        raise ValueError("DRAFT_FILE_NOT_FOUND")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("content_id") != row["content_id"]:
        raise ValueError("CONTENT_ID_MISMATCH")

    review = data.get("review") or {}
    if cfg.review_required and review.get("status") != "APPROVED":
        raise ValueError("CONTENT_NOT_APPROVED")
    if cfg.source_audit_required and review.get("source_verified") is not True:
        raise ValueError("APPROVED_WITHOUT_SOURCE_VERIFICATION")

    thread = data.get("thread")
    if not isinstance(thread, list):
        raise ValueError("THREAD_NOT_LIST")
    if not 6 <= len(thread) <= 8:
        raise ValueError(f"THREAD_COUNT_INVALID:{len(thread)}")

    thread = sorted(thread, key=lambda x: int(x.get("post", 0)))
    texts = []
    for item in thread:
        # Pertahankan spasi asli: dibutuhkan untuk pembanding duplikat persis.
        value = str(item.get("text", ""))
        if not value.strip():
            raise ValueError("EMPTY_POST")
        if len(value.encode("utf-8")) > 500:
            raise ValueError(f"POST_TOO_LONG_UTF8:{item.get('post')}")
        texts.append(value)
    return data, texts


def medias_dari_draf(data: dict) -> list:
    raw = data.get("medias") or data.get("media") or []
    out = []
    for item in raw:
        if isinstance(item, str):
            out.append({"type": "image", "url": item, "thumbnail": item, "alt": ""})
        elif isinstance(item, dict) and item.get("url"):
            out.append({
                "type": item.get("type") or "image",
                "url": item["url"],
                "thumbnail": item.get("thumbnail") or item["url"],
                "alt": item.get("alt") or "",
            })
    return out


def jalankan_validator(path: Path, draft_path: Path):
    """Gerbang QA nyata. Kembalikan (ok: bool, keluaran: str)."""
    if not path.exists():
        return True, "VALIDATOR_NOT_FOUND_SKIPPED"
    proc = subprocess.run(
        [sys.executable, str(path), str(draft_path)],
        capture_output=True,
        text=True,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode == 0, out.strip()


def bangun_payload(cfg: Config, data: dict, texts: list, account_id: str) -> dict:
    if cfg.target == "threads":
        return {
            "title": "",
            "description": texts[0],
            "type": "text",
            "medias": [],
            "meta": {"title": "", "description": "", "url": ""},
            "additionalInfo": {
                "isAiGenerated": False,
                "isDraft": False,
                "isAutoAddMusic": False,
                "isShareToFeed": False,
                "collaborators": [],
                "music": {
                    "id": "",
                    "artist": "",
                    "name": "",
                    "thumbnail": "",
                    "volume": {"video": 50, "music": 100},
                },
                "products": [],
                "tags": [],
                "mentions": [],
                "link": "",
                "targetCountries": [],
            },
            "replies": [
                {"type": "text", "description": t, "topic": "", "medias": []}
                for t in texts[1:]
            ],
            "topic": "",
            "accountId": account_id,
        }
    if cfg.target == "instagram":
        # Carousel IG = turunan lintas platform. WAJIB punya media.
        #
        # CATATAN KEJUJURAN (B10): bentuk payload album di bawah BELUM
        # diverifikasi terhadap api.repliz.com — jalur media/carousel IG belum
        # ada (tidak ada pengunggahan media, tidak ada verifikasi bentuk album).
        # Yang dibuktikan di sini hanyalah bahwa lapis sidik jari TIDAK
        # memblokir turunan lintas platform (B7). Publikasi IG nyata tetap
        # menunggu B10.
        medias = medias_dari_draf(data)
        if not medias:
            raise ValueError(
                "IG_BUTUH_MEDIA_(carousel)_-payload_album_belum_diverifikasi_B10"
            )
        return {
            "title": "",
            "description": texts[0],
            "type": "album",
            "medias": medias,
            "meta": {"title": "", "description": "", "url": ""},
            "additionalInfo": {"isAiGenerated": False, "isDraft": False},
            "topic": "",
            "accountId": account_id,
        }
    raise ValueError(f"TARGET_TIDAK_DIDUKUNG:{cfg.target}")


# --------------------------------------------------------------------------
# Kandidat
# --------------------------------------------------------------------------


def ambil_kandidat(con: sqlite3.Connection, cfg: Config, max_jobs: int, content_id: str | None):
    sql = """
        SELECT *
        FROM content_queue
        WHERE status='READY'
          AND review_status='APPROVED'
          AND repliz_schedule_id IS NULL
          AND (publish_status IS NULL OR publish_status='NOT_SUBMITTED')
    """
    params: list = []
    if content_id:
        sql += " AND content_id=?"
        params.append(content_id)
    sql += " ORDER BY priority ASC, id ASC LIMIT ?"
    params.append(max_jobs)
    return con.execute(sql, params).fetchall()


# --------------------------------------------------------------------------
# Inti
# --------------------------------------------------------------------------


def catat(con, content_id, publish_status, error=None, schedule_id=None, scheduled_at=None):
    sets = ["publish_status=?"]
    vals: list = [publish_status]
    if schedule_id is not None:
        sets.append("repliz_schedule_id=?")
        vals.append(str(schedule_id))
    if scheduled_at is not None:
        sets.append("scheduled_at=?")
        vals.append(scheduled_at)
    sets.append("publish_error=?")
    vals.append(error)
    vals.append(content_id)
    con.execute(f"UPDATE content_queue SET {', '.join(sets)} WHERE content_id=?", vals)
    con.commit()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Publisher Kalyanamitra (anti-duplikasi 3 lapis)")
    ap.add_argument("--akun", choices=["threads", "instagram"])
    ap.add_argument("--db")
    ap.add_argument("--baseline")
    ap.add_argument("--env-file", default=DEFAULT_ENV_FILE)
    ap.add_argument("--validator")
    ap.add_argument("--api-base")
    ap.add_argument("--max-jobs", type=int, default=1)
    ap.add_argument("--content-id")
    ap.add_argument("--slot", help="slot yang diminta (ISO, mis. 2026-12-05T15:30)")
    ap.add_argument("--strict-slot", action="store_true", help="tolak bila slot terisi")
    ap.add_argument("--dry-run", action="store_true", help="tidak ada POST")
    ap.add_argument("--lewati-gerbang", action="store_true", help="HANYA untuk UAT sandbox")
    args = ap.parse_args(argv)

    cfg = Config(args)

    print(
        f"FUNGSI_KANONIS v{FINGERPRINT_VERSION} dir={FINGERPRINT_DIR}"
        f" cutoff_jam={cfg.cutoff_jam.strftime('%H:%M')}WIB"
    )

    problems = cfg.gate()
    if problems and not args.lewati_gerbang:
        for p in problems:
            print(f"BLOCKED {p}", file=sys.stderr)
        return 3

    mode = cfg.gerbang_mode()
    dry_run = (
        args.dry_run
        or mode != "PUBLISH"          # draft_only / mode tak dikenal -> TIDAK POST
        or cfg.engine_mode != "publish"
        or args.lewati_gerbang
    )

    client = ReplizClient(cfg)

    # ---- (1) verifikasi akun SEBELUM apa pun ----
    try:
        account = client.verify_account()
    except Exception as exc:
        print(f"AKUN_TIDAK_VALID {redact(str(exc))}", file=sys.stderr)
        return 4
    print(
        "ACCOUNT_OK="
        f"{account.get('username')} {account.get('type') or account.get('platform')}"
        f" connected={account.get('isConnected')}"
    )

    # ---- (2a) lapis 1: okupansi ----
    schedules = client.fetch_schedules()
    menit, hari = lapis1_okupansi(schedules, cfg.account_id)
    trunc = "TERPOTONG" if getattr(client, "truncated", False) else "LENGKAP"
    print(
        f"OKUPANSI akun={cfg.target} hari={len(hari)} slot_terisi={len(menit)}"
        f" cap_per_hari={cfg.max_per_day}"
        f" totalDocs_api={getattr(client, 'total_docs_api', None)}"
        f" terkumpul={len(schedules)} paginasi={trunc}"
    )

    # ---- (2b) lapis 2: pustaka sidik jari PER PLATFORM ----
    pustaka = lapis2_bangun_pustaka(schedules, cfg.baseline_path)
    m = pustaka["meta"]
    print(
        f"BASELINE_SIDIK_JARI utas={sum(len(v) for v in pustaka['utas'].values())}"
        f" (audit_desc={sum(len(v) for v in pustaka['desc'].values())})"
        f" platform={m['platform_utas']} n_baseline={m['n_baseline']}"
        f" n_sumber_eksplisit={m['n_sumber_eksplisit']}"
    )

    # ---- kandidat ----
    con = sqlite3.connect(cfg.db_path)
    con.row_factory = sqlite3.Row
    rows = ambil_kandidat(con, cfg, args.max_jobs, args.content_id)
    if not rows:
        print("PUBLISH_QUEUE_EMPTY")
        con.close()
        return 0

    diminta = None
    if args.slot:
        diminta = parse_slot_diminta(args.slot)

    for row in rows:
        content_id = row["content_id"]
        try:
            data, texts = baca_konten(row, cfg)
        except Exception as exc:
            catat(con, content_id, "NEEDS_REVISION", f"KONTEN_TIDAK_VALID:{exc}")
            print(f"{content_id}=KONTEN_TIDAK_VALID {exc}")
            continue

        ok, out = jalankan_validator(cfg.validator_path, Path(row["output_path"]))
        if not ok:
            catat(con, content_id, "NEEDS_REVISION", f"VALIDATOR_GAGAL:{out[:400]}")
            print(f"{content_id}=KONTEN_TIDAK_VALID VALIDATOR_GAGAL")
            continue

        # ---- LAPIS 2 : sidik jari PER PLATFORM + penautan eksplisit ----
        fp_desc = fp_teks(texts[0])
        fp_uta = fp_utas(texts)
        source_id = sumber_eksplisit(data)
        putusan = lapis2_putuskan(pustaka, cfg.target, fp_desc, fp_uta, source_id,
                                  texts=texts, detail_fetcher=client.get_schedule)
        print(
            f"LAPIS2 {content_id} platform={cfg.target} fp_desc={fp_desc}"
            f" fp_utas={fp_uta} source_content_id={source_id or '-'}"
        )
        if putusan:
            kode, alasan = putusan
            catat(con, content_id, kode, alasan)
            print(f"{content_id}={kode} {alasan}")
            continue

        # ---- LAPIS 1 ----
        try:
            slot, geser, alasan_slot = lapis1_pilih_slot(
                menit,
                hari,
                cfg.slots,
                cfg.max_per_day,
                diminta=diminta,
                lead_minutes=cfg.lead_minutes,
                window_days=cfg.window_days,
                strict=args.strict_slot,
                cutoff_jam=cfg.cutoff_jam,
            )
        except SlotPenuh as exc:
            catat(con, content_id, "DUPLIKAT_SLOT", str(exc))
            print(f"{content_id}=DUPLIKAT_SLOT {exc}")
            continue

        scheduled_at = iso_utc(slot)
        try:
            payload = bangun_payload(cfg, data, texts, cfg.account_id)
        except Exception as exc:
            catat(con, content_id, "BLOCKED", f"PAYLOAD:{exc}")
            print(f"{content_id}=TARGET_TIDAK_DIDUKUNG {exc}")
            continue
        payload["scheduleAt"] = scheduled_at

        if dry_run:
            print(
                f"{content_id}=DRY_RUN mode={mode} slot_diminta={args.slot or '-'}"
                f" slot_dipilih={slot.strftime('%Y-%m-%d %H:%M')}WIB"
                f" ({scheduled_at} UTC) geser={geser} alasan={alasan_slot}"
                f" fp_desc={fp_desc} fp_utas={fp_uta}"
            )
            continue

        # ---- LAPIS 3 ----
        if not lapis3_klaim(con, content_id, scheduled_at):
            print(f"{content_id}=DIKLAIM_LAIN 0-POST")
            continue

        try:
            response = client.post_schedule(payload)
        except requests.RequestException as exc:
            # JANGAN retry POST otomatis. Status tak diketahui -> RECONCILE.
            catat(con, content_id, "RECONCILE", f"UNKNOWN_SUBMISSION_STATE:{exc}")
            print(f"{content_id}=RECONCILE UNKNOWN_SUBMISSION_STATE (tanpa retry)")
            continue

        try:
            body = response.json()
        except Exception:
            body = {"raw": response.text[:500]}

        if 200 <= response.status_code < 300:
            obj = unwrap(body)
            sid = obj.get("id") or obj.get("_id") or obj.get("scheduleId")
            if isinstance(body, dict) and not sid:
                sid = body.get("id") or body.get("_id") or body.get("scheduleId")
            if not sid:
                catat(con, content_id, "RECONCILE",
                      "SUCCESS_RESPONSE_WITHOUT_SCHEDULE_ID")
                print(f"{content_id}=RECONCILE SUCCESS_TANPA_ID")
                continue
            catat(con, content_id, "SCHEDULED", None,
                  schedule_id=sid, scheduled_at=scheduled_at)
            menit.add((slot.date().isoformat(), slot.strftime("%H:%M")))
            hari[slot.date().isoformat()] = hari.get(slot.date().isoformat(), 0) + 1
            postfix = "SHIFTED_POSTED" if geser and args.slot else "POSTED"
            print(
                f"{content_id}={postfix} {slot.strftime('%Y-%m-%d %H:%M')}WIB"
                f" ({scheduled_at} UTC) id={sid} geser={geser} alasan={alasan_slot}"
            )
        else:
            if response.status_code in (400, 401, 403, 404, 409):
                catat(con, content_id, "BLOCKED",
                      f"HTTP {response.status_code}: {json.dumps(body, ensure_ascii=False)[:500]}")
                print(f"{content_id}=BLOCKED HTTP={response.status_code}")
            else:
                # 5xx SETELAH POST: state tak diketahui -> RECONCILE, tanpa retry.
                catat(con, content_id, "RECONCILE",
                      f"HTTP {response.status_code}: {json.dumps(body, ensure_ascii=False)[:500]}")
                print(f"{content_id}=RECONCILE HTTP={response.status_code} (tanpa retry)")

    con.close()
    print(f"POST_HTTP_DIKIRIM={client.post_count} host={sorted(set(client.post_hosts))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
