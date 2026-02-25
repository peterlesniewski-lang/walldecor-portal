'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import AdminProjectSubmissionModal from './AdminProjectSubmissionModal';

export default function AdminAddProject({ userRole }: { userRole?: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="text-blue-600 hover:text-blue-800 transition-all flex items-center gap-1 text-xs font-bold"
            >
                <Plus size={14} /> DODAJ
            </button>
            <AdminProjectSubmissionModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                userRole={userRole}
            />
        </>
    );
}
