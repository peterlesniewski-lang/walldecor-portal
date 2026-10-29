// Orkiestracja jednej strony paczki od agenta Subiekt GT (PLAN-SUBIEKT-2026-10-29.md, Loop 1).
// Bez HTTP: route handler weryfikuje podpis i schemat, tu tylko zapis do tabel pośrednich.
//
// Granica transakcji = jeden dokument. Zagnieżdżony withTransaction dołącza do zewnętrznej transakcji
// bez savepointu, dlatego processSyncPage trzeba wołać POZA transakcją — tylko wtedy błąd jednego
// dokumentu wycofuje wyłącznie jego zapisy, a reszta strony przechodzi.
// Loop 1: brak mapowania na projekty — każdy dokument zostaje UNASSIGNED (MAPPING_NOT_ENABLED).
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/db';
import { hashDocument } from './hash';
import type { SubiektDocumentPayload, SubiektSyncRequest, SubiektSyncResponse } from './types';

type DocumentOutcome = 'ACCEPTED' | 'UNCHANGED';

const shortId = (prefix: string) => `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

// MySQL zwraca ResultSetHeader (obiekt), SQLite w db.ts — tablicę z jednym wierszem.
const affectedRows = (result: any): number => Number(result?.affectedRows ?? result?.[0]?.affectedRows ?? 0);

/** Rejestruje odebraną stronę w subiekt_sync_runs (pierwsza strona tworzy wiersz uruchomienia). */
async function registerPage(request: SubiektSyncRequest): Promise<void> {
    const bump = () =>
        query<any>(
            'UPDATE subiekt_sync_runs SET pages_received = pages_received + 1, pages_expected = ? WHERE id = ?',
            [request.pages, request.run_id]
        );

    if (affectedRows(await bump()) > 0) return;

    try {
        await query(
            `INSERT INTO subiekt_sync_runs (id, agent_version, pages_received, pages_expected, status)
             VALUES (?, ?, 1, ?, 'RUNNING')`,
            [request.run_id, request.agent_version, request.pages]
        );
    } catch (error) {
        // Równoległa strona tego samego uruchomienia zdążyła wstawić wiersz — dolicz stronę do niego.
        if (affectedRows(await bump()) === 0) throw error;
    }
}

/** Dolicza liczniki strony; po ostatniej oczekiwanej stronie zamyka uruchomienie. */
async function finishPage(runId: string, response: SubiektSyncResponse): Promise<void> {
    await query(
        `UPDATE subiekt_sync_runs SET
            documents_accepted = documents_accepted + ?,
            documents_unchanged = documents_unchanged + ?,
            documents_rejected = documents_rejected + ?,
            documents_unassigned = documents_unassigned + ?,
            status = CASE WHEN pages_received >= pages_expected THEN 'DONE' ELSE status END,
            finished_at = CASE WHEN pages_received >= pages_expected THEN CURRENT_TIMESTAMP ELSE finished_at END
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

/** Zapis jednego dokumentu (wywoływany wewnątrz withTransaction). */
async function upsertDocument(doc: SubiektDocumentPayload, runId: string): Promise<DocumentOutcome> {
    const contentHash = hashDocument(doc);
    const positionsJson = JSON.stringify(doc.positions);
    const isPaid = doc.is_paid ? 1 : 0;

    const [existing] = await query<{ id: string; content_hash: string }>(
        'SELECT id, content_hash FROM subiekt_documents WHERE external_id = ?',
        [doc.external_id]
    );

    if (!existing) {
        const id = shortId('sd');
        await query(
            `INSERT INTO subiekt_documents (
                id, external_id, type, number, issued_at, contractor_name, contractor_nip, architect_code,
                architect_id, parent_external_id, root_external_id, project_id, net_total, gross_total, is_paid,
                remarks, content_hash, positions_json, assignment_status, assignment_note, last_run_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, 'UNASSIGNED', 'MAPPING_NOT_ENABLED', ?)`,
            [
                id, doc.external_id, doc.type, doc.number, doc.issued_at, doc.contractor_name, doc.contractor_nip,
                doc.architect_code, doc.parent_external_id, doc.net_total, doc.gross_total, isPaid, doc.remarks,
                contentHash, positionsJson, runId,
            ]
        );
        await insertSnapshot(id, runId, contentHash, positionsJson, doc.net_total);
        return 'ACCEPTED';
    }

    if (existing.content_hash === contentHash) {
        // Zapłata nie wchodzi do hasha (to nie zmiana treści), ale ma się aktualizować.
        await query(
            'UPDATE subiekt_documents SET last_seen_at = CURRENT_TIMESTAMP, last_run_id = ?, is_paid = ? WHERE id = ?',
            [runId, isPaid, existing.id]
        );
        return 'UNCHANGED';
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
    return 'ACCEPTED';
}

/**
 * Przetwarza jedną stronę paczki: run → dokumenty (każdy we własnej transakcji) → liczniki runu.
 * Błąd pojedynczego dokumentu trafia do `rejected` (INTERNAL_ERROR:<komunikat>), reszta strony idzie dalej.
 * Wołać poza transakcją (zob. komentarz na górze pliku).
 */
export async function processSyncPage(request: SubiektSyncRequest): Promise<SubiektSyncResponse> {
    await registerPage(request);

    const response: SubiektSyncResponse = {
        run_id: request.run_id,
        accepted: 0,
        unchanged: 0,
        rejected: [],
        unassigned: 0,
    };

    // Kolejność wejściowa; sortowanie po typie dokumentu (ZK przed FS) dochodzi w loopie 2.
    for (const doc of request.documents) {
        try {
            const outcome = await withTransaction(() => upsertDocument(doc, request.run_id));
            if (outcome === 'ACCEPTED') response.accepted++;
            else response.unchanged++;
            // Loop 1: bez mapowania każdy przyjęty dokument czeka w skrzynce nieprzypisanych.
            response.unassigned++;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[subiekt] Błąd zapisu dokumentu', { run_id: request.run_id, external_id: doc.external_id, error });
            response.rejected.push({ external_id: doc.external_id, reason: `INTERNAL_ERROR:${message}` });
        }
    }

    await finishPage(request.run_id, response);
    return response;
}
