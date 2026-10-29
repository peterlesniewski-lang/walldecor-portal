function parseAmount(amount: number | string | null | undefined): number | null {
    if (amount === null || amount === undefined) return null;
    const val = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(val) || typeof val !== 'number') return null;
    return val;
}

export function formatPLN(amount: number | string | null | undefined): string {
    const val = parseAmount(amount);
    if (val === null) return '0,00';
    return val.toLocaleString('pl-PL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

/**
 * Kwota zawsze z dwoma miejscami po przecinku i grupowaniem tysięcy także dla liczb 4-cyfrowych
 * (pl-PL domyślnie ich nie grupuje): 1200 → "1 200,00", 800 → "800,00". Separator tysięcy to twarda
 * spacja U+00A0 (wynik toLocaleString), więc kwota nie łamie się w tekście. Używane w logach Subiekta.
 */
export function formatPLNFixed(amount: number | string | null | undefined): string {
    const val = parseAmount(amount) ?? 0;
    return val.toLocaleString('pl-PL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: 'always',
    });
}
