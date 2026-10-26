type AccessJwtEnv = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_POLICY_AUD?: string;
};

type JsonWebKeyWithKid = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

type AccessPayload = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
};

type JwksLoader = (teamDomain: string) => Promise<readonly JsonWebKeyWithKid[]>;

const jwksCache = new Map<string, { expiresAt: number; keys: readonly JsonWebKeyWithKid[] }>();
const encoder = new TextEncoder();

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function normalizeTeamDomain(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) return null;
    if (!url.hostname.endsWith('.cloudflareaccess.com')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function loadRemoteJwks(teamDomain: string): Promise<readonly JsonWebKeyWithKid[]> {
  const cached = jwksCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`, {
    headers: { Accept: 'application/json' },
    cf: { cacheEverything: true, cacheTtl: 300 }
  });
  if (!response.ok) throw new Error(`Access JWKS returned ${response.status}`);
  const body = await response.json() as { keys?: JsonWebKeyWithKid[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error('Access JWKS is empty');

  jwksCache.set(teamDomain, { expiresAt: Date.now() + 300_000, keys: body.keys });
  return body.keys;
}

function audienceMatches(audience: unknown, expected: string): boolean {
  return audience === expected || (Array.isArray(audience) && audience.includes(expected));
}

export async function verifyCloudflareAccessToken(
  token: string,
  teamDomain: string,
  policyAudience: string,
  loadJwks: JwksLoader = loadRemoteJwks,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;

    const header = decodeJson<{ alg?: unknown; kid?: unknown }>(parts[0]);
    const payload = decodeJson<AccessPayload>(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return false;
    if (payload.iss !== teamDomain || !audienceMatches(payload.aud, policyAudience)) return false;
    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return false;
    if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds + 60) return false;

    const keys = await loadJwks(teamDomain);
    const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use !== 'enc');
    if (!jwk) return false;

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      toArrayBuffer(decodeBase64Url(parts[2])),
      encoder.encode(`${parts[0]}.${parts[1]}`)
    );
  } catch {
    return false;
  }
}

export async function cloudflareAccessAuthorized(request: Request, env: AccessJwtEnv): Promise<boolean> {
  const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const policyAudience = env.ACCESS_POLICY_AUD?.trim();
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!teamDomain || !policyAudience || !token) return false;
  return verifyCloudflareAccessToken(token, teamDomain, policyAudience);
}
