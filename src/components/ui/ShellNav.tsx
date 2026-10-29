'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { cx } from './cx';

/**
 * Elementy wspólne dla Sidebar (desktop) i MobileNav (szuflada): grupy linków, blok użytkownika, wylogowanie.
 * Strony ich nie używają bezpośrednio.
 */
export interface NavLinkItem {
    name: string;
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
    /** Licznik po prawej (np. dokumenty do obsłużenia). 0 lub brak = bez licznika. */
    badge?: { count: number; label: string };
}

export interface NavGroup {
    label: string;
    links: NavLinkItem[];
}

export const ROLE_LABELS: Record<string, string> = {
    ADMIN: 'Administrator',
    STAFF: 'Zespół',
    ARCHI: 'Architekt',
};

export function roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? 'Użytkownik';
}

/** Aktywny jest link o najdłuższym pasującym href (dokładnie lub jako prefiks ścieżki). */
export function findActiveHref(pathname: string, groups: NavGroup[]): string | null {
    let best: string | null = null;
    for (const group of groups) {
        for (const { href } of group.links) {
            const matches = pathname === href || pathname.startsWith(href + '/');
            if (matches && (best === null || href.length > best.length)) best = href;
        }
    }
    return best;
}

export function NavGroupList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
    const pathname = usePathname();
    const activeHref = findActiveHref(pathname, groups);

    return (
        <nav aria-label="Nawigacja główna" className="flex flex-1 flex-col gap-0.5">
            {groups.map((group) => (
                <div key={group.label} className="flex flex-col gap-0.5">
                    <div className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                        {group.label}
                    </div>
                    {group.links.map((link) => {
                        const isActive = link.href === activeHref;
                        const Icon = link.icon;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={onNavigate}
                                aria-current={isActive ? 'page' : undefined}
                                className={cx(
                                    'flex items-center gap-2.5 rounded-sm px-3 py-[9px] text-sm transition-colors duration-150',
                                    isActive
                                        ? 'bg-brass-soft font-semibold text-ink'
                                        : 'font-medium text-ink-2 hover:bg-ink/[0.04] hover:text-ink',
                                )}
                            >
                                <Icon size={16} aria-hidden={true} className={isActive ? 'text-brass-ink' : undefined} />
                                <span>{link.name}</span>
                                {link.badge && link.badge.count > 0 && (
                                    <span
                                        title={link.badge.label}
                                        className="ml-auto grid h-5 min-w-5 place-items-center rounded-pill bg-brass px-1.5 text-[11px] font-bold leading-none tnum text-ink"
                                    >
                                        <span aria-hidden="true">{link.badge.count}</span>
                                        <span className="sr-only">{link.badge.label}</span>
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            ))}
        </nav>
    );
}

export function UserBlock({ name, role }: { name?: string | null; role: string }) {
    const initial = (name?.trim().charAt(0) || '?').toUpperCase();
    return (
        <div className="flex min-w-0 items-center gap-3 px-3">
            <div
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brass-soft text-sm font-bold text-brass-ink"
            >
                {initial}
            </div>
            <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{name}</div>
                <div className="text-xs text-ink-2">{roleLabel(role)}</div>
            </div>
        </div>
    );
}

export function SignOutButton() {
    return (
        <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="flex w-full items-center gap-2.5 rounded-sm px-3 py-[9px] text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-ink/[0.04] hover:text-ink"
        >
            <LogOut size={16} aria-hidden="true" />
            <span>Wyloguj się</span>
        </button>
    );
}
