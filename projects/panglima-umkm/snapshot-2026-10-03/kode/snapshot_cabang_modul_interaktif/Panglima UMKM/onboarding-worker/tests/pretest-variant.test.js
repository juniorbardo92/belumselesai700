"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(
  __dirname,
  "..",
  "google-apps-script",
  "Panglima_PRETEST_Automation.gs"
), "utf8");
const testingOnlyPayload = JSON.parse(fs.readFileSync(path.join(
  __dirname,
  "fixtures",
  "lynk-testing-only-payment.json"
), "utf8"));
const sandbox = { console, Logger: { log() {} } };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "Panglima_PRETEST_Automation.gs" });

function transactionSheetFromPayload(payload, transactionId) {
  const message = payload.data.message_data;
  const item = message.items[0];
  const values = [
    ["Transaction ID", "Event Type", "Payment Status", "Product Name", "Buyer Email", "Items JSON"],
    [
      transactionId || message.refId,
      payload.event,
      "PAID",
      item.title,
      message.customer.email,
      JSON.stringify(message.items)
    ]
  ];
  return { getDataRange: () => ({ getValues: () => values }) };
}

test("label varian lama tetap dipetakan ke tiga kode modul kanonis", () => {
  const property = sandbox.panglimaPretestResolveModule_(
    "Paket Panglima UMKM",
    JSON.stringify([{ variant: { name: "Agen Properti" } }])
  );
  const insurance = sandbox.panglimaPretestResolveModule_(
    "Paket Panglima UMKM",
    JSON.stringify([{ options: [{ label: "Varian", value: "Agen Asuransi" }] }])
  );
  const mlm = sandbox.panglimaPretestResolveModule_(
    "Paket Panglima UMKM",
    JSON.stringify([{ variation_name: "Mitra MLM / Direct Selling" }])
  );

  assert.equal(property.code, "property");
  assert.equal(insurance.code, "insurance");
  assert.equal(mlm.code, "mlm");
});

test("tiga produk jalur dipetakan tepat tanpa memerlukan varian", () => {
  const cases = [
    ["Jalur Agen Properti", "property", "Modul Agen Properti"],
    ["Jalur Mitra MLM", "mlm", "Modul Mitra MLM / Direct Selling"],
    ["Jalur Agen Asuransi", "insurance", "Modul Agen Asuransi"]
  ];

  for (const [productName, moduleCode, moduleTitle] of cases) {
    const eligible = sandbox.panglimaPretestResolveEligibleProduct_(
      productName,
      JSON.stringify([{ title: productName }])
    );
    assert.equal(eligible.sourceProduct, productName);
    assert.equal(eligible.moduleCode, moduleCode);
    assert.equal(eligible.moduleTitle, moduleTitle);
  }
});

test("payload tanpa varian atau dengan dua varian tidak memberi entitlement otomatis", () => {
  assert.equal(sandbox.panglimaPretestResolveModule_(
    "Paket Panglima UMKM",
    JSON.stringify([{ title: "Paket Panglima UMKM" }])
  ), null);
  assert.equal(sandbox.panglimaPretestResolveModule_(
    "Paket Panglima UMKM",
    JSON.stringify([{ name: "Agen Properti dan Agen Asuransi" }])
  ), null);
});

test("hanya transaksi Testing Only yang diotorisasi menjadi jalur asuransi", () => {
  const message = testingOnlyPayload.data.message_data;
  const item = message.items[0];

  assert.equal(testingOnlyPayload.event, "payment.received");
  assert.equal(testingOnlyPayload.data.message_action, "SUCCESS");
  assert.equal(testingOnlyPayload.data.message_code, "0");
  assert.equal(item.uuid, "6aab26a97759780e1113e5b6-5925-2782841211-1789601449730");
  assert.equal(item.title, "Testing Only");
  assert.equal(item.addons.length, 0);
  assert.equal(sandbox.panglimaPretestResolveEligibleProduct_(
    item.title,
    JSON.stringify(message.items)
  ), null);

  const transaction = sandbox.panglimaPretestFindPaidTransaction_(
    transactionSheetFromPayload(testingOnlyPayload),
    message.customer.email
  );
  assert.equal(transaction.id, message.refId);
  assert.equal(transaction.sourceProduct, "Testing Only");
  assert.equal(transaction.moduleCode, "insurance");
  assert.equal(transaction.moduleTitle, "Modul Agen Asuransi");

  const unauthorizedTransaction = sandbox.panglimaPretestFindPaidTransaction_(
    transactionSheetFromPayload(
      testingOnlyPayload,
      message.refId + "-lain"
    ),
    message.customer.email
  );
  assert.equal(unauthorizedTransaction, null);
});

test("satu fixture Testing Only menguji tiga jalur tanpa pembelian tambahan", () => {
  const cases = [
    ["Jalur Agen Properti", "property"],
    ["Jalur Mitra MLM", "mlm"],
    ["Jalur Agen Asuransi", "insurance"]
  ];

  for (const [productName, moduleCode] of cases) {
    const payload = JSON.parse(JSON.stringify(testingOnlyPayload));
    payload.data.message_data.items[0].title = productName;
    const transaction = sandbox.panglimaPretestFindPaidTransaction_(
      transactionSheetFromPayload(
        payload,
        payload.data.message_data.refId + "-" + moduleCode
      ),
      payload.data.message_data.customer.email
    );

    assert.equal(transaction.product, "Paket Panglima UMKM");
    assert.equal(transaction.sourceProduct, productName);
    assert.equal(transaction.moduleCode, moduleCode);
  }
});

test("transaksi berbayar membaca varian dari Items JSON tanpa mengubah kolom komisi", () => {
  const values = [
    ["Transaction ID", "Event Type", "Payment Status", "Product Name", "Buyer Email", "Items JSON"],
    [
      "transaction-12345678",
      "payment.received",
      "PAID",
      "Paket Panglima UMKM",
      "buyer@example.com",
      JSON.stringify([{ title: "Paket Panglima UMKM", variant_name: "Agen Properti" }])
    ]
  ];
  const sheet = { getDataRange: () => ({ getValues: () => values }) };
  const transaction = sandbox.panglimaPretestFindPaidTransaction_(
    sheet,
    "user_6a6c2619@example.invalid"
  );

  assert.equal(transaction.id, "transaction-12345678");
  assert.equal(transaction.product, "Paket Panglima UMKM");
  assert.equal(transaction.moduleCode, "property");
  assert.equal(transaction.moduleTitle, "Modul Agen Properti");
});
