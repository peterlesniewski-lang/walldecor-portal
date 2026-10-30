// Zapłata dokumentu z rozrachunków GT (PLAN-SUBIEKT-2026-10-29.md, Loop 5). dok_Rozliczony jest
// niewiarygodne (0 przy w pełni opłaconej FS 60/MAG/10/2026); źródłem prawdy jest nz__Finanse.

/** nzf_Typ należności (wiersz z kwotą do zapłaty dokumentu). */
export const RECEIVABLE_TYPE = 39;
/** nzf_Typ wpłaty — osobny wiersz, powiązany z należnością przez nz_FinanseSplata; tu tylko w diagnostyce. */
export const PAYMENT_TYPE = 19;
const EPSILON = 0.005;

export interface FinanceRow {
    nzf_IdDokumentAuto: number;
    nzf_Typ: number;
    /** Pozostało do zapłaty. */
    nzf_Wartosc: number;
    /** Kwota pierwotna (brutto dokumentu). */
    nzf_WartoscPierwotna: number;
}

/** Zapłacony = istnieje co najmniej jedna należność i suma pozostałych kwot należności ≤ 0,005. */
export function isPaid(rows: FinanceRow[]): boolean {
    const receivables = rows.filter((row) => row.nzf_Typ === RECEIVABLE_TYPE);
    if (receivables.length === 0) return false;
    return receivables.reduce((sum, row) => sum + Number(row.nzf_Wartosc), 0) <= EPSILON;
}

/** dok_Id → is_paid dla dokumentów, które mają jakikolwiek wiersz w nz__Finanse (brak wpisu = niezapłacony). */
export function paidByDocument(rows: FinanceRow[]): Map<number, boolean> {
    const grouped = new Map<number, FinanceRow[]>();
    for (const row of rows) {
        const list = grouped.get(row.nzf_IdDokumentAuto) ?? [];
        list.push(row);
        grouped.set(row.nzf_IdDokumentAuto, list);
    }
    return new Map([...grouped].map(([id, list]) => [id, isPaid(list)]));
}
