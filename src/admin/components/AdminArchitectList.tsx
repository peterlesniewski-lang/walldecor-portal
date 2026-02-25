'use client';

import React, { useState } from 'react';
import { ExternalLink, Edit2 } from 'lucide-react';
import AdminEditArchitectModal from './AdminEditArchitectModal';
import { formatPLN } from '@/lib/utils';

interface AdminArchitectListProps {
    architects: any[];
}

export default function AdminArchitectList({ architects }: AdminArchitectListProps) {
    const [editId, setEditId] = useState<string | null>(null);

    return (
        <div className="stat-card bg-card p-0 overflow-hidden max-h-[800px] flex flex-col">
            <div className="divide-y divide-black/5 overflow-y-auto">
                {architects.map((archi: any, i: number) => (
                    <div key={i} className="p-6 hover:bg-black/[0.02] transition-all flex items-center justify-between group cursor-default">
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
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setEditId(archi.id)}
                                title="Edytuj dane"
                                className="p-2.5 text-stone-700 hover:text-stone-900 hover:bg-black/5 rounded-xl transition-all border border-transparent hover:border-black/5"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button className="p-2.5 text-stone-700 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all border border-transparent hover:border-brand-primary/20">
                                <ExternalLink size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <AdminEditArchitectModal
                isOpen={editId !== null}
                onClose={() => setEditId(null)}
                architectId={editId}
            />
        </div>
    );
}
