'use client';

import { useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Banner, Button } from '@/components/ui';
import { AuthShell, AuthField, AUTH_INPUT } from '../AuthShell';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();

            if (res.ok) {
                setStatus('sent');
            } else {
                setStatus('error');
                setMessage(data.error || 'Wystąpił błąd. Spróbuj ponownie.');
            }
        } catch {
            setStatus('error');
            setMessage('Wystąpił błąd. Spróbuj ponownie.');
        }
    };

    return (
        <AuthShell title="Reset hasła" subtitle="Portal Partnera WallDecor">
            {status === 'sent' ? (
                <div className="space-y-5 text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
                        <Mail size={22} aria-hidden="true" />
                    </div>
                    <div>
                        <p className="font-display text-xl text-ink">Sprawdź skrzynkę</p>
                        <p className="mt-2 text-sm leading-relaxed text-ink-2">
                            Jeśli konto z tym adresem istnieje, wysłaliśmy link do resetu hasła. Link jest ważny przez <strong className="font-semibold text-ink">1 godzinę</strong>.
                        </p>
                    </div>
                    <Button href="/auth/signin" variant="secondary" fullWidth icon={<ArrowLeft size={16} />}>
                        Wróć do logowania
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    <p className="text-sm leading-relaxed text-ink-2">
                        Podaj adres email powiązany z kontem. Wyślemy link do ustawienia nowego hasła.
                    </p>

                    {status === 'error' && <Banner tone="danger">{message}</Banner>}

                    <AuthField id="forgot-email" label="Email">
                        <input
                            id="forgot-email"
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

                    <Button type="submit" fullWidth loading={status === 'loading'}>
                        {status === 'loading' ? 'Wysyłanie...' : 'Wyślij link resetujący'}
                    </Button>

                    <div className="text-center">
                        <Link href="/auth/signin" className="inline-flex items-center gap-2 text-[13px] font-semibold text-brass-ink hover:underline">
                            <ArrowLeft size={14} aria-hidden="true" />
                            Wróć do logowania
                        </Link>
                    </div>
                </form>
            )}
        </AuthShell>
    );
}
