'use client';

import React, { useState } from 'react';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import { requestPayout } from '@/app/actions/projects';

interface PayoutButtonProps {
    isEligible: boolean;
}

export default function PayoutButton({ isEligible }: PayoutButtonProps) {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleRequest = async () => {
        if (!isEligible || loading) return;

        setLoading(true);
        try {
            await requestPayout();
            setSuccess(true);
        } catch (error: any) {
            alert(error.message || "Błąd podczas zgłaszania wypłaty.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="w-full py-5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.2em]">
                <CheckCircle2 size={18} />
                Zlecenie przyjęte
            </div>
        );
    }

    return (
        <button
            onClick={handleRequest}
            disabled={!isEligible || loading}
            className={`w-full py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${isEligible && !loading
                    ? 'gold-gradient text-black hover:shadow-[0_10px_30px_rgba(212,175,55,0.3)] shadow-[0_8px_24px_rgba(0,0,0,0.2)] active:scale-[0.98]'
                    : 'bg-black/5 text-stone-600 cursor-not-allowed border border-black/5'
                }`}
        >
            <CreditCard size={18} />
            {loading ? 'PRZETWARZANIE...' : isEligible ? 'WYPŁAĆ PROWIZJĘ' : 'BRAK ŚRODKÓW DO WYPŁATY'}
        </button>
    );
}
