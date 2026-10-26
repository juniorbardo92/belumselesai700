"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const assets = path.join(root, "app", "src", "main", "assets");

function createHarness(initialState, options = {}) {
  const storage = new Map();
  if (initialState) storage.set("panglima-umkm-safe-v1", JSON.stringify(initialState));
  const listeners = new Map();
  const opened = [];
  const apiCalls = [];
  const moduleOpens = [];
  const reminderCalls = [];
  const confirmMessages = [];
  const rootElement = { innerHTML: "" };
  const toastElement = {
    textContent: "",
    classList: { add() {}, remove() {} }
  };
  const errorElements = new Map();

  const document = {
    readyState: "complete",
    addEventListener(name, callback) { listeners.set(name, callback); },
    getElementById(id) {
      if (id === "app") return rootElement;
      if (id === "toast") return toastElement;
      if (!errorElements.has(id)) errorElements.set(id, { textContent: "" });
      return errorElements.get(id);
    }
  };

  const window = {
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    setTimeout() { return 1; },
    clearTimeout() {},
    scrollTo() {},
    confirm(message) {
      confirmMessages.push(String(message || ""));
      return options.confirmResult !== false;
    },
    open(url) { opened.push(url); }
  };

  if (options.nativeBridge) {
    window.PanglimaAndroid = {
      postApi(endpoint, payload, requestId) {
        apiCalls.push({ endpoint, payload: JSON.parse(payload), requestId });
      },
      syncActionPlanReminder(enabled) {
        reminderCalls.push({ method: "sync", enabled });
      },
      setActionPlanReminder(enabled) {
        reminderCalls.push({ method: "set", enabled });
      },
      openModule(moduleCode, sessionToken) {
        moduleOpens.push({ moduleCode, sessionToken });
      },
      openExternal(url) { opened.push(url); }
    };
  }

  const context = vm.createContext({
    window,
    document,
    navigator: {},
    console,
    Array,
    Object,
    Number,
    String,
    JSON,
    Math,
    RegExp,
    encodeURIComponent
  });

  vm.runInContext(fs.readFileSync(path.join(assets, "config.js"), "utf8"), context, { filename: "config.js" });
  window.PANGLIMA_CONFIG = Object.freeze(Object.assign({}, window.PANGLIMA_CONFIG, {
    activationMode: options.activationMode || "demo-local"
  }));
  vm.runInContext(fs.readFileSync(path.join(assets, "app.js"), "utf8"), context, { filename: "app.js" });

  function submit(id, fields) {
    listeners.get("submit")({
      preventDefault() {},
      target: {
        id,
        elements: { namedItem(name) { return { value: fields[name] ?? "" }; } }
      }
    });
  }

  function click(dataset) {
    const element = { dataset };
    listeners.get("click")({ target: { closest() { return element; } } });
  }

  function change(dataset, extra = {}) {
    listeners.get("change")({ target: { dataset, ...extra } });
  }

  function respondApi(index, status, payload) {
    const request = apiCalls[index];
    assert.ok(request, "Permintaan native API belum tercatat.");
    window.panglimaApiResult(request.requestId, status, JSON.stringify(payload));
  }

  return {
    api: window.PANGLIMA_TEST_API,
    window,
    document,
    storage,
    listeners,
    rootElement,
    toastElement,
    opened,
    apiCalls,
    moduleOpens,
    reminderCalls,
    confirmMessages,
    submit,
    click,
    change,
    respondApi
  };
}

function activate(app) {
  app.submit("activation-form", {
    owner: "Bu Rani",
    business: "Dapur Bu Rani",
    type: "Kuliner",
    activationCode: "PANGLIMA-DEMO"
  });
}

async function settleApi() {
  await new Promise(resolve => setImmediate(resolve));
}

test("konten SAFE memiliki 40 pertanyaan resmi, 10 modul, 30 misi, dan 17 kebocoran", () => {
  const { api } = createHarness();
  assert.equal(api.domains.length, 10);
  assert.equal(api.workbookModules.length, 10);
  assert.equal(api.tasks.length, 30);
  assert.equal(api.leaks.length, 17);
  assert.equal(api.domains.reduce((total, item) => total + item.questions.length, 0), 40);
  assert.equal(api.workbookModules.reduce((total, item) => total + item.questions.length, 0), 40);
  assert.equal(api.workbookModules.reduce((total, item) => total + item.exercises.length, 0), 20);
});

test("skor diagnosis tidak diterbitkan sebelum seluruh pertanyaan medan terjawab", () => {
  const { api } = createHarness();
  const domain = api.domains[0];
  const partial = api.scoreDomain(domain, { "pemasaran-0": 2, "pemasaran-1": 1, "pemasaran-2": 0 });
  assert.equal(partial.complete, false);
  assert.equal(partial.score, null);
  assert.equal(partial.checklistScore, null);

  const complete = api.scoreDomain(domain, { "pemasaran-0": 2, "pemasaran-1": 1, "pemasaran-2": 0, "pemasaran-3": 1 });
  assert.equal(complete.complete, true);
  assert.equal(complete.score, 50);
  assert.equal(complete.checklistScore, 8);
});

test("klasifikasi skor memiliki batas merah, kuning, dan hijau yang konsisten", () => {
  const { api } = createHarness();
  assert.equal(api.classifyScore(49).tone, "red");
  assert.equal(api.classifyScore(50).tone, "yellow");
  assert.equal(api.classifyScore(74).tone, "yellow");
  assert.equal(api.classifyScore(75).tone, "green");
});

test("medan prioritas dipilih dari skor lengkap terendah", () => {
  const { api } = createHarness();
  const results = api.rankCompletedDomains({
    "pemasaran-0": 2, "pemasaran-1": 2, "pemasaran-2": 2, "pemasaran-3": 2,
    "keuangan-0": 0, "keuangan-1": 0, "keuangan-2": 1, "keuangan-3": 0,
    "penjualan-0": 0
  });
  assert.equal(results.length, 2);
  assert.equal(results[0].domain.id, "keuangan");
  assert.equal(results[0].score, 13);
  assert.equal(results[0].checklistScore, 5);
});

test("kalkulator margin memperhitungkan HPP dan biaya tambahan", () => {
  const { api } = createHarness();
  const result = api.calculateMargin(168000, 100000, 18000);
  assert.equal(result.cost, 118000);
  assert.equal(result.profit, 50000);
  assert.ok(Math.abs(result.margin - 29.76190476) < 0.0001);
});

test("kalkulator harga minimum menolak target margin 100 persen", () => {
  const { api } = createHarness();
  const result = api.calculateMinimumPrice(70000, 10000, 20);
  assert.equal(result.minimumPrice, 100000);
  assert.equal(api.calculateMinimumPrice(70000, 10000, 100), null);
});

test("arus kas tujuh hari menghitung saldo positif maupun negatif", () => {
  const { api } = createHarness();
  const result = api.summarizeCashflow([{ income: 150000, expense: 40000 }, { income: 25000, expense: 60000 }]);
  assert.equal(result.income, 175000);
  assert.equal(result.expense, 100000);
  assert.equal(result.balance, 75000);

  assert.equal(api.summarizeCashflow([{ income: 0, expense: 80000 }]).balance, -80000);
});

test("input pengguna di-escape sebelum dimasukkan ke tampilan", () => {
  const { api } = createHarness();
  assert.equal(api.escapeHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
});

test("aktivasi menolak kode keliru dan menerima kode demo eksplisit", () => {
  const app = createHarness();
  assert.match(app.rootElement.innerHTML, /Mode SAFE \/ demo/);

  app.submit("activation-form", { owner: "Bu Rani", business: "Dapur Bu Rani", activationCode: "SALAH" });
  assert.match(app.document.getElementById("activation-error").textContent, /belum sesuai/);

  activate(app);
  assert.match(app.rootElement.innerHTML, /Selamat datang, Bu Rani/);
  assert.match(app.rootElement.innerHTML, /Dapur Bu Rani/);
  assert.equal(app.storage.size, 1);
});

test("navigasi diagnosis menyimpan jawaban dan menampilkan prioritas", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "diagnosis" });
  assert.match(app.rootElement.innerHTML, /Diagnosis 10 Medan/);

  app.click({ answer: "keuangan-0", value: "0" });
  app.click({ answer: "keuangan-1", value: "0" });
  app.click({ answer: "keuangan-2", value: "1" });
  assert.match(app.rootElement.innerHTML, /3\/4 terjawab/);
  app.click({ answer: "keuangan-3", value: "0" });
  assert.match(app.rootElement.innerHTML, /5\/12 \u00B7 Medan rawan/);
  assert.match(app.rootElement.innerHTML, /Lanjutkan ke Workbook/);

  app.click({ view: "home" });
  assert.match(app.rootElement.innerHTML, /Medan prioritas: Keuangan/);
});

test("checklist misi, kebocoran, dan cash flow tersimpan lokal", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "actions" });
  app.change({ task: "day-1" }, { checked: true });
  assert.match(app.rootElement.innerHTML, /1 dari 30 misi selesai/);

  app.click({ view: "tools" });
  app.click({ tool: "leaks" });
  app.change({ leak: "0" }, { checked: true });
  assert.match(app.rootElement.innerHTML, /1 dari 17 titik sudah diaudit/);

  app.click({ tool: "cashflow" });
  app.change({ cashDay: "0", cashKind: "income" }, { value: "250000" });
  assert.match(app.rootElement.innerHTML, /Rp250\.000/);
});

test("toolkit menyimpan KPI, rencana aksi, dan hasil kalkulator", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "tools" });
  app.click({ tool: "margin" });
  app.submit("margin-form", { selling: "168000", productCost: "100000", operatingCost: "18000" });
  assert.match(app.rootElement.innerHTML, /Rp50\.000/);

  app.click({ tool: "kpi" });
  app.submit("kpi-form", { leads: 20, transactions: 5, revenue: 500000, expense: 200000 });
  assert.match(app.rootElement.innerHTML, /25\.0%/);

  app.click({ tool: "plan" });
  app.submit("plan-form", { thirty: "Pisahkan kas usaha", sixty: "Audit stok", ninety: "Perbaiki SOP", hotseat: "Mengapa kas kosong?" });
  assert.match(app.rootElement.innerHTML, /Mengapa kas kosong\?/);
});

test("APK online membatasi internet pada API Panglima tanpa menghubungi affiliate", () => {
  const manifest = fs.readFileSync(path.join(root, "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const source = fs.readFileSync(path.join(assets, "app.js"), "utf8");
  const config = fs.readFileSync(path.join(assets, "config.js"), "utf8");
  const activity = fs.readFileSync(path.join(root, "app", "src", "main", "java", "id", "umkmnaikkelas", "panglima", "MainActivity.java"), "utf8");
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(config, /activationMode:\s*"cloudflare"/);
  assert.match(config, /panglima-device-api\.ruang-belajar-mandiri01\.workers\.dev/);
  assert.match(config, /panglima-certificate-api\.ruang-belajar-mandiri01\.workers\.dev/);
  assert.match(config, /panglima-pretest-onboarding\.ruang-belajar-mandiri01\.workers\.dev/);
  assert.match(config, /1FAIpQLSfU-jJ7ZfOeA_x2GQXIKdxS9fm4dM7aFoRKsN0Hu-97f62jJg\/viewform/);
  assert.doesNotMatch(config, /\/formResponse/);
  assert.match(activity, /setAllowUniversalAccessFromFileURLs\(false\)/);
  assert.match(activity, /"\/v1\/activate"\.equals\(endpoint\)/);
  assert.match(activity, /"\/v1\/consultation"\.equals\(endpoint\)/);
  assert.match(activity, /"\/v1\/completion"\.equals\(endpoint\)/);
  assert.match(activity, /"\/v1\/certificate"\.equals\(endpoint\)/);
  assert.match(activity, /"\/v1\/onboarding\/request-token"\.equals\(endpoint\)/);
  assert.match(activity, /PANGLIMA_ONBOARDING_API_BASE/);
  assert.match(activity, /Settings\.Secure\.ANDROID_ID/);
  assert.match(activity, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(activity, /requestBody\.put\("deviceId", deviceFingerprint\(\)\)/);
  assert.doesNotMatch(activity, /READ_PHONE_STATE|TelephonyManager|IMEI/);
  assert.doesNotMatch(activity, /panglima-lynk-webhook|\/v1\/admin\/participants/);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("source antarmuka memakai ASCII aman agar tidak rusak pada WebView lama", () => {
  const source = fs.readFileSync(path.join(assets, "app.js"), "utf8");
  assert.doesNotMatch(source, /[^\x00-\x7F]/);
  const { api } = createHarness();
  assert.equal(api.domains[0].icon, "\uD83D\uDCE3");
  assert.equal(api.domains[9].icon, "\uD83E\uDDED");
});

test("tautan resmi dibuka secara eksternal, bukan di dalam sistem aplikasi", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "account" });
  app.click({ action: "website" });
  assert.deepEqual(app.opened, ["https://umkmnaikkelas.id"]);
});

test("akun menampilkan sertifikat dan versi modul tanpa kolom Pendampingan", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "account" });
  assert.match(app.rootElement.innerHTML, /Status sertifikat/);
  assert.match(app.rootElement.innerHTML, /<h2>Tentang aplikasi<\/h2><p class="small muted">Versi 1\.3\.0 MODUL<\/p>/);
  assert.doesNotMatch(app.rootElement.innerHTML, /<h2>Pendampingan<\/h2>|Jadwal sesi Zoom|Lihat Pendampingan|TERKUNCI/);

  app.click({ view: "home" });
  assert.doesNotMatch(app.rootElement.innerHTML, /data-view="mentoring"|>Pendampingan<\/span>/);
  const config = fs.readFileSync(path.join(assets, "config.js"), "utf8");
  assert.doesNotMatch(config, /mentoringSessions|Jadwal akan diumumkan|whatsappNumber/);
});

test("logout mengakhiri sesi tanpa menghapus workbook maupun progres lokal", () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Ratna", business: "Ratna Sukha", type: "Kuliner" },
    online: { sessionToken: "session-ratna", dailyLimit: 3, remainingToday: 2, profileSource: "pretest", deviceBound: true },
    answers: { "keuangan-0": 2 },
    tasks: { "day-1": true },
    workbook: {
      scores: { "keuangan-0": 4 },
      fields: { "canvas-value": "Produk praktis" },
      priorities: ["keuangan"]
    }
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.click({ view: "account" });
  assert.match(app.rootElement.innerHTML, /Keluar \/ Logout/);
  app.click({ action: "logout" });

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.activated, false);
  assert.equal(saved.online.sessionToken, "");
  assert.equal(saved.online.deviceBound, true);
  assert.equal(saved.profile.business, "Ratna Sukha");
  assert.equal(saved.answers["keuangan-0"], 2);
  assert.equal(saved.tasks["day-1"], true);
  assert.equal(saved.workbook.scores["keuangan-0"], 4);
  assert.equal(saved.workbook.fields["canvas-value"], "Produk praktis");
  assert.deepEqual(saved.workbook.priorities, ["keuangan"]);
  assert.match(app.rootElement.innerHTML, /Aktivasi pendampingan/);
  assert.match(app.confirmMessages[0], /Workbook dan progres lokal tetap tersimpan/);
});

test("pengingat Action Plan default ON, tersimpan lokal, dan dapat dinonaktifkan", () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Nina", business: "Warung Nina" }
  }, { nativeBridge: true });

  assert.deepEqual(app.reminderCalls[0], { method: "sync", enabled: true });
  app.click({ view: "account" });
  assert.match(app.rootElement.innerHTML, /Pengingat Action Plan/);
  assert.match(app.rootElement.innerHTML, /data-action-plan-reminder checked/);
  assert.match(app.rootElement.innerHTML, />ON<\/span>/);

  app.change({ actionPlanReminder: "" }, { checked: false });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.settings.actionPlanReminder, false);
  assert.deepEqual(app.reminderCalls.at(-1), { method: "set", enabled: false });
  assert.match(app.rootElement.innerHTML, />OFF<\/span>/);
  assert.doesNotMatch(app.rootElement.innerHTML, /data-action-plan-reminder checked/);
});

test("reset data lokal bekerja setelah konfirmasi dan mempertahankan workbook", () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Ratna", business: "Ratna Sukha", type: "Kuliner" },
    online: { sessionToken: "session-ratna", dailyLimit: 3, remainingToday: 2, profileSource: "pretest", deviceBound: true },
    certificate: { status: "pending", completionDate: "2026-08-24" },
    answers: { "keuangan-0": 2 },
    tasks: { "day-1": true },
    actionPlan: { thirty: "Pisahkan kas", sixty: "Audit stok" },
    workbook: {
      scores: { "keuangan-0": 5 },
      fields: { "roadmap-target": "Naik omzet" },
      priorities: ["keuangan"]
    },
    settings: { actionPlanReminder: false }
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.click({ view: "account" });
  app.click({ action: "reset" });

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.activated, false);
  assert.deepEqual(saved.profile, { owner: "", business: "", type: "", goal: "" });
  assert.equal(saved.online.sessionToken, "");
  assert.deepEqual(saved.answers, {});
  assert.deepEqual(saved.tasks, {});
  assert.deepEqual(saved.actionPlan, { thirty: "", sixty: "", ninety: "", hotseat: "" });
  assert.equal(saved.certificate.status, "");
  assert.equal(saved.workbook.scores["keuangan-0"], 5);
  assert.equal(saved.workbook.fields["roadmap-target"], "Naik omzet");
  assert.deepEqual(saved.workbook.priorities, ["keuangan"]);
  assert.equal(saved.settings.actionPlanReminder, true);
  assert.equal(app.storage.size, 1);
  assert.match(app.rootElement.innerHTML, /Aktivasi pendampingan/);
  assert.match(app.toastElement.textContent, /Workbook tetap tersimpan/);
});

test("reset data lokal dibatalkan tanpa mengubah data", () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Nina", business: "Warung Nina" },
    answers: { "keuangan-0": 2 },
    workbook: { scores: { "keuangan-0": 4 }, fields: {}, priorities: [] }
  }, { confirmResult: false });

  app.click({ view: "account" });
  app.click({ action: "reset" });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.activated, true);
  assert.equal(saved.profile.business, "Warung Nina");
  assert.equal(saved.answers["keuangan-0"], 2);
  assert.equal(saved.workbook.scores["keuangan-0"], 4);
});

test("Android menjadwalkan pengingat harian dan mendukung izin notifikasi", () => {
  const manifest = fs.readFileSync(path.join(root, "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const activity = fs.readFileSync(path.join(root, "app", "src", "main", "java", "id", "umkmnaikkelas", "panglima", "MainActivity.java"), "utf8");
  const receiver = fs.readFileSync(path.join(root, "app", "src", "main", "java", "id", "umkmnaikkelas", "panglima", "ActionPlanReminderReceiver.java"), "utf8");
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifest, /android\.permission\.RECEIVE_BOOT_COMPLETED/);
  assert.match(manifest, /\.ActionPlanReminderReceiver/);
  assert.match(activity, /setWebChromeClient\(new WebChromeClient\(\)\)/);
  assert.match(activity, /setActionPlanReminder\(boolean enabled\)/);
  assert.match(activity, /requestPermissions/);
  assert.match(receiver, /setInexactRepeating/);
  assert.match(receiver, /AlarmManager\.INTERVAL_DAY/);
  assert.match(receiver, /NotificationChannel/);
  assert.match(receiver, /REMINDER_HOUR = 9/);
});

test("asisten offline menyediakan skenario untuk seluruh 10 medan UMKM", () => {
  const { api } = createHarness();
  const coveredDomains = new Set(api.consultationScenarios.map(item => item.domainId));
  assert.ok(api.consultationScenarios.length >= 20);
  assert.equal(coveredDomains.size, 10);
  assert.equal(api.consultationExamples.length, 6);
});

test("asisten mengenali kas kosong, margin, konten, follow-up, stok, dan iklan", () => {
  const { api } = createHarness();
  assert.equal(api.findConsultationScenario("Omzet ramai tetapi kas kosong", {}).id, "cash-empty");
  assert.equal(api.findConsultationScenario("Bagaimana menghitung margin dan keuntungan?", {}).id, "margin");
  assert.equal(api.findConsultationScenario("Konten saya banyak views, tetapi order tetap sepi.", {}).id, "content");
  assert.equal(api.findConsultationScenario("Bagaimana follow-up calon pembeli?", {}).id, "follow-up");
  assert.equal(api.findConsultationScenario("Gudang penuh dan stok tidak bergerak", {}).id, "stock");
  assert.equal(api.findConsultationScenario("Iklan Meta Ads boncos, tetapi belum ada pembelian", {}).id, "ads");
});

test("rekomendasi menggunakan skor diagnosis dan arus kas nyata pengguna", () => {
  const { api } = createHarness();
  const snapshot = api.defaultState();
  snapshot.profile = { owner: "Bu Rani", business: "Dapur Bu Rani", type: "Kuliner" };
  snapshot.answers = { "keuangan-0": 0, "keuangan-1": 0, "keuangan-2": 1, "keuangan-3": 0 };
  snapshot.cashflow[0] = { income: 100000, expense: 125000 };

  const result = api.buildConsultation("Kenapa kas kosong padahal omzet ramai?", snapshot);
  assert.equal(result.domainId, "keuangan");
  assert.equal(result.business, "Dapur Bu Rani");
  assert.ok(result.observations.some(item => /5\/12/.test(item)));
  assert.ok(result.observations.some(item => /-Rp25\.000/.test(item)));
  assert.deepEqual(Array.from(result.tools), ["cashflow", "margin", "leaks"]);
});

test("pertanyaan tidak dikenal tidak mengarang diagnosis jika data belum lengkap", () => {
  const { api } = createHarness();
  const snapshot = api.defaultState();
  const result = api.buildConsultation("Saya bingung harus mulai dari mana sekarang", snapshot);
  assert.equal(result.scenarioId, "start-diagnosis");
  assert.equal(result.domainId, "");
  assert.ok(result.tools.includes("diagnosis"));
});

test("pertanyaan umum mengikuti skor medan prioritas yang sudah lengkap", () => {
  const { api } = createHarness();
  const snapshot = api.defaultState();
  snapshot.answers = {
    "operasional-0": 0, "operasional-1": 0, "operasional-2": 0, "operasional-3": 0,
    "keuangan-0": 2, "keuangan-1": 2, "keuangan-2": 2, "keuangan-3": 2
  };
  const result = api.buildConsultation("Saya bingung harus mulai dari mana sekarang", snapshot);
  assert.equal(result.scenarioId, "diagnosis-priority");
  assert.equal(result.domainId, "operasional");
  assert.ok(result.observations.some(item => /4\/12/.test(item)));
});

test("utang, pajak, dan ekspansi diarahkan ke pendamping manusia", () => {
  const { api } = createHarness();
  const snapshot = api.defaultState();
  assert.equal(api.buildConsultation("Apakah saya perlu mengambil pinjaman bank untuk usaha?", snapshot).escalate, true);
  assert.equal(api.buildConsultation("Saya mau buka cabang dan melakukan ekspansi", snapshot).escalate, true);
});

test("konsultasi tampil di beranda, menerima pertanyaan, dan menyimpan riwayat lokal", () => {
  const app = createHarness();
  activate(app);
  assert.match(app.rootElement.innerHTML, /Asisten Strategi Panglima/);

  app.click({ view: "assistant" });
  assert.match(app.rootElement.innerHTML, /tanpa biaya per pertanyaan/i);
  app.submit("consultation-form", { question: "Omzet ramai tetapi kas kosong setiap minggu" });
  assert.match(app.rootElement.innerHTML, /Omzet ramai, kas tetap kosong/);
  assert.match(app.rootElement.innerHTML, /Tiga langkah untuk Dapur Bu Rani/);
  assert.match(app.rootElement.innerHTML, /Riwayat konsultasi/);

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.consultations.length, 1);
  assert.equal(saved.consultations[0].scenarioId, "cash-empty");
});

test("contoh pertanyaan dan pintasan toolkit konsultasi berfungsi", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "assistant" });
  app.click({ example: "0" });
  assert.match(app.rootElement.innerHTML, /Cash Flow 7 Hari/);
  app.click({ recommendation: "cashflow" });
  assert.match(app.rootElement.innerHTML, /Saldo tujuh hari/);
});

test("riwayat konsultasi dibatasi 20 catatan tanpa mengirim data keluar", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "assistant" });
  for (let index = 0; index < 23; index += 1) {
    app.submit("consultation-form", { question: `Kas kosong dan omzet ramai pertanyaan nomor ${index}` });
  }
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.consultations.length, 20);
  assert.match(saved.consultations[0].question, /nomor 3/);
  assert.equal(app.opened.length, 0);
});

test("pembaruan mempertahankan data pengguna dari APK sebelumnya", () => {
  const legacyState = {
    activated: true,
    profile: { owner: "Bu Vita", business: "Azka Prayatna", type: "Jasa" },
    answers: { "keuangan-0": 0, "keuangan-1": 0, "keuangan-2": 1 },
    tasks: { "day-1": true },
    leaks: { "0": true },
    cashflow: Array.from({ length: 7 }, () => ({ income: 0, expense: 0 })),
    kpi: { leads: 4, transactions: 1, revenue: 150000, expense: 50000 },
    actionPlan: { thirty: "Rapikan kas", sixty: "", ninety: "", hotseat: "" }
  };
  const app = createHarness(legacyState);
  assert.match(app.rootElement.innerHTML, /Selamat datang, Bu Vita/);
  assert.match(app.rootElement.innerHTML, /3\/40/);
  app.click({ view: "assistant" });
  app.submit("consultation-form", { question: "Omzet ramai tetapi kas kosong" });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.answers["keuangan-0"], 0);
  assert.equal(saved.answers["keuangan-2"], 1);
  assert.equal(saved.tasks["day-1"], true);
  assert.equal(saved.leaks["0"], true);
  assert.equal(saved.consultations.length, 1);
  assert.deepEqual(Object.keys(saved.workbook.scores), []);
});

test("konsultasi menolak pertanyaan terlalu pendek dan mengamankan input HTML", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "assistant" });
  app.submit("consultation-form", { question: "kas" });
  assert.match(app.document.getElementById("consultation-error").textContent, /minimal 10 karakter/);
  app.submit("consultation-form", { question: '<script>alert("x")</script> kas kosong' });
  assert.match(app.rootElement.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(app.rootElement.innerHTML, /<script>alert/);
});

test("checklist resmi memiliki empat pertanyaan per medan dan kalimat tidak terpotong", () => {
  const { api } = createHarness();
  assert.ok(api.domains.every(domain => domain.questions.length === 4));
  assert.equal(api.domains[0].questions[1], "Pesan pemasaran saya menjelaskan manfaat dan pembeda, bukan hanya harga.");
  const expansion = api.domains.find(domain => domain.id === "ekspansi");
  assert.match(expansion.questions[0], /bukan sekadar mengikuti tren\.$/);
  assert.match(expansion.questions[1], /menanggung pertumbuhan\.$/);
  assert.match(expansion.questions[2], /cabang, atau produk baru\.$/);
});

test("interpretasi checklist resmi mengikuti rentang 4\u20136, 7\u20139, dan 10\u201312", () => {
  const { api } = createHarness();
  assert.equal(api.classifyChecklistScore(4).tone, "red");
  assert.equal(api.classifyChecklistScore(6).label, "Medan rawan");
  assert.equal(api.classifyChecklistScore(7).tone, "yellow");
  assert.equal(api.classifyChecklistScore(9).label, "Perlu diperkuat");
  assert.equal(api.classifyChecklistScore(10).tone, "green");
  assert.equal(api.classifyChecklistScore(12).label, "Relatif kuat");
});

test("workbook resmi memiliki empat pertanyaan, dua latihan, dan skala 1\u20135", () => {
  const { api } = createHarness();
  assert.equal(api.workbookScale.length, 5);
  assert.equal(api.workbookScale[0], "Belum ada");
  assert.equal(api.workbookScale[4], "Terukur dan terus diperbaiki");
  assert.ok(api.workbookModules.every(module => module.questions.length === 4 && module.exercises.length === 2));
  assert.equal(api.workbookModules[0].questions[0], "Target pelanggan utama saya sudah spesifik.");
  assert.equal(api.workbookModules[0].exercises[0].title, "Peta Pasar dan Pelanggan");
  assert.equal(api.workbookModules[9].exercises[1].title, "Rencana Pilot Ekspansi");
});

test("skor workbook hanya lengkap setelah empat penilaian valid 1\u20135", () => {
  const { api } = createHarness();
  const module = api.workbookModules[0];
  const partial = api.scoreWorkbookModule(module, { "pemasaran-0": 5, "pemasaran-1": 2, "pemasaran-2": 0, "pemasaran-3": 6 });
  assert.equal(partial.answered, 2);
  assert.equal(partial.complete, false);
  assert.equal(partial.total, null);

  const complete = api.scoreWorkbookModule(module, { "pemasaran-0": 5, "pemasaran-1": 2, "pemasaran-2": 3, "pemasaran-3": 4 });
  assert.equal(complete.complete, true);
  assert.equal(complete.total, 14);
  assert.equal(complete.percent, 70);
});

test("workbook tersedia di beranda dan toolkit tanpa menambah navigasi baru", () => {
  const app = createHarness();
  activate(app);
  assert.match(app.rootElement.innerHTML, /Buka Workbook Interaktif/);
  app.click({ view: "tools" });
  assert.match(app.rootElement.innerHTML, /\uD83D\uDCD8 Workbook UMKM Naik Kelas/);
  app.click({ view: "workbook" });
  assert.match(app.rootElement.innerHTML, /10 modul workbook resmi/);
  assert.match(app.rootElement.innerHTML, /Sun Tzu Strategy Canvas/);
  assert.match(app.rootElement.innerHTML, /Peta Prioritas 90 Hari/);
  assert.match(app.rootElement.innerHTML, /Roadmap 30 \/ 60 \/ 90 Hari/);
});

test("skor, bukti, latihan, dan keputusan workbook tersimpan di perangkat", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "workbook" });
  app.click({ workbook: "keuangan" });
  assert.match(app.rootElement.innerHTML, /Audit Arus Kas dan Disiplin Keuangan/);
  assert.match(app.rootElement.innerHTML, /Margin Produk atau Layanan/);
  app.click({ workbookScore: "keuangan-0", value: "1" });
  app.click({ workbookScore: "keuangan-1", value: "2" });
  app.click({ workbookScore: "keuangan-2", value: "3" });
  app.click({ workbookScore: "keuangan-3", value: "4" });
  assert.match(app.rootElement.innerHTML, /10\/20/);
  app.change({ workbookField: "keuangan-evidence-0" }, { value: "Rekening usaha masih bercampur." });
  app.change({ workbookField: "keuangan-a-0-0" }, { value: "Rp6.000.000 per bulan" });
  app.change({ workbookField: "keuangan-decision-decision" }, { value: "Pisahkan rekening usaha minggu ini" });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.workbook.scores["keuangan-3"], 4);
  assert.equal(saved.workbook.fields["keuangan-evidence-0"], "Rekening usaha masih bercampur.");
  assert.equal(saved.workbook.fields["keuangan-a-0-0"], "Rp6.000.000 per bulan");
  assert.equal(saved.workbook.fields["keuangan-decision-decision"], "Pisahkan rekening usaha minggu ini");
});

test("asisten menghubungkan diagnosis, skor workbook, titik terlemah, dan keputusan", () => {
  const { api } = createHarness();
  const snapshot = api.defaultState();
  snapshot.answers = { "keuangan-0": 0, "keuangan-1": 1, "keuangan-2": 0, "keuangan-3": 1 };
  snapshot.workbook.scores = { "keuangan-0": 1, "keuangan-1": 2, "keuangan-2": 3, "keuangan-3": 4 };
  snapshot.workbook.fields["keuangan-decision-decision"] = "Pisahkan rekening pribadi dan usaha";
  const result = api.buildConsultation("Kenapa kas usaha selalu kosong?", snapshot);
  assert.equal(result.workbookModule, "keuangan");
  assert.ok(result.observations.some(item => /6\/12/.test(item)));
  assert.ok(result.observations.some(item => /10\/20/.test(item)));
  assert.ok(result.observations.some(item => /Keuangan pribadi dan bisnis sudah dipisahkan/.test(item)));
  assert.ok(result.observations.some(item => /Pisahkan rekening pribadi dan usaha/.test(item)));
});

test("hasil konsultasi membuka modul workbook yang sesuai", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "assistant" });
  app.submit("consultation-form", { question: "Omzet ramai tetapi kas kosong setiap minggu" });
  assert.match(app.rootElement.innerHTML, /Buka Workbook Keuangan/);
  app.click({ workbook: "keuangan" });
  assert.match(app.rootElement.innerHTML, /Modul 4 \u00B7 Keuangan/);
});

test("prioritas workbook dibatasi maksimal tiga dan disimpan lokal", () => {
  const app = createHarness();
  activate(app);
  app.click({ workbook: "priorities" });
  app.click({ workbookPriority: "keuangan" });
  app.click({ workbookPriority: "pemasaran" });
  app.click({ workbookPriority: "operasional" });
  app.click({ workbookPriority: "penjualan" });
  let saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.deepEqual(saved.workbook.priorities, ["keuangan", "pemasaran", "operasional"]);
  assert.match(app.toastElement.textContent, /maksimal tiga prioritas/);
  app.click({ workbookPriority: "pemasaran" });
  app.click({ workbookPriority: "penjualan" });
  saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.deepEqual(saved.workbook.priorities, ["keuangan", "operasional", "penjualan"]);
});

test("saran prioritas workbook mengikuti tiga medan diagnosis terlemah", () => {
  const { api } = createHarness();
  const snapshot = api.defaultState();
  snapshot.answers = {
    "keuangan-0": 0, "keuangan-1": 0, "keuangan-2": 0, "keuangan-3": 0,
    "penjualan-0": 0, "penjualan-1": 0, "penjualan-2": 1, "penjualan-3": 0,
    "produksi-0": 1, "produksi-1": 0, "produksi-2": 1, "produksi-3": 0,
    "digital-0": 2, "digital-1": 2, "digital-2": 2, "digital-3": 2
  };
  assert.deepEqual(Array.from(api.selectedWorkbookPriorities(snapshot)), ["keuangan", "penjualan", "produksi"]);
  snapshot.workbook.priorities = ["digital"];
  assert.deepEqual(Array.from(api.selectedWorkbookPriorities(snapshot)), ["digital"]);
});

test("strategy canvas dan roadmap menyimpan data tanpa mengubah action plan lama", () => {
  const app = createHarness();
  activate(app);
  app.click({ workbook: "canvas" });
  assert.match(app.rootElement.innerHTML, /Keterkaitan antar-area/);
  app.change({ workbookField: "canvas-pemasaran" }, { value: "Fokus pelanggan pekerja kantoran" });
  app.change({ workbookField: "canvas-connections" }, { value: "Promosi harus sesuai kapasitas produksi" });
  app.click({ workbook: "roadmap" });
  assert.match(app.rootElement.innerHTML, /Hari 1\u201330/);
  app.change({ workbookField: "roadmap-thirty-outcome" }, { value: "Kas tercatat setiap hari" });
  app.change({ workbookField: "resource-budget-gap" }, { value: "Perlu anggaran Rp500.000" });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.workbook.fields["canvas-pemasaran"], "Fokus pelanggan pekerja kantoran");
  assert.equal(saved.workbook.fields["roadmap-thirty-outcome"], "Kas tercatat setiap hari");
  assert.equal(saved.actionPlan.thirty, "");
});

test("audit awal dan akhir menghitung skor maksimal 50 berdasarkan bukti", () => {
  const app = createHarness();
  activate(app);
  app.click({ workbook: "audit" });
  app.change({ workbookField: "audit-start-keuangan" }, { value: "2" });
  app.change({ workbookField: "audit-final-keuangan" }, { value: "4" });
  app.change({ workbookField: "audit-evidence-keuangan" }, { value: "Kas kini dicatat setiap hari" });
  assert.match(app.rootElement.innerHTML, /2\/50/);
  assert.match(app.rootElement.innerHTML, /4\/50/);
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.workbook.fields["audit-evidence-keuangan"], "Kas kini dicatat setiap hari");
});

test("action plan workbook memakai status misi yang sudah stabil dan mendukung 4 minggu", () => {
  const app = createHarness();
  activate(app);
  app.click({ workbook: "action30" });
  assert.match(app.rootElement.innerHTML, /Hari 1 \u00B7 Lengkapi profil usaha/);
  app.change({ workbookField: "day-1-output" }, { value: "Profil dan target usaha tercatat" });
  app.change({ task: "day-1" }, { checked: true });
  assert.match(app.rootElement.innerHTML, /1 dari 30 aksi selesai/);
  app.click({ workbookWeek: "4" });
  assert.match(app.rootElement.innerHTML, /Hari 30 \u00B7 Buat laporan perjalanan/);
  app.change({ workbookField: "day-30-notes" }, { value: "Siap dibahas saat pendampingan" });
  app.click({ view: "actions" });
  assert.match(app.rootElement.innerHTML, /1 dari 30 misi selesai/);
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.tasks["day-1"], true);
  assert.equal(saved.workbook.fields["day-30-notes"], "Siap dibahas saat pendampingan");
});

test("review mingguan dan deklarasi eksekusi menyimpan isian pengguna", () => {
  const app = createHarness();
  activate(app);
  app.click({ workbook: "reviews" });
  assert.match(app.rootElement.innerHTML, /Minggu 4/);
  app.change({ workbookField: "review-1-target" }, { value: "20 prospek" });
  app.change({ workbookField: "review-1-decision" }, { value: "perbaiki" });
  app.click({ workbook: "declaration" });
  assert.match(app.rootElement.innerHTML, /Selesai mengisi bukan akhir/);
  app.change({ workbookField: "declaration-actions" }, { value: "Pisahkan kas, hitung margin, follow-up prospek" });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.workbook.fields["review-1-target"], "20 prospek");
  assert.equal(saved.workbook.fields["review-1-decision"], "perbaiki");
  assert.match(saved.workbook.fields["declaration-actions"], /hitung margin/);
});

test("workbook mengamankan HTML dan menolak skor, kunci, atau prioritas tidak valid", () => {
  const app = createHarness();
  activate(app);
  app.click({ workbook: "pemasaran" });
  app.change({ workbookField: "pemasaran-evidence-0" }, { value: '<script>alert("x")</script>' });
  app.click({ workbook: "pemasaran" });
  assert.match(app.rootElement.innerHTML, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(app.rootElement.innerHTML, /<script>alert/);
  app.click({ workbookScore: "pemasaran-0", value: "6" });
  app.change({ workbookField: "<script>" }, { value: "bahaya" });
  app.click({ workbookPriority: "tidak-ada" });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.workbook.scores["pemasaran-0"], undefined);
  assert.equal(saved.workbook.fields["<script>"], undefined);
  assert.deepEqual(saved.workbook.priorities, []);
});

test("tombol kembali Android menutup modul workbook sebelum kembali ke beranda", () => {
  const app = createHarness();
  activate(app);
  app.click({ workbook: "produksi" });
  assert.match(app.rootElement.innerHTML, /Modul 7 \u00B7 Produksi/);
  assert.equal(app.window.panglimaBack(), true);
  assert.match(app.rootElement.innerHTML, /10 modul workbook resmi/);
  assert.equal(app.window.panglimaBack(), true);
  assert.match(app.rootElement.innerHTML, /Selamat datang, Bu Rani/);
});

test("progres workbook menghitung penilaian, modul, dan isian nyata secara terpisah", () => {
  const { api } = createHarness();
  const snapshot = api.defaultState();
  snapshot.workbook.scores = { "pemasaran-0": 1, "pemasaran-1": 2, "pemasaran-2": 3, "pemasaran-3": 4, "keuangan-0": 5 };
  snapshot.workbook.fields = { goal: "Usaha lebih sehat", kosong: "  ", "pemasaran-evidence-0": "Data penjualan 30 hari" };
  const progress = api.workbookProgress(snapshot);
  assert.equal(progress.answered, 5);
  assert.equal(progress.total, 40);
  assert.equal(progress.completed, 1);
  assert.equal(progress.modules, 10);
  assert.equal(progress.fields, 2);
});

test("migrasi workbook membatasi prioritas duplikat dan mempertahankan fitur lama", () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Rio", business: "Maquina Art Course" },
    tasks: { "day-3": true },
    workbook: { scores: { "digital-0": 4 }, fields: { goal: "Kelas bertumbuh" }, priorities: ["digital", "digital", "tidak-ada", "keuangan", "pemasaran", "penjualan"] }
  });
  app.click({ workbook: "priorities" });
  assert.match(app.rootElement.innerHTML, /3\/3 prioritas dipilih/);
  app.change({ workbookField: "priority-digital-risk" }, { value: "Jaga biaya iklan" });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.deepEqual(saved.workbook.priorities, ["digital", "keuangan", "pemasaran"]);
  assert.equal(saved.tasks["day-3"], true);
  assert.equal(saved.workbook.scores["digital-0"], 4);
});

test("pendamping buku memetakan 10 bab New Edition tanpa menyalin isi penuh", () => {
  const { api } = createHarness();
  assert.equal(api.bookGuides.length, 10);
  assert.equal(api.bookReadingSteps.length, 4);
  assert.deepEqual(Array.from(api.bookGuides, guide => guide.chapter), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(Array.from(api.bookGuides, guide => guide.id), Array.from(api.domains, domain => domain.id));
  assert.ok(api.bookGuides.every(guide => guide.pages && guide.strategy && guide.story && guide.principle));
  assert.ok(api.bookGuides.every(guide => guide.prompts.length === 2 && guide.checklist.length === 3));
  assert.ok(api.bookGuides.every(guide => guide.story.length < 320));
  assert.equal(api.bookGuides[0].pages, "4-9");
  assert.equal(api.bookGuides[9].pages, "496-501");
});

test("pendamping baca buku tersedia di beranda dan toolkit", () => {
  const app = createHarness();
  activate(app);
  assert.match(app.rootElement.innerHTML, /Pendamping Baca Buku/);
  assert.match(app.rootElement.innerHTML, /Buku fisik New Edition/);
  app.click({ view: "tools" });
  assert.match(app.rootElement.innerHTML, /10 bab New Edition/);
  app.click({ book: "overview" });
  assert.match(app.rootElement.innerHTML, /Buku fisik tetap menjadi sumber utama/);
  assert.match(app.rootElement.innerHTML, /10 bab New Edition/);
});

test("rekomendasi bab buku mengikuti medan diagnosis terlemah", () => {
  const { api } = createHarness();
  const snapshot = api.defaultState();
  snapshot.answers = {
    "keuangan-0": 0, "keuangan-1": 0, "keuangan-2": 0, "keuangan-3": 0,
    "pemasaran-0": 2, "pemasaran-1": 2, "pemasaran-2": 2, "pemasaran-3": 2
  };
  const guide = api.recommendedBookGuide(snapshot);
  assert.equal(guide.id, "keuangan");
  assert.equal(guide.chapter, 4);
  assert.equal(guide.strategy, "Perang Panjang Menghancurkan Logistik");
});

test("panduan bab meminta peserta membuka buku, refleksi, checklist, dan workbook", () => {
  const app = createHarness();
  activate(app);
  app.click({ book: "keuangan" });
  assert.match(app.rootElement.innerHTML, /Sekarang ambil buku fisik Anda/);
  assert.match(app.rootElement.innerHTML, /Buka halaman 174-178/);
  assert.match(app.rootElement.innerHTML, /Ringkasan kisah strategi/);
  assert.match(app.rootElement.innerHTML, /Refleksi Diri langsung di buku/);
  assert.match(app.rootElement.innerHTML, /Checklist pendamping baca/);
  assert.match(app.rootElement.innerHTML, /Lanjut ke Workbook Keuangan/);
});

test("progres baca, refleksi, dan checklist buku disimpan lokal dengan aman", () => {
  const app = createHarness();
  activate(app);
  app.click({ book: "pemasaran" });
  app.change({ bookCheck: "pemasaran-0" }, { checked: true });
  app.change({ bookCheck: "pemasaran-1" }, { checked: true });
  app.change({ bookReflection: "pemasaran-0" }, { value: '<script>alert("x")</script> pembeda saya adalah layanan cepat' });
  app.click({ book: "pemasaran" });
  assert.match(app.rootElement.innerHTML, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(app.rootElement.innerHTML, /<script>alert/);

  app.change({ bookCheck: "pemasaran-99" }, { checked: true });
  app.change({ bookReflection: "pemasaran-99" }, { value: "tidak valid" });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.book.checks["pemasaran-0"], true);
  assert.equal(saved.book.checks["pemasaran-1"], true);
  assert.match(saved.book.reflections["pemasaran-0"], /layanan cepat/);
  assert.equal(saved.book.checks["pemasaran-99"], undefined);
  assert.equal(saved.book.reflections["pemasaran-99"], undefined);
});

test("progres buku menghitung 70 langkah, 10 bab, dan 20 refleksi", () => {
  const { api } = createHarness();
  const snapshot = api.defaultState();
  for (let index = 0; index < 7; index += 1) snapshot.book.checks["pemasaran-" + index] = true;
  snapshot.book.reflections["pemasaran-0"] = "Pembeda utama sudah jelas";
  const progress = api.bookProgress(snapshot);
  assert.equal(progress.completed, 7);
  assert.equal(progress.total, 70);
  assert.equal(progress.chapters, 1);
  assert.equal(progress.reflections, 1);
  assert.equal(progress.percent, 10);
});

test("asisten mengarahkan hasil konsultasi ke halaman buku yang relevan", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "assistant" });
  app.submit("consultation-form", { question: "Omzet ramai tetapi kas kosong setiap minggu" });
  assert.match(app.rootElement.innerHTML, /Buka buku fisik:/);
  assert.match(app.rootElement.innerHTML, /Bab 4 Keuangan/);
  assert.match(app.rootElement.innerHTML, /hlm. 174-178/);
  assert.match(app.rootElement.innerHTML, /Buka Insight Buku/);
  app.click({ book: "keuangan" });
  assert.match(app.rootElement.innerHTML, /Perang Panjang Menghancurkan Logistik/);
});

test("migrasi APK lama menambahkan progres buku tanpa mengubah data stabil", () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Nina", business: "Warung Nina" },
    answers: { "keuangan-0": 0 },
    tasks: { "day-1": true },
    workbook: { scores: { "keuangan-0": 2 }, fields: {}, priorities: [] }
  });
  app.click({ book: "keuangan" });
  app.change({ bookCheck: "keuangan-0" }, { checked: true });
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.book.checks["keuangan-0"], true);
  assert.equal(saved.answers["keuangan-0"], 0);
  assert.equal(saved.tasks["day-1"], true);
  assert.equal(saved.workbook.scores["keuangan-0"], 2);
});

test("tombol kembali Android menutup panduan bab sebelum kembali ke beranda", () => {
  const app = createHarness();
  activate(app);
  app.click({ book: "produksi" });
  assert.match(app.rootElement.innerHTML, /Bab 7 \u00B7 Produksi/);
  assert.equal(app.window.panglimaBack(), true);
  assert.match(app.rootElement.innerHTML, /10 bab New Edition/);
  assert.equal(app.window.panglimaBack(), true);
  assert.match(app.rootElement.innerHTML, /Selamat datang, Bu Rani/);
});

test("aktivasi online memakai kode peserta dan identitas resmi dari Worker terpisah", async () => {
  const app = createHarness(null, { activationMode: "cloudflare", nativeBridge: true });
  assert.match(app.rootElement.innerHTML, /Aktivasi peserta online/);
  assert.doesNotMatch(app.rootElement.innerHTML, /PANGLIMA-DEMO/);
  assert.doesNotMatch(app.rootElement.innerHTML, /<input[^>]+name="owner"/);
  assert.doesNotMatch(app.rootElement.innerHTML, /<input[^>]+name="business"/);
  assert.doesNotMatch(app.rootElement.innerHTML, /<input[^>]+name="type"/);

  app.submit("activation-form", {
    owner: "Nama Input",
    business: "Nama Usaha Input",
    type: "Kuliner",
    activationCode: "panglima-rani-2026"
  });

  assert.equal(app.apiCalls.length, 1);
  assert.equal(app.apiCalls[0].endpoint, "/v1/activate");
  assert.equal(app.apiCalls[0].payload.accessCode, "PANGLIMA-RANI-2026");
  app.respondApi(0, 200, {
    ok: true,
    sessionToken: "session-token-rani",
    participant: { owner: "Bu Rani", business: "Dapur Bu Rani", type: "Kuliner PRE-TEST", profileSource: "pretest", deviceBound: true, dailyLimit: 3, remainingToday: 2 }
  });
  await settleApi();

  assert.match(app.rootElement.innerHTML, /Selamat datang, Bu Rani/);
  assert.match(app.rootElement.innerHTML, /AI online - sisa 2\/3 hari ini/);
  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.online.sessionToken, "session-token-rani");
  assert.equal(saved.online.dailyLimit, 3);
  assert.equal(saved.profile.business, "Dapur Bu Rani");
  assert.equal(saved.profile.type, "Kuliner PRE-TEST");
  assert.equal(saved.online.profileSource, "pretest");
  assert.equal(saved.online.deviceBound, true);
});

test("aktivasi varian menampilkan dan membuka hanya modul entitlement", async () => {
  const app = createHarness(null, { activationMode: "cloudflare", nativeBridge: true });
  app.submit("activation-form", { activationCode: "PANGLIMA-PROPERTY-2026" });
  app.respondApi(0, 200, {
    ok: true,
    sessionToken: "session-token-property",
    participant: {
      owner: "Agen Rani",
      business: "Rani Properti",
      profileSource: "pretest",
      deviceBound: true,
      dailyLimit: 3,
      remainingToday: 3,
      module: { code: "property", title: "Modul Agen Properti" }
    }
  });
  await settleApi();

  assert.match(app.rootElement.innerHTML, /Varian pembelian aktif/);
  assert.match(app.rootElement.innerHTML, /Modul Agen Properti/);
  assert.doesNotMatch(app.rootElement.innerHTML, /Modul Agen Asuransi|Modul Mitra MLM/);
  assert.doesNotMatch(app.rootElement.innerHTML, /Buka Workbook Interaktif/);
  app.click({ action: "open-specialist-module" });
  assert.deepEqual(app.moduleOpens, [{
    moduleCode: "property",
    sessionToken: "session-token-property"
  }]);
  app.click({ view: "workbook" });
  app.click({ workbook: "overview" });
  assert.equal(app.moduleOpens.length, 3);
  assert.doesNotMatch(app.rootElement.innerHTML, /10 modul workbook resmi/);

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.online.moduleCode, "property");
  assert.equal(saved.online.moduleTitle, "Modul Agen Properti");
});

test("APK meminta token memakai email pembelian dan tetap memisahkan aktivasi lama", async () => {
  const app = createHarness(null, { activationMode: "cloudflare", nativeBridge: true });
  assert.match(app.rootElement.innerHTML, /Belum menerima token\?/);
  assert.match(app.rootElement.innerHTML, /id="token-request-form"/);
  assert.match(app.rootElement.innerHTML, /Kirim Token ke Email/);

  app.submit("token-request-form", { email: "Email Salah" });
  assert.equal(app.apiCalls.length, 0);
  assert.match(app.document.getElementById("token-request-message").textContent, /email pembelian yang valid/);

  app.submit("token-request-form", { email: "  user_6a6c2619@example.invalid " });
  assert.equal(app.apiCalls.length, 1);
  assert.equal(app.apiCalls[0].endpoint, "/v1/onboarding/request-token");
  assert.deepEqual(app.apiCalls[0].payload, { email: "buyer@example.com" });
  app.respondApi(0, 202, {
    ok: true,
    status: "REQUEST_ACCEPTED",
    message: "Jika email pembelian dan PRE-TEST cocok, token akan dikirim ke email maksimal 5 menit."
  });
  await settleApi();

  assert.match(app.rootElement.innerHTML, /token akan dikirim ke email maksimal 5 menit/);
  assert.match(app.rootElement.innerHTML, /Aktivasi pendampingan/);
  assert.equal(app.storage.size, 0);

  app.click({ action: "open-pretest" });
  assert.equal(
    app.opened.at(-1),
    "https://docs.google.com/forms/d/e/1FAIpQLSfU-jJ7ZfOeA_x2GQXIKdxS9fm4dM7aFoRKsN0Hu-97f62jJg/viewform"
  );
});

test("profil PRE-TEST diisi otomatis dan input pengguna tidak dapat menimpa identitas resmi", async () => {
  const app = createHarness(null, { activationMode: "cloudflare", nativeBridge: true });
  app.submit("activation-form", {
    owner: "Orang Lain",
    business: "Usaha Bukan Peserta",
    type: "Jenis Palsu",
    activationCode: "PANGLIMA-RIO-2026"
  });
  app.respondApi(0, 200, {
    ok: true,
    sessionToken: "session-token-rio",
    participant: { owner: "Rio", business: "Maquina Art Course", type: "Les menggambar", profileSource: "pretest", deviceBound: true, dailyLimit: 3, remainingToday: 3 }
  });
  await settleApi();

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.deepEqual(saved.profile, { owner: "Rio", business: "Maquina Art Course", type: "Les menggambar", goal: "" });
  app.click({ view: "account" });
  assert.match(app.rootElement.innerHTML, /Profil PRE-TEST terkunci/);
  assert.match(app.rootElement.innerHTML, /terkunci pada perangkat ini/);
  assert.doesNotMatch(app.rootElement.innerHTML, /Orang Lain|Usaha Bukan Peserta|Jenis Palsu/);
});

test("aktivasi online cukup memakai kode akses tanpa mengisi profil manual", async () => {
  const app = createHarness(null, { activationMode: "cloudflare", nativeBridge: true });
  app.submit("activation-form", { activationCode: "PANGLIMA-VITA-2026" });
  assert.equal(app.apiCalls.length, 1);
  app.respondApi(0, 200, {
    ok: true,
    sessionToken: "session-token-vita",
    participant: { owner: "Vita", business: "Azka Prayatna", type: "Jasa Event Organizer", profileSource: "pretest", deviceBound: true, dailyLimit: 3, remainingToday: 3 }
  });
  await settleApi();
  assert.match(app.rootElement.innerHTML, /Selamat datang, Vita/);
});

test("aktivasi menolak perangkat kedua dan tidak menyimpan sesi peserta", async () => {
  const app = createHarness(null, { activationMode: "cloudflare", nativeBridge: true });
  app.submit("activation-form", { activationCode: "PANGLIMA-AMEL-2026" });
  app.respondApi(0, 403, {
    ok: false,
    code: "DEVICE_LOCKED",
    message: "Kode peserta sudah terikat pada perangkat lain. Hubungi pendamping."
  });
  await settleApi();
  assert.equal(app.storage.size, 0);
  assert.match(app.document.getElementById("activation-error").textContent, /perangkat lain/);
});

test("aktivasi gagal aman ketika server tidak mengirim profil resmi", async () => {
  const app = createHarness(null, { activationMode: "cloudflare", nativeBridge: true });
  app.submit("activation-form", { activationCode: "PANGLIMA-TEST-2026" });
  app.respondApi(0, 200, { ok: true, sessionToken: "session-token", participant: {} });
  await settleApi();
  assert.equal(app.storage.size, 0);
  assert.match(app.document.getElementById("activation-error").textContent, /Profil resmi peserta/);
});

test("aktivasi online menolak kode tidak valid dan tidak menerima bypass demo lokal", async () => {
  const app = createHarness(null, { activationMode: "cloudflare", nativeBridge: true });
  app.submit("activation-form", {
    owner: "Bu Rani",
    business: "Dapur Bu Rani",
    activationCode: "SALAH"
  });
  assert.equal(app.apiCalls.length, 0);
  assert.match(app.document.getElementById("activation-error").textContent, /belum sesuai/);

  app.submit("activation-form", {
    owner: "Bu Rani",
    business: "Dapur Bu Rani",
    activationCode: "PANGLIMA-DEMO"
  });
  assert.equal(app.apiCalls.length, 1);
  app.respondApi(0, 401, {
    ok: false,
    code: "INVALID_CODE",
    message: "Kode akses belum sesuai atau belum aktif."
  });
  await settleApi();

  assert.match(app.rootElement.innerHTML, /Aktivasi pendampingan/);
  assert.match(app.document.getElementById("activation-error").textContent, /belum aktif/);
  assert.equal(app.storage.size, 0);
});

test("aktivasi online tanpa bridge Android gagal aman tanpa membuka akses universal WebView", async () => {
  const app = createHarness(null, { activationMode: "cloudflare" });
  app.submit("activation-form", {
    owner: "Bu Rani",
    business: "Dapur Bu Rani",
    activationCode: "PANGLIMA-RANI-2026"
  });
  await settleApi();
  assert.match(app.document.getElementById("activation-error").textContent, /belum tersedia/);
  assert.equal(app.storage.size, 0);
});

test("AI online menerima konteks diagnosis, menyimpan jawaban, dan memperbarui kuota", async () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Bu Rani", business: "Dapur Bu Rani", type: "Kuliner" },
    online: { sessionToken: "session-token-rani", dailyLimit: 3, remainingToday: 3 },
    answers: { "keuangan-0": 0, "keuangan-1": 0, "keuangan-2": 1, "keuangan-3": 0 },
    cashflow: Array.from({ length: 7 }, (_, index) => ({
      income: index === 0 ? 150000 : 0,
      expense: index === 0 ? 175000 : 0
    })),
    kpi: { leads: 20, transactions: 4, revenue: 600000, expense: 450000 }
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.click({ view: "assistant" });
  assert.match(app.rootElement.innerHTML, /Konsultasi AI Panglima/);
  app.submit("consultation-form", { question: "Omzet ramai tetapi kas kosong setiap minggu" });

  assert.equal(app.apiCalls.length, 1);
  assert.equal(app.apiCalls[0].endpoint, "/v1/consultation");
  assert.equal(app.apiCalls[0].payload.sessionToken, "session-token-rani");
  assert.equal(app.apiCalls[0].payload.context.profile.business, "Dapur Bu Rani");
  assert.equal(app.apiCalls[0].payload.context.cashflow.balance, -25000);
  assert.equal(app.apiCalls[0].payload.context.priorities[0].name, "Keuangan");
  app.respondApi(0, 200, {
    ok: true,
    result: {
      title: "Audit Arus Kas Dapur Bu Rani",
      insight: "Pisahkan kas usaha dari uang pribadi sebelum menambah promosi.",
      actions: ["Catat arus kas tujuh hari", "Audit margin produk", "Tinjau biaya operasional"],
      reflection: "Pengeluaran mana yang paling sering luput dicatat?"
    },
    quota: { dailyLimit: 3, remainingToday: 2 }
  });
  await settleApi();

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.consultations.length, 1);
  assert.equal(saved.consultations[0].source, "ai-online");
  assert.equal(saved.consultations[0].title, "Audit Arus Kas Dapur Bu Rani");
  assert.equal(saved.online.remainingToday, 2);
  assert.match(app.rootElement.innerHTML, /Konsultan AI Panglima/);
  assert.match(app.rootElement.innerHTML, /Jawaban dibuat oleh model AI online/);
  assert.match(app.rootElement.innerHTML, /AI online/);
  assert.match(app.rootElement.innerHTML, /Refleksi AI/);
});

test("kegagalan AI online tetap memberikan panduan offline tanpa mengubah data usaha", async () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Bu Rani", business: "Dapur Bu Rani" },
    online: { sessionToken: "session-token-rani", dailyLimit: 3, remainingToday: 3 },
    answers: { "keuangan-0": 0, "keuangan-1": 0, "keuangan-2": 1, "keuangan-3": 0 },
    tasks: { "day-1": true }
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.click({ view: "assistant" });
  app.submit("consultation-form", { question: "Omzet ramai tetapi kas kosong setiap minggu" });
  app.respondApi(0, 503, {
    ok: false,
    code: "AI_UNAVAILABLE",
    message: "AI online sedang tidak tersedia."
  });
  await settleApi();

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.consultations[0].source, "offline");
  assert.equal(saved.consultations[0].scenarioId, "cash-empty");
  assert.equal(saved.tasks["day-1"], true);
  assert.match(app.rootElement.innerHTML, /Panduan Offline Otomatis/);
  assert.match(app.rootElement.innerHTML, /bukan jawaban AI online/);
  assert.match(app.rootElement.innerHTML, /Panduan offline/);
  assert.match(app.toastElement.textContent, /Panduan offline ditampilkan/);
});

test("batas kuota AI memakai fallback offline dan menampilkan sisa nol", async () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Bu Rani", business: "Dapur Bu Rani" },
    online: { sessionToken: "session-token-rani", dailyLimit: 3, remainingToday: 1 }
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.click({ view: "assistant" });
  app.submit("consultation-form", { question: "Bagaimana memperbaiki margin produk utama?" });
  app.respondApi(0, 429, {
    ok: false,
    code: "DAILY_LIMIT",
    message: "Jatah konsultasi AI hari ini sudah digunakan."
  });
  await settleApi();

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.online.remainingToday, 0);
  assert.equal(saved.consultations[0].source, "offline");
  assert.match(app.rootElement.innerHTML, /sisa 0\/3 konsultasi hari ini/);
});

test("sesi online kedaluwarsa meminta aktivasi ulang sambil mempertahankan progres", async () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Bu Rani", business: "Dapur Bu Rani" },
    online: { sessionToken: "session-token-rani", dailyLimit: 3, remainingToday: 1 },
    answers: { "keuangan-0": 0 },
    tasks: { "day-1": true }
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.click({ view: "assistant" });
  app.submit("consultation-form", { question: "Bagaimana memperbaiki arus kas usaha?" });
  app.respondApi(0, 401, {
    ok: false,
    code: "SESSION_EXPIRED",
    message: "Sesi konsultasi berakhir. Aktifkan kembali kode akses."
  });
  await settleApi();

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.activated, false);
  assert.equal(saved.online.sessionToken, "");
  assert.equal(saved.answers["keuangan-0"], 0);
  assert.equal(saved.tasks["day-1"], true);
  assert.match(app.rootElement.innerHTML, /Aktivasi pendampingan/);
  assert.match(app.document.getElementById("activation-error").textContent, /Aktifkan kembali/);
});

test("sesi yang dipindahkan ke perangkat lain langsung mengunci akses aplikasi", async () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Rio", business: "Maquina Art Course", sector: "Les menggambar" },
    online: { sessionToken: "session-token-rio", dailyLimit: 3, remainingToday: 2 },
    tasks: { "day-1": true }
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.click({ view: "assistant" });
  app.submit("consultation-form", { question: "Bagaimana menambah peserta les menggambar?" });
  app.respondApi(0, 403, {
    ok: false,
    code: "DEVICE_LOCKED",
    message: "Kode peserta sudah terikat pada perangkat lain. Hubungi pendamping."
  });
  await settleApi();

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.activated, false);
  assert.equal(saved.online.sessionToken, "");
  assert.equal(saved.tasks["day-1"], true);
  assert.match(app.rootElement.innerHTML, /Aktivasi pendampingan/);
  assert.match(app.document.getElementById("activation-error").textContent, /perangkat lain/);
});

test("data demo lama tidak otomatis memperoleh akses AI online tanpa token peserta", () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Bu Rani", business: "Dapur Bu Rani" },
    answers: { "keuangan-0": 0 }
  }, { activationMode: "cloudflare", nativeBridge: true });

  assert.match(app.rootElement.innerHTML, /Aktivasi pendampingan/);
  assert.doesNotMatch(app.rootElement.innerHTML, /Selamat datang, Bu Rani/);
  assert.equal(app.apiCalls.length, 0);
});


test("kelayakan sertifikat otomatis dikirim dengan tanggal server dan tetap menunggu mentor", async () => {
  const metadata = createHarness().api;
  const answers = {};
  metadata.domains.forEach(domain => {
    domain.questions.forEach((_, index) => { answers[domain.id + "-" + index] = 1; });
  });
  const tasks = {};
  metadata.tasks.slice(0, 23).forEach(task => { tasks[task.id] = true; });

  const app = createHarness({
    activated: true,
    profile: { owner: "Rio", business: "Maquina Art Course", type: "Les menggambar" },
    online: { sessionToken: "session-token-rio", dailyLimit: 3, remainingToday: 2, profileSource: "pretest", deviceBound: true },
    answers,
    tasks
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.change({ task: metadata.tasks[23].id }, { checked: true });
  assert.equal(app.apiCalls.length, 1);
  assert.equal(app.apiCalls[0].endpoint, "/v1/completion");
  assert.equal(app.apiCalls[0].payload.sessionToken, "session-token-rio");
  assert.deepEqual(app.apiCalls[0].payload.diagnosis, { answered: 40, total: 40 });
  assert.deepEqual(app.apiCalls[0].payload.actions, { completed: 24, total: 30 });

  app.respondApi(0, 200, {
    ok: true,
    certificate: {
      status: "pending",
      completionDate: "2026-08-24",
      submittedAt: "2026-08-24T04:00:00.000Z",
      verifiedAt: null,
      dispatched: false
    }
  });
  await settleApi();

  const saved = JSON.parse(app.storage.get("panglima-umkm-safe-v1"));
  assert.equal(saved.certificate.status, "pending");
  assert.equal(saved.certificate.completionDate, "2026-08-24");
  app.click({ view: "account" });
  assert.match(app.rootElement.innerHTML, /Menunggu verifikasi/);
  assert.match(app.rootElement.innerHTML, /2026-08-24/);
  assert.match(app.rootElement.innerHTML, /Periksa Status/);
});

test("sertifikat terverifikasi dapat dicari dan PDF dibuka di luar APK", async () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Rio", business: "Maquina Art Course", type: "Les menggambar" },
    online: { sessionToken: "session-token-rio", dailyLimit: 3, remainingToday: 2, profileSource: "pretest", deviceBound: true },
    certificate: {
      status: "verified",
      completionDate: "2026-08-24",
      submittedAt: "2026-08-24T04:00:00.000Z",
      verifiedAt: "2026-08-24T05:00:00.000Z"
    }
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.click({ view: "account" });
  assert.match(app.rootElement.innerHTML, /Periksa & Unduh Sertifikat/);
  app.click({ action: "download-certificate" });
  assert.equal(app.apiCalls.length, 1);
  assert.equal(app.apiCalls[0].endpoint, "/v1/certificate");
  assert.equal(app.apiCalls[0].payload.sessionToken, "session-token-rio");

  const pdfUrl = "https://cdn.certifier.io/previews/panglima-certificate.pdf";
  app.respondApi(0, 200, {
    ok: true,
    certificate: { status: "issued", url: pdfUrl, publicId: "65b8cc52-7f56-4439-8e3a-d56f2d67ec9b", format: "pdf" }
  });
  await settleApi();

  assert.deepEqual(app.opened, [pdfUrl]);
  assert.match(app.rootElement.innerHTML, /Unduh Sertifikat/);
  assert.equal(JSON.parse(app.storage.get("panglima-umkm-safe-v1")).certificate.url, pdfUrl);
});

test("jawaban AI online di-escape sebelum ditampilkan ke WebView", async () => {
  const app = createHarness({
    activated: true,
    profile: { owner: "Bu Rani", business: "Dapur Bu Rani" },
    online: { sessionToken: "session-token-rani", dailyLimit: 3, remainingToday: 3 }
  }, { activationMode: "cloudflare", nativeBridge: true });

  app.click({ view: "assistant" });
  app.submit("consultation-form", { question: "Bagaimana menambah penjualan tanpa diskon?" });
  app.respondApi(0, 200, {
    ok: true,
    result: {
      title: "<script>alert(1)</script>",
      insight: "<img src=x onerror=alert(1)>",
      actions: ["<b>Audit margin</b>"]
    },
    quota: { dailyLimit: 3, remainingToday: 2 }
  });
  await settleApi();

  assert.match(app.rootElement.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(app.rootElement.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(app.rootElement.innerHTML, /<script>alert\(1\)<\/script>/);
});
