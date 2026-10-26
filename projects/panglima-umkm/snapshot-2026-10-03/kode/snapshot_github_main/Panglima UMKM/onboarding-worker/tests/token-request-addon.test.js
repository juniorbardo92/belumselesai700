"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "google-apps-script", "Panglima_Token_Request_Addon.gs"), "utf8");
const deleted = [];
const created = [];
const requests = [];
const emails = [];
const logs = [];
const triggers = [
  { getHandlerFunction: () => "panglimaPretestHandleFormSubmit" },
  { getHandlerFunction: () => "panglimaTokenRequestProcessQueue" }
];

const sandbox = {
  console,
  Logger: { log(value) { logs.push(String(value)); } },
  LockService: {
    getScriptLock() {
      return { tryLock: () => true, releaseLock() {} };
    }
  },
  ScriptApp: {
    getProjectTriggers: () => triggers,
    deleteTrigger(trigger) { deleted.push(trigger.getHandlerFunction()); },
    newTrigger(handler) {
      const record = { handler, interval: 0 };
      created.push(record);
      return {
        timeBased() { return this; },
        everyMinutes(minutes) { record.interval = minutes; return this; },
        create() { return record; }
      };
    }
  },
  panglimaPretestVerifyGoogleAccess_: () => ({ ok: true }),
  panglimaPretestReadContext_: () => ({
    responseSheet: { getLastRow: () => 2 },
    transactionSheet: {}
  }),
  panglimaPretestReadProfile_: () => ({
    email: "buyer@example.com",
    owner: "Nama Pembeli",
    business: "Usaha Pembeli"
  }),
  panglimaPretestNormalizeEmail_: value => String(value || "").trim().toLowerCase(),
  panglimaPretestFindPaidTransaction_: () => ({
    id: "transaction-12345678",
    email: "buyer@example.com",
    product: "Paket Panglima UMKM"
  }),
  panglimaPretestEligibility_: () => "READY_FOR_TOKEN",
  panglimaPretestMaskEmail_: () => "b***@example.com",
  panglimaPretestSendTokenEmail_(profile, token) {
    emails.push({ profile, token });
  },
  panglimaPretestOnboardingRequest_(path, payload) {
    requests.push({ path, payload });
    if (path.endsWith("/list")) {
      return { requests: [{
        requestId: "11111111-1111-4111-8111-111111111111",
        transactionId: "transaction-12345678",
        participantId: "22222222-2222-4222-8222-222222222222",
        email: "buyer@example.com"
      }] };
    }
    if (path.endsWith("/issue")) {
      return {
        status: "TOKEN_ISSUED",
        accessCode: "PANGLIMA-ABCDEFGHJKLMNPQR",
        participant: { id: "22222222-2222-4222-8222-222222222222" }
      };
    }
    if (path.endsWith("/confirm")) return { status: "TOKEN_EMAIL_SENT" };
    if (path.endsWith("/fail")) return { status: "TOKEN_REQUEST_RETRY_SCHEDULED" };
    throw new Error("Unexpected path " + path);
  }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "Panglima_Token_Request_Addon.gs" });

const setup = sandbox.panglimaTokenRequestSetup();
assert.equal(setup.ok, true);
assert.deepEqual(deleted, ["panglimaTokenRequestProcessQueue"]);
assert.equal(created.length, 1);
assert.equal(created[0].handler, "panglimaTokenRequestProcessQueue");
assert.equal(created[0].interval, 5);

const processed = sandbox.panglimaTokenRequestProcessQueue();
assert.equal(processed.ok, true);
assert.equal(processed.processed, 1);
assert.equal(processed.results[0].status, "TOKEN_EMAIL_SENT");
assert.equal(emails.length, 1);
assert.equal(emails[0].profile.email, "buyer@example.com");
assert.match(emails[0].token, /^PANGLIMA-/);
assert.deepEqual(requests.map(item => item.path), [
  "/v1/onboarding/requests/list",
  "/v1/onboarding/requests/issue",
  "/v1/onboarding/requests/confirm"
]);
assert.ok(logs.length >= 2);

console.log("Panglima token request add-on: isolated trigger, PRE-TEST recheck, token issue, email, and confirmation checks passed.");

