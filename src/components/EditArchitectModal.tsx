'use client';

import React, { useState, useEffect, useId } from 'react';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import { getArchitectById, updateArchitect } from '@/app/actions/projects';
import { updateArchitectAdminFields } from '@/app/actions/architects';
import { Banner, Button, cx } from '@/components/ui';

interface EditArchitectModalProps {
    isOpen: boolean;
    onClose: () => void;
    architectId: string | null;
}

type FieldKey = 'first_name' | 'last_name' | 'email' | 'nip' | 'subiekt_code';

/** Przypisuje komunikat z serwera do pola, którego dotyczy (bez zmiany walidacji po stronie serwera). */
function fieldForError(message: string): FieldKey | null {
    if (/email/i.test(message)) return 'email';
    if (/imię/i.test(message)) return 'first_name';
    if (/nazwisko/i.test(message)) return 'last_name';
    if (/\bnip\b/i.test(message)) return 'nip';
    if (/\bkod\b/i.test(message)) return 'subiekt_code';
    return null;
}

const INPUT = 'h-10 w-full rounded-sm border bg-surface px-3 text-sm text-ink placeholder:text-ink-3';
const LABEL = 'mb-1.5 block text-[13px] font-semibold text-ink';

export default function EditArchitectModal({ isOpen, onClose, architectId }: EditArchitectModalProps) {
    const titleId = useId();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        studio_name: '',
        nip: '',
        address: '',
        bank_account: '',
        is_vat_payer: false,
        subiekt_code: ''
    });

    useEffect(() => {
        if (isOpen && architectId) {
            setFetching(true);
            setError(null);
            getArchitectById(architectId)
                .then(data => {
                    if (data) {
                        setFormData({
                            first_name: data.first_name || '',
                            last_name: data.last_name || '',
                            email: data.email || '',
                            studio_name: data.studio_name || '',
                            nip: data.nip || '',
                            address: data.address || '',
                            bank_account: data.bank_account || '',
                            is_vat_payer: data.is_vat_payer === 1 || data.is_vat_payer === true,
                            subiekt_code: data.subiekt_code || ''
                        });
                    }
                })
                .catch(err => setError('Błąd podczas pobierania danych architekta.'))
                .finally(() => setFetching(false));
        }
    }, [isOpen, architectId]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const errorField = error ? fieldForError(error) : null;
    const fieldError = (key: FieldKey) => (errorField === key ? error : null);
    const formError = error && !errorField ? error : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!architectId) return;

        setLoading(true);
        setError(null);

        try {
            // Kod najpierw: jego błąd (zajęty / zły format) nie zostawia częściowo zapisanych danych profilu.
            const { subiekt_code, ...profile } = formData;
            const saved = await updateArchitectAdminFields(architectId, { subiekt_code });
            await updateArchitect(architectId, profile);
            setFormData(prev => ({ ...prev, subiekt_code: saved.subiekt_code ?? '' }));
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                onClose();
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Wystąpił błąd podczas aktualizacji danych.');
        } finally {
            setLoading(false);
        }
    };

    const inputProps = (key: FieldKey) => ({
        'aria-invalid': fieldError(key) ? true : undefined,
        'aria-describedby': fieldError(key) ? `${titleId}-${key}-err` : undefined,
        className: cx(INPUT, fieldError(key) ? 'border-danger' : 'border-border-strong'),
    });

    const renderError = (key: FieldKey) =>
        fieldError(key) ? (
            <p id={`${titleId}-${key}-err`} role="alert" className="mt-1.5 text-[13px] text-danger">{fieldError(key)}</p>
        ) : null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 text-left">
            <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-lg bg-surface shadow-float"
            >
                <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                    <div>
                        <h2 id={titleId} className="font-display text-xl font-normal text-ink">Edytuj dane architekta</h2>
                        <p className="mt-1 text-sm text-ink-2">Zaktualizuj dane profilowe partnera.</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-8 px-0!"
                        aria-label="Zamknij"
                        icon={<X size={16} aria-hidden="true" />}
                        onClick={onClose}
                    />
                </div>

                {fetching ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="status">
                        <Loader2 className="animate-spin text-ink-2" size={28} aria-hidden="true" />
                        <p className="text-sm text-ink-2">Pobieranie danych...</p>
                    </div>
                ) : success ? (
                    <div className="space-y-3 px-6 py-12 text-center" role="status">
                        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
                            <CheckCircle2 size={24} aria-hidden="true" />
                        </span>
                        <h3 className="text-lg font-semibold text-ink">Dane zostały zaktualizowane</h3>
                        <p className="text-sm text-ink-2">Zmiany zostały zapisane.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                        <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-6 overflow-y-auto px-6 py-6 md:grid-cols-2">
                            {/* Dane osobowe */}
                            <fieldset className="min-w-0 space-y-4">
                                <legend className="label-caps mb-4">Dane osobowe</legend>
                                <div>
                                    <label className={LABEL} htmlFor={`${titleId}-first_name`}>Imię</label>
                                    <input
                                        id={`${titleId}-first_name`}
                                        required
                                        type="text"
                                        {...inputProps('first_name')}
                                        value={formData.first_name}
                                        onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                    />
                                    {renderError('first_name')}
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor={`${titleId}-last_name`}>Nazwisko</label>
                                    <input
                                        id={`${titleId}-last_name`}
                                        required
                                        type="text"
                                        {...inputProps('last_name')}
                                        value={formData.last_name}
                                        onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                    />
                                    {renderError('last_name')}
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor={`${titleId}-email`}>Email</label>
                                    <input
                                        id={`${titleId}-email`}
                                        required
                                        type="email"
                                        {...inputProps('email')}
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                    {renderError('email')}
                                </div>
                            </fieldset>

                            {/* Dane firmowe */}
                            <fieldset className="min-w-0 space-y-4">
                                <legend className="label-caps mb-4">Dane firmowe lub freelance</legend>
                                <div>
                                    <label className={LABEL} htmlFor={`${titleId}-studio`}>Nazwa pracowni</label>
                                    <input
                                        id={`${titleId}-studio`}
                                        type="text"
                                        placeholder="Opcjonalnie"
                                        className={cx(INPUT, 'border-border-strong')}
                                        value={formData.studio_name}
                                        onChange={e => setFormData({ ...formData, studio_name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor={`${titleId}-nip`}>NIP</label>
                                    <input
                                        id={`${titleId}-nip`}
                                        type="text"
                                        placeholder="Opcjonalnie (freelancer)"
                                        {...inputProps('nip')}
                                        value={formData.nip}
                                        onChange={e => setFormData({ ...formData, nip: e.target.value })}
                                    />
                                    {renderError('nip')}
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor={`${titleId}-address`}>Adres</label>
                                    <textarea
                                        id={`${titleId}-address`}
                                        rows={2}
                                        className="w-full resize-none rounded-sm border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
                                        value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor={`${titleId}-bank`}>Numer konta</label>
                                    <input
                                        id={`${titleId}-bank`}
                                        type="text"
                                        placeholder="Opcjonalnie"
                                        className={cx(INPUT, 'tnum border-border-strong')}
                                        value={formData.bank_account}
                                        onChange={e => setFormData({ ...formData, bank_account: e.target.value })}
                                    />
                                </div>
                                <div className="flex items-center gap-3 pt-1">
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={formData.is_vat_payer}
                                        aria-labelledby={`${titleId}-vat`}
                                        onClick={() => setFormData({ ...formData, is_vat_payer: !formData.is_vat_payer })}
                                        className={cx(
                                            'h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors',
                                            formData.is_vat_payer ? 'bg-ink' : 'bg-border-strong',
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={cx(
                                                'block h-5 w-5 rounded-full bg-surface transition-transform',
                                                formData.is_vat_payer ? 'translate-x-5' : 'translate-x-0',
                                            )}
                                        />
                                    </button>
                                    <span id={`${titleId}-vat`} className="text-[13px] font-semibold text-ink">Płatnik VAT (faktura)</span>
                                </div>
                            </fieldset>

                            {/* Integracja Subiekt GT */}
                            <fieldset className="min-w-0 md:col-span-2">
                                <legend className="label-caps mb-4">Integracja Subiekt GT</legend>
                                <div className="md:max-w-[50%] md:pr-4">
                                    <label className={LABEL} htmlFor={`${titleId}-subiekt_code`}>Kod w Subiekcie</label>
                                    <input
                                        id={`${titleId}-subiekt_code`}
                                        type="text"
                                        maxLength={64}
                                        autoComplete="off"
                                        placeholder="np. A-001"
                                        aria-describedby={`${titleId}-subiekt_code-hint${fieldError('subiekt_code') ? ` ${titleId}-subiekt_code-err` : ''}`}
                                        aria-invalid={fieldError('subiekt_code') ? true : undefined}
                                        className={cx(INPUT, 'tnum', fieldError('subiekt_code') ? 'border-danger' : 'border-border-strong')}
                                        value={formData.subiekt_code}
                                        onChange={e => setFormData({ ...formData, subiekt_code: e.target.value })}
                                    />
                                    <p id={`${titleId}-subiekt_code-hint`} className="mt-1.5 text-[13px] text-ink-2">
                                        Wartość pola własnego «Architekt» w Subiekcie, np. A-001. Dokumenty z tym kodem trafiają do tego architekta.
                                    </p>
                                    {renderError('subiekt_code')}
                                </div>
                            </fieldset>
                        </div>

                        <div className="space-y-3 border-t border-border px-6 py-4">
                            {formError && <Banner tone="danger" title="Nie udało się zapisać zmian">{formError}</Banner>}
                            <div className="flex flex-wrap justify-end gap-3">
                                <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
                                <Button type="submit" loading={loading}>
                                    {loading ? 'Zapisywanie...' : 'Zapisz zmiany'}
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
