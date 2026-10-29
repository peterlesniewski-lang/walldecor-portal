// Wymagania z przeglądu loopa 2 (PLAN-SUBIEKT-2026-10-29.md, Loop 4, komentarz pod moveDocumentToProject):
// (a) pozycje dokumentu w innym projekcie nie są ruszane przez syncChainItems, (b) clearChainItems /
// clearDocumentItems, (c) KFS, która wypada z mapy korekt, resynchronizuje faktury, które korygowała.
// Prawdziwy SQLite przez tests/helpers/sqliteTestDb.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type SyncModule = typeof import('../src/lib/subiekt/sync');
type MappingDbModule = typeof import('../src/lib/subiekt/mappingDb');
type ChainOpsModule = typeof import('../src/lib/subiekt/chainOps');
type DbModule = typeof import('../src/lib/db');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const { processSyncPage }: SyncModule = await import(new URL('../src/lib/subiekt/sync.ts', import.meta.url).href);
const { syncChainItems }: MappingDbModule = await import(new URL('../src/lib/subiekt/mappingDb.ts', import.meta.url).href);
const { clearChainItems, clearDocumentItems }: ChainOpsModule = await import(new URL('../src/lib/subiekt/chainOps.ts', import.meta.url).href);
const { withTransaction }: DbModule = await import(new URL('../src/lib/db.ts', import.meta.url).href);
const db = testDb.db;

test.after(() => testDb.cleanup());

type Doc = import('../src/lib/subiekt/types').SubiektDocumentPayload;
type Pos = import('../src/lib/subiekt/types').SubiektPositionPayload;

const ARCHI_A = 'u_archi_a';
const RATE_A = 0.10;
const ADMIN = { actorId: 'u_admin', note: 'test' };
db.prepare("INSERT INTO users (id, name, email, role) VALUES ('u_admin', 'Admin', 'admin@test.local', 'ADMIN')").run();
db.prepare("INSERT INTO users (id, name, email, role, subiekt_code) VALUES (?, 'Architekt A', 'a@test.local', 'ARCHI', 'A-001')").run(ARCHI_A);

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

const kfsDoc = (externalId: number, parent: number, corrections: Array<[number, number]>) =>
    doc(externalId, 'KFS', {
        parent_external_id: parent, net_total: 0,
        positions: corrections.map(([target, after], i) => pos(externalId * 10 + i, { net_total: after, corrects_position_external_id: target })),
    });

const sync = (documents: Doc[]) =>
    processSyncPage({ run_id: randomUUID(), agent_version: '0.1.0', page: 1, pages: 1, documents });

function approx(actual: unknown, expected: number, message?: string) {
    assert.ok(Math.abs(Number(actual) - expected) < 0.005, `${message ?? 'kwota'}: ${actual} ≠ ${expected}`);
}

const docRow = (externalId: number) => db.prepare('SELECT * FROM subiekt_documents WHERE external_id = ?').get(externalId) as any;
const itemsOfProject = (projectId: string) =>
    db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY subiekt_position_id').all(projectId) as any[];
const itemByPosition = (positionId: number) =>
    db.prepare("SELECT * FROM project_items WHERE subiekt_position_id = ? AND source = 'SUBIEKT'").all(positionId) as any[];
const pendingSum = (projectId: string) =>
    Number((db.prepare("SELECT COALESCE(SUM(amount_net), 0) AS s FROM commissions WHERE project_id = ? AND status = 'PENDING'").get(projectId) as any).s);
const commissionSum = (projectId: string) =>
    Number((db.prepare('SELECT COALESCE(SUM(amount_net), 0) AS s FROM commissions WHERE project_id = ?').get(projectId) as any).s);

function newProject(id: string, status = 'PRZYJĘTY') {
    db.prepare("INSERT INTO projects (id, owner_id, name, client_label, status) VALUES (?, ?, ?, 'K', ?)").run(id, ARCHI_A, `Projekt ${id}`, status);
}

test('(a) syncChainItems only touches items of the document in its current project', async () => {
    await sync([doc(100, 'ZK')]);
    const oldProject = docRow(100).project_id;
    const [oldItem] = itemsOfProject(oldProject);

    // Dokument przepięty do innego projektu bez sprzątania (stan sprzed clearChainItems).
    newProject('p_other');
    db.prepare("UPDATE subiekt_documents SET project_id = 'p_other', assignment_status = 'MANUAL' WHERE external_id = 100").run();
    db.prepare("UPDATE subiekt_documents SET positions_json = ? WHERE external_id = 100").run(JSON.stringify([pos(1000, { net_total: 700 })]));
    await withTransaction(() => syncChainItems(docRow(100).id));

    const stale = itemsOfProject(oldProject);
    assert.equal(stale.length, 1);
    assert.equal(stale[0].id, oldItem.id, 'pozycja w starym projekcie nietknięta');
    approx(stale[0].amount_net, 1000);
    const fresh = itemsOfProject('p_other');
    assert.equal(fresh.length, 1);
    approx(fresh[0].amount_net, 700);
    approx(pendingSum('p_other'), 700 * RATE_A);
});

test('(b) clearChainItems on a project in progress deletes chain items and their PENDING, other chains stay', async () => {
    await sync([doc(200, 'ZK'), doc(210, 'FS', { parent_external_id: 200, positions: [pos(2100), pos(2101, { product_id: null, net_total: 300 })] })]);
    const projectId = docRow(200).project_id;
    await sync([doc(220, 'ZK')]); // inny łańcuch, własny projekt
    assert.equal(itemsOfProject(projectId).length, 2);

    await withTransaction(() => clearChainItems(200, projectId, ADMIN));
    assert.equal(itemsOfProject(projectId).length, 0);
    approx(pendingSum(projectId), 0);
    assert.equal(itemsOfProject(docRow(220).project_id).length, 1, 'inny łańcuch bez zmian');
    const log = db.prepare("SELECT * FROM activity_logs WHERE event_type = 'PROJECT_ITEM_DELETED' ORDER BY rowid DESC LIMIT 1").get() as any;
    assert.equal(log.user_id, 'u_admin');
});

test('(b) clearChainItems on a ZAKOŃCZONY project zeroes items with corrections and unlinks them from the document', async (t) => {
    t.mock.method(console, 'warn', () => {});
    await sync([doc(400, 'ZK'), doc(410, 'FS', { parent_external_id: 400, positions: [pos(4100)] })]);
    const projectId = docRow(400).project_id;
    db.prepare("UPDATE projects SET status = 'ZAKOŃCZONY' WHERE id = ?").run(projectId);
    db.prepare("UPDATE commissions SET status = 'EARNED' WHERE project_id = ? AND status = 'PENDING'").run(projectId);
    approx(commissionSum(projectId), 1000 * RATE_A);

    await withTransaction(() => clearChainItems(400, projectId, ADMIN));
    const [item] = itemsOfProject(projectId);
    approx(item.amount_net, 0, 'pozycja zostaje z kwotą 0');
    assert.equal(item.subiekt_document_id, null);
    assert.equal(item.subiekt_position_id, null);
    assert.equal(item.source, 'SUBIEKT', 'nadal zablokowana do edycji ręcznej');
    approx(commissionSum(projectId), 0, 'korekta EARNED do zera');

    // Ponowne czyszczenie / sync nie dokłada korekt: wiersz nie jest już powiązany z dokumentem.
    const commissions = () => Number((db.prepare('SELECT COUNT(*) AS c FROM commissions WHERE project_id = ?').get(projectId) as any).c);
    const before = commissions();
    await withTransaction(() => clearChainItems(400, projectId, ADMIN));
    assert.equal(commissions(), before);
});

test('(b) clearDocumentItems removes only the given document items', async () => {
    await sync([doc(500, 'ZK', { positions: [pos(5000), pos(5001, { ordinal: 2, net_total: 200 })] })]);
    const projectId = docRow(500).project_id;
    await sync([doc(510, 'ZK')]);
    await withTransaction(() => clearDocumentItems(docRow(510).id, projectId, ADMIN)); // dokument z innego projektu → nic
    assert.equal(itemsOfProject(projectId).length, 2);
    await withTransaction(() => clearDocumentItems(docRow(500).id, projectId, ADMIN));
    assert.equal(itemsOfProject(projectId).length, 0);
});

test('(c) KFS applied (800), re-sent with a target that no longer matches → UNMATCHED_CORRECTION and FS item back to 1000', async () => {
    await sync([doc(600, 'ZK'), doc(610, 'FS', { parent_external_id: 600, positions: [pos(6100)] })]);
    const projectId = docRow(600).project_id;
    await sync([kfsDoc(620, 610, [[6100, 800]])]);
    assert.equal(docRow(620).assignment_status, 'AUTO');
    approx(itemByPosition(6100)[0].amount_net, 800);
    approx(pendingSum(projectId), 800 * RATE_A);

    const response = await sync([kfsDoc(620, 610, [[999999, 800]])]);
    assert.equal(response.unassigned, 1);
    const row = docRow(620);
    assert.equal(row.assignment_status, 'UNASSIGNED');
    assert.equal(row.assignment_note, 'UNMATCHED_CORRECTION');
    approx(itemByPosition(6100)[0].amount_net, 1000, 'stara korekta zdjęta');
    approx(pendingSum(projectId), 1000 * RATE_A);
});

test('(c) KFS re-sent with another (matching) target → the previously corrected position drops the old correction', async () => {
    await sync([doc(700, 'ZK'), doc(710, 'FS', { parent_external_id: 700, positions: [pos(7100), pos(7101, { ordinal: 2 })] })]);
    await sync([kfsDoc(720, 710, [[7100, 600]])]);
    approx(itemByPosition(7100)[0].amount_net, 600);

    await sync([kfsDoc(720, 710, [[7101, 500]])]);
    assert.equal(docRow(720).assignment_status, 'AUTO');
    approx(itemByPosition(7100)[0].amount_net, 1000, 'poprzedni cel wraca do kwoty z FS');
    approx(itemByPosition(7101)[0].amount_net, 500);
});
