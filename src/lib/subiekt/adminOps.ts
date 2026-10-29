// Operacje panelu admina na dokumentach Subiekta i projektach (PLAN-SUBIEKT-2026-10-29.md, Loop 4).
// Czyste operacje na bazie, bez sesji i bez cache Next.js: server actions w src/app/actions/subiekt.ts
// sprawdzają sesję i uprawnienia, wołają funkcję stąd i odświeżają widoki. Dzięki temu da się je testować
// integracyjnie na SQLite.
//
// Każda operacja to JEDNA withTransaction (wołać poza transakcją). Pozycje i prowizje zmieniają się
// wyłącznie przez rdzeń src/lib/projectItems.ts — także pośrednio, przez syncChainItems / clearChainItems.
// Zasada z loopa 2 obowiązuje dalej: admin decyduje o PRZYPISANIU (MANUAL / IGNORED), Subiekt o TREŚCI.
import { query, withTransaction } from '@/lib/db';
import { logActivity } from '@/lib/services';
import { addItemCore, deleteItemCore, updateItemAmountCore, type ItemActor } from '@/lib/projectItems';
import { sortDocumentsForProcessing, subiektCategory } from './mapping';
import { insertProjectForDocument, kfsMatchesProject, remapDocument, resyncProjectInvoices, syncChainItems } from './mappingDb';
import { clearChainItems, clearDocumentItems } from './chainOps';
import type { SuggestedStatus } from './status';
import type { SubiektDocType } from './types';

interface DocRow {
    id: string;
    external_id: number;
    type: SubiektDocType;
    number: string;
    issued_at: string;
    contractor_name: string;
    architect_id: string | null;
    parent_external_id: number | null;
    root_external_id: number | null;
    project_id: string | null;
    assignment_status: string;
    assignment_note: string | null;
}

interface ProjectRow { id: string; name: string; status: string; owner_id: string }

export interface AdminOpResult {
    /** Projekty, których widoki trzeba odświeżyć (docelowy + projekty, z których coś zabrano). */
    affectedProjectIds: string[];
}

const ASSIGNED = new Set(['AUTO', 'MANUAL']);
const CLOSED_STATUSES = new Set(['ZAKOŃCZONY', 'NIEZREALIZOWANY']);
const MAX_NOTE_LENGTH = 500;
const MAX_MERGE_SOURCES = 20;

const ROOT_IGNORED = 'ROOT_IGNORED';
const isRootType = (type: SubiektDocType) => type === 'ZK' || type === 'FP';
const isRootIgnored = (doc: Pick<DocRow, 'assignment_status' | 'assignment_note'>) =>
    doc.assignment_status === 'IGNORED' && doc.assignment_note === ROOT_IGNORED;
const toNumberOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const unique = (ids: Array<string | null | undefined>) => [...new Set(ids.filter((id): id is string => Boolean(id)))];

const normalizeDoc = (row: DocRow): DocRow => ({
    ...row,
    external_id: Number(row.external_id),
    issued_at: String(row.issued_at),
    root_external_id: toNumberOrNull(row.root_external_id),
    parent_external_id: toNumberOrNull(row.parent_external_id),
});

async function loadDoc(documentId: string): Promise<DocRow> {
    const [row] = await query<DocRow>('SELECT * FROM subiekt_documents WHERE id = ?', [documentId]);
    if (!row) throw new Error('Dokument nie istnieje.');
    return normalizeDoc(row);
}

async function loadDocByExternalId(externalId: number): Promise<DocRow | undefined> {
    const [row] = await query<DocRow>('SELECT * FROM subiekt_documents WHERE external_id = ?', [externalId]);
    return row ? normalizeDoc(row) : undefined;
}

async function loadProject(projectId: string): Promise<ProjectRow> {
    const [row] = await query<ProjectRow>('SELECT id, name, status, owner_id FROM projects WHERE id = ?', [projectId]);
    if (!row) throw new Error('Projekt nie istnieje.');
    return row;
}

/**
 * Przenosi dokument (a gdy trzeba — cały jego łańcuch) do projektu `target`:
 * 1. Łańcuch = wszystkie dokumenty korzenia, gdy dokument jest korzeniem albo korzeń jest poza projektem
 *    docelowym; inaczej (korzeń już w projekcie) tylko sam dokument. Zignorowane dokumenty łańcucha (poza
 *    wskazanym) zostają, jak są.
 * 2. Pozycje przenoszonych dokumentów znikają ze starych projektów (clearChainItems / clearDocumentItems).
 * 3. Wskazany dokument, korzeń i dokumenty łańcucha już przypisane (AUTO/MANUAL) → MANUAL w projekcie
 *    docelowym (architekt pusty → właściciel projektu, żeby dokumenty pochodne bez kodu go odziedziczyły).
 *    Pozostałe nieprzypisane dokumenty łańcucha tracą stary projekt i przechodzą zwykłe reguły mapowania
 *    (remapDocument) po przeniesieniu korzenia — np. FS z kodem innego architekta zostaje w skrzynce
 *    (OWNER_MISMATCH), a KFS trafia do mapy korekt tylko wtedy, gdy pasuje do faktur projektu.
 *    Korzeń innego architekta (lub w jego projekcie) blokuje przeniesienie całego łańcucha. Dokumenty
 *    zignorowane razem z korzeniem (ROOT_IGNORED) wracają tą samą drogą — przypisanie korzenia je przywraca.
 * 4. Pozycje odtwarzane w projekcie docelowym (syncChainItems), faktury starych projektów resynchronizowane
 *    (korekty KFS, które odeszły z łańcuchem). Zwraca stare projekty.
 */
async function reassignChain(selected: DocRow, target: ProjectRow, actor: ItemActor): Promise<string[]> {
    const rootExternalId = isRootType(selected.type) ? selected.external_id : selected.root_external_id;
    const rootRow = rootExternalId === null ? undefined
        : rootExternalId === selected.external_id ? selected : await loadDocByExternalId(rootExternalId);
    const wholeChain = rootExternalId !== null && rootRow !== undefined && (rootRow.id === selected.id || rootRow.project_id !== target.id);

    if (wholeChain && rootRow.id !== selected.id && rootRow.assignment_status !== 'IGNORED') {
        const rootOwner = rootRow.project_id ? (await loadProject(rootRow.project_id)).owner_id : null;
        if ((rootRow.architect_id && rootRow.architect_id !== target.owner_id) || (rootOwner && rootOwner !== target.owner_id)) {
            throw new Error(`Dokument źródłowy ${rootRow.number} należy do innego architekta.`);
        }
    }

    const chain = wholeChain
        ? (await query<DocRow>(
            'SELECT * FROM subiekt_documents WHERE root_external_id = ? OR external_id = ? ORDER BY issued_at, external_id',
            [rootExternalId, rootExternalId]
        )).map(normalizeDoc)
        : [selected];
    if (!chain.some((d) => d.id === selected.id)) chain.push(selected);
    const moving = chain.filter((d) => d.id === selected.id || d.assignment_status !== 'IGNORED' || isRootIgnored(d));

    const oldProjectIds = unique(moving.map((d) => d.project_id)).filter((id) => id !== target.id);
    for (const projectId of oldProjectIds) {
        if (wholeChain) await clearChainItems(rootExternalId as number, projectId, actor);
        else await clearDocumentItems(selected.id, projectId, actor);
    }

    const toRemap: DocRow[] = [];
    for (const doc of moving) {
        if (doc.id === selected.id || doc.id === rootRow?.id || ASSIGNED.has(doc.assignment_status)) {
            await query(
                `UPDATE subiekt_documents SET project_id = ?, assignment_status = 'MANUAL', assignment_note = NULL,
                    root_external_id = COALESCE(root_external_id, ?), architect_id = COALESCE(architect_id, ?)
                 WHERE id = ?`,
                [target.id, rootExternalId, target.owner_id, doc.id]
            );
        } else {
            // ROOT_IGNORED (korzeń był zignorowany) wraca do skrzynki i dalej idzie zwykłymi regułami.
            await query(
                isRootIgnored(doc)
                    ? "UPDATE subiekt_documents SET project_id = NULL, assignment_status = 'UNASSIGNED', assignment_note = NULL WHERE id = ?"
                    : 'UPDATE subiekt_documents SET project_id = NULL WHERE id = ?',
                [doc.id]
            );
            toRemap.push(doc);
        }
    }

    if (selected.type === 'KFS' && !(await kfsMatchesProject(selected.id, target.id))) {
        throw new Error('Korekta nie pasuje do pozycji faktur tego projektu.');
    }

    await syncChainItems(selected.id, actor);
    for (const doc of sortDocumentsForProcessing(toRemap)) {
        await remapDocument(doc.id);
    }
    for (const projectId of oldProjectIds) await resyncProjectInvoices(projectId, actor);
    return oldProjectIds;
}

/**
 * Ręczne przypisanie dokumentu (ze skrzynki, zignorowanego albo już przypisanego — także ręcznie: nowa decyzja
 * admina zastępuje poprzednią; pozycje ze starego projektu sprząta reassignChain). Wymagania: projekt istnieje i nie jest NIEZREALIZOWANY, a gdy dokument zna
 * architekta — projekt należy do niego. Dokument bez architekta dostaje właściciela projektu (dokumenty
 * pochodne bez kodu odziedziczą go po nim). Korzeń bez root_external_id staje się korzeniem samego siebie.
 */
export async function assignDocumentToProjectOp(documentId: string, projectId: string, actorId: string): Promise<AdminOpResult & { projectName: string; documentNumber: string }> {
    return withTransaction(async () => {
        const doc = await loadDoc(documentId);
        if (ASSIGNED.has(doc.assignment_status) && doc.project_id === projectId) throw new Error('Dokument jest już w tym projekcie.');
        const project = await loadProject(projectId);
        if (project.status === 'NIEZREALIZOWANY') throw new Error('Nie można przypisać dokumentu do projektu niezrealizowanego.');
        if (doc.architect_id && doc.architect_id !== project.owner_id) throw new Error('Projekt należy do innego architekta.');

        const actor: ItemActor = { actorId, note: `Subiekt: przypisanie ${doc.number}` };
        const previous = await reassignChain(doc, project, actor);

        await logActivity(actorId, 'SUBIEKT_DOC_ASSIGNED', `Przypisano ${doc.number} do projektu ${project.name}`, {
            documentId, projectId, previousProjectIds: previous,
        }, documentId);
        return { affectedProjectIds: [projectId, ...previous], projectName: project.name, documentNumber: doc.number };
    });
}

/**
 * Nowy projekt z dokumentu ze skrzynki (np. NO_ARCHITECT, NO_ROOT_DOCUMENT) dla architekta wskazanego przez
 * admina — jak automatyczne tworzenie z ZK (nazwa „kontrahent — numer”, PRZYJĘTY). Dokument staje się
 * korzeniem (root_external_id = external_id), jego łańcuch idzie z nim. Dokument pochodny, którego korzeń
 * jest w bazie, i korekta KFS nie tworzą projektu (trzeba utworzyć z korzenia albo przypisać).
 */
export async function createProjectFromDocumentOp(documentId: string, ownerId: string, actorId: string): Promise<AdminOpResult & { projectId: string; projectName: string }> {
    return withTransaction(async () => {
        const [owner] = await query<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = ?', [ownerId]);
        if (!owner || owner.role !== 'ARCHI') throw new Error('Wybrany użytkownik nie jest architektem.');

        const doc = await loadDoc(documentId);
        if (ASSIGNED.has(doc.assignment_status)) throw new Error('Dokument jest już przypisany do projektu.');
        if (doc.type === 'KFS') throw new Error('Z korekty (KFS) nie można utworzyć projektu — przypisz ją do projektu faktury.');
        if (doc.architect_id && doc.architect_id !== ownerId) throw new Error('Dokument wskazuje innego architekta.');
        if (doc.root_external_id !== null && doc.root_external_id !== doc.external_id) {
            const root = await loadDocByExternalId(doc.root_external_id);
            if (root) {
                throw new Error(`Dokument pochodzi z ${root.number} — utwórz projekt z tego dokumentu albo przypisz go do istniejącego projektu.`);
            }
        }

        const { projectId, name } = await insertProjectForDocument(doc, ownerId);
        await query('UPDATE subiekt_documents SET root_external_id = ? WHERE id = ?', [doc.external_id, doc.id]);
        const project = await loadProject(projectId);
        const actor: ItemActor = { actorId, note: `Subiekt: projekt z ${doc.number}` };
        const previous = await reassignChain({ ...doc, root_external_id: doc.external_id }, project, actor);

        await logActivity(actorId, 'SUBIEKT_PROJECT_CREATED', `Utworzono projekt „${name}” z dokumentu ${doc.number}`, {
            projectId, documentId, architectId: ownerId,
        }, documentId);
        return { projectId, projectName: name, affectedProjectIds: [projectId, ...previous] };
    });
}

/**
 * Admin odrzuca dokument (np. duplikat testowy): IGNORED + notatka, project_id bez zmian. Pozycje dokumentu
 * znikają z projektu, a reszta łańcucha w projekcie jest odtwarzana (bez FS wraca ZK; korekty bez tej KFS).
 * Zignorowany korzeń (ZK/FP) zabiera ze sobą dokumenty łańcucha AUTO / nieprzypisane (ROOT_IGNORED), a nowe
 * dokumenty pochodne dziedziczą IGNORED w mapowaniu. Kolejna synchronizacja IGNORED pomija.
 */
export async function ignoreDocumentOp(documentId: string, note: string, actorId: string): Promise<AdminOpResult> {
    const reason = typeof note === 'string' ? note.trim() : '';
    if (!reason || reason.length > MAX_NOTE_LENGTH) throw new Error(`Podaj powód zignorowania (1–${MAX_NOTE_LENGTH} znaków).`);

    return withTransaction(async () => {
        const doc = await loadDoc(documentId);
        const actor: ItemActor = { actorId, note: `Subiekt: zignorowano ${doc.number}` };
        await query("UPDATE subiekt_documents SET assignment_status = 'IGNORED', assignment_note = ? WHERE id = ?", [reason, doc.id]);

        // Korzeń: dokumenty łańcucha AUTO / w skrzynce idą za nim (ROOT_IGNORED, bez projektu i pozycji);
        // MANUAL zostają — to osobna decyzja admina.
        const chainProjects: string[] = [];
        if (isRootType(doc.type)) {
            const chain = (await query<DocRow>(
                `SELECT * FROM subiekt_documents
                 WHERE root_external_id = ? AND id <> ? AND assignment_status IN ('AUTO', 'UNASSIGNED')`,
                [doc.external_id, doc.id]
            )).map(normalizeDoc);
            for (const child of chain) {
                if (child.project_id) {
                    await clearDocumentItems(child.id, child.project_id, actor);
                    chainProjects.push(child.project_id);
                }
                await query(
                    "UPDATE subiekt_documents SET assignment_status = 'IGNORED', assignment_note = ?, project_id = NULL WHERE id = ?",
                    [ROOT_IGNORED, child.id]
                );
            }
        }
        for (const projectId of unique(chainProjects).filter((id) => id !== doc.project_id)) {
            await resyncProjectInvoices(projectId, actor);
        }

        if (doc.project_id) {
            await clearDocumentItems(doc.id, doc.project_id, actor);
            const root = doc.root_external_id === null || doc.root_external_id === doc.external_id
                ? undefined : await loadDocByExternalId(doc.root_external_id);
            if (root && root.project_id === doc.project_id && ASSIGNED.has(root.assignment_status)) {
                await syncChainItems(root.id, actor);
            }
            await resyncProjectInvoices(doc.project_id, actor);
        }

        await logActivity(actorId, 'SUBIEKT_DOC_IGNORED', `Zignorowano dokument ${doc.number}: ${reason}`, {
            documentId, projectId: doc.project_id, note: reason,
        }, documentId);
        return { affectedProjectIds: unique([doc.project_id, ...chainProjects]) };
    });
}

/**
 * Łączy projekty źródłowe w docelowy: dokumenty, pozycje, prowizje (z kwotami i stawkami bez zmian), pliki
 * i odwołania cashbacku przechodzą do projektu docelowego, projekty źródłowe są usuwane. Wymagania: ten sam
 * architekt, żaden projekt ZAKOŃCZONY ani NIEZREALIZOWANY; projekt ZGŁOSZONY może być docelowym tylko dla
 * innych zgłoszonych. Pozycje PRODUCT ze zgłoszonych źródeł (bez prowizji) dostają PENDING przez rdzeń, gdy
 * cel jest już przyjęty. Pozycje ręczne zostają (decyzję o duplikatach podejmuje admin, pytanie 3 planu).
 * Historia ZK podąża za dokumentami (activity_logs.subject_id), więc logów nie przepisujemy.
 */
export async function mergeProjectsOp(targetProjectId: string, sourceProjectIds: string[], actorId: string): Promise<AdminOpResult> {
    const sources = Array.isArray(sourceProjectIds) ? unique(sourceProjectIds.map(String)) : [];
    if (sources.length === 0) throw new Error('Wybierz co najmniej jeden projekt do połączenia.');
    if (sources.length > MAX_MERGE_SOURCES) throw new Error(`Jednorazowo można połączyć najwyżej ${MAX_MERGE_SOURCES} projektów.`);
    if (sources.includes(targetProjectId)) throw new Error('Projektu nie można połączyć z nim samym.');

    return withTransaction(async () => {
        const target = await loadProject(targetProjectId);
        const sourceRows: ProjectRow[] = [];
        for (const id of sources) sourceRows.push(await loadProject(id));
        const all = [target, ...sourceRows];

        if (new Set(all.map((p) => p.owner_id)).size > 1) throw new Error('Łączyć można tylko projekty tego samego architekta.');
        if (all.some((p) => CLOSED_STATUSES.has(p.status))) throw new Error('Nie można łączyć projektów zakończonych ani niezrealizowanych.');
        if (target.status === 'ZGŁOSZONY' && sourceRows.some((p) => p.status !== 'ZGŁOSZONY')) {
            throw new Error('Projekt docelowy jest tylko zgłoszony — jako docelowy wybierz projekt przyjęty.');
        }

        const placeholders = sources.map(() => '?').join(', ');
        const needPending = target.status !== 'ZGŁOSZONY'
            ? await query<{ id: string; amount_net: number }>(
                `SELECT i.id, i.amount_net FROM project_items i JOIN projects p ON p.id = i.project_id
                 WHERE i.project_id IN (${placeholders}) AND p.status = 'ZGŁOSZONY' AND i.type = 'PRODUCT' AND i.amount_net > 0
                   AND NOT EXISTS (SELECT 1 FROM commissions c WHERE c.project_item_id = i.id)`,
                sources
            )
            : [];

        for (const table of ['subiekt_documents', 'project_items', 'commissions', 'project_files']) {
            await query(`UPDATE ${table} SET project_id = ? WHERE project_id IN (${placeholders})`, [target.id, ...sources]);
        }
        // Cashback zastosowany do projektu (spendCashback z reference_id = id projektu) wskazuje dalej istniejący projekt.
        await query(`UPDATE wallet_transactions SET reference_id = ? WHERE reference_id IN (${placeholders})`, [target.id, ...sources]);

        const actor: ItemActor = { actorId, note: `Połączenie projektów → ${target.name}` };
        for (const item of needPending) await updateItemAmountCore(item.id, Number(item.amount_net), actor);

        await query(`DELETE FROM projects WHERE id IN (${placeholders})`, sources);

        const sourceNames = sourceRows.map((p) => p.name);
        await logActivity(actorId, 'PROJECTS_MERGED', `Połączono projekty ${sourceNames.join(', ')} → ${target.name}`, {
            targetProjectId: target.id, sourceProjectIds: sources, sourceNames,
        }, target.id);
        return { affectedProjectIds: [target.id, ...sources] };
    });
}

/**
 * Przenosi łańcuch korzenia (ZK/FP) z jego projektu do innego projektu tego samego architekta: pozycje łańcucha
 * znikają ze starego projektu (w ZAKOŃCZONY korekta do 0 i odpięcie wiersza), dokumenty przechodzą jako MANUAL
 * i pozycje odtwarzają się w nowym projekcie (z prowizją wg jego statusu).
 */
export async function moveDocumentToProjectOp(documentId: string, targetProjectId: string, actorId: string): Promise<AdminOpResult> {
    return withTransaction(async () => {
        const doc = await loadDoc(documentId);
        if (!isRootType(doc.type)) throw new Error('Przenieść można tylko dokument źródłowy łańcucha (ZK lub FP).');
        if (doc.assignment_status === 'IGNORED') throw new Error('Dokument jest zignorowany.');
        if (!doc.project_id) throw new Error('Dokument nie jest przypisany do projektu.');
        if (doc.project_id === targetProjectId) throw new Error('Dokument jest już w tym projekcie.');
        const current = await loadProject(doc.project_id);
        const target = await loadProject(targetProjectId);
        if (target.status === 'NIEZREALIZOWANY') throw new Error('Nie można przenieść dokumentu do projektu niezrealizowanego.');
        if (target.owner_id !== current.owner_id) throw new Error('Projekt docelowy należy do innego architekta.');

        const actor: ItemActor = { actorId, note: `Subiekt: przeniesienie ${doc.number}` };
        await clearChainItems(doc.external_id, current.id, actor);
        const previous = await reassignChain(doc, target, actor);

        await logActivity(actorId, 'SUBIEKT_CHAIN_MOVED', `Przeniesiono ${doc.number} z projektu ${current.name} do ${target.name}`, {
            documentId, fromProjectId: current.id, toProjectId: target.id,
        }, documentId);
        return { affectedProjectIds: unique([target.id, current.id, ...previous]) };
    });
}

/**
 * Ręczna zmiana typu pozycji z Subiekta (Produkt ↔ Montaż), trwała dla kolejnych synchronizacji
 * (type_overridden = 1). Prowizja przez rdzeń: deleteItemCore starej pozycji (w toku: znika z PENDING;
 * ZAKOŃCZONY: korekta do 0 i odpięcie wiersza od dokumentu) + addItemCore z tymi samymi danymi i nowym typem
 * (PENDING / EARNED + cashback tylko dla PRODUCT). UWAGA: pozycja dostaje NOWE id (zwracane jako itemId).
 */
export async function overrideItemTypeOp(itemId: string, type: 'PRODUCT' | 'INSTALLATION', actorId: string): Promise<{ projectId: string; itemId: string; unchanged: boolean }> {
    if (type !== 'PRODUCT' && type !== 'INSTALLATION') throw new Error('Nieprawidłowy typ pozycji.');

    return withTransaction(async () => {
        const [item] = await query<any>(
            'SELECT i.*, p.status AS project_status FROM project_items i JOIN projects p ON p.id = i.project_id WHERE i.id = ?',
            [itemId]
        );
        if (!item) throw new Error('Pozycja nie istnieje.');
        if (item.source !== 'SUBIEKT') throw new Error('Typ można zmienić tylko dla pozycji z Subiekta.');
        if (!item.subiekt_document_id) throw new Error('Pozycja nie jest już powiązana z dokumentem Subiekta.');
        if (item.type === type) return { projectId: item.project_id, itemId, unchanged: true };
        if (item.project_status === 'NIEZREALIZOWANY') throw new Error('Nie można zmieniać pozycji projektu niezrealizowanego.');
        const amount = Number(item.amount_net);
        if (!(amount > 0)) throw new Error('Pozycja ma kwotę 0 — typu nie można zmienić.');

        const actor: ItemActor = { actorId, note: `Zmiana typu pozycji na ${type === 'PRODUCT' ? 'Produkt' : 'Montaż'}` };
        await deleteItemCore(item.id, actor);
        // ZAKOŃCZONY: wiersz został z kwotą 0 — odpinamy go, żeby sync widział tylko nową pozycję.
        await query('UPDATE project_items SET subiekt_document_id = NULL, subiekt_position_id = NULL WHERE id = ?', [item.id]);

        const { itemId: newItemId } = await addItemCore(item.project_id, {
            type,
            category: subiektCategory(type),
            description: item.description,
            amount_net: amount,
            order_number: item.order_number,
            invoice_number: item.invoice_number,
            is_paid: Number(item.is_paid) === 1,
            source: 'SUBIEKT',
            subiekt_document_id: item.subiekt_document_id,
            subiekt_position_id: toNumberOrNull(item.subiekt_position_id),
        }, actor);
        await query('UPDATE project_items SET type_overridden = 1 WHERE id = ?', [newItemId]);

        await logActivity(actorId, 'SUBIEKT_ITEM_TYPE_OVERRIDDEN', `Zmieniono typ pozycji „${item.description ?? newItemId}” z ${item.type} na ${type}`, {
            projectId: item.project_id, oldItemId: item.id, itemId: newItemId, from: item.type, to: type,
        }, item.subiekt_document_id);
        return { projectId: item.project_id, itemId: newItemId, unchanged: false };
    });
}

const STATUS_FLOW = ['ZGŁOSZONY', 'PRZYJĘTY', 'W_REALIZACJI', 'ZAKOŃCZONY'];

/**
 * Kolejne statusy, przez które trzeba przejść z `current` do sugerowanego `target` (każdy krok wykonuje
 * updateProjectStatus z jego walidacją przejść i finalizacją): naprzód krok po kroku
 * (ZGŁOSZONY → PRZYJĘTY → W_REALIZACJI → ZAKOŃCZONY), wstecz tylko W_REALIZACJI → PRZYJĘTY. Równe → [].
 */
export function nextStatusSteps(current: string, target: SuggestedStatus): string[] {
    if (current === target) return [];
    if (current === 'ZAKOŃCZONY') throw new Error('Projekt jest zakończony — jego status nie może się już zmienić.');
    if (current === 'NIEZREALIZOWANY') throw new Error('Projekt jest niezrealizowany — sugerowanego statusu nie można zastosować.');
    const from = STATUS_FLOW.indexOf(current);
    const to = STATUS_FLOW.indexOf(target);
    if (from === -1 || to === -1) throw new Error('Nieprawidłowy status projektu.');
    if (to > from) return STATUS_FLOW.slice(from + 1, to + 1);
    if (current === 'W_REALIZACJI' && target === 'PRZYJĘTY') return ['PRZYJĘTY'];
    throw new Error(`Niedozwolona zmiana statusu: ${current} → ${target}.`);
}
