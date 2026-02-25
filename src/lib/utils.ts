export function formatPLN(amount: number | string | null | undefined): string {
    if (amount === null || amount === undefined) return '0,00';
    const val = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(val) || typeof val !== 'number') return '0,00';
    return val.toLocaleString('pl-PL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}
