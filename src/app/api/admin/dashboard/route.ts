import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminMetrics } from "@/lib/services";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const metrics = await getAdminMetrics();
        return NextResponse.json(metrics);
    } catch (error) {
        console.error("Dashboard API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
