import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_TYPES: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

async function verifyProjectAccess(projectId: string, userId: string, role: string) {
    if (role === 'ADMIN' || role === 'STAFF') return true;
    const res = await query<any>(
        "SELECT id FROM projects WHERE id = ? AND owner_id = ?",
        [projectId, userId]
    );
    return res.length > 0;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId } = await params;

    const hasAccess = await verifyProjectAccess(projectId, session.user.id, session.user.role);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const files = await query<any>(`
        SELECT pf.*, u.name as uploaded_by_name
        FROM project_files pf
        JOIN users u ON pf.uploaded_by = u.id
        WHERE pf.project_id = ?
        ORDER BY pf.created_at DESC
    `, [projectId]);

    return NextResponse.json({ files });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId } = await params;

    const hasAccess = await verifyProjectAccess(projectId, session.user.id, session.user.role);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string) || 'DOC';

    if (!file) return NextResponse.json({ error: 'Brak pliku' }, { status: 400 });
    if (!['DOC', 'PHOTO'].includes(category)) {
        return NextResponse.json({ error: 'Nieprawidłowa kategoria' }, { status: 400 });
    }

    const mimeType = file.type;
    const ext = ALLOWED_MIME_TYPES[mimeType];
    if (!ext) {
        return NextResponse.json(
            { error: 'Nieobsługiwany format. Dozwolone: PDF, JPG, PNG, WebP.' },
            { status: 400 }
        );
    }

    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
            { error: 'Plik jest za duży. Maksymalny rozmiar to 10 MB.' },
            { status: 400 }
        );
    }

    const fileId = randomUUID();
    const storedName = `${fileId}.${ext}`;
    const uploadDir = join(process.cwd(), 'private_uploads', 'projects', projectId);

    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(uploadDir, storedName), buffer);

    await query(
        `INSERT INTO project_files (id, project_id, uploaded_by, original_name, stored_name, mime_type, file_size, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [fileId, projectId, session.user.id, file.name, storedName, mimeType, file.size, category]
    );

    const inserted = await query<any>(
        `SELECT pf.*, u.name as uploaded_by_name
         FROM project_files pf JOIN users u ON pf.uploaded_by = u.id
         WHERE pf.id = ?`,
        [fileId]
    );

    return NextResponse.json({ success: true, file: inserted[0] }, { status: 201 });
}
