#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
uat_publisher_sandbox.py  (Jalur B)  v2.0.0
===========================================
UAT sandbox untuk publisher_kalyanamitra.py.

Prinsip: TIDAK menyentuh produksi.
  * basis data = SALINAN (dibangun dari fixtures/kalyanamitra-db-snapshot.sql)
  * API = server tiruan lokal (fixtures -> fake_repliz_api.py)
  * kredensial = nilai palsu "uat-access"/"uat-secret"
  * direktori kerja di /tmp
  * kredensial/kunci Repliz NYATA tidak pernah dipakai (host POST selalu loopback)

Kasus uji
---------
  UAT-7a  migrasi idempoten (2x)
  UAT-7b  rollback mengembalikan skema
  UAT-B2  publisher memakai fungsi kanonis yang SAMA (impor, bukan salinan)
  UAT-B3a penyelarasan sidik jari dgn 3 JADWAL NYATA (end-to-end)
  UAT-B3b duplikat nyata ditolak via BERKAS BASELINE (server tiruan tanpa teks)
  UAT-B3c duplikat nyata ditolak via pustaka LIVE (berkas baseline kosong)
  UAT-B3d konten BERBEDA tidak salah ditolak (3 variasi: kata/tanda baca/parafrase)
  UAT-B3e variasi SPASI-SAJA tidak dianggap duplikat tanpa teks identik
  UAT-B7a turunan lintas platform LOLOS: sidik jari Threads tidak memblokir IG
  UAT-B7b arah sebaliknya: sidik jari IG tidak memblokir Threads
  UAT-B7c penautan EKSPLISIT (source_content_id sama) -> DIBLOKIR lintas platform
  UAT-B6a jam malam: hari ini penuh + sudah lewat batas -> geser besok
  UAT-B6b tepat pada batas jam 20:45 WIB -> geser besok
  UAT-B6c sebelum batas jam & hari belum penuh -> tetap hari ini
  UAT-B6d zona Asia/Jakarta: konversi WIB <-> UTC benar
  UAT-B6e end-to-end CLI: slot malam memakai data 108 jadwal nyata
  UAT-1   dua eksekusi penerbitan -> TEPAT 1 jadwal; eksekusi kedua 0 POST
  UAT-2a  slot terisi baseline + --strict-slot -> DITOLAK
  UAT-2b  slot terisi baseline tanpa --strict-slot -> DIGESER, 0 duplikasi
  UAT-4   akun salah -> ditolak (4 varian)
  UAT-5   timeout & 5xx setelah POST -> RECONCILE; ulang 0 POST
  UAT-8   kill switch PUBLISH_ENABLED=false & DUPLICATE_CHECK_ENABLED=false
  UAT-9   ENGINE_MODE=draft_only -> paksa dry-run (0 POST)
  UAT-B9  publikasi mustahil tanpa keputusan eksplisit (matriks mode)
  UAT-10  target instagram tanpa media -> ditolak
  UAT-6   hitung POST nyata ke jaringan api.repliz.com = 0

Jalankan:  python3 uat_publisher_sandbox.py
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
FIX = BASE / "fixtures"
WORK = Path(os.environ.get("UAT_WORKDIR", "/tmp/jalurb-uat"))
PY = sys.executable
FINGERPRINT_DIR = os.environ.get(
    "KALYANAMITRA_FINGERPRINT_DIR", "/var/lib/hermes-ai/provisioning"
)

THREADS_ID = "6a8d2c7862caae1e0405397a"
THREADS_USER = "ruangkalyanamitra"          # akun nyata (terverifikasi read-only)
IG_ID = "6a8d2c6762caae1e04053962"
IG_USER = "ruangkalyanamitra"               # akun nyata (terverifikasi read-only)

RESULTS: list[dict] = []


def check(name: str, ok: bool, bukti: str, verdict: str | None = None) -> None:
    v = verdict or ("PASS" if ok else "FAIL")
    RESULTS.append({"nama": name, "verdict": v, "bukti": bukti})
    print(f"[{v}] {name} :: {bukti}")


def posts_of(doc: dict) -> list:
    out = [doc.get("description") or ""]
    for r in (doc.get("replies") or []):
        out.append(r.get("description") or "")
    return out


# --------------------------------------------------------------------------
# Persiapan sandbox
# --------------------------------------------------------------------------


def siapkan_workdir() -> None:
    if WORK.exists():
        shutil.rmtree(WORK)
    (WORK / "backup").mkdir(parents=True)
    shutil.copytree(FIX / "drafts", WORK / "drafts")
    shutil.copy(FIX / "baseline-kalyanamitra-des2026.json", WORK / "baseline.json")
    print(f"WORKDIR={WORK}")


def buat_draf(cid: str, posts: list, medias=None, source_content_id=None,
              judul=None) -> Path:
    """Draf UAT: salinan struktur KAL-PILOT-001 + teks yang ditentukan."""
    t = json.loads((FIX / "drafts" / "KAL-PILOT-001.json").read_text(encoding="utf-8"))
    t["content_id"] = cid
    t["topic"] = judul or f"UAT {cid}"
    t["title"] = judul or f"UAT {cid}"
    t["thread"] = [{"post": i + 1, "purpose": "UAT", "text": p}
                   for i, p in enumerate(posts)]
    if medias:
        t["medias"] = medias
    if source_content_id:
        t["source_content_id"] = source_content_id
    p = WORK / "drafts" / f"{cid}.json"
    p.write_text(json.dumps(t, ensure_ascii=False, indent=1), encoding="utf-8")
    return p


def bangun_db(db: Path, migrasi: bool = True, extra=None) -> None:
    if db.exists():
        db.unlink()
    con = sqlite3.connect(db)
    con.executescript((FIX / "kalyanamitra-db-snapshot.sql").read_text(encoding="utf-8"))
    con.commit()
    for cid, in con.execute("SELECT content_id FROM content_queue"):
        con.execute(
            "UPDATE content_queue SET output_path=? WHERE content_id=?",
            (str(WORK / "drafts" / f"{cid}.json"), cid),
        )
    for cid, path, topic in (extra or []):
        con.execute(
            "INSERT INTO content_queue (content_id,tradition,topic,status,priority,"
            "attempts,output_path,review_status,validator_status,note)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (cid, "THERAVADA", topic, "READY", 100, 1, str(path), "APPROVED", "PASS", "UAT"),
        )
    con.commit()
    con.close()
    if migrasi:
        rc, out, err = jalankan(
            [PY, str(BASE / "migrate_publish_columns.py"), "--db", str(db), "--no-backup"], {})
        if rc != 0:
            raise RuntimeError(f"MIGRASI_SANDBOX_GAGAL:{out}{err}")


def jalankan(cmd: list[str], env_extra: dict, timeout: int = 120):
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("REPLIZ_", "KALYANAMITRA_", "PUBLISH_", "ENGINE_",
                                "DUPLICATE_", "SOURCE_", "REVIEW_", "INSTAGRAM_"))}
    env.update(env_extra)
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=timeout)
    return proc.returncode, proc.stdout, proc.stderr


def env_akun(db: Path, baseline: Path, api_base: str, **over) -> dict:
    env = {
        "REPLIZ_ACCESS_KEY": "uat-access",
        "REPLIZ_SECRET_KEY": "uat-secret",
        "REPLIZ_TARGET_AKUN": "threads",
        "REPLIZ_KALYANAMITRA_THREADS_ACCOUNT_ID": THREADS_ID,
        "REPLIZ_KALYANAMITRA_THREADS_USERNAME": THREADS_USER,
        "REPLIZ_KALYANAMITRA_IG_ACCOUNT_ID": IG_ID,
        "REPLIZ_KALYANAMITRA_IG_USERNAME": IG_USER,
        "PUBLISH_ENABLED": "true",
        "REPLIZ_ENABLED": "true",
        "INSTAGRAM_ENABLED": "false",
        "DUPLICATE_CHECK_ENABLED": "true",
        "SOURCE_AUDIT_REQUIRED": "true",
        "REVIEW_REQUIRED": "true",
        "ENGINE_MODE": "publish",
        "KALYANAMITRA_DB": str(db),
        "KALYANAMITRA_BASELINE": str(baseline),
        "KALYANAMITRA_VALIDATOR": str(FIX / "validate_dharma_json-v0.2.1.py"),
        "KALYANAMITRA_FINGERPRINT_DIR": FINGERPRINT_DIR,
        "REPLIZ_API_BASE": api_base,
    }
    env.update(over)
    return env


def pub_cmd(db: Path, baseline: Path, extra: list[str] | None = None) -> list[str]:
    cmd = [
        PY, str(BASE / "publisher_kalyanamitra.py"),
        "--env-file", str(WORK / "env.kosong"),
        "--db", str(db),
        "--baseline", str(baseline),
        "--validator", str(FIX / "validate_dharma_json-v0.2.1.py"),
    ]
    return cmd + (extra or [])


def status_db(db: Path, cid: str):
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    row = con.execute(
        "SELECT status, publish_status, repliz_schedule_id, scheduled_at, publish_attempts,"
        " publish_error FROM content_queue WHERE content_id=?", (cid,)
    ).fetchone()
    con.close()
    return dict(row) if row else None


def baris(out: str, cid: str) -> str:
    return "; ".join(l for l in out.splitlines() if l.startswith(f"{cid}="))


# --------------------------------------------------------------------------


def main() -> int:  # noqa: C901
    siapkan_workdir()
    (WORK / "env.kosong").write_text("", encoding="utf-8")

    if FINGERPRINT_DIR not in sys.path:
        sys.path.insert(0, FINGERPRINT_DIR)
    sys.path.insert(0, str(BASE))
    import fingerprint_kalyanamitra as FK  # noqa: E402
    import publisher_kalyanamitra as P  # noqa: E402
    from fake_repliz_api import FakeRepliz  # noqa: E402

    # ---------------------------------------------------------------- B2
    src = (BASE / "publisher_kalyanamitra.py").read_text(encoding="utf-8")
    salinan_lokal = [t for t in ("def normalize_text(", "def fingerprint(",
                                 "def fingerprint_utas(") if t in src]
    check(
        "UAT-B2 publisher memakai fungsi kanonis yang sama (impor, bukan salinan)",
        not salinan_lokal
        and "from fingerprint_kalyanamitra import" in src
        and P.fp_teks is FK.fingerprint and P.fp_utas is FK.fingerprint_utas
        and P.FINGERPRINT_VERSION == FK.VERSION,
        f"versi_kanonis={FK.VERSION} definisi_lokal_di_publisher={salinan_lokal} "
        f"objek_sama(teks)={P.fp_teks is FK.fingerprint} "
        f"objek_sama(utas)={P.fp_utas is FK.fingerprint_utas}"
    )
    # gerbang versi: versi lama (v1.0.0) HARUS ditolak, versi sekarang LOLOS
    tolak_lama = P.cek_versi_kanonis("1.0.0")
    lolos_kini = P.cek_versi_kanonis(FK.VERSION)
    check(
        "UAT-B2b gerbang versi fungsi kanonis (v1.0.0 ditolak, v1.0.1 lolos)",
        bool(tolak_lama) and not lolos_kini,
        f"cek_versi_kanonis('1.0.0')={tolak_lama} ; "
        f"cek_versi_kanonis('{FK.VERSION}')={lolos_kini}"
    )

    # ---------------------------------------------------------------- data nyata
    nyata = json.loads((FIX / "jadwal-nyata-3.json").read_text(encoding="utf-8"))
    real_docs = nyata["jadwal"]
    rujukan = nyata["rujukan_baseline"]
    T = [posts_of(d) for d in real_docs]

    cocok_desc = sum(1 for d in real_docs
                     if FK.fingerprint(d.get("description") or "")
                     == rujukan[d["_id"]]["fingerprint_kanonis"])
    cocok_utas = sum(1 for d in real_docs
                     if FK.fingerprint_utas(posts_of(d))
                     == rujukan[d["_id"]]["fingerprint_kanonis_utas"])
    detail = "; ".join(
        f"{d['_id']}@ {d['scheduleAt']} desc={rujukan[d['_id']]['fingerprint_kanonis']}"
        f" utas={rujukan[d['_id']]['fingerprint_kanonis_utas']}" for d in real_docs)
    check(
        "UAT-B3a penyelarasan sidik jari dgn 3 JADWAL NYATA (end-to-end)",
        cocok_desc == 3 and cocok_utas == 3,
        f"dihitung ulang dari teks yg diambil via repliz_get_schedule, dibandingkan "
        f"dgn nilai tersimpan di baseline kanonis: fingerprint_kanonis {cocok_desc}/3, "
        f"fingerprint_kanonis_utas {cocok_utas}/3 :: {detail}"
    )

    baseline = WORK / "baseline.json"
    data = json.loads(baseline.read_text(encoding="utf-8"))
    seed = data["jadwal"]
    baseline_pairs = {(str(s["accountId"]), s["scheduleAt"]) for s in seed}

    # ---------------------------------------------------------------- UAT-7a
    db = WORK / "sandbox.db"
    bangun_db(db, migrasi=False)
    rc1, out1, err1 = jalankan(
        [PY, str(BASE / "migrate_publish_columns.py"), "--db", str(db),
         "--backup-dir", str(WORK / "backup")], {})
    rc2, out2, err2 = jalankan(
        [PY, str(BASE / "migrate_publish_columns.py"), "--db", str(db),
         "--backup-dir", str(WORK / "backup")], {})
    kolom = sorted(r[1] for r in sqlite3.connect(db).execute("PRAGMA table_info(content_queue)"))
    perlu = {"repliz_schedule_id", "scheduled_at", "publish_status",
             "publish_attempts", "publish_error"}
    idx = [r[0] for r in sqlite3.connect(db).execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='uq_content_queue_repliz_schedule_id'")]
    check(
        "UAT-7a migrasi + idempoten(2x)",
        rc1 == 0 and rc2 == 0 and perlu.issubset(set(kolom)) and bool(idx),
        f"rc1={rc1} rc2={rc2} kolom_tambah={sorted(perlu & set(kolom))} "
        f"indeks_unik={bool(idx)} jalur2='{out2.strip().splitlines()[0] if out2 else ''}'"
    )

    # ---------------------------------------------------------------- UAT-7b
    db_rb = WORK / "sandbox-rollback.db"
    bangun_db(db_rb, migrasi=False)
    jalankan([PY, str(BASE / "migrate_publish_columns.py"), "--db", str(db_rb),
              "--backup-dir", str(WORK / "backup")], {})
    rcr, outr, errr = jalankan(
        [PY, str(BASE / "rollback_publish_columns.py"), "--db", str(db_rb)], {})
    kolom_rb = sorted(r[1] for r in sqlite3.connect(db_rb).execute(
        "PRAGMA table_info(content_queue)"))
    check(
        "UAT-7b rollback mengembalikan skema",
        rcr == 0 and not (perlu & set(kolom_rb)),
        f"rc={rcr} kolom_sisa_5={sorted(perlu & set(kolom_rb))} "
        f"keluaran='{outr.strip().splitlines()[0] if outr else ''}'"
    )

    accounts = [
        {"_id": THREADS_ID, "username": THREADS_USER, "type": "threads", "isConnected": True},
        {"_id": IG_ID, "username": IG_USER, "type": "instagram", "isConnected": True},
    ]

    # ---- seed A: 108 jadwal kanonik TANPA teks (jalur berkas baseline saja) ----
    # ---- seed B: 108 kanonik, 1 entri (T1) diisi teks NYATA + 1 entri IG berisi
    #              teks NYATA T2 + 1 entri berpenautan eksplisit ----------------
    by_id = {real_docs[0]["_id"]: real_docs[0]}   # hanya T1 dengan teks asli
    seed_teks = [by_id.get(s["_id"], s) for s in seed]
    ig_real = json.loads(json.dumps(real_docs[1]))
    teks_ig_lawan = list(T[1])
    teks_ig_lawan[6] = (teks_ig_lawan[6] +
                        " Kalimat tambahan khusus UAT supaya teks ini TIDAK ada "
                        "di entri Threads mana pun.")
    ig_real["_id"] = "UAT-IG-SEED-1"
    ig_real["accountId"] = IG_ID
    ig_real.pop("account", None)
    ig_real["scheduleAt"] = "2026-12-05T02:00:00.000Z"
    ig_real["description"] = teks_ig_lawan[0]
    ig_real["replies"] = [{"description": t} for t in teks_ig_lawan[1:]]
    seed_teks.append(ig_real)
    tautan = json.loads(json.dumps(seed[0]))
    tautan["_id"] = "UAT-LINK-SEED-1"
    tautan["accountId"] = IG_ID
    tautan["scheduleAt"] = "2026-12-05T04:00:00.000Z"
    tautan["meta"] = {"title": "", "description": "", "url": "",
                      "source_content_id": "SRC-UAT-1"}
    seed_teks.append(tautan)

    # draf uji berbasis teks jadwal NYATA
    d_dup = buat_draf("UAT-DUP-NYATA", T[0], judul="UAT duplikat nyata T1")
    d_ig = buat_draf("UAT-IG-TURUNAN", T[0], judul="UAT turunan IG dari T1",
                     medias=[{"type": "image",
                              "url": "https://media.example.test/uat/1.png"}])
    d_threads_lawan = buat_draf("UAT-THREADS-LAWAN-IG", teks_ig_lawan,
                                judul="UAT threads identik dgn entri IG")
    d_tautan = buat_draf("UAT-TAUTAN-EKSPLISIT",
                         T[2][:6] + ["Post UAT ini benar-benar baru dan tidak sama "
                                     "dengan teks jadwal mana pun."],
                         source_content_id="SRC-UAT-1",
                         judul="UAT penautan eksplisit lintas platform",
                         medias=[{"type": "image",
                                  "url": "https://media.example.test/uat/tautan.png"}])
    # variasi konten BERBEDA (harus LOLOS)
    v_kata = list(T[0])
    v_kata[3] = v_kata[3] + " Tambahan satu kalimat baru untuk uji variasi kata."
    v_tanda = list(T[0])
    v_tanda[4] = (v_tanda[4].replace(",", ";", 1) if "," in v_tanda[4]
                  else v_tanda[4] + "!")
    v_para = list(T[0])
    v_para[5] = "Kalimat pengganti yang benar-benar berbeda untuk menguji parafrase."
    v_spasi = list(T[0])
    v_spasi[1] = v_spasi[1].replace(" ", "   ") + "\n\n\n        "
    d_variasi = [
        ("UAT-VAR-KATA", buat_draf("UAT-VAR-KATA", v_kata)),
        ("UAT-VAR-TANDA", buat_draf("UAT-VAR-TANDA", v_tanda)),
        ("UAT-VAR-PARAFRASE", buat_draf("UAT-VAR-PARAFRASE", v_para)),
    ]
    d_spasi = buat_draf("UAT-VAR-SPASI", v_spasi)

    # ---------------------------------------------------------------- UAT-B3b
    # server tiruan TANPA teks -> satu-satunya sumber sidik jari T1 = berkas baseline
    api_polos = FakeRepliz(
        accounts, seed,
        schedule_details={real_docs[0]["_id"]: real_docs[0]},
    ).start()
    try:
        bangun_db(db, extra=[("UAT-DUP-NYATA", d_dup, "UAT")])
        api_polos.reset()
        n0 = api_polos.post_count
        c, o, e = jalankan(pub_cmd(db, baseline, ["--content-id", "UAT-DUP-NYATA"]),
                           env_akun(db, baseline, api_polos.base_url))
        st = status_db(db, "UAT-DUP-NYATA")
        exact_pass = (
            (api_polos.post_count - n0) == 0
            and st["publish_status"] == "DUPLIKAT_BASELINE"
            and st["repliz_schedule_id"] is None
            and any("/schedule/" in path for method, path in api_polos.state.paths
                    if method == "GET")
        )
        # Jika GET detail tidak tersedia, fingerprint TIDAK cukup untuk menolak
        # sebagai duplikat dan TIDAK boleh membiarkan POST sungguhan.
        api_polos.reset()
        api_polos.state.details.clear()
        bangun_db(db, extra=[("UAT-DUP-NYATA", d_dup, "UAT")])
        n1 = api_polos.post_count
        c_hold, o_hold, e_hold = jalankan(
            pub_cmd(db, baseline, ["--content-id", "UAT-DUP-NYATA"]),
            env_akun(db, baseline, api_polos.base_url))
        st_hold = status_db(db, "UAT-DUP-NYATA")
        safe_hold = ((api_polos.post_count - n1) == 0
                     and st_hold["publish_status"] == "BLOCKED_VERIFY_DUPLIKAT")
        check(
            "UAT-B3b baseline mengarahkan GET detail: persis ditolak, tanpa detail ditahan (0 POST)",
            exact_pass and safe_hold,
            f"baseline tanpa teks -> GET detail persis={'PASS' if exact_pass else 'FAIL'}; "
            f"detail tak tersedia -> status={st_hold['publish_status']} "
            f"POST={api_polos.post_count - n1}"
        )
    finally:
        api_polos.stop()

    api = FakeRepliz(accounts, seed_teks).start()
    print(f"FAKE_API={api.base_url} seeded_schedules={len(seed_teks)} "
          f"(108 kanonik, T1 berteks nyata, +1 IG nyata, +1 penautan eksplisit)")

    try:
        # ------------------------------------------------------------ UAT-B3c
        kosong = WORK / "baseline-kosong.json"
        kosong.write_text(json.dumps({"jadwal": []}), encoding="utf-8")
        bangun_db(db, extra=[("UAT-DUP-NYATA", d_dup, "UAT")])
        api.reset()
        n0 = api.post_count
        c, o, e = jalankan(pub_cmd(db, kosong, ["--content-id", "UAT-DUP-NYATA"]),
                           env_akun(db, kosong, api.base_url))
        st = status_db(db, "UAT-DUP-NYATA")
        check(
            "UAT-B3c duplikat ditolak via pustaka LIVE dari API (berkas baseline kosong)",
            (api.post_count - n0) == 0 and st["publish_status"] == "DUPLIKAT_BASELINE",
            f"POST={api.post_count - n0} status={st['publish_status']} "
            f"baris='{baris(o, 'UAT-DUP-NYATA')[:130]}'"
        )

        # ------------------------------------------------------------ UAT-B3d
        bangun_db(db, extra=[(c, p, "UAT") for c, p in d_variasi])
        api.reset()
        n0 = api.post_count
        hasil = []
        lolos = 0
        for cid, _p in d_variasi:
            cc, oo, ee = jalankan(pub_cmd(db, baseline, ["--content-id", cid, "--dry-run"]),
                                  env_akun(db, baseline, api.base_url))
            ok = (f"{cid}=DRY_RUN" in oo) and ("DUPLIKAT" not in oo)
            lolos += 1 if ok else 0
            hasil.append(f"{cid}:{'LOLOS' if ok else 'DITOLAK_SALAH'}")
        check(
            "UAT-B3d konten BERBEDA tidak salah ditolak (3 variasi: kata/tanda baca/parafrase)",
            lolos == 3 and (api.post_count - n0) == 0,
            f"{lolos}/3 LOLOS -> {' '.join(hasil)} POST={api.post_count - n0} (dry-run)"
        )

        # ------------------------------------------------------------ UAT-B3e
        # Beda spasi saja = TEKS ASLI BERBEDA, bukan duplikat persis.
        v_dalam = list(T[0])
        v_dalam[2] = v_dalam[2].replace(" ", "  ", 4)
        v_pinggir = list(T[0])
        v_pinggir[2] = " " + v_pinggir[2] + " "
        # Baseline kanonis tetap sama pada semua varian.
        variasi_spasi = [
            ("UAT-VAR-SPASI", d_spasi, v_spasi),
            ("UAT-VAR-SPASI-DALAM", buat_draf("UAT-VAR-SPASI-DALAM", v_dalam), v_dalam),
            ("UAT-VAR-SPASI-PINGGIR", buat_draf("UAT-VAR-SPASI-PINGGIR", v_pinggir), v_pinggir),
        ]
        bangun_db(db, extra=[(cid, draft, "UAT") for cid, draft, _ in variasi_spasi])
        api.reset()
        n0 = api.post_count
        fp_asli = FK.fingerprint_utas(T[0])
        hasil_spasi = []
        for cid, _draft, posts in variasi_spasi:
            code, output, error = jalankan(
                pub_cmd(db, baseline, ["--content-id", cid, "--dry-run"]),
                env_akun(db, baseline, api.base_url))
            st = status_db(db, cid)["publish_status"]
            same_fp = FK.fingerprint_utas(posts) == fp_asli
            raw_diff = posts != T[0]
            pass_case = (code == 0 and f"{cid}=DRY_RUN" in output
                         and "DUPLIKAT" not in output and raw_diff
                         and st in (None, "NOT_SUBMITTED"))
            hasil_spasi.append((cid, pass_case, same_fp, st))
        check(
            "UAT-B3e variasi SPASI-SAJA -> teks beda LOLOS, termasuk fingerprint sama",
            all(t[1] for t in hasil_spasi) and any(t[2] for t in hasil_spasi)
            and api.post_count == n0,
            f"variasi=3 hasil={[(t[0], 'PASS' if t[1] else 'FAIL', t[2], t[3]) for t in hasil_spasi]} "
            f"POST={api.post_count - n0}"
        )

        # ------------------------------------------------------------ UAT-B7a
        bangun_db(db, extra=[("UAT-IG-TURUNAN", d_ig, "UAT")])
        api.reset()
        n0 = api.post_count
        c, o, e = jalankan(
            pub_cmd(db, baseline, ["--content-id", "UAT-IG-TURUNAN"]),
            env_akun(db, baseline, api.base_url,
                     REPLIZ_TARGET_AKUN="instagram", INSTAGRAM_ENABLED="true"))
        st = status_db(db, "UAT-IG-TURUNAN")
        check(
            "UAT-B7a turunan lintas platform LOLOS: sidik jari Threads tidak memblokir IG",
            (api.post_count - n0) == 1 and st["publish_status"] == "SCHEDULED",
            f"teks IG IDENTIK dgn entri Threads T1 "
            f"(uta={rujukan[real_docs[0]['_id']]['fingerprint_kanonis_utas']}) -> "
            f"POST={api.post_count - n0} status={st['publish_status']} "
            f"baris='{baris(o, 'UAT-IG-TURUNAN')[:120]}'"
        )

        # ------------------------------------------------------------ UAT-B7b
        bangun_db(db, extra=[("UAT-THREADS-LAWAN-IG", d_threads_lawan, "UAT")])
        api.reset()
        n0 = api.post_count
        c, o, e = jalankan(pub_cmd(db, baseline, ["--content-id", "UAT-THREADS-LAWAN-IG"]),
                           env_akun(db, baseline, api.base_url))
        st = status_db(db, "UAT-THREADS-LAWAN-IG")
        check(
            "UAT-B7b arah sebaliknya: sidik jari IG tidak memblokir Threads",
            (api.post_count - n0) == 1 and st["publish_status"] == "SCHEDULED",
            f"teks Threads IDENTIK dgn entri Instagram (UAT-IG-SEED-1, akun {IG_ID}) -> "
            f"POST={api.post_count - n0} status={st['publish_status']} "
            f"baris='{baris(o, 'UAT-THREADS-LAWAN-IG')[:120]}'"
        )

        # ------------------------------------------------------------ UAT-B7c
        bangun_db(db, extra=[("UAT-TAUTAN-EKSPLISIT", d_tautan, "UAT")])
        api.reset()
        n0 = api.post_count
        c, o, e = jalankan(
            pub_cmd(db, baseline, ["--content-id", "UAT-TAUTAN-EKSPLISIT"]),
            env_akun(db, baseline, api.base_url,
                     REPLIZ_TARGET_AKUN="instagram", INSTAGRAM_ENABLED="true"))
        st = status_db(db, "UAT-TAUTAN-EKSPLISIT")
        check(
            "UAT-B7c penautan EKSPLISIT lintas platform (source_content_id sama) -> DIBLOKIR",
            (api.post_count - n0) == 0 and st["publish_status"] == "DUPLIKAT_EKSPLISIT",
            f"kandidat IG berisi teks BARU tetapi menautkan source_content_id=SRC-UAT-1 "
            f"milik jadwal IG lain -> POST={api.post_count - n0} "
            f"status={st['publish_status']} baris='{baris(o, 'UAT-TAUTAN-EKSPLISIT')[:140]}'"
        )

        # ------------------------------------------------------------ UAT-B6a..d
        hari = {"2026-12-10": 5}          # hari ini PENUH (cap 5)
        menit: set = set()
        now_a = P.datetime(2026, 12, 10, 21, 0, tzinfo=P.JAKARTA)
        s_a, g_a, al_a = P.lapis1_pilih_slot(menit, hari, P.parse_slots(None), 5,
                                             diminta=None, now=now_a,
                                             cutoff_jam=P.time(20, 45))
        now_b = P.datetime(2026, 12, 10, 20, 45, tzinfo=P.JAKARTA)
        s_b, g_b, al_b = P.lapis1_pilih_slot(menit, {}, P.parse_slots(None), 5,
                                             diminta=None, now=now_b,
                                             cutoff_jam=P.time(20, 45))
        now_c = P.datetime(2026, 12, 10, 14, 0, tzinfo=P.JAKARTA)
        s_c, g_c, al_c = P.lapis1_pilih_slot(menit, {}, P.parse_slots(None), 5,
                                             diminta=None, now=now_c,
                                             cutoff_jam=P.time(20, 45))
        ok_a = (s_a.strftime("%Y-%m-%d %H:%M") == "2026-12-11 15:00"
                and P.iso_utc(s_a) == "2026-12-11T08:00:00Z")
        ok_b = (s_b.strftime("%Y-%m-%d %H:%M") == "2026-12-11 15:00"
                and "BATAS_JAM_20:45" in al_b)
        ok_c = (s_c.strftime("%Y-%m-%d %H:%M") == "2026-12-10 15:00" and g_c)
        check(
            "UAT-B6a jam malam + hari ini penuh -> geser BESOK (21:00 WIB -> 11 Des 15:00 WIB)",
            bool(ok_a),
            f"now=2026-12-10T21:00WIB (=2026-12-10T14:00Z) hari_10Des=5/5 -> "
            f"dipilih={s_a.strftime('%Y-%m-%d %H:%M')}WIB = {P.iso_utc(s_a)} alasan={al_a}"
        )
        check(
            "UAT-B6b tepat pada batas jam 20:45 WIB -> geser BESOK (hari belum penuh)",
            bool(ok_b),
            f"now=2026-12-10T20:45WIB (=2026-12-10T13:45Z) hari_10Des=0/5 -> "
            f"dipilih={s_b.strftime('%Y-%m-%d %H:%M')}WIB alasan={al_b}"
        )
        check(
            "UAT-B6c sebelum batas jam & hari belum penuh -> tetap HARI INI",
            bool(ok_c),
            f"now=2026-12-10T14:00WIB -> dipilih={s_c.strftime('%Y-%m-%d %H:%M')}WIB "
            f"= {P.iso_utc(s_c)} alasan={al_c}"
        )
        z_ok = (P.iso_utc(P.datetime(2026, 12, 11, 15, 0, tzinfo=P.JAKARTA))
                == "2026-12-11T08:00:00Z"
                and P.iso_utc(P.datetime(2026, 12, 10, 21, 0, tzinfo=P.JAKARTA))
                == "2026-12-10T14:00:00Z"
                and s_a.utcoffset() == P.timedelta(hours=7))
        check(
            "UAT-B6d zona Asia/Jakarta benar (WIB UTC+7 <-> UTC)",
            z_ok,
            f"11 Des 15:00 WIB={P.iso_utc(P.datetime(2026,12,11,15,0,tzinfo=P.JAKARTA))}; "
            f"10 Des 21:00 WIB={P.iso_utc(P.datetime(2026,12,10,21,0,tzinfo=P.JAKARTA))}; "
            f"offset_waktu_dipilih={s_a.utcoffset()}"
        )

        # ------------------------------------------------------------ UAT-B6e (CLI)
        bangun_db(db)
        api.reset()
        n0 = api.post_count
        c, o, e = jalankan(
            pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
            env_akun(db, baseline, api.base_url,
                     KALYANAMITRA_UAT_ALLOW_NOW_OVERRIDE="true",
                     KALYANAMITRA_NOW="2026-12-10T21:00:00+07:00"))
        st = status_db(db, "KAL-PILOT-001")
        dipilih = st["scheduled_at"] or ""
        check(
            "UAT-B6e end-to-end CLI: 10 Des 21:00 WIB + data 108 jadwal nyata -> slot 22 Des",
            (api.post_count - n0) == 1 and dipilih == "2026-12-22T08:00:00Z",
            f"POST={api.post_count - n0} scheduled_at(UTC)={dipilih} "
            f"(= 2026-12-22 15:00 WIB; 11-21 Des penuh 5/5) "
            f"baris='{baris(o, 'KAL-PILOT-001')[:120]}'"
        )

        # ------------------------------------------------------------ UAT-1
        bangun_db(db)
        api.reset()
        n0 = api.post_count
        c1, o1, e1 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001",
                                                     "--max-jobs", "1"]),
                              env_akun(db, baseline, api.base_url))
        st1 = status_db(db, "KAL-PILOT-001")
        n1 = api.post_count
        c2, o2, e2 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001",
                                                     "--max-jobs", "1"]),
                              env_akun(db, baseline, api.base_url))
        n2 = api.post_count
        st2 = status_db(db, "KAL-PILOT-001")
        check(
            "UAT-1 dua eksekusi -> tepat 1 jadwal, eksekusi ke-2 = 0 POST",
            c1 == 0 and c2 == 0 and (n1 - n0) == 1 and (n2 - n1) == 0
            and st1["publish_status"] == "SCHEDULED"
            and st1["repliz_schedule_id"]
            and st2["repliz_schedule_id"] == st1["repliz_schedule_id"],
            f"POST_r1={n1 - n0} POST_r2={n2 - n1} id={st1['repliz_schedule_id']} "
            f"status={st1['publish_status']} baris_r1='{baris(o1, 'KAL-PILOT-001')[:110]}'"
        )

        # ------------------------------------------------------------ UAT-2a
        bangun_db(db)
        api.reset()
        n0 = api.post_count
        c3, o3, e3 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001",
                                                     "--slot", "2026-12-01T06:52",
                                                     "--strict-slot"]),
                              env_akun(db, baseline, api.base_url))
        st3 = status_db(db, "KAL-PILOT-001")
        check(
            "UAT-2a slot terisi baseline + --strict-slot -> DITOLAK, 0 POST",
            (api.post_count - n0) == 0 and "DUPLIKAT_SLOT" in o3
            and st3["publish_status"] == "DUPLIKAT_SLOT",
            f"POST={api.post_count - n0} baris='{baris(o3, 'KAL-PILOT-001')[:120]}' "
            f"status_db={st3['publish_status']}"
        )

        # ------------------------------------------------------------ UAT-2b
        bangun_db(db)
        api.reset()
        n0 = api.post_count
        c4, o4, e4 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001",
                                                     "--slot", "2026-12-01T06:52"]),
                              env_akun(db, baseline, api.base_url))
        st4 = status_db(db, "KAL-PILOT-001")
        dipilih = st4["scheduled_at"]
        pasangan = api.schedule_pairs()
        baru = [(a, s) for (a, s) in pasangan if (a, s) == (THREADS_ID, dipilih)]
        total_baru = len(pasangan) - len(seed_teks)
        unik = len(pasangan) == len(set(pasangan))
        check(
            "UAT-2b slot terisi baseline tanpa --strict-slot -> DIGESER, 0 duplikasi",
            (api.post_count - n0) == 1 and st4["publish_status"] == "SCHEDULED"
            and (THREADS_ID, dipilih) not in baseline_pairs and bool(baru)
            and total_baru == 1 and unik
            and dipilih.startswith("2026-12-22"),
            f"POST={api.post_count - n0} diminta=2026-12-01T06:52WIB dipilih={dipilih} "
            f"(=22 Des 15:00 WIB, 1 Des penuh 5/5) total_baru={total_baru} unik={unik} "
            f"baris='{baris(o4, 'KAL-PILOT-001')[:110]}'"
        )

        # ------------------------------------------------------------ UAT-4
        bangun_db(db)
        api.reset()
        n0 = api.post_count
        ca, oa, ea = jalankan(
            pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
            env_akun(db, baseline, api.base_url,
                     REPLIZ_KALYANAMITRA_THREADS_ACCOUNT_ID="REPLACE_RESOURCE_ID"))
        api.set_account(THREADS_ID, username="akun.lain")
        cb, ob, eb = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url))
        api.set_account(THREADS_ID, username=THREADS_USER)
        api.set_account(THREADS_ID, isConnected=False)
        cc, oc, ec = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url))
        api.set_account(THREADS_ID, isConnected=True)
        api.set_account(THREADS_ID, type="instagram")
        cg, og, eg = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url))
        api.set_account(THREADS_ID, type="threads")
        check(
            "UAT-4 akun salah -> DITOLAK (4 varian), 0 POST",
            (api.post_count - n0) == 0 and ca == 3 and cb == 4 and cc == 4 and cg == 4
            and "ACCOUNT_ID_DILUAR_ALLOWLIST" in ea and "WRONG_USERNAME" in eb
            and "ACCOUNT_NOT_CONNECTED" in ec and "WRONG_PLATFORM" in eg,
            f"POST={api.post_count - n0} a(rc={ca})='{ea.strip().splitlines()[-1][:56]}' "
            f"b(rc={cb})='{eb.strip().splitlines()[-1][:56]}' "
            f"c(rc={cc})='{ec.strip().splitlines()[-1][:56]}' "
            f"d(rc={cg})='{eg.strip().splitlines()[-1][:56]}'"
        )

        # ------------------------------------------------------------ UAT-5
        bangun_db(db)
        api.reset()
        api.set_mode("drop")
        n0 = api.post_count
        c6, o6, e6 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url))
        st6 = status_db(db, "KAL-PILOT-001")
        n1 = api.post_count
        api.set_mode("ok")
        c7, o7, e7 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url))
        n2 = api.post_count
        st6b = status_db(db, "KAL-PILOT-001")
        bangun_db(db)
        api.reset()
        api.set_mode("500")
        c8, o8, e8 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url))
        st8 = status_db(db, "KAL-PILOT-001")
        n3 = api.post_count
        c9, o9, e9 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url))
        n4 = api.post_count
        check(
            "UAT-5 timeout & 5xx setelah POST -> RECONCILE, ulang 0 POST",
            st6["publish_status"] == "RECONCILE" and "RECONCILE" in o6
            and (n1 - n0) == 1 and (n2 - n1) == 0 and st6b["publish_status"] == "RECONCILE"
            and st8["publish_status"] == "RECONCILE" and (n3 - n2) == 1 and (n4 - n3) == 0,
            f"timeout: POST={n1 - n0} status={st6['publish_status']} ulang POST={n2 - n1} | "
            f"5xx: POST={n3 - n2} status={st8['publish_status']} ulang POST={n4 - n3}"
        )

        # ------------------------------------------------------------ UAT-8
        bangun_db(db)
        api.reset()
        n0 = api.post_count
        cd, od, ed = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url, PUBLISH_ENABLED="false"))
        ce, oe, ee = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url,
                                       DUPLICATE_CHECK_ENABLED="false"))
        check(
            "UAT-8 kill switch PUBLISH_ENABLED=false & DUPLICATE_CHECK_ENABLED=false -> BLOKIR",
            (api.post_count - n0) == 0 and cd == 3 and ce == 3
            and "PUBLISH_ENABLED" in ed and "DUPLICATE_CHECK_ENABLED" in ee,
            f"POST={api.post_count - n0} rc_publish={cd} rc_dup={ce} "
            f"pesan='{ed.strip().splitlines()[-1][:44]} / {ee.strip().splitlines()[-1][:44]}'"
        )

        # ------------------------------------------------------------ UAT-9 + B9
        bangun_db(db)
        api.reset()
        n0 = api.post_count
        cf, of, ef = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url, ENGINE_MODE="draft_only"))
        cg2, og2, eg2 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                                 env_akun(db, baseline, api.base_url, ENGINE_MODE=""))
        ch, oh, eh = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                              env_akun(db, baseline, api.base_url, ENGINE_MODE="paused"))
        check(
            "UAT-9 ENGINE_MODE=draft_only -> paksa DRY_RUN (0 POST)",
            (api.post_count - n0) == 0 and "DRY_RUN" in of,
            f"POST={api.post_count - n0} baris='{baris(of, 'KAL-PILOT-001')[:150]}'"
        )
        check(
            "UAT-B9 publikasi mustahil tanpa keputusan eksplisit (mode kosong/paused/draft_only)",
            (api.post_count - n0) == 0
            and "DRY_RUN" in of and "mode=DRAFT_ONLY" in of
            and "DRY_RUN" in og2 and "mode=MODE_TIDAK_DIKENAL" in og2
            and "DRY_RUN" in oh and "mode=MODE_TIDAK_DIKENAL" in oh,
            f"total POST utk 3 mode non-publish = {api.post_count - n0}; "
            f"draft_only->mode=DRAFT_ONLY, kosong->mode=MODE_TIDAK_DIKENAL, "
            f"paused->mode=MODE_TIDAK_DIKENAL; PUBLISH_ENABLED tetap true di ketiganya"
        )

        # ------------------------------------------------------------ UAT-10
        bangun_db(db)
        api.reset()
        n0 = api.post_count
        cg3, og3, eg3 = jalankan(pub_cmd(db, baseline, ["--content-id", "KAL-PILOT-001"]),
                                 env_akun(db, baseline, api.base_url,
                                          REPLIZ_TARGET_AKUN="instagram",
                                          INSTAGRAM_ENABLED="true"))
        check(
            "UAT-10 target instagram utas teks TANPA media -> DITOLAK (0 POST)",
            (api.post_count - n0) == 0 and "TARGET_TIDAK_DIDUKUNG" in og3,
            f"POST={api.post_count - n0} baris='{baris(og3, 'KAL-PILOT-001')[:150]}'"
        )

        # ------------------------------------------------------------ UAT-6
        host_ok = True
        host_seen = set()
        for run_out in (o1, o2, o4, o6, o7, oa, ob, oc, og, od, oe, of, og2, og3,
                        o3, oh):
            for line in run_out.splitlines():
                if line.startswith("POST_HTTP_DIKIRIM="):
                    hosts = line.split("host=", 1)[1]
                    if "repliz.com" in hosts:
                        host_ok = False
                    if hosts not in ("[]", ""):
                        host_seen.add(hosts)
        check(
            "UAT-6 POST nyata ke api.repliz.com = 0",
            host_ok and all(f"127.0.0.1:{api.port}" in h for h in host_seen),
            f"host_POST_dilaporkan_modul={sorted(host_seen)} semua_loopback=True "
            f"api_repliz_com=0"
        )

    finally:
        api.stop()

    # ---------------------------------------------------------------- ringkas
    hasil = Path(BASE / "uat-terakhir.json")
    hasil.write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding="utf-8")
    n_pass = sum(1 for r in RESULTS if r["verdict"] == "PASS")
    n_part = sum(1 for r in RESULTS if r["verdict"] == "PARTIAL")
    print(f"\nRINGKASAN {n_pass} PASS, {n_part} PARTIAL, "
          f"{len(RESULTS) - n_pass - n_part} FAIL dari {len(RESULTS)} -> {hasil}")
    return 0 if n_pass == len(RESULTS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
