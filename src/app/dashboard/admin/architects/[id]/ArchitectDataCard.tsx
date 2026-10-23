'use client';

import React, { useId, useState } from 'react';
import { Pencil, X, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { updateArchitectData, deleteArchitect } from '@/app/actions/architects';
import { Banner, Button, Card, CardBody, CardHeader, InlineConfirm, cx } from '@/components/ui';

interface ArchitectData {
    id: string;
    name: string;
    email: string;
    studio_name: string | null;
    nip: string | null;
    address: string | null;
    bank_account: string | null;
    is_vat_payer: number | boolean;
}

interface Props {
    architect: ArchitectData;
    isAdmin: boolean;
}

type FieldKey = 'name' | 'email' | 'nip';

/** Przypisuje komunikat z serwera do pola, którego dotyczy. */
function fieldForError(message: string): FieldKey | null {
    if (/email/i.test(message)) return 'email';
    if (/imi(ę|e)/i.test(message)) return 'name';
    if (/\bnip\b/i.test(message)) return 'nip';
    return null;
}

const INPUT = 'h-10 w-full rounded-sm border bg-surface px-3 text-sm text-ink placeholder:text-ink-3';
const LABEL = 'mb-1.5 block text-[13px] font-semibold text-ink';

function Row({ label, value, wide = false, mono = false }: { label: string; value?: string | null; wide?: boolean; mono?: boolean }) {
    return (
        <div className={cx('min-w-0', wide && 'col-span-2')}>
            <dt className="label-caps">{label}</dt>
            <dd className={cx('mt-1 break-words text-sm', value ? 'text-ink' : 'text-ink-3', mono && value && 'tnum')}>
                {value || '—'}
            </dd>
        </div>
    );
}

export default function ArchitectDataCard({ architect, isAdmin }: Props) {
    const router = useRouter();
    const formId = useId();
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deletePhase, setDeletePhase] = useState<'idle' | 'confirming' | 'loading'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [form, setForm] = useState({
        name: architect.name,
        email: architect.email,
        studio_name: architect.studio_name || '',
        nip: architect.nip || '',
        address: architect.address || '',
        bank_account: architect.bank_account || '',
        is_vat_payer: Boolean(architect.is_vat_payer),
    });

    const errorField = error ? fieldForError(error) : null;
    const fieldError = (key: FieldKey) => (errorField === key ? error : null);
    const formError = error && !errorField ? error : null;

    const handleSave = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await updateArchitectData(architect.id, form);
            setEditing(false);
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Błąd podczas zapisywania danych');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setDeletePhase('loading');
        setDeleteError(null);
        try {
            await deleteArchitect(architect.id);
            router.push('/dashboard/admin/architects');
        } catch (err: any) {
            setDeleteError(err.message || 'Błąd podczas usuwania konta');
            setDeletePhase('idle');
        }
    };

    const cancelEdit = () => {
        setEditing(false);
        setError(null);
        setForm({
            name: architect.name,
            email: architect.email,
            studio_name: architect.studio_name || '',
            nip: architect.nip || '',
            address: architect.address || '',
            bank_account: architect.bank_account || '',
            is_vat_payer: Boolean(architect.is_vat_payer),
        });
    };

    const textField = (key: 'name' | 'email' | 'studio_name' | 'nip' | 'bank_account', label: string, type: 'text' | 'email', required: boolean, mono = false) => {
        const err = key === 'name' || key === 'email' || key === 'nip' ? fieldError(key) : null;
        return (
            <div key={key}>
                <label className={LABEL} htmlFor={`${formId}-${key}`}>{label}</label>
                <input
                    id={`${formId}-${key}`}
                    type={type}
                    required={required}
                    value={form[key]}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? `${formId}-${key}-err` : undefined}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className={cx(INPUT, mono && 'tnum', err ? 'border-danger' : 'border-border-strong')}
                />
                {err && <p id={`${formId}-${key}-err`} role="alert" className="mt-1.5 text-[13px] text-danger">{err}</p>}
            </div>
        );
    };

    return (
        <Card as="section">
            <CardHeader
                title="Dane osobowe"
                action={isAdmin && (
                    editing ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-8 px-0!"
                            aria-label="Anuluj edycję"
                            title="Anuluj edycję"
                            icon={<X size={16} aria-hidden="true" />}
                            onClick={cancelEdit}
                        />
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-8 px-0!"
                            aria-label="Edytuj dane"
                            title="Edytuj dane"
                            icon={<Pencil size={16} aria-hidden="true" />}
                            onClick={() => setEditing(true)}
                        />
                    )
                )}
            />
            <CardBody>
                {!editing ? (
                    <>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                            <Row label="Imię i nazwisko" value={architect.name} wide />
                            <Row label="Email" value={architect.email} wide />
                            <Row label="Studio / biuro" value={architect.studio_name} wide />
                            <Row label="NIP" value={architect.nip} mono />
                            <Row label="VAT" value={Boolean(architect.is_vat_payer) ? 'Płatnik VAT' : 'Nie jest płatnikiem VAT'} />
                            <Row label="Adres" value={architect.address} wide />
                            <Row label="Nr konta" value={architect.bank_account} wide mono />
                        </dl>

                        {/* Usunięcie konta: tylko ADMIN */}
                        {isAdmin && (
                            <div className="mt-5 border-t border-border pt-4">
                                {deletePhase === 'idle' ? (
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        icon={<Trash2 size={16} aria-hidden="true" />}
                                        onClick={() => { setDeleteError(null); setDeletePhase('confirming'); }}
                                    >
                                        Usuń konto architekta
                                    </Button>
                                ) : (
                                    <InlineConfirm
                                        question="Konto architekta zostanie trwale usunięte. Usunięcie jest możliwe tylko dla kont bez projektów i rozliczeń."
                                        confirmLabel="Usuń konto"
                                        cancelLabel="Zostaw"
                                        danger
                                        loading={deletePhase === 'loading'}
                                        onConfirm={handleDelete}
                                        onCancel={() => setDeletePhase('idle')}
                                    />
                                )}
                                {deleteError && deletePhase === 'idle' && (
                                    <p role="alert" className="mt-3 text-[13px] text-danger">{deleteError}</p>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <form onSubmit={handleSave} className="space-y-4">
                        {textField('name', 'Imię i nazwisko', 'text', true)}
                        {textField('email', 'Email', 'email', true)}
                        {textField('studio_name', 'Studio / biuro', 'text', false)}
                        {textField('nip', 'NIP', 'text', false, true)}
                        {textField('bank_account', 'Nr konta', 'text', false, true)}

                        <div>
                            <label className={LABEL} htmlFor={`${formId}-address`}>Adres</label>
                            <textarea
                                id={`${formId}-address`}
                                rows={2}
                                value={form.address}
                                onChange={e => setForm({ ...form, address: e.target.value })}
                                className="w-full resize-none rounded-sm border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                role="switch"
                                aria-checked={form.is_vat_payer}
                                aria-labelledby={`${formId}-vat`}
                                onClick={() => setForm({ ...form, is_vat_payer: !form.is_vat_payer })}
                                className={cx(
                                    'h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors',
                                    form.is_vat_payer ? 'bg-ink' : 'bg-border-strong',
                                )}
                            >
                                <span
                                    aria-hidden="true"
                                    className={cx(
                                        'block h-5 w-5 rounded-full bg-surface transition-transform',
                                        form.is_vat_payer ? 'translate-x-5' : 'translate-x-0',
                                    )}
                                />
                            </button>
                            <span id={`${formId}-vat`} className="text-[13px] font-semibold text-ink">Płatnik VAT</span>
                        </div>

                        {formError && <Banner tone="danger" title="Nie udało się zapisać danych">{formError}</Banner>}

                        <Button type="submit" fullWidth loading={loading}>Zapisz zmiany</Button>
                    </form>
                )}
            </CardBody>
        </Card>
    );
}
