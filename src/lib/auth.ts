import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import { query } from './db';

// In-memory rate limiter: max 5 failed attempts per email per 5 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

function checkRateLimit(email: string): boolean {
    const now = Date.now();
    const entry = loginAttempts.get(email);
    if (!entry || now > entry.resetAt) {
        loginAttempts.set(email, { count: 1, resetAt: now + WINDOW_MS });
        return true;
    }
    if (entry.count >= MAX_ATTEMPTS) return false;
    entry.count++;
    return true;
}

function resetRateLimit(email: string) {
    loginAttempts.delete(email);
}

export const authOptions: NextAuthOptions = {
    session: {
        strategy: 'jwt', // Using JWT initially for robust cPanel setup, can be synced to DB sessions if needed
    },
    providers: [
        CredentialsProvider({
            name: 'WallDecor Portal',
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                if (!checkRateLimit(credentials.email)) {
                    throw new Error("Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za 5 minut.");
                }

                if (process.env.DEMO_MODE === 'true') {
                    // Demo login bypass
                    if (credentials.email === 'architekt@demo.pl') {
                        return { id: 'u2', name: 'Piotr Architekt', email: 'architekt@demo.pl', role: 'ARCHI' };
                    }
                    if (credentials.email === 'admin@walldecor.pl') {
                        return { id: 'u1', name: 'Admin WallDecor', email: 'admin@walldecor.pl', role: 'ADMIN' };
                    }
                }

                const users = await query<any>(
                    'SELECT * FROM users WHERE email = ?',
                    [credentials.email]
                );

                const user = users[0];

                if (user && await bcrypt.compare(credentials.password, user.password)) {
                    resetRateLimit(credentials.email);
                    // Record last login (fire-and-forget, don't block auth)
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
        })
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = (user as any).role;
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).role = token.role;
                (session.user as any).id = token.id;
            }
            return session;
        }
    },
    pages: {
        signIn: '/auth/signin',
    }
};
