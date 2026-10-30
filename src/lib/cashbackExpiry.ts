// Ważność cashbacku (wpisy EARN w wallet_transactions): CASHBACK_EXPIRY_MONTHS miesięcy od naliczenia.
// Domyślnie 12; wartość nieliczbowa, niecałkowita lub ≤ 0 → 12 z ostrzeżeniem w logu. Zmiana zmiennej
// dotyczy tylko nowych wpisów — istniejące expires_at zostają bez zmian.
const DEFAULT_CASHBACK_EXPIRY_MONTHS = 12;

export function cashbackExpiryMonths(): number {
    const raw = process.env.CASHBACK_EXPIRY_MONTHS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_CASHBACK_EXPIRY_MONTHS;
    const months = Number(raw.trim());
    if (!Number.isInteger(months) || months <= 0) {
        console.warn(`[cashback] Nieprawidłowe CASHBACK_EXPIRY_MONTHS="${raw}" — używam ${DEFAULT_CASHBACK_EXPIRY_MONTHS} miesięcy.`);
        return DEFAULT_CASHBACK_EXPIRY_MONTHS;
    }
    return months;
}

/** Data wygaśnięcia nowego cashbacku naliczonego w chwili `now` (argument nie jest modyfikowany). */
export function cashbackExpiresAt(now: Date = new Date()): Date {
    const expiresAt = new Date(now.getTime());
    expiresAt.setMonth(expiresAt.getMonth() + cashbackExpiryMonths());
    return expiresAt;
}
