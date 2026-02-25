'use client';

import React, { useState } from 'react';
import { DollarSign, ChevronRight } from 'lucide-react';
import CommissionPayoutModal from './CommissionPayoutModal';

interface CommissionPayoutButtonProps {
    isEligible: boolean;
    amount: number;
    projectNames: string[];
}

export default function CommissionPayoutButton({ isEligible, amount, projectNames }: CommissionPayoutButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => isModalOpen || setIsModalOpen(true)}
                disabled={!isEligible}
                className={`w-full py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${isEligible
                        ? 'gold-gradient text-black hover:shadow-[0_10px_30px_rgba(212,175,55,0.3)]'
                        : 'bg-black/5 text-stone-600 cursor-not-allowed border border-black/5'
                    }`}
            >
                <DollarSign size={18} />
                {isEligible ? 'Wypłać Prowizję' : 'Wypłata niedostępna'}
                <ChevronRight size={14} className="ml-1 opacity-50" />
            </button>

            <CommissionPayoutModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                amount={amount}
                projectNames={projectNames}
            />
        </>
    );
}
