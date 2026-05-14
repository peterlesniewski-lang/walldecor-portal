'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { spendCashback } from "@/lib/cashback";
import { v4 as uuidv4 } from 'uuid';
import { logActivity } from "@/lib/services";
import { sendEmail } from "@/lib/email";


/**
 * Architect requests a cashback redemption (exchange for a discount card).
 */
export async function requestRedemption(amount: number) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ARCHI') {
        throw new Error("Unauthorized");
    }

    if (amount <= 0) throw new Error("Kwota musi być większa od zera.");

    const userId = session.user.id;

    const redemptionId = `r_${uuidv4().substring(0, 8)}`;

    await withTransaction(async (queryFn) => {
        await spendCashback(userId, amount, "Wymiana na kartę podarunkową", redemptionId, queryFn);

        await queryFn(
            "INSERT INTO cashback_redemptions (id, user_id, amount, status) VALUES (?, ?, ?, 'PENDING')",
            [redemptionId, userId, amount]
        );
    });

    await logActivity(userId, 'CASHBACK_REDEMPTION_REQUEST', `Zawnioskowano o realizację cashbacku: ${amount} PLN`, { amount, redemptionId });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/wallet');

    return { success: true, redemptionId };
}

/**
 * Admin issues a discount code for a pending redemption request.
 */
export async function issueDiscountCode(redemptionId: string, code: string) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    if (!code || code.trim() === "") {
        throw new Error("Kod rabatowy nie może być pusty.");
    }

    const trimmedCode = code.trim();

    await withTransaction(async (queryFn) => {
        const updateResult = await queryFn<any>(
            "UPDATE cashback_redemptions SET code = ?, status = 'COMPLETED', processed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'",
            [trimmedCode, redemptionId]
        );
        const affectedRows = Number((updateResult as any).affectedRows ?? updateResult?.[0]?.affectedRows ?? 0);
        if (affectedRows !== 1) {
            throw new Error("Wniosek cashback nie istnieje albo został już przetworzony.");
        }

        await queryFn(
            "UPDATE wallet_transactions SET description = ? WHERE reference_id = ?",
            [`Karta podarunkowa: ${trimmedCode}`, redemptionId]
        );
    });

    // 2. Log activity
    await logActivity(session.user.id, 'CASHBACK_REDEMPTION_COMPLETED', `Przyznano kartę rabatową dla wniosku ${redemptionId}`, { redemptionId, code: trimmedCode });

    // 3. Email Notification
    try {
        const userRes = await query<any>(`
            SELECT u.name, u.email 
            FROM cashback_redemptions r 
            JOIN users u ON r.user_id = u.id 
            WHERE r.id = ?
        `, [redemptionId]);

        if (userRes.length > 0) {
            await sendEmail('PAYOUT_REDEEMED_CARD', userRes[0].email, {
                user_name: userRes[0].name,
                card_code: trimmedCode,
                project_name: 'Cashback Portfel' // or fetch related project if possible
            });
        }
    } catch (err) {
        console.error("Email notification failed:", err);
    }

    revalidatePath('/dashboard/admin');

    revalidatePath('/dashboard/admin/architects');

    return { success: true };
}

/**
 * Fetch redemptions for the current user.
 */
export async function getMyRedemptions() {
    const session = await getServerSession(authOptions);
    if (!session) return [];

    return await query<any>(
        "SELECT * FROM cashback_redemptions WHERE user_id = ? ORDER BY created_at DESC",
        [session.user.id]
    );
}

/**
 * Fetch all pending redemptions (for Admin).
 */
export async function getPendingRedemptions() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        return [];
    }

    return await query<any>(`
        SELECT r.*, u.name as architect_name, u.email as architect_email
        FROM cashback_redemptions r
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 'PENDING'
    `);
}

/**
 * Fetch redemptions for a specific architect (for Admin).
 */
export async function getArchitectRedemptions(architectId: string) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return [];
    }

    return await query<any>(`
        SELECT r.*, u.name as architect_name, u.email as architect_email
        FROM cashback_redemptions r
        JOIN users u ON r.user_id = u.id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
    `, [architectId]);
}
