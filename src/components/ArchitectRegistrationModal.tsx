'use client';

import React, { useEffect, useId, useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { registerArchitect } from '@/app/actions/projects';
import { PASSWORD_POLICY_HINT } from '@/lib/passwordPolicy';
import { Banner, Button, cx } from '@/components/ui';

interface ArchitectRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type FieldKey = 'first_name' | 'last_name' | 'email' | 'password' | 'nip' | 'bank_account';

const EMPTY_FORM = {
    first_name: '',
    last_name: '',
    email: '',
    studio_name: '',
    nip: '',
    address: '',
    bank_account: '',
    is_vat_payer: false,
    password: ''
};

/** Przypisuje komunikat z serwera do pola, którego dotyczy (bez zmiany walidacji po stronie serwera). */
function fieldForError(message: string): FieldKey | null {
    if (/hasł/i.test(message)) return 'password';
    if (/email/i.test(message)) return 'email';
    if (/imię/i.test(message)) return 'first_name';
    if (/nazwisko/i.test(message)) return 'last_name';
    if (/\bnip\b/i.test(message)) return 'nip';
    return null;
}

const INPUT = 'h-10 w-full rounded-sm border bg-surface px-3 text-sm text-ink placeholder:text-ink-3';
const LABEL = 'mb-1.5 block text-[13px] font-semibold text-ink';

export default function ArchitectRegistrationModal({ isOpen, onClose }: ArchitectRegistrationModalProps) {
    const titleId = useId();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emailSent, setEmailSent] = useState<boolean | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [emailSkipped, setEmailSkipped] = useState<string | null>(null);

    const [formData, setFormData] = useState(EMPTY_FORM);

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
        setLoading(true);
        setError(null);
        setEmailSent(null);
        setEmailError(null);
        setEmailSkipped(null);

        try {
            const res = await registerArchitect(formData);
            setEmailSent(res.emailSent);
            setEmailError(res.emailError ?? null);
            setEmailSkipped(res.emailSkipped ?? null);
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Wystąpił błąd podczas rejestracji architekta.');
        } finally {
            setLoading(false);
        }
    };

    const finish = () => {
        setSuccess(false);
        setEmailSent(null);
        setEmailError(null);
        setEmailSkipped(null);
        setFormData(EMPTY_FORM);
        onClose();
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 text-left">
            <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-lg bg-surface shadow-float"
            >
                <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                    <div>
                        <h2 id={titleId} className="font-display text-xl font-normal text-ink">Zarejestruj architekta</h2>
                        <p className="mt-1 text-sm text-ink-2">Wprowadź dane nowego partnera. Dane logowania wyślemy na jego email.</p>
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

                {success ? (
                    <div className="space-y-4 overflow-y-auto px-6 py-10 text-center">
                        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
                            <CheckCircle2 size={24} aria-hidden="true" />
                        </span>
                        <h3 className="text-lg font-semibold text-ink">Architekt zarejestrowany</h3>
                        {emailSent ? (
                            <p className="text-sm text-ink-2">Konto zostało utworzone, a dane logowania wysłane na adres {formData.email}.</p>
                        ) : emailSkipped ? (
                            <div className="mx-auto max-w-lg text-left">
                                <Banner tone="info" title={emailSkipped}>
                                    Konto zostało utworzone. Portal działa w trybie wewnętrznym, więc mail do architekta nie wychodzi — dane logowania przekaż mu sam, gdy portal zostanie otwarty dla architektów.
                                </Banner>
                            </div>
                        ) : (
                            <div className="mx-auto max-w-lg text-left">
                                <Banner tone="warning" title="Konto zostało utworzone, ale mail powitalny nie został wysłany.">
                                    {emailError || 'Sprawdź konfigurację SMTP i szablon ARCHITECT_REGISTERED.'}
                                </Banner>
                            </div>
                        )}
                        <Button type="button" onClick={finish}>Zamknij</Button>
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
                                <div>
                                    <label className={LABEL} htmlFor={`${titleId}-password`}>Hasło tymczasowe</label>
                                    <input
                                        id={`${titleId}-password`}
                                        required
                                        type="password"
                                        placeholder="Min. 8 znaków, litera i cyfra"
                                        minLength={8}
                                        {...inputProps('password')}
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    />
                                    {renderError('password')}
                                    <p className="mt-1.5 text-[13px] text-ink-2">
                                        {PASSWORD_POLICY_HINT} Hasło jest tymczasowe — architekt zmieni je przy pierwszym logowaniu.
                                    </p>
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
                        </div>

                        <div className="space-y-3 border-t border-border px-6 py-4">
                            {formError && <Banner tone="danger" title="Nie udało się zarejestrować architekta">{formError}</Banner>}
                            <div className="flex flex-wrap justify-end gap-3">
                                <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
                                <Button type="submit" loading={loading}>
                                    {loading ? 'Rejestrowanie...' : 'Zarejestruj architekta'}
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
