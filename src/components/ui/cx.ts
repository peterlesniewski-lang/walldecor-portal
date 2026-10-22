/** Łączy nazwy klas, pomijając wartości puste. Użycie: cx('a', cond && 'b', className). */
export function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}
