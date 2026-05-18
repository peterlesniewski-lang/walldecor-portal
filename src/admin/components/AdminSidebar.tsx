'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    FolderKanban,
    Wallet,
    Settings,
    LogOut,
    Users
} from 'lucide-react';
import { signOut } from 'next-auth/react';

interface AdminSidebarUser {
    name?: string | null;
    role?: string | null;
}

export default function AdminSidebar({ user }: { user: AdminSidebarUser }) {
    const pathname = usePathname();

    const menuItems = [
        { label: 'Command Center', icon: LayoutDashboard, href: '/admin/dashboard' },
        { label: 'Baza Partnerów', icon: Users, href: '/admin/partners' },
        { label: 'Wszystkie Projekty', icon: FolderKanban, href: '/admin/projects' },
        { label: 'Finanse & Wypłaty', icon: Wallet, href: '/admin/wallet' },
        { label: 'Ustawienia Portalu', icon: Settings, href: '/admin/settings' },
    ];

    return (
        <aside className="w-72 bg-[#231f20] text-white border-r border-white/10 flex flex-col p-8 sticky top-0 h-screen z-50">
            <div className="mb-12 px-2">
                <div className="flex flex-col items-center gap-3">
                    <Image src="/walldecor-logo.jpg" alt="WallDecor" width={144} height={145} priority className="h-auto w-36 object-contain" />
                    <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                        P o r t a l   A r c h i t e k t a
                    </div>
                </div>
            </div>

            <nav className="flex-1 space-y-2">
                {menuItems.map((link) => {
                    const isActive = pathname === link.href;
                    const Icon = link.icon;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
                        >
                            <Icon size={20} className={isActive ? 'text-brand-primary' : 'text-stone-400'} />
                            <span className="text-sm font-semibold">{link.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto space-y-6 pt-8 border-t border-white/10">
                <div className="px-4">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-12 h-12 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white font-bold text-lg overflow-hidden">
                                {user.name?.charAt(0)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white truncate w-32">
                                {user.name}
                            </div>
                            <div className="text-[10px] text-brand-primary font-bold uppercase tracking-widest mt-0.5">
                                {user.role}
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-lg transition-all duration-300 text-stone-400 hover:text-white hover:bg-white/10 w-full"
                >
                    <LogOut size={20} />
                    <span className="text-sm font-semibold">Wyloguj się</span>
                </button>
            </div>
        </aside>
    );
}
