'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Copy,
    FileText,
    Landmark,
    Loader2,
    Mail,
    Receipt,
    Check,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { handlePayoutRequest } from "@/app/actions/admin";
import { updatePayoutInvoiceNumber } from "@/app/actions/projects";
import { notifyArchitectProfileIncomplete } from "@/app/actions/architects";
import {
    Banner,
    Button,
    Card,
    EmptyState,
    InlineConfirm,
    StatusPill,
    cx,
    formatDate,
    formatNumber,
    formatPLN,
} from '@/components/ui';

interface PayoutRequest {
    id: string;
    architect_id: string;
    architect_name: string;
    amount: number;
    created_at: string;
    status: string;
    project_names?: string;
    project_ids?: string;
    invoice_url?: string;
    invoice_number?: string | null;
    bank_account?: string | null;
    nip?: string | null;
    address?: string | null;
    studio_name?: string | null;
    is_vat_payer?: number | null;
}

type PayoutAction = 'APPROVE' | 'REJECT' | 'HOLD' | 'IN_PAYMENT' | 'PAID';

const FIELD_CLASS =
    'h-8 rounded-sm border border-border-strong bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none';

function initials(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
}

function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // schowek niedostępny (np. brak HTTPS), użytkownik może zaznaczyć tekst ręcznie
        }
    };
    return (
        <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
            <span className="label-caps w-24 shrink-0">{label}</span>
            <span className="min-w-0 flex-1 break-words font-mono text-[13px] text-ink">{value}</span>
            <Button
                size="sm"
                variant="ghost"
                onClick={copy}
                icon={copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                className={copied ? 'text-success' : undefined}
            >
                {copied ? 'Skopiowano' : 'Kopiuj'}
            </Button>
        </div>
    );
}

function InvoiceNumberField({ payoutId, initialValue, isAdmin }: { payoutId: string; initialValue?: string | null; isAdmin: boolean }) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(initialValue || '');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    const save = async () => {
        setSaving(true);
        setSaveError('');
        try {
            await updatePayoutInvoiceNumber(payoutId, value);
            setEditing(false);
            router.refresh();
        } catch {
            setSaveError('Nie udało się zapisać numeru. Spróbuj ponownie.');
        } finally {
            setSaving(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <FileText size={13} className="shrink-0 text-ink-3" aria-hidden="true" />
                {value ? <span className="font-mono text-ink">{value}</span> : <span>Brak nr faktury</span>}
            </div>
        );
    }

    if (editing) {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="text"
                    value={value}
                    autoFocus
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                    placeholder="Nr faktury architekta"
                    aria-label="Numer faktury architekta"
                    className={cx(FIELD_CLASS, 'w-48 font-mono')}
                />
                <Button size="sm" variant="secondary" loading={saving} onClick={save}>Zapisz</Button>
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setValue(initialValue || ''); setSaveError(''); setEditing(false); }}>
                    Anuluj
                </Button>
                {saveError && <p role="alert" className="w-full text-[13px] text-danger">{saveError}</p>}
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-sm text-[13px] text-ink-2 hover:text-ink"
            title="Kliknij, aby wpisać nr faktury architekta"
        >
            <FileText size={13} className="shrink-0 text-ink-3" aria-hidden="true" />
            {value ? <span className="font-mono text-ink">{value}</span> : <span className="underline decoration-border-strong underline-offset-2">Dodaj nr faktury</span>}
        </button>
    );
}

export default function AdminPayoutsQueue({
    initialPayouts,
    isAdmin,
    flush = false,
}: {
    initialPayouts: PayoutRequest[];
    isAdmin: boolean;
    /** true, gdy kolejka leży wewnątrz karty strony (bez własnej ramki). */
    flush?: boolean;
}) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    // 'idle' | 'confirming' | 'loading' | 'error'
    const [phase, setPhase] = useState<'idle' | 'confirming' | 'loading' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [processedTotal, setProcessedTotal] = useState<number | null>(null);
    const [confirmingRejectId, setConfirmingRejectId] = useState<string | null>(null);
    const [confirmingPaidId, setConfirmingPaidId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [notifyingId, setNotifyingId] = useState<string | null>(null);
    const [notifiedIds, setNotifiedIds] = useState<string[]>([]);
    const router = useRouter();

    const busy = phase === 'loading' || phase === 'confirming';

    const toggleExpand = (id: string) => {
        if (busy) return;
        setExpandedId((prev) => (prev === id ? null : id));
    };

    const isSelectable = (status: string) => !['APPROVED', 'PAID', 'REJECTED'].includes(status);

    const toggleSelect = (id: string, status: string) => {
        if (!isSelectable(status)) return;
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter((i) => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const selectablePayouts = initialPayouts.filter((p) => isSelectable(p.status));
    const allSelected = selectedIds.length > 0 && selectedIds.length === selectablePayouts.length;

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(selectablePayouts.map((p) => p.id));
        }
    };

    const selectedTotal = initialPayouts
        .filter((p) => selectedIds.includes(p.id))
        .reduce((acc, p) => acc + Number(p.amount), 0);

    const executeBatch = async () => {
        setPhase('loading');
        setErrorMsg('');
        try {
            const res = await fetch('/api/admin/payouts/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payoutRequestIds: selectedIds }),
            });
            const data = await res.json();
            if (data.success) {
                setProcessedTotal(data.totalProcessed);
                setSelectedIds([]);
                setPhase('idle');
                router.refresh();
            } else {
                setErrorMsg(data.error || 'Błąd podczas procesowania wypłaty.');
                setPhase('error');
            }
        } catch {
            setErrorMsg('Błąd połączenia z serwerem.');
            setPhase('error');
        }
    };

    const onIndividualAction = async (id: string, action: PayoutAction) => {
        setPhase('loading');
        setErrorMsg('');
        try {
            const res = await handlePayoutRequest(id, action);
            if (res.success) {
                setPhase('idle');
                router.refresh();
            } else {
                setErrorMsg('Operacja nie powiodła się. Odśwież stronę i spróbuj ponownie.');
                setPhase('error');
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Błąd operacji');
            setPhase('error');
        }
    };

    if (initialPayouts.length === 0) {
        return (
            <EmptyState
                icon={<CheckCircle2 size={22} aria-hidden="true" />}
                title="Kolejka wypłat jest pusta"
                description="Nowe wnioski o wypłatę pojawią się tutaj."
            />
        );
    }

    const content = (
        <div>
            {/* Pasek narzędzi */}
            <div className="space-y-3 px-5 py-3">
                {isAdmin ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-2">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={toggleSelectAll}
                                disabled={busy || selectablePayouts.length === 0}
                                className="h-4 w-4 accent-ink"
                            />
                            Zaznacz wszystkie do wypłaty
                        </label>
                        {selectedIds.length > 0 && phase === 'idle' && (
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="tnum text-sm text-ink-2">
                                    Wybrano: <strong className="font-semibold text-ink">{selectedIds.length}</strong> · {formatPLN(selectedTotal)}
                                </span>
                                <Button size="sm" onClick={() => setPhase('confirming')}>
                                    Zatwierdź wybrane ({selectedIds.length})
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <Banner tone="info">Podgląd tylko do odczytu. Wypłaty może rozliczać wyłącznie administrator.</Banner>
                )}

                {phase === 'confirming' && (
                    <InlineConfirm
                        question={<span className="tnum">Wypłacić {selectedIds.length} {selectedIds.length === 1 ? 'wniosek' : 'wnioski'} na łączną kwotę {formatPLN(selectedTotal)}?</span>}
                        confirmLabel="Wypłać"
                        cancelLabel="Anuluj"
                        onConfirm={executeBatch}
                        onCancel={() => setPhase('idle')}
                    />
                )}

                {phase === 'loading' && (
                    <Banner tone="info">
                        <span className="inline-flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            Przetwarzanie wypłat…
                        </span>
                    </Banner>
                )}

                {phase === 'error' && (
                    <Banner
                        tone="danger"
                        title="Nie udało się wykonać operacji"
                        action={<Button size="sm" variant="secondary" onClick={() => setPhase('idle')}>Zamknij</Button>}
                    >
                        {errorMsg}
                    </Banner>
                )}

                {processedTotal !== null && (
                    <Banner
                        tone="success"
                        title={`Wypłacono ${formatPLN(processedTotal)}`}
                        action={<Button size="sm" variant="ghost" onClick={() => setProcessedTotal(null)}>Ukryj</Button>}
                    />
                )}
            </div>

            {/* Lista wniosków */}
            <ul className={cx('border-t border-border', busy && 'pointer-events-none opacity-60')}>
                {initialPayouts.map((p) => {
                    const selectable = isSelectable(p.status);
                    const selected = selectedIds.includes(p.id);
                    const expanded = expandedId === p.id;
                    const actionable = isAdmin && selectable;
                    const names = p.project_names ? p.project_names.split(',') : [];
                    const ids = p.project_ids ? p.project_ids.split(',') : [];

                    return (
                        <li key={p.id} className={cx('border-b border-border last:border-b-0', selected && 'bg-brass-soft/40')}>
                            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-5 py-3.5 md:grid-cols-[auto_minmax(0,1fr)_auto]">
                                <div className="flex items-center gap-3">
                                    {isAdmin && (
                                        <input
                                            type="checkbox"
                                            checked={selected}
                                            disabled={!selectable || busy}
                                            onChange={() => toggleSelect(p.id, p.status)}
                                            aria-label={`Zaznacz wniosek ${p.architect_name}`}
                                            className="h-4 w-4 accent-ink"
                                        />
                                    )}
                                    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brass-soft text-xs font-bold text-brass-ink">
                                        {initials(p.architect_name)}
                                    </span>
                                </div>

                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Link
                                            href={`/dashboard/admin/architects/${p.architect_id}`}
                                            className="font-semibold text-ink hover:underline hover:underline-offset-2"
                                        >
                                            {p.architect_name}
                                        </Link>
                                        <StatusPill kind="payout" status={p.status} />
                                        {p.invoice_url && (
                                            <a
                                                href={p.invoice_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 rounded-sm text-[13px] text-brass-ink hover:underline"
                                                title="Pobierz fakturę lub rachunek"
                                            >
                                                <Receipt size={13} aria-hidden="true" />
                                                Faktura
                                            </a>
                                        )}
                                    </div>
                                    {names.length > 0 && (
                                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[13px]">
                                            {names.map((name, i) => {
                                                const projectId = ids[i];
                                                const label = `${name.trim()}${i < names.length - 1 ? ',' : ''}`;
                                                return projectId ? (
                                                    <Link
                                                        key={projectId}
                                                        href={`/dashboard/admin/projects/${projectId}`}
                                                        className="text-brass-ink hover:underline"
                                                    >
                                                        {label}
                                                    </Link>
                                                ) : (
                                                    <span key={i} className="text-brass-ink">{label}</span>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
                                        <span className="font-mono text-ink-3">{p.id.substring(0, 8)}</span>
                                        <span className="tnum text-ink-3">{formatDate(p.created_at)}</span>
                                        <InvoiceNumberField payoutId={p.id} initialValue={p.invoice_number} isAdmin={isAdmin} />
                                    </div>
                                </div>

                                <div className="col-start-2 text-left md:col-start-3 md:row-start-1 md:text-right">
                                    <span className="font-display text-2xl tnum text-ink">{formatNumber(p.amount)}</span>
                                    <small className="ml-1 text-xs text-ink-3">PLN</small>
                                </div>

                                <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-start-2 md:col-span-2">
                                    {actionable && (
                                        confirmingRejectId === p.id ? (
                                            <InlineConfirm
                                                question={`Odrzucić wniosek ${p.id.substring(0, 8)}?`}
                                                confirmLabel="Odrzuć"
                                                cancelLabel="Zostaw"
                                                danger
                                                onConfirm={() => { setConfirmingRejectId(null); onIndividualAction(p.id, 'REJECT'); }}
                                                onCancel={() => setConfirmingRejectId(null)}
                                            />
                                        ) : confirmingPaidId === p.id ? (
                                            <InlineConfirm
                                                question={<span className="tnum">Oznaczyć {formatPLN(p.amount)} jako wypłacone?</span>}
                                                confirmLabel="Oznacz jako wypłacone"
                                                cancelLabel="Anuluj"
                                                onConfirm={() => { setConfirmingPaidId(null); onIndividualAction(p.id, 'PAID'); }}
                                                onCancel={() => setConfirmingPaidId(null)}
                                            />
                                        ) : (
                                            <>
                                                {p.status !== 'IN_PAYMENT' && (
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        title="Przekaż do płatności"
                                                        onClick={() => onIndividualAction(p.id, 'IN_PAYMENT')}
                                                    >
                                                        Przekaż
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    title="Oznacz jako opłacone"
                                                    onClick={() => setConfirmingPaidId(p.id)}
                                                >
                                                    Opłacone
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    title="Wstrzymaj wypłatę"
                                                    onClick={() => onIndividualAction(p.id, 'HOLD')}
                                                >
                                                    Wstrzymaj
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    title="Odrzuć wniosek"
                                                    onClick={() => setConfirmingRejectId(p.id)}
                                                >
                                                    Odrzuć
                                                </Button>
                                            </>
                                        )
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(p.id)}
                                        aria-expanded={expanded}
                                        aria-label={expanded ? 'Ukryj dane do przelewu' : 'Pokaż dane do przelewu'}
                                        className="ml-auto grid h-8 w-8 place-items-center rounded-sm text-ink-2 hover:bg-ink/5 hover:text-ink"
                                    >
                                        {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                                    </button>
                                </div>
                            </div>

                            {/* Panel danych do przelewu */}
                            {expanded && (
                                <div className="border-t border-border bg-surface-2 px-5 py-4">
                                    <div className="mb-3 flex items-center gap-2">
                                        <Landmark size={14} className="text-brass-ink" aria-hidden="true" />
                                        <span className="label-caps">Dane do przelewu</span>
                                    </div>

                                    {p.bank_account ? (
                                        <div className="mb-4">
                                            <CopyField label="Odbiorca" value={p.studio_name || p.architect_name} />
                                            <CopyField label="Nr konta" value={p.bank_account} />
                                            <CopyField
                                                label="Kwota"
                                                value={`${Number(p.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`}
                                            />
                                            <CopyField
                                                label="Tytuł"
                                                value={`Konsultacja projektowa${p.project_names ? ` – ${p.project_names}` : ''}`}
                                            />
                                            {p.nip && <CopyField label="NIP" value={p.nip} />}
                                        </div>
                                    ) : (
                                        <Banner
                                            tone="warning"
                                            title="Brak danych bankowych w profilu architekta"
                                            className="mb-4"
                                            action={
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button size="sm" variant="secondary" href={`/dashboard/admin/architects/${p.architect_id}`}>
                                                        Profil architekta
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        disabled={notifiedIds.includes(p.id)}
                                                        loading={notifyingId === p.id}
                                                        icon={notifiedIds.includes(p.id) ? <Check size={14} aria-hidden="true" /> : <Mail size={14} aria-hidden="true" />}
                                                        onClick={async () => {
                                                            setNotifyingId(p.id);
                                                            try {
                                                                await notifyArchitectProfileIncomplete(p.architect_id);
                                                                setNotifiedIds((prev) => [...prev, p.id]);
                                                            } catch {
                                                                // brak potwierdzenia wysyłki, przycisk pozostaje aktywny
                                                            } finally {
                                                                setNotifyingId(null);
                                                            }
                                                        }}
                                                    >
                                                        {notifiedIds.includes(p.id) ? 'Wysłano' : 'Wyślij email'}
                                                    </Button>
                                                </div>
                                            }
                                        >
                                            Wypłata nie może zostać zrealizowana, dopóki partner nie uzupełni numeru konta.
                                        </Banner>
                                    )}

                                    {actionable && (
                                        <Button
                                            variant="secondary"
                                            fullWidth
                                            icon={<CheckCircle2 size={16} aria-hidden="true" />}
                                            onClick={() => { setConfirmingPaidId(p.id); setExpandedId(null); }}
                                        >
                                            Oznacz jako opłacone
                                        </Button>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );

    return flush ? content : <Card>{content}</Card>;
}
