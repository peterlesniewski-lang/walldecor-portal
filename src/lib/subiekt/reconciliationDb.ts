// Uzgodnienie faktur z zamówieniem (PLAN-SUBIEKT-2026-10-29.md, Loop 5b) — część bazodanowa: stan łańcucha
// w projekcie i wiersze subiekt_reconciliations (OPEN / RESOLVED / AUTO_CLOSED) z wpisami w logu aktywności.
// Reguły bez bazy są w reconcile.ts; wybór źródła pozycji (syncChainOf) zostaje w mappingDb.ts, który woła
// settleReconciliation / closeReconciliation. Wołać w transakcji dokumentu albo operacji admina (bez savepointów).
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/db';
import { logActivity } from '@/lib/services';
import { AMOUNT_EPSILON as EPSILON, round2 } from './mapping';
import { chainMode, chainTotals, fingerprint, type ChainMode } from './reconcile';
import { formatReconciliationClosed, formatReconciliationOpened } from './diff';
import { findDocumentByExternalId, normalizeDocument, positionsOf, type SubiektDocumentRow } from './repo';

type StoredDoc = SubiektDocumentRow;

const ASSIGNED_STATUSES = "('AUTO', 'MANUAL')";
const loadDocByExternalId = findDocumentByExternalId;

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

export interface ReconciliationRow {
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
export async function loadChainDocuments(rootExternalId: number, projectId: string, includeDocId?: string): Promise<StoredDoc[]> {
    const rows = await query<StoredDoc>(
        `SELECT * FROM subiekt_documents
         WHERE root_external_id = ? AND project_id = ? AND (assignment_status IN ${ASSIGNED_STATUSES} OR id = ?)
         ORDER BY issued_at, external_id`,
        [rootExternalId, projectId, includeDocId ?? '']
    );
    return rows.map(normalizeDocument);
}

/**
 * Tryb i sumy łańcucha. Odzwierciedlenie ZK sprawdzamy na pozycjach FS PRZED korektami KFS (KFS wskazuje konkretną
 * pozycję FS, więc rozbicie pozostaje znane — w MIRROR korekty trafiają w pozycje FS jak przed Loop 5b); KFS liczą
 * się do kwoty faktur (reguła sum) i odcisku.
 */
export function describeChain(chain: StoredDoc[]): ChainState {
    const orders = chain.filter((d) => d.type === 'ZK');
    const invoices = chain.filter((d) => d.type === 'FS');
    const kfs = chain.filter((d) => d.type === 'KFS');
    const input = {
        orders: orders.map((d) => ({ net_total: Number(d.net_total), positions: positionsOf(d) })),
        invoices: invoices.map((d) => ({
            net_total: Number(d.net_total),
            positions: positionsOf(d),
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
    return describeChain(await loadChainDocuments(rootExternalId, projectId));
}

/** Wiersz uzgodnienia łańcucha, z blokadą (MySQL; SQLite ignoruje FOR UPDATE) — sync i resolve nie przeplatają się. */
async function findReconciliation(projectId: string, rootExternalId: number): Promise<ReconciliationRow | undefined> {
    const [row] = await query<ReconciliationRow>(
        'SELECT * FROM subiekt_reconciliations WHERE project_id = ? AND root_external_id = ? FOR UPDATE',
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

/** Dlaczego uzgodnienie zamknęło się samo: dokumenty znów zgodne (domyślnie) albo projekt niezrealizowany. */
export type CloseReason = 'DOCUMENTS' | 'PROJECT_CANCELLED';

async function logReconciliation(
    event: 'SUBIEKT_RECONCILIATION_OPENED' | 'SUBIEKT_RECONCILIATION_CLOSED',
    projectId: string,
    rootExternalId: number,
    state: ChainState,
    closing?: { previousStatus: string; previousAmounts: Map<number, number> | null; reason: CloseReason },
): Promise<void> {
    const zk = state.orders[0] ?? await loadDocByExternalId(rootExternalId);
    const zkNumber = zk?.number ?? `ZK ${rootExternalId}`;
    const invoices = invoiceNumbersOf(state);
    const description = event === 'SUBIEKT_RECONCILIATION_OPENED'
        ? formatReconciliationOpened(zkNumber, state.zkNet, state.invoicedNet, invoices)
        : formatReconciliationClosed(zkNumber, state.zkNet, state.invoicedNet, {
            previousResolved: closing?.previousStatus === 'RESOLVED',
            projectCancelled: closing?.reason === 'PROJECT_CANCELLED',
        });
    await logActivity(null, event, description, {
        projectId, rootExternalId, zkNumber, zk_net: state.zkNet, invoiced_net: state.invoicedNet, invoices,
        ...(closing ? {
            reason: closing.reason,
            previous_status: closing.previousStatus,
            previous_amounts: closing.previousAmounts ? Object.fromEntries(closing.previousAmounts) : null,
        } : {}),
    }, zk?.id ?? null);
}

/**
 * Łańcuch nie wymaga uzgodnienia (MIRROR, równe sumy, brak FS lub ZK) albo projekt jest niezrealizowany:
 * OPEN / RESOLVED → AUTO_CLOSED z wpisem SUBIEKT_RECONCILIATION_CLOSED (przy RESOLVED z poprzednią decyzją
 * admina w metadata, żeby została w historii).
 */
export async function closeReconciliation(projectId: string, rootExternalId: number, state: ChainState, reason: CloseReason = 'DOCUMENTS'): Promise<void> {
    const row = await findReconciliation(projectId, rootExternalId);
    if (!row || row.status === 'AUTO_CLOSED') return;
    await query(
        "UPDATE subiekt_reconciliations SET status = 'AUTO_CLOSED', zk_net = ?, invoiced_net = ?, fingerprint = ? WHERE id = ?",
        [state.zkNet, state.invoicedNet, state.fingerprint, row.id]
    );
    await logReconciliation('SUBIEKT_RECONCILIATION_CLOSED', projectId, rootExternalId, state, {
        previousStatus: row.status,
        previousAmounts: row.status === 'RESOLVED' ? parseReconciliationAmounts(row.amounts_json) : null,
        reason,
    });
}

/** Projekt niezrealizowany: wszystkie OPEN / RESOLVED uzgodnienia projektu → AUTO_CLOSED (wpis z powodem). */
export async function closeReconciliationsOfCancelledProject(projectId: string): Promise<void> {
    const rows = await query<ReconciliationRow>(
        "SELECT * FROM subiekt_reconciliations WHERE project_id = ? AND status IN ('OPEN', 'RESOLVED') ORDER BY root_external_id",
        [projectId]
    );
    for (const row of rows) {
        const root = Number(row.root_external_id);
        await closeReconciliation(projectId, root, describeChain(await loadChainDocuments(root, projectId)), 'PROJECT_CANCELLED');
    }
}

/**
 * Przejście do OPEN. `previousAmounts` (ponowne otwarcie RESOLVED) = decyzja admina bez kwot 0 — te pozycje wracają
 * z kwotą z ZK, żeby admin mógł zdecydować o nich ponownie; notatka zostaje. Bez niej (nowe / z AUTO_CLOSED)
 * decyzja i notatka są czyszczone.
 */
async function openReconciliation(
    projectId: string,
    rootExternalId: number,
    state: ChainState,
    row: ReconciliationRow | undefined,
    previousAmounts?: Map<number, number>,
): Promise<void> {
    if (row) {
        const amountsJson = previousAmounts && previousAmounts.size > 0 ? JSON.stringify(Object.fromEntries(previousAmounts)) : null;
        await query(
            `UPDATE subiekt_reconciliations SET status = 'OPEN', zk_net = ?, invoiced_net = ?, fingerprint = ?,
                opened_at = CURRENT_TIMESTAMP, resolved_at = NULL, resolved_by = NULL, amounts_json = ?
                ${previousAmounts ? '' : ', note = NULL'}
             WHERE id = ?`,
            [state.zkNet, state.invoicedNet, state.fingerprint, amountsJson, row.id]
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
 *   pozycjami ZK → OPEN z dotychczasowymi kwotami admina > 0 (pozycje uzgodnione na 0 wracają z kwotą z ZK);
 *   OPEN → aktualizacja sum.
 * Wpis SUBIEKT_RECONCILIATION_OPENED tylko przy przejściu do OPEN.
 */
export async function settleReconciliation(projectId: string, rootExternalId: number, state: ChainState): Promise<Map<number, number> | null> {
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
        await openReconciliation(projectId, rootExternalId, state, row);
        return null;
    }
    if (row.status === 'RESOLVED') {
        // Pozycje uzgodnione na 0 wracają z kwotą z ZK (addItemCore / korekta w górę w ZAKOŃCZONY) — admin decyduje znowu.
        const kept = new Map([...(saved ?? new Map<number, number>())].filter(([, amount]) => amount > 0));
        await openReconciliation(projectId, rootExternalId, state, row, kept);
        return kept;
    }
    await refreshTotals(row, state);
    return saved;
}
