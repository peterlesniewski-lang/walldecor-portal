import { createRateLimiter } from '@/lib/rateLimit';
import { rejectUnauthorizedSubiektRequest, SUBIEKT_RATE_LIMIT } from '@/lib/subiekt/http';
import { parseSyncRequest } from '@/lib/subiekt/validate';
import { processSyncPage } from '@/lib/subiekt/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = createRateLimiter(SUBIEKT_RATE_LIMIT);

/** Strona paczki dokumentów od agenta Subiekt GT (PLAN-SUBIEKT-2026-10-29.md, 2.1). */
export async function POST(req: Request) {
    // Surowe body: podpis HMAC liczony jest z bajtów, nie z ponownie zserializowanego JSON-a.
    const rawBody = await req.text();

    const rejection = rejectUnauthorizedSubiektRequest(req, rawBody, limiter);
    if (rejection) return rejection;

    let json: unknown;
    try {
        json = JSON.parse(rawBody);
    } catch {
        return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    const parsed = parseSyncRequest(json);
    if (!parsed.ok) {
        return Response.json({ error: parsed.error }, { status: parsed.error === 'TOO_MANY_DOCUMENTS' ? 413 : 400 });
    }

    try {
        return Response.json(await processSyncPage(parsed.value));
    } catch (error) {
        console.error('[subiekt] Błąd przetwarzania strony paczki', { run_id: parsed.value.run_id, error });
        return Response.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
