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
                onClick={() => setIsModalOpen(true)}
                className="w-full flex items-center justify-between p-5 rounded-3xl bg-black/5 border border-black/5 hover:bg-black/10 transition-all group"
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center text-stone-500 group-hover:text-stone-900 transition-colors">
                        <Settings size={20} />
                    </div>
                    <span className="text-sm font-bold text-stone-400 group-hover:text-stone-900 transition-colors">Ustawienia Profilu</span>
                </div>
                <ArrowUpRight size={18} className="text-stone-700 group-hover:text-brand-primary transition-all" />
            </button>

            <ProfileSettingsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={user}
            />
        </>
    );
}
