'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

export interface MobileNavLink {
    name: string;
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface MobileNavUser {
    name?: string | null;
    role: string;
}

interface MobileNavProps {
    user: MobileNavUser;
    links: MobileNavLink[];
}

/**
 * Nawigacja mobilna (< lg): sticky pasek górny + wysuwany drawer.
 * Na desktopie (lg+) jest ukryta, tam działa klasyczny Sidebar.
 */
export default function MobileNav({ user, links }: MobileNavProps) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // Zamknij drawer po zmianie trasy.
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // Blokada scrolla body + zamykanie klawiszem Escape, gdy drawer jest otwarty.
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

    return (
        <div className="lg:hidden">
            {/* Górny pasek */}
            <header className="sticky top-0 z-40 flex items-center justify-between bg-[#231f20] text-white border-b border-white/10 px-4 py-3">
                <Link href={links[0]?.href ?? '/dashboard'} className="flex items-center gap-3 min-w-0">
                    <Image
                        src="/walldecor-logo.jpg"
                        alt="WallDecor"
                        width={144}
                        height={145}
                        className="h-auto w-12 object-contain"
                    />
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate">
                        Portal Architekta
                    </span>
                </Link>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Otwórz menu"
                    aria-expanded={open}
                    aria-controls="mobile-nav-drawer"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-200 hover:bg-white/10 hover:text-white transition-colors"
                >
                    <Menu size={24} />
                </button>
            </header>

            {/* Overlay */}
            <div
                onClick={() => setOpen(false)}
                aria-hidden="true"
                className={`fixed inset-0 z-50 bg-black/60 transition-opacity duration-300 ${
                    open ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
            />

            {/* Drawer */}
            <aside
                id="mobile-nav-drawer"
                aria-hidden={!open}
                aria-label="Menu główne"
                className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-[#231f20] text-white border-r border-white/10 p-6 overflow-y-auto transition-transform duration-300 ease-out ${
                    open ? 'translate-x-0' : '-translate-x-full invisible'
                }`}
            >
                <div className="mb-8 flex items-center justify-between">
                    <Image
                        src="/walldecor-logo.jpg"
                        alt="WallDecor"
                        width={144}
                        height={145}
                        className="h-auto w-20 object-contain"
                    />
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Zamknij menu"
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-300 hover:bg-white/10 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 space-y-2">
                    {links.map((link) => {
                        const isActive = pathname === link.href;
                        const Icon = link.icon;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setOpen(false)}
                                className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
                            >
                                <Icon size={20} className={isActive ? 'text-brand-primary' : 'text-stone-400'} />
                                <span className="text-sm font-semibold">{link.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-8 space-y-4 pt-6 border-t border-white/10">
                    <div className="px-4 flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 shrink-0 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white font-bold text-lg overflow-hidden">
                            {user.name?.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">{user.name}</div>
                            <div className="text-[10px] text-brand-primary font-bold uppercase tracking-widest mt-0.5">
                                {user.role}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                        className="flex items-center gap-4 px-4 py-3.5 rounded-lg transition-all duration-300 text-stone-400 hover:text-white hover:bg-white/10 w-full"
                    >
                        <LogOut size={20} />
                        <span className="text-sm font-semibold">Wyloguj się</span>
                    </button>
                </div>
            </aside>
        </div>
    );
}
