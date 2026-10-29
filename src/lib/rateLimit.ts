// Fixed-window in-memory rate limiter.
//
// NOTE: state lives in the process memory. This is intentional: production runs a
// single PM2 instance, so a per-process limiter is enough. The counters are NOT
// shared between processes/instances and reset on every restart/deploy. If the
// app is ever scaled horizontally, move this to a shared store (Redis/DB).

export interface RateLimiter {
    /** Registers an attempt for `key`. Returns true if allowed, false if over the limit. */
    check(key: string, now?: number): boolean;
    /** Forgets all attempts recorded for `key`. */
    reset(key: string): void;
}

export interface RateLimiterOptions {
    max: number;
    windowMs: number;
}

const PRUNE_THRESHOLD = 5000;

export function createRateLimiter({ max, windowMs }: RateLimiterOptions): RateLimiter {
    const entries = new Map<string, { count: number; resetAt: number }>();

    function prune(now: number) {
        for (const [key, entry] of entries) {
            if (now > entry.resetAt) entries.delete(key);
        }
    }

    return {
        check(key: string, now: number = Date.now()): boolean {
            const entry = entries.get(key);
            if (!entry || now > entry.resetAt) {
                if (entries.size >= PRUNE_THRESHOLD) prune(now);
                entries.set(key, { count: 1, resetAt: now + windowMs });
                return true;
            }
            if (entry.count >= max) return false;
            entry.count++;
            return true;
        },
        reset(key: string): void {
            entries.delete(key);
        },
    };
}

/**
 * Klucz limitu per IP: pierwszy adres z `x-forwarded-for` (proxy Coolify/Traefik), potem `x-real-ip`,
 * w ostateczności 'unknown' (wszystkie takie żądania dzielą jeden licznik).
 */
export function getClientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
    }
    return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
