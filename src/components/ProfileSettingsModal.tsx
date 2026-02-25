'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { X, Save, Building, FileText, MapPin, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { updateProfile } from '@/app/actions/architects';

interface ProfileSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData: {
        studio_name: string | null;
        nip: string | null;
        address: string | null;
        bank_account: string | null;
    };
}

export default function ProfileSettingsModal({ isOpen, onClose, initialData }: ProfileSettingsModalProps) {
    const [formData, setFormData] = useState({
        studio_name: initialData.studio_name || '',
        nip: initialData.nip || '',
        address: initialData.address || '',
        bank_account: initialData.bank_account || '',
    });

    const [isPending, startTransition] = useTransition();
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('idle');
        setErrorMsg('');

        startTransition(async () => {
            try {
                const res = await updateProfile(formData);
                if (res.success) {
                    setStatus('success');
                    setTimeout(() => {
                        setStatus('idle');
                        onClose();
                    }, 1500);
                }
            } catch (err: any) {
                setStatus('error');
                setErrorMsg(err.message || 'Wystąpił błąd podczas zapisywania');
            }
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative w-full max-w-lg bg-background border border-black/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="p-8 border-b border-black/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-stone-900 tracking-tight">Ustawienia Profilu</h2>
                        <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">Zarządzaj swoimi danymi biura</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 rounded-2xl bg-black/5 hover:bg-black/10 text-stone-400 hover:text-stone-900 transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">Nazwa Studia / Biura</label>
                            <div className="relative">
                                <Building className="absolute left-4 top-3.5 text-stone-600" size={18} />
                                <input
                                    type="text"
                                    value={formData.studio_name}
                                    onChange={(e) => setFormData({ ...formData, studio_name: e.target.value })}
                                    className="w-full bg-black/5 border border-black/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-stone-900 placeholder:text-stone-700 focus:outline-none focus:border-brand-primary/50 transition-all font-bold"
                                    placeholder="np. Design Studio"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">NIP</label>
                                <div className="relative">
                                    <FileText className="absolute left-4 top-3.5 text-stone-600" size={18} />
                                    <input
                                        type="text"
                                        value={formData.nip}
                                        onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                                        className="w-full bg-black/5 border border-black/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-stone-900 focus:outline-none focus:border-brand-primary/50 transition-all font-bold"
                                        placeholder="000-000-00-00"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">Numer Konta</label>
                                <div className="relative">
                                    <CreditCard className="absolute left-4 top-3.5 text-stone-600" size={18} />
                                    <input
                                        type="text"
                                        value={formData.bank_account}
                                        onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
                                        className="w-full bg-black/5 border border-black/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-stone-900 focus:outline-none focus:border-brand-primary/50 transition-all font-bold"
                                        placeholder="Kontroluj przelewy"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">Adres</label>
                            <div className="relative">
                                <MapPin className="absolute left-4 top-3.5 text-stone-600" size={18} />
                                <textarea
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full bg-black/5 border border-black/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-stone-900 focus:outline-none focus:border-brand-primary/50 transition-all font-bold min-h-[100px] resize-none"
                                    placeholder="ul. Kolorowa 1, 00-001 Miasto"
                                />
                            </div>
                        </div>
                    </div>

                    {status === 'success' && (
                        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-600">
                            <CheckCircle2 size={18} />
                            <p className="text-xs font-bold">Zmiany zostały zapisane!</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-600">
                            <AlertCircle size={18} />
                            <p className="text-xs font-bold">{errorMsg}</p>
                        </div>
                    )}

                    <p className="text-center text-[10px] text-stone-400">
                        Korzystając z portalu akceptujesz{' '}
                        <Link href="/regulamin" target="_blank" className="text-brand-primary hover:underline font-bold">
                            Regulamin Programu Partnerskiego
                        </Link>
                    </p>

                    <div className="pt-2 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 px-6 rounded-2xl bg-black/5 hover:bg-black/10 text-stone-400 text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                            Anuluj
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="flex-[2] py-4 px-6 rounded-2xl bg-brand-primary text-black text-[10px] font-black uppercase tracking-widest hover:bg-brand-secondary transition-all flex items-center justify-center gap-2 shadow-[0_8px_32px_rgba(212,175,55,0.2)] disabled:opacity-50"
                        >
                            {isPending ? 'Zapisywanie...' : (
                                <>
                                    <Save size={14} />
                                    Zapisz Zmiany
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
