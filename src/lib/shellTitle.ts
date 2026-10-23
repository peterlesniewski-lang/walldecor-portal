/**
 * Tytuł i podtytuł nagłówka powłoki (PageHeader w dashboard/layout) zależne od ścieżki.
 * Strony nie rysują własnego h2 z tą samą treścią, więc tytuły się nie dublują.
 */
export interface ShellTitle {
    title: string;
    subtitle?: string;
}

const ADMIN_HOME: ShellTitle = {
    title: 'Centrum operacyjne',
    subtitle: 'Wypłaty, projekty i partnerzy w jednym widoku roboczym.',
};

const ARCHI_HOME: ShellTitle = {
    title: 'Panel architekta',
    subtitle: 'Projekty, prowizje i cashback bez zbędnego szumu.',
};

function normalize(pathname: string): string {
    const clean = pathname.split('?')[0].split('#')[0];
    return clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
}

export function resolveShellTitle(pathname: string, isAdmin: boolean): ShellTitle {
    const path = normalize(pathname);

    if (isAdmin) {
        if (path === '/dashboard/admin') return ADMIN_HOME;
        if (path === '/dashboard/admin/architects') {
            return { title: 'Architekci', subtitle: 'Partnerzy, ich statusy w programie i portfele cashback.' };
        }
        if (path.startsWith('/dashboard/admin/architects/')) return { title: 'Profil partnera' };
        if (path === '/dashboard/admin/invitations') {
            return { title: 'Zaproszenia', subtitle: 'Masowe dodawanie architektów: każdy dostaje link i sam ustawia hasło.' };
        }
        if (path.startsWith('/dashboard/admin/projects/')) return { title: 'Projekt' };
        if (path === '/dashboard/admin/settings' || path.startsWith('/dashboard/admin/settings/')) {
            return { title: 'Ustawienia', subtitle: 'Zarządzanie dostępem i użytkownikami systemu.' };
        }
        if (path === '/dashboard/admin/help' || path.startsWith('/dashboard/admin/help/')) return { title: 'Pomoc' };
        return ADMIN_HOME;
    }

    if (path === '/dashboard') return ARCHI_HOME;
    if (path === '/dashboard/projects') {
        return { title: 'Projekty', subtitle: 'Status, wartość i prowizja każdego zgłoszonego projektu.' };
    }
    if (path.startsWith('/dashboard/projects/')) return { title: 'Projekt' };
    if (path === '/dashboard/wallet') {
        return { title: 'Portfel', subtitle: 'Prowizje do wypłaty, wnioski i cashback na karty rabatowe.' };
    }
    if (path === '/dashboard/help' || path.startsWith('/dashboard/help/')) return { title: 'Pomoc' };
    return ARCHI_HOME;
}
