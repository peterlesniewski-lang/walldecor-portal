'use client';

import React, { useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import ProjectSubmissionModal from './ProjectSubmissionModal';
import ArchitectRegistrationModal from './ArchitectRegistrationModal';
import { Button } from './ui/Button';

interface HeaderActionsProps {
    userRole: string;
}

/**
 * Akcje w nagłówku strony. Jeden przycisk główny: dodanie/zgłoszenie projektu.
 * Pozostałe akcje są drugorzędne (secondary/ghost).
 */
export default function HeaderActions({ userRole }: HeaderActionsProps) {
    const [isArchiModalOpen, setIsArchiModalOpen] = useState(false);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const isAdmin = userRole === 'ADMIN' || userRole === 'STAFF';

    return (
        <div className="flex items-center gap-3">
            {/* Pomoc jest w szufladzie MobileNav, więc jako przycisk tylko na desktopie */}
            <div className="hidden lg:block">
                <Button
                    href={isAdmin ? '/dashboard/admin/help' : '/dashboard/help'}
                    variant="ghost"
                >
                    Pomoc
                </Button>
            </div>
            {isAdmin ? (
                <>
                    <div className="hidden lg:block">
                        <Button variant="secondary" onClick={() => setIsArchiModalOpen(true)}>
                            Zarejestruj architekta
                        </Button>
                    </div>
                    {/* Mobile: drugorzędna akcja jako ikona z aria-label, żeby akcje zajmowały jeden wiersz */}
                    <div className="lg:hidden">
                        <Button
                            variant="secondary"
                            aria-label="Zarejestruj architekta"
                            title="Zarejestruj architekta"
                            className="w-10 px-0!"
                            icon={<UserPlus size={18} aria-hidden="true" />}
                            onClick={() => setIsArchiModalOpen(true)}
                        />
                    </div>
                    <Button onClick={() => setIsProjectModalOpen(true)}>
                        Dodaj projekt
                    </Button>
                </>
            ) : (
                <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setIsProjectModalOpen(true)}>
                    Zgłoś nowy projekt
                </Button>
            )}

            <ProjectSubmissionModal
                isOpen={isProjectModalOpen}
                onClose={() => setIsProjectModalOpen(false)}
                userRole={userRole}
            />

            <ArchitectRegistrationModal
                isOpen={isArchiModalOpen}
                onClose={() => setIsArchiModalOpen(false)}
            />
        </div>
    );
}
