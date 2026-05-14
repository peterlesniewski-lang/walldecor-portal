export type PayoutAction = 'APPROVE' | 'REJECT' | 'HOLD' | 'IN_PAYMENT' | 'PAID';
export type PayoutStatus = 'PENDING' | 'IN_PAYMENT' | 'HOLD' | 'APPROVED' | 'PAID' | 'REJECTED';

export function mapPayoutActionToStatus(action: PayoutAction): PayoutStatus {
    if (action === 'APPROVE') return 'APPROVED';
    if (action === 'REJECT') return 'REJECTED';
    if (action === 'HOLD') return 'HOLD';
    if (action === 'IN_PAYMENT') return 'IN_PAYMENT';
    return 'PAID';
}

export function isTerminalPayoutStatus(status: string): boolean {
    return status === 'PAID' || status === 'REJECTED';
}

export function assertFullCommissionPayoutAmount(requestedAmount: number, availableAmount: number): void {
    const requestedCents = Math.round(requestedAmount * 100);
    const availableCents = Math.round(availableAmount * 100);

    if (requestedCents !== availableCents) {
        throw new Error("Wypłata prowizji musi obejmować pełną dostępną kwotę. Odśwież portfel i wystaw fakturę na aktualną kwotę prowizji.");
    }
}
