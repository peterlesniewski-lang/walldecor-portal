'use client';

import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { requestRedemption } from '@/app/actions/cashback';
import { useRouter } from 'next/navigation';
import { Button, formatPLN } from '@/components/ui';

interface RedeemCashbackButtonProps {
    balance: number;
}

export default function RedeemCashbackButton({ balance }: RedeemCashbackButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [amount, setAmount] = useState<number>(100);
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleRedeem = async () => {
        if (amount > balance) {
            setError('Niewystarczające środki.');
            return;
        }

        setError(null);
        setIsLoading(true);
        try {
            await requestRedemption(amount);
            setIsOpen(false);
            router.refresh();
        } catch (error: any) {
            setError(error?.message || 'Nie udało się złożyć wniosku.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-3">
            <Button
                fullWidth
                variant="secondary"
                icon={<CreditCard size={16} aria-hidden="true" />}
                onClick={() => { setIsOpen(!isOpen); setError(null); }}
                aria-expanded={isOpen}
            >
                Zrealizuj cashback (karta rabatowa)
            </Button>

            {isOpen && (
                <div className="rounded-md border border-border bg-surface-2 p-4">
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="redeem-amount" className="text-[13px] font-semibold text-ink-2">Kwota realizacji</label>
                        <div className="flex h-10 items-center rounded-sm border border-border-strong bg-surface pr-3 focus-within:border-ink focus-within:ring-[3px] focus-within:ring-ink/10">
                            <input
                                id="redeem-amount"
                                type="number"
                                min="0"
                                value={amount}
                                onChange={(e) => setAmount(Number(e.target.value))}
                                aria-invalid={Boolean(error) || undefined}
                                className="tnum h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-ink focus:outline-none"
                                placeholder="0"
                            />
                            <span className="text-[13px] text-ink-3">PLN</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setAmount(balance)}
                        className="mt-2 text-[13px] font-semibold text-brass-ink underline underline-offset-2 hover:text-ink"
                    >
                        Wymień całość: <span className="tnum">{formatPLN(balance)}</span>
                    </button>

                    {error && (
                        <p role="alert" className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">
                            {error}
                        </p>
                    )}

                    <div className="mt-4 flex items-center gap-3">
                        <Button
                            variant="secondary"
                            loading={isLoading}
                            disabled={amount <= 0 || amount > balance}
                            onClick={handleRedeem}
                        >
                            Złóż wniosek
                        </Button>
                        <p className="text-xs text-ink-2">Po zatwierdzeniu otrzymasz kod rabatowy do wykorzystania w sklepie WallDecor.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
