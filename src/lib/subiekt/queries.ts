// Zapytania odczytowe integracji Subiekt: status dla agenta i widoki panelu admina (Loop 4).
import { cache } from 'react';
import { query } from '@/lib/db';
import { toDateOnly, toIsoString } from './dates';
import { formatReconciliationForArchitect } from './diff';

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

/** Wpis „Zmiany dokumentów (Subiekt)” na stronie projektu (SubiektChangesCard). */
export interface ProjectZkChange {
    id: string;
    /** ISO 8601 UTC. */
    created_at: string;
    description: string;
    /** Kto zapisał wpis: null = synchronizacja; admin (imię i nazwisko) albo „WallDecor” w widoku architekta. */
    author: string | null;
}

/** Kto czyta historię: admin widzi kwoty uzgodnienia i autora, architekt — neutralny opis bez kwot faktur. */
export type ZkChangesAudience = 'ADMIN' | 'ARCHITECT';

const ZK_CHANGE_EVENTS = [
    'SUBIEKT_ZK_CHANGED', 'SUBIEKT_CORRECTION',
    'SUBIEKT_RECONCILIATION_OPENED', 'SUBIEKT_RECONCILIATION_RESOLVED', 'SUBIEKT_RECONCILIATION_CLOSED',
];
const isReconciliationEvent = (eventType: string) => eventType.startsWith('SUBIEKT_RECONCILIATION_');

function metadataZkNumber(metadata: unknown): string | null {
    try {
        const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        return parsed && typeof parsed === 'object' && typeof (parsed as { zkNumber?: unknown }).zkNumber === 'string'
            ? (parsed as { zkNumber: string }).zkNumber : null;
    } catch {
        return null;
    }
}

/**
 * Wpisy SUBIEKT_ZK_CHANGED, SUBIEKT_CORRECTION (korekty KFS) i SUBIEKT_RECONCILIATION_* (uzgodnienie faktur, Loop 5b)
 * dokumentów, które TERAZ należą do projektu (activity_logs.subject_id = subiekt_documents.id), od najnowszego.
 * Wpis zapisany, gdy dokument był nieprzypisany, pokazuje się po przypisaniu, a po przeniesieniu dokumentu do
 * innego projektu idzie razem z nim. Najwyżej 100 wpisów. `ARCHITECT`: wpisy uzgodnienia bez kwot i numerów faktur,
 * autor-admin jako „WallDecor”.
 */
export async function getProjectZkChanges(projectId: string, audience: ZkChangesAudience = 'ADMIN'): Promise<ProjectZkChange[]> {
    const rows = await query<{ id: string; created_at: unknown; description: string | null; event_type: string; metadata: unknown; user_id: string | null; user_name: string | null }>(
        `SELECT a.id, a.created_at, a.description, a.event_type, a.metadata, a.user_id, u.name AS user_name
         FROM activity_logs a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.event_type IN (${ZK_CHANGE_EVENTS.map(() => '?').join(', ')})
           AND a.subject_id IN (SELECT id FROM subiekt_documents WHERE project_id = ?)
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 100`,
        [...ZK_CHANGE_EVENTS, projectId]
    );
    return rows.map((row) => {
        const eventType = String(row.event_type);
        const hasUser = row.user_id !== null && row.user_id !== undefined && row.user_id !== '';
        const forArchitect = audience === 'ARCHITECT';
        return {
            id: String(row.id),
            created_at: toIsoString(row.created_at) ?? '',
            description: forArchitect && isReconciliationEvent(eventType)
                ? formatReconciliationForArchitect(eventType, metadataZkNumber(row.metadata))
                : String(row.description ?? ''),
            author: !hasUser ? null : forArchitect ? 'WallDecor' : String(row.user_name || 'Administrator'),
        };
    });
}

// --- Uzgodnienie faktur z zamówieniem (Loop 5b) -------------------------------------------------

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

/** Wiersz sekcji „Do uzgodnienia” na stronie integracji. */
export interface OpenReconciliationRow {
    projectId: string;
    projectName: string;
    rootExternalId: number;
    architectName: string | null;
    zkNumber: string | null;
    zkNet: number;
    invoicedNet: number;
    /** Faktury − ZK. */
    difference: number;
    /** ISO 8601 UTC. */
    openedAt: string;
}

const OPEN_RECONCILIATIONS_SQL = `FROM subiekt_reconciliations r
    JOIN projects p ON p.id = r.project_id
    WHERE r.status = 'OPEN' AND p.status <> 'NIEZREALIZOWANY'`;

/** Otwarte uzgodnienia projektów poza NIEZREALIZOWANY, od najdawniej otwartego. */
export async function getOpenReconciliations(): Promise<OpenReconciliationRow[]> {
    const rows = await query<Record<string, unknown>>(
        `SELECT r.project_id, r.root_external_id, r.zk_net, r.invoiced_net, r.opened_at, p.name AS project_name,
                u.name AS architect_name, d.number AS zk_number
         FROM subiekt_reconciliations r
         JOIN projects p ON p.id = r.project_id
         LEFT JOIN users u ON u.id = p.owner_id
         LEFT JOIN subiekt_documents d ON d.external_id = r.root_external_id
         WHERE r.status = 'OPEN' AND p.status <> 'NIEZREALIZOWANY'
         ORDER BY r.opened_at, r.project_id`
    );
    return rows.map((r) => ({
        projectId: String(r.project_id),
        projectName: String(r.project_name ?? ''),
        rootExternalId: Number(r.root_external_id),
        architectName: nullableString(r.architect_name),
        zkNumber: nullableString(r.zk_number),
        zkNet: round2(Number(r.zk_net)),
        invoicedNet: round2(Number(r.invoiced_net)),
        difference: round2(Number(r.invoiced_net) - Number(r.zk_net)),
        openedAt: toIsoString(r.opened_at) ?? '',
    }));
}

/** Liczba otwartych uzgodnień (plakietka „Subiekt” w menu i nagłówek sekcji). React `cache` jak getUnassignedCount. */
export const getOpenReconciliationCount = cache(async (): Promise<number> => {
    const [row] = await query<{ count: number }>(`SELECT COUNT(*) AS count ${OPEN_RECONCILIATIONS_SQL}`);
    return Number(row?.count ?? 0);
});

/** Pozycja łańcucha w karcie uzgodnienia: bieżąca kwota i kwota z ZK (pozycja positions_json o tym ob_Id). */
export interface ReconciliationItem {
    id: string;
    description: string | null;
    type: string;
    amount_net: number;
    zk_amount: number | null;
}

export interface ProjectReconciliation {
    rootExternalId: number;
    status: 'OPEN' | 'RESOLVED';
    zkNumber: string | null;
    zkNet: number;
    invoicedNet: number;
    difference: number;
    /** ISO 8601 UTC. */
    openedAt: string;
    resolvedAt: string | null;
    resolvedByName: string | null;
    note: string | null;
    /** FS i KFS łańcucha w projekcie (przypisane), po dacie wystawienia. */
    invoices: Array<{ number: string; type: string; issued_at: string; net_total: number }>;
    /** Pozycje Subiekta z ZK łańcucha w projekcie (także wyzerowane w projekcie zakończonym). */
    items: ReconciliationItem[];
}

/** Uzgodnienia OPEN i RESOLVED projektu (AUTO_CLOSED pomijane), po korzeniu. */
export async function getProjectReconciliations(projectId: string): Promise<ProjectReconciliation[]> {
    const rows = await query<Record<string, unknown>>(
        `SELECT r.*, u.name AS resolved_by_name FROM subiekt_reconciliations r
         LEFT JOIN users u ON u.id = r.resolved_by
         WHERE r.project_id = ? AND r.status IN ('OPEN', 'RESOLVED')
         ORDER BY r.root_external_id`,
        [projectId]
    );
    const result: ProjectReconciliation[] = [];
    for (const r of rows) {
        const root = Number(r.root_external_id);
        const docs = await query<Record<string, unknown>>(
            `SELECT id, external_id, type, number, issued_at, net_total, positions_json FROM subiekt_documents
             WHERE project_id = ? AND root_external_id = ? AND assignment_status IN ('AUTO', 'MANUAL')
             ORDER BY issued_at, external_id`,
            [projectId, root]
        );
        const orders = docs.filter((d) => d.type === 'ZK');
        const zkAmounts = new Map<number, number>();
        for (const order of orders) {
            try {
                for (const pos of JSON.parse(String(order.positions_json)) as Array<{ external_id: number; net_total: number }>) {
                    zkAmounts.set(Number(pos.external_id), round2(pos.net_total));
                }
            } catch {
                // Uszkodzone pozycje dokumentu: karta pokaże „—” zamiast kwoty z ZK.
            }
        }
        const orderIds = orders.map((d) => String(d.id));
        const items = orderIds.length === 0 ? [] : await query<Record<string, unknown>>(
            `SELECT id, description, type, amount_net, subiekt_position_id FROM project_items
             WHERE project_id = ? AND source = 'SUBIEKT' AND subiekt_position_id IS NOT NULL
               AND subiekt_document_id IN (${orderIds.map(() => '?').join(', ')})
             ORDER BY subiekt_position_id, id`,
            [projectId, ...orderIds]
        );
        result.push({
            rootExternalId: root,
            status: String(r.status) as 'OPEN' | 'RESOLVED',
            zkNumber: orders.length > 0 ? String(orders[0].number) : null,
            zkNet: round2(Number(r.zk_net)),
            invoicedNet: round2(Number(r.invoiced_net)),
            difference: round2(Number(r.invoiced_net) - Number(r.zk_net)),
            openedAt: toIsoString(r.opened_at) ?? '',
            resolvedAt: toIsoString(r.resolved_at),
            resolvedByName: nullableString(r.resolved_by_name),
            note: nullableString(r.note),
            invoices: docs.filter((d) => d.type === 'FS' || d.type === 'KFS').map((d) => ({
                number: String(d.number), type: String(d.type), issued_at: toDateOnly(d.issued_at), net_total: round2(Number(d.net_total)),
            })),
            items: items.map((i) => ({
                id: String(i.id),
                description: nullableString(i.description),
                type: String(i.type),
                amount_net: round2(Number(i.amount_net)),
                zk_amount: zkAmounts.get(Number(i.subiekt_position_id)) ?? null,
            })),
        });
    }
    return result;
}

// --- Widoki panelu admina (Loop 4) ---------------------------------------------------------------

/** Alias dla widoków admina: wiersz subiekt_sync_runs po normalizacji (daty ISO, liczniki number). */
export type SyncRunRow = SubiektSyncRunRow;

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
    /**
     * Czy z dokumentu da się założyć projekt (createProjectFromDocumentOp): nie KFS i dokument nie pochodzi
     * ze znanego dokumentu nadrzędnego (wtedy projekt zakłada się z korzenia albo przypisuje do istniejącego).
     */
    can_create_project: boolean;
}

/** Skrzynka: dokumenty UNASSIGNED, od najnowszej daty wystawienia. */
export async function getUnassignedDocuments(): Promise<UnassignedDocRow[]> {
    const rows = await query<Record<string, unknown>>(
        `SELECT d.id, d.external_id, d.type, d.number, d.issued_at, d.contractor_name, d.net_total, d.architect_code,
                d.architect_id, d.assignment_note, d.root_external_id, d.project_id, u.name AS architect_name,
                r.id AS root_id
         FROM subiekt_documents d
         LEFT JOIN users u ON u.id = d.architect_id
         LEFT JOIN subiekt_documents r ON r.external_id = d.root_external_id AND r.id <> d.id
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
            can_create_project: String(r.type) !== 'KFS' && (r.root_id === null || r.root_id === undefined),
        };
    });
}

/** Projekt do przypisania dokumentu bez znanego architekta (wszystkie projekty poza NIEZREALIZOWANY). */
export interface AssignableProject extends CandidateProject {
    owner_name: string | null;
}

/**
 * Projekty dla dokumentów bez architekta (NO_ARCHITECT, nieznany kod): assignDocumentToProjectOp sprawdza
 * właściciela tylko wtedy, gdy dokument ma architekta, więc taki dokument można przypisać do dowolnego
 * projektu poza NIEZREALIZOWANY. Od najnowszego.
 */
export async function getAssignableProjects(): Promise<AssignableProject[]> {
    const rows = await query<{ id: string; name: string; status: string; owner_name: string | null }>(
        `SELECT p.id, p.name, p.status, u.name AS owner_name
         FROM projects p
         LEFT JOIN users u ON u.id = p.owner_id
         WHERE p.status <> 'NIEZREALIZOWANY'
         ORDER BY p.created_at DESC, p.id DESC`
    );
    return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? ''), status: String(r.status), owner_name: nullableString(r.owner_name) }));
}

/** Architekci (rola ARCHI) do wyboru właściciela nowego projektu z dokumentu, po nazwisku. */
export async function getArchitectOptions(): Promise<Array<{ id: string; name: string; subiekt_code: string | null }>> {
    const rows = await query<{ id: string; name: string | null; email: string | null; subiekt_code: string | null }>(
        "SELECT id, name, email, subiekt_code FROM users WHERE role = 'ARCHI' ORDER BY name, id"
    );
    return rows.map((r) => ({
        id: String(r.id),
        name: String(r.name || r.email || r.id),
        subiekt_code: nullableString(r.subiekt_code),
    }));
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

/**
 * Liczba dokumentów w skrzynce (badge w sidebarze i kafelek strony integracji). React `cache`: layout i strona
 * w jednym renderze dzielą jedno zapytanie (poza renderem serwerowym, np. w testach, cache nic nie zapamiętuje).
 */
export const getUnassignedCount = cache(async (): Promise<number> => {
    const [row] = await query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM subiekt_documents WHERE assignment_status = 'UNASSIGNED'"
    );
    return Number(row?.count ?? 0);
});

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
 * Projekt ZGŁOSZONY dostaje tylko zgłoszonych kandydatów (mergeProjectsOp odrzuca przyjęte źródła dla
 * zgłoszonego celu), więc UI nie zaproponuje połączenia, które się nie uda.
 */
export async function getMergeCandidates(projectId: string): Promise<Array<{ id: string; name: string; status: string; itemsTotal: number }>> {
    const [project] = await query<{ owner_id: string; status: string }>('SELECT owner_id, status FROM projects WHERE id = ?', [projectId]);
    if (!project || project.status === 'ZAKOŃCZONY' || project.status === 'NIEZREALIZOWANY') return [];

    const rows = await query<{ id: string; name: string; status: string; items_total: number }>(
        `SELECT p.id, p.name, p.status, COALESCE(SUM(i.amount_net), 0) AS items_total
         FROM projects p
         LEFT JOIN project_items i ON i.project_id = p.id
         WHERE p.owner_id = ? AND p.id <> ? AND p.status NOT IN ('ZAKOŃCZONY', 'NIEZREALIZOWANY')
           ${project.status === 'ZGŁOSZONY' ? "AND p.status = 'ZGŁOSZONY'" : ''}
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
