import crypto from 'crypto';

/**
 * Zaproszenia do portalu: logika czysta (bez DB), współdzielona przez server actions,
 * stronę akceptacji i panel admina. Testowana w tests/invitations.test.ts.
 */

/** Ważność linku zaproszenia (dni). Po tym czasie admin wysyła zaproszenie ponownie. */
export const INVITATION_TTL_DAYS = 14;

/** Ile zaproszeń wysyła jedno wywołanie server action. Klient wysyła kolejne partie i pokazuje postęp. */
export const INVITATION_SEND_BATCH = 20;

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

/** Status pokazywany w panelu: PENDING rozbite na niewysłane / wysłane / wygasłe. */
export type InvitationDisplayStatus = 'UNSENT' | 'SENT' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';

export const INVITATION_DISPLAY_LABEL: Record<InvitationDisplayStatus, string> = {
    UNSENT: 'Niewysłane',
    SENT: 'Oczekuje',
    EXPIRED: 'Wygasłe',
    ACCEPTED: 'Zaakceptowane',
    REVOKED: 'Anulowane',
};

export interface InvitationDraft {
    email: string;
    name: string | null;
    studio_name: string | null;
}

export interface ParsedInvitationLine extends InvitationDraft {
    /** Numer linii w wklejonym tekście (od 1). */
    line: number;
    raw: string;
    error: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_IN_TEXT = /[^\s<>,;"'()\[\]]+@[^\s<>,;"'()\[\]]+\.[^\s<>,;"'()\[\]]+/;
const MAX_NAME_LENGTH = 120;

export function normalizeEmail(raw: string): string {
    return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
    return EMAIL_REGEX.test(email) && email.length <= 254;
}

export function generateInvitationToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

function cleanField(value: string | undefined): string | null {
    if (!value) return null;
    const cleaned = value.trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    return cleaned.slice(0, MAX_NAME_LENGTH);
}

/**
 * Parsuje wklejoną listę osób: jedna osoba w linii. Rozdzielacze: przecinek, średnik, tabulator
 * (kolumny z Excela / Google Sheets). Email rozpoznawany po "@", więc kolejność kolumn jest dowolna,
 * a format "Jan Kowalski <jan@firma.pl>" z klienta pocztowego też działa.
 * Pozostałe kolumny: pierwsza = imię i nazwisko, druga = pracownia.
 * Pierwsza niepusta linia bez adresu, zawierająca słowo "email", to nagłówek i jest pomijana.
 * Duplikaty w obrębie listy to błąd.
 */
export function parseInvitationList(text: string): ParsedInvitationLine[] {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const seen = new Set<string>();
    const result: ParsedInvitationLine[] = [];
    let firstContentLine = true;

    lines.forEach((rawLine, index) => {
        const raw = rawLine.trim();
        if (!raw) return;
        const isFirst = firstContentLine;
        firstContentLine = false;

        const match = raw.match(EMAIL_IN_TEXT);
        if (!match) {
            // Nagłówek skopiowany razem z danymi (tylko pierwsza linia): pomijamy bez błędu.
            if (isFirst && /e-?mail/i.test(raw)) return;
            result.push({ line: index + 1, raw, email: '', name: null, studio_name: null, error: 'Brak adresu email' });
            return;
        }

        const email = normalizeEmail(match[0]);
        const rest = raw.replace(match[0], ' ').replace(/[<>]/g, ' ');
        const columns = rest.split(/[\t;,]/).map(cleanField).filter((c): c is string => c !== null);
        const name = columns[0] ?? null;
        const studio_name = columns[1] ?? null;

        let error: string | null = null;
        if (!isValidEmail(email)) error = 'Nieprawidłowy adres email';
        else if (seen.has(email)) error = 'Duplikat w liście';
        seen.add(email);

        result.push({ line: index + 1, raw, email, name, studio_name, error });
    });

    return result;
}

export interface InvitationStatusInput {
    status: InvitationStatus | string;
    sent_at: string | Date | null;
    /** Policzone w SQL (expires_at <= NOW()), żeby nie porównywać stref czasowych w JS. */
    is_expired: number | boolean;
}

export function deriveInvitationStatus(inv: InvitationStatusInput): InvitationDisplayStatus {
    if (inv.status === 'ACCEPTED') return 'ACCEPTED';
    if (inv.status === 'REVOKED') return 'REVOKED';
    if (Number(inv.is_expired) === 1 || inv.is_expired === true) return 'EXPIRED';
    if (!inv.sent_at) return 'UNSENT';
    return 'SENT';
}

/** Dzieli imię i nazwisko na kolumny users.first_name / users.last_name. */
export function splitFullName(fullName: string): { first_name: string; last_name: string | null } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return { first_name: parts[0] ?? '', last_name: parts.length > 1 ? parts.slice(1).join(' ') : null };
}

export function buildInvitationLink(portalUrl: string, token: string): string {
    return `${portalUrl.replace(/\/+$/, '')}/auth/invite?token=${token}`;
}

export function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}
