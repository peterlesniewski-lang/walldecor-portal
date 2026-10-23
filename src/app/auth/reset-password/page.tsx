'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Banner, Button } from '@/components/ui';
import { PASSWORD_POLICY_HINT } from '@/lib/passwordPolicy';
import { AuthShell, AuthField, AUTH_INPUT } from '../AuthShell';

function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Brak tokenu resetującego. Sprawdź link z emaila.');
        }
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirm) {
            setStatus('error');
            setMessage('Hasła nie są identyczne.');
            return;
        }

        if (password.length < 8) {
            setStatus('error');
            setMessage('Hasło musi mieć co najmniej 8 znaków.');
            return;
        }

        setStatus('loading');
        setMessage('');

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();

            if (res.ok) {
                setStatus('success');
            } else {
                setStatus('error');
                setMessage(data.error || 'Wystąpił błąd. Spróbuj ponownie.');
            }
        } catch {
            setStatus('error');
            setMessage('Wystąpił błąd. Spróbuj ponownie.');
        }
    };

    if (status === 'success') {
        return (
            <div className="space-y-5 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
                    <ShieldCheck size={22} aria-hidden="true" />
                </div>
                <div>
                    <p className="font-display text-xl text-ink">Hasło zmienione</p>
                    <p className="mt-2 text-sm text-ink-2">Możesz teraz zalogować się nowym hasłem.</p>
                </div>
                <Button fullWidth onClick={() => router.push('/auth/signin')}>
                    Przejdź do logowania
                </Button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-sm leading-relaxed text-ink-2">
                Ustaw nowe hasło dla swojego konta. Musi mieć co najmniej 8 znaków.
            </p>

            {status === 'error' && <Banner tone="danger">{message}</Banner>}

            <AuthField id="reset-password" label="Nowe hasło" hint={PASSWORD_POLICY_HINT}>
                <input
                    id="reset-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={AUTH_INPUT}
                    placeholder="Min. 8 znaków"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
            </AuthField>

            <AuthField id="reset-confirm" label="Powtórz hasło">
                <input
                    id="reset-confirm"
                    name="confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={AUTH_INPUT}
                    placeholder="Powtórz hasło"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                />
            </AuthField>

            <Button type="submit" fullWidth loading={status === 'loading'} disabled={!token}>
                {status === 'loading' ? 'Zapisywanie...' : 'Ustaw nowe hasło'}
            </Button>

            <div className="text-center">
                <Link href="/auth/signin" className="inline-flex items-center gap-2 text-[13px] font-semibold text-brass-ink hover:underline">
                    <ArrowLeft size={14} aria-hidden="true" />
                    Wróć do logowania
                </Link>
            </div>
        </form>
    );
}

export default function ResetPassword() {
    return (
        <AuthShell title="Nowe hasło" subtitle="Portal Partnera WallDecor">
            <Suspense fallback={<p className="text-center text-sm text-ink-2">Ładowanie...</p>}>
                <ResetPasswordForm />
            </Suspense>
        </AuthShell>
    );
}
