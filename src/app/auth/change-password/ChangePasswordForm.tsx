'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, KeyRound } from 'lucide-react';
import { changeOwnPassword } from '@/app/actions/account';

export default function ChangePasswordForm() {
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
        <div className="stat-card bg-card p-10 border border-black/5 shadow-[0_32px_64px_rgba(0,0,0,0.5)]">
            <form onSubmit={handleSubmit} className="space-y-8">
                <p className="text-stone-500 text-sm font-bold leading-relaxed">
                    Ze względów bezpieczeństwa ustaw teraz własne hasło. Musi mieć co najmniej
                    8 znaków oraz zawierać literę i cyfrę. Dopiero po zmianie hasła uzyskasz
                    dostęp do panelu.
                </p>

                {status === 'error' && (
                    <div className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest p-4 rounded-2xl border border-red-800/30 flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0"></div>
                        {message}
                    </div>
                )}

                <div className="space-y-3">
                    <label className="block text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] ml-1">
                        Obecne hasło (tymczasowe)
                    </label>
                    <div className="relative group">
                        <KeyRound className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-600 group-focus-within:text-brand-primary transition-colors" size={18} />
                        <input
                            data-testid="change-password-current"
                            type="password"
                            required
                            className="w-full pl-14 pr-6 py-4 rounded-2xl bg-background border border-black/5 text-stone-900 placeholder:text-stone-700 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-bold"
                            placeholder="Hasło z maila powitalnego"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="block text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] ml-1">
                        Nowe hasło
                    </label>
                    <div className="relative group">
                        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-600 group-focus-within:text-brand-primary transition-colors" size={18} />
                        <input
                            data-testid="change-password-new"
                            type="password"
                            required
                            minLength={8}
                            className="w-full pl-14 pr-6 py-4 rounded-2xl bg-background border border-black/5 text-stone-900 placeholder:text-stone-700 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-bold"
                            placeholder="Min. 8 znaków, litera i cyfra"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="block text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] ml-1">
                        Powtórz nowe hasło
                    </label>
                    <div className="relative group">
                        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-600 group-focus-within:text-brand-primary transition-colors" size={18} />
                        <input
                            data-testid="change-password-confirm"
                            type="password"
                            required
                            minLength={8}
                            className="w-full pl-14 pr-6 py-4 rounded-2xl bg-background border border-black/5 text-stone-900 placeholder:text-stone-700 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-bold"
                            placeholder="Powtórz hasło"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                        />
                    </div>
                </div>

                <button
                    data-testid="change-password-submit"
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full gold-gradient text-black font-black py-5 rounded-[2rem] shadow-[0_20px_40px_rgba(212,175,55,0.2)] hover:shadow-[0_25px_50px_rgba(212,175,55,0.3)] transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs disabled:opacity-50"
                >
                    {status === 'loading' ? 'Zapisywanie...' : 'Ustaw nowe hasło'}
                </button>
            </form>
        </div>
    );
}
