import { query } from "./db";
import { v4 as uuidv4 } from 'uuid';

/**
 * Deducts cashback from a user's wallet using FIFO (First-In-First-Out) logic.
 * Only non-expired 'EARN' or 'ADJUST' (positive) transactions are considered.
 */
export async function spendCashback(userId: string, amountToSpend: number, description?: string, referenceId?: string) {
    if (amountToSpend <= 0) return { success: true };

    // 1. Get all available positive transactions that are not expired
    // Using LEFT JOIN aggregation instead of a correlated subquery for O(1) vs O(N) performance
    const activeEarns = await query<any>(`
        SELECT wt.id, wt.amount - COALESCE(s.spent, 0) as remaining_amount
        FROM wallet_transactions wt
        LEFT JOIN (
            SELECT related_item_id, SUM(amount) as spent
            FROM wallet_transactions
            WHERE type IN ('SPEND', 'EXPIRE')
            GROUP BY related_item_id
        ) s ON s.related_item_id = wt.id
        WHERE wt.user_id = ?
        AND wt.type IN ('EARN', 'ADJUST')
        AND wt.amount > 0
        AND (wt.expires_at IS NULL OR wt.expires_at > CURRENT_TIMESTAMP)
        ORDER BY wt.created_at ASC
    `, [userId]);

    const totalAvailable = activeEarns.reduce((sum: number, row: any) => sum + Number(row.remaining_amount), 0);

    if (totalAvailable < amountToSpend) {
        throw new Error(`Insufficient cashback balance. Available: ${totalAvailable}, Required: ${amountToSpend}`);
    }

    let remainingToSpend = amountToSpend;

    // 2. Iterate and create linked SPEND transactions
    for (const earn of activeEarns) {
        if (remainingToSpend <= 0) break;

        const spendFromThisEarn = Math.min(remainingToSpend, Number(earn.remaining_amount));
        if (spendFromThisEarn > 0) {
            const spendId = `s_${uuidv4().substring(0, 8)}`;
            await query(
                "INSERT INTO wallet_transactions (id, user_id, type, amount, related_item_id, description, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                [spendId, userId, 'SPEND', spendFromThisEarn, earn.id, description || 'Obciążenie konta', referenceId || null]
            );
            remainingToSpend -= spendFromThisEarn;
        }
    }

    return { success: true };

}

/**
 * Utility to identify and mark expired cashback tokens.
 * In a real app, this would be a CRON job.
 */
export async function cleanupExpiredCashback() {
    // This is a placeholder for a more complex FIFO expiration logic if needed.
    // Given the balance query uses (expires_at > CURRENT_TIMESTAMP), 
    // tokens "expire" automatically by being excluded from the sum.
    return { success: true };
}
