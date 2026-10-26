"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const assets = path.join(root, "app", "src", "main", "assets");

function createHarness() {
  const storage = new Map();
  const listeners = new Map();
  const opened = [];
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
    confirm() { return true; },
    open(url) { opened.push(url); }
  };

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

  return { api: window.PANGLIMA_TEST_API, window, document, storage, listeners, rootElement, toastElement, opened, submit, click, change };
}

function activate(app) {
  app.submit("activation-form", {
    owner: "Bu Rani",
    business: "Dapur Bu Rani",
    type: "Kuliner",
    activationCode: "PANGLIMA-DEMO"
  });
}

test("konten fase SAFE memiliki 10 medan, 30 misi, dan 17 kebocoran", () => {
  const { api } = createHarness();
  assert.equal(api.domains.length, 10);
  assert.equal(api.tasks.length, 30);
  assert.equal(api.leaks.length, 17);
  assert.equal(api.domains.reduce((total, item) => total + item.questions.length, 0), 30);
});

test("skor diagnosis tidak diterbitkan sebelum seluruh pertanyaan medan terjawab", () => {
  const { api } = createHarness();
  const domain = api.domains[0];
  const partial = api.scoreDomain(domain, { "pemasaran-0": 2, "pemasaran-1": 1 });
  assert.equal(partial.complete, false);
  assert.equal(partial.score, null);

  const complete = api.scoreDomain(domain, { "pemasaran-0": 2, "pemasaran-1": 1, "pemasaran-2": 0 });
  assert.equal(complete.complete, true);
  assert.equal(complete.score, 50);
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
    "pemasaran-0": 2, "pemasaran-1": 2, "pemasaran-2": 2,
    "keuangan-0": 0, "keuangan-1": 0, "keuangan-2": 1,
    "penjualan-0": 0
  });
  assert.equal(results.length, 2);
  assert.equal(results[0].domain.id, "keuangan");
  assert.equal(results[0].score, 17);
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
  assert.match(app.rootElement.innerHTML, /Keuangan · 17%/);

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
  app.click({ view: "mentoring" });
  assert.match(app.rootElement.innerHTML, /Mengapa kas kosong\?/);
});

test("APK fase SAFE tidak meminta izin internet dan tidak menghubungi affiliate", () => {
  const manifest = fs.readFileSync(path.join(root, "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const source = fs.readFileSync(path.join(assets, "app.js"), "utf8");
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("tautan resmi dibuka secara eksternal, bukan di dalam sistem aplikasi", () => {
  const app = createHarness();
  activate(app);
  app.click({ view: "account" });
  app.click({ action: "website" });
  assert.deepEqual(app.opened, ["https://umkmnaikkelas.id"]);
});

