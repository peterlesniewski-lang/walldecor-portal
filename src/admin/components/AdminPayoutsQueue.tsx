'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
    CreditCard,
    CheckCircle2,
    Clock,
    CheckSquare,
    Square,
    Zap,
    Loader2,
    AlertTriangle,
    XCircle,
    PauseCircle,
    CheckCircle,
    Receipt,
    FileText,
    Copy,
    ChevronDown,
    ChevronUp,
    Landmark,
    AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { handlePayoutRequest } from "@/app/actions/admin";
import { updatePayoutInvoiceNumber } from "@/app/actions/projects";
import { notifyArchitectProfileIncomplete } from "@/app/actions/architects";
import { formatPLN } from "@/lib/utils";

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

function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div className="flex items-center justify-between gap-4 py-2.5 border-b border-black/5 last:border-0">
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest w-20 shrink-0">{label}</span>
            <span className="text-[12px] font-bold text-stone-800 flex-1 font-mono">{value}</span>
            <button
                onClick={copy}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${copied ? 'bg-emerald-500/10 text-emerald-600' : 'bg-black/5 text-stone-400 hover:bg-black/10 hover:text-stone-700'}`}
            >
                {copied ? <CheckCircle size={11} /> : <Copy size={11} />}
                {copied ? 'OK' : 'Kopiuj'}
            </button>
        </div>
    );
}

function InvoiceNumberField({ payoutId, initialValue }: { payoutId: string; initialValue?: string | null }) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(initialValue || '');
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            await updatePayoutInvoiceNumber(payoutId, value);
            setEditing(false);
            router.refresh();
        } catch {
            // silent — keep editing open
        } finally {
            setSaving(false);
        }
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <input
                    type="text"
                    value={value}
                    autoFocus
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                    placeholder="Nr faktury architekta…"
                    className="w-44 bg-black/5 border border-black/10 rounded-lg px-2 py-1 text-[10px] font-mono text-stone-900 focus:outline-none focus:border-brand-primary/50"
                />
                <button
                    onClick={save}
                    disabled={saving}
                    className="px-2 py-1 rounded-lg bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-all text-[9px] font-black uppercase"
                >
                    {saving ? <Loader2 size={10} className="animate-spin" /> : 'OK'}
                </button>
                <button
                    onClick={() => { setValue(initialValue || ''); setEditing(false); }}
                    className="px-2 py-1 rounded-lg bg-black/5 text-stone-400 hover:bg-black/10 transition-all text-[9px] font-black uppercase"
                >
                    Anuluj
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="flex items-center gap-1.5 text-[10px] font-mono text-stone-400 hover:text-stone-700 transition-colors"
            title="Kliknij, aby wpisać nr faktury architekta"
        >
            <FileText size={11} className="shrink-0" />
            {value ? (
                <span className="font-bold text-stone-600">{value}</span>
            ) : (
                <span className="italic">Dodaj nr faktury</span>
            )}
        </button>
    );
}

export default function AdminPayoutsQueue({ initialPayouts }: { initialPayouts: PayoutRequest[] }) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    // 'idle' | 'confirming' | 'loading' | 'error'
    const [phase, setPhase] = useState<'idle' | 'confirming' | 'loading' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [processedTotal, setProcessedTotal] = useState<number | null>(null);
    const [confirmingRejectId, setConfirmingRejectId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [notifyingId, setNotifyingId] = useState<string | null>(null);
    const [notifiedIds, setNotifiedIds] = useState<string[]>([]);
    const router = useRouter();

    const toggleExpand = (id: string) => {
        if (phase !== 'idle') return;
        setExpandedId(prev => prev === id ? null : id);
    };

    const isSelectable = (status: string) => !['APPROVED', 'PAID', 'REJECTED'].includes(status);

    const toggleSelect = (id: string, status: string) => {
        if (!isSelectable(status)) return;
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const toggleSelectAll = () => {
        const selectablePayouts = initialPayouts.filter(p => isSelectable(p.status));
        if (selectedIds.length === selectablePayouts.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(selectablePayouts.map(p => p.id));
        }
    };

    const selectedTotal = initialPayouts
        .filter(p => selectedIds.includes(p.id))
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

    const onIndividualAction = async (id: string, action: 'APPROVE' | 'REJECT' | 'HOLD' | 'IN_PAYMENT' | 'PAID') => {
        setPhase('loading');
        try {
            const res = await handlePayoutRequest(id, action);
            if (res.success) {
                setPhase('idle');
                router.refresh();
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Błąd operacji');
            setPhase('error');
        }
    };

    if (initialPayouts.length === 0) {
        return (
            <div className="py-12 flex flex-col items-center justify-center bg-white/[0.01] rounded-3xl border border-dashed border-black/5">
                <CheckCircle2 size={32} className="text-slate-800 mb-3" />
                <p className="text-[10px] text-stone-600 font-bold uppercase tracking-[0.2em]">Kolejka wypłat jest pusta</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleSelectAll}
                        className="flex items-center gap-2 text-[10px] font-black text-stone-500 uppercase tracking-widest hover:text-stone-900 transition-all"
                    >
                        {selectedIds.length > 0 && selectedIds.length === initialPayouts.filter(p => isSelectable(p.status)).length
                            ? <CheckSquare size={16} className="text-brand-primary" />
                            : <Square size={16} />}
                        Zaznacz wszystkie do wypłaty
                    </button>
                    {selectedIds.length > 0 && (
                        <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest bg-brand-primary/10 px-3 py-1 rounded-lg border border-brand-primary/20">
                            Wybrano: {selectedIds.length} · {formatPLN(selectedTotal)} PLN
                        </span>
                    )}
                </div>

                {selectedIds.length > 0 && phase === 'idle' && (
                    <button
                        onClick={() => setPhase('confirming')}
                        className="bg-brand-primary hover:bg-brand-secondary text-black px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-[0_8px_20px_rgba(212,175,55,0.2)] active:scale-95"
                    >
                        <Zap size={14} fill="currentColor" />
                        Zatwierdź Wybrane ({selectedIds.length})
                    </button>
                )}
            </div>

            {/* Inline confirmation banner */}
            {phase === 'confirming' && (
                <div className="flex items-center justify-between gap-4 bg-brand-primary/5 border border-brand-primary/30 rounded-3xl px-6 py-4">
                    <div>
                        <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-0.5">Potwierdź wypłatę</p>
                        <p className="text-sm font-black text-stone-900">
                            {selectedIds.length} wniosków · {formatPLN(selectedTotal)} PLN
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setPhase('idle')}
                            className="px-5 py-2 rounded-xl bg-black/5 text-stone-400 text-[10px] font-black uppercase tracking-widest hover:bg-black/10 transition-all"
                        >
                            Anuluj
                        </button>
                        <button
                            onClick={executeBatch}
                            className="bg-brand-primary hover:bg-brand-secondary text-black px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95"
                        >
                            <Zap size={14} fill="currentColor" />
                            Tak, wypłać
                        </button>
                    </div>
                </div>
            )}

            {/* Loading banner */}
            {phase === 'loading' && (
                <div className="flex items-center gap-3 bg-black/5 border border-black/10 rounded-3xl px-6 py-4">
                    <Loader2 size={16} className="animate-spin text-brand-primary" />
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Przetwarzanie wypłat…</p>
                </div>
            )}

            {/* Error banner */}
            {phase === 'error' && (
                <div className="flex items-center justify-between gap-4 bg-red-900/10 border border-red-800/30 rounded-3xl px-6 py-4">
                    <div className="flex items-center gap-3">
                        <AlertTriangle size={16} className="text-red-600 shrink-0" />
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">{errorMsg}</p>
                    </div>
                    <button
                        onClick={() => setPhase('idle')}
                        className="px-4 py-2 rounded-xl bg-black/5 text-stone-400 text-[10px] font-black uppercase tracking-widest hover:bg-black/10 transition-all"
                    >
                        Zamknij
                    </button>
                </div>
            )}

            {/* Success flash (processedTotal set, payouts removed from list after refresh) */}
            {processedTotal !== null && (
                <div className="flex items-center gap-3 bg-emerald-900/10 border border-emerald-800/30 rounded-3xl px-6 py-4">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                        Wypłacono {formatPLN(processedTotal)} PLN
                    </p>
                </div>
            )}

            {/* Payout list */}
            <div className="grid grid-cols-1 gap-4">
                {initialPayouts.map((p) => (
                    <div
                        key={p.id}
                        className={`stat-card border transition-all ${phase !== 'idle' ? 'opacity-50 pointer-events-none' : ''
                            } ${selectedIds.includes(p.id)
                                ? 'bg-brand-primary/5 border-brand-primary/30'
                                : expandedId === p.id
                                    ? 'bg-stone-50 border-black/10'
                                    : 'bg-black/[0.02] border-black/5 hover:border-black/10'
                            }`}
                    >
                    <div
                        onClick={() => toggleExpand(p.id)}
                        className={`flex items-center justify-between group ${phase !== 'idle' ? '' : 'cursor-pointer'}`}
                    >
                        <div className="flex items-center gap-6">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${selectedIds.includes(p.id)
                                ? 'bg-brand-primary text-black border-brand-primary'
                                : isSelectable(p.status)
                                    ? 'bg-black/5 text-stone-500 border-black/5 group-hover:border-black/20'
                                    : 'bg-black/5 text-stone-700 border-transparent'
                                }`}>
                                {selectedIds.includes(p.id) ? <CheckSquare size={18} /> : isSelectable(p.status) ? <CreditCard size={18} /> : <div className="w-1.5 h-1.5 rounded-full bg-stone-200" />}
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <Link
                                        href={`/dashboard/admin/architects/${p.architect_id}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-sm font-black text-stone-900 hover:text-brand-primary transition-colors underline-offset-2 hover:underline"
                                    >
                                        {p.architect_name}
                                    </Link>
                                    {p.invoice_url && (
                                        <a
                                            href={p.invoice_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1 rounded-md bg-black/5 text-stone-400 hover:text-brand-primary hover:bg-black/10 transition-all flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter"
                                            title="Pobierz Fakturę / Rachunek"
                                        >
                                            <Receipt size={12} />
                                            FV
                                        </a>
                                    )}
                                </div>
                                <div className="flex flex-col gap-1">
                                    {p.project_names && (
                                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 line-clamp-1">
                                            {p.project_names.split(',').map((name, i) => {
                                                const id = p.project_ids?.split(',')[i];
                                                return id ? (
                                                    <Link
                                                        key={id}
                                                        href={`/dashboard/admin/projects/${id}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-[10px] text-brand-primary font-bold uppercase tracking-widest hover:underline underline-offset-2"
                                                    >
                                                        {name.trim()}{i < p.project_names!.split(',').length - 1 ? ' •' : ''}
                                                    </Link>
                                                ) : (
                                                    <span key={i} className="text-[10px] text-brand-primary font-bold uppercase tracking-widest">
                                                        {name.trim()}{i < p.project_names!.split(',').length - 1 ? ' •' : ''}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <InvoiceNumberField payoutId={p.id} initialValue={p.invoice_number} />
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">
                                            ID: {p.id.substring(0, 8)}
                                        </span>
                                        <span className="text-stone-700">•</span>
                                        <span className="text-[10px] text-stone-500 flex items-center gap-1.5 uppercase font-bold">
                                            <Clock size={12} />
                                            {new Date(p.created_at).toLocaleDateString('pl-PL')}
                                        </span>
                                        <span className="text-stone-700">•</span>
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${p.status === 'PENDING' ? 'bg-amber-50 text-amber-600 border-amber-800/30' :
                                            p.status === 'IN_PAYMENT' ? 'bg-blue-50 text-blue-600 border-blue-800/30' :
                                                p.status === 'HOLD' ? 'bg-stone-200/20 text-stone-400 border-slate-600/30' :
                                                    p.status === 'REJECTED' ? 'bg-red-50 text-red-600 border-red-800/30' :
                                                        'bg-emerald-50 text-emerald-600 border-emerald-800/30'
                                            }`}>
                                            {p.status === 'PENDING' ? 'Oczekuje' :
                                                p.status === 'IN_PAYMENT' ? 'W Realizacji' :
                                                    p.status === 'HOLD' ? 'Wstrzymana' :
                                                        p.status === 'REJECTED' ? 'Odrzucona' :
                                                            'Zapłacona'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-xl font-black text-stone-900">
                                    {formatPLN(p.amount)} <span className="text-[10px] text-stone-500">PLN</span>
                                </p>
                                <p className="text-[9px] text-stone-500 font-black uppercase tracking-widest">Kwota wniosku</p>
                            </div>

                            <div className="flex items-center gap-1.5 border-l border-black/5 pl-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!(p.status === 'APPROVED' || p.status === 'PAID' || p.status === 'REJECTED') && (
                                    <>
                                        {p.status !== 'IN_PAYMENT' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onIndividualAction(p.id, 'IN_PAYMENT'); }}
                                                className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-all font-black text-[9px] uppercase tracking-widest flex items-center gap-1.5"
                                                title="Przekaż do płatności"
                                            >
                                                <Zap size={12} />
                                                Przekaż
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onIndividualAction(p.id, 'PAID'); }}
                                            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-all font-black text-[9px] uppercase tracking-widest flex items-center gap-1.5"
                                            title="Oznacz jako zapłacona"
                                        >
                                            <CheckCircle size={12} />
                                            Zapłacona
                                        </button>
                                        {confirmingRejectId === p.id ? (
                                            <>
                                                <span className="text-[9px] font-black text-red-600 uppercase tracking-widest">Odrzucić?</span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setConfirmingRejectId(null); onIndividualAction(p.id, 'REJECT'); }}
                                                    className="px-2 py-1 rounded-lg bg-red-500/20 text-red-600 hover:bg-red-500/30 transition-all font-black text-[9px] uppercase tracking-widest"
                                                >
                                                    Tak
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setConfirmingRejectId(null); }}
                                                    className="px-2 py-1 rounded-lg bg-black/5 text-stone-400 hover:bg-black/10 transition-all font-black text-[9px] uppercase tracking-widest"
                                                >
                                                    Nie
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setConfirmingRejectId(p.id); }}
                                                className="p-1.5 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-all"
                                                title="Odrzuć"
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onIndividualAction(p.id, 'HOLD'); }}
                                            className="p-1.5 rounded-lg bg-slate-500/10 text-stone-400 hover:bg-slate-500/20 transition-all"
                                            title="Wstrzymaj"
                                        >
                                            <PauseCircle size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        {/* Expand/collapse indicator */}
                        <div className="ml-3 text-stone-300">
                            {expandedId === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </div>

                        {/* Expandable transfer panel */}
                        {expandedId === p.id && (
                            <div className="border-t border-black/5 px-6 py-5 bg-white/60">
                                <div className="flex items-center gap-2 mb-4">
                                    <Landmark size={13} className="text-brand-primary" />
                                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Dane do przelewu</span>
                                </div>

                                {p.bank_account ? (
                                    <div className="space-y-0 mb-5">
                                        <CopyField
                                            label="Odbiorca"
                                            value={p.studio_name || p.architect_name}
                                        />
                                        <CopyField
                                            label="Nr konta"
                                            value={p.bank_account}
                                        />
                                        <CopyField
                                            label="Kwota"
                                            value={`${Number(p.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`}
                                        />
                                        <CopyField
                                            label="Tytuł"
                                            value={`Konsultacja projektowa${p.project_names ? ` – ${p.project_names}` : ''}`}
                                        />
                                        {p.nip && (
                                            <CopyField label="NIP" value={p.nip} />
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-start justify-between gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 mb-5">
                                        <div className="flex items-center gap-3">
                                            <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                            <p className="text-[11px] font-bold text-amber-700">
                                                Brak danych bankowych w profilu architekta.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <Link
                                                href={`/dashboard/admin/architects/${p.architect_id}`}
                                                className="text-[9px] font-black uppercase tracking-widest text-amber-600 hover:text-amber-800 underline"
                                            >
                                                Profil →
                                            </Link>
                                            <span className="text-amber-300">|</span>
                                            <button
                                                disabled={notifyingId === p.id || notifiedIds.includes(p.id)}
                                                onClick={async () => {
                                                    setNotifyingId(p.id);
                                                    try {
                                                        await notifyArchitectProfileIncomplete(p.architect_id);
                                                        setNotifiedIds(prev => [...prev, p.id]);
                                                    } catch {
                                                        // silent
                                                    } finally {
                                                        setNotifyingId(null);
                                                    }
                                                }}
                                                className={`text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1 ${notifiedIds.includes(p.id) ? 'text-emerald-600' : 'text-amber-600 hover:text-amber-800'} disabled:opacity-50`}
                                            >
                                                {notifyingId === p.id ? (
                                                    <Loader2 size={10} className="animate-spin" />
                                                ) : notifiedIds.includes(p.id) ? (
                                                    <><CheckCircle size={10} /> Wysłano</>
                                                ) : (
                                                    '📧 Wyślij email'
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {!(p.status === 'APPROVED' || p.status === 'PAID' || p.status === 'REJECTED') && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onIndividualAction(p.id, 'PAID'); setExpandedId(null); }}
                                        className="w-full py-3 rounded-xl bg-emerald-500 text-black font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all shadow-[0_4px_16px_rgba(16,185,129,0.2)]"
                                    >
                                        <CheckCircle size={14} />
                                        Oznacz jako ZAPŁACONE
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
