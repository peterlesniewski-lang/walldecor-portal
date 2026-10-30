// Mapowanie zapisanego dokumentu Subiekta na architekta, projekt i pozycje (PLAN-SUBIEKT-2026-10-29.md, 2.4).
// Wołane z processDocument (sync.ts) WEWNĄTRZ transakcji dokumentu: każdy błąd ma propagować do jej granicy
// (brak savepointów — zob. db.ts), więc tu nic nie łapiemy. Pozycje i prowizje zmieniamy wyłącznie przez
// rdzeń src/lib/projectItems.ts (addItemCore / updateItemAmountCore / deleteItemCore).
//
// Zasada podziału: admin decyduje o PRZYPISANIU (MANUAL / IGNORED), Subiekt decyduje o TREŚCI (pozycje, kwoty).
// Pozycje projektu są widokiem pochodnym dokumentów: syncChainItems odtwarza je z positions_json dokumentów
// łańcucha i korekt KFS, więc można ją wołać dowolnie wiele razy (także z panelu admina w loopie 4).
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/db';
import { logActivity } from '@/lib/services';
import { addItemCore, updateItemAmountCore, type ItemActor } from '@/lib/projectItems';
import { clearDocumentItems, removeSubiektItem } from './chainOps';
import { findDocumentById, findDocumentByExternalId, findProject, normalizeDocument, type ProjectRow, type SubiektDocumentRow } from './repo';
import { AMOUNT_EPSILON as EPSILON, ROOT_IGNORED, buildItemInput, positionToItemType, resolveArchitectCode, resolveRoot } from './mapping';
import { chainMode, chainTotals, fingerprint, type ChainMode } from './reconcile';
import { formatReconciliationClosed, formatReconciliationOpened } from './diff';
import type { SubiektDocumentPayload, SubiektPositionPayload } from './types';
import { toDateOnly } from './dates';

export type UpsertOutcome = 'INSERTED' | 'UNCHANGED' | 'CHANGED';
/** Wynik dla liczników strony: ASSIGNED = AUTO lub MANUAL, UNASSIGNED = skrzynka, IGNORED = odrzucony przez admina. */
export type AssignmentResult = 'ASSIGNED' | 'UNASSIGNED' | 'IGNORED';

type StoredDoc = SubiektDocumentRow;

interface StoredItem {
    id: string;
    type: 'PRODUCT' | 'INSTALLATION';
    amount_net: number;
    description: string | null;
    order_number: string | null;
    invoice_number: string | null;
    is_paid: number;
    type_overridden: number;
    subiekt_position_id: number | null;
}

type ProjectRef = ProjectRow;

const MAX_CHAIN_STEPS = 32;
const MAX_LABEL_LENGTH = 200; // jak walidacja nazwy / klienta w createProject
const ASSIGNED_STATUSES = "('AUTO', 'MANUAL')";

/** Kwoty z payloadu do 2 miejsc — jak DECIMAL(12,2) w MySQL, żeby porównania nie zależały od silnika. */
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

const toResult = (status: string): AssignmentResult =>
    status === 'AUTO' || status === 'MANUAL' ? 'ASSIGNED' : status === 'IGNORED' ? 'IGNORED' : 'UNASSIGNED';

/** Autor zmian pozycji: numer z GT ma już prefiks typu ("FS 12/10/2026"), więc typ dopisujemy tylko gdy go brak. */
function actorFor(doc: Pick<StoredDoc, 'type' | 'number'>): ItemActor {
    const label = doc.number.startsWith(doc.type) ? doc.number : `${doc.type} ${doc.number}`;
    return { actorId: null, note: `Subiekt: ${label}` };
}

async function loadDocById(id: string): Promise<StoredDoc> {
    const row = await findDocumentById(id);
    if (!row) throw new Error(`Dokument Subiekta ${id} nie istnieje`);
    return row;
}

const loadDocByExternalId = findDocumentByExternalId;

async function loadProject(projectId: string, documentNumber: string): Promise<ProjectRef> {
    const project = await findProject(projectId);
    if (!project) throw new Error(`Projekt ${projectId} dokumentu ${documentNumber} nie istnieje`);
    return project;
}

const positionsOf = (row: Pick<StoredDoc, 'positions_json'>) => JSON.parse(row.positions_json) as SubiektPositionPayload[];

/** Wiersz z bazy → payload (dla buildItemInput i resolveArchitectCode). */
function rowToPayload(row: StoredDoc): SubiektDocumentPayload {
    return {
        external_id: Number(row.external_id),
        type: row.type,
        number: row.number,
        issued_at: toDateOnly(row.issued_at),
        contractor_name: row.contractor_name,
        contractor_nip: row.contractor_nip ?? null,
        architect_code: row.architect_code ?? null,
        parent_external_id: row.parent_external_id === null || row.parent_external_id === undefined ? null : Number(row.parent_external_id),
        net_total: Number(row.net_total),
        gross_total: Number(row.gross_total),
        is_paid: Number(row.is_paid) === 1,
        remarks: row.remarks ?? null,
        positions: positionsOf(row),
    };
}

// --- a) architekt ---

/**
 * `ownCode` = kod z samego dokumentu (pole własne / uwagi, znormalizowany) — tylko on trafia do kolumny
 * architect_code, żeby ponowne mapowanie z zapisanego wiersza dawało ten sam wynik. `code` = kod do
 * komunikatów (własny albo kod architekta odziedziczonego po rodzicu).
 */
type ArchitectResolution =
    | { architectId: string; ownCode: string | null; code: string | null }
    | { architectId: null; ownCode: string | null; code: string | null; note: string };

async function resolveArchitect(doc: SubiektDocumentPayload): Promise<ArchitectResolution> {
    const code = resolveArchitectCode(doc);
    if (code) {
        const [user] = await query<{ id: string }>("SELECT id FROM users WHERE subiekt_code = ? AND role = 'ARCHI'", [code]);
        return user
            ? { architectId: user.id, ownCode: code, code }
            : { architectId: null, ownCode: code, code, note: `UNKNOWN_ARCHITECT_CODE:${code}` };
    }
    if (doc.parent_external_id !== null) {
        // Dokument pochodny bez kodu dziedziczy architekta po rodzicu (strona jest posortowana, więc rodzic
        // z tej samej strony jest już zapisany). Nieznany rodzic lub rodzic bez architekta = brak architekta.
        const [parent] = await query<{ architect_id: string | null; subiekt_code: string | null }>(
            `SELECT d.architect_id, u.subiekt_code FROM subiekt_documents d LEFT JOIN users u ON u.id = d.architect_id
             WHERE d.external_id = ?`,
            [doc.parent_external_id]
        );
        if (parent?.architect_id) return { architectId: parent.architect_id, ownCode: null, code: parent.subiekt_code ?? null };
    }
    return { architectId: null, ownCode: null, code: null, note: 'NO_ARCHITECT' };
}

// --- b) korzeń łańcucha ---

/** Korzeń łańcucha (ZK/FP). Ścieżkę rodziców czytamy z bazy, a regułę (urwany łańcuch, cykl) daje resolveRoot. */
async function findRoot(externalId: number): Promise<StoredDoc | null> {
    const parents = new Map<number, number | null>();
    let current = externalId;
    for (let step = 0; step <= MAX_CHAIN_STEPS && !parents.has(current); step++) {
        const [row] = await query<{ parent_external_id: number | null }>(
            'SELECT parent_external_id FROM subiekt_documents WHERE external_id = ?',
            [current]
        );
        if (!row) break;
        const parent = row.parent_external_id === null || row.parent_external_id === undefined ? null : Number(row.parent_external_id);
        parents.set(current, parent);
        if (parent === null) break;
        current = parent;
    }
    const resolved = resolveRoot(externalId, (id) => (parents.has(id) ? parents.get(id)! : undefined));
    if (!('rootExternalId' in resolved)) return null;
    const root = await loadDocByExternalId(resolved.rootExternalId);
    // Korzeniem projektu może być tylko ZK lub FP; FS/WZ bez rodzica = brak dokumentu źródłowego.
    return root && (root.type === 'ZK' || root.type === 'FP') ? root : null;
}

// --- c) projekt ---

function truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max).trimEnd() : text;
}

/**
 * Nowy projekt dla dokumentu (jak przy automatycznym mapowaniu ZK/FP): `p_` + 8 hex, nazwa „kontrahent — numer”
 * (≤ 200 zn.), client_label = kontrahent, status PRZYJĘTY. Tylko INSERT do projects — przypisanie dokumentu
 * i wpis w logu robi wołający (sync albo panel admina).
 */
export async function insertProjectForDocument(
    doc: { number: string; contractor_name: string },
    ownerId: string,
): Promise<{ projectId: string; name: string }> {
    const projectId = `p_${uuidv4().replace(/-/g, '').slice(0, 8)}`;
    const suffix = ` — ${doc.number}`;
    const name = truncate(truncate(doc.contractor_name, Math.max(1, MAX_LABEL_LENGTH - suffix.length)) + suffix, MAX_LABEL_LENGTH);
    await query(
        `INSERT INTO projects (id, owner_id, name, client_label, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PRZYJĘTY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [projectId, ownerId, name, truncate(doc.contractor_name, MAX_LABEL_LENGTH)]
    );
    return { projectId, name };
}

async function createProjectForRoot(root: StoredDoc, architectId: string): Promise<string> {
    const { projectId, name } = await insertProjectForDocument(root, architectId);
    await query('UPDATE subiekt_documents SET project_id = ? WHERE id = ?', [projectId, root.id]);
    await logActivity(null, 'SUBIEKT_PROJECT_CREATED', `Subiekt: utworzono projekt „${name}” z dokumentu ${root.number}`, {
        projectId, documentId: root.id, architectId,
    }, root.id);
    return projectId;
}

// --- d) pozycje ---

/** Pozycje dokumentu W TYM projekcie — pozycje tego samego dokumentu w innym projekcie nie są ruszane. */
async function loadItemsOfDocument(documentId: string, projectId: string): Promise<StoredItem[]> {
    return query<StoredItem>(
        `SELECT id, type, amount_net, description, order_number, invoice_number, is_paid, type_overridden, subiekt_position_id
         FROM project_items WHERE subiekt_document_id = ? AND project_id = ? AND source = 'SUBIEKT' ORDER BY id`,
        [documentId, projectId]
    );
}

const removeItem = removeSubiektItem;

/**
 * Korekty KFS projektu jako widok pochodny: ob_Id pozycji FS → kwota po korekcie. Źródło = wszystkie
 * przypisane (AUTO/MANUAL) KFS projektu, w kolejności issued_at, potem external_id — późniejsza KFS
 * wygrywa, bo agent wysyła wartość PO korekcie (narastająco). KFS nieprzypisana (np. UNMATCHED_CORRECTION)
 * do mapy nie wchodzi — świadomie, rozstrzyga admin.
 */
async function loadCorrections(projectId: string): Promise<Map<number, number>> {
    const rows = await query<StoredDoc>(
        `SELECT * FROM subiekt_documents
         WHERE type = 'KFS' AND project_id = ? AND assignment_status IN ${ASSIGNED_STATUSES}
         ORDER BY issued_at, external_id`,
        [projectId]
    );
    const corrections = new Map<number, number>();
    for (const row of rows) {
        for (const pos of positionsOf(row)) {
            if (pos.corrects_position_external_id !== null && pos.corrects_position_external_id !== undefined) {
                corrections.set(pos.corrects_position_external_id, round2(pos.net_total));
            }
        }
    }
    return corrections;
}

/** Numery faktur i zapłata pozycji ZK, gdy pozycje z ZK niosą dane faktur łańcucha (ORDER_BREAKDOWN / RECONCILE). */
interface InvoiceMeta { invoiceNumber: string | null; isPaid: boolean }

/**
 * Upsert pozycji jednego dokumentu wiodącego po kluczu (subiekt_document_id, subiekt_position_id), kwota =
 * z `amounts` (korekta KFS dla FS, kwota z uzgodnienia admina dla ZK), jeśli jest, albo z pozycji: nowa →
 * addItemCore, zmieniona kwota → updateItemAmountCore, kwota ≤ 0 lub pozycja zniknęła z dokumentu →
 * removeSubiektItem → deleteItemCore (w ZAKOŃCZONY: korekta do 0). Pola bez wpływu na prowizję (opis, numery,
 * zapłata; `meta` nadpisuje numer faktury i zapłatę) odświeżamy bezpośrednim UPDATE. Typ istniejącej pozycji
 * się nie zmienia (type_overridden = decyzja admina; zmiana typu wymagałaby przeliczenia prowizji).
 */
async function syncDocumentItems(
    source: StoredDoc,
    project: ProjectRef,
    rootZkNumber: string | null,
    amounts: Map<number, number>,
    actor: ItemActor,
    meta?: InvoiceMeta,
) {
    const withMeta = (input: ReturnType<typeof buildItemInput>) =>
        meta ? { ...input, invoice_number: meta.invoiceNumber, is_paid: meta.isPaid } : input;
    const payload = rowToPayload(source);
    const existing = await loadItemsOfDocument(source.id, project.id);
    const byPosition = new Map<number, StoredItem>();
    for (const item of existing) {
        if (item.subiekt_position_id !== null && !byPosition.has(Number(item.subiekt_position_id))) {
            byPosition.set(Number(item.subiekt_position_id), item);
        }
    }

    const kept = new Set<string>();
    const seenPositions = new Set<number>();
    for (const pos of payload.positions) {
        if (seenPositions.has(pos.external_id)) continue;
        seenPositions.add(pos.external_id);

        const amount = amounts.get(pos.external_id) ?? round2(pos.net_total);
        const item = byPosition.get(pos.external_id);
        if (!item) {
            // Pozycje z kwotą ≤ 0 (gratisy, korekta do zera) nie są tworzone — addItemCore i tak by je odrzucił.
            if (amount > 0) {
                await addItemCore(project.id, withMeta(buildItemInput(payload, { ...pos, net_total: amount }, {
                    subiektDocumentId: source.id, rootZkNumber,
                })), actor);
            }
            continue;
        }

        kept.add(item.id);
        if (amount <= 0) {
            await removeItem(item, project.status, actor);
            continue;
        }
        if (Math.abs(round2(item.amount_net) - amount) >= EPSILON) {
            await updateItemAmountCore(item.id, amount, actor);
        }
        if (!Number(item.type_overridden) && positionToItemType(pos) !== item.type) {
            console.warn('[subiekt] Typ pozycji z Subiekta zmienił się — zostawiamy dotychczasowy', {
                itemId: item.id, document: source.number, position: pos.external_id,
            });
        }

        const desired = withMeta(buildItemInput(payload, { ...pos, net_total: amount }, {
            subiektDocumentId: source.id, rootZkNumber, forcedType: item.type,
        }));
        const isPaid = desired.is_paid ? 1 : 0;
        if (
            (item.description ?? null) !== (desired.description ?? null) ||
            (item.order_number ?? null) !== (desired.order_number ?? null) ||
            (item.invoice_number ?? null) !== (desired.invoice_number ?? null) ||
            Number(item.is_paid) !== isPaid
        ) {
            await query(
                'UPDATE project_items SET description = ?, order_number = ?, invoice_number = ?, is_paid = ? WHERE id = ?',
                [desired.description ?? null, desired.order_number ?? null, desired.invoice_number ?? null, isPaid, item.id]
            );
        }
    }

    for (const item of existing) {
        if (!kept.has(item.id)) await removeItem(item, project.status, actor);
    }
}

/** Przypisane FS projektu: ob_Id pozycji → dokument FS (cel korekt KFS). */
async function invoicePositionsOfProject(projectId: string): Promise<Map<number, StoredDoc>> {
    const invoices = await query<StoredDoc>(
        `SELECT * FROM subiekt_documents WHERE type = 'FS' AND project_id = ? AND assignment_status IN ${ASSIGNED_STATUSES}`,
        [projectId]
    );
    const byPosition = new Map<number, StoredDoc>();
    for (const fs of invoices) for (const pos of positionsOf(fs)) byPosition.set(pos.external_id, fs);
    return byPosition;
}

/** Czy każda pozycja KFS wskazuje pozycję przypisanej FS projektu (wszystko albo nic). */
async function correctionMatches(kfs: Pick<StoredDoc, 'positions_json'>, projectId: string): Promise<boolean> {
    const targets = await invoicePositionsOfProject(projectId);
    return positionsOf(kfs).every((pos) =>
        pos.corrects_position_external_id !== null && pos.corrects_position_external_id !== undefined &&
        targets.has(pos.corrects_position_external_id));
}

// --- e) uzgodnienie faktur z zamówieniem (loop 5b) ---

const MAX_INVOICE_NUMBER_LENGTH = 255;

/** Stan łańcucha w projekcie: dokumenty według typu, tryb (reconcile.ts), sumy i odcisk faktur. */
export interface ChainState {
    mode: ChainMode;
    zkNet: number;
    invoicedNet: number;
    fingerprint: string;
    orders: StoredDoc[];
    invoices: StoredDoc[];
    corrections: StoredDoc[];
}

interface ReconciliationRow {
    id: string;
    project_id: string;
    root_external_id: number;
    status: 'OPEN' | 'RESOLVED' | 'AUTO_CLOSED';
    zk_net: number;
    invoiced_net: number;
    fingerprint: string;
    amounts_json: string | null;
}

/** Dokumenty łańcucha `rootExternalId` w projekcie: przypisane (AUTO/MANUAL) i opcjonalnie dokument w trakcie mapowania. */
async function loadChainDocuments(rootExternalId: number, projectId: string, includeDocId?: string): Promise<StoredDoc[]> {
    const rows = await query<StoredDoc>(
        `SELECT * FROM subiekt_documents
         WHERE root_external_id = ? AND project_id = ? AND (assignment_status IN ${ASSIGNED_STATUSES} OR id = ?)
         ORDER BY issued_at, external_id`,
        [rootExternalId, projectId, includeDocId ?? '']
    );
    return rows.map(normalizeDocument);
}

/** Tryb i sumy łańcucha; pozycje FS po korektach KFS (`corrections` — mapa projektu z loadCorrections). */
function describeChain(chain: StoredDoc[], corrections: Map<number, number>): ChainState {
    const orders = chain.filter((d) => d.type === 'ZK');
    const invoices = chain.filter((d) => d.type === 'FS');
    const kfs = chain.filter((d) => d.type === 'KFS');
    const input = {
        orders: orders.map((d) => ({ net_total: Number(d.net_total), positions: positionsOf(d) })),
        invoices: invoices.map((d) => ({
            net_total: Number(d.net_total),
            positions: positionsOf(d).map((p) => ({ ...p, net_total: corrections.get(p.external_id) ?? round2(p.net_total) })),
        })),
        corrections: kfs.map((d) => ({ net_total: Number(d.net_total) })),
    };
    return {
        mode: chainMode(input),
        ...chainTotals(input),
        fingerprint: fingerprint([...invoices, ...kfs]),
        orders, invoices, corrections: kfs,
    };
}

/** Stan łańcucha (dokumenty przypisane do projektu) — dla operacji admina (resolveReconciliationOp). Wołać w transakcji. */
export async function loadChainState(projectId: string, rootExternalId: number): Promise<ChainState> {
    return describeChain(await loadChainDocuments(rootExternalId, projectId), await loadCorrections(projectId));
}

async function findReconciliation(projectId: string, rootExternalId: number): Promise<ReconciliationRow | undefined> {
    const [row] = await query<ReconciliationRow>(
        'SELECT * FROM subiekt_reconciliations WHERE project_id = ? AND root_external_id = ?',
        [projectId, rootExternalId]
    );
    return row;
}

/** amounts_json → mapa ob_Id pozycji ZK → kwota; uszkodzony JSON = brak decyzji (z ostrzeżeniem). */
export function parseReconciliationAmounts(json: string | null | undefined): Map<number, number> | null {
    if (!json) return null;
    try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const amounts = new Map<number, number>();
        for (const [key, value] of Object.entries(parsed)) {
            if (Number.isFinite(Number(key)) && Number.isFinite(Number(value))) amounts.set(Number(key), round2(Number(value)));
        }
        return amounts;
    } catch (error) {
        console.warn('[subiekt] Nieczytelne amounts_json uzgodnienia — pomijam', error);
        return null;
    }
}

/** ob_Id pozycji ZK łańcucha z kwotą > 0 — zbiór, który musi pokrywać decyzja admina. */
function orderPositionIds(state: ChainState): Set<number> {
    return new Set(state.orders.flatMap((d) => positionsOf(d)).filter((p) => Number(p.net_total) > 0).map((p) => p.external_id));
}

const coversPositions = (amounts: Map<number, number> | null, ids: Set<number>) =>
    amounts !== null && amounts.size === ids.size && [...ids].every((id) => amounts.has(id));

/** Numery FS i KFS łańcucha (do logu i karty uzgodnienia), w kolejności wystawienia. */
const invoiceNumbersOf = (state: ChainState) => [...state.invoices, ...state.corrections]
    .sort((a, b) => (a.issued_at === b.issued_at ? a.external_id - b.external_id : a.issued_at < b.issued_at ? -1 : 1))
    .map((d) => d.number);

async function logReconciliation(
    event: 'SUBIEKT_RECONCILIATION_OPENED' | 'SUBIEKT_RECONCILIATION_CLOSED',
    projectId: string,
    rootExternalId: number,
    state: ChainState,
): Promise<void> {
    const zk = state.orders[0] ?? await loadDocByExternalId(rootExternalId);
    const zkNumber = zk?.number ?? `ZK ${rootExternalId}`;
    const invoices = invoiceNumbersOf(state);
    const description = event === 'SUBIEKT_RECONCILIATION_OPENED'
        ? formatReconciliationOpened(zkNumber, state.zkNet, state.invoicedNet, invoices)
        : formatReconciliationClosed(zkNumber, state.zkNet, state.invoicedNet);
    await logActivity(null, event, description, {
        projectId, rootExternalId, zkNumber, zk_net: state.zkNet, invoiced_net: state.invoicedNet, invoices,
    }, zk?.id ?? null);
}

/** Łańcuch nie wymaga uzgodnienia (MIRROR, równe sumy, brak FS lub ZK): OPEN / RESOLVED → AUTO_CLOSED; wpis tylko dla OPEN. */
async function closeReconciliation(projectId: string, rootExternalId: number, state: ChainState): Promise<void> {
    const row = await findReconciliation(projectId, rootExternalId);
    if (!row || row.status === 'AUTO_CLOSED') return;
    await query(
        "UPDATE subiekt_reconciliations SET status = 'AUTO_CLOSED', zk_net = ?, invoiced_net = ?, fingerprint = ? WHERE id = ?",
        [state.zkNet, state.invoicedNet, state.fingerprint, row.id]
    );
    if (row.status === 'OPEN') await logReconciliation('SUBIEKT_RECONCILIATION_CLOSED', projectId, rootExternalId, state);
}

async function openReconciliation(projectId: string, rootExternalId: number, state: ChainState, row: ReconciliationRow | undefined, keepAmounts: boolean): Promise<void> {
    if (row) {
        await query(
            `UPDATE subiekt_reconciliations SET status = 'OPEN', zk_net = ?, invoiced_net = ?, fingerprint = ?,
                opened_at = CURRENT_TIMESTAMP, resolved_at = NULL, resolved_by = NULL
                ${keepAmounts ? '' : ', amounts_json = NULL, note = NULL'}
             WHERE id = ?`,
            [state.zkNet, state.invoicedNet, state.fingerprint, row.id]
        );
    } else {
        await query(
            `INSERT INTO subiekt_reconciliations (id, project_id, root_external_id, status, zk_net, invoiced_net, fingerprint, opened_at)
             VALUES (?, ?, ?, 'OPEN', ?, ?, ?, CURRENT_TIMESTAMP)`,
            [uuidv4(), projectId, rootExternalId, state.zkNet, state.invoicedNet, state.fingerprint]
        );
    }
    await logReconciliation('SUBIEKT_RECONCILIATION_OPENED', projectId, rootExternalId, state);
}

async function refreshTotals(row: ReconciliationRow, state: ChainState): Promise<void> {
    if (Math.abs(Number(row.zk_net) - state.zkNet) < EPSILON && Math.abs(Number(row.invoiced_net) - state.invoicedNet) < EPSILON && row.fingerprint === state.fingerprint) return;
    await query('UPDATE subiekt_reconciliations SET zk_net = ?, invoiced_net = ?, fingerprint = ? WHERE id = ?',
        [state.zkNet, state.invoicedNet, state.fingerprint, row.id]);
}

/**
 * Stan uzgodnienia łańcucha dla ORDER_BREAKDOWN / RECONCILE i kwoty pozycji ZK (null = kwoty z ZK):
 * - RESOLVED z tym samym odciskiem i decyzją pokrywającą pozycje ZK → kwoty admina, status bez zmian;
 * - ORDER_BREAKDOWN poza tym → OPEN / RESOLVED zamykane (AUTO_CLOSED), kwoty z ZK;
 * - RECONCILE: brak wiersza / AUTO_CLOSED → nowe OPEN (kwoty z ZK); RESOLVED z innym odciskiem albo innymi
 *   pozycjami ZK → OPEN z dotychczasowymi kwotami admina (do nowej decyzji); OPEN → aktualizacja sum.
 * Wpis SUBIEKT_RECONCILIATION_OPENED tylko przy przejściu do OPEN.
 */
async function settleReconciliation(projectId: string, rootExternalId: number, state: ChainState): Promise<Map<number, number> | null> {
    const row = await findReconciliation(projectId, rootExternalId);
    const saved = parseReconciliationAmounts(row?.amounts_json);
    const keepsDecision = row?.status === 'RESOLVED' && row.fingerprint === state.fingerprint && coversPositions(saved, orderPositionIds(state));

    if (keepsDecision) {
        await refreshTotals(row!, state);
        return saved;
    }
    if (state.mode === 'ORDER_BREAKDOWN') {
        await closeReconciliation(projectId, rootExternalId, state);
        return null;
    }
    if (!row || row.status === 'AUTO_CLOSED') {
        await openReconciliation(projectId, rootExternalId, state, row, false);
        return null;
    }
    if (row.status === 'RESOLVED') {
        await openReconciliation(projectId, rootExternalId, state, row, true);
        return saved;
    }
    await refreshTotals(row, state);
    return saved;
}

/**
 * Odtwarza pozycje łańcucha dokumentu. Łańcuch = dokumenty tego samego korzenia w tym projekcie, przypisane
 * (AUTO/MANUAL) + sam dokument. Tryb (reconcile.ts → chainMode):
 * - ORDER_ONLY: pozycje z ZK;
 * - INVOICE_ONLY, MIRROR: pozycje ZK łańcucha znikają, każda FS synchronizuje swoje pozycje (z korektami KFS);
 * - ORDER_BREAKDOWN, RECONCILE: pozycje FS znikają, pozycje z ZK z numerami FS łańcucha i zapłatą „wszystkie FS
 *   zapłacone”; kwoty z ZK albo z decyzji admina (subiekt_reconciliations, settleReconciliation).
 * Poza ORDER_BREAKDOWN / RECONCILE otwarte uzgodnienie zamyka się samo. KFS → resync łańcuchów wszystkich FS
 * projektu. Brak projektu lub projekt NIEZREALIZOWANY → nic.
 */
async function syncChainOf(doc: StoredDoc, actor: ItemActor): Promise<void> {
    if (!doc.project_id) return;
    const project = await loadProject(doc.project_id, doc.number);
    if (project.status === 'NIEZREALIZOWANY') return;

    // KFS → resync WSZYSTKICH faktur projektu, nie tylko obecnych celów: korekta, która zmieniła cel albo
    // wypadła z mapy, musi zdjąć starą kwotę z pozycji FS, którą korygowała wcześniej (idempotentne).
    if (doc.type === 'KFS') return resyncInvoicesOf(project.id, actor);

    const rootKey = doc.root_external_id === null || doc.root_external_id === undefined ? null : Number(doc.root_external_id);
    const chain = rootKey === null ? [doc] : await loadChainDocuments(rootKey, project.id, doc.id);
    const root = rootKey === null
        ? undefined
        : chain.find((d) => Number(d.external_id) === rootKey) ?? await loadDocByExternalId(rootKey);
    const rootZkNumber = root?.type === 'ZK' ? root.number : null;
    const corrections = await loadCorrections(project.id);
    const state = describeChain(chain, corrections);

    const removeItemsOf = async (docs: StoredDoc[]) => {
        for (const d of docs) {
            for (const item of await loadItemsOfDocument(d.id, project.id)) await removeItem(item, project.status, actor);
        }
    };

    if (state.mode === 'ORDER_BREAKDOWN' || state.mode === 'RECONCILE') {
        await removeItemsOf(state.invoices);
        const amounts = rootKey === null ? null : await settleReconciliation(project.id, rootKey, state);
        const meta: InvoiceMeta = {
            invoiceNumber: truncate(state.invoices.map((d) => d.number).join(', '), MAX_INVOICE_NUMBER_LENGTH),
            isPaid: state.invoices.every((d) => Number(d.is_paid) === 1),
        };
        for (const zk of state.orders) await syncDocumentItems(zk, project, rootZkNumber, amounts ?? new Map(), actor, meta);
        return;
    }

    if (state.mode === 'ORDER_ONLY') {
        for (const zk of state.orders) await syncDocumentItems(zk, project, rootZkNumber, new Map(), actor);
    } else {
        await removeItemsOf(state.orders);
        for (const fs of state.invoices) await syncDocumentItems(fs, project, rootZkNumber, corrections, actor);
    }
    if (rootKey !== null) await closeReconciliation(project.id, rootKey, state);
}

/**
 * Uzgodnienia projektu, które nie mają już łańcucha w tym projekcie (zignorowany / przeniesiony korzeń), są
 * zamykane; pozostałe OPEN / RESOLVED przechodzą przez syncChainOf (idempotentne). Wołane po operacjach admina.
 */
async function refreshReconciliationsOf(projectId: string, actor: ItemActor): Promise<void> {
    const rows = await query<ReconciliationRow>(
        "SELECT * FROM subiekt_reconciliations WHERE project_id = ? AND status IN ('OPEN', 'RESOLVED') ORDER BY root_external_id",
        [projectId]
    );
    for (const row of rows) {
        const chain = await loadChainDocuments(Number(row.root_external_id), projectId);
        const lead = chain.find((d) => d.type === 'ZK') ?? chain.find((d) => d.type === 'FS');
        if (lead) await syncChainOf(lead, actor);
        else await closeReconciliation(projectId, Number(row.root_external_id), describeChain(chain, new Map()));
    }
}

/** Resync łańcuchów wszystkich przypisanych FS projektu (raz na korzeń), z bieżącą mapą korekt KFS. */
async function resyncInvoicesOf(projectId: string, actor: ItemActor): Promise<void> {
    const invoices = await query<StoredDoc>(
        `SELECT * FROM subiekt_documents WHERE type = 'FS' AND project_id = ? AND assignment_status IN ${ASSIGNED_STATUSES}
         ORDER BY issued_at, external_id`,
        [projectId]
    );
    const done = new Set<string>();
    for (const fs of invoices) {
        const chainKey = fs.root_external_id === null || fs.root_external_id === undefined ? `doc:${fs.id}` : `root:${fs.root_external_id}`;
        if (done.has(chainKey)) continue;
        done.add(chainKey);
        await syncChainOf(fs, actor);
    }
}

// --- zapis wyniku ---

async function saveAssignment(
    documentId: string,
    fields: {
        status: string;
        note: string | null;
        architectCode: string | null;
        architectId: string | null;
        rootExternalId: number | null;
        /** null = nie zmieniaj (dokument nigdy nie traci projektu automatycznie). */
        projectId: string | null;
    }
) {
    await query(
        `UPDATE subiekt_documents SET
            assignment_status = ?, assignment_note = ?, architect_code = ?, architect_id = ?,
            root_external_id = ?, project_id = COALESCE(?, project_id)
         WHERE id = ?`,
        [fields.status, fields.note, fields.architectCode, fields.architectId, fields.rootExternalId, fields.projectId, documentId]
    );
}

async function refreshPaidFlag(doc: StoredDoc) {
    // Zapłata nie wchodzi do hasha; is_paid pozycji nie wpływa na prowizję. Tylko pozycje w projekcie dokumentu.
    if (!doc.project_id) return;
    await query(
        "UPDATE project_items SET is_paid = ? WHERE subiekt_document_id = ? AND project_id = ? AND source = 'SUBIEKT' AND is_paid <> ?",
        [Number(doc.is_paid), doc.id, doc.project_id, Number(doc.is_paid)]
    );
}

/**
 * Pełne mapowanie zapisanego wiersza. KFS, która była w mapie korekt (AUTO/MANUAL w projekcie), a po
 * mapowaniu jest nieprzypisana (np. UNMATCHED_CORRECTION) → resync faktur jej projektu, żeby pozycje FS
 * zrzuciły starą korektę (przegląd loopa 2, pkt c).
 */
async function remapStored(current: StoredDoc): Promise<AssignmentResult> {
    const wasCorrection = current.type === 'KFS' && Boolean(current.project_id) &&
        (current.assignment_status === 'AUTO' || current.assignment_status === 'MANUAL');
    const result = await remapRules(current);
    if (wasCorrection && result !== 'ASSIGNED') await resyncInvoicesOf(current.project_id as string, actorFor(current));
    return result;
}

/** Reguły 2.4: architekt → korzeń → projekt → pozycje. */
async function remapRules(current: StoredDoc): Promise<AssignmentResult> {
    const unassigned = async (note: string, fields: { architectCode: string | null; architectId: string | null; rootExternalId: number | null; projectId?: string | null }) => {
        await saveAssignment(current.id, { status: 'UNASSIGNED', note, ...fields, projectId: fields.projectId ?? null });
        return 'UNASSIGNED' as const;
    };

    // a) architekt, b) korzeń (zapamiętany także dla nieprzypisanych — ułatwia ręczne przypisanie)
    const architect = await resolveArchitect(rowToPayload(current));
    const root = await findRoot(current.external_id);
    const rootExternalId = root ? Number(root.external_id) : null;
    // Zignorowany korzeń → dokument pochodny dziedziczy IGNORED (bez projektu i pozycji); przypisanie korzenia
    // przez admina przywraca łańcuch (adminOps → remapDocument).
    if (root && root.id !== current.id && root.assignment_status === 'IGNORED') {
        if (current.project_id) await clearDocumentItems(current.id, current.project_id, actorFor(current));
        await query(
            `UPDATE subiekt_documents SET assignment_status = 'IGNORED', assignment_note = ?,
                architect_code = ?, architect_id = ?, root_external_id = ?, project_id = NULL WHERE id = ?`,
            [ROOT_IGNORED, architect.ownCode, architect.architectId, rootExternalId, current.id]
        );
        return 'IGNORED';
    }
    if ('note' in architect) {
        return unassigned(architect.note, { architectCode: architect.ownCode, architectId: null, rootExternalId });
    }
    const located = { architectCode: architect.ownCode, architectId: architect.architectId, rootExternalId };
    if (!root) return unassigned('NO_ROOT_DOCUMENT', located);

    // c) projekt: dokument zostaje w swoim projekcie; inaczej projekt korzenia; korzeń bez projektu tworzy go sam.
    let projectId = current.project_id ?? root.project_id;
    if (!projectId) {
        if (root.id !== current.id) return unassigned('ROOT_UNASSIGNED', located);
        projectId = await createProjectForRoot(current, architect.architectId);
    }
    const project = await loadProject(projectId, current.number);

    let note: string | null = null;
    if (project.owner_id !== architect.architectId) {
        const mismatch = `OWNER_MISMATCH:${architect.code ?? architect.architectId}`;
        // Dokument jeszcze bez projektu nie trafia do cudzego projektu.
        if (!current.project_id) return unassigned(mismatch, located);
        // Dokument już w projekcie: projekt i status zostają, admin dostaje wpis w logu (raz na zmianę powodu).
        if (current.assignment_note !== mismatch) {
            await logActivity(null, 'SUBIEKT_OWNER_MISMATCH',
                `Subiekt: dokument ${current.number} wskazuje architekta ${architect.code ?? architect.architectId}, a projekt należy do innego architekta`,
                { projectId, documentId: current.id, architectId: architect.architectId, ownerId: project.owner_id }, current.id);
        }
        if (current.assignment_status !== 'AUTO') {
            await saveAssignment(current.id, { status: current.assignment_status, note: mismatch, ...located, projectId });
            return toResult(current.assignment_status);
        }
        note = mismatch;
    }
    if (project.status === 'NIEZREALIZOWANY') return unassigned('PROJECT_CANCELLED', { ...located, projectId });
    // Niedopasowana korekta zostaje przy projekcie (project_id, root) — admin widzi ją w skrzynce; pozycje FS bez zmian.
    if (current.type === 'KFS' && !(await correctionMatches(current, projectId))) {
        return unassigned('UNMATCHED_CORRECTION', { ...located, projectId });
    }

    await saveAssignment(current.id, { status: 'AUTO', note, ...located, projectId });

    // d) pozycje (WZ i FP nigdy ich nie tworzą; KFS przelicza korygowane FS)
    await syncChainOf({
        ...current, assignment_status: 'AUTO', assignment_note: note, architect_code: located.architectCode,
        architect_id: located.architectId, root_external_id: rootExternalId, project_id: projectId,
    }, actorFor(current));
    return 'ASSIGNED';
}

/**
 * Odtwarza pozycje projektu wynikające z łańcucha dokumentu (usunięcie pozycji ZK, gdy wiodą FS; resync
 * pozycji FS/ZK z korektami KFS). Bez zmiany przypisania. Dla loopu 4: po ręcznym przypisaniu/przeniesieniu
 * (project_id + assignment_status = 'MANUAL') wywołać dla dokumentu. `actor` domyślnie = system z numerem
 * dokumentu (panel admina podaje admina). Wołać w transakcji.
 */
export async function syncChainItems(subiektDocumentId: string, actor?: ItemActor): Promise<void> {
    const doc = await loadDocById(subiektDocumentId);
    await syncChainOf(doc, actor ?? actorFor(doc));
}

/**
 * Resync pozycji wszystkich przypisanych FS projektu z bieżącą mapą korekt KFS — po tym, jak KFS wypadła
 * z mapy (zignorowana, przeniesiona) — i uzgodnień projektu (łańcuch bez dokumentów w projekcie → AUTO_CLOSED).
 * No-op dla projektu NIEZREALIZOWANY. Wołać w transakcji.
 */
export async function resyncProjectInvoices(projectId: string, actor: ItemActor): Promise<void> {
    const project = await loadProject(projectId, projectId);
    if (project.status === 'NIEZREALIZOWANY') return;
    await resyncInvoicesOf(projectId, actor);
    await refreshReconciliationsOf(projectId, actor);
}

/** Czy KFS (wszystkie jej pozycje) wskazuje pozycje przypisanych FS projektu — warunek wejścia do mapy korekt. */
export async function kfsMatchesProject(subiektDocumentId: string, projectId: string): Promise<boolean> {
    return correctionMatches(await loadDocById(subiektDocumentId), projectId);
}

/** Pełne mapowanie jednego zapisanego dokumentu niezależnie od jego obecnego statusu. Wołać w transakcji. */
export async function remapDocument(subiektDocumentId: string): Promise<AssignmentResult> {
    return remapStored(await loadDocById(subiektDocumentId));
}

/**
 * Wejście synchronizacji (processDocument) po upsercie dokumentu:
 * - IGNORED → nic; MANUAL → bez zmiany przypisania, ale treść (pozycje) z Subiekta przy INSERTED/CHANGED;
 * - AUTO bez zmian → znacznik zapłaty pozycji (FS: także resync łańcucha — zapłata pozycji z ZK);
 * - pozostałe (nowy, zmieniony, nieprzypisany — także bez zmian, bo rodzic lub kod mogły dojść później) → remap.
 */
export async function mapDocument(documentId: string, outcome: UpsertOutcome): Promise<AssignmentResult> {
    const current = await loadDocById(documentId);
    if (current.assignment_status === 'IGNORED') return 'IGNORED';
    if (current.assignment_status === 'MANUAL' || (current.assignment_status === 'AUTO' && outcome === 'UNCHANGED')) {
        if (outcome === 'UNCHANGED') {
            await refreshPaidFlag(current);
            // Zapłata FS przy pozycjach z ZK (ORDER_BREAKDOWN / RECONCILE): is_paid pozycji ZK = wszystkie FS zapłacone.
            if (current.type === 'FS') await syncChainOf(current, actorFor(current));
        } else {
            await syncChainOf(current, actorFor(current));
        }
        return 'ASSIGNED';
    }
    return remapStored(current);
}
