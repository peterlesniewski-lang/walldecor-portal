// Orkiestracja jednej strony paczki od agenta Subiekt GT (PLAN-SUBIEKT-2026-10-29.md, Loop 1–2).
// Bez HTTP: route handler weryfikuje podpis i schemat, tu zapis do tabel pośrednich + mapowanie.
//
// Granica transakcji = jeden dokument (processDocument): upsert → mapowanie na architekta, projekt
// i pozycje (mappingDb.ts). Błąd w dowolnym kroku wycofuje cały dokument, łącznie z upsertem.
// Zagnieżdżony withTransaction dołącza do zewnętrznej transakcji bez savepointu, dlatego processSyncPage
// trzeba wołać POZA transakcją — tylko wtedy błąd jednego dokumentu wycofuje wyłącznie jego zapisy.
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/db';
import { logActivity } from '@/lib/services';
import { diffPositions, formatDiffForLog } from './diff';
import { hashDocument } from './hash';
import { sortDocumentsForProcessing } from './mapping';
import { mapDocument, type AssignmentResult, type UpsertOutcome } from './mappingDb';
import type { SubiektDocType, SubiektDocumentPayload, SubiektPositionPayload, SubiektSyncRequest, SubiektSyncResponse } from './types';

const shortId = (prefix: string) => `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

/**
 * INSERT wiersza, jeśli go nie ma (zwraca true, gdy wstawiono). Najpierw SELECT — zwykły przypadek bez
 * błędu w logach; gdy równoległe żądanie wstawi wiersz między SELECT a INSERT, błąd duplikatu klucza
 * (PK / UNIQUE, na obu silnikach) rozpoznajemy ponownym SELECT-em, a każdy inny błąd leci dalej.
 */
async function insertUnlessExists(insert: () => Promise<unknown>, exists: () => Promise<boolean>): Promise<boolean> {
    if (await exists()) return false;
    try {
        await insert();
        return true;
    } catch (error) {
        if (await exists()) return false;
        throw error;
    }
}

/**
 * Rejestruje odebraną stronę: wiersz uruchomienia (tworzony przy pierwszej stronie) i para (run_id, page)
 * w subiekt_sync_run_pages. Ponowna wysyłka tej samej strony (retry agenta) nie zawyża pages_received —
 * liczy się liczba różnych stron. Zwraca `replay: true`, gdy strona już była.
 */
async function registerPage(request: SubiektSyncRequest): Promise<{ replay: boolean }> {
    const { run_id: runId, page, pages } = request;

    await insertUnlessExists(
        () => query(
            `INSERT INTO subiekt_sync_runs (id, agent_version, pages_received, pages_expected, status)
             VALUES (?, ?, 0, ?, 'RUNNING')`,
            [runId, request.agent_version, pages]
        ),
        async () => (await query('SELECT id FROM subiekt_sync_runs WHERE id = ?', [runId])).length > 0
    );

    const isNewPage = await insertUnlessExists(
        () => query('INSERT INTO subiekt_sync_run_pages (run_id, page) VALUES (?, ?)', [runId, page]),
        async () => (await query('SELECT page FROM subiekt_sync_run_pages WHERE run_id = ? AND page = ?', [runId, page])).length > 0
    );

    await query(
        `UPDATE subiekt_sync_runs SET
            pages_received = (SELECT COUNT(*) FROM subiekt_sync_run_pages WHERE run_id = ?),
            pages_expected = ?
         WHERE id = ?`,
        [runId, pages, runId]
    );

    return { replay: !isNewPage };
}

/** Dolicza liczniki strony; po ostatniej oczekiwanej stronie zamyka uruchomienie (finished_at = pierwsze zamknięcie). */
async function finishPage(runId: string, response: SubiektSyncResponse): Promise<void> {
    await query(
        `UPDATE subiekt_sync_runs SET
            documents_accepted = documents_accepted + ?,
            documents_unchanged = documents_unchanged + ?,
            documents_rejected = documents_rejected + ?,
            documents_unassigned = documents_unassigned + ?,
            status = CASE WHEN pages_received >= pages_expected THEN 'DONE' ELSE status END,
            finished_at = CASE WHEN pages_received >= pages_expected THEN COALESCE(finished_at, CURRENT_TIMESTAMP) ELSE finished_at END
         WHERE id = ?`,
        [response.accepted, response.unchanged, response.rejected.length, response.unassigned, runId]
    );
}

async function insertSnapshot(documentId: string, runId: string, contentHash: string, positionsJson: string, netTotal: number) {
    await query(
        `INSERT INTO subiekt_document_snapshots (id, document_id, run_id, content_hash, positions_json, net_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [shortId('ss'), documentId, runId, contentHash, positionsJson, netTotal]
    );
}

/** Treść dokumentu sprzed zmiany (= ostatni snapshot), do diffu ZK/FP. */
interface PreviousContent {
    positions: SubiektPositionPayload[];
    netTotal: number;
}

function parsePositions(json: unknown): SubiektPositionPayload[] {
    if (Array.isArray(json)) return json as SubiektPositionPayload[];
    try {
        const parsed = JSON.parse(String(json ?? '[]'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Zapis jednego dokumentu (wywoływany wewnątrz withTransaction). */
async function upsertDocument(
    doc: SubiektDocumentPayload,
    runId: string
): Promise<{ id: string; outcome: UpsertOutcome; previous?: PreviousContent }> {
    const contentHash = hashDocument(doc);
    const positionsJson = JSON.stringify(doc.positions);
    const isPaid = doc.is_paid ? 1 : 0;

    // positions_json / net_total wiersza = treść ostatniego snapshotu (oba zapisywane razem przy każdej zmianie hasha).
    // Czytamy je stąd, a nie z subiekt_document_snapshots: created_at ma rozdzielczość sekundy, więc „poprzedni
    // snapshot” po dacie nie jest jednoznaczny przy kilku synchronizacjach w tej samej sekundzie.
    const [existing] = await query<{ id: string; content_hash: string; positions_json: unknown; net_total: unknown }>(
        'SELECT id, content_hash, positions_json, net_total FROM subiekt_documents WHERE external_id = ?',
        [doc.external_id]
    );

    if (!existing) {
        // Dwie równoległe strony z tym samym nowym external_id: druga dostaje duplikat klucza (UNIQUE) →
        // INTERNAL_ERROR w rejected; następny dzienny sync widzi już wiersz i to naprawia.
        const id = shortId('sd');
        await query(
            `INSERT INTO subiekt_documents (
                id, external_id, type, number, issued_at, contractor_name, contractor_nip, architect_code,
                architect_id, parent_external_id, root_external_id, project_id, net_total, gross_total, is_paid,
                remarks, content_hash, positions_json, assignment_status, assignment_note, last_run_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, 'UNASSIGNED', NULL, ?)`,
            [
                id, doc.external_id, doc.type, doc.number, doc.issued_at, doc.contractor_name, doc.contractor_nip,
                doc.architect_code, doc.parent_external_id, doc.net_total, doc.gross_total, isPaid, doc.remarks,
                contentHash, positionsJson, runId,
            ]
        );
        await insertSnapshot(id, runId, contentHash, positionsJson, doc.net_total);
        return { id, outcome: 'INSERTED' };
    }

    if (existing.content_hash === contentHash) {
        // Zapłata nie wchodzi do hasha (to nie zmiana treści), ale ma się aktualizować.
        await query(
            'UPDATE subiekt_documents SET last_seen_at = CURRENT_TIMESTAMP, last_run_id = ?, is_paid = ? WHERE id = ?',
            [runId, isPaid, existing.id]
        );
        return { id: existing.id, outcome: 'UNCHANGED' };
    }

    await query(
        `UPDATE subiekt_documents SET
            type = ?, number = ?, issued_at = ?, contractor_name = ?, contractor_nip = ?, architect_code = ?,
            parent_external_id = ?, net_total = ?, gross_total = ?, is_paid = ?, remarks = ?,
            content_hash = ?, positions_json = ?,
            last_changed_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP, last_run_id = ?
         WHERE id = ?`,
        [
            doc.type, doc.number, doc.issued_at, doc.contractor_name, doc.contractor_nip, doc.architect_code,
            doc.parent_external_id, doc.net_total, doc.gross_total, isPaid, doc.remarks,
            contentHash, positionsJson, runId, existing.id,
        ]
    );
    await insertSnapshot(existing.id, runId, contentHash, positionsJson, doc.net_total);
    return {
        id: existing.id,
        outcome: 'CHANGED',
        previous: { positions: parsePositions(existing.positions_json), netTotal: Number(existing.net_total) || 0 },
    };
}

export interface ProcessedDocument {
    id: string;
    outcome: UpsertOutcome;
    assignment: AssignmentResult;
}

/**
 * Jeden dokument w JEDNEJ transakcji: upsert (hash, snapshot) → mapowanie (architekt, projekt, pozycje,
 * prowizje przez rdzeń projectItems). Wyjątek wycofuje wszystkie zapisy dokumentu.
 */
export async function processDocument(doc: SubiektDocumentPayload, runId: string): Promise<ProcessedDocument> {
    return withTransaction(async () => {
        const { id, outcome, previous } = await upsertDocument(doc, runId);
        const assignment = await mapDocument(id, outcome);
        if (outcome === 'CHANGED' && previous) await logOrderChange(doc, id, previous);
        return { id, outcome, assignment };
    });
}

/** Dokumenty zamówieniowe, których zmiany trafiają do logu (decyzja 7). FS/KFS/WZ nie są diffowane. */
const DIFFED_TYPES: ReadonlySet<SubiektDocType> = new Set(['ZK', 'FP']);

/**
 * Zmiana treści ZK/FP → wpis SUBIEKT_ZK_CHANGED (user_id = NULL = „Subiekt (synchronizacja)”), w tej samej
 * transakcji co dokument. projectId = project_id dokumentu PO mapowaniu (null dla nieprzypisanych — wpis i tak
 * powstaje). Sama zmiana poza pozycjami i wartością (np. uwag) zmienia hash, ale nie daje wpisu.
 */
async function logOrderChange(doc: SubiektDocumentPayload, documentId: string, previous: PreviousContent): Promise<void> {
    if (!DIFFED_TYPES.has(doc.type)) return;

    const lines = diffPositions(previous.positions, doc.positions);
    const netBefore = previous.netTotal;
    const netAfter = Number(doc.net_total) || 0;
    if (lines.length === 0 && Math.round(netBefore * 100) === Math.round(netAfter * 100)) return;

    const [row] = await query<{ project_id: string | null }>('SELECT project_id FROM subiekt_documents WHERE id = ?', [documentId]);
    await logActivity(null, 'SUBIEKT_ZK_CHANGED', formatDiffForLog(doc.number, lines, netBefore, netAfter), {
        projectId: row?.project_id ?? null,
        documentId,
        externalId: doc.external_id,
        lines,
    });
}

/**
 * Przetwarza jedną stronę paczki: run + strona → dokumenty posortowane rodzic przed dzieckiem, każdy przez
 * processDocument we własnej transakcji → liczniki runu. `accepted` = INSERTED + CHANGED, `unchanged` =
 * UNCHANGED, `unassigned` = dokumenty, które po mapowaniu są w skrzynce (UNASSIGNED).
 * Błąd pojedynczego dokumentu trafia do `rejected` (INTERNAL_ERROR:<komunikat>), reszta strony idzie dalej;
 * odrzucenia z walidacji (VALIDATION:…) przychodzą w `options.preRejected` i są na początku `rejected`.
 * Powtórzona strona (ten sam run_id + page) jest przetwarzana ponownie — upsert jest idempotentny, więc
 * daje `unchanged` — ale nie zwiększa pages_received; liczniki dokumentów runu sumują się dalej.
 * Run jest DONE, gdy liczba różnych odebranych stron >= pages.
 * Wołać poza transakcją (zob. komentarz na górze pliku).
 */
export interface ProcessSyncPageOptions {
    /** Dokumenty odrzucone już przy walidacji (parseSyncRequest) — wliczane do `rejected` i licznika runu. */
    preRejected?: SubiektSyncResponse['rejected'];
}

export async function processSyncPage(
    request: SubiektSyncRequest,
    options: ProcessSyncPageOptions = {}
): Promise<SubiektSyncResponse> {
    const { replay } = await registerPage(request);
    if (replay) {
        console.warn('[subiekt] Powtórzona strona paczki — pages_received bez zmian', { run_id: request.run_id, page: request.page });
    }

    const response: SubiektSyncResponse = {
        run_id: request.run_id,
        accepted: 0,
        unchanged: 0,
        rejected: [...(options.preRejected ?? [])],
        unassigned: 0,
    };

    // Rodzice przed dziećmi (ZK/FP → WZ → FS → KFS), żeby dokument pochodny znalazł korzeń z tej samej strony.
    for (const doc of sortDocumentsForProcessing(request.documents)) {
        try {
            const result = await processDocument(doc, request.run_id);
            if (result.outcome === 'UNCHANGED') response.unchanged++;
            else response.accepted++;
            if (result.assignment === 'UNASSIGNED') response.unassigned++;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[subiekt] Błąd zapisu dokumentu', { run_id: request.run_id, external_id: doc.external_id, error });
            response.rejected.push({ external_id: doc.external_id, reason: `INTERNAL_ERROR:${message}` });
        }
    }

    await finishPage(request.run_id, response);
    return response;
}
