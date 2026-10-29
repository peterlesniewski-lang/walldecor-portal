// Zapytania odczytowe integracji Subiekt: status dla agenta i widoki panelu admina (Loop 4).
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

// --- Widoki panelu admina (Loop 4) ---------------------------------------------------------------

/** Alias dla widoków admina: wiersz subiekt_sync_runs po normalizacji (daty ISO, liczniki number). */
export type SyncRunRow = SubiektSyncRunRow;

/** Data dokumentu (kolumna DATE) jako 'YYYY-MM-DD'. mysql2 zwraca `Date` o północy czasu lokalnego. */
function toDateOnly(value: unknown): string {
    if (value instanceof Date) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    return String(value ?? '').slice(0, 10);
}

const nullableString = (value: unknown) => (value === null || value === undefined ? null : String(value));
const nullableNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Ostatnie uruchomienia agenta, od najnowszego. `limit` przycięty do 1–100. */
export async function getRecentSyncRuns(limit = 10): Promise<SyncRunRow[]> {
    const parsed = Math.trunc(Number(limit));
    const safeLimit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 10;
    // LIMIT wstawiony jako liczba (mysql2 execute nie przyjmuje LIMIT ? na wszystkich wersjach serwera).
    const rows = await query<Record<string, unknown>>(
        `SELECT * FROM subiekt_sync_runs ORDER BY started_at DESC, id DESC LIMIT ${safeLimit}`
    );
    return rows.map(normalizeRun);
}

export interface CandidateProject {
    id: string;
    name: string;
    status: string;
}

/** Dokument w skrzynce nieprzypisanych. */
export interface UnassignedDocRow {
    id: string;
    external_id: number;
    type: string;
    number: string;
    /** 'YYYY-MM-DD'. */
    issued_at: string;
    contractor_name: string;
    net_total: number;
    /** Kod z dokumentu (pole własne / uwagi), także nieznany. */
    architect_code: string | null;
    architect_id: string | null;
    /** Imię i nazwisko architekta, gdy architect_id ustawione. */
    architect_name: string | null;
    /** Powód: NO_ARCHITECT, UNKNOWN_ARCHITECT_CODE:<kod>, NO_ROOT_DOCUMENT, ROOT_UNASSIGNED, UNMATCHED_CORRECTION, OWNER_MISMATCH:<kod>, PROJECT_CANCELLED. */
    assignment_note: string | null;
    root_external_id: number | null;
    /** Projekt, przy którym dokument już jest (np. UNMATCHED_CORRECTION, PROJECT_CANCELLED), inaczej null. */
    project_id: string | null;
    /** Projekty architekta dokumentu poza NIEZREALIZOWANY (od najnowszego); pusta, gdy architekt nieznany. */
    candidateProjects: CandidateProject[];
}

/** Skrzynka: dokumenty UNASSIGNED, od najnowszej daty wystawienia. */
export async function getUnassignedDocuments(): Promise<UnassignedDocRow[]> {
    const rows = await query<Record<string, unknown>>(
        `SELECT d.id, d.external_id, d.type, d.number, d.issued_at, d.contractor_name, d.net_total, d.architect_code,
                d.architect_id, d.assignment_note, d.root_external_id, d.project_id, u.name AS architect_name
         FROM subiekt_documents d
         LEFT JOIN users u ON u.id = d.architect_id
         WHERE d.assignment_status = 'UNASSIGNED'
         ORDER BY d.issued_at DESC, d.external_id DESC`
    );

    const architectIds = [...new Set(rows.map((r) => r.architect_id).filter((id): id is string => typeof id === 'string' && id !== ''))];
    const projectsByOwner = new Map<string, CandidateProject[]>();
    if (architectIds.length > 0) {
        const projects = await query<{ id: string; name: string; status: string; owner_id: string }>(
            `SELECT id, name, status, owner_id FROM projects
             WHERE owner_id IN (${architectIds.map(() => '?').join(', ')}) AND status <> 'NIEZREALIZOWANY'
             ORDER BY created_at DESC, id DESC`,
            architectIds
        );
        for (const p of projects) {
            const list = projectsByOwner.get(p.owner_id) ?? [];
            list.push({ id: String(p.id), name: String(p.name ?? ''), status: String(p.status) });
            projectsByOwner.set(p.owner_id, list);
        }
    }

    return rows.map((r) => {
        const architectId = nullableString(r.architect_id);
        return {
            id: String(r.id),
            external_id: Number(r.external_id),
            type: String(r.type),
            number: String(r.number),
            issued_at: toDateOnly(r.issued_at),
            contractor_name: String(r.contractor_name ?? ''),
            net_total: Number(r.net_total),
            architect_code: nullableString(r.architect_code),
            architect_id: architectId,
            architect_name: architectId ? nullableString(r.architect_name) : null,
            assignment_note: nullableString(r.assignment_note),
            root_external_id: nullableNumber(r.root_external_id),
            project_id: nullableString(r.project_id),
            candidateProjects: architectId ? projectsByOwner.get(architectId) ?? [] : [],
        };
    });
}

const UNKNOWN_CODE_PREFIX = 'UNKNOWN_ARCHITECT_CODE:';

/** Kody architektów z dokumentów w skrzynce, których nie ma żadne konto — z liczbą dokumentów (malejąco). */
export async function getUnknownArchitectCodes(): Promise<Array<{ code: string; documents: number }>> {
    // LIKE z '_' to w SQL dowolny znak — dokładny prefiks sprawdzamy jeszcze w JS.
    const rows = await query<{ note: string; documents: number }>(
        `SELECT assignment_note AS note, COUNT(*) AS documents FROM subiekt_documents
         WHERE assignment_status = 'UNASSIGNED' AND assignment_note LIKE 'UNKNOWN_ARCHITECT_CODE:%'
         GROUP BY assignment_note`
    );
    return rows
        .filter((r) => String(r.note).startsWith(UNKNOWN_CODE_PREFIX))
        .map((r) => ({ code: String(r.note).slice(UNKNOWN_CODE_PREFIX.length), documents: Number(r.documents) }))
        .filter((r) => r.code !== '')
        .sort((a, b) => b.documents - a.documents || a.code.localeCompare(b.code));
}

/** Liczba dokumentów w skrzynce (badge w sidebarze). */
export async function getUnassignedCount(): Promise<number> {
    const [row] = await query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM subiekt_documents WHERE assignment_status = 'UNASSIGNED'"
    );
    return Number(row?.count ?? 0);
}

/** Dokument w sekcji „Dokumenty Subiekt” projektu. */
export interface DocRow {
    id: string;
    external_id: number;
    type: string;
    number: string;
    /** 'YYYY-MM-DD'. */
    issued_at: string;
    net_total: number;
    is_paid: boolean;
    assignment_status: string;
    assignment_note: string | null;
}

export interface ProjectDocChain {
    rootExternalId: number;
    /** Korzeń łańcucha (ZK/FP), gdy jest w TYM projekcie; null, gdy w projekcie są tylko dokumenty pochodne. */
    root: DocRow | null;
    /** Pozostałe dokumenty łańcucha w tym projekcie, po dacie wystawienia rosnąco. */
    children: DocRow[];
}

/**
 * Dokumenty z project_id = projekt (każdy status, także IGNORED / UNASSIGNED przy projekcie), pogrupowane po
 * korzeniu (root_external_id; brak → dokument sam dla siebie). Łańcuchy od najnowszego.
 */
export async function getProjectSubiektDocuments(projectId: string): Promise<ProjectDocChain[]> {
    const rows = await query<Record<string, unknown>>(
        `SELECT id, external_id, type, number, issued_at, net_total, is_paid, assignment_status, assignment_note, root_external_id
         FROM subiekt_documents WHERE project_id = ?
         ORDER BY issued_at, external_id`,
        [projectId]
    );

    const chains = new Map<number, ProjectDocChain & { sortKey: string }>();
    for (const r of rows) {
        const doc: DocRow = {
            id: String(r.id),
            external_id: Number(r.external_id),
            type: String(r.type),
            number: String(r.number),
            issued_at: toDateOnly(r.issued_at),
            net_total: Number(r.net_total),
            is_paid: Number(r.is_paid) === 1,
            assignment_status: String(r.assignment_status),
            assignment_note: nullableString(r.assignment_note),
        };
        const rootExternalId = nullableNumber(r.root_external_id) ?? doc.external_id;
        const chain = chains.get(rootExternalId) ?? { rootExternalId, root: null, children: [], sortKey: doc.issued_at };
        if (doc.external_id === rootExternalId) {
            chain.root = doc;
            chain.sortKey = doc.issued_at;
        } else {
            chain.children.push(doc);
        }
        chains.set(rootExternalId, chain);
    }

    return [...chains.values()]
        .sort((a, b) => (a.sortKey === b.sortKey ? b.rootExternalId - a.rootExternalId : a.sortKey < b.sortKey ? 1 : -1))
        .map(({ sortKey: _sortKey, ...chain }) => chain);
}

/**
 * Projekty, z którymi można połączyć projekt: ten sam architekt, poza ZAKOŃCZONY / NIEZREALIZOWANY, bez niego
 * samego, z sumą netto pozycji. Pusta, gdy projekt nie istnieje albo sam jest ZAKOŃCZONY / NIEZREALIZOWANY.
 */
export async function getMergeCandidates(projectId: string): Promise<Array<{ id: string; name: string; status: string; itemsTotal: number }>> {
    const [project] = await query<{ owner_id: string; status: string }>('SELECT owner_id, status FROM projects WHERE id = ?', [projectId]);
    if (!project || project.status === 'ZAKOŃCZONY' || project.status === 'NIEZREALIZOWANY') return [];

    const rows = await query<{ id: string; name: string; status: string; items_total: number }>(
        `SELECT p.id, p.name, p.status, COALESCE(SUM(i.amount_net), 0) AS items_total
         FROM projects p
         LEFT JOIN project_items i ON i.project_id = p.id
         WHERE p.owner_id = ? AND p.id <> ? AND p.status NOT IN ('ZAKOŃCZONY', 'NIEZREALIZOWANY')
         GROUP BY p.id, p.name, p.status, p.created_at
         ORDER BY p.created_at DESC, p.id DESC`,
        [project.owner_id, projectId]
    );
    return rows.map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ''),
        status: String(r.status),
        itemsTotal: Math.round(Number(r.items_total) * 100) / 100,
    }));
}
