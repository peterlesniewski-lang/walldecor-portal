'use client';

import React, { useState } from 'react';
import { Banknote } from 'lucide-react';
import { Button } from '@/components/ui';
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
            <Button
                fullWidth
                disabled={!isEligible}
                icon={<Banknote size={16} aria-hidden="true" />}
                onClick={() => isModalOpen || setIsModalOpen(true)}
            >
                {isEligible ? 'Wypłać prowizję' : 'Wypłata niedostępna'}
            </Button>

            <CommissionPayoutModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                amount={amount}
                projectNames={projectNames}
            />
        </>
    );
}
