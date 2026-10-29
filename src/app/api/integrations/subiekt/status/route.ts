import { createRateLimiter } from '@/lib/rateLimit';
import { rejectUnauthorizedSubiektRequest, SUBIEKT_RATE_LIMIT } from '@/lib/subiekt/http';
import { getSyncStatus } from '@/lib/subiekt/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = createRateLimiter(SUBIEKT_RATE_LIMIT);

/** Stan integracji dla agenta: ostatnie uruchomienie i liczba nieprzypisanych dokumentów. Podpis z pustego body. */
export async function GET(req: Request) {
    const rejection = rejectUnauthorizedSubiektRequest(req, '', limiter);
    if (rejection) return rejection;

    try {
        return Response.json(await getSyncStatus());
    } catch (error) {
        console.error('[subiekt] Błąd odczytu statusu integracji', error);
        return Response.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
