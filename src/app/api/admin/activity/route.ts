import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminActivity } from "@/lib/services";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const activity = await getAdminActivity();
        return NextResponse.json(activity);
    } catch (error) {
        console.error("Activity API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
