'use client';

import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import AdminArchitectRegistrationModal from './AdminArchitectRegistrationModal';

export default function AdminAddArchitect() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="bg-black/5 border border-black/5 text-stone-400 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black/10 hover:text-stone-900 transition-all flex items-center gap-2"
            >
                <UserPlus size={14} className="text-brand-primary" />
                Rejestruj Architekta
            </button>
            <AdminArchitectRegistrationModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
            />
        </>
    );
}
