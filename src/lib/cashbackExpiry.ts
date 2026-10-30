// Ważność cashbacku (wpisy EARN w wallet_transactions): CASHBACK_EXPIRY_MONTHS miesięcy od naliczenia.
// Domyślnie 12; wartość nieliczbowa, niecałkowita, ≤ 0 lub > 120 → 12 z ostrzeżeniem w logu (raz na proces
// dla danej wartości — zmienna jest stała w procesie, a funkcja woła się per pozycja). Zmiana zmiennej
// dotyczy tylko nowych wpisów — istniejące expires_at zostają bez zmian.
const DEFAULT_CASHBACK_EXPIRY_MONTHS = 12;
const MAX_CASHBACK_EXPIRY_MONTHS = 120;

const warnedValues = new Set<string>();

export function cashbackExpiryMonths(): number {
    const raw = process.env.CASHBACK_EXPIRY_MONTHS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_CASHBACK_EXPIRY_MONTHS;
    const months = Number(raw.trim());
    if (!Number.isInteger(months) || months <= 0 || months > MAX_CASHBACK_EXPIRY_MONTHS) {
        if (!warnedValues.has(raw)) {
            warnedValues.add(raw);
            console.warn(
                `[cashback] Nieprawidłowe CASHBACK_EXPIRY_MONTHS="${raw}" (dozwolone 1–${MAX_CASHBACK_EXPIRY_MONTHS}) — używam ${DEFAULT_CASHBACK_EXPIRY_MONTHS} miesięcy.`
            );
        }
        return DEFAULT_CASHBACK_EXPIRY_MONTHS;
    }
    return months;
}

/**
 * Data wygaśnięcia nowego cashbacku naliczonego w chwili `now` (argument nie jest modyfikowany).
 * Koniec miesiąca jest przycinany: 31.08 + 6 mies. → 28/29.02 (nie 3.03), godzina bez zmian.
 */
export function cashbackExpiresAt(now: Date = new Date()): Date {
    const expiresAt = new Date(now.getTime());
    const day = expiresAt.getDate();
    expiresAt.setDate(1);
    expiresAt.setMonth(expiresAt.getMonth() + cashbackExpiryMonths());
    const lastDayOfTargetMonth = new Date(expiresAt.getFullYear(), expiresAt.getMonth() + 1, 0).getDate();
    expiresAt.setDate(Math.min(day, lastDayOfTargetMonth));
    return expiresAt;
}
