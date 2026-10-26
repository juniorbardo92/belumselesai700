import { build } from 'esbuild';
import { generateKeyPairSync, sign } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = await build({
  entryPoints: [join(root, 'src/cloudflare-access-jwt.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  logLevel: 'silent'
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString('base64')}`;
const { verifyCloudflareAccessToken } = await import(moduleUrl);

const teamDomain = 'https://unit-test.cloudflareaccess.com';
const audience = 'audience-under-test';
const now = 1_800_000_000;
const keyId = 'test-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: keyId, alg: 'RS256', use: 'sig' };
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (payload, header = { alg: 'RS256', kid: keyId }) => {
  const unsigned = `${encode(header)}.${encode(payload)}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
};
const loadJwks = async () => [jwk];
const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(ok ? 'PASS' : 'FAIL', name);
};

const validPayload = { iss: teamDomain, aud: audience, exp: now + 300, nbf: now - 10 };
check('valid Access JWT', await verifyCloudflareAccessToken(token(validPayload), teamDomain, audience, loadJwks, now));
check('wrong audience rejected', !(await verifyCloudflareAccessToken(token({ ...validPayload, aud: 'wrong' }), teamDomain, audience, loadJwks, now)));
check('wrong issuer rejected', !(await verifyCloudflareAccessToken(token({ ...validPayload, iss: 'https://wrong.cloudflareaccess.com' }), teamDomain, audience, loadJwks, now)));
check('expired token rejected', !(await verifyCloudflareAccessToken(token({ ...validPayload, exp: now - 1 }), teamDomain, audience, loadJwks, now)));
check('future token rejected', !(await verifyCloudflareAccessToken(token({ ...validPayload, nbf: now + 61 }), teamDomain, audience, loadJwks, now)));
check('algorithm confusion rejected', !(await verifyCloudflareAccessToken(token(validPayload, { alg: 'HS256', kid: keyId }), teamDomain, audience, loadJwks, now)));
const tampered = `${token(validPayload).slice(0, -1)}A`;
check('tampered signature rejected', !(await verifyCloudflareAccessToken(tampered, teamDomain, audience, loadJwks, now)));
check('unknown key rejected', !(await verifyCloudflareAccessToken(token(validPayload, { alg: 'RS256', kid: 'unknown' }), teamDomain, audience, loadJwks, now)));

if (checks.some((item) => !item.ok)) process.exitCode = 1;
else console.log(`Access JWT regression passed (${checks.length} checks)`);
