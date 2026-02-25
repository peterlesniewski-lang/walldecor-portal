import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filename } = await params;

    // Prevent path traversal — filename must match expected pattern
    if (!/^invoice_[a-zA-Z0-9_-]+\.pdf$/.test(filename)) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    // ADMIN and STAFF can access any invoice
    const isPrivileged = session.user.role === 'ADMIN' || session.user.role === 'STAFF';

    if (!isPrivileged) {
        // ARCHI: verify this invoice belongs to their own payout request
        const invoiceUrl = `/api/invoices/${filename}`;
        const payoutRes = await query<any>(
            "SELECT id FROM payout_requests WHERE invoice_url = ? AND architect_id = ? LIMIT 1",
            [invoiceUrl, session.user.id]
        );
        if (payoutRes.length === 0) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
    }

    const filePath = join(process.cwd(), 'private_uploads', 'invoices', filename);

    try {
        const fileBuffer = await readFile(filePath);
        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${filename}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
}
