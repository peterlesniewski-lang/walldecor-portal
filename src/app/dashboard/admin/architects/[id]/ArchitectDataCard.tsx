'use client';

import React, { useState } from 'react';
import { User, Pencil, X, Save, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { updateArchitectData, deleteArchitect } from '@/app/actions/architects';

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

export default function ArchitectDataCard({ architect, isAdmin }: Props) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deletePhase, setDeletePhase] = useState<'idle' | 'confirming' | 'loading'>('idle');
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
        name: architect.name,
        email: architect.email,
        studio_name: architect.studio_name || '',
        nip: architect.nip || '',
        address: architect.address || '',
        bank_account: architect.bank_account || '',
        is_vat_payer: Boolean(architect.is_vat_payer),
    });

    const handleSave = async () => {
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
        try {
            await deleteArchitect(architect.id);
            router.push('/dashboard/admin/settings');
        } catch (err: any) {
            setError(err.message || 'Błąd podczas usuwania konta');
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

    return (
        <div className="stat-card bg-card border border-black/5 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <User size={16} className="text-brand-primary" />
                    <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Dane osobowe</h3>
                </div>
                {isAdmin && (
                    editing ? (
                        <button
                            onClick={cancelEdit}
                            className="p-1.5 rounded-xl hover:bg-black/5 text-stone-400 hover:text-stone-700 transition-all"
                            title="Anuluj edycję"
                        >
                            <X size={14} />
                        </button>
                    ) : (
                        <button
                            onClick={() => setEditing(true)}
                            className="p-1.5 rounded-xl hover:bg-black/5 text-stone-400 hover:text-stone-700 transition-all"
                            title="Edytuj dane"
                        >
                            <Pencil size={14} />
                        </button>
                    )
                )}
            </div>

            {!editing ? (
                <>
                    {[
                        { label: 'Imię i nazwisko', value: architect.name },
                        { label: 'Email', value: architect.email },
                        { label: 'Studio / Biuro', value: architect.studio_name || '—' },
                        { label: 'NIP', value: architect.nip || '—' },
                        { label: 'Adres', value: architect.address || '—' },
                        { label: 'Nr konta', value: architect.bank_account || '—' },
                        { label: 'VAT', value: Boolean(architect.is_vat_payer) ? 'Płatnik VAT' : 'Nie jest płatnikiem VAT' },
                    ].map((row) => (
                        <div key={row.label} className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-black text-stone-600 uppercase tracking-widest">{row.label}</span>
                            <span className="text-sm font-bold text-stone-900">{row.value}</span>
                        </div>
                    ))}

                    {/* Delete — ADMIN only */}
                    {isAdmin && (
                        <div className="pt-4 border-t border-black/5">
                            {deletePhase === 'idle' && (
                                <button
                                    onClick={() => setDeletePhase('confirming')}
                                    className="w-full py-2 rounded-xl font-black text-[10px] uppercase tracking-widest text-red-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={12} />
                                    Usuń konto architekta
                                </button>
                            )}
                            {deletePhase === 'confirming' && (
                                <div className="bg-red-50 rounded-2xl p-4 border border-red-100 space-y-3">
                                    <div className="flex items-center gap-2 text-red-600">
                                        <AlertTriangle size={14} />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Potwierdź usunięcie</p>
                                    </div>
                                    <p className="text-xs text-red-700 font-bold leading-relaxed">
                                        Konto architekta zostanie trwale usunięte. Projekty i historia finansowa pozostaną w systemie.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleDelete}
                                            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                        >
                                            Tak, usuń
                                        </button>
                                        <button
                                            onClick={() => setDeletePhase('idle')}
                                            className="flex-1 bg-black/5 text-stone-700 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black/10 transition-all"
                                        >
                                            Anuluj
                                        </button>
                                    </div>
                                </div>
                            )}
                            {deletePhase === 'loading' && (
                                <div className="flex items-center justify-center py-2 gap-2 text-red-500">
                                    <Loader2 size={14} className="animate-spin" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Usuwanie...</span>
                                </div>
                            )}
                            {error && deletePhase === 'idle' && (
                                <p className="text-xs text-red-600 font-bold mt-2">{error}</p>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <div className="space-y-4">
                    {([
                        { label: 'Imię i nazwisko', key: 'name', type: 'text', required: true },
                        { label: 'Email', key: 'email', type: 'email', required: true },
                        { label: 'Studio / Biuro', key: 'studio_name', type: 'text', required: false },
                        { label: 'NIP', key: 'nip', type: 'text', required: false },
                        { label: 'Nr konta', key: 'bank_account', type: 'text', required: false },
                    ] as const).map((field) => (
                        <div key={field.key} className="space-y-1">
                            <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{field.label}</label>
                            <input
                                type={field.type}
                                required={field.required}
                                value={form[field.key]}
                                onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                                className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm font-bold text-stone-900 focus:outline-none focus:border-brand-primary/50 transition-all"
                            />
                        </div>
                    ))}

                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Adres</label>
                        <textarea
                            rows={2}
                            value={form.address}
                            onChange={e => setForm({ ...form, address: e.target.value })}
                            className="w-full px-4 py-2.5 bg-black/[0.03] border border-black/10 rounded-xl text-sm font-bold text-stone-900 focus:outline-none focus:border-brand-primary/50 transition-all resize-none"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <div
                            onClick={() => setForm({ ...form, is_vat_payer: !form.is_vat_payer })}
                            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-all ${form.is_vat_payer ? 'bg-stone-900' : 'bg-black/10'}`}
                        >
                            <div className={`w-4 h-4 bg-white rounded-full transition-all shadow-sm ${form.is_vat_payer ? 'translate-x-6' : 'translate-x-0'}`} />
                        </div>
                        <span className="text-xs font-bold text-stone-600">Płatnik VAT</span>
                    </div>

                    {error && (
                        <p className="text-xs text-red-600 font-bold bg-red-50 px-3 py-2 rounded-xl border border-red-100">{error}</p>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="w-full bg-stone-900 hover:bg-black text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Zapisz zmiany
                    </button>
                </div>
            )}
        </div>
    );
}
