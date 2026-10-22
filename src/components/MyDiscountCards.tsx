'use client';

import React, { useState } from 'react';
import { CreditCard, Copy, Clock, CheckCircle2 } from 'lucide-react';
import { formatPLN } from '@/lib/utils';

interface MyDiscountCardsProps {
    redemptions: any[];
}

export default function MyDiscountCards({ redemptions }: MyDiscountCardsProps) {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = async (id: string, code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedId(id);
            setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
        } catch {
            // Schowek niedostępny — kod jest widoczny obok przycisku, można skopiować ręcznie
        }
    };

    if (!redemptions || redemptions.length === 0) return null;

    return (
        <div className="space-y-6">
            <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-3">
                <CreditCard size={16} className="text-brand-primary" />
                Moje Karty Rabatowe
            </h3>

            <div className="space-y-4">
                {redemptions.map((r) => (
                    <div key={r.id} className={`stat-card border border-black/5 p-6 flex items-center justify-between group ${r.status === 'PENDING' ? 'bg-card/50 opacity-80' : 'bg-card'}`}>
                        <div className="flex items-center gap-5">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${r.status === 'PENDING' ? 'bg-amber-100/10 border-amber-800/20 text-amber-500' : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'}`}>
                                {r.status === 'PENDING' ? <Clock size={20} /> : <CheckCircle2 size={20} />}
                            </div>
                            <div>
                                <div className="text-sm font-black text-stone-900">
                                    {r.status === 'PENDING' ? 'Wniosek w trakcie weryfikacji' : `Karta rabatowa: ${formatPLN(r.amount)} PLN`}
                                </div>
                                <div className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mt-1">
                                    Wniosek z dnia: {new Date(r.created_at).toLocaleDateString('pl-PL')}
                                </div>
                            </div>
                        </div>

                        {r.status === 'COMPLETED' ? (
                            <div className="flex items-center gap-4">
                                <div className="px-4 py-2 bg-black/5 border border-black/10 rounded-xl font-mono text-sm text-brand-primary font-bold">
                                    {r.code}
                                </div>
                                <button
                                    onClick={() => handleCopy(r.id, r.code)}
                                    className="p-3 bg-black/5 border border-black/10 rounded-xl text-stone-400 hover:text-stone-900 hover:bg-black/10 transition-all flex items-center gap-2"
                                    title="Kopiuj kod"
                                >
                                    {copiedId === r.id ? (
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600" role="status">Skopiowano</span>
                                    ) : (
                                        <Copy size={16} />
                                    )}
                                </button>
                            </div>
                        ) : (
                            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                Oczekuje
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
