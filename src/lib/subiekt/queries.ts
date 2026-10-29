// Zapytania odczytowe integracji Subiekt (status dla agenta; w loopie 4 także widoki admina).
import { query } from '@/lib/db';

export interface SubiektSyncRunRow {
    id: string;
    agent_version: string | null;
    started_at: string;
    finished_at: string | null;
    pages_received: number;
    pages_expected: number;
    documents_accepted: number;
    documents_unchanged: number;
    documents_rejected: number;
    documents_unassigned: number;
    status: string;
    error: string | null;
}

export interface SubiektSyncStatus {
    last_run: SubiektSyncRunRow | null;
    unassigned_count: number;
}

export async function getSyncStatus(): Promise<SubiektSyncStatus> {
    const [lastRun] = await query<SubiektSyncRunRow>(
        'SELECT * FROM subiekt_sync_runs ORDER BY started_at DESC, id DESC LIMIT 1'
    );
    const [count] = await query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM subiekt_documents WHERE assignment_status = 'UNASSIGNED'"
    );
    return { last_run: lastRun ?? null, unassigned_count: Number(count?.count ?? 0) };
}
