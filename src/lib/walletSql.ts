export function walletBalanceSql(userIdExpression?: string): string {
    const userFilter = userIdExpression ? `AND earn.user_id = ${userIdExpression}` : '';

    return `
        SELECT COALESCE(SUM(CASE
            WHEN earn.amount - COALESCE(spent.spent_amount, 0) > 0
            THEN earn.amount - COALESCE(spent.spent_amount, 0)
            ELSE 0
        END), 0)
        FROM wallet_transactions earn
        LEFT JOIN (
            SELECT related_item_id, SUM(amount) as spent_amount
            FROM wallet_transactions
            WHERE type IN ('SPEND', 'EXPIRE')
            GROUP BY related_item_id
        ) spent ON spent.related_item_id = earn.id
        WHERE earn.type IN ('EARN', 'ADJUST')
          AND earn.amount > 0
          AND (earn.expires_at IS NULL OR earn.expires_at > NOW())
          ${userFilter}
    `;
}
