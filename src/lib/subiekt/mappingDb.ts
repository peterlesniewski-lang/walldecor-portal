// Mapowanie zapisanego dokumentu Subiekta na architekta, projekt i pozycje (PLAN-SUBIEKT-2026-10-29.md, 2.4).
// Wołane z processDocument (sync.ts) WEWNĄTRZ transakcji dokumentu: każdy błąd ma propagować do jej granicy
// (brak savepointów — zob. db.ts), więc tu nic nie łapiemy. Pozycje i prowizje zmieniamy wyłącznie przez
// rdzeń src/lib/projectItems.ts (addItemCore / updateItemAmountCore / deleteItemCore).
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/db';
import { logActivity } from '@/lib/services';
import { addItemCore, deleteItemCore, updateItemAmountCore, type ItemActor } from '@/lib/projectItems';
import { buildItemInput, createsItems, leadingDocType, positionToItemType, resolveArchitectCode, resolveRoot } from './mapping';
import type { SubiektDocType, SubiektDocumentPayload, SubiektPositionPayload } from './types';

export type UpsertOutcome = 'INSERTED' | 'UNCHANGED' | 'CHANGED';
/** Wynik dla liczników strony: ASSIGNED = AUTO lub MANUAL, UNASSIGNED = skrzynka, IGNORED = odrzucony przez admina. */
export type AssignmentResult = 'ASSIGNED' | 'UNASSIGNED' | 'IGNORED';

interface StoredDoc {
    id: string;
    external_id: number;
    type: SubiektDocType;
    number: string;
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
}

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

const MAX_CHAIN_STEPS = 32;
const MAX_LABEL_LENGTH = 200; // jak walidacja nazwy / klienta w createProject
const EPSILON = 0.005;

const ASSIGNED_STATUSES = "('AUTO', 'MANUAL')";

async function loadDocById(id: string): Promise<StoredDoc> {
    const [row] = await query<StoredDoc>('SELECT * FROM subiekt_documents WHERE id = ?', [id]);
    if (!row) throw new Error(`Dokument Subiekta ${id} nie istnieje`);
    return row;
}

async function loadDocByExternalId(externalId: number): Promise<StoredDoc | undefined> {
    const [row] = await query<StoredDoc>('SELECT * FROM subiekt_documents WHERE external_id = ?', [externalId]);
    return row;
}

/** Wiersz z bazy → payload (dla buildItemInput i pozycji z positions_json). */
function rowToPayload(row: StoredDoc): SubiektDocumentPayload {
    return {
        external_id: Number(row.external_id),
        type: row.type,
        number: row.number,
        issued_at: String(row.issued_at),
        contractor_name: row.contractor_name,
        contractor_nip: row.contractor_nip ?? null,
        architect_code: row.architect_code ?? null,
        parent_external_id: row.parent_external_id === null || row.parent_external_id === undefined ? null : Number(row.parent_external_id),
        net_total: Number(row.net_total),
        gross_total: Number(row.gross_total),
        is_paid: Number(row.is_paid) === 1,
        remarks: row.remarks ?? null,
        positions: JSON.parse(row.positions_json) as SubiektPositionPayload[],
    };
}

// --- a) architekt ---

type ArchitectResolution = { architectId: string; code: string | null } | { architectId: null; code: string | null; note: string };

async function resolveArchitect(doc: SubiektDocumentPayload): Promise<ArchitectResolution> {
    const code = resolveArchitectCode(doc);
    if (code) {
        const [user] = await query<{ id: string }>("SELECT id FROM users WHERE subiekt_code = ? AND role = 'ARCHI'", [code]);
        return user ? { architectId: user.id, code } : { architectId: null, code, note: `UNKNOWN_ARCHITECT_CODE:${code}` };
    }
    if (doc.parent_external_id !== null) {
        // Dokument pochodny bez kodu dziedziczy architekta po rodzicu (strona jest posortowana, więc rodzic
        // z tej samej strony jest już zapisany). Nieznany rodzic lub rodzic bez architekta = brak architekta.
        const [parent] = await query<{ architect_id: string | null; architect_code: string | null }>(
            'SELECT architect_id, architect_code FROM subiekt_documents WHERE external_id = ?',
            [doc.parent_external_id]
        );
        if (parent?.architect_id) return { architectId: parent.architect_id, code: parent.architect_code ?? null };
    }
    return { architectId: null, code: null, note: 'NO_ARCHITECT' };
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

async function createProjectForRoot(root: StoredDoc, architectId: string): Promise<string> {
    const projectId = `p_${uuidv4().replace(/-/g, '').slice(0, 8)}`;
    const suffix = ` — ${root.number}`;
    const name = truncate(root.contractor_name, Math.max(1, MAX_LABEL_LENGTH - suffix.length)) + suffix;
    await query(
        `INSERT INTO projects (id, owner_id, name, client_label, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PRZYJĘTY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [projectId, architectId, truncate(name, MAX_LABEL_LENGTH), truncate(root.contractor_name, MAX_LABEL_LENGTH)]
    );
    await query('UPDATE subiekt_documents SET project_id = ? WHERE id = ?', [projectId, root.id]);
    await logActivity(null, 'SUBIEKT_PROJECT_CREATED', `Subiekt: utworzono projekt „${name}” z dokumentu ${root.number}`, {
        projectId, documentId: root.id, architectId,
    });
    return projectId;
}

// --- d) pozycje ---

async function loadItemsOfDocument(documentId: string): Promise<StoredItem[]> {
    return query<StoredItem>(
        `SELECT id, type, amount_net, description, order_number, invoice_number, is_paid, type_overridden, subiekt_position_id
         FROM project_items WHERE subiekt_document_id = ? AND source = 'SUBIEKT' ORDER BY id`,
        [documentId]
    );
}

/**
 * Usuwa pozycję przez rdzeń. W projekcie ZAKOŃCZONY rdzeń zostawia pozycję z kwotą 0 (korekta) — taką
 * pozycję pomijamy, żeby każdy kolejny sync nie dopisywał pustej korekty do logu.
 */
async function removeItem(item: Pick<StoredItem, 'id' | 'amount_net'>, projectStatus: string, actor: ItemActor) {
    if (projectStatus === 'ZAKOŃCZONY' && Math.abs(Number(item.amount_net)) < EPSILON) return;
    await deleteItemCore(item.id, actor);
}

/** Ustawia kwotę pozycji: ≤ 0 → usunięcie (addItemCore/rdzeń nie trzyma pozycji z Subiekta z kwotą 0), inna → korekta. */
async function setItemAmount(item: Pick<StoredItem, 'id' | 'amount_net'>, amount: number, projectStatus: string, actor: ItemActor) {
    if (amount <= 0) return removeItem(item, projectStatus, actor);
    if (Math.abs(Number(item.amount_net) - amount) < EPSILON) return;
    await updateItemAmountCore(item.id, amount, actor);
}

/**
 * Korekty KFS projektu: ob_Id pozycji FS → kwota po korekcie. Późniejsza KFS (issued_at, external_id) wygrywa,
 * bo agent wysyła wartość po korekcie. Bierzemy KFS przypisane (AUTO/MANUAL) i opcjonalnie bieżącą.
 */
async function loadCorrections(projectId: string, includeDocumentId: string | null): Promise<Map<number, number>> {
    const rows = await query<StoredDoc>(
        `SELECT * FROM subiekt_documents
         WHERE type = 'KFS' AND project_id = ? AND (assignment_status IN ${ASSIGNED_STATUSES} OR id = ?)
         ORDER BY issued_at, external_id`,
        [projectId, includeDocumentId ?? '']
    );
    const corrections = new Map<number, number>();
    for (const row of rows) {
        for (const pos of JSON.parse(row.positions_json) as SubiektPositionPayload[]) {
            if (pos.corrects_position_external_id !== null && pos.corrects_position_external_id !== undefined) {
                corrections.set(pos.corrects_position_external_id, pos.net_total);
            }
        }
    }
    return corrections;
}

/**
 * Upsert pozycji jednego dokumentu wiodącego po kluczu (subiekt_document_id, subiekt_position_id):
 * nowa → addItemCore, zmieniona kwota → updateItemAmountCore, zniknęła z dokumentu → deleteItemCore.
 * Pola bez wpływu na prowizję (opis, numery, zapłata) odświeżamy bezpośrednim UPDATE. Typ istniejącej
 * pozycji się nie zmienia (type_overridden = decyzja admina; zmiana typu wymagałaby przeliczenia prowizji).
 */
async function syncDocumentItems(
    source: StoredDoc,
    project: { id: string; status: string },
    rootZkNumber: string | null,
    corrections: Map<number, number>,
    actor: ItemActor,
) {
    const payload = rowToPayload(source);
    const existing = await loadItemsOfDocument(source.id);
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

        const amount = corrections.get(pos.external_id) ?? pos.net_total;
        const item = byPosition.get(pos.external_id);
        if (!item) {
            // Pozycje z kwotą ≤ 0 (np. gratisy) nie są tworzone — addItemCore i tak by je odrzucił.
            if (amount > 0) {
                await addItemCore(project.id, buildItemInput(payload, { ...pos, net_total: amount }, {
                    subiektDocumentId: source.id, rootZkNumber,
                }), actor);
            }
            continue;
        }

        kept.add(item.id);
        const desired = buildItemInput(payload, { ...pos, net_total: amount }, {
            subiektDocumentId: source.id, rootZkNumber, forcedType: item.type,
        });
        if (!Number(item.type_overridden) && positionToItemType(pos) !== item.type) {
            console.warn('[subiekt] Typ pozycji z Subiekta zmienił się — zostawiamy dotychczasowy', {
                itemId: item.id, document: source.number, position: pos.external_id,
            });
        }

        await setItemAmount(item, amount, project.status, actor);
        if (amount <= 0) continue;

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

/** Pozycje łańcucha po przypisaniu dokumentu ZK/FS: dokument wiodący = wszystkie FS (pozycje ZK znikają) albo ZK. */
async function syncChainItems(current: StoredDoc, root: StoredDoc, project: { id: string; status: string }, actor: ItemActor) {
    // Łańcuch = dokumenty tego korzenia w tym projekcie, przypisane (AUTO/MANUAL) + bieżący.
    const chain = await query<StoredDoc>(
        `SELECT * FROM subiekt_documents
         WHERE root_external_id = ? AND project_id = ? AND (assignment_status IN ${ASSIGNED_STATUSES} OR id = ?)
         ORDER BY issued_at, external_id`,
        [root.external_id, project.id, current.id]
    );
    const rootZkNumber = root.type === 'ZK' ? root.number : null;
    const corrections = await loadCorrections(project.id, null);

    if (leadingDocType(chain.map((d) => d.type)) === 'FS') {
        for (const zk of chain.filter((d) => d.type === 'ZK')) {
            for (const item of await loadItemsOfDocument(zk.id)) await removeItem(item, project.status, actor);
        }
        // Pozycje FS przypisanych ręcznie (MANUAL) zostawiamy panelowi admina (loop 4).
        for (const fs of chain.filter((d) => d.type === 'FS' && (d.assignment_status === 'AUTO' || d.id === current.id))) {
            await syncDocumentItems(fs, project, rootZkNumber, corrections, actor);
        }
    } else if (current.type === 'ZK') {
        await syncDocumentItems(current, project, rootZkNumber, corrections, actor);
    }
}

/**
 * KFS: każda pozycja wskazuje (corrects_position_external_id) pozycję FS; dopasowana pozycja projektu dostaje
 * kwotę po korekcie. Wszystko albo nic: choć jedna niedopasowana → UNMATCHED_CORRECTION, pozycje FS bez zmian.
 */
async function applyCorrection(current: StoredDoc, project: { id: string; status: string }, actor: ItemActor): Promise<string | null> {
    const targets: Array<{ item: Pick<StoredItem, 'id' | 'amount_net'>; positionId: number }> = [];
    for (const pos of JSON.parse(current.positions_json) as SubiektPositionPayload[]) {
        if (pos.corrects_position_external_id === null || pos.corrects_position_external_id === undefined) return 'UNMATCHED_CORRECTION';
        const [item] = await query<Pick<StoredItem, 'id' | 'amount_net'>>(
            `SELECT i.id, i.amount_net FROM project_items i
             JOIN subiekt_documents d ON d.id = i.subiekt_document_id AND d.type = 'FS'
             WHERE i.project_id = ? AND i.source = 'SUBIEKT' AND i.subiekt_position_id = ?
             ORDER BY i.id LIMIT 1`,
            [project.id, pos.corrects_position_external_id]
        );
        if (!item) return 'UNMATCHED_CORRECTION';
        targets.push({ item, positionId: pos.corrects_position_external_id });
    }

    const corrections = await loadCorrections(project.id, current.id);
    for (const { item, positionId } of targets) {
        await setItemAmount(item, corrections.get(positionId)!, project.status, actor);
    }
    return null;
}

// --- zapis wyniku ---

async function saveAssignment(
    documentId: string,
    fields: {
        status: 'AUTO' | 'UNASSIGNED';
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

/**
 * Mapowanie jednego, już zapisanego dokumentu (reguły 2.4). Decyzje admina (MANUAL / IGNORED) wygrywają.
 * Dokument bez zmian i przypisany (AUTO) jest pomijany — odświeżamy tylko znacznik zapłaty jego pozycji;
 * bez zmian i nieprzypisany jest mapowany ponownie (rodzic lub kod architekta mogły dojść później).
 */
export async function mapDocument(doc: SubiektDocumentPayload, documentId: string, outcome: UpsertOutcome): Promise<AssignmentResult> {
    const current = await loadDocById(documentId);
    if (current.assignment_status === 'IGNORED') return 'IGNORED';
    if (current.assignment_status === 'MANUAL') return 'ASSIGNED';
    if (outcome === 'UNCHANGED' && current.assignment_status === 'AUTO') {
        // Zapłata nie wchodzi do hasha; is_paid pozycji nie wpływa na prowizję.
        await query(
            "UPDATE project_items SET is_paid = ? WHERE subiekt_document_id = ? AND source = 'SUBIEKT' AND is_paid <> ?",
            [Number(current.is_paid), current.id, Number(current.is_paid)]
        );
        return 'ASSIGNED';
    }

    const unassigned = async (note: string, extra: { architectCode: string | null; architectId: string | null; rootExternalId: number | null; projectId?: string | null }) => {
        await saveAssignment(current.id, { status: 'UNASSIGNED', note, ...extra, projectId: extra.projectId ?? null });
        return 'UNASSIGNED' as const;
    };

    // a) architekt, b) korzeń (zapamiętany także dla nieprzypisanych — ułatwia ręczne przypisanie)
    const architect = await resolveArchitect(doc);
    const root = await findRoot(current.external_id);
    const rootExternalId = root ? Number(root.external_id) : null;
    if ('note' in architect) {
        return unassigned(architect.note, { architectCode: architect.code, architectId: null, rootExternalId });
    }
    const located = { architectCode: architect.code, architectId: architect.architectId, rootExternalId };
    if (!root) return unassigned('NO_ROOT_DOCUMENT', located);

    // c) projekt: dokument zostaje w swoim projekcie; inaczej projekt korzenia; korzeń bez projektu tworzy go sam.
    let projectId = current.project_id ?? root.project_id;
    if (current.project_id && root.project_id && current.project_id !== root.project_id) {
        console.warn('[subiekt] Dokument jest w innym projekcie niż korzeń łańcucha — nie przenosimy', {
            document: current.number, projectId: current.project_id, rootProjectId: root.project_id,
        });
    }
    if (!projectId) {
        if (root.id !== current.id) return unassigned('ROOT_UNASSIGNED', located);
        projectId = await createProjectForRoot(current, architect.architectId);
    }

    const [project] = await query<{ id: string; status: string; owner_id: string }>(
        'SELECT id, status, owner_id FROM projects WHERE id = ?',
        [projectId]
    );
    if (!project) throw new Error(`Projekt ${projectId} dokumentu ${current.number} nie istnieje`);
    if (project.owner_id !== architect.architectId) {
        console.warn('[subiekt] Architekt dokumentu różni się od właściciela projektu — projekt bez zmian (decyzja admina)', {
            document: current.number, projectId, ownerId: project.owner_id, architectId: architect.architectId,
        });
    }
    if (project.status === 'NIEZREALIZOWANY') return unassigned('PROJECT_CANCELLED', { ...located, projectId });

    await saveAssignment(current.id, { status: 'AUTO', note: null, ...located, projectId });

    // d) pozycje (WZ i FP nigdy ich nie tworzą)
    const actor: ItemActor = { actorId: null, note: `Subiekt: ${doc.type} ${doc.number}` };
    const stored = await loadDocById(current.id);
    if (stored.type === 'KFS') {
        const note = await applyCorrection(stored, project, actor);
        // Niedopasowana korekta zostaje przy projekcie (project_id, root) — admin widzi ją w skrzynce.
        if (note) return unassigned(note, { ...located, projectId });
    } else if (createsItems(stored.type)) {
        await syncChainItems(stored, root.id === stored.id ? stored : root, project, actor);
    }
    return 'ASSIGNED';
}
