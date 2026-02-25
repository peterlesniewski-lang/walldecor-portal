'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/services";
import { spendCashback } from "@/lib/cashback";
import { updatePayoutStatus } from "./projects";

export async function handlePayoutRequest(requestId: string, action: 'APPROVE' | 'REJECT' | 'HOLD' | 'IN_PAYMENT' | 'PAID') {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    const requestRes = await query<any>("SELECT * FROM payout_requests WHERE id = ?", [requestId]);
    const payoutReq = requestRes[0];
    if (!payoutReq) throw new Error("Request not found");

    if (payoutReq.status === 'APPROVED' || payoutReq.status === 'REJECTED') {
        throw new Error("Wniosek został już przetworzony.");
    }

    if (action === 'APPROVE' || action === 'PAID') {
        return await updatePayoutStatus(requestId, 'APPROVED');
    } else if (action === 'REJECT') {
        return await updatePayoutStatus(requestId, 'REJECTED');
    } else if (action === 'IN_PAYMENT') {
        return await updatePayoutStatus(requestId, 'IN_PAYMENT');
    } else if (action === 'HOLD') {
        await query(
            "UPDATE payout_requests SET status = 'HOLD', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [requestId]
        );
    }

    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/wallet');

    return { success: true };
}
