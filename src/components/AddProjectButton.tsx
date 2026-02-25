'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import ProjectSubmissionModal from './ProjectSubmissionModal';

interface AddProjectButtonProps {
    userRole: string;
}

export default function AddProjectButton({ userRole }: AddProjectButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="text-blue-600 hover:text-blue-800 transition-all flex items-center gap-1 text-xs font-bold"
            >
                <Plus size={14} /> DODAJ
            </button>
            <ProjectSubmissionModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                userRole={userRole}
            />
        </>
    );
}
