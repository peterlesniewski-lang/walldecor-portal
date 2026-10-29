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

/** Wpis „Zmiany zamówienia (Subiekt)” na stronie projektu (SubiektChangesCard). */
export interface ProjectZkChange {
    id: string;
    /** ISO 8601 UTC. */
    created_at: string;
    description: string;
}

/**
 * Wpisy SUBIEKT_ZK_CHANGED dokumentów, które TERAZ należą do projektu (activity_logs.subject_id =
 * subiekt_documents.id), od najnowszego. Wpis zapisany, gdy dokument był nieprzypisany, pokazuje się po
 * przypisaniu, a po przeniesieniu dokumentu do innego projektu idzie razem z nim. Najwyżej 100 wpisów.
 */
export async function getProjectZkChanges(projectId: string): Promise<ProjectZkChange[]> {
    const rows = await query<{ id: string; created_at: unknown; description: string | null }>(
        `SELECT a.id, a.created_at, a.description
         FROM activity_logs a
         WHERE a.event_type = 'SUBIEKT_ZK_CHANGED'
           AND a.subject_id IN (SELECT id FROM subiekt_documents WHERE project_id = ?)
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 100`,
        [projectId]
    );
    return rows.map((row) => ({
        id: String(row.id),
        created_at: toIsoString(row.created_at) ?? '',
        description: String(row.description ?? ''),
    }));
}
