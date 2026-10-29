/**
 * Formatowanie liczb i dat w interfejsie. Zawsze 'pl-PL'.
 * formatPLN(5000) -> "5 000 PLN" (separator tysięcy to twarda spacja, więc kwota się nie łamie)
 * formatDate('2026-06-10 12:00:00') -> "10.06.2026"
 *
 * 'pl-PL' domyślnie NIE grupuje liczb 4-cyfrowych (5000 zamiast "5 000"), dlatego useGrouping: 'always'.
 * Uwaga: src/lib/utils.ts ma własne formatPLN bez waluty ("5 000"). Prymitywy UI używają tej wersji,
 * bo design system wymaga formy "5 000 PLN".
 */

const NO_VALUE = '—';

function toNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'string' ? parseFloat(value.replace(/\s/g, '').replace(',', '.')) : value;
    return Number.isFinite(n) ? n : null;
}

/** Sama liczba po polsku, bez waluty: 29720 -> "29 720". Brak wartości -> "—". */
export function formatNumber(value: number | string | null | undefined, maxFractionDigits = 2): string {
    const n = toNumber(value);
    if (n === null) return NO_VALUE;
    return n.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: maxFractionDigits, useGrouping: 'always' });
}

/** Kwota z walutą po liczbie: 5000 -> "5 000 PLN", 350.5 -> "350,5 PLN". Brak wartości -> "—". */
export function formatPLN(value: number | string | null | undefined): string {
    const n = toNumber(value);
    if (n === null) return NO_VALUE;
    return `${formatNumber(n)} PLN`;
}

/**
 * Kwota ze znakiem wyświetlanym RAZ: 240 -> "+240 PLN", -50 -> "−50 PLN" (minus typograficzny U+2212).
 * Znak wynika z wartości, więc ujemne kwoty z bazy (np. SPEND) nie dają podwójnego minusa. Brak wartości -> "—".
 */
export function formatSignedPLN(value: number | string | null | undefined): string {
    const n = toNumber(value);
    if (n === null) return NO_VALUE;
    if (n === 0) return formatPLN(0);
    return `${n < 0 ? '\u2212' : '+'}${formatPLN(Math.abs(n))}`;
}

function toDate(value: Date | string | number | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') return null;
    // Surowy format SQL ("2026-06-10 12:00:00") pochodzi z CURRENT_TIMESTAMP, czyli UTC — bez 'Z' JS czytałby go
    // w strefie serwera. ISO z offsetem i Date przechodzą bez zmian.
    const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
        ? value.replace(' ', 'T') + 'Z'
        : value;
    const d = normalized instanceof Date
        ? normalized
        : new Date(typeof normalized === 'string' ? normalized.replace(' ', 'T') : normalized);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Data jako dd.MM.rrrr. Przyjmuje Date, timestamp, ISO lub format SQL ("2026-06-10 12:00:00"). */
export function formatDate(value: Date | string | number | null | undefined): string {
    const d = toDate(value);
    if (!d) return NO_VALUE;
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Data i godzina "dd.MM.rrrr, HH:mm" w strefie Europe/Warsaw — stała strefa, żeby render serwera i klienta
 * dawał ten sam tekst. Podawać ISO ze strefą (np. "2026-10-20T18:00:00.000Z").
 */
export function formatDateTime(value: Date | string | number | null | undefined): string {
    const d = toDate(value);
    if (!d) return NO_VALUE;
    return d.toLocaleString('pl-PL', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw',
    });
}
