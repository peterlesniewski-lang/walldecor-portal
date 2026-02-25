import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logActivity } from "@/lib/services";
import { spendCashback } from "@/lib/cashback";
import { updatePayoutStatus } from "@/app/actions/projects";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { payoutRequestIds } = await req.json();

        if (!Array.isArray(payoutRequestIds) || payoutRequestIds.length === 0) {
            return NextResponse.json({ error: "No payout requests selected" }, { status: 400 });
        }

        const placeholders = payoutRequestIds.map(() => '?').join(',');

        const requests = await query<any>(`
            SELECT id, architect_id, amount
            FROM payout_requests
            WHERE id IN (${placeholders}) AND status = 'PENDING'
        `, [...payoutRequestIds]);

        if (requests.length === 0) {
            return NextResponse.json({ error: "No valid pending payout requests found" }, { status: 400 });
        }

        let totalProcessed = 0;
        const errors: string[] = [];

        for (const payoutReq of requests) {
            try {
                // Use the consolidated business logic
                await updatePayoutStatus(payoutReq.id, 'APPROVED');
                totalProcessed += Number(payoutReq.amount);
            } catch (err: any) {
                // If a specific request fails, ensure it's marked rejected and commissions are reverted
                try {
                    await updatePayoutStatus(payoutReq.id, 'REJECTED');
                } catch (revertErr) {
                    console.error(`Failed to revert payout ${payoutReq.id}:`, revertErr);
                }
                errors.push(`${payoutReq.id}: ${err.message}`);
            }
        }

        await logActivity(
            session.user.id,
            'BATCH_PAYOUT_PROCESSED',
            `Zatwierdzono zbiorczą wypłatę sald na łączną kwotę ${totalProcessed} PLN (${requests.length - errors.length} z ${requests.length} wniosków)`,
            { payoutRequestIds, totalAmount: totalProcessed, errors }
        );

        return NextResponse.json({ success: true, totalProcessed, errors });
    } catch (error) {
        console.error("Batch Payout API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
