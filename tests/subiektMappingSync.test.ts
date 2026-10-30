// Testy integracyjne mapowania dokumentów Subiekta (sync.ts → mappingDb.ts → rdzeń projectItems.ts) na
// tymczasowej bazie SQLite: prawdziwe wiersze w projects / project_items / commissions / subiekt_documents.
// Scenariusze z PLAN-SUBIEKT-2026-10-29.md, Loop 2, Krok 2 (+ sortowanie strony, IGNORED, ponowne mapowanie).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type SyncModule = typeof import('../src/lib/subiekt/sync');
type StatusModule = typeof import('../src/lib/subiekt/status');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const { processSyncPage }: SyncModule = await import(new URL('../src/lib/subiekt/sync.ts', import.meta.url).href);
const { computeSuggestedStatus, getProjectSubiektSummary }: StatusModule =
    await import(new URL('../src/lib/subiekt/status.ts', import.meta.url).href);
const db = testDb.db;

test.after(() => testDb.cleanup());

type Doc = import('../src/lib/subiekt/types').SubiektDocumentPayload;
type Pos = import('../src/lib/subiekt/types').SubiektPositionPayload;

const ARCHI_A = 'u_archi_a';
const ARCHI_B = 'u_archi_b';
// Architekt A bez obrotu i bez override → status Partner, stawka 10%.
const RATE_A = 0.10;
db.prepare("INSERT INTO users (id, name, email, role) VALUES ('u_admin', 'Admin', 'admin@test.local', 'ADMIN')").run();
db.prepare("INSERT INTO users (id, name, email, role, subiekt_code) VALUES (?, 'Architekt A', 'a@test.local', 'ARCHI', 'A-001')").run(ARCHI_A);
db.prepare("INSERT INTO users (id, name, email, role) VALUES (?, 'Architekt B', 'b@test.local', 'ARCHI')").run(ARCHI_B);
const ARCHI_C = 'u_archi_c';
db.prepare("INSERT INTO users (id, name, email, role, subiekt_code) VALUES (?, 'Architekt C', 'c@test.local', 'ARCHI', 'C-003')").run(ARCHI_C);

function pos(externalId: number, overrides: Partial<Pos> = {}): Pos {
    return {
        external_id: externalId, ordinal: 1, product_id: 77, name: 'Tapeta Test', quantity: 10, unit: 'szt',
        unit_price_net: 100, net_total: 1000, corrects_position_external_id: null, ...overrides,
    };
}

function doc(externalId: number, type: Doc['type'], overrides: Partial<Doc> = {}): Doc {
    const positions = overrides.positions ?? [pos(externalId * 10)];
    const net = positions.reduce((s, p) => s + p.net_total, 0);
    return {
        external_id: externalId, type, number: `${type} ${externalId}/10/2026`, issued_at: '2026-10-20',
        contractor_name: 'Jan Testowy', contractor_nip: null, architect_code: type === 'ZK' ? 'A-001' : null,
        parent_external_id: null, net_total: net, gross_total: Math.round(net * 123) / 100, is_paid: false,
        remarks: null, positions, ...overrides,
    };
}

const sync = (documents: Doc[]) =>
    processSyncPage({ run_id: randomUUID(), agent_version: '0.1.0', page: 1, pages: 1, documents });

function approx(actual: unknown, expected: number, message?: string) {
    assert.ok(Math.abs(Number(actual) - expected) < 0.005, `${message ?? 'kwota'}: ${actual} ≠ ${expected}`);
}

const docRow = (externalId: number) => db.prepare('SELECT * FROM subiekt_documents WHERE external_id = ?').get(externalId) as any;
const projectRow = (id: string) => db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
const itemsOfProject = (projectId: string) =>
    db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY subiekt_position_id').all(projectId) as any[];
const itemsOfDocument = (externalId: number) =>
    db.prepare('SELECT i.* FROM project_items i JOIN subiekt_documents d ON d.id = i.subiekt_document_id WHERE d.external_id = ?')
        .all(externalId) as any[];
const commissionsOfItem = (itemId: string) =>
    db.prepare('SELECT * FROM commissions WHERE project_item_id = ? ORDER BY rowid').all(itemId) as any[];
const pendingSum = (projectId: string) =>
    Number((db.prepare("SELECT COALESCE(SUM(amount_net), 0) AS s FROM commissions WHERE project_id = ? AND status = 'PENDING'").get(projectId) as any).s);
const projectCount = () => Number((db.prepare('SELECT COUNT(*) AS c FROM projects').get() as any).c);

test('1. ZK with A-001 → project PRZYJĘTY for A, 1 PRODUCT item from Subiekt, PENDING commission, AUTO', async () => {
    const response = await sync([doc(100, 'ZK')]);
    assert.deepEqual({ ...response, run_id: undefined }, { run_id: undefined, accepted: 1, unchanged: 0, rejected: [], unassigned: 0 });

    const row = docRow(100);
    assert.equal(row.assignment_status, 'AUTO');
    assert.equal(row.assignment_note, null);
    assert.equal(row.architect_id, ARCHI_A);
    assert.equal(row.architect_code, 'A-001');
    assert.equal(row.root_external_id, 100);
    assert.match(row.project_id, /^p_[0-9a-f]{8}$/);

    const project = projectRow(row.project_id);
    assert.equal(project.owner_id, ARCHI_A);
    assert.equal(project.status, 'PRZYJĘTY');
    assert.equal(project.client_label, 'Jan Testowy');
    assert.equal(project.name, 'Jan Testowy — ZK 100/10/2026');
    assert.ok(project.created_at && project.updated_at);

    const items = itemsOfProject(row.project_id);
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'PRODUCT');
    assert.equal(items[0].source, 'SUBIEKT');
    assert.equal(items[0].category, 'Produkt (Subiekt)');
    assert.equal(items[0].subiekt_document_id, row.id);
    assert.equal(items[0].subiekt_position_id, 1000);
    assert.equal(items[0].order_number, 'ZK 100/10/2026');
    assert.equal(items[0].invoice_number, null);
    approx(items[0].amount_net, 1000);

    const comms = commissionsOfItem(items[0].id);
    assert.equal(comms.length, 1);
    assert.equal(comms[0].status, 'PENDING');
    assert.equal(comms[0].architect_id, ARCHI_A);
    approx(comms[0].amount_net, 1000 * RATE_A);
    assert.equal(comms[0].note, 'Subiekt: ZK 100/10/2026', 'numer z GT ma już prefiks typu');

    const created = db.prepare("SELECT * FROM activity_logs WHERE event_type = 'SUBIEKT_PROJECT_CREATED'").all() as any[];
    assert.equal(created.length, 1);
    assert.equal(created[0].user_id, null);
});

test('2. same ZK re-sent with quantity 10 → 8 → same item, amount 800, PENDING recalculated, still 1 item', async () => {
    const before = itemsOfDocument(100);
    const projectsBefore = projectCount();
    const edited = doc(100, 'ZK', { positions: [pos(1000, { quantity: 8, net_total: 800 })] });
    const response = await sync([edited]);
    assert.equal(response.accepted, 1);
    assert.equal(response.unassigned, 0);

    const after = itemsOfDocument(100);
    assert.equal(after.length, 1);
    assert.equal(after[0].id, before[0].id);
    approx(after[0].amount_net, 800);
    const comms = commissionsOfItem(after[0].id);
    assert.equal(comms.length, 1);
    approx(comms[0].amount_net, 800 * RATE_A);
    assert.equal(projectCount(), projectsBefore, 'bez nowego projektu');
});

test('3. ZK with a one-off second position → 1 PRODUCT + 1 INSTALLATION without commission', async () => {
    await sync([doc(200, 'ZK', { positions: [pos(2001), pos(2002, { ordinal: 2, product_id: null, name: 'Montaż', net_total: 500 })] })]);
    const items = itemsOfProject(docRow(200).project_id);
    assert.deepEqual(items.map((i) => i.type), ['PRODUCT', 'INSTALLATION']);
    assert.equal(items[1].category, 'Montaż (Subiekt)');
    assert.equal(commissionsOfItem(items[0].id).length, 1);
    assert.equal(commissionsOfItem(items[1].id).length, 0);
});

test('4. FS for the ZK with another amount (750 vs ZK 800) → loop 5b RECONCILE: ZK item stays with the invoice number, OPEN reconciliation', async () => {
    const zkItem = itemsOfDocument(100)[0];
    const projectId = docRow(100).project_id;
    const fs = doc(110, 'FS', { parent_external_id: 100, positions: [pos(1100, { quantity: 7.5, net_total: 750 })] });
    const response = await sync([fs]);
    assert.equal(response.unassigned, 0);

    const row = docRow(110);
    assert.equal(row.assignment_status, 'AUTO');
    assert.equal(row.project_id, projectId);
    assert.equal(row.architect_id, ARCHI_A, 'architekt odziedziczony po ZK');
    assert.equal(row.root_external_id, 100);

    // FS nie odzwierciedla ZK (inna kwota), sumy się różnią → pozycje z ZK do czasu uzgodnienia przez admina
    // (FS, która odzwierciedla ZK, zastępuje pozycje ZK — test 13 i tests/subiektReconcileSync.test.ts).
    const items = itemsOfProject(projectId);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, zkItem.id, 'pozycja ZK zostaje');
    assert.equal(items[0].invoice_number, 'FS 110/10/2026');
    assert.equal(items[0].order_number, 'ZK 100/10/2026');
    approx(items[0].amount_net, 800);
    assert.equal(itemsOfDocument(110).length, 0, 'bez pozycji z FS');
    assert.equal(commissionsOfItem(zkItem.id).length, 1);
    approx(pendingSum(projectId), 800 * RATE_A, 'PENDING z ZK');
    const reconciliation = db.prepare('SELECT * FROM subiekt_reconciliations WHERE project_id = ?').get(projectId) as any;
    assert.equal(reconciliation.status, 'OPEN');
    approx(reconciliation.invoiced_net, 750);
});

test('5. FS without parent and without code → UNASSIGNED NO_ARCHITECT, no project, no items', async () => {
    const projectsBefore = projectCount();
    const response = await sync([doc(300, 'FS')]);
    assert.equal(response.accepted, 1);
    assert.equal(response.unassigned, 1);
    const row = docRow(300);
    assert.equal(row.assignment_status, 'UNASSIGNED');
    assert.equal(row.assignment_note, 'NO_ARCHITECT');
    assert.equal(row.project_id, null);
    assert.equal(projectCount(), projectsBefore);
    assert.equal(itemsOfDocument(300).length, 0);
});

test('6. FS with unknown code Z-999 → UNASSIGNED UNKNOWN_ARCHITECT_CODE:Z-999', async () => {
    const response = await sync([doc(310, 'FS', { architect_code: 'z-999' })]);
    assert.equal(response.unassigned, 1);
    const row = docRow(310);
    assert.equal(row.assignment_status, 'UNASSIGNED');
    assert.equal(row.assignment_note, 'UNKNOWN_ARCHITECT_CODE:Z-999');
    assert.equal(row.architect_code, 'Z-999');
    assert.equal(row.architect_id, null);
    assert.equal(itemsOfDocument(310).length, 0);
});

test('FS with code but without any root (no parent) → NO_ROOT_DOCUMENT; ZK of an architect without account mapping → ROOT_UNASSIGNED for its FS', async () => {
    await sync([doc(320, 'FS', { architect_code: 'A-001' })]);
    assert.equal(docRow(320).assignment_note, 'NO_ROOT_DOCUMENT');

    const response = await sync([doc(330, 'ZK', { architect_code: 'X-1' }), doc(331, 'FS', { parent_external_id: 330, architect_code: 'A-001' })]);
    assert.equal(response.unassigned, 2);
    assert.equal(docRow(330).assignment_note, 'UNKNOWN_ARCHITECT_CODE:X-1');
    assert.equal(docRow(331).assignment_note, 'ROOT_UNASSIGNED');
    assert.equal(docRow(331).root_external_id, 330);
});

test('7. FS before its ZK: NO_ROOT_DOCUMENT, then ZK arrives and the unchanged FS is re-mapped to AUTO with items', async () => {
    const fs = doc(410, 'FS', { parent_external_id: 400, architect_code: 'A-001' });
    const first = await sync([fs]);
    assert.equal(first.unassigned, 1);
    assert.equal(docRow(410).assignment_note, 'NO_ROOT_DOCUMENT');

    const second = await sync([doc(400, 'ZK')]);
    assert.equal(second.unassigned, 0);
    const projectId = docRow(400).project_id;
    assert.equal(itemsOfDocument(400).length, 1, 'ZK bez FS w łańcuchu (FS jeszcze nieprzypisana) ma pozycje');

    const third = await sync([fs]);
    assert.deepEqual([third.accepted, third.unchanged, third.unassigned], [0, 1, 0]);
    const row = docRow(410);
    assert.equal(row.assignment_status, 'AUTO');
    assert.equal(row.project_id, projectId);
    assert.equal(itemsOfDocument(410).length, 1);
    assert.equal(itemsOfDocument(400).length, 0, 'pozycje ZK zastąpione fakturowymi');
});

test('8. KFS on a ZAKOŃCZONY project (loop 6 step 8): FS mirrors the ZK → MIRROR, FS item 1000 → 800, negative EARNED correction, no reconciliation', async (t) => {
    t.mock.method(console, 'warn', () => {});
    await sync([doc(500, 'ZK'), doc(510, 'FS', { parent_external_id: 500, positions: [pos(5100)] })]);
    const projectId = docRow(500).project_id;
    const [item] = itemsOfDocument(510);
    approx(item.amount_net, 1000);

    // Rozliczenie projektu jak w updateProjectStatus: status + PENDING → EARNED.
    db.prepare("UPDATE projects SET status = 'ZAKOŃCZONY' WHERE id = ?").run(projectId);
    db.prepare("UPDATE commissions SET status = 'EARNED' WHERE project_id = ? AND status = 'PENDING'").run(projectId);

    const kfs = doc(520, 'KFS', {
        parent_external_id: 510, net_total: -200,
        positions: [pos(5200, { quantity: 8, net_total: 800, corrects_position_external_id: 5100 })],
    });
    const response = await sync([kfs]);
    assert.equal(response.unassigned, 0);
    const row = docRow(520);
    assert.equal(row.assignment_status, 'AUTO');
    assert.equal(row.project_id, projectId);
    assert.equal(row.root_external_id, 500);

    // FS (przed korektą) odzwierciedla ZK → MIRROR (loop 5b): korekta trafia w pozycję FS, uzgodnienie się nie otwiera.
    const after = itemsOfDocument(510);
    assert.equal(after.length, 1);
    approx(after[0].amount_net, 800);
    assert.equal(itemsOfDocument(500).length, 0, 'pozycje ZK nie wracają');
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM subiekt_reconciliations WHERE project_id = ?').get(projectId).c, 0);
    const comms = commissionsOfItem(item.id);
    assert.equal(comms.length, 2);
    assert.equal(comms[1].status, 'EARNED');
    approx(comms[1].amount_net, -200 * RATE_A, 'korekta ujemna');
    approx(comms.reduce((s, c) => s + Number(c.amount_net), 0), 800 * RATE_A);
    assert.equal(itemsOfDocument(520).length, 0, 'KFS nie tworzy własnych pozycji');

    // FS wysłana ponownie ze zmianą (np. opis) nie cofa korekty KFS.
    await sync([doc(510, 'FS', { parent_external_id: 500, positions: [pos(5100, { name: 'Tapeta Test v2' })] })]);
    const resynced = itemsOfDocument(510);
    approx(resynced[0].amount_net, 800, 'kwota po korekcie zostaje');
    assert.equal(resynced[0].description, 'Tapeta Test v2');
    assert.equal(commissionsOfItem(item.id).length, 2, 'bez nowych korekt');
});

test('8b. KFS on a ZAKOŃCZONY project without ZK (FP root, INVOICE_ONLY): FS item 1000 → 800 and a negative EARNED correction', async (t) => {
    t.mock.method(console, 'warn', () => {});
    await sync([doc(540, 'FP', { architect_code: 'A-001' }), doc(550, 'FS', { parent_external_id: 540, positions: [pos(5500)] })]);
    const projectId = docRow(540).project_id;
    const [item] = itemsOfDocument(550);
    approx(item.amount_net, 1000);

    // Rozliczenie projektu jak w updateProjectStatus: status + PENDING → EARNED.
    db.prepare("UPDATE projects SET status = 'ZAKOŃCZONY' WHERE id = ?").run(projectId);
    db.prepare("UPDATE commissions SET status = 'EARNED' WHERE project_id = ? AND status = 'PENDING'").run(projectId);

    const kfs = doc(560, 'KFS', {
        parent_external_id: 550, net_total: -200,
        positions: [pos(5600, { quantity: 8, net_total: 800, corrects_position_external_id: 5500 })],
    });
    const response = await sync([kfs]);
    assert.equal(response.unassigned, 0);
    const row = docRow(560);
    assert.equal(row.assignment_status, 'AUTO');
    assert.equal(row.project_id, projectId);
    assert.equal(row.root_external_id, 540);

    const after = itemsOfDocument(550);
    assert.equal(after.length, 1);
    approx(after[0].amount_net, 800);
    const comms = commissionsOfItem(item.id);
    assert.equal(comms.length, 2);
    assert.equal(comms[1].status, 'EARNED');
    approx(comms[1].amount_net, -200 * RATE_A, 'korekta ujemna');
    approx(comms.reduce((s, c) => s + Number(c.amount_net), 0), 800 * RATE_A);
    assert.equal(itemsOfDocument(560).length, 0, 'KFS nie tworzy własnych pozycji');

    // FS wysłana ponownie ze zmianą (np. opis) nie cofa korekty KFS.
    await sync([doc(550, 'FS', { parent_external_id: 540, positions: [pos(5500, { name: 'Tapeta Test v2' })] })]);
    const resynced = itemsOfDocument(550);
    approx(resynced[0].amount_net, 800, 'kwota po korekcie zostaje');
    assert.equal(resynced[0].description, 'Tapeta Test v2');
    assert.equal(commissionsOfItem(item.id).length, 2, 'bez nowych korekt');
});

test('9. KFS correcting an unknown position → UNASSIGNED UNMATCHED_CORRECTION, FS items untouched', async () => {
    const before = itemsOfDocument(510);
    const kfs = doc(530, 'KFS', {
        parent_external_id: 510, net_total: -100,
        positions: [pos(5300, { net_total: 700, corrects_position_external_id: 999999 })],
    });
    const response = await sync([kfs]);
    assert.equal(response.unassigned, 1);
    const row = docRow(530);
    assert.equal(row.assignment_status, 'UNASSIGNED');
    assert.equal(row.assignment_note, 'UNMATCHED_CORRECTION');
    assert.equal(row.project_id, docRow(500).project_id, 'projekt widoczny dla admina');
    assert.equal(row.root_external_id, 500);
    assert.deepEqual(itemsOfDocument(510), before);
});

test('10. computeSuggestedStatus and getProjectSubiektSummary from assigned documents', async () => {
    // tylko ZK
    assert.equal(await computeSuggestedStatus(docRow(200).project_id), 'PRZYJĘTY');
    // FS niezapłacona
    const projectId = docRow(100).project_id;
    assert.equal(await computeSuggestedStatus(projectId), 'W_REALIZACJI');

    // FS zapłacona, ale 750 < ZK 800 → nadal w realizacji; is_paid pozycji odświeżone mimo braku zmiany hasha
    const paid = await sync([doc(110, 'FS', { parent_external_id: 100, is_paid: true, positions: [pos(1100, { quantity: 7.5, net_total: 750 })] })]);
    assert.equal(paid.unchanged, 1);
    assert.equal(await computeSuggestedStatus(projectId), 'W_REALIZACJI');
    assert.equal(itemsOfDocument(100)[0].is_paid, 1, 'pozycja z ZK (RECONCILE) — zapłata = wszystkie FS łańcucha zapłacone');
    assert.deepEqual(await getProjectSubiektSummary(projectId), { zkTotal: 800, fsTotal: 750, remainingToInvoice: 50 });

    // FS zapłacona i ≥ ZK
    await sync([doc(600, 'ZK'), doc(610, 'FS', { parent_external_id: 600, is_paid: true, positions: [pos(6100)] })]);
    assert.equal(await computeSuggestedStatus(docRow(600).project_id), 'ZAKOŃCZONY');

    // KFS pomniejsza zafakturowane: 1000 − 200 < 1000
    db.prepare("UPDATE subiekt_documents SET is_paid = 1 WHERE external_id = 510").run();
    assert.equal(await computeSuggestedStatus(docRow(500).project_id), 'W_REALIZACJI');
    assert.deepEqual(await getProjectSubiektSummary(docRow(500).project_id), { zkTotal: 1000, fsTotal: 800, remainingToInvoice: 200 });

    // projekt bez dokumentów
    db.prepare("INSERT INTO projects (id, owner_id, name, client_label, status) VALUES ('p_manual', ?, 'Ręczny', 'K', 'PRZYJĘTY')").run(ARCHI_A);
    assert.equal(await computeSuggestedStatus('p_manual'), null);
});

test('11. type_overridden item keeps its type after the ZK is re-sent', async () => {
    const installation = itemsOfDocument(200).find((i) => i.type === 'INSTALLATION');
    db.prepare("UPDATE project_items SET type = 'PRODUCT', type_overridden = 1 WHERE id = ?").run(installation.id);

    await sync([doc(200, 'ZK', {
        positions: [pos(2001), pos(2002, { ordinal: 2, product_id: null, name: 'Montaż ścienny', net_total: 600 })],
    })]);
    const after = db.prepare('SELECT * FROM project_items WHERE id = ?').get(installation.id) as any;
    assert.equal(after.type, 'PRODUCT');
    assert.equal(after.type_overridden, 1);
    assert.equal(after.description, 'Montaż ścienny');
    approx(after.amount_net, 600);
    assert.equal(itemsOfDocument(200).length, 2);
});

test('12. IGNORED document is not re-mapped on re-send', async () => {
    await sync([doc(700, 'ZK')]);
    const [item] = itemsOfDocument(700);
    db.prepare("UPDATE subiekt_documents SET assignment_status = 'IGNORED' WHERE external_id = 700").run();

    const response = await sync([doc(700, 'ZK', { positions: [pos(7000, { quantity: 5, net_total: 500 })] })]);
    assert.deepEqual([response.accepted, response.unassigned], [1, 0]);
    assert.equal(docRow(700).assignment_status, 'IGNORED');
    approx(itemsOfDocument(700)[0].amount_net, Number(item.amount_net));
});

test('13. page [FS(parent 800), ZK(800)] is sorted → ZK first, both AUTO, FS items only', async () => {
    const response = await sync([doc(810, 'FS', { parent_external_id: 800 }), doc(800, 'ZK')]);
    assert.deepEqual([response.accepted, response.unassigned, response.rejected.length], [2, 0, 0]);
    assert.equal(docRow(800).assignment_status, 'AUTO');
    assert.equal(docRow(810).assignment_status, 'AUTO');
    assert.equal(docRow(810).project_id, docRow(800).project_id);
    assert.equal(itemsOfDocument(800).length, 0);
    assert.equal(itemsOfDocument(810).length, 1);
});

test('NIEZREALIZOWANY project: FS stays UNASSIGNED PROJECT_CANCELLED without items', async () => {
    await sync([doc(900, 'ZK')]);
    const projectId = docRow(900).project_id;
    db.prepare("UPDATE projects SET status = 'NIEZREALIZOWANY' WHERE id = ?").run(projectId);
    const response = await sync([doc(910, 'FS', { parent_external_id: 900 })]);
    assert.equal(response.unassigned, 1);
    assert.equal(docRow(910).assignment_note, 'PROJECT_CANCELLED');
    assert.equal(docRow(910).project_id, projectId);
    assert.equal(itemsOfDocument(910).length, 0);
});

test('a failing mapping rolls back the whole document, including the upsert', async (t) => {
    t.mock.method(console, 'error', () => {});
    // Projekt korzenia zniknął spod nóg (np. ręczna ingerencja w bazę) → błąd w kroku mapowania.
    await sync([doc(950, 'ZK')]);
    db.prepare("UPDATE subiekt_documents SET project_id = 'p_missing' WHERE external_id = 950").run();
    const response = await sync([doc(951, 'FS', { parent_external_id: 950 })]);
    assert.equal(response.rejected.length, 1);
    assert.match(response.rejected[0].reason, /^INTERNAL_ERROR:Projekt p_missing/);
    assert.equal(docRow(951), undefined);
});

// --- Po review 0b2fb87: KFS jako widok pochodny pozycji FS, MANUAL, OWNER_MISMATCH, idempotencja ---

const kfsDoc = (externalId: number, parent: number, corrections: Array<[number, number]>, overrides: Partial<Doc> = {}) =>
    doc(externalId, 'KFS', {
        parent_external_id: parent,
        positions: corrections.map(([target, after], i) => pos(externalId * 10 + i, { net_total: after, corrects_position_external_id: target })),
        net_total: 0,
        ...overrides,
    });
const itemByPosition = (positionId: number) =>
    db.prepare("SELECT * FROM project_items WHERE subiekt_position_id = ? AND source = 'SUBIEKT'").all(positionId) as any[];

// Mechanika korekt KFS na pozycjach FS — łańcuch bez ZK (korzeń FP → INVOICE_ONLY, pozycje z FS). Z korzeniem ZK
// korekta, która rozbija odzwierciedlenie ZK, przełącza łańcuch na uzgodnienie (test 8, subiektReconcileSync).
test('KFS correcting a position to 0, re-sent with changed remarks, then FS re-sent → item stays gone (review repro)', async () => {
    await sync([doc(2000, 'FP', { architect_code: 'A-001' }), doc(2010, 'FS', { parent_external_id: 2000, positions: [pos(20100), pos(20101)] })]);
    const projectId = docRow(2000).project_id;
    assert.equal(itemsOfProject(projectId).length, 2);

    await sync([kfsDoc(2020, 2010, [[20100, 0]])]);
    assert.equal(docRow(2020).assignment_status, 'AUTO');
    assert.equal(itemByPosition(20100).length, 0, 'korekta do 0 usuwa pozycję (projekt w toku)');

    const resent = await sync([kfsDoc(2020, 2010, [[20100, 0]], { remarks: 'poprawka uwag' })]);
    assert.equal(resent.accepted, 1);
    assert.equal(docRow(2020).assignment_status, 'AUTO', 'cel korekty sprawdzany w pozycjach FS, nie w project_items');

    await sync([doc(2010, 'FS', { parent_external_id: 2000, positions: [pos(20100, { name: 'v2' }), pos(20101)] })]);
    assert.equal(itemByPosition(20100).length, 0, 'resync FS stosuje korektę — pozycja nie wraca');
    approx(pendingSum(projectId), 1000 * RATE_A, 'PENDING tylko dla pozycji 20101');
});

test('second KFS on the same position → latest (issued_at, external_id) wins, also when the older one is re-sent', async () => {
    await sync([doc(2100, 'FP', { architect_code: 'A-001' }), doc(2110, 'FS', { parent_external_id: 2100, positions: [pos(21100)] })]);
    await sync([kfsDoc(2120, 2110, [[21100, 800]], { issued_at: '2026-10-21' })]);
    approx(itemByPosition(21100)[0].amount_net, 800);

    await sync([kfsDoc(2130, 2110, [[21100, 600]], { issued_at: '2026-10-25' })]);
    approx(itemByPosition(21100)[0].amount_net, 600);

    await sync([kfsDoc(2120, 2110, [[21100, 800]], { issued_at: '2026-10-21', remarks: 'zmiana' })]);
    approx(itemByPosition(21100)[0].amount_net, 600, 'starsza KFS nie nadpisuje nowszej');
    approx(pendingSum(docRow(2100).project_id), 600 * RATE_A);
});

test('KFS re-sent unchanged is idempotent (no new commissions, logs or amount changes)', async () => {
    const projectId = docRow(2100).project_id;
    const logs = () => Number((db.prepare('SELECT COUNT(*) AS c FROM activity_logs').get() as any).c);
    const comms = () => db.prepare('SELECT id, amount_net, status FROM commissions WHERE project_id = ? ORDER BY id').all(projectId);
    const [logsBefore, commsBefore] = [logs(), comms()];
    const response = await sync([kfsDoc(2130, 2110, [[21100, 600]], { issued_at: '2026-10-25' })]);
    assert.equal(response.unchanged, 1);
    assert.equal(logs(), logsBefore);
    assert.deepEqual(comms(), commsBefore);
});

test('KFS with one matched and one unknown target → UNMATCHED_CORRECTION, nothing applied', async () => {
    await sync([doc(2200, 'ZK'), doc(2210, 'FS', { parent_external_id: 2200, positions: [pos(22100)] })]);
    await sync([kfsDoc(2220, 2210, [[22100, 500], [999998, 1]])]);
    assert.equal(docRow(2220).assignment_note, 'UNMATCHED_CORRECTION');
    approx(itemByPosition(22100)[0].amount_net, 1000);
});

test('MANUAL: admin keeps the assignment, Subiekt content still updates items; IGNORED stays untouched', async () => {
    // Korzeń FP (INVOICE_ONLY): treść FS prowadzi pozycje; z korzeniem ZK inna kwota FS → uzgodnienie (loop 5b).
    await sync([doc(2300, 'FP', { architect_code: 'A-001' }), doc(2310, 'FS', { parent_external_id: 2300, positions: [pos(23100)] })]);
    db.prepare("UPDATE subiekt_documents SET assignment_status = 'MANUAL', assignment_note = 'admin' WHERE external_id = 2310").run();

    const response = await sync([doc(2310, 'FS', { parent_external_id: 2300, architect_code: 'Z-999', positions: [pos(23100, { net_total: 900 })] })]);
    assert.deepEqual([response.accepted, response.unassigned], [1, 0]);
    const row = docRow(2310);
    assert.equal(row.assignment_status, 'MANUAL');
    assert.equal(row.assignment_note, 'admin', 'przypisanie bez zmian mimo nieznanego kodu');
    approx(itemByPosition(23100)[0].amount_net, 900);
    approx(pendingSum(docRow(2300).project_id), 900 * RATE_A);
});

test('OWNER_MISMATCH: derived doc with another architect is not assigned to the root project', async () => {
    await sync([doc(2400, 'ZK')]);
    const response = await sync([doc(2410, 'FS', { parent_external_id: 2400, architect_code: 'C-003' })]);
    assert.equal(response.unassigned, 1);
    const row = docRow(2410);
    assert.equal(row.assignment_status, 'UNASSIGNED');
    assert.equal(row.assignment_note, 'OWNER_MISMATCH:C-003');
    assert.equal(row.project_id, null);
    assert.equal(itemsOfDocument(2410).length, 0);
    assert.equal(itemsOfDocument(2400).length, 1, 'pozycje ZK zostają');
});

test('OWNER_MISMATCH: document already in a project keeps project and status, admin gets one activity entry', async () => {
    await sync([doc(2500, 'ZK')]);
    const projectId = docRow(2500).project_id;
    const mismatchLogs = () => db.prepare("SELECT * FROM activity_logs WHERE event_type = 'SUBIEKT_OWNER_MISMATCH'").all() as any[];
    const before = mismatchLogs().length;

    await sync([doc(2500, 'ZK', { architect_code: 'C-003', positions: [pos(25000, { net_total: 700 })] })]);
    let row = docRow(2500);
    assert.equal(row.assignment_status, 'AUTO');
    assert.equal(row.assignment_note, 'OWNER_MISMATCH:C-003');
    assert.equal(row.project_id, projectId);
    assert.equal(projectRow(projectId).owner_id, ARCHI_A);
    approx(itemsOfDocument(2500)[0].amount_net, 700, 'treść z Subiekta nadal się synchronizuje');
    assert.equal(mismatchLogs().length, before + 1);
    assert.equal(JSON.parse(mismatchLogs().at(-1).metadata).projectId, projectId);

    await sync([doc(2500, 'ZK', { architect_code: 'C-003', positions: [pos(25000, { net_total: 650 })] })]);
    row = docRow(2500);
    assert.equal(row.assignment_note, 'OWNER_MISMATCH:C-003');
    assert.equal(mismatchLogs().length, before + 1, 'bez duplikatu wpisu przy tym samym powodzie');
});

test('position with net_total <= 0 is skipped; position removed from the payload → item deleted', async () => {
    await sync([doc(2600, 'ZK', { positions: [pos(26000), pos(26001, { ordinal: 2, name: 'Gratis', net_total: 0 })] })]);
    assert.deepEqual(itemsOfDocument(2600).map((i) => i.subiekt_position_id), [26000]);

    await sync([doc(2600, 'ZK', { positions: [pos(26002, { ordinal: 3, net_total: 300 })] })]);
    const items = itemsOfDocument(2600);
    assert.deepEqual(items.map((i) => i.subiekt_position_id), [26002]);
    approx(pendingSum(docRow(2600).project_id), 300 * RATE_A, 'PENDING usuniętej pozycji zniknęła');
});

test('FP root creates a project without items; WZ creates no items; FS from WZ gets items', async () => {
    await sync([doc(2700, 'FP', { architect_code: 'A-001' }), doc(2710, 'WZ', { parent_external_id: 2700 })]);
    const projectId = docRow(2700).project_id;
    assert.ok(projectId);
    assert.equal(docRow(2700).assignment_status, 'AUTO');
    assert.equal(docRow(2710).assignment_status, 'AUTO');
    assert.equal(docRow(2710).project_id, projectId);
    assert.equal(itemsOfProject(projectId).length, 0);

    await sync([doc(2720, 'FS', { parent_external_id: 2710, positions: [pos(27200)] })]);
    const items = itemsOfProject(projectId);
    assert.equal(items.length, 1);
    assert.equal(items[0].order_number, null, 'korzeń FP — brak numeru ZK');
    assert.equal(items[0].invoice_number, 'FS 2720/10/2026');
});

test('idempotency: page [ZK, FS paid, KFS, ZK with 2 positions] sent three times → identical state (also the reconciliation), unchanged', async () => {
    const page = () => [
        doc(2800, 'ZK'),
        doc(2810, 'FS', { parent_external_id: 2800, is_paid: true, positions: [pos(28100), pos(28101, { product_id: null, name: 'Montaż', net_total: 400 })] }),
        kfsDoc(2820, 2810, [[28100, 900]]),
        doc(2900, 'ZK', { positions: [pos(29000), pos(29001, { product_id: null, net_total: 250 })] }),
    ];
    const snapshot = () => ({
        items: db.prepare("SELECT COUNT(*) AS c, ROUND(SUM(amount_net), 2) AS s FROM project_items WHERE source = 'SUBIEKT'").get(),
        commissions: db.prepare('SELECT COUNT(*) AS c, ROUND(SUM(amount_net), 2) AS s FROM commissions').get(),
        projects: db.prepare('SELECT COUNT(*) AS c FROM projects').get(),
        wallet: db.prepare('SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount), 0), 2) AS s FROM wallet_transactions').get(),
        logs: db.prepare('SELECT COUNT(*) AS c FROM activity_logs').get(),
        reconciliations: db.prepare('SELECT status, zk_net, invoiced_net, fingerprint FROM subiekt_reconciliations ORDER BY id').all(),
    });

    const first = await sync(page());
    assert.deepEqual([first.accepted, first.unassigned, first.rejected.length], [4, 0, 0]);
    const afterFirst = snapshot();
    // FS 1000 + montaż 400 ≠ ZK 1000 → uzgodnienie (loop 5b): pozycje z ZK, korekta KFS liczy się do kwoty faktur.
    assert.equal(itemByPosition(28100).length, 0);
    approx(itemsOfDocument(2800)[0].amount_net, 1000);
    const reconciliation = db.prepare('SELECT * FROM subiekt_reconciliations WHERE root_external_id = 2800').get() as any;
    assert.equal(reconciliation.status, 'OPEN');
    assert.equal(reconciliation.fingerprint, '2810:1400.00;2820:0.00');

    for (let i = 0; i < 2; i++) {
        const again = await sync(page());
        assert.deepEqual([again.accepted, again.unchanged, again.unassigned], [0, 4, 0]);
        assert.deepEqual(snapshot(), afterFirst);
    }
});
