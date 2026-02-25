'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LogIn, ShieldCheck, Mail, Lock } from 'lucide-react';

export default function SignIn() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
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
            setError('Błędny email lub hasło');
            setLoading(false);
        } else {
            router.push('/dashboard');
        }
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
                        Witaj ponowinie
                    </h1>
                    <p className="text-stone-500 font-bold text-sm uppercase tracking-widest">
                        Panel Architekta <span className="text-brand-primary mx-1">/</span> WallDecor
                    </p>
                </div>

                <div className="stat-card bg-card p-10 border border-black/5 shadow-[0_32px_64px_rgba(0,0,0,0.5)]">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {error && (
                            <div className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest p-4 rounded-2xl border border-red-800/30 flex items-center gap-3 animate-in shake duration-300">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
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
                                    className="w-full pl-14 pr-6 py-4 rounded-2xl bg-background border border-black/5 text-stone-900 placeholder:text-stone-700 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-bold"
                                    placeholder="architekt@walldecor.pl"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] ml-1">
                                Hasło
                            </label>
                            <div className="relative group">
                                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-600 group-focus-within:text-brand-primary transition-colors" size={18} />
                                <input
                                    type="password"
                                    required
                                    className="w-full pl-14 pr-6 py-4 rounded-2xl bg-background border border-black/5 text-stone-900 placeholder:text-stone-700 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-bold"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
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
                    <p className="text-[10px] font-black text-stone-600 uppercase tracking-widest">
                        Zapomniałeś hasła? <button className="text-brand-primary hover:underline ml-1">Skontaktuj się z administratorem</button>
                    </p>
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
