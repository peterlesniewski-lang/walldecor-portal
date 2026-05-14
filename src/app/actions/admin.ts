'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/services";
import { updatePayoutStatus } from "./projects";
import { isTerminalPayoutStatus, mapPayoutActionToStatus } from "@/lib/payoutWorkflow";

export async function handlePayoutRequest(requestId: string, action: 'APPROVE' | 'REJECT' | 'HOLD' | 'IN_PAYMENT' | 'PAID') {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    if (action === 'HOLD') {
        await withTransaction(async (queryFn) => {
            const requestRes = await queryFn<any>("SELECT status FROM payout_requests WHERE id = ? FOR UPDATE", [requestId]);
            const payoutReq = requestRes[0];
            if (!payoutReq) throw new Error("Request not found");

            if (isTerminalPayoutStatus(payoutReq.status)) {
                throw new Error("Wniosek został już przetworzony.");
            }

            await queryFn(
                "UPDATE payout_requests SET status = 'HOLD' WHERE id = ?",
                [requestId]
            );
        });
    } else {
        return await updatePayoutStatus(requestId, mapPayoutActionToStatus(action));
    }

    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/wallet');

    return { success: true };
}
