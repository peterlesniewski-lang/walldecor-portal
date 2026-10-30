'use client';

import { useEffect, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Banner, Button } from '@/components/ui';
import { AuthShell, AuthField, AUTH_INPUT } from '../AuthShell';
import { INTERNAL_MODE_LOGIN_MESSAGE } from '@/lib/internalMode';

// Komunikaty z authorize pokazywane dosłownie; każdy inny błąd → ogólne „Błędny email lub hasło”.
const PASSTHROUGH_ERRORS = new Set([
    'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za 5 minut.',
    INTERNAL_MODE_LOGIN_MESSAGE,
]);

function GoogleIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
    );
}

export default function SignIn() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [hasGoogleProvider, setHasGoogleProvider] = useState(false);
    const router = useRouter();

    useEffect(() => {
        getProviders()
            .then((providers) => {
                setHasGoogleProvider(Boolean(providers?.google));
            })
            .catch(() => {
                setHasGoogleProvider(false);
            });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const res = await signIn('credentials', {
            email,
            password,
            redirect: false,
        });

        if (res?.error) {
            setError(PASSTHROUGH_ERRORS.has(res.error) ? res.error : 'Błędny email lub hasło');
            setLoading(false);
        } else {
            router.push('/dashboard');
        }
    };

    const handleGoogleSignIn = async () => {
        setGoogleLoading(true);
        await signIn('google', { callbackUrl: '/dashboard' });
    };

    return (
        <AuthShell title="Witaj ponownie" subtitle="Portal Partnera WallDecor">
            {/* Google Sign In */}
            {hasGoogleProvider && (
                <>
                    <Button
                        variant="secondary"
                        fullWidth
                        icon={<GoogleIcon />}
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        loading={googleLoading}
                    >
                        {googleLoading ? 'Przekierowanie...' : 'Zaloguj się przez Google'}
                    </Button>

                    <div className="my-6 flex items-center gap-4" role="separator" aria-label="lub">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[13px] text-ink-2">lub</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                </>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                {error && <Banner tone="danger">{error}</Banner>}

                <AuthField id="signin-email" label="Email">
                    <input
                        id="signin-email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        className={AUTH_INPUT}
                        placeholder="architekt@walldecor.pl"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </AuthField>

                <AuthField
                    id="signin-password"
                    label="Hasło"
                    labelAside={
                        <Link href="/auth/forgot-password" className="text-[13px] font-semibold text-brass-ink hover:underline">
                            Zapomniałeś hasła?
                        </Link>
                    }
                >
                    <input
                        id="signin-password"
                        name="password"
                        type="password"
                        required
                        autoComplete="current-password"
                        className={AUTH_INPUT}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </AuthField>

                <Button type="submit" fullWidth loading={loading} disabled={googleLoading}>
                    {loading ? 'Logowanie...' : 'Zaloguj się'}
                </Button>
            </form>
        </AuthShell>
    );
}
