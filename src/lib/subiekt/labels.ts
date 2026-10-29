// Etykiety integracji Subiekt dla panelu admina (czyste dane, bez JSX — testowalne przez node --test).
import { PROJECT_STATUS, type Tone } from '@/components/ui/statusMaps';
import { formatPLNFixed } from '@/lib/utils';

/** Polska etykieta statusu projektu; nieznany kod zostaje bez zmian (np. w etykiecie opcji <select>). */
export function projectStatusLabel(status: string): string {
    return PROJECT_STATUS[status]?.label ?? status;
}

/** Kwota dokumentu z groszami: 2400 → "2 400,00 PLN" (na dokumentach grosze mają znaczenie). */
export function formatDocAmount(value: number): string {
    return `${formatPLNFixed(value)} PLN`;
}

/** Powód w skrzynce nieprzypisanych (subiekt_documents.assignment_note) po polsku. Nieznany kod → bez zmian. */
export function assignmentReasonLabel(note: string | null | undefined): string {
    if (!note) return '—';
    const [code, ...rest] = note.split(':');
    const detail = rest.join(':');
    switch (code) {
        case 'NO_ARCHITECT':
            return 'brak kodu architekta';
        case 'UNKNOWN_ARCHITECT_CODE':
            return detail ? `nieznany kod ${detail}` : 'nieznany kod architekta';
        case 'NO_ROOT_DOCUMENT':
            return 'brak dokumentu nadrzędnego';
        case 'ROOT_UNASSIGNED':
            return 'dokument nadrzędny nieprzypisany';
        case 'OWNER_MISMATCH':
            return detail ? `inny architekt (${detail})` : 'inny architekt';
        case 'UNMATCHED_CORRECTION':
            return 'korekta nie pasuje do faktury';
        case 'PROJECT_CANCELLED':
            return 'projekt niezrealizowany';
        default:
            return note;
    }
}

/**
 * Status uruchomienia agenta (subiekt_sync_runs.status): sync.ts zapisuje RUNNING (strony w drodze) i DONE
 * (odebrano wszystkie strony). Inny kod → surowy kod w neutralnej pigułce.
 */
export const SYNC_RUN_STATUS: Record<string, { label: string; tone: Tone }> = {
    RUNNING: { label: 'W toku', tone: 'info' },
    DONE: { label: 'Zakończona', tone: 'success' },
};

export function syncRunStatusEntry(status: string): { label: string; tone: Tone } {
    return SYNC_RUN_STATUS[status] ?? { label: status, tone: 'neutral' };
}

/** Sposób przypisania dokumentu (subiekt_documents.assignment_status). */
export const ASSIGNMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
    AUTO: { label: 'Automatycznie', tone: 'neutral' },
    // accent, nie info: niebieski ma już znacznik „Subiekt · …” na pozycjach.
    MANUAL: { label: 'Ręcznie', tone: 'accent' },
    IGNORED: { label: 'Zignorowany', tone: 'neutral' },
    UNASSIGNED: { label: 'Nieprzypisany', tone: 'warning' },
};

export function assignmentStatusEntry(status: string): { label: string; tone: Tone } {
    return ASSIGNMENT_STATUS[status] ?? { label: status, tone: 'neutral' };
}

/** Data dokumentu 'YYYY-MM-DD' → 'dd.MM.rrrr' bez stref czasowych (ten sam tekst na serwerze i w przeglądarce). */
export function formatDocDate(value: string | null | undefined): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
    return match ? `${match[3]}.${match[2]}.${match[1]}` : '—';
}

/** Polska odmiana „dokument”: 1 dokument, 2 dokumenty, 5 dokumentów, 22 dokumenty. */
export function documentsLabel(count: number): string {
    const abs = Math.abs(count);
    const last = abs % 10;
    const lastTwo = abs % 100;
    const word = abs === 1 ? 'dokument' : last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'dokumenty' : 'dokumentów';
    return `${count} ${word}`;
}
