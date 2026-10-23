'use client';

import React, { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { updateProfile } from '@/app/actions/architects';
import { Banner, Button } from '@/components/ui';

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

const FIELD = 'h-10 w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10';
const LABEL = 'text-[13px] font-semibold text-ink-2';

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

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

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
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="profile-modal-title"
                className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-lg bg-surface shadow-float sm:rounded-lg"
            >
                <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                    <div>
                        <h2 id="profile-modal-title" className="font-display text-2xl font-normal leading-tight text-ink">Ustawienia profilu</h2>
                        <p className="mt-1 text-sm text-ink-2">Dane biura potrzebne do faktury i przelewu prowizji.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Zamknij"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="ps-studio" className={LABEL}>Nazwa studia lub biura</label>
                            <input
                                id="ps-studio"
                                type="text"
                                value={formData.studio_name}
                                onChange={(e) => setFormData({ ...formData, studio_name: e.target.value })}
                                className={FIELD}
                                placeholder="np. Design Studio"
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="ps-nip" className={LABEL}>NIP</label>
                                <input
                                    id="ps-nip"
                                    type="text"
                                    value={formData.nip}
                                    onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                                    className={`${FIELD} tnum`}
                                    placeholder="000-000-00-00"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="ps-bank" className={LABEL}>Numer konta</label>
                                <input
                                    id="ps-bank"
                                    type="text"
                                    value={formData.bank_account}
                                    onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
                                    className={`${FIELD} tnum`}
                                    placeholder="Numer rachunku do przelewu"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="ps-address" className={LABEL}>Adres</label>
                            <textarea
                                id="ps-address"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                className="min-h-[88px] w-full resize-none rounded-sm border border-border-strong bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
                                placeholder="ul. Kolorowa 1, 00-001 Miasto"
                            />
                        </div>

                        {status === 'success' && <Banner tone="success" title="Zmiany zostały zapisane" />}
                        {status === 'error' && <Banner tone="danger" title="Nie udało się zapisać profilu">{errorMsg}</Banner>}

                        <p className="text-xs text-ink-2">
                            Korzystając z portalu akceptujesz{' '}
                            <Link href="/regulamin" target="_blank" className="font-semibold text-brass-ink underline underline-offset-2">
                                Regulamin Programu Partnerskiego
                            </Link>
                            .
                        </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
                        <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
                        <Button type="submit" loading={isPending}>Zapisz zmiany</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
