'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import AdminProjectSubmissionModal from './AdminProjectSubmissionModal';
import AdminArchitectRegistrationModal from './AdminArchitectRegistrationModal';

interface HeaderActionsProps {
    userRole: string;
}

export default function AdminHeaderActions({ userRole }: HeaderActionsProps) {
    const [isArchiModalOpen, setIsArchiModalOpen] = useState(false);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

    return (
        <div className="flex items-center gap-4">
            <button className="bg-black/5 border border-black/5 text-stone-400 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black/10 hover:text-stone-900 transition-all">
                Pomoc
            </button>
            <button
                onClick={() => setIsArchiModalOpen(true)}
                className="bg-black/5 border border-black/5 text-stone-400 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black/10 hover:text-stone-900 transition-all flex items-center gap-2"
            >
                Rejestruj Architekta
            </button>
            <button
                onClick={() => setIsProjectModalOpen(true)}
                className="gold-gradient text-black px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:shadow-[0_10px_20px_rgba(212,175,55,0.2)] transition-all"
            >
                Dodaj projekt
            </button>

            <AdminProjectSubmissionModal
                isOpen={isProjectModalOpen}
                onClose={() => setIsProjectModalOpen(false)}
                userRole={userRole}
            />

            <AdminArchitectRegistrationModal
                isOpen={isArchiModalOpen}
                onClose={() => setIsArchiModalOpen(false)}
            />
        </div>
    );
}
