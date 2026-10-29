import crypto from 'crypto';

export type AuthResult =
    | { ok: true }
    | {
          ok: false;
          status: 401 | 503;
          reason: 'NOT_CONFIGURED' | 'BAD_TOKEN' | 'BAD_TIMESTAMP' | 'STALE_TIMESTAMP' | 'BAD_SIGNATURE';
      };

/** Podpis treści: hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`). Używa go agent i testy. */
export function signSubiektRequest(secret: string, timestampSeconds: number, rawBody: string): string {
    return crypto.createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');
}

const DEFAULT_MAX_SKEW_SECONDS = 300;

type AuthEnv = { token?: string; secret?: string; maxSkewSeconds?: number };

/** Konfiguracja z env. Nieliczbowa / niedodatnia wartość skew → 300 s (NaN wyłączyłby kontrolę czasu). */
function envFromProcess(): AuthEnv {
    const skew = Number(process.env.SUBIEKT_SYNC_MAX_SKEW_SECONDS);
    return {
        token: process.env.SUBIEKT_SYNC_TOKEN,
        secret: process.env.SUBIEKT_SYNC_SECRET,
        maxSkewSeconds: Number.isFinite(skew) && skew > 0 ? skew : DEFAULT_MAX_SKEW_SECONDS,
    };
}

export function verifySubiektRequest(
    headers: { authorization?: string | null; timestamp?: string | null; signature?: string | null },
    rawBody: string,
    nowSeconds: number,
    env: AuthEnv = envFromProcess()
): AuthResult {
    if (!env.token || !env.secret) return { ok: false, status: 503, reason: 'NOT_CONFIGURED' };

    const bearer = (headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!safeEqual(bearer, env.token)) return { ok: false, status: 401, reason: 'BAD_TOKEN' };

    const ts = Number(headers.timestamp);
    if (!Number.isFinite(ts)) return { ok: false, status: 401, reason: 'BAD_TIMESTAMP' };
    if (Math.abs(nowSeconds - ts) > (env.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS)) {
        return { ok: false, status: 401, reason: 'STALE_TIMESTAMP' };
    }

    const expected = signSubiektRequest(env.secret, ts, rawBody);
    if (!safeEqual(headers.signature || '', expected)) return { ok: false, status: 401, reason: 'BAD_SIGNATURE' };

    return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}
