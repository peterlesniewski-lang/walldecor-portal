import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { NextResponse } from 'next/server';

const TABLES = [
    'users',
    'projects',
    'project_items',
    'commissions',
    'wallet_transactions',
    'payout_requests',
    'activity_logs',
    'email_templates',
    'discount_cards',
];

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const isSQLite = process.env.DB_TYPE === 'sqlite';

    if (isSQLite) {
        // SQLite: serve the raw database file — complete and lossless backup
        const dbPath = join(process.cwd(), process.env.DB_PATH || 'walldecor.sqlite');
        try {
            const fileBuffer = await readFile(dbPath);
            return new NextResponse(fileBuffer, {
                status: 200,
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': `attachment; filename="walldecor-backup-${dateStr}.sqlite"`,
                    'Cache-Control': 'no-store',
                },
            });
        } catch {
            return NextResponse.json({ error: 'Nie można odczytać pliku bazy danych.' }, { status: 500 });
        }
    }

    // MySQL: export all tables as JSON
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
