// Testy integracyjne synchronizacji Subiekt (src/lib/subiekt/sync.ts + route handlery) na tymczasowej
// bazie SQLite: prawdziwe wiersze w subiekt_documents / subiekt_document_snapshots / subiekt_sync_runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type SyncModule = typeof import('../src/lib/subiekt/sync');
type DbModule = typeof import('../src/lib/db');
type AuthModule = typeof import('../src/lib/subiekt/auth');
type TypesModule = typeof import('../src/lib/subiekt/types');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const { processSyncPage }: SyncModule = await import(new URL('../src/lib/subiekt/sync.ts', import.meta.url).href);
const { withTransaction, query }: DbModule = await import(new URL('../src/lib/db.ts', import.meta.url).href);
const { signSubiektRequest }: AuthModule = await import(new URL('../src/lib/subiekt/auth.ts', import.meta.url).href);
const { SUBIEKT_SYNC_MAX_DOCUMENTS }: TypesModule = await import(new URL('../src/lib/subiekt/types.ts', import.meta.url).href);
const db = testDb.db;

test.after(() => testDb.cleanup());

type Doc = import('../src/lib/subiekt/types').SubiektDocumentPayload;
type SyncRequest = import('../src/lib/subiekt/types').SubiektSyncRequest;

function makeDoc(externalId: number, overrides: Partial<Doc> = {}): Doc {
    return {
        external_id: externalId,
        type: 'ZK',
        number: `ZK ${externalId}/10/2026`,
        issued_at: '2026-10-20',
        contractor_name: 'Jan Testowy',
        contractor_nip: null,
        architect_code: 'A-001',
        parent_external_id: null,
        net_total: 1000,
        gross_total: 1230,
        is_paid: false,
        remarks: null,
        positions: [
            {
                external_id: externalId * 10,
                ordinal: 1,
                product_id: 77,
                name: 'Tapeta Test',
                quantity: 10,
                unit: 'szt',
                unit_price_net: 100,
                net_total: 1000,
                corrects_position_external_id: null,
            },
        ],
        ...overrides,
    };
}

function makeRequest(documents: Doc[], overrides: Partial<SyncRequest> = {}): SyncRequest {
    return { run_id: randomUUID(), agent_version: '0.1.0', page: 1, pages: 1, documents, ...overrides };
}

const docRow = (externalId: number) => db.prepare('SELECT * FROM subiekt_documents WHERE external_id = ?').get(externalId) as any;
const runRow = (runId: string) => db.prepare('SELECT * FROM subiekt_sync_runs WHERE id = ?').get(runId) as any;
const snapshotCount = (externalIds: number[]) =>
    (db.prepare(
        `SELECT COUNT(*) AS c FROM subiekt_document_snapshots s JOIN subiekt_documents d ON d.id = s.document_id
         WHERE d.external_id IN (${externalIds.map(() => '?').join(',')})`
    ).get(...externalIds) as any).c as number;
const docCount = (externalIds: number[]) =>
    (db.prepare(`SELECT COUNT(*) AS c FROM subiekt_documents WHERE external_id IN (${externalIds.map(() => '?').join(',')})`)
        .get(...externalIds) as any).c as number;

// Dokumenty 1001–1003 przechodzą przez kolejne testy (świeże → bez zmian → zmiana ilości → zapłata).
const BASE_IDS = [1001, 1002, 1003];
const baseDocs = () => BASE_IDS.map((id) => makeDoc(id));

test('schema from seed-dev already contains the Subiekt tables (migration 019 not applied twice)', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'subiekt_%' ORDER BY name").all() as any[])
        .map((t) => t.name);
    assert.deepEqual(tables, ['subiekt_document_snapshots', 'subiekt_documents', 'subiekt_sync_runs']);
    const userCols = (db.prepare('PRAGMA table_info(users)').all() as any[]).map((c) => c.name);
    const itemCols = (db.prepare('PRAGMA table_info(project_items)').all() as any[]).map((c) => c.name);
    assert.ok(userCols.includes('subiekt_code'));
    assert.ok(itemCols.includes('type_overridden'));
});

test('page with 3 new documents → 3 documents, 3 snapshots, run DONE with counters', async () => {
    const request = makeRequest(baseDocs());
    const response = await processSyncPage(request);

    assert.deepEqual(response, { run_id: request.run_id, accepted: 3, unchanged: 0, rejected: [], unassigned: 3 });
    assert.equal(docCount(BASE_IDS), 3);
    assert.equal(snapshotCount(BASE_IDS), 3);

    const doc = docRow(1001);
    assert.match(doc.id, /^sd_[0-9a-f]{12}$/);
    assert.equal(doc.assignment_status, 'UNASSIGNED');
    assert.equal(doc.assignment_note, 'MAPPING_NOT_ENABLED');
    assert.equal(doc.project_id, null);
    assert.equal(doc.architect_id, null);
    assert.equal(doc.root_external_id, null);
    assert.equal(doc.last_run_id, request.run_id);
    assert.equal(doc.architect_code, 'A-001');
    assert.deepEqual(JSON.parse(doc.positions_json), makeDoc(1001).positions);
    assert.match(doc.content_hash, /^[0-9a-f]{64}$/);

    const run = runRow(request.run_id);
    assert.equal(run.status, 'DONE');
    assert.ok(run.finished_at);
    assert.equal(run.agent_version, '0.1.0');
    assert.equal(run.pages_received, 1);
    assert.equal(run.pages_expected, 1);
    assert.equal(run.documents_accepted, 3);
    assert.equal(run.documents_unchanged, 0);
    assert.equal(run.documents_rejected, 0);
    assert.equal(run.documents_unassigned, 3);
});

test('same page again (new run) is idempotent → unchanged = 3, no new rows or snapshots, last_seen moves', async () => {
    const before = docRow(1001);
    db.prepare("UPDATE subiekt_documents SET last_seen_at = '2000-01-01 00:00:00' WHERE external_id IN (1001, 1002, 1003)").run();

    const request = makeRequest(baseDocs());
    const response = await processSyncPage(request);

    assert.deepEqual(response, { run_id: request.run_id, accepted: 0, unchanged: 3, rejected: [], unassigned: 3 });
    assert.equal(docCount(BASE_IDS), 3);
    assert.equal(snapshotCount(BASE_IDS), 3);

    const after = docRow(1001);
    assert.equal(after.id, before.id);
    assert.equal(after.content_hash, before.content_hash);
    assert.equal(after.last_changed_at, before.last_changed_at);
    assert.equal(after.last_run_id, request.run_id);
    assert.ok(after.last_seen_at > '2000-01-01 00:00:00', 'last_seen_at zaktualizowane');
    assert.equal(runRow(request.run_id).documents_unchanged, 3);
});

test('changed quantity in one document → accepted 1, unchanged 2, new snapshot, content updated', async () => {
    const before = docRow(1002);
    db.prepare("UPDATE subiekt_documents SET last_changed_at = '2000-01-01 00:00:00' WHERE external_id = 1002").run();

    const changed = makeDoc(1002);
    changed.positions = [{ ...changed.positions[0], quantity: 12, net_total: 1200 }];
    changed.net_total = 1200;
    changed.gross_total = 1476;
    const request = makeRequest([makeDoc(1001), changed, makeDoc(1003)]);
    const response = await processSyncPage(request);

    assert.deepEqual(response, { run_id: request.run_id, accepted: 1, unchanged: 2, rejected: [], unassigned: 3 });
    assert.equal(docCount(BASE_IDS), 3);
    assert.equal(snapshotCount(BASE_IDS), 4);

    const after = docRow(1002);
    assert.equal(after.id, before.id);
    assert.notEqual(after.content_hash, before.content_hash);
    assert.ok(after.last_changed_at > '2000-01-01 00:00:00', 'last_changed_at zaktualizowane');
    assert.equal(JSON.parse(after.positions_json)[0].quantity, 12);
    assert.equal(Number(after.net_total), 1200);
    assert.equal(Number(after.gross_total), 1476);

    const snapshot = db.prepare('SELECT * FROM subiekt_document_snapshots WHERE document_id = ? AND run_id = ?').get(after.id, request.run_id) as any;
    assert.equal(snapshot.content_hash, after.content_hash);
    assert.equal(Number(snapshot.net_total), 1200);
});

test('is_paid flip alone → unchanged, column updated, no new snapshot', async () => {
    const before = docRow(1003);
    const snapshotsBefore = snapshotCount(BASE_IDS);
    assert.equal(before.is_paid, 0);

    const request = makeRequest([makeDoc(1003, { is_paid: true })]);
    const response = await processSyncPage(request);

    assert.deepEqual(response, { run_id: request.run_id, accepted: 0, unchanged: 1, rejected: [], unassigned: 1 });
    const after = docRow(1003);
    assert.equal(after.is_paid, 1);
    assert.equal(after.content_hash, before.content_hash);
    assert.equal(snapshotCount(BASE_IDS), snapshotsBefore);
});

test('2-page run stays RUNNING after page 1 and is DONE after page 2 with summed counters', async () => {
    const runId = randomUUID();
    const page1 = await processSyncPage(makeRequest([makeDoc(2001), makeDoc(2002)], { run_id: runId, page: 1, pages: 2 }));
    assert.equal(page1.accepted, 2);

    let run = runRow(runId);
    assert.equal(run.status, 'RUNNING');
    assert.equal(run.finished_at, null);
    assert.equal(run.pages_received, 1);
    assert.equal(run.pages_expected, 2);
    assert.equal(run.documents_accepted, 2);

    // Strona 2: jeden nowy, jeden już znany z poprzednich testów (bez zmian).
    const page2 = await processSyncPage(makeRequest([makeDoc(2003), makeDoc(1001)], { run_id: runId, page: 2, pages: 2 }));
    assert.deepEqual(page2, { run_id: runId, accepted: 1, unchanged: 1, rejected: [], unassigned: 2 });

    run = runRow(runId);
    assert.equal(run.status, 'DONE');
    assert.ok(run.finished_at);
    assert.equal(run.pages_received, 2);
    assert.equal(run.documents_accepted, 3);
    assert.equal(run.documents_unchanged, 1);
    assert.equal(run.documents_unassigned, 4);
});

test('a document violating a DB constraint is rejected with INTERNAL_ERROR, the rest of the page is saved', async (t) => {
    t.mock.method(console, 'error', () => {}); // oczekiwany błąd — nie zaśmiecać wyniku testów
    const broken = makeDoc(3002, { number: null as any });
    const request = makeRequest([makeDoc(3001), broken, makeDoc(3003)]);
    const response = await processSyncPage(request);

    assert.equal(response.accepted, 2);
    assert.equal(response.unchanged, 0);
    assert.equal(response.unassigned, 2);
    assert.equal(response.rejected.length, 1);
    assert.equal(response.rejected[0].external_id, 3002);
    assert.match(response.rejected[0].reason, /^INTERNAL_ERROR:.*NOT NULL/);

    assert.equal(docCount([3001, 3003]), 2);
    assert.equal(docRow(3002), undefined);
    assert.equal(snapshotCount([3001, 3003]), 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM subiekt_document_snapshots WHERE run_id = ?').get(request.run_id).c, 2);
    assert.equal(runRow(request.run_id).documents_rejected, 1);
});

test('called inside an outer withTransaction that throws → document writes roll back (no savepoints)', async () => {
    const request = makeRequest([makeDoc(4001)]);
    await assert.rejects(
        withTransaction(async () => {
            const response = await processSyncPage(request);
            assert.equal(response.accepted, 1);
            throw new Error('outer failure');
        }),
        /outer failure/
    );
    assert.equal(docRow(4001), undefined);
    assert.equal(snapshotCount([4001]), 0);
    assert.equal(runRow(request.run_id), undefined);
});

test('query from a stray callback after COMMIT warns and still runs outside the transaction', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    let stray: Promise<unknown> | undefined;
    await withTransaction(async () => {
        stray = new Promise((resolve) => setTimeout(() => resolve(query('SELECT COUNT(*) AS c FROM subiekt_sync_runs')), 5));
    });
    const rows = (await stray) as Array<{ c: number }>;
    assert.ok(Number(rows[0].c) >= 1);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0].arguments[1]), /^SELECT COUNT\(\*\) AS c FROM subiekt_sync_runs/);
});

// --- Route handlery: podpis, kody odpowiedzi, kształt odpowiedzi ---

const TOKEN = 'a'.repeat(64);
const SECRET = 'b'.repeat(64);
process.env.SUBIEKT_SYNC_TOKEN = TOKEN;
process.env.SUBIEKT_SYNC_SECRET = SECRET;
const syncRoute = await import(new URL('../src/app/api/integrations/subiekt/sync/route.ts', import.meta.url).href);
const statusRoute = await import(new URL('../src/app/api/integrations/subiekt/status/route.ts', import.meta.url).href);

let ipSeq = 0;
function signedRequest(method: 'POST' | 'GET', path: string, body: string, opts: { token?: string; ip?: string } = {}) {
    const ts = Math.floor(Date.now() / 1000);
    return new Request(`http://localhost${path}`, {
        method,
        headers: {
            // Wielkość liter nagłówków celowo mieszana — Headers.get jest niewrażliwe.
            AUTHORIZATION: `Bearer ${opts.token ?? TOKEN}`,
            'X-Subiekt-Timestamp': String(ts),
            'x-SUBIEKT-signature': signSubiektRequest(SECRET, ts, body),
            'Content-Type': 'application/json',
            'X-Forwarded-For': `${opts.ip ?? `10.0.0.${++ipSeq}`}, 172.16.0.1`,
        },
        body: method === 'POST' ? body : undefined,
    });
}

test('POST /sync: signed page → 200 with SubiektSyncResponse; replay → unchanged', async () => {
    const body = JSON.stringify(makeRequest([makeDoc(5001)]));
    const first = await syncRoute.POST(signedRequest('POST', '/api/integrations/subiekt/sync', body));
    assert.equal(first.status, 200);
    const json = await first.json();
    assert.deepEqual(Object.keys(json).sort(), ['accepted', 'rejected', 'run_id', 'unassigned', 'unchanged']);
    assert.equal(json.accepted, 1);
    assert.equal(json.unassigned, 1);

    const second = await syncRoute.POST(signedRequest('POST', '/api/integrations/subiekt/sync', body));
    assert.equal((await second.json()).unchanged, 1);
    assert.equal(docCount([5001]), 1);
});

test('POST /sync: wrong token 401, body changed after signing 401, bad JSON 400, schema 400, too many 413', async () => {
    const body = JSON.stringify(makeRequest([makeDoc(5002)]));
    const wrongToken = await syncRoute.POST(signedRequest('POST', '/api/integrations/subiekt/sync', body, { token: 'c'.repeat(64) }));
    assert.equal(wrongToken.status, 401);
    assert.deepEqual(await wrongToken.json(), { error: 'BAD_TOKEN' });

    const signed = signedRequest('POST', '/api/integrations/subiekt/sync', body);
    const tampered = new Request(signed.url, { method: 'POST', headers: signed.headers, body: body + ' ' });
    const tamperedRes = await syncRoute.POST(tampered);
    assert.equal(tamperedRes.status, 401);
    assert.deepEqual(await tamperedRes.json(), { error: 'BAD_SIGNATURE' });

    const badJson = await syncRoute.POST(signedRequest('POST', '/api/integrations/subiekt/sync', '{not json'));
    assert.equal(badJson.status, 400);
    assert.deepEqual(await badJson.json(), { error: 'INVALID_JSON' });

    const badSchema = await syncRoute.POST(signedRequest('POST', '/api/integrations/subiekt/sync', JSON.stringify({ run_id: 'x' })));
    assert.equal(badSchema.status, 400);
    assert.match((await badSchema.json()).error, /run_id/);

    const many = Array.from({ length: SUBIEKT_SYNC_MAX_DOCUMENTS + 1 }, (_, i) => makeDoc(6000 + i));
    const tooMany = await syncRoute.POST(signedRequest('POST', '/api/integrations/subiekt/sync', JSON.stringify(makeRequest(many))));
    assert.equal(tooMany.status, 413);
    assert.deepEqual(await tooMany.json(), { error: 'TOO_MANY_DOCUMENTS' });
    assert.equal(docRow(5002), undefined);
});

test('POST /sync: 61st call from one IP within 10 minutes → 429', async () => {
    const ip = '192.0.2.77';
    for (let i = 0; i < 60; i++) {
        const res = await syncRoute.POST(signedRequest('POST', '/api/integrations/subiekt/sync', '{not json', { ip }));
        assert.equal(res.status, 400);
    }
    const limited = await syncRoute.POST(signedRequest('POST', '/api/integrations/subiekt/sync', '{not json', { ip }));
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { error: 'Too many requests' });
});

test('GET /status: last run and unassigned count; missing configuration → 503', async (t) => {
    const res = await statusRoute.GET(signedRequest('GET', '/api/integrations/subiekt/status', ''));
    assert.equal(res.status, 200);
    const json = await res.json();
    const expectedCount = db.prepare("SELECT COUNT(*) AS c FROM subiekt_documents WHERE assignment_status = 'UNASSIGNED'").get().c;
    assert.equal(json.unassigned_count, expectedCount);
    assert.ok(json.last_run);
    assert.equal(json.last_run.status, 'DONE');

    t.mock.method(console, 'warn', () => {});
    delete process.env.SUBIEKT_SYNC_SECRET;
    try {
        const notConfigured = await statusRoute.GET(signedRequest('GET', '/api/integrations/subiekt/status', ''));
        assert.equal(notConfigured.status, 503);
        assert.deepEqual(await notConfigured.json(), { error: 'Integracja Subiekt nie jest skonfigurowana' });
    } finally {
        process.env.SUBIEKT_SYNC_SECRET = SECRET;
    }
});
