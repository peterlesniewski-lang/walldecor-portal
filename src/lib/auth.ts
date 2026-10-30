import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { query } from './db';
import { authorizeCredentials } from './authorizeCredentials';
import { internalModeSignInRefusal } from './internalMode';

const authProviders: NextAuthOptions['providers'] = [
    CredentialsProvider({
        name: 'WallDecor Portal',
        credentials: {
            email: { label: "Email", type: "text" },
            password: { label: "Password", type: "password" }
        },
        authorize: authorizeCredentials,
    })
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    authProviders.push(
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })
    );
}

export const authOptions: NextAuthOptions = {
    session: {
        strategy: 'jwt',
    },
    providers: authProviders,
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
                    // Tryb wewnętrzny: architekt nie loguje się także przez Google — wraca na naszą stronę logowania.
                    const refusal = internalModeSignInRefusal(dbUser.role);
                    if (refusal) return refusal;
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
                    return false;
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
