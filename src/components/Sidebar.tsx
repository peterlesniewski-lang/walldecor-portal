'use client';

import {
    LayoutDashboard,
    FolderKanban,
    Wallet,
    Settings,
    Users,
    MailPlus,
    CircleHelp,
    Plug
} from 'lucide-react';
import MobileNav from './MobileNav';
import { Logo } from './ui/Logo';
import { NavGroupList, SignOutButton, UserBlock, type NavGroup } from './ui/ShellNav';

interface SidebarUser {
    name?: string | null;
    role: 'ADMIN' | 'STAFF' | 'ARCHI' | string;
}

/**
 * Jasny sidebar (lg+), 240 px: logo, grupy linków, użytkownik z rolą po polsku i wylogowanie.
 * Na węższych ekranach zamiast niego działa MobileNav (ten sam układ grup).
 */
export default function Sidebar({ user, subiektUnassignedCount = 0 }: {
    user: SidebarUser;
    /** Dokumenty w skrzynce „Nieprzypisane” (liczone w layoucie tylko dla ADMIN/STAFF). */
    subiektUnassignedCount?: number;
}) {
    const groups: NavGroup[] = user.role === 'ADMIN' || user.role === 'STAFF'
        ? [
            {
                label: 'Operacje',
                links: [
                    { name: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
                    { name: 'Architekci', href: '/dashboard/admin/architects', icon: Users },
                    { name: 'Zaproszenia', href: '/dashboard/admin/invitations', icon: MailPlus },
                    {
                        name: 'Subiekt',
                        href: '/dashboard/admin/integrations/subiekt',
                        icon: Plug,
                        badge: { count: subiektUnassignedCount, label: `Nieprzypisane dokumenty Subiekt: ${subiektUnassignedCount}` },
                    },
                ],
            },
            {
                label: 'System',
                links: [
                    { name: 'Ustawienia', href: '/dashboard/admin/settings', icon: Settings },
                    { name: 'Pomoc', href: '/dashboard/admin/help', icon: CircleHelp },
                ],
            },
        ]
        : [
            {
                label: 'Moje',
                links: [
                    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
                    { name: 'Projekty', href: '/dashboard/projects', icon: FolderKanban },
                    { name: 'Portfel', href: '/dashboard/wallet', icon: Wallet },
                ],
            },
            {
                label: 'Pomoc',
                links: [
                    { name: 'Pomoc', href: '/dashboard/help', icon: CircleHelp },
                ],
            },
        ];

    return (
        <>
            <MobileNav user={user} groups={groups} />
            <aside className="sticky top-0 z-40 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface p-3 lg:flex">
                <div className="flex flex-col gap-1.5 px-3 pb-3 pt-4">
                    <Logo height={40} priority />
                    <div className="text-xs text-ink-3">Portal Architekta</div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <NavGroupList groups={groups} />
                </div>

                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
                    <UserBlock name={user.name} role={user.role} />
                    <SignOutButton />
                </div>
            </aside>
        </>
    );
}
