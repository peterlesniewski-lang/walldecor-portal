export const PROJECT_COMMISSION_DISPLAY_STATUSES = new Set(['PENDING', 'EARNED', 'IN_PAYMENT', 'PAID']);

export interface ProjectCommissionLike {
    project_item_id?: string | null;
    amount_net?: number | string | null;
    status?: string | null;
    rate?: number | string | null;
}

export interface ProjectItemCommissionSummary {
    amount: number;
    rate: number | null;
    hasCommission: boolean;
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function isDisplayCommission(commission: ProjectCommissionLike): boolean {
    return PROJECT_COMMISSION_DISPLAY_STATUSES.has(String(commission.status || ''));
}

function getSingleDisplayRate(commissions: ProjectCommissionLike[]): number | null {
    const rates = commissions
        .map((commission) => toFiniteNumber(commission.rate))
        .filter((rate): rate is number => rate !== null);

    if (rates.length === 0) return null;

    const first = rates[0];
    return rates.every((rate) => Math.abs(rate - first) < 0.000001) ? first : null;
}

export function getProjectItemCommissionSummary(
    itemId: string,
    commissions: ProjectCommissionLike[] = []
): ProjectItemCommissionSummary {
    const rows = commissions.filter((commission) => (
        commission.project_item_id === itemId && isDisplayCommission(commission)
    ));

    const amount = rows.reduce((sum, commission) => (
        sum + (toFiniteNumber(commission.amount_net) || 0)
    ), 0);

    return {
        amount,
        rate: getSingleDisplayRate(rows),
        hasCommission: rows.length > 0,
    };
}

export function getProjectCommissionTotal(commissions: ProjectCommissionLike[] = []): number {
    return commissions
        .filter(isDisplayCommission)
        .reduce((sum, commission) => sum + (toFiniteNumber(commission.amount_net) || 0), 0);
}
