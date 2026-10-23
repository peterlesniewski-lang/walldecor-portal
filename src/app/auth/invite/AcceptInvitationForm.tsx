'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Banner, Button } from '@/components/ui';
import { PASSWORD_POLICY_HINT } from '@/lib/passwordPolicy';
import { AuthField, AUTH_INPUT } from '../AuthShell';

interface Props {
    token: string;
    email: string;
    initialName: string;
    initialStudio: string;
}

export default function AcceptInvitationForm({ token, email, initialName, initialStudio }: Props) {
    const router = useRouter();
    const [name, setName] = useState(initialName);
    const [studio, setStudio] = useState(initialStudio);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            setStatus('error');
            setMessage('Hasła nie są identyczne.');
            return;
        }
        if (!acceptTerms) {
            setStatus('error');
            setMessage('Zaakceptuj regulamin, aby założyć konto.');
            return;
        }

        setStatus('loading');
        setMessage('');
        try {
            const res = await fetch('/api/auth/accept-invitation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, name, studio_name: studio, password, acceptTerms }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setStatus('error');
                setMessage(data.error || 'Nie udało się aktywować konta. Spróbuj ponownie.');
                return;
            }

            setStatus('success');
            // Konto założone: logujemy od razu tym samym hasłem; w razie niepowodzenia zostaje ekran z przyciskiem.
            const login = await signIn('credentials', { email, password, redirect: false });
            if (!login?.error) router.push('/dashboard');
        } catch {
            setStatus('error');
            setMessage('Wystąpił błąd połączenia. Spróbuj ponownie.');
        }
    };

    if (status === 'success') {
        return (
            <div className="space-y-5 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
                    <CheckCircle2 size={22} aria-hidden="true" />
                </div>
                <div>
                    <p className="font-display text-xl text-ink">Konto aktywne</p>
                    <p className="mt-2 text-sm text-ink-2">Logujemy Cię do panelu. Jeśli nic się nie dzieje, użyj przycisku poniżej.</p>
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
                Zostałeś zaproszony do Panelu Architekta WallDecor. Uzupełnij dane i ustaw hasło, aby aktywować konto.
            </p>

            {status === 'error' && <Banner tone="danger">{message}</Banner>}

            <AuthField id="invite-email" label="Login (email)">
                <input
                    id="invite-email"
                    type="email"
                    value={email}
                    readOnly
                    disabled
                    className={`${AUTH_INPUT} bg-surface-2`}
                />
            </AuthField>

            <AuthField id="invite-name" label="Imię i nazwisko">
                <input
                    id="invite-name"
                    name="name"
                    type="text"
                    required
                    minLength={3}
                    maxLength={120}
                    autoComplete="name"
                    className={AUTH_INPUT}
                    placeholder="Jan Kowalski"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </AuthField>

            <AuthField id="invite-studio" label="Nazwa pracowni" hint="Opcjonalnie. Możesz uzupełnić później w ustawieniach profilu.">
                <input
                    id="invite-studio"
                    name="studio_name"
                    type="text"
                    maxLength={120}
                    autoComplete="organization"
                    className={AUTH_INPUT}
                    placeholder="Studio Kowalski"
                    value={studio}
                    onChange={(e) => setStudio(e.target.value)}
                />
            </AuthField>

            <AuthField id="invite-password" label="Hasło" hint={PASSWORD_POLICY_HINT}>
                <input
                    id="invite-password"
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

            <AuthField id="invite-confirm" label="Powtórz hasło">
                <input
                    id="invite-confirm"
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

            <label htmlFor="invite-terms" className="flex items-start gap-3 text-[13px] leading-relaxed text-ink-2">
                <input
                    id="invite-terms"
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
                />
                <span>
                    Akceptuję{' '}
                    <Link href="/regulamin" target="_blank" className="font-semibold text-brass-ink hover:underline">
                        regulamin programu partnerskiego WallDecor
                    </Link>
                    .
                </span>
            </label>

            <Button type="submit" fullWidth loading={status === 'loading'} disabled={!acceptTerms}>
                {status === 'loading' ? 'Aktywowanie...' : 'Aktywuj konto'}
            </Button>
        </form>
    );
}
