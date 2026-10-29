// Widoki panelu admina (src/lib/subiekt/queries.ts, Loop 4) na prawdziwym SQLite: kształt danych, które
// konsumują strona „Subiekt” i strona projektu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type SyncModule = typeof import('../src/lib/subiekt/sync');
type QueriesModule = typeof import('../src/lib/subiekt/queries');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const { processSyncPage }: SyncModule = await import(new URL('../src/lib/subiekt/sync.ts', import.meta.url).href);
const q: QueriesModule = await import(new URL('../src/lib/subiekt/queries.ts', import.meta.url).href);
const db = testDb.db;

test.after(() => testDb.cleanup());

type Doc = import('../src/lib/subiekt/types').SubiektDocumentPayload;
type Pos = import('../src/lib/subiekt/types').SubiektPositionPayload;

const ARCHI_A = 'u_archi_a';
db.prepare("INSERT INTO users (id, name, email, role, subiekt_code) VALUES (?, 'Architekt A', 'a@test.local', 'ARCHI', 'A-001')").run(ARCHI_A);
db.prepare("INSERT INTO users (id, name, email, role, subiekt_code) VALUES ('u_archi_c', 'Architekt C', 'c@test.local', 'ARCHI', 'C-003')").run();

const pos = (externalId: number, overrides: Partial<Pos> = {}): Pos => ({
    external_id: externalId, ordinal: 1, product_id: 77, name: 'Tapeta', quantity: 1, unit: 'szt',
    unit_price_net: 1000, net_total: 1000, corrects_position_external_id: null, ...overrides,
});
const doc = (externalId: number, type: Doc['type'], overrides: Partial<Doc> = {}): Doc => ({
    external_id: externalId, type, number: `${type} ${externalId}/10/2026`, issued_at: '2026-10-20',
    contractor_name: 'Jan Testowy', contractor_nip: null, architect_code: type === 'ZK' ? 'A-001' : null,
    parent_external_id: null, net_total: 1000, gross_total: 1230, is_paid: false, remarks: null,
    positions: [pos(externalId * 10)], ...overrides,
});
const sync = (documents: Doc[], runId = randomUUID()) =>
    processSyncPage({ run_id: runId, agent_version: '0.2.0', page: 1, pages: 1, documents });
const docRow = (externalId: number) => db.prepare('SELECT * FROM subiekt_documents WHERE external_id = ?').get(externalId) as any;

test('setup: chains, unassigned documents and runs', async () => {
    await sync([doc(100, 'ZK', { issued_at: '2026-10-01' }), doc(110, 'FS', { parent_external_id: 100, issued_at: '2026-10-05', is_paid: true })]);
    await sync([doc(200, 'ZK', { issued_at: '2026-10-10' })]);
    await sync([
        doc(300, 'FS', { issued_at: '2026-10-12' }),                                 // NO_ARCHITECT
        doc(310, 'FS', { architect_code: 'z-9', issued_at: '2026-10-15' }),          // UNKNOWN_ARCHITECT_CODE:Z-9
        doc(311, 'FS', { architect_code: 'Z-9', issued_at: '2026-10-11' }),
        doc(320, 'FS', { architect_code: 'A-001', issued_at: '2026-10-14' }),        // NO_ROOT_DOCUMENT, architekt znany
        doc(330, 'FS', { parent_external_id: 100, architect_code: 'C-003', issued_at: '2026-10-13' }), // OWNER_MISMATCH
    ]);
    db.prepare("INSERT INTO projects (id, owner_id, name, client_label, status, created_at) VALUES ('p_lost', ?, 'Utracony', 'K', 'NIEZREALIZOWANY', CURRENT_TIMESTAMP)").run(ARCHI_A);
    db.prepare("INSERT INTO projects (id, owner_id, name, client_label, status, created_at) VALUES ('p_done', ?, 'Zakończony', 'K', 'ZAKOŃCZONY', CURRENT_TIMESTAMP)").run(ARCHI_A);
    db.prepare("INSERT INTO project_items (id, project_id, type, amount_net, category) VALUES ('i_done', 'p_done', 'PRODUCT', 50, 'X')").run();
});

test('getUnassignedDocuments: newest first, reasons, resolved architect and candidate projects', async () => {
    const rows = await q.getUnassignedDocuments();
    assert.deepEqual(rows.map((r) => r.external_id), [310, 320, 330, 300, 311]);
    const known = rows.find((r) => r.external_id === 320)!;
    assert.equal(known.assignment_note, 'NO_ROOT_DOCUMENT');
    assert.equal(known.architect_id, ARCHI_A);
    assert.equal(known.architect_name, 'Architekt A');
    assert.equal(known.issued_at, '2026-10-14');
    assert.equal(typeof known.net_total, 'number');
    assert.deepEqual(known.candidateProjects.map((p) => p.id).sort(), [docRow(100).project_id, docRow(200).project_id, 'p_done'].sort(),
        'projekty architekta bez NIEZREALIZOWANY');
    const unknown = rows.find((r) => r.external_id === 310)!;
    assert.equal(unknown.architect_code, 'Z-9');
    assert.equal(unknown.architect_name, null);
    assert.deepEqual(unknown.candidateProjects, []);
    assert.equal(rows.find((r) => r.external_id === 330)!.assignment_note, 'OWNER_MISMATCH:C-003');
    assert.equal(rows.find((r) => r.external_id === 330)!.root_external_id, 100);
});

test('getUnknownArchitectCodes and getUnassignedCount', async () => {
    assert.deepEqual(await q.getUnknownArchitectCodes(), [{ code: 'Z-9', documents: 2 }]);
    assert.equal(await q.getUnassignedCount(), 5);
});

test('getProjectSubiektDocuments groups documents of the project by root', async () => {
    const chains = await q.getProjectSubiektDocuments(docRow(100).project_id);
    assert.equal(chains.length, 1);
    assert.equal(chains[0].rootExternalId, 100);
    assert.equal(chains[0].root?.number, 'ZK 100/10/2026');
    assert.deepEqual(chains[0].children.map((d) => d.external_id), [110], 'FS innego architekta (bez projektu) poza listą');
    assert.equal(chains[0].children[0].is_paid, true);
    assert.equal(chains[0].children[0].assignment_status, 'AUTO');
    assert.equal(chains[0].children[0].issued_at, '2026-10-05');
    assert.deepEqual(await q.getProjectSubiektDocuments('p_missing'), []);
});

test('getMergeCandidates: same owner, live projects only, with items total', async () => {
    const candidates = await q.getMergeCandidates(docRow(100).project_id);
    assert.deepEqual(candidates, [{ id: docRow(200).project_id, name: 'Jan Testowy — ZK 200/10/2026', status: 'PRZYJĘTY', itemsTotal: 1000 }]);
    assert.deepEqual(await q.getMergeCandidates('p_done'), [], 'projekt zakończony nie ma kandydatów');
    assert.deepEqual(await q.getMergeCandidates('p_missing'), []);
});

test('getRecentSyncRuns: newest first, ISO dates, numeric counters, limit clamped', async () => {
    db.prepare("UPDATE subiekt_sync_runs SET started_at = '2026-10-01 10:00:00'").run();
    const latest = randomUUID();
    await sync([], latest);
    db.prepare("UPDATE subiekt_sync_runs SET started_at = '2026-10-02 10:00:00' WHERE id = ?").run(latest);
    const runs = await q.getRecentSyncRuns(2);
    assert.equal(runs.length, 2);
    assert.equal(runs[0].id, latest);
    assert.equal(runs[0].started_at, '2026-10-02T10:00:00.000Z');
    assert.equal(runs[0].status, 'DONE');
    assert.equal(typeof runs[1].documents_accepted, 'number');
    assert.equal((await q.getRecentSyncRuns(0)).length, 1);
    assert.equal((await q.getRecentSyncRuns()).length, 4);
});
