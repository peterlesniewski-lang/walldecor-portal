// Wspólne odczyty wierszy integracji Subiekt (dokument, projekt) dla mapowania i operacji admina.
// Wiersze są normalizowane: liczby jako number, issued_at jako 'YYYY-MM-DD' na obu silnikach.
import { query } from '@/lib/db';
import { toDateOnly } from './dates';
import type { SubiektDocType } from './types';

export interface SubiektDocumentRow {
    id: string;
    external_id: number;
    type: SubiektDocType;
    number: string;
    /** 'YYYY-MM-DD'. */
    issued_at: string;
    contractor_name: string;
    contractor_nip: string | null;
    architect_code: string | null;
    architect_id: string | null;
    parent_external_id: number | null;
    root_external_id: number | null;
    project_id: string | null;
    net_total: number;
    gross_total: number;
    is_paid: number;
    remarks: string | null;
    positions_json: string;
    assignment_status: string;
    assignment_note: string | null;
}

export interface ProjectRow { id: string; name: string; status: string; owner_id: string }

const toNumberOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export function normalizeDocument(row: SubiektDocumentRow): SubiektDocumentRow {
    return {
        ...row,
        external_id: Number(row.external_id),
        issued_at: toDateOnly(row.issued_at),
        parent_external_id: toNumberOrNull(row.parent_external_id),
        root_external_id: toNumberOrNull(row.root_external_id),
        net_total: Number(row.net_total),
        gross_total: Number(row.gross_total),
        is_paid: Number(row.is_paid),
    };
}

export async function findDocumentById(id: string): Promise<SubiektDocumentRow | undefined> {
    const [row] = await query<SubiektDocumentRow>('SELECT * FROM subiekt_documents WHERE id = ?', [id]);
    return row ? normalizeDocument(row) : undefined;
}

export async function findDocumentByExternalId(externalId: number): Promise<SubiektDocumentRow | undefined> {
    const [row] = await query<SubiektDocumentRow>('SELECT * FROM subiekt_documents WHERE external_id = ?', [externalId]);
    return row ? normalizeDocument(row) : undefined;
}

/** Dokumenty łańcucha: korzeń (external_id) i wszystkie z root_external_id = korzeń, po dacie wystawienia. */
export async function findChainDocuments(rootExternalId: number): Promise<SubiektDocumentRow[]> {
    const rows = await query<SubiektDocumentRow>(
        'SELECT * FROM subiekt_documents WHERE root_external_id = ? OR external_id = ? ORDER BY issued_at, external_id',
        [rootExternalId, rootExternalId]
    );
    return rows.map(normalizeDocument);
}

export async function findProject(projectId: string): Promise<ProjectRow | undefined> {
    const [row] = await query<ProjectRow>('SELECT id, name, status, owner_id FROM projects WHERE id = ?', [projectId]);
    return row;
}
