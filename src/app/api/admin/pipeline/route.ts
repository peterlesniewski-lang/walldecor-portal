import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    try {
        let sql = `
            SELECT 
                p.*, 
                u.name as architect_name,
                s.name as caretaker_name
            FROM projects p
            JOIN users u ON p.owner_id = u.id
            LEFT JOIN users s ON p.staff_id = s.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (status && status !== 'ALL') {
            sql += " AND p.status = ?";
            params.push(status);
        }

        if (search) {
            sql += " AND (p.name LIKE ? OR p.id LIKE ? OR u.name LIKE ?)";
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        sql += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const projects = await query<any>(sql, params);

        // Get total count for pagination
        let countSql = "SELECT COUNT(*) as total FROM projects p JOIN users u ON p.owner_id = u.id WHERE 1=1";
        const countParams: any[] = [];
        if (status && status !== 'ALL') {
            countSql += " AND p.status = ?";
            countParams.push(status);
        }
        if (search) {
            countSql += " AND (p.name LIKE ? OR p.id LIKE ? OR u.name LIKE ?)";
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm, searchTerm);
        }
        const totalCount = await query<any>(countSql, countParams);

        return NextResponse.json({
            projects,
            pagination: {
                total: totalCount[0].total,
                page,
                limit,
                pages: Math.ceil(totalCount[0].total / limit)
            }
        });
    } catch (error) {
        console.error("Pipeline API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
