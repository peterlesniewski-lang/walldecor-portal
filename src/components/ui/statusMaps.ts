/**
 * Etykiety i tony statusów (czyste dane, bez JSX, dzięki temu testowalne przez node --test).
 * Kody z bazy nigdy nie trafiają do interfejsu: zawsze przez te mapy, zwykle przez <StatusPill>.
 */

export type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

export interface StatusEntry {
    label: string;
    tone: Tone;
}

export type StatusMap = Record<string, StatusEntry>;

export const PROJECT_STATUS: StatusMap = {
    'ZGŁOSZONY': { label: 'Zgłoszony', tone: 'neutral' },
    'PRZYJĘTY': { label: 'Przyjęty', tone: 'accent' },
    'W_REALIZACJI': { label: 'W realizacji', tone: 'info' },
    'ZAKOŃCZONY': { label: 'Zakończony', tone: 'success' },
    'NIEZREALIZOWANY': { label: 'Niezrealizowany', tone: 'danger' },
};

export const COMMISSION_STATUS: StatusMap = {
    PENDING: { label: 'Planowana', tone: 'warning' },
    EARNED: { label: 'Zarobiona', tone: 'accent' },
    IN_PAYMENT: { label: 'W wypłacie', tone: 'info' },
    PAID: { label: 'Wypłacona', tone: 'success' },
};

export const PAYOUT_STATUS: StatusMap = {
    PENDING: { label: 'Oczekuje', tone: 'warning' },
    IN_PAYMENT: { label: 'W płatności', tone: 'info' },
    HOLD: { label: 'Wstrzymana', tone: 'warning' },
    APPROVED: { label: 'Zatwierdzona', tone: 'accent' },
    PAID: { label: 'Wypłacona', tone: 'success' },
    REJECTED: { label: 'Odrzucona', tone: 'danger' },
};

/** Wnioski o kartę cashback (tabela cashback_redemptions). */
export const CASHBACK_STATUS: StatusMap = {
    PENDING: { label: 'Do decyzji', tone: 'warning' },
    COMPLETED: { label: 'Zrealizowany', tone: 'success' },
};

export type StatusKind = 'project' | 'commission' | 'payout' | 'cashback';

export const STATUS_MAPS: Record<StatusKind, StatusMap> = {
    project: PROJECT_STATUS,
    commission: COMMISSION_STATUS,
    payout: PAYOUT_STATUS,
    cashback: CASHBACK_STATUS,
};

/** Polska etykieta statusu. Nieznany kod daje neutralne "Nieznany status", nigdy surowy kod z bazy. */
export function getStatusEntry(kind: StatusKind, status: string | null | undefined): StatusEntry {
    const entry = status ? STATUS_MAPS[kind][status] : undefined;
    return entry ?? { label: 'Nieznany status', tone: 'neutral' };
}
