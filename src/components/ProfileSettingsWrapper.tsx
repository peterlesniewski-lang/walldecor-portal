'use client';

import React, { useState } from 'react';
import { Settings, ArrowUpRight } from 'lucide-react';
import ProfileSettingsModal from './ProfileSettingsModal';

interface ProfileSettingsWrapperProps {
    user: {
        studio_name: string | null;
        nip: string | null;
        address: string | null;
        bank_account: string | null;
    };
}

export default function ProfileSettingsWrapper({ user }: ProfileSettingsWrapperProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="group flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3.5 text-left shadow-hairline transition-colors hover:border-border-strong"
            >
                <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-sm bg-ink/[0.06] text-ink-2">
                        <Settings size={18} aria-hidden="true" />
                    </span>
                    <span>
                        <span className="block text-sm font-semibold text-ink">Ustawienia profilu</span>
                        <span className="block text-xs text-ink-2">Dane firmy, NIP i numer konta</span>
                    </span>
                </span>
                <ArrowUpRight size={18} className="text-ink-3 transition-colors group-hover:text-ink" aria-hidden="true" />
            </button>

            <ProfileSettingsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={user}
            />
        </>
    );
}
