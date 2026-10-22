'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Logo } from './ui/Logo';
import { NavGroupList, SignOutButton, UserBlock, type NavGroup, type NavLinkItem } from './ui/ShellNav';

export type MobileNavLink = NavLinkItem;

interface MobileNavUser {
    name?: string | null;
    role: string;
}

interface MobileNavProps {
    user: MobileNavUser;
    groups: NavGroup[];
}

/**
 * Nawigacja mobilna (< lg): sticky biały pasek górny (logo 32 px + przycisk menu) i biała szuflada z tymi
 * samymi grupami linków co Sidebar. Na desktopie (lg+) jest ukryta, tam działa Sidebar.
 */
export default function MobileNav({ user, groups }: MobileNavProps) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // Zamknij szufladę po zmianie trasy.
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // Blokada scrolla body + zamykanie klawiszem Escape, gdy szuflada jest otwarta.
    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const homeHref = groups[0]?.links[0]?.href ?? '/dashboard';

    return (
        <div className="lg:hidden">
            {/* Górny pasek */}
            <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
                <Link href={homeHref} className="flex min-w-0 items-center gap-3" aria-label="WallDecor, Portal Architekta">
                    <Logo height={32} priority />
                    <span className="truncate text-xs text-ink-3">Portal Architekta</span>
                </Link>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Otwórz menu"
                    aria-expanded={open}
                    aria-controls="mobile-nav-drawer"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
                >
                    <Menu size={22} aria-hidden="true" />
                </button>
            </header>

            {/* Przyciemnienie tła: tylko oddziela szufladę od treści, bez czarnego panelu */}
            <div
                onClick={() => setOpen(false)}
                aria-hidden="true"
                className={`fixed inset-0 z-50 bg-ink/25 transition-opacity duration-200 ${
                    open ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
            />

            {/* Szuflada */}
            <aside
                id="mobile-nav-drawer"
                aria-hidden={!open}
                aria-label="Menu główne"
                className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-surface p-3 shadow-float transition-transform duration-200 ease-out ${
                    open ? 'translate-x-0' : 'invisible -translate-x-full'
                }`}
            >
                <div className="flex items-center justify-between px-3 pb-3 pt-2">
                    <Logo height={32} />
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Zamknij menu"
                        className="flex h-11 w-11 items-center justify-center rounded-sm text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
                    >
                        <X size={22} aria-hidden="true" />
                    </button>
                </div>

                <NavGroupList groups={groups} onNavigate={() => setOpen(false)} />

                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
                    <UserBlock name={user.name} role={user.role} />
                    <SignOutButton />
                </div>
            </aside>
        </div>
    );
}
