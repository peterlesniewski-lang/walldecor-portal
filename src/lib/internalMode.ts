// Tryb wewnętrzny portalu (PLAN-SUBIEKT-2026-10-29.md, Loop 4b): PORTAL_INTERNAL_MODE=1 (lub `true`)
// na start produkcji — pracuje tylko zespół (ADMIN/STAFF), architekci dostaną dostęp później.
// Skutki: maile tylko do ADMIN/STAFF (src/lib/email.ts), brak resetu hasła i logowania ARCHI
// (forgot-password, src/lib/authorizeCredentials.ts, logowanie Google w src/lib/auth.ts), plakietka
// „Tryb wewnętrzny” w powłoce panelu. Zmienna czytana przy każdym wywołaniu (bez cache).

/** Komunikat dla architekta na ekranie logowania (przekazywany przez NextAuth jako `error`). */
export const INTERNAL_MODE_LOGIN_MESSAGE = 'Portal dla architektów jest w przygotowaniu. Spróbuj później.';

/** Wynik registerArchitect, gdy mail powitalny pominięto w trybie wewnętrznym (pokazywany jako info). */
export const INTERNAL_MODE_WELCOME_SKIPPED = 'Mail powitalny pominięty (tryb wewnętrzny)';

/** invitations.last_error dla zaproszenia niewysłanego w trybie wewnętrznym (nie liczy się jako błąd wysyłki). */
export const INTERNAL_MODE_INVITATION_NOTE = 'pominięto: tryb wewnętrzny';

/** Czy wynik sendEmail oznacza pominięcie w trybie wewnętrznym (a nie nieudaną wysyłkę). */
export function isSkippedByInternalMode(result: unknown): boolean {
    return (result as { skipped?: unknown } | null | undefined)?.skipped === 'INTERNAL_MODE';
}

export function isInternalMode(): boolean {
    const raw = (process.env.PORTAL_INTERNAL_MODE ?? '').trim().toLowerCase();
    return raw === '1' || raw === 'true';
}

/** Kod błędu w adresie strony logowania po odmowie logowania Google w trybie wewnętrznym. */
export const INTERNAL_MODE_SIGNIN_ERROR = 'InternalMode';
export const INTERNAL_MODE_SIGNIN_REDIRECT = `/auth/signin?error=${INTERNAL_MODE_SIGNIN_ERROR}`;

/**
 * Callback signIn (Google): w trybie wewnętrznym architekt dostaje przekierowanie na naszą stronę logowania
 * z kodem błędu (polski komunikat), a nie angielską stronę AccessDenied NextAuth. null = logowanie dozwolone.
 */
export function internalModeSignInRefusal(role: string | null | undefined): string | null {
    return isInternalMode() && role === 'ARCHI' ? INTERNAL_MODE_SIGNIN_REDIRECT : null;
}

/** Komunikat strony logowania dla kodu `?error=` z adresu (tylko znane kody; reszta → null). */
export function signInErrorMessage(code: string | null | undefined): string | null {
    return code === INTERNAL_MODE_SIGNIN_ERROR ? INTERNAL_MODE_LOGIN_MESSAGE : null;
}
