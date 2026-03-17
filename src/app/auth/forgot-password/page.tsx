'use client';

import { useState } from 'react';
import { Mail, ArrowLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

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
        <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-primary/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-12">
                    <div className="w-16 h-16 gold-gradient rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_20px_40px_rgba(212,175,55,0.2)]">
                        <ShieldCheck size={32} className="text-black" />
                    </div>
                    <h1 className="text-3xl font-black text-stone-900 tracking-tight leading-none mb-3">
                        Reset hasła
                    </h1>
                    <p className="text-stone-500 font-bold text-sm uppercase tracking-widest">
                        Panel Architekta <span className="text-brand-primary mx-1">/</span> WallDecor
                    </p>
                </div>

                <div className="stat-card bg-card p-10 border border-black/5 shadow-[0_32px_64px_rgba(0,0,0,0.5)]">
                    {status === 'sent' ? (
                        <div className="text-center space-y-6">
                            <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto border border-green-200">
                                <Mail size={24} className="text-green-600" />
                            </div>
                            <div>
                                <p className="text-stone-900 font-black text-lg mb-2">Sprawdź skrzynkę</p>
                                <p className="text-stone-500 text-sm font-bold leading-relaxed">
                                    Jeśli konto z tym adresem istnieje, wysłaliśmy link do resetu hasła. Link jest ważny przez <span className="text-stone-700">1 godzinę</span>.
                                </p>
                            </div>
                            <Link
                                href="/auth/signin"
                                className="inline-flex items-center gap-2 text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] hover:underline"
                            >
                                <ArrowLeft size={14} />
                                Wróć do logowania
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-8">
                            <p className="text-stone-500 text-sm font-bold leading-relaxed">
                                Podaj adres email powiązany z kontem. Wyślemy link do ustawienia nowego hasła.
                            </p>

                            {status === 'error' && (
                                <div className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest p-4 rounded-2xl border border-red-800/30 flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0"></div>
                                    {message}
                                </div>
                            )}

                            <div className="space-y-3">
                                <label className="block text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] ml-1">
                                    Email
                                </label>
                                <div className="relative group">
                                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-600 group-focus-within:text-brand-primary transition-colors" size={18} />
                                    <input
                                        type="email"
                                        required
                                        className="w-full pl-14 pr-6 py-4 rounded-2xl bg-background border border-black/5 text-stone-900 placeholder:text-stone-700 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-bold"
                                        placeholder="architekt@walldecor.pl"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="w-full gold-gradient text-black font-black py-5 rounded-[2rem] shadow-[0_20px_40px_rgba(212,175,55,0.2)] hover:shadow-[0_25px_50px_rgba(212,175,55,0.3)] transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs disabled:opacity-50"
                            >
                                {status === 'loading' ? 'Wysyłanie...' : 'Wyślij link resetujący'}
                            </button>

                            <div className="text-center">
                                <Link
                                    href="/auth/signin"
                                    className="inline-flex items-center gap-2 text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] hover:text-brand-primary transition-colors"
                                >
                                    <ArrowLeft size={14} />
                                    Wróć do logowania
                                </Link>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
