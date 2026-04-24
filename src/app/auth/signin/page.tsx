'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LogIn, ShieldCheck, Mail, Lock } from 'lucide-react';
import Link from 'next/link';

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
    const router = useRouter();

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
            setError(res.error === 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za 5 minut.'
                ? res.error
                : 'Błędny email lub hasło');
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
        <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
            {/* Background Aura */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-primary/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-12">
                    <div className="w-16 h-16 gold-gradient rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_20px_40px_rgba(212,175,55,0.2)]">
                        <ShieldCheck size={32} className="text-black" />
                    </div>
                    <h1 className="text-3xl font-black text-stone-900 tracking-tight leading-none mb-3">
                        Witaj ponownie
                    </h1>
                    <p className="text-stone-500 font-bold text-sm uppercase tracking-widest">
                        Panel Architekta <span className="text-brand-primary mx-1">/</span> WallDecor
                    </p>
                </div>

                <div className="stat-card bg-card p-10 border border-black/5 shadow-[0_32px_64px_rgba(0,0,0,0.5)]">
                    {/* Google Sign In */}
                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={googleLoading || loading}
                        className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl border border-black/10 bg-white hover:bg-stone-50 transition-all font-bold text-stone-700 text-sm disabled:opacity-50 shadow-sm hover:shadow-md mb-8"
                    >
                        {googleLoading ? (
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">Przekierowanie...</span>
                        ) : (
                            <>
                                <GoogleIcon />
                                Zaloguj się przez Google
                            </>
                        )}
                    </button>

                    {/* Separator */}
                    <div className="flex items-center gap-4 mb-8">
                        <div className="flex-1 h-px bg-black/5"></div>
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em]">lub</span>
                        <div className="flex-1 h-px bg-black/5"></div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {error && (
                            <div className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest p-4 rounded-2xl border border-red-800/30 flex items-center gap-3">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0"></div>
                                {error}
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
                                    className="w-full pl-14 pr-6 py-4 rounded-2xl bg-background border border-black/5 text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-bold"
                                    placeholder="architekt@walldecor.pl"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between ml-1">
                                <label className="block text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">
                                    Hasło
                                </label>
                                <Link
                                    href="/auth/forgot-password"
                                    className="text-[10px] font-black text-brand-primary uppercase tracking-[0.15em] hover:underline"
                                >
                                    Zapomniałeś?
                                </Link>
                            </div>
                            <div className="relative group">
                                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-600 group-focus-within:text-brand-primary transition-colors" size={18} />
                                <input
                                    type="password"
                                    required
                                    className="w-full pl-14 pr-6 py-4 rounded-2xl bg-background border border-black/5 text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-bold"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || googleLoading}
                            className="w-full gold-gradient text-black font-black py-5 rounded-[2rem] shadow-[0_20px_40px_rgba(212,175,55,0.2)] hover:shadow-[0_25px_50px_rgba(212,175,55,0.3)] transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs disabled:opacity-50"
                        >
                            {loading ? 'Logowanie...' : (
                                <>
                                    <LogIn size={20} />
                                    Zaloguj się
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <div className="text-center mt-10 space-y-4">
                    <div className="flex items-center justify-center gap-4 opacity-50">
                        <span className="text-[10px] font-bold text-stone-500 uppercase tracking-[0.3em]">v1.2 Premium Edition</span>
                        <span className="text-stone-300">·</span>
                        <a href="/regulamin" target="_blank" className="text-[10px] font-bold text-stone-500 uppercase tracking-[0.3em] hover:text-brand-primary transition-colors">
                            Regulamin
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
