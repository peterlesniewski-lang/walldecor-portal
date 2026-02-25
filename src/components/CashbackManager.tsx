'use client';

import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { updateProjectStatus } from '@/app/actions/projects';

export default function CashbackManager({ projects }: { projects: any[] }) {
    const [loading, setLoading] = useState(false);
    const [processed, setProcessed] = useState<string[]>([]);

    const handleRecalculate = async (projectId: string) => {
        setLoading(true);
        try {
            // Re-triggering ZAKOŃCZONY status will trigger the calculation logic 
            // but our projects.ts has a duplicate check, so we are safe.
            // If we wanted to ignore duplicates, we'd need a different action.
            // For now, this serves as a way to trigger pending ones.
            const res = await updateProjectStatus(projectId, 'ZAKOŃCZONY');
            if (res.success) {
                setProcessed([...processed, projectId]);
            }
        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const finalizedProjects = projects.filter(p => p.status === 'ZAKOŃCZONY');

    return (
        <div className="stat-card bg-card p-8 border border-black/5">
            <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                <RefreshCw size={16} className="text-brand-primary" />
                Menedżer Cashback
            </h3>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {finalizedProjects.length > 0 ? finalizedProjects.map((p) => (
                    <div key={p.id} className="p-4 rounded-2xl bg-black/5 border border-black/5 flex items-center justify-between group">
                        <div>
                            <p className="text-xs font-black text-stone-900">{p.name}</p>
                            <p className="text-[10px] text-stone-500 uppercase font-bold tracking-widest mt-1">ID: {p.id}</p>
                        </div>

                        {processed.includes(p.id) ? (
                            <div className="text-emerald-500 flex items-center gap-2 text-[10px] font-black uppercase">
                                <CheckCircle2 size={16} />
                                OK
                            </div>
                        ) : (
                            <button
                                onClick={() => handleRecalculate(p.id)}
                                disabled={loading}
                                className="p-2 text-stone-500 hover:text-brand-primary transition-all rounded-lg hover:bg-black/5"
                                title="Przelicz ponownie"
                            >
                                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                            </button>
                        )}
                    </div>
                )) : (
                    <div className="text-center py-8">
                        <AlertCircle size={24} className="mx-auto text-stone-700 mb-2" />
                        <p className="text-[10px] text-stone-600 font-bold uppercase tracking-widest">Brak sfinalizowanych projektów</p>
                    </div>
                )}
            </div>

            <div className="mt-8 pt-6 border-t border-black/5">
                <p className="text-[9px] text-stone-600 font-medium italic leading-relaxed">
                    Narzędzie służy do ręcznego wyzwalania naliczeń dla projektów, które utknęły lub wymagają ponownej weryfikacji.
                    System automatycznie zapobiega podwójnemu naliczeniu.
                </p>
            </div>
        </div>
    );
}
