// Zapytania odczytowe integracji Subiekt (status dla agenta; w loopie 4 także widoki admina).
import { query } from '@/lib/db';

/** Wiersz subiekt_sync_runs po normalizacji: daty ISO 8601 (UTC), liczniki jako number. */
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

/**
 * Data z bazy jako ISO 8601 UTC. MySQL (mysql2) zwraca `Date`, SQLite tekst 'YYYY-MM-DD HH:MM:SS' w UTC
 * (CURRENT_TIMESTAMP) — po normalizacji JSON statusu jest taki sam na obu silnikach.
 */
function toIsoString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    const text = String(value);
    const sqlite = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(text);
    return sqlite ? new Date(`${sqlite[1]}T${sqlite[2]}Z`).toISOString() : text;
}

function normalizeRun(row: Record<string, unknown>): SubiektSyncRunRow {
    return {
        id: String(row.id),
        agent_version: row.agent_version === null || row.agent_version === undefined ? null : String(row.agent_version),
        started_at: toIsoString(row.started_at) as string,
        finished_at: toIsoString(row.finished_at),
        pages_received: Number(row.pages_received),
        pages_expected: Number(row.pages_expected),
        documents_accepted: Number(row.documents_accepted),
        documents_unchanged: Number(row.documents_unchanged),
        documents_rejected: Number(row.documents_rejected),
        documents_unassigned: Number(row.documents_unassigned),
        status: String(row.status),
        error: row.error === null || row.error === undefined ? null : String(row.error),
    };
}

export async function getSyncStatus(): Promise<SubiektSyncStatus> {
    const [lastRun] = await query<Record<string, unknown>>(
        'SELECT * FROM subiekt_sync_runs ORDER BY started_at DESC, id DESC LIMIT 1'
    );
    const [count] = await query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM subiekt_documents WHERE assignment_status = 'UNASSIGNED'"
    );
    return { last_run: lastRun ? normalizeRun(lastRun) : null, unassigned_count: Number(count?.count ?? 0) };
}
