'use client';

import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import ArchitectRegistrationModal from './ArchitectRegistrationModal';
import { Button } from './ui/Button';

/**
 * Rejestracja architekta jako akcja drugorzędna (secondary): przycisk główny jest w nagłówku powłoki.
 */
export default function AddArchitectButton({ canRegisterArchitects }: { canRegisterArchitects: boolean }) {
    const [isOpen, setIsOpen] = useState(false);

    if (!canRegisterArchitects) return null;

    return (
        <>
            <Button
                variant="secondary"
                size="sm"
                icon={<UserPlus size={14} aria-hidden="true" />}
                onClick={() => setIsOpen(true)}
            >
                Zarejestruj architekta
            </Button>
            <ArchitectRegistrationModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
            />
        </>
    );
}
