'use client';

import React, { useState } from 'react';
import { CreditCard, Check, X, Loader2, Send } from 'lucide-react';
import { issueDiscountCode } from '@/app/actions/cashback';
import { useRouter } from 'next/navigation';
import { formatPLN } from '@/lib/utils';

interface AdminRedemptionQueueProps {
    requests: any[];
}

export default function AdminRedemptionQueue({ requests }: AdminRedemptionQueueProps) {
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});
    const router = useRouter();

    const handleIssue = async (id: string) => {
        const code = codeInputs[id];
        if (!code) {
            alert("Podaj kod rabatowy.");
            return;
        }

        setProcessingId(id);
        try {
            await issueDiscountCode(id, code);
            router.refresh();
        } catch (error: any) {
            alert(error.message);
        } finally {
            setProcessingId(null);
        }
    };

    if (!requests || requests.length === 0) return null;

    return (
        <div className="space-y-6">
            <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-3">
                <CreditCard size={16} className="text-brand-primary" />
                Wnioski o Karty Rabatowe (Cashback)
                <span className="bg-brand-primary/10 text-brand-primary text-[10px] px-3 py-1 rounded-full font-black border border-brand-primary/20">
                    {requests.length}
                </span>
            </h3>

            <div className="space-y-4">
                {requests.map((req) => (
                    <div key={req.id} className="stat-card bg-card border border-black/5 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:border-brand-primary/20 transition-all">
                        <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
                                <CreditCard size={20} />
                            </div>
                            <div>
                                <div className="text-sm font-black text-stone-900 group-hover:gold-text transition-all">
                                    {req.architect_name}
                                </div>
                                <div className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">
                                    Kwota: <span className="text-emerald-500">{formatPLN(req.amount)} PLN</span> • {new Date(req.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                placeholder="Wpisz kod rabatowy..."
                                value={codeInputs[req.id] || ''}
                                onChange={(e) => setCodeInputs({ ...codeInputs, [req.id]: e.target.value })}
                                className="bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-xs font-bold text-stone-900 focus:outline-none focus:border-brand-primary/50 min-w-[200px]"
                            />
                            <button
                                onClick={() => handleIssue(req.id)}
                                disabled={processingId === req.id || !codeInputs[req.id]}
                                className="p-3 bg-brand-primary text-black rounded-xl hover:bg-white transition-all disabled:opacity-50 flex items-center gap-2"
                                title="Zatwierdź i wyślij kod"
                            >
                                {processingId === req.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                <span className="text-[10px] font-black uppercase tracking-widest px-1">Wyślij</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
