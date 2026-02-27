'use client';

import React, { useState } from 'react';
import {
    Pencil, Trash2, Plus, CheckCircle2, XCircle,
    Loader2, AlertTriangle, Package, Wrench, ChevronRight, Zap,
    User, FileText, Download, DollarSign, Clock, ShieldCheck
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    updateProjectStatus,
    updateProjectItem,
    updateProjectItemMeta,
    addProjectItem,
    deleteProjectItem,
    updatePayoutStatus,
} from '@/app/actions/projects';
import { formatPLN } from '@/lib/utils';
import ProjectFilesSection, { ProjectFile } from '@/components/ProjectFilesSection';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Project {
    id: string;
    name: string;
    status: string;
    client_label: string;
    owner_id: string;
    architect_name: string;
    architect?: {
        name: string;
        email: string;
        studio_name?: string;
        nip?: string;
        address?: string;
        bank_account?: string;
    };
    payout?: {
        id: string;
        amount: number;
        status: string;
        invoice_url?: string;
        created_at: string;
    };
}

interface ProjectItem {
    id: string;
    project_id: string;
    type: 'PRODUCT' | 'INSTALLATION';
    category: string;
    description: string | null;
    amount_net: number;
    order_number: string | null;
    invoice_number: string | null;
    is_paid: number | boolean;
}

interface Commission {
    id: string;
    project_item_id: string;
    amount_net: number;
    status: string;
    category: string;
    item_amount: number;
    note?: string;
}

interface Props {
    project: Project;
    items: ProjectItem[];
    commissions: Commission[];
    isAdmin: boolean;
    canChangeStatus: boolean;
    initialFiles: ProjectFile[];
}

// ─── Status transitions ──────────────────────────────────────────────────────

const NEXT_STATUSES: Record<string, { label: string; next: string; color: string }[]> = {
    ZGŁOSZONY: [
        { next: 'PRZYJĘTY', label: 'Akceptuj', color: 'bg-blue-600 hover:bg-blue-500 text-white' },
        { next: 'NIEZREALIZOWANY', label: 'Odrzuć', color: 'bg-red-900/40 hover:bg-red-900/60 text-red-600' },
    ],
    PRZYJĘTY: [
        { next: 'W_REALIZACJI', label: 'W Realizacji', color: 'bg-amber-600 hover:bg-amber-500 text-white' },
        { next: 'NIEZREALIZOWANY', label: 'Odrzuć', color: 'bg-red-900/40 hover:bg-red-900/60 text-red-600' },
    ],
    W_REALIZACJI: [
        { next: 'ZAKOŃCZONY', label: 'Finalizuj', color: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
        { next: 'NIEZREALIZOWANY', label: 'Odrzuć', color: 'bg-red-900/40 hover:bg-red-900/60 text-red-600' },
    ],
};

const STATUS_COLORS: Record<string, string> = {
    ZGŁOSZONY: 'bg-blue-900/30 text-blue-600 border-blue-800/30',
    PRZYJĘTY: 'bg-emerald-900/30 text-emerald-600 border-emerald-800/30',
    W_REALIZACJI: 'bg-amber-100/30 text-amber-600 border-amber-800/30',
    ZAKOŃCZONY: 'bg-stone-200/30 text-stone-400 border-slate-600/30',
    NIEZREALIZOWANY: 'bg-red-50 text-red-600 border-red-800/30',
};

// ─── Inline feedback banner ──────────────────────────────────────────────────

function FeedbackBanner({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
    return (
        <div className="flex items-center justify-between gap-4 bg-red-900/10 border border-red-800/30 rounded-2xl px-5 py-3">
            <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-600 shrink-0" />
                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">{msg}</p>
            </div>
            <button onClick={onDismiss} className="text-[10px] text-stone-500 hover:text-stone-900 font-black uppercase tracking-widest">
                Zamknij
            </button>
        </div>
    );
}

// ─── Status Panel ────────────────────────────────────────────────────────────

function StatusPanel({ project, canChangeStatus }: { project: Project; canChangeStatus: boolean }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState<string | null>(null); // next status awaiting confirm
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const transitions = NEXT_STATUSES[project.status] ?? [];

    const execute = async (next: string) => {
        setLoading(true);
        setError('');
        try {
            await updateProjectStatus(project.id, next);
            setConfirming(null);
            setLoading(false);
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd zmiany statusu.');
            setLoading(false);
            setConfirming(null);
        }
    };

    if (!canChangeStatus || transitions.length === 0) return null;

    return (
        <div className="stat-card bg-card border border-black/5 space-y-4">
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Zmień status projektu</p>

            {error && <FeedbackBanner msg={error} onDismiss={() => setError('')} />}

            {confirming ? (
                <div className="flex items-center justify-between gap-4 bg-brand-primary/5 border border-brand-primary/30 rounded-2xl px-5 py-3">
                    <p className="text-sm font-black text-stone-900">
                        Zmień status na <span className="gold-text">{confirming}</span>?
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setConfirming(null)}
                            className="px-4 py-2 rounded-xl bg-black/5 text-stone-400 text-[10px] font-black uppercase tracking-widest hover:bg-black/10 transition-all"
                        >
                            Anuluj
                        </button>
                        <button
                            onClick={() => execute(confirming)}
                            disabled={loading}
                            className="bg-brand-primary hover:bg-brand-secondary text-black px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                            Potwierdź
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {transitions.map((t) => (
                        <button
                            key={t.next}
                            onClick={() => setConfirming(t.next)}
                            className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 ${t.color}`}
                        >
                            {t.next === 'NIEZREALIZOWANY' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                            {t.label}
                            <ChevronRight size={12} className="opacity-50" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Item Row ────────────────────────────────────────────────────────────────

function ItemRow({
    item,
    canEdit,
    isFinalized,
}: {
    item: ProjectItem;
    canEdit: boolean;
    isFinalized: boolean;
}) {
    const router = useRouter();
    const [editingAmount, setEditingAmount] = useState(false);
    const [editingMeta, setEditingMeta] = useState(false);
    const [amount, setAmount] = useState(String(item.amount_net));
    const [note, setNote] = useState('');
    const [orderNumber, setOrderNumber] = useState(item.order_number || '');
    const [invoiceNumber, setInvoiceNumber] = useState(item.invoice_number || '');
    const [isPaid, setIsPaid] = useState(Boolean(item.is_paid));
    const [delPhase, setDelPhase] = useState<'idle' | 'confirming' | 'loading'>('idle');
    const [saving, setSaving] = useState(false);
    const [savingMeta, setSavingMeta] = useState(false);
    const [error, setError] = useState('');

    const saveAmount = async () => {
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) { setError('Kwota musi być > 0'); return; }
        setSaving(true);
        setError('');
        try {
            await updateProjectItem(item.id, val, note);
            setEditingAmount(false);
            setNote('');
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd zapisu.');
        } finally {
            setSaving(false);
        }
    };

    const saveMeta = async () => {
        setSavingMeta(true);
        setError('');
        try {
            await updateProjectItemMeta(item.id, {
                order_number: orderNumber.trim() || null,
                invoice_number: invoiceNumber.trim() || null,
                is_paid: isPaid,
            });
            setEditingMeta(false);
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd zapisu metadanych.');
        } finally {
            setSavingMeta(false);
        }
    };

    const doDelete = async () => {
        setDelPhase('loading');
        try {
            await deleteProjectItem(item.id, note);
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd usuwania.');
            setDelPhase('idle');
        }
    };

    return (
        <div className="p-5 hover:bg-black/[0.01] transition-colors">
            {error && <FeedbackBanner msg={error} onDismiss={() => setError('')} />}

            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border border-black/5 shrink-0 ${item.type === 'PRODUCT' ? 'bg-brand-primary/10 text-brand-primary' : 'bg-black/5 text-stone-500'
                        }`}>
                        {item.type === 'PRODUCT' ? <Package size={14} /> : <Wrench size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-stone-900 truncate">{item.category}</p>
                        {item.description && (
                            <p className="text-[10px] text-stone-500 font-bold truncate mt-0.5">{item.description}</p>
                        )}
                        {/* Metadata chips */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {item.order_number && (
                                <span className="text-[9px] font-mono font-bold text-stone-500 bg-black/5 px-2 py-0.5 rounded border border-black/5">
                                    Zam: {item.order_number}
                                </span>
                            )}
                            {item.invoice_number && (
                                <span className="text-[9px] font-mono font-bold text-stone-500 bg-black/5 px-2 py-0.5 rounded border border-black/5">
                                    FV: {item.invoice_number}
                                </span>
                            )}
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${Boolean(item.is_paid)
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                : 'bg-stone-100 text-stone-400 border-black/5'
                                }`}>
                                {Boolean(item.is_paid) ? 'Opłacone' : 'Nieopłacone'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {editingAmount ? (
                        <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-32 bg-black/5 border border-black/10 rounded-xl px-3 py-1.5 text-sm font-black text-stone-900 text-right focus:outline-none focus:border-brand-primary/50"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === 'Enter') saveAmount(); if (e.key === 'Escape') { setEditingAmount(false); setAmount(String(item.amount_net)); } }}
                                />
                                <button
                                    onClick={saveAmount}
                                    disabled={saving}
                                    className="px-3 py-1.5 bg-brand-primary hover:bg-brand-secondary text-black rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    {saving ? <Loader2 size={12} className="animate-spin" /> : 'Zapisz'}
                                </button>
                                <button
                                    onClick={() => { setEditingAmount(false); setAmount(String(item.amount_net)); }}
                                    className="px-3 py-1.5 bg-black/5 hover:bg-black/10 text-stone-400 rounded-xl text-[10px] font-black uppercase tracking-widest"
                                >
                                    Anuluj
                                </button>
                            </div>
                            <input
                                type="text"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Powód zmiany (opcjonalnie)..."
                                className="w-full bg-black/5 border border-black/10 rounded-lg px-3 py-1 text-[10px] text-stone-400 focus:outline-none focus:border-black/20"
                            />
                        </div>
                    ) : (
                        <p className="text-base font-black text-stone-900">
                            {formatPLN(item.amount_net)}
                            <span className="text-[10px] text-stone-500 ml-1">PLN</span>
                        </p>
                    )}

                    {canEdit && !editingAmount && !editingMeta && (
                        <>
                            {!isFinalized && (
                                <button
                                    onClick={() => setEditingAmount(true)}
                                    className="p-2 text-stone-600 hover:text-stone-900 hover:bg-black/5 rounded-xl transition-all border border-transparent hover:border-black/5"
                                    title="Edytuj kwotę"
                                >
                                    <Pencil size={14} />
                                </button>
                            )}

                            <button
                                onClick={() => setEditingMeta(true)}
                                className="p-2 text-stone-600 hover:text-stone-900 hover:bg-black/5 rounded-xl transition-all border border-transparent hover:border-black/5"
                                title="Edytuj nr zamówienia / faktury / status płatności"
                            >
                                <FileText size={14} />
                            </button>

                            {delPhase === 'confirming' ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="Powód usunięcia..."
                                        className="w-32 bg-red-900/10 border border-red-900/20 rounded-lg px-2 py-1 text-[10px] text-red-600 placeholder:text-red-900/50 focus:outline-none"
                                    />
                                    <button onClick={doDelete} className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-600 rounded-xl text-[10px] font-black uppercase">Usuń</button>
                                    <button onClick={() => { setDelPhase('idle'); setNote(''); }} className="px-3 py-1.5 bg-black/5 text-stone-400 rounded-xl text-[10px] font-black uppercase tracking-widest">Anuluj</button>
                                </div>
                            ) : delPhase === 'loading' ? (
                                <Loader2 size={14} className="animate-spin text-stone-500" />
                            ) : (
                                <button
                                    onClick={() => setDelPhase('confirming')}
                                    className="p-2 text-stone-600 hover:text-red-600 hover:bg-red-900/10 rounded-xl transition-all border border-transparent hover:border-red-900/20"
                                    title="Usuń pozycję"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Metadata edit form */}
            {editingMeta && (
                <div className="mt-4 p-4 bg-black/[0.02] border border-black/10 rounded-2xl space-y-3">
                    <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Dane dokumentowe</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1">Nr zamówienia</label>
                            <input
                                type="text"
                                value={orderNumber}
                                onChange={(e) => setOrderNumber(e.target.value)}
                                placeholder="np. ZAM-2024-001"
                                className="w-full bg-black/5 border border-black/10 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 focus:outline-none focus:border-brand-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1">Nr faktury klienta</label>
                            <input
                                type="text"
                                value={invoiceNumber}
                                onChange={(e) => setInvoiceNumber(e.target.value)}
                                placeholder="np. FV/2024/001"
                                className="w-full bg-black/5 border border-black/10 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 focus:outline-none focus:border-brand-primary/50"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setIsPaid(!isPaid)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${isPaid
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                                : 'bg-black/5 border-black/10 text-stone-500'
                                }`}
                        >
                            {isPaid ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                            {isPaid ? 'Opłacone' : 'Nieopłacone'}
                        </button>
                        <button
                            onClick={saveMeta}
                            disabled={savingMeta}
                            className="px-4 py-2 bg-brand-primary hover:bg-brand-secondary text-black rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {savingMeta ? <Loader2 size={12} className="animate-spin" /> : null}
                            Zapisz
                        </button>
                        <button
                            onClick={() => {
                                setEditingMeta(false);
                                setOrderNumber(item.order_number || '');
                                setInvoiceNumber(item.invoice_number || '');
                                setIsPaid(Boolean(item.is_paid));
                            }}
                            className="px-4 py-2 bg-black/5 hover:bg-black/10 text-stone-400 rounded-xl text-[10px] font-black uppercase tracking-widest"
                        >
                            Anuluj
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Add Item Form ───────────────────────────────────────────────────────────

function AddItemForm({ projectId }: { projectId: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [type, setType] = useState<'PRODUCT' | 'INSTALLATION'>('PRODUCT');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [orderNumber, setOrderNumber] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [isPaid, setIsPaid] = useState(false);
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const reset = () => {
        setType('PRODUCT'); setCategory(''); setDescription('');
        setAmount(''); setOrderNumber(''); setInvoiceNumber('');
        setIsPaid(false); setNote('');
    };

    const submit = async () => {
        const val = parseFloat(amount);
        if (!category.trim()) { setError('Podaj kategorię.'); return; }
        if (isNaN(val) || val <= 0) { setError('Kwota musi być > 0.'); return; }
        setLoading(true);
        setError('');
        try {
            await addProjectItem(projectId, {
                type,
                category: category.trim(),
                description: description.trim() || undefined,
                amount_net: val,
                order_number: orderNumber.trim() || undefined,
                invoice_number: invoiceNumber.trim() || undefined,
                is_paid: isPaid,
            }, note);
            setOpen(false);
            reset();
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd dodawania pozycji.');
        } finally {
            setLoading(false);
        }
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-black/10 rounded-2xl text-[10px] font-black text-stone-600 uppercase tracking-widest hover:border-brand-primary/30 hover:text-brand-primary transition-all"
            >
                <Plus size={14} />
                Dodaj pozycję
            </button>
        );
    }

    return (
        <div className="bg-black/[0.02] border border-black/10 rounded-2xl p-5 space-y-4">
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Nowa pozycja</p>

            {error && <FeedbackBanner msg={error} onDismiss={() => setError('')} />}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Type */}
                <div>
                    <label className="block text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1.5">Typ</label>
                    <div className="flex gap-2">
                        {(['PRODUCT', 'INSTALLATION'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setType(t)}
                                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${type === t
                                    ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary'
                                    : 'bg-black/5 border-black/5 text-stone-500 hover:border-black/10'
                                    }`}
                            >
                                {t === 'PRODUCT' ? 'Produkt' : 'Montaż'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Amount */}
                <div>
                    <label className="block text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1.5">Kwota netto (PLN)</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm font-black text-stone-900 focus:outline-none focus:border-brand-primary/50"
                    />
                </div>

                {/* Category */}
                <div>
                    <label className="block text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1.5">Kategoria</label>
                    <input
                        type="text"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="np. Tapeta, Farba, Montaż"
                        className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-stone-900 focus:outline-none focus:border-brand-primary/50"
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1.5">Opis (opcjonalnie)</label>
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Szczegóły…"
                        className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-stone-900 focus:outline-none focus:border-brand-primary/50"
                    />
                </div>

                {/* Order number */}
                <div>
                    <label className="block text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1.5">Nr zamówienia (opcjonalnie)</label>
                    <input
                        type="text"
                        value={orderNumber}
                        onChange={(e) => setOrderNumber(e.target.value)}
                        placeholder="np. ZAM-2024-001"
                        className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm font-mono text-stone-900 focus:outline-none focus:border-brand-primary/50"
                    />
                </div>

                {/* Invoice number */}
                <div>
                    <label className="block text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1.5">Nr faktury klienta (opcjonalnie)</label>
                    <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        placeholder="np. FV/2024/001"
                        className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm font-mono text-stone-900 focus:outline-none focus:border-brand-primary/50"
                    />
                </div>
            </div>

            {/* Is paid toggle */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => setIsPaid(!isPaid)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${isPaid
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                        : 'bg-black/5 border-black/10 text-stone-500'
                        }`}
                >
                    {isPaid ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {isPaid ? 'Opłacone' : 'Nieopłacone'}
                </button>
            </div>

            {/* Note */}
            <div>
                <label className="block text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1.5">Powód / Adnotacja (opcjonalnie)</label>
                <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="np. zwrot towaru, korekta pozycjonowania..."
                    className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2 text-[10px] text-stone-900 focus:outline-none focus:border-brand-primary/50"
                />
            </div>

            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={submit}
                    disabled={loading}
                    className="bg-brand-primary hover:bg-brand-secondary text-black px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Dodaj
                </button>
                <button
                    onClick={() => { setOpen(false); reset(); setError(''); }}
                    className="px-5 py-2.5 rounded-xl bg-black/5 text-stone-400 text-[10px] font-black uppercase tracking-widest hover:bg-black/10 transition-all"
                >
                    Anuluj
                </button>
            </div>
        </div>
    );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function AdminProjectDetailClient({ project, items, commissions, isAdmin, canChangeStatus, initialFiles }: Props) {
    const isFinalized = project.status === 'ZAKOŃCZONY';
    const productItems = items.filter((i) => i.type === 'PRODUCT');
    const installationItems = items.filter((i) => i.type === 'INSTALLATION');

    return (
        <div className="space-y-8">

            {/* Partner Info and Payout Management */}
            {isAdmin && project.architect && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Architect / Studio Info */}
                    <div className="lg:col-span-1 stat-card bg-card border border-black/5 space-y-6">
                        <div className="flex items-center gap-3 border-b border-black/5 pb-4">
                            <div className="p-2 rounded-lg bg-brand-primary/10 text-brand-primary">
                                <User size={16} />
                            </div>
                            <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Dane Partnera</h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1">Studio / Nazwisko</p>
                                <p className="text-sm font-black text-stone-900">{project.architect.studio_name || project.architect.name}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1">NIP</p>
                                    <p className="text-xs font-bold text-stone-400">{project.architect.nip || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1">Email</p>
                                    <p className="text-xs font-bold text-stone-400">{project.architect.email}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1">Adres</p>
                                <p className="text-xs font-medium text-stone-400 leading-relaxed">{project.architect.address || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1">Konto Bankowe</p>
                                <p className="text-[11px] font-mono text-brand-primary font-bold bg-brand-primary/5 p-2 rounded-lg border border-brand-primary/10 select-all">
                                    {project.architect.bank_account || 'BRAK NUMERU KONTA'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Payout Management */}
                    <div className="lg:col-span-2 stat-card bg-card border border-black/5 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between border-b border-black/5 pb-4 mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                        <FileText size={16} />
                                    </div>
                                    <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Rozliczenie Prowizji</h3>
                                </div>
                                {project.payout?.status && (
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${project.payout.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                        project.payout.status === 'IN_PAYMENT' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' :
                                            'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        }`}>
                                        {project.payout.status}
                                    </span>
                                )}
                            </div>

                            {!project.payout ? (
                                <div className="py-10 text-center space-y-3">
                                    <AlertTriangle size={32} className="mx-auto text-stone-700" />
                                    <p className="text-[10px] font-black text-stone-600 uppercase tracking-widest">Brak zgłoszonej wypłaty dla tego projektu</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-6">
                                            <div className="text-left">
                                                <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1">Zarobiona Kwota</p>
                                                <p className="text-3xl font-black text-stone-900 gold-text">
                                                    {formatPLN(project.payout.amount)} <span className="text-sm">PLN</span>
                                                </p>
                                            </div>
                                            {project.payout.invoice_url && (
                                                <a
                                                    href={project.payout.invoice_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-3 p-4 bg-emerald-500 text-black rounded-2xl hover:bg-emerald-400 transition-all group shrink-0"
                                                >
                                                    <FileText size={20} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Pobierz Fakturę</span>
                                                </a>
                                            )}
                                        </div>
                                        <div className="p-4 rounded-xl bg-black/5 border border-black/5">
                                            <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mb-2">Szczegóły wniosku</p>
                                            <div className="space-y-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                                                <p>ID: <span className="text-stone-900">{project.payout.id}</span></p>
                                                <p>Data: <span className="text-stone-900">{new Date(project.payout.created_at).toLocaleString('pl-PL')}</span></p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-black/20 rounded-2xl p-6 border border-black/5 space-y-4">
                                        <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Zarządzanie statusem płatności</p>
                                        <div className="space-y-3">
                                            <PayoutStatusActions payoutId={project.payout.id} currentStatus={project.payout.status} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Status transitions */}
            <StatusPanel project={project} canChangeStatus={canChangeStatus} />

            {/* Items */}
            <div className="stat-card bg-card border border-black/5 p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-black/5 flex items-center gap-3">
                    <Package size={16} className="text-brand-primary" />
                    <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
                        Pozycje projektu ({items.length})
                    </h3>
                </div>

                {/* PRODUCT items */}
                {productItems.length > 0 && (
                    <div>
                        <div className="px-6 py-2 bg-white/[0.015] flex items-center gap-2">
                            <Package size={12} className="text-brand-primary" />
                            <span className="text-[9px] font-black text-stone-600 uppercase tracking-widest">Produkty</span>
                        </div>
                        <div className="divide-y divide-black/5">
                            {productItems.map((item) => (
                                <ItemRow key={item.id} item={item} canEdit={isAdmin} isFinalized={isFinalized} />
                            ))}
                        </div>
                    </div>
                )}

                {/* INSTALLATION items */}
                {installationItems.length > 0 && (
                    <div>
                        <div className="px-6 py-2 bg-white/[0.015] border-t border-black/5 flex items-center gap-2">
                            <Wrench size={12} className="text-stone-500" />
                            <span className="text-[9px] font-black text-stone-600 uppercase tracking-widest">Montaż</span>
                        </div>
                        <div className="divide-y divide-black/5">
                            {installationItems.map((item) => (
                                <ItemRow key={item.id} item={item} canEdit={isAdmin} isFinalized={isFinalized} />
                            ))}
                        </div>
                    </div>
                )}

                {items.length === 0 && (
                    <div className="py-12 text-center">
                        <p className="text-[10px] text-stone-600 font-bold uppercase tracking-widest">Brak pozycji</p>
                    </div>
                )}

                {/* Add item form */}
                {isAdmin && !isFinalized && (
                    <div className="px-6 py-4 border-t border-black/5">
                        <AddItemForm projectId={project.id} />
                    </div>
                )}
            </div>

            {/* Commissions */}
            {commissions.length > 0 && (
                <div className="stat-card bg-card border border-black/5 p-0 overflow-hidden">
                    <div className="px-6 py-4 border-b border-black/5">
                        <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Prowizje</h3>
                    </div>
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/5">
                                <th className="px-6 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Kategoria</th>
                                <th className="px-6 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Wartość pozycji</th>
                                <th className="px-6 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Prowizja</th>
                                <th className="px-6 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {commissions.map((c) => (
                                <tr key={c.id} className="hover:bg-black/[0.02] transition-colors">
                                    <td className="px-6 py-4 text-sm font-bold text-stone-900">{c.category}</td>
                                    <td className="px-6 py-4 text-right text-sm font-black text-stone-400">
                                        {formatPLN(c.item_amount)} PLN
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-black text-stone-900">
                                        {formatPLN(c.amount_net)} PLN
                                        {c.note && (
                                            <p className="text-[9px] font-bold text-stone-500 italic mt-0.5">{c.note}</p>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${
                                            c.status === 'EARNED'
                                                ? 'bg-emerald-900/30 text-emerald-600 border-emerald-800/30'
                                                : c.status === 'IN_PAYMENT'
                                                    ? 'bg-blue-900/30 text-blue-600 border-blue-800/30'
                                                    : c.status === 'PAID'
                                                        ? 'bg-stone-200/30 text-stone-400 border-slate-600/30'
                                                        : 'bg-amber-100/30 text-amber-600 border-amber-800/30'
                                            }`}>
                                            {c.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <ProjectFilesSection
                projectId={project.id}
                currentUserId={project.owner_id}
                initialFiles={initialFiles}
                isAdmin={isAdmin}
            />
        </div>
    );
}

function PayoutStatusActions({ payoutId, currentStatus }: { payoutId: string; currentStatus: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState<string | null>(null);

    const updateStatus = async (status: string) => {
        setLoading(status);
        try {
            await updatePayoutStatus(payoutId, status);
            router.refresh();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(null);
        }
    };

    if (currentStatus === 'PAID') {
        return (
            <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <CheckCircle2 size={16} />
                Rozliczenie zakończone (Płatne)
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-2">
            <button
                disabled={!!loading || currentStatus === 'IN_PAYMENT'}
                onClick={() => updateStatus('IN_PAYMENT')}
                className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${currentStatus === 'IN_PAYMENT'
                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 cursor-default'
                    : 'bg-black/5 border-black/10 text-stone-400 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-600'
                    }`}
            >
                {loading === 'IN_PAYMENT' ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                Przekaż do płatności
            </button>
            <button
                disabled={!!loading}
                onClick={() => updateStatus('PAID')}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-[0_4px_24px_rgba(16,185,129,0.2)] disabled:opacity-50"
            >
                {loading === 'PAID' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Oznacz jako opłacone
            </button>
            <button
                disabled={!!loading}
                onClick={() => updateStatus('REJECTED')}
                className="w-full py-3 bg-red-50 hover:bg-red-900/40 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-red-900/30 disabled:opacity-50"
            >
                {loading === 'REJECTED' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Odrzuć wniosek
            </button>
        </div>
    );
}
