// Prowizja jednej pozycji do widoku: rekord początkowy + korekty (np. KFS po rozliczeniu projektu,
// korekta kwoty pozycji ZAKOŃCZONY). Kwota = suma, status i stawka = pierwszego rekordu pozycji.

export interface ItemCommissionRow {
    project_item_id: string;
    amount_net: number | string;
    status: string;
    rate?: number | string | null;
}

export function summarizeItemCommission(
    commissions: ItemCommissionRow[],
    itemId: string,
): { amount: number; status: string; rate: number | null } | null {
    const rows = commissions.filter((c) => c.project_item_id === itemId);
    if (rows.length === 0) return null;
    const amount = Math.round(rows.reduce((sum, c) => sum + (Number(c.amount_net) || 0), 0) * 100) / 100;
    const rate = rows[0].rate === null || rows[0].rate === undefined || rows[0].rate === '' ? null : Number(rows[0].rate);
    return { amount, status: rows[0].status, rate };
}
