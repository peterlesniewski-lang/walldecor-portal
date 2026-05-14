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
