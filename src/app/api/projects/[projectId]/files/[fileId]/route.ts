import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { readFile, unlink } from 'fs/promises';

const SAFE_STORED_NAME = /^[a-f0-9-]+\.(pdf|jpg|jpeg|png|webp)$/;

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; fileId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId, fileId } = await params;

    const isPrivileged = session.user.role === 'ADMIN' || session.user.role === 'STAFF';

    const fileRes = await query<any>(
        "SELECT * FROM project_files WHERE id = ? AND project_id = ?",
        [fileId, projectId]
    );
    if (fileRes.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const fileRecord = fileRes[0];

    if (!isPrivileged) {
        // ARCHI: verify it's their own project
        const projectRes = await query<any>(
            "SELECT id FROM projects WHERE id = ? AND owner_id = ?",
            [projectId, session.user.id]
        );
        if (projectRes.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!SAFE_STORED_NAME.test(fileRecord.stored_name)) {
        return NextResponse.json({ error: 'Invalid file record' }, { status: 400 });
    }

    const filePath = join(process.cwd(), 'private_uploads', 'projects', projectId, fileRecord.stored_name);

    try {
        const fileBuffer = await readFile(filePath);
        const isImage = fileRecord.mime_type.startsWith('image/');
        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': fileRecord.mime_type,
                'Content-Disposition': `${isImage ? 'inline' : 'attachment'}; filename="${fileRecord.original_name}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; fileId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId, fileId } = await params;

    const isPrivileged = session.user.role === 'ADMIN' || session.user.role === 'STAFF';

    const fileRes = await query<any>(
        "SELECT * FROM project_files WHERE id = ? AND project_id = ?",
        [fileId, projectId]
    );
    if (fileRes.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const fileRecord = fileRes[0];

    if (!isPrivileged && fileRecord.uploaded_by !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!SAFE_STORED_NAME.test(fileRecord.stored_name)) {
        return NextResponse.json({ error: 'Invalid file record' }, { status: 400 });
    }

    const filePath = join(process.cwd(), 'private_uploads', 'projects', projectId, fileRecord.stored_name);

    try {
        await unlink(filePath);
    } catch {
        // File may already be missing — proceed to clean up DB record
    }

    await query("DELETE FROM project_files WHERE id = ?", [fileId]);

    return NextResponse.json({ success: true });
}
