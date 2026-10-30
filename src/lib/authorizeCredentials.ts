// Logowanie e-mail + hasło (provider credentials w src/lib/auth.ts). Osobny moduł bez importów next-auth,
// żeby testy mogły wołać authorize na prawdziwej bazie.
import bcrypt from 'bcrypt';
import { query } from './db';
import { createRateLimiter } from './rateLimit';
import { INTERNAL_MODE_LOGIN_MESSAGE, isInternalMode } from './internalMode';
import { LOGIN_RATE_LIMIT_MESSAGE } from './authMessages';

// In-memory rate limiter: max 5 login attempts per email per 5 minutes (per process)
const loginLimiter = createRateLimiter({ max: 5, windowMs: 5 * 60 * 1000 });

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function checkRateLimit(email: string): boolean {
    return loginLimiter.check(normalizeEmail(email));
}

function resetRateLimit(email: string) {
    loginLimiter.reset(normalizeEmail(email));
}

export interface AuthorizedUser {
    id: string;
    name: string;
    email: string;
    role: 'ARCHI' | 'STAFF' | 'ADMIN';
}

/** Tryb wewnętrzny: architekt (także demo) dostaje komunikat o przygotowaniu zamiast sesji. */
function refuseArchitectInInternalMode<T extends { role: string }>(user: T): T {
    if (isInternalMode() && user.role === 'ARCHI') {
        throw new Error(INTERNAL_MODE_LOGIN_MESSAGE);
    }
    return user;
}

export async function authorizeCredentials(
    credentials: Record<'email' | 'password', string> | undefined
): Promise<AuthorizedUser | null> {
    if (!credentials?.email || !credentials?.password) return null;

    if (!checkRateLimit(credentials.email)) {
        throw new Error(LOGIN_RATE_LIMIT_MESSAGE);
    }

    if (process.env.DEMO_MODE === 'true') {
        if (credentials.email === 'architekt@demo.pl') {
            return refuseArchitectInInternalMode<AuthorizedUser>({ id: 'u2', name: 'Piotr Architekt', email: 'architekt@demo.pl', role: 'ARCHI' });
        }
        if (credentials.email === 'admin@walldecor.pl') {
            return { id: 'u1', name: 'Admin WallDecor', email: 'admin@walldecor.pl', role: 'ADMIN' };
        }
    }

    const users = await query<any>(
        'SELECT * FROM users WHERE LOWER(email) = ?',
        [normalizeEmail(credentials.email)]
    );

    const user = users[0];

    if (user && user.password && await bcrypt.compare(credentials.password, user.password)) {
        resetRateLimit(credentials.email);
        // Tryb wewnętrzny: architekt z poprawnym hasłem dostaje komunikat zamiast sesji (bez last_login_at).
        refuseArchitectInInternalMode(user);
        query("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [user.id]).catch(() => {});
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        };
    }
    return null;
}
