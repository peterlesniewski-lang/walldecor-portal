// Tryb wewnętrzny portalu (PLAN-SUBIEKT-2026-10-29.md, Loop 4b): PORTAL_INTERNAL_MODE=1 (lub `true`)
// na start produkcji — pracuje tylko zespół (ADMIN/STAFF), architekci dostaną dostęp później.
// Skutki: maile tylko do ADMIN/STAFF (src/lib/email.ts), brak resetu hasła i logowania ARCHI
// (forgot-password, src/lib/authorizeCredentials.ts, logowanie Google w src/lib/auth.ts), plakietka
// „Tryb wewnętrzny” w powłoce panelu. Zmienna czytana przy każdym wywołaniu (bez cache).

/** Komunikat dla architekta na ekranie logowania (przekazywany przez NextAuth jako `error`). */
export const INTERNAL_MODE_LOGIN_MESSAGE = 'Portal dla architektów jest w przygotowaniu. Spróbuj później.';

export function isInternalMode(): boolean {
    const raw = (process.env.PORTAL_INTERNAL_MODE ?? '').trim().toLowerCase();
    return raw === '1' || raw === 'true';
}
