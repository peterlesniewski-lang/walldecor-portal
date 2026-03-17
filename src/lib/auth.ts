import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
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
        strategy: 'jwt',
    },
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
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

                if (user && user.password && await bcrypt.compare(credentials.password, user.password)) {
                    resetRateLimit(credentials.email);
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
        async signIn({ user, account, profile }) {
            if (account?.provider === 'google') {
                const email = user.email!;
                const providerAccountId = account.providerAccountId;

                const existing = await query<any>(
                    'SELECT * FROM users WHERE email = ?',
                    [email]
                );

                if (existing.length > 0) {
                    const dbUser = existing[0];
                    // Update provider info if not yet linked
                    if (!dbUser.provider_account_id) {
                        await query(
                            "UPDATE users SET provider = 'google', provider_account_id = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
                            [providerAccountId, dbUser.id]
                        );
                    } else {
                        query("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [dbUser.id]).catch(() => {});
                    }
                    user.id = dbUser.id;
                    (user as any).role = dbUser.role;
                } else {
                    // Auto-create new ARCHI account
                    const newId = uuidv4();
                    const name = user.name || email.split('@')[0];
                    await query(
                        `INSERT INTO users (id, email, name, password, role, provider, provider_account_id, created_at)
                         VALUES (?, ?, ?, NULL, 'ARCHI', 'google', ?, NOW())`,
                        [newId, email, name, providerAccountId]
                    );
                    user.id = newId;
                    (user as any).role = 'ARCHI';
                }
                return true;
            }
            return true;
        },
        async jwt({ token, user, account }) {
            if (user) {
                token.role = (user as any).role;
                token.id = user.id;
            }
            // On Google sign-in, role comes from signIn callback via user object
            if (account?.provider === 'google' && (user as any)?.role) {
                token.role = (user as any).role;
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
