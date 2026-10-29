// Normalizacja dat z bazy dla integracji Subiekt — ten sam wynik na SQLite (tekst) i MySQL (mysql2 → Date).

/**
 * Data i czas jako ISO 8601 UTC. MySQL zwraca `Date`, SQLite tekst 'YYYY-MM-DD HH:MM:SS' w UTC (CURRENT_TIMESTAMP).
 */
export function toIsoString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    const text = String(value);
    const sqlite = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(text);
    return sqlite ? new Date(`${sqlite[1]}T${sqlite[2]}Z`).toISOString() : text;
}

/** Data dokumentu (kolumna DATE) jako 'YYYY-MM-DD'. mysql2 zwraca `Date` o północy czasu lokalnego. */
export function toDateOnly(value: unknown): string {
    if (value instanceof Date) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    return String(value ?? '').slice(0, 10);
}
