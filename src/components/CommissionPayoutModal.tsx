'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Upload, FileText, CheckCircle2 } from 'lucide-react';
import { requestCommissionPayout } from '@/app/actions/projects';
import { Banner, Button, cx, formatPLN } from '@/components/ui';

interface CommissionPayoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    amount: number;
    projectNames: string[];
}

export default function CommissionPayoutModal({ isOpen, onClose, amount, projectNames }: CommissionPayoutModalProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleClose = () => {
        const wasSuccess = success;
        onClose();
        if (wasSuccess) router.refresh();
    };

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                if (success) router.refresh();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose, success, router]);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected && selected.type === 'application/pdf') {
            setFile(selected);
            setError(null);
        } else if (selected) {
            setError('Załącz plik w formacie PDF.');
            setFile(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError('Załączenie faktury w formacie PDF jest wymagane.');
            return;
        }

        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('amount', amount.toString());
        formData.append('invoice', file);

        try {
            const res = await requestCommissionPayout(formData);
            if (res.success) {
                setConfirmedAmount(amount);
                setSuccess(true);
            }
        } catch (err: any) {
            setError(err.message || 'Wystąpił błąd podczas zgłaszania wypłaty.');
        } finally {
            setLoading(false);
        }
    };

    const projectListText = projectNames.join(', ');

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-ink/40" onClick={handleClose} aria-hidden="true" />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="payout-modal-title"
                className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-lg bg-surface shadow-float sm:rounded-lg"
            >
                <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                    <div>
                        <h3 id="payout-modal-title" className="font-display text-2xl font-normal leading-tight text-ink">
                            {success ? 'Wniosek złożony' : 'Wypłata prowizji'}
                        </h3>
                        {!success && <p className="mt-1 text-sm text-ink-2">Wypłacamy całą dostępną kwotę, na podstawie Twojej faktury.</p>}
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Zamknij"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                {success ? (
                    <div className="px-6 py-10 text-center" role="status">
                        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                            <CheckCircle2 size={28} aria-hidden="true" />
                        </div>
                        <p className="mx-auto max-w-sm text-sm leading-relaxed text-ink-2">
                            Twoja prośba o wypłatę <strong className="tnum text-ink">{formatPLN(confirmedAmount || amount)}</strong> została przekazana do weryfikacji przez administratora.
                        </p>
                        <div className="mt-6 flex justify-center">
                            <Button onClick={handleClose}>Zamknij</Button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                            <div className="rounded-md border border-border bg-surface-2 p-4">
                                <p className="mb-3 text-sm font-semibold text-ink">Wskazówki do faktury</p>
                                <dl className="space-y-3 text-sm">
                                    <div className="flex items-baseline justify-between gap-4">
                                        <dt className="text-ink-2">Kwota (netto)</dt>
                                        <dd className="tnum font-semibold text-ink">{formatPLN(amount)}</dd>
                                    </div>
                                    <div>
                                        <dt className="mb-1 text-ink-2">Tytuł faktury</dt>
                                        <dd className="rounded-sm border border-border bg-surface px-3 py-2 text-[13px] font-medium text-ink">
                                            konsultacja projektowa + {projectListText}
                                        </dd>
                                    </div>
                                    <div className="flex items-baseline justify-between gap-4">
                                        <dt className="text-ink-2">Termin płatności</dt>
                                        <dd className="font-semibold text-ink">14 dni</dd>
                                    </div>
                                    <div className="flex items-baseline justify-between gap-4">
                                        <dt className="text-ink-2">Sposób płatności</dt>
                                        <dd className="font-semibold text-ink">Przelew bankowy</dd>
                                    </div>
                                </dl>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <span className="text-[13px] font-semibold text-ink-2">Faktura (PDF)</span>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    className="hidden"
                                    accept=".pdf"
                                    aria-label="Wybierz plik faktury w formacie PDF"
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className={cx(
                                        'flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-7 text-center transition-colors',
                                        file ? 'border-success bg-success-soft' : 'border-border-strong bg-surface hover:border-ink-3',
                                    )}
                                >
                                    {file ? (
                                        <>
                                            <FileText size={22} className="text-success" aria-hidden="true" />
                                            <span className="max-w-full truncate text-sm font-semibold text-ink">{file.name}</span>
                                            <span className="text-xs text-ink-2">Kliknij, aby zmienić plik</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={22} className="text-ink-3" aria-hidden="true" />
                                            <span className="text-sm font-semibold text-ink">Wybierz fakturę w formacie PDF</span>
                                            <span className="text-xs text-ink-2">Kliknij, aby wskazać plik</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {error && <Banner tone="danger" title="Nie można złożyć wniosku">{error}</Banner>}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
                            <Button type="button" variant="ghost" onClick={handleClose}>Anuluj</Button>
                            <Button type="submit" loading={loading} disabled={!file}>Złóż wniosek o wypłatę</Button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
