import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

const TABLES = [
    'users',
    'projects',
    'project_items',
    'commissions',
    'wallet_transactions',
    'payout_requests',
    'activity_logs',
    'project_files',
    'email_templates',
    'cashback_redemptions',
];

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dateStr = new Date().toISOString().split('T')[0];

    // Export all business tables as JSON for both MySQL production and SQLite development.
    const exportedTables: Record<string, any[]> = {};
    for (const table of TABLES) {
        try {
            exportedTables[table] = await query<any>(`SELECT * FROM ${table}`);
        } catch {
            exportedTables[table] = []; // table might not exist yet
        }
    }

    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), tables: exportedTables }, null, 2);

    return new NextResponse(payload, {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="walldecor-backup-${dateStr}.json"`,
            'Cache-Control': 'no-store',
        },
    });
}
