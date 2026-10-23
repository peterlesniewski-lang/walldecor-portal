'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changeOwnPassword } from '@/app/actions/account';
import { Banner, Button } from '@/components/ui';
import { PASSWORD_POLICY_HINT } from '@/lib/passwordPolicy';
import { AuthShell, AuthField, AUTH_INPUT } from '../AuthShell';

function ChangePasswordForm() {
    const router = useRouter();

    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirm) {
            setStatus('error');
            setMessage('Hasła nie są identyczne.');
            return;
        }

        setStatus('loading');
        setMessage('');

        try {
            await changeOwnPassword(currentPassword, password);
            router.push('/dashboard');
            router.refresh();
        } catch (err: any) {
            setStatus('error');
            setMessage(err.message || 'Wystąpił błąd. Spróbuj ponownie.');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-sm leading-relaxed text-ink-2">
                Ze względów bezpieczeństwa ustaw teraz własne hasło. Musi mieć co najmniej
                8 znaków oraz zawierać literę i cyfrę. Dopiero po zmianie hasła uzyskasz
                dostęp do panelu.
            </p>

            {status === 'error' && <Banner tone="danger">{message}</Banner>}

            <AuthField id="change-current" label="Obecne hasło (tymczasowe)">
                <input
                    id="change-current"
                    name="currentPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                    className={AUTH_INPUT}
                    placeholder="Hasło z maila powitalnego"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                />
            </AuthField>

            <AuthField id="change-new" label="Nowe hasło" hint={PASSWORD_POLICY_HINT}>
                <input
                    id="change-new"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={AUTH_INPUT}
                    placeholder="Min. 8 znaków, litera i cyfra"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
            </AuthField>

            <AuthField id="change-confirm" label="Powtórz nowe hasło">
                <input
                    id="change-confirm"
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

            <Button type="submit" fullWidth loading={status === 'loading'}>
                {status === 'loading' ? 'Zapisywanie...' : 'Ustaw nowe hasło'}
            </Button>
        </form>
    );
}

export default function ChangePassword() {
    return (
        <AuthShell title="Zmień hasło" subtitle="Portal Partnera WallDecor">
            <ChangePasswordForm />
        </AuthShell>
    );
}
