'use client';

import { usePathname } from 'next/navigation';
import HeaderActions from './HeaderActions';
import { PageHeader } from './ui/PageHeader';
import { resolveShellTitle } from '@/lib/shellTitle';

/**
 * Nagłówek powłoki panelu: tytuł zależy od ścieżki (jedyny h1 na stronie), akcje to HeaderActions.
 */
export default function ShellHeader({ userRole }: { userRole: string }) {
    const pathname = usePathname();
    const isAdmin = userRole === 'ADMIN' || userRole === 'STAFF';
    const { title, subtitle } = resolveShellTitle(pathname, isAdmin);

    return (
        <PageHeader
            title={title}
            subtitle={subtitle}
            actions={<HeaderActions userRole={userRole} />}
        />
    );
}
