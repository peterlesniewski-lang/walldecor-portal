'use client';

import React, { useState } from 'react';
import { ExternalLink, Edit2, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteArchitect } from '@/app/actions/architects';
import EditArchitectModal from './EditArchitectModal';
import { formatPLN } from '@/lib/utils';

interface ArchitectListItem {
    id: string;
    name: string;
    projects_count: number;
    balance: number | string;
    pending_redemptions: number;
    has_business_history?: number | boolean;
}

interface ArchitectListProps {
    architects: ArchitectListItem[];
    isAdmin: boolean;
}

export default function ArchitectList({ architects, isAdmin }: ArchitectListProps) {
    const router = useRouter();
    const [editId, setEditId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async (archi: ArchitectListItem) => {
        if (archi.has_business_history) return;

        const confirmed = window.confirm(`Usunąć konto architekta ${archi.name}? Tej operacji nie można cofnąć.`);
        if (!confirmed) return;

        setError(null);
        setDeletingId(archi.id);
        try {
            await deleteArchitect(archi.id);
            router.refresh();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć konta architekta');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="stat-card bg-card p-0 overflow-hidden max-h-[800px] flex flex-col">
            {error && (
                <div className="mx-6 mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
                    {error}
                </div>
            )}
            <div className="divide-y divide-black/5 overflow-y-auto">
                {architects.map((archi) => (
                    <div key={archi.id} className="p-6 hover:bg-black/[0.02] transition-all flex items-center justify-between group cursor-default">
                        <div className="flex items-center gap-5">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs border border-black/5 ${archi.projects_count >= 11 ? 'bg-indigo-900/30 text-indigo-600' :
                                archi.projects_count >= 6 ? 'bg-brand-primary/20 text-brand-primary' :
                                    'bg-black/5 text-stone-500'
                                }`}>
                                {archi.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <div className="text-sm font-black text-stone-900 group-hover:gold-text transition-all">{archi.name}</div>
                                <div className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">
                                    {archi.projects_count} PROJEKTÓW •
                                    <span className="text-emerald-500 ml-1 italic">{formatPLN(archi.balance)} PLN</span>
                                    {archi.pending_redemptions > 0 && (
                                        <span className="ml-2 bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-lg border border-amber-500/20 text-[8px] flex items-center gap-1 inline-flex align-middle">
                                            <AlertCircle size={8} />
                                            WNIOSEK
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={() => setEditId(archi.id)}
                                        title="Edytuj dane"
                                        className="p-2.5 text-stone-700 hover:text-stone-900 hover:bg-black/5 rounded-xl transition-all border border-transparent hover:border-black/5"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(archi)}
                                        disabled={Boolean(archi.has_business_history) || deletingId === archi.id}
                                        title={archi.has_business_history
                                            ? 'Nie można usunąć konta z historią projektów lub rozliczeń'
                                            : 'Usuń konto architekta'
                                        }
                                        className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent disabled:hover:border-transparent"
                                    >
                                        {deletingId === archi.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                    </button>
                                </>
                            )}
                            <Link
                                href={`/dashboard/admin/architects/${archi.id}`}
                                title="Profil architekta"
                                className="p-2.5 text-stone-700 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all border border-transparent hover:border-brand-primary/20"
                            >
                                <ExternalLink size={16} />
                            </Link>
                        </div>
                    </div>
                ))}
            </div>

            <EditArchitectModal
                isOpen={!!editId}
                onClose={() => setEditId(null)}
                architectId={editId}
            />
        </div>
    );
}
