import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker from '../worker.mjs';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

const originalFetch = globalThis.fetch;
let googleIdentity = {
  sub: '106545113802080728425',
  email: 'user_7fc561fb@example.invalid',
  email_verified: true
};

globalThis.fetch = async function(url, options) {
  assert.ok([
    'https://openidconnect.googleapis.com/v1/userinfo',
    'https://www.googleapis.com/oauth2/v3/userinfo'
  ].includes(url));
  assert.match(options.headers.authorization, /^Bearer /);
  assert.equal(options.redirect, 'follow');
  assert.equal(options.signal, undefined);
  return new Response(JSON.stringify(googleIdentity), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

class FakeD1 {
  constructor() {
    this.participants = new Map();
    this.fulfillments = new Map();
    this.consultations = new Map();
    this.tokenRequests = new Map();
    this.entitlements = new Map();
  }

  prepare(sql) {
    const database = this;
    return {
      sql,
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        if (sql.startsWith('SELECT participant_id, transaction_id, module_code FROM panglima_module_entitlements')) {
          const transactionId = this.values[0];
          return Array.from(database.entitlements.values()).find(item =>
            item.transaction_id === transactionId
          ) || null;
        }
        if (sql.startsWith('SELECT COUNT(*) AS request_count FROM panglima_token_requests')) {
          const [emailHash, deviceHash, cutoff] = this.values;
          const count = Array.from(database.tokenRequests.values()).filter(item =>
            (item.email_hash === emailHash || item.device_hash === deviceHash) &&
            item.requested_at >= cutoff
          ).length;
          return { request_count: count };
        }
        if (sql.includes('WHERE lower(f.buyer_email) = ?')) {
          const [email, product] = this.values;
          const fulfillment = Array.from(database.fulfillments.values())
            .filter(item => item.buyer_email.toLowerCase() === email &&
              item.product_name.toLowerCase() === product)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          if (!fulfillment) return null;
          const participant = database.participants.get(fulfillment.participant_id);
          if (!participant || participant.status !== 'active') return null;
          return database.fulfillmentResult(fulfillment, participant);
        }
        if (sql.startsWith('SELECT request_id FROM panglima_token_requests') &&
            sql.includes("status IN ('PENDING', 'PROCESSING')")) {
          const [transactionId, cutoff] = this.values;
          return Array.from(database.tokenRequests.values()).find(item =>
            item.transaction_id === transactionId &&
            (item.status === 'PENDING' || item.status === 'PROCESSING') &&
            item.requested_at >= cutoff
          ) || null;
        }
        if (sql.startsWith('SELECT r.request_id, r.transaction_id, r.participant_id')) {
          const item = database.tokenRequests.get(this.values[0]);
          if (!item) return null;
          const fulfillment = database.fulfillments.get(item.transaction_id);
          const participant = database.participants.get(item.participant_id);
          if (!fulfillment || !participant) return null;
          return {
            ...item,
            request_status: item.status,
            product_name: fulfillment.product_name,
            owner_name: participant.owner_name,
            business_name: participant.business_name,
            participant_status: participant.status,
            daily_limit: participant.daily_limit
          };
        }
        if (sql.startsWith('SELECT request_id FROM panglima_token_requests') &&
            sql.includes('lower(buyer_email) = ?')) {
          const [requestId, transactionId, participantId, email] = this.values;
          const item = database.tokenRequests.get(requestId);
          return item && item.transaction_id === transactionId &&
            item.participant_id === participantId &&
            item.buyer_email.toLowerCase() === email ? { request_id: requestId } : null;
        }
        const fulfillment = database.fulfillments.get(this.values[0]);
        if (!fulfillment) return null;
        const participant = database.participants.get(fulfillment.participant_id);
        if (!participant) return null;
        return database.fulfillmentResult(fulfillment, participant);
      },
      async all() {
        if (sql.startsWith('SELECT r.request_id, r.transaction_id, r.participant_id')) {
          const limit = this.values[0];
          const results = Array.from(database.tokenRequests.values())
            .filter(item => (item.status === 'PENDING' || item.status === 'FAILED') && item.attempts < 3)
            .sort((a, b) => a.requested_at.localeCompare(b.requested_at))
            .slice(0, limit)
            .map(item => {
              const fulfillment = database.fulfillments.get(item.transaction_id);
              const participant = database.participants.get(item.participant_id);
              return {
                ...item,
                product_name: fulfillment.product_name,
                owner_name: participant.owner_name,
                business_name: participant.business_name
              };
            });
          return { results };
        }
        throw new Error('Unexpected all SQL: ' + sql);
      },
      async run() {
        if (sql.startsWith('INSERT INTO panglima_module_entitlements')) {
          const [participantId, transactionId, moduleCode, sourceVariant, grantedAt, updatedAt] = this.values;
          database.entitlements.set(participantId + ':' + moduleCode, {
            participant_id: participantId,
            transaction_id: transactionId,
            module_code: moduleCode,
            source_variant: sourceVariant,
            granted_at: grantedAt,
            updated_at: updatedAt
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.startsWith('INSERT INTO panglima_token_requests')) {
          const [requestId, transactionId, participantId, email, emailHash, deviceHash, requestedAt, updatedAt] = this.values;
          database.tokenRequests.set(requestId, {
            request_id: requestId,
            transaction_id: transactionId,
            participant_id: participantId,
            buyer_email: email,
            email_hash: emailHash,
            device_hash: deviceHash,
            status: 'PENDING',
            attempts: 0,
            requested_at: requestedAt,
            updated_at: updatedAt,
            processed_at: null,
            error_code: null
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.startsWith('UPDATE panglima_onboarding_fulfillments SET status')) {
          const [sentAt, updatedAt, transactionId] = this.values;
          const fulfillment = database.fulfillments.get(transactionId);
          fulfillment.status = 'TOKEN_EMAIL_SENT';
          fulfillment.email_sent_at = sentAt;
          fulfillment.updated_at = updatedAt;
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE panglima_token_requests SET status = 'FAILED'")) {
          const [errorCode, updatedAt, requestId] = this.values;
          const item = database.tokenRequests.get(requestId);
          if (item) {
            if (item.status !== 'PROCESSING') item.attempts += 1;
            item.status = 'FAILED';
            item.error_code = errorCode;
            item.updated_at = updatedAt;
          }
          return { success: true, meta: { changes: item ? 1 : 0 } };
        }
        throw new Error('Unexpected run SQL: ' + sql);
      }
    };
  }

  fulfillmentResult(fulfillment, participant) {
    return {
      ...fulfillment,
      fulfillment_status: fulfillment.status,
      owner_name: participant.owner_name,
      business_name: participant.business_name,
      participant_status: participant.status,
      daily_limit: participant.daily_limit
    };
  }

  async batch(statements) {
    for (const statement of statements) {
      if (statement.sql.startsWith('INSERT INTO panglima_participants')) {
        const [id, owner, business, hash, created] = statement.values;
        this.participants.set(id, {
          id,
          owner_name: owner,
          business_name: business,
          access_code_hash: hash,
          status: 'active',
          daily_limit: 3,
          created_at: created
        });
      } else if (statement.sql.startsWith('INSERT INTO panglima_onboarding_fulfillments')) {
        const [transaction, participant, email, product, created, updated, googleSub] = statement.values;
        this.fulfillments.set(transaction, {
          transaction_id: transaction,
          participant_id: participant,
          buyer_email: email,
          product_name: product,
          status: 'TOKEN_ISSUED',
          email_sent_at: null,
          created_at: created,
          updated_at: updated,
          created_by_google_sub: googleSub
        });
      } else if (statement.sql.startsWith('UPDATE panglima_participants')) {
        const [hash, id] = statement.values;
        this.participants.get(id).access_code_hash = hash;
      } else if (statement.sql.startsWith('UPDATE panglima_onboarding_fulfillments SET updated_at')) {
        const [updated, transaction] = statement.values;
        this.fulfillments.get(transaction).updated_at = updated;
      } else if (statement.sql.startsWith("UPDATE panglima_onboarding_fulfillments SET status = 'TOKEN_ISSUED'")) {
        const [updated, transaction] = statement.values;
        const fulfillment = this.fulfillments.get(transaction);
        fulfillment.status = 'TOKEN_ISSUED';
        fulfillment.updated_at = updated;
      } else if (statement.sql.startsWith("UPDATE panglima_onboarding_fulfillments SET status = 'TOKEN_EMAIL_SENT'")) {
        const [sentAt, updated, transaction] = statement.values;
        const fulfillment = this.fulfillments.get(transaction);
        fulfillment.status = 'TOKEN_EMAIL_SENT';
        fulfillment.email_sent_at = sentAt;
        fulfillment.updated_at = updated;
      } else if (statement.sql.startsWith("UPDATE panglima_token_requests SET status = 'PROCESSING'")) {
        const [updated, requestId] = statement.values;
        const item = this.tokenRequests.get(requestId);
        item.status = 'PROCESSING';
        item.attempts += 1;
        item.updated_at = updated;
        item.error_code = null;
      } else if (statement.sql.startsWith("UPDATE panglima_token_requests SET status = 'SENT'")) {
        const [processedAt, updatedAt, requestId] = statement.values;
        const item = this.tokenRequests.get(requestId);
        item.status = 'SENT';
        item.processed_at = processedAt;
        item.updated_at = updatedAt;
        item.error_code = null;
      } else if (statement.sql.startsWith('DELETE FROM panglima_consultations')) {
        const [participantId] = statement.values;
        for (const [id, consultation] of this.consultations) {
          if (consultation.participant_id === participantId) {
            this.consultations.delete(id);
          }
        }
      } else if (statement.sql.startsWith('INSERT INTO panglima_module_entitlements')) {
        const [participantId, transactionId, moduleCode, sourceVariant, grantedAt, updatedAt] = statement.values;
        this.entitlements.set(participantId + ':' + moduleCode, {
          participant_id: participantId,
          transaction_id: transactionId,
          module_code: moduleCode,
          source_variant: sourceVariant,
          granted_at: grantedAt,
          updated_at: updatedAt
        });
      } else if (statement.sql.startsWith('DELETE FROM panglima_module_entitlements')) {
        const [participantId] = statement.values;
        for (const [key, entitlement] of this.entitlements) {
          if (entitlement.participant_id === participantId) this.entitlements.delete(key);
        }
      } else if (statement.sql.startsWith('DELETE FROM panglima_onboarding_fulfillments')) {
        const [transactionId, participantId, email] = statement.values;
        const fulfillment = this.fulfillments.get(transactionId);
        if (
          fulfillment &&
          fulfillment.participant_id === participantId &&
          fulfillment.buyer_email === email
        ) {
          this.fulfillments.delete(transactionId);
        }
      } else if (statement.sql.startsWith('DELETE FROM panglima_participants')) {
        const [participantId] = statement.values;
        this.participants.delete(participantId);
      } else {
        throw new Error('Unexpected batch SQL: ' + statement.sql);
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

const database = new FakeD1();
const env = {
  PANGLIMA_APP_DB: database,
  PANGLIMA_ALLOWED_GOOGLE_SUB: '106545113802080728425',
  PANGLIMA_ALLOWED_GOOGLE_EMAIL: 'user_7fc561fb@example.invalid',
  PANGLIMA_PRODUCT_NAME: 'Paket Panglima UMKM'
};
const oauth = 'Bearer ya29.valid_google_oauth_token_with_enough_length';

function request(path, payload, headers = { authorization: oauth }) {
  return new Request('https://example.test' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload)
  });
}

let response = await worker.fetch(new Request('https://example.test/health'), env);
assert.equal(response.status, 200);
assert.equal((await response.json()).ready, true);

response = await worker.fetch(
  new Request('https://example.test/v1/onboarding/whoami', {
    headers: { authorization: oauth }
  }),
  env
);
assert.equal(response.status, 200);
assert.equal((await response.json()).account, 'user_7fc561fb@example.invalid');

response = await worker.fetch(request('/v1/onboarding/issue', {}, {}), env);
assert.equal(response.status, 401);

googleIdentity = { ...googleIdentity, sub: '999999999999999999999' };
response = await worker.fetch(request('/v1/onboarding/issue', {}), env);
assert.equal(response.status, 403);
googleIdentity = { ...googleIdentity, sub: '106545113802080728425' };

const eligible = {
  transactionId: 'transaction-12345678',
  email: 'buyer@example.com',
  owner: 'Nama Pembeli',
  business: 'Usaha Pembeli',
  product: 'Paket Panglima UMKM'
};

response = await worker.fetch(
  request('/v1/onboarding/issue', { ...eligible, product: 'Buku Sun Tzu' }),
  env
);
assert.equal(response.status, 403);

response = await worker.fetch(
  request('/v1/onboarding/issue', { ...eligible, owner: '' }),
  env
);
assert.equal(response.status, 400);

response = await worker.fetch(request('/v1/onboarding/issue', eligible), env);
assert.equal(response.status, 201);
const firstIssue = await response.json();
assert.equal(firstIssue.ok, true);
assert.equal(firstIssue.status, 'TOKEN_ISSUED');
assert.match(firstIssue.accessCode, /^PANGLIMA-[A-HJ-NP-Z2-9]{16}$/);
assert.equal(database.participants.size, 1);
assert.equal(database.fulfillments.size, 1);
assert.notEqual(
  database.participants.get(firstIssue.participant.id).access_code_hash,
  firstIssue.accessCode
);

response = await worker.fetch(request('/v1/onboarding/issue', eligible), env);
assert.equal(response.status, 200);
const secondIssue = await response.json();
assert.equal(secondIssue.participant.id, firstIssue.participant.id);
assert.notEqual(secondIssue.accessCode, firstIssue.accessCode);
assert.equal(database.participants.size, 1);

response = await worker.fetch(
  request('/v1/onboarding/issue', { ...eligible, email: 'other@example.com' }),
  env
);
assert.equal(response.status, 409);

response = await worker.fetch(
  request('/v1/onboarding/confirm', {
    transactionId: eligible.transactionId,
    participantId: firstIssue.participant.id,
    email: eligible.email
  }),
  env
);
assert.equal(response.status, 200);
assert.equal((await response.json()).status, 'TOKEN_EMAIL_SENT');

response = await worker.fetch(request('/v1/onboarding/issue', eligible), env);
const afterSent = await response.json();
assert.equal(afterSent.status, 'TOKEN_EMAIL_SENT');
assert.equal(afterSent.accessCode, undefined);
assert.equal(database.participants.size, 1);

response = await worker.fetch(
  request('/v1/onboarding/request-token', {
    email: 'unknown@example.com',
    deviceId: 'a'.repeat(64)
  }, {}),
  env
);
assert.equal(response.status, 202);
assert.equal((await response.json()).status, 'REQUEST_ACCEPTED');
assert.equal(database.tokenRequests.size, 0);

response = await worker.fetch(
  request('/v1/onboarding/request-token', {
    email: ' user_6a6c2619@example.invalid ',
    deviceId: 'a'.repeat(64)
  }, {}),
  env
);
assert.equal(response.status, 202);
assert.equal((await response.json()).status, 'REQUEST_ACCEPTED');
assert.equal(database.tokenRequests.size, 1);

response = await worker.fetch(
  request('/v1/onboarding/request-token', {
    email: 'buyer@example.com',
    deviceId: 'a'.repeat(64)
  }, {}),
  env
);
assert.equal(response.status, 202);
assert.equal(database.tokenRequests.size, 1);

response = await worker.fetch(
  request('/v1/onboarding/requests/list', { limit: 10 }),
  env
);
assert.equal(response.status, 200);
const queued = await response.json();
assert.equal(queued.requests.length, 1);
assert.equal(queued.requests[0].email, eligible.email);

response = await worker.fetch(
  request('/v1/onboarding/requests/issue', {
    requestId: queued.requests[0].requestId
  }),
  env
);
assert.equal(response.status, 200);
const requestedIssue = await response.json();
assert.match(requestedIssue.accessCode, /^PANGLIMA-[A-HJ-NP-Z2-9]{16}$/);
assert.equal(database.tokenRequests.get(queued.requests[0].requestId).status, 'PROCESSING');

response = await worker.fetch(
  request('/v1/onboarding/requests/confirm', {
    requestId: queued.requests[0].requestId,
    transactionId: eligible.transactionId,
    participantId: firstIssue.participant.id,
    email: eligible.email
  }),
  env
);
assert.equal(response.status, 200);
assert.equal((await response.json()).status, 'TOKEN_EMAIL_SENT');
assert.equal(database.tokenRequests.get(queued.requests[0].requestId).status, 'SENT');

const simulation = {
  transactionId: 'TEST-PANGLIMA-ABCDEFGH-1234ABCD',
  email: 'user_7fc561fb@example.invalid',
  owner: 'Admin Simulasi Panglima',
  business: 'UMKM Simulasi Panglima',
  product: 'Paket Panglima UMKM'
};

response = await worker.fetch(request('/v1/onboarding/issue', simulation), env);
assert.equal(response.status, 403);
assert.equal((await response.json()).code, 'SIMULATION_ROUTE_REQUIRED');

response = await worker.fetch(request('/v1/onboarding/test/issue', eligible), env);
assert.equal(response.status, 403);
assert.equal((await response.json()).code, 'SIMULATION_TRANSACTION_REQUIRED');

response = await worker.fetch(
  request('/v1/onboarding/test/issue', {
    ...simulation,
    email: 'other@example.com'
  }),
  env
);
assert.equal(response.status, 403);
assert.equal((await response.json()).code, 'SIMULATION_EMAIL_NOT_ALLOWED');

response = await worker.fetch(request('/v1/onboarding/test/issue', simulation), env);
assert.equal(response.status, 201);
const testIssue = await response.json();
assert.match(testIssue.accessCode, /^PANGLIMA-[A-HJ-NP-Z2-9]{16}$/);
assert.equal(database.participants.size, 2);
assert.equal(database.fulfillments.size, 2);

database.consultations.set('consultation-test-1', {
  participant_id: testIssue.participant.id
});

response = await worker.fetch(
  request('/v1/onboarding/test/confirm', {
    transactionId: simulation.transactionId,
    participantId: testIssue.participant.id,
    email: simulation.email
  }),
  env
);
assert.equal(response.status, 200);
assert.equal((await response.json()).status, 'TOKEN_EMAIL_SENT');

response = await worker.fetch(
  request('/v1/onboarding/test/cleanup', {
    transactionId: eligible.transactionId,
    participantId: firstIssue.participant.id,
    email: simulation.email
  }),
  env
);
assert.equal(response.status, 403);
assert.equal(database.participants.size, 2);

response = await worker.fetch(
  request('/v1/onboarding/test/cleanup', {
    transactionId: simulation.transactionId,
    participantId: firstIssue.participant.id,
    email: simulation.email
  }),
  env
);
assert.equal(response.status, 404);
assert.equal(database.participants.size, 2);

response = await worker.fetch(
  request('/v1/onboarding/test/cleanup', {
    transactionId: simulation.transactionId,
    participantId: testIssue.participant.id,
    email: simulation.email
  }),
  env
);
assert.equal(response.status, 200);
assert.equal((await response.json()).status, 'SIMULATION_CLEANED');
assert.equal(database.participants.size, 1);
assert.equal(database.fulfillments.size, 1);
assert.equal(database.consultations.size, 0);
assert.equal(database.participants.has(firstIssue.participant.id), true);

const specialistDb = new FakeD1();
const specialistEnv = { ...env, PANGLIMA_APP_DB: specialistDb };
const variants = [
  ['Jalur Agen Properti', 'property'],
  ['Jalur Agen Asuransi', 'insurance'],
  ['Jalur Mitra MLM', 'mlm']
];
for (const [product, moduleCode] of variants) {
  const payload = { ...eligible, product, moduleCode, transactionId: 'transaction-specialist-' + moduleCode };
  response = await worker.fetch(request('/v1/onboarding/issue', payload), specialistEnv);
  assert.equal(response.status, 201);
  const issued = await response.json();
  assert.equal(issued.participant.module.code, moduleCode);
  assert.equal(specialistDb.entitlements.get(issued.participant.id + ':' + moduleCode).transaction_id, payload.transactionId);
  response = await worker.fetch(request('/v1/onboarding/issue', payload), specialistEnv);
  assert.equal(response.status, 200);
  assert.equal(specialistDb.entitlements.size, variants.indexOf(variants.find(v => v[1] === moduleCode)) + 1);
}
response = await worker.fetch(request('/v1/onboarding/issue', {
  ...eligible, transactionId: 'transaction-invalid-module', product: 'Jalur Agen Properti', moduleCode: 'insurance'
}), specialistEnv);
assert.equal(response.status, 403);
response = await worker.fetch(request('/v1/onboarding/issue', {
  ...eligible, transactionId: 'transaction-testing-unknown', product: 'Testing Only', moduleCode: 'insurance'
}), specialistEnv);
assert.equal(response.status, 403);
globalThis.fetch = originalFetch;
console.log('Panglima onboarding worker: security, eligibility, token request queue, delivery, isolated simulation, and targeted cleanup checks passed.');
