// Log zmian dokumentów zamówieniowych z Subiekta (PLAN-SUBIEKT-2026-10-29.md, Loop 3, Krok 2): sync.ts →
// diff.ts → activity_logs (SUBIEKT_ZK_CHANGED) + odczyt getProjectZkChanges, na tymczasowej bazie SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type SyncModule = typeof import('../src/lib/subiekt/sync');
type QueriesModule = typeof import('../src/lib/subiekt/queries');
type DbModule = typeof import('../src/lib/db');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const { processSyncPage, processDocument }: SyncModule = await import(new URL('../src/lib/subiekt/sync.ts', import.meta.url).href);
const { getProjectZkChanges }: QueriesModule = await import(new URL('../src/lib/subiekt/queries.ts', import.meta.url).href);
const { withTransaction, query }: DbModule = await import(new URL('../src/lib/db.ts', import.meta.url).href);
const db = testDb.db;

test.after(() => testDb.cleanup());

/** Separator tysięcy z formatPLNFixed (twarda spacja). */
const NBSP = '\u00a0';

type Doc = import('../src/lib/subiekt/types').SubiektDocumentPayload;
type Pos = import('../src/lib/subiekt/types').SubiektPositionPayload;

db.prepare("INSERT INTO users (id, name, email, role, subiekt_code) VALUES ('u_archi_a', 'Architekt A', 'a@test.local', 'ARCHI', 'A-001')").run();

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
        contractor_name: 'Jan Testowy', contractor_nip: null, architect_code: type === 'ZK' || type === 'FP' ? 'A-001' : null,
        parent_external_id: null, net_total: net, gross_total: Math.round(net * 123) / 100, is_paid: false,
        remarks: null, positions, ...overrides,
    };
}

const sync = (documents: Doc[]) =>
    processSyncPage({ run_id: randomUUID(), agent_version: '0.1.0', page: 1, pages: 1, documents });

const changeLogs = () =>
    db.prepare("SELECT * FROM activity_logs WHERE event_type = 'SUBIEKT_ZK_CHANGED' ORDER BY rowid").all() as any[];
const docRow = (externalId: number) => db.prepare('SELECT * FROM subiekt_documents WHERE external_id = ?').get(externalId) as any;

test('1. first sync of a ZK → no change entry', async () => {
    const response = await sync([doc(100, 'ZK')]);
    assert.equal(response.accepted, 1);
    assert.equal(changeLogs().length, 0);
});

test('2. second sync with quantity 10 → 8 → exactly one SUBIEKT_ZK_CHANGED row from the system, with projectId', async () => {
    const response = await sync([doc(100, 'ZK', { positions: [pos(1000, { quantity: 8, net_total: 800 })] })]);
    assert.equal(response.accepted, 1);

    const logs = changeLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].user_id, null);
    assert.ok(logs[0].description.includes('10 → 8 szt'), logs[0].description);
    assert.ok(logs[0].description.includes(`wartość 1${NBSP}000,00 → 800,00 zł`), logs[0].description);
    assert.equal(logs[0].description, `ZK 100/10/2026: Tapeta Test 10 → 8 szt; wartość 1${NBSP}000,00 → 800,00 zł`);

    const projectId = docRow(100).project_id;
    assert.match(projectId, /^p_/);
    const metadata = JSON.parse(logs[0].metadata);
    assert.equal(metadata.projectId, projectId);
    assert.equal(metadata.documentId, docRow(100).id);
    assert.equal(metadata.externalId, 100);
    assert.equal(logs[0].subject_id, docRow(100).id, 'subject_id = id dokumentu');
    const created = db.prepare("SELECT subject_id FROM activity_logs WHERE event_type = 'SUBIEKT_PROJECT_CREATED'").get() as any;
    assert.equal(created.subject_id, docRow(100).id);
    assert.deepEqual(metadata.lines, [{ kind: 'QUANTITY', name: 'Tapeta Test', before: '10 szt × 100,00', after: '8 szt × 100,00' }]);
});

test('3. third sync unchanged → no new row', async () => {
    const response = await sync([doc(100, 'ZK', { positions: [pos(1000, { quantity: 8, net_total: 800 })] })]);
    assert.equal(response.unchanged, 1);
    assert.equal(changeLogs().length, 1);
});

test('4. changed remarks only (hash changes, positions and total same) → no row', async () => {
    const response = await sync([doc(100, 'ZK', { remarks: 'Klient prosi o kontakt', positions: [pos(1000, { quantity: 8, net_total: 800 })] })]);
    assert.equal(response.accepted, 1, 'hash się zmienił');
    assert.equal(changeLogs().length, 1);
});

test('5. a changed FS → no SUBIEKT_ZK_CHANGED row; a later ZK change with an FS child still logs', async () => {
    await sync([doc(101, 'FS', { parent_external_id: 100, positions: [pos(1010, { quantity: 8, net_total: 800 })] })]);
    const fsChanged = await sync([doc(101, 'FS', { parent_external_id: 100, positions: [pos(1010, { quantity: 7, net_total: 700 })] })]);
    assert.equal(fsChanged.accepted, 1);
    assert.equal(changeLogs().length, 1, 'FS nie jest diffowana');

    await sync([doc(100, 'ZK', {
        remarks: 'Klient prosi o kontakt',
        positions: [pos(1000, { quantity: 8, net_total: 800 }), pos(1001, { ordinal: 2, product_id: null, name: 'Montaż', quantity: 1, unit_price_net: 300, net_total: 300 })],
    })]);
    const logs = changeLogs();
    assert.equal(logs.length, 2);
    assert.equal(logs[1].description, `ZK 100/10/2026: dodano Montaż 300,00 zł; wartość 800,00 → 1${NBSP}100,00 zł`);
    assert.equal(JSON.parse(logs[1].metadata).projectId, docRow(100).project_id);
});

test('6. FP change logs too; unassigned ZK change logs with projectId null', async () => {
    await sync([doc(200, 'FP')]);
    await sync([doc(200, 'FP', { positions: [pos(2000, { unit_price_net: 90, net_total: 900 })] })]);
    const fpLog = changeLogs().at(-1);
    assert.equal(fpLog.description, `FP 200/10/2026: Tapeta Test cena 100,00 → 90,00 zł; wartość 1${NBSP}000,00 → 900,00 zł`);
    assert.equal(JSON.parse(fpLog.metadata).projectId, docRow(200).project_id);

    await sync([doc(300, 'ZK', { architect_code: 'Z-999' })]);
    assert.equal(docRow(300).assignment_status, 'UNASSIGNED');
    await sync([doc(300, 'ZK', { architect_code: 'Z-999', positions: [pos(3000, { name: 'Tapeta Nowa' })] })]);
    const unassignedLog = changeLogs().at(-1);
    assert.equal(unassignedLog.description, `ZK 300/10/2026: nazwa: Tapeta Test → Tapeta Nowa; wartość 1${NBSP}000,00 → 1${NBSP}000,00 zł`);
    assert.equal(JSON.parse(unassignedLog.metadata).projectId, null);
});

test('7. getProjectZkChanges → by subject_id: documents of this project only, newest first, ISO dates', async () => {
    const projectId = docRow(100).project_id;
    const [first, second] = changeLogs().filter((l) => l.subject_id === docRow(100).id);
    db.prepare("UPDATE activity_logs SET created_at = '2026-10-20 18:00:00' WHERE id = ?").run(first.id);
    db.prepare("UPDATE activity_logs SET created_at = '2026-10-21 18:00:00' WHERE id = ?").run(second.id);

    const changes = await getProjectZkChanges(projectId);
    assert.deepEqual(changes.map((c) => c.id), [second.id, first.id], 'bez wpisu FP 200 z innego projektu');
    assert.equal(changes[1].created_at, '2026-10-20T18:00:00.000Z');
    assert.equal(changes[1].description, first.description);
    assert.equal((await getProjectZkChanges(docRow(200).project_id)).length, 1);
    assert.deepEqual(await getProjectZkChanges('p_missing'), []);

    // Zmiana zapisana, gdy ZK 300 był nieprzypisany (metadata.projectId = null), pojawia się po przypisaniu.
    const unassignedLog = changeLogs().find((l) => l.subject_id === docRow(300).id);
    assert.equal(JSON.parse(unassignedLog.metadata).projectId, null);
    db.prepare("UPDATE activity_logs SET created_at = '2026-10-22 18:00:00' WHERE id = ?").run(unassignedLog.id);
    db.prepare('UPDATE subiekt_documents SET project_id = ? WHERE id = ?').run(projectId, docRow(300).id);
    assert.deepEqual((await getProjectZkChanges(projectId)).map((c) => c.id), [unassignedLog.id, second.id, first.id]);
});

test('8. corrupted positions_json of the previous version → no change entry (no fake "dodano"), warning', async () => {
    await sync([doc(400, 'ZK')]);
    db.prepare("UPDATE subiekt_documents SET positions_json = '{not json' WHERE external_id = 400").run();
    const before = changeLogs().length;
    const warn = console.warn;
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    try {
        const response = await sync([doc(400, 'ZK', { positions: [pos(4000, { quantity: 8, net_total: 800 })] })]);
        assert.equal(response.accepted, 1, 'dokument zapisany mimo braku wpisu');
    } finally {
        console.warn = warn;
    }
    assert.equal(changeLogs().length, before);
    assert.ok(warnings.some((w) => String(w[0]).includes('positions_json')), 'ostrzeżenie w logach');
    assert.equal(JSON.parse(docRow(400).positions_json)[0].quantity, 8, 'nowa treść zapisana poprawnie');
});

test('9. ZK change inside an outer transaction that throws → no SUBIEKT_ZK_CHANGED row, document unchanged', async () => {
    const before = changeLogs().length;
    await assert.rejects(
        withTransaction(async () => {
            const result = await processDocument(doc(400, 'ZK', { positions: [pos(4000, { quantity: 5, net_total: 500 })] }), randomUUID());
            assert.equal(result.outcome, 'CHANGED');
            // Uchwyt testowy (db) to osobne połączenie i nie widzi niezatwierdzonych zapisów — liczymy przez query() z transakcji.
            const [inside] = await query<{ c: number }>("SELECT COUNT(*) AS c FROM activity_logs WHERE event_type = 'SUBIEKT_ZK_CHANGED'");
            assert.equal(Number(inside.c), before + 1, 'wpis powstał w transakcji');
            throw new Error('boom');
        }),
        /boom/
    );
    assert.equal(changeLogs().length, before);
    assert.equal(JSON.parse(docRow(400).positions_json)[0].quantity, 8);
});

// --- Loop 6 (scenariusz „dzień z życia”, krok 8): korekta KFS widoczna w logu projektu dla admina i architekta ---

const correctionLogs = () =>
    db.prepare("SELECT * FROM activity_logs WHERE event_type = 'SUBIEKT_CORRECTION' ORDER BY rowid").all() as any[];
const kfs = (overrides: Partial<Pos> = {}, docOverrides: Partial<Doc> = {}) =>
    doc(102, 'KFS', {
        parent_external_id: 101, net_total: -200,
        positions: [pos(1020, { quantity: 5, net_total: 500, corrects_position_external_id: 1010, ...overrides })],
        ...docOverrides,
    });

test('10. KFS → one SUBIEKT_CORRECTION row "FS qty → KFS qty", visible in getProjectZkChanges of the project', async () => {
    // Stan z testu 5: FS 101 (rodzic ZK 100) ma pozycję 1010: 7 szt × 100 = 700.
    const response = await sync([kfs()]);
    assert.equal(response.accepted, 1);
    assert.equal(docRow(102).assignment_status, 'AUTO');

    const logs = correctionLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].user_id, null);
    assert.equal(logs[0].subject_id, docRow(102).id);
    assert.equal(logs[0].description, 'KFS 102/10/2026 (korekta FS 101/10/2026): Tapeta Test 7 → 5 szt; wartość korekty -200,00 zł');
    assert.equal(JSON.parse(logs[0].metadata).projectId, docRow(100).project_id);

    const changes = await getProjectZkChanges(docRow(100).project_id);
    assert.ok(changes.some((c) => c.id === logs[0].id), 'korekta w historii projektu (admin i architekt)');
    assert.equal(changeLogs().filter((l) => l.subject_id === docRow(102).id).length, 0, 'KFS nie udaje zmiany ZK');
});

test('11. KFS re-sent unchanged or with remarks only → no new row; changed correction → new row', async () => {
    assert.equal((await sync([kfs()])).unchanged, 1);
    assert.equal((await sync([kfs({}, { remarks: 'korekta ilości' })])).accepted, 1, 'hash się zmienił');
    assert.equal(correctionLogs().length, 1);

    await sync([kfs({ quantity: 4, net_total: 400 }, { net_total: -300, remarks: 'korekta ilości' })]);
    const logs = correctionLogs();
    assert.equal(logs.length, 2);
    assert.equal(logs[1].description, 'KFS 102/10/2026 (korekta FS 101/10/2026): Tapeta Test 7 → 4 szt; wartość korekty -300,00 zł');
});
