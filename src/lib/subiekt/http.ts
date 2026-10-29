// Wspólna bramka HTTP endpointów integracji Subiekt: limit per IP + token i podpis HMAC.
// Bez sesji NextAuth — wywołuje je agent na PC z bazą Subiekta, nie przeglądarka.
// Standardowe Response.json zamiast NextResponse: moduł nie zależy od next/server (testy w node:test).
import type { RateLimiter } from '@/lib/rateLimit';
import { verifySubiektRequest } from './auth';

export const SUBIEKT_RATE_LIMIT = { max: 60, windowMs: 10 * 60 * 1000 };

const NOT_CONFIGURED_MESSAGE = 'Integracja Subiekt nie jest skonfigurowana';

export function getClientIp(req: Request): string {
    const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    return first || 'unknown';
}

/**
 * Zwraca gotową odpowiedź błędu (429 / 401 / 503) albo null, gdy żądanie może iść dalej.
 * `rawBody` to dokładnie te bajty, które podpisał agent (dla GET pusty string).
 */
export function rejectUnauthorizedSubiektRequest(req: Request, rawBody: string, limiter: RateLimiter): Response | null {
    if (!limiter.check(getClientIp(req))) {
        return Response.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Headers.get jest niewrażliwe na wielkość liter.
    const auth = verifySubiektRequest(
        {
            authorization: req.headers.get('authorization'),
            timestamp: req.headers.get('x-subiekt-timestamp'),
            signature: req.headers.get('x-subiekt-signature'),
        },
        rawBody,
        Math.floor(Date.now() / 1000)
    );
    if (auth.ok) return null;

    if (auth.status === 503) {
        console.warn('[subiekt] Brak SUBIEKT_SYNC_TOKEN / SUBIEKT_SYNC_SECRET — endpoint integracji wyłączony.');
        return Response.json({ error: NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    return Response.json({ error: auth.reason }, { status: auth.status });
}
