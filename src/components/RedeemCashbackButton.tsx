'use client';

import React, { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { requestRedemption } from '@/app/actions/cashback';
import { useRouter } from 'next/navigation';
import { formatPLN } from '@/lib/utils';

interface RedeemCashbackButtonProps {
    balance: number;
}

export default function RedeemCashbackButton({ balance }: RedeemCashbackButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [amount, setAmount] = useState<number>(100);
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();

    const handleRedeem = async () => {
        if (amount > balance) {
            alert("Niewystarczające środki.");
            return;
        }

        setIsLoading(true);
        try {
            await requestRedemption(amount);
            setIsOpen(false);
            router.refresh();
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full py-4 bg-brand-primary text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-3"
            >
                <CreditCard size={16} />
                Zrealizuj Cashback (Karta Rabatowa)
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-4 p-6 bg-white border border-black/10 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-4">Wybierz kwotę realizacji</h4>

                    <div className="space-y-4 mb-6">
                        <div className="relative">
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(Number(e.target.value))}
                                className="w-full bg-black/5 border border-black/10 rounded-xl py-3 px-4 text-sm font-black text-stone-900 focus:outline-none focus:border-brand-primary/50 text-right pr-20"
                                placeholder="0"
                            />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-stone-500 uppercase tracking-widest">
                                Kwota
                            </div>
                            <div className="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] font-black text-stone-500 uppercase">
                                PLN
                            </div>
                        </div>

                        <button
                            onClick={() => setAmount(balance)}
                            className="w-full py-2 bg-black/5 hover:bg-black/10 border border-black/5 rounded-xl text-[10px] font-black text-stone-400 hover:text-stone-900 uppercase tracking-widest transition-all"
                        >
                            Wypłać całość: {formatPLN(balance)} PLN
                        </button>
                    </div>

                    <button
                        onClick={handleRedeem}
                        disabled={isLoading || amount <= 0 || amount > balance}
                        className="w-full py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-primary transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Złóż wniosek'}
                    </button>

                    <p className="text-[9px] text-stone-600 mt-3 text-center">
                        Po zatwierdzeniu otrzymasz kod rabatowy <br /> do wykorzystania w naszym sklepie.
                    </p>
                </div>
            )}
        </div>
    );
}
