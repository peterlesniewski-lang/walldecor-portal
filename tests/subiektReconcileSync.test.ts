// Loop 5b (PLAN-SUBIEKT-2026-10-29.md): uzgodnienie faktur z zamówieniem na prawdziwym SQLite —
// tryby łańcucha w syncChainOf, wiersze subiekt_reconciliations, blokada ZAKOŃCZONY, resolveReconciliationOp,
// łączenie / przenoszenie projektów z uzgodnieniami.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type StubsModule = typeof import('./helpers/nextServerStubs');
type SyncModule = typeof import('../src/lib/subiekt/sync');
type AdminOpsModule = typeof import('../src/lib/subiekt/adminOps');
type StatusModule = typeof import('../src/lib/subiekt/status');
type ProjectsModule = typeof import('../src/app/actions/projects');
type SubiektActionsModule = typeof import('../src/app/actions/subiekt');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { setTestSession }: StubsModule = await import(new URL('./helpers/nextServerStubs.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const { processSyncPage }: SyncModule = await import(new URL('../src/lib/subiekt/sync.ts', import.meta.url).href);
const ops: AdminOpsModule = await import(new URL('../src/lib/subiekt/adminOps.ts', import.meta.url).href);
const status: StatusModule = await import(new URL('../src/lib/subiekt/status.ts', import.meta.url).href);
const projectActions: ProjectsModule = await import(new URL('../src/app/actions/projects.ts', import.meta.url).href);
const subiektActions: SubiektActionsModule = await import(new URL('../src/app/actions/subiekt.ts', import.meta.url).href);
const db = testDb.db;

test.after(() => testDb.cleanup());

type Doc = import('../src/lib/subiekt/types').SubiektDocumentPayload;
type Pos = import('../src/lib/subiekt/types').SubiektPositionPayload;

const ADMIN = 'u_admin';
const ARCHI_A = 'u_archi_a';
const ARCHI_B = 'u_archi_b';
const RATE = 0.10; // bez obrotu i bez override → Partner 10%
db.prepare("INSERT INTO users (id, name, email, role) VALUES (?, 'Admin Główny', 'admin@test.local', 'ADMIN')").run(ADMIN);
db.prepare("INSERT INTO users (id, name, email, role, subiekt_code) VALUES (?, 'Architekt A', 'a@test.local', 'ARCHI', 'A-001')").run(ARCHI_A);
db.prepare("INSERT INTO users (id, name, email, role, subiekt_code) VALUES (?, 'Architekt B', 'b@test.local', 'ARCHI', 'A-002')").run(ARCHI_B);
setTestSession({ id: ADMIN, role: 'ADMIN', name: 'Admin Główny' });

const product = (externalId: number, overrides: Partial<Pos> = {}): Pos => ({
    external_id: externalId, ordinal: 1, product_id: 77, name: 'Tapeta Floral', quantity: 1, unit: 'szt',
    unit_price_net: 536.59, net_total: 536.59, corrects_position_external_id: null, ...overrides,
});
const service = (externalId: number, overrides: Partial<Pos> = {}): Pos => ({
    external_id: externalId, ordinal: 2, product_id: null, name: 'Montaż', quantity: 1, unit: 'usł',
    unit_price_net: 300, net_total: 300, corrects_position_external_id: null, ...overrides,
});
const collective = (externalId: number, net: number, name = 'Usługa'): Pos =>
    service(externalId, { ordinal: 1, name, unit_price_net: net, net_total: net });

function doc(externalId: number, type: Doc['type'], positions: Pos[], overrides: Partial<Doc> = {}): Doc {
    const net = Math.round(positions.reduce((s, p) => s + p.net_total, 0) * 100) / 100;
    return {
        external_id: externalId, type, number: `${type} ${externalId}/10/2026`, issued_at: '2026-10-20',
        contractor_name: 'Jan Testowy', contractor_nip: null, architect_code: type === 'ZK' ? 'A-001' : null,
        parent_external_id: null, net_total: net, gross_total: Math.round(net * 123) / 100, is_paid: false,
        remarks: null, positions, ...overrides,
    };
}
/** ZK z produktem 536,59 (karta 77) i montażem 300,00 (jednorazowa) = 836,59. */
const zk = (id: number, overrides: Partial<Doc> = {}) => doc(id, 'ZK', [product(id * 10 + 1), service(id * 10 + 2)], overrides);
const fs = (id: number, parent: number, positions: Pos[], overrides: Partial<Doc> = {}) =>
    doc(id, 'FS', positions, { parent_external_id: parent, ...overrides });

const sync = (documents: Doc[]) =>
    processSyncPage({ run_id: randomUUID(), agent_version: '0.1.0', page: 1, pages: 1, documents });

function approx(actual: unknown, expected: number, message?: string) {
    assert.ok(Math.abs(Number(actual) - expected) < 0.005, `${message ?? 'kwota'}: ${actual} ≠ ${expected}`);
}

const docRow = (externalId: number) => db.prepare('SELECT * FROM subiekt_documents WHERE external_id = ?').get(externalId) as any;
const projectOf = (externalId: number) => String(docRow(externalId).project_id);
const projectRow = (id: string) => db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
/** Pozycje z kwotą > 0 (w ZAKOŃCZONY usunięte pozycje zostają z kwotą 0). */
const liveItems = (projectId: string) =>
    db.prepare('SELECT * FROM project_items WHERE project_id = ? AND amount_net > 0 ORDER BY subiekt_position_id').all(projectId) as any[];
const itemsOfDoc = (externalId: number) =>
    db.prepare('SELECT i.* FROM project_items i JOIN subiekt_documents d ON d.id = i.subiekt_document_id WHERE d.external_id = ? AND i.amount_net > 0 ORDER BY i.subiekt_position_id')
        .all(externalId) as any[];
const reconciliation = (projectId: string, root: number) =>
    db.prepare('SELECT * FROM subiekt_reconciliations WHERE project_id = ? AND root_external_id = ?').get(projectId, root) as any;
const commissionSum = (projectId: string, statuses = ['PENDING', 'EARNED']) =>
    Number((db.prepare(`SELECT COALESCE(SUM(amount_net), 0) AS s FROM commissions WHERE project_id = ? AND status IN (${statuses.map(() => '?').join(',')})`)
        .get(projectId, ...statuses) as any).s);
const logs = (eventType: string, subjectId?: string) =>
    (subjectId
        ? db.prepare('SELECT * FROM activity_logs WHERE event_type = ? AND subject_id = ? ORDER BY rowid').all(eventType, subjectId)
        : db.prepare('SELECT * FROM activity_logs WHERE event_type = ? ORDER BY rowid').all(eventType)) as any[];
const amountsOf = (projectId: string) => liveItems(projectId).map((i) => Math.round(Number(i.amount_net) * 100) / 100);

async function resolve(projectId: string, root: number, amounts: number[], note?: string) {
    const items = liveItems(projectId);
    assert.equal(items.length, amounts.length, 'jedna kwota na pozycję');
    return ops.resolveReconciliationOp({
        projectId, rootExternalId: root, note,
        amounts: items.map((item, i) => ({ itemId: item.id, amount_net: amounts[i] })),
    }, ADMIN);
}

// --- schemat ---

test('schema: migration 021, ensure-production-schema and seed define subiekt_reconciliations', async () => {
    const migration = await readFile(new URL('../migrations/021_subiekt_reconciliations.sql', import.meta.url), 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS subiekt_reconciliations/);
    assert.match(migration, /UNIQUE \(project_id, root_external_id\)/);
    assert.match(migration, /idx_subiekt_reconciliations_status/);
    const schema = await readFile(new URL('../scripts/ensure-production-schema.mjs', import.meta.url), 'utf8');
    const block = schema.slice(schema.indexOf("name: 'subiekt_reconciliations'"));
    assert.match(block, /fingerprint VARCHAR\(2000\) NOT NULL/);
    assert.match(block, /amounts_json MEDIUMTEXT NULL/);
    assert.match(block, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/);
    const seed = await readFile(new URL('../scripts/seed-dev.mjs', import.meta.url), 'utf8');
    assert.match(seed, /CREATE TABLE subiekt_reconciliations/);
});

// --- ORDER_BREAKDOWN: FS zbiorcza na kwotę ZK ---

test('ORDER_BREAKDOWN: one collective FS position for the ZK amount → items from ZK, commission from 536.59, no reconciliation', async () => {
    await sync([zk(100)]);
    const projectId = projectOf(100);
    assert.deepEqual(amountsOf(projectId), [536.59, 300]);

    await sync([fs(110, 100, [collective(1101, 836.59)])]);
    const items = liveItems(projectId);
    assert.deepEqual(items.map((i) => [i.type, Number(i.amount_net)]), [['PRODUCT', 536.59], ['INSTALLATION', 300]]);
    assert.ok(items.every((i) => i.subiekt_document_id === docRow(100).id), 'pozycje z ZK');
    assert.equal(itemsOfDoc(110).length, 0, 'brak pozycji z FS');
    assert.ok(items.every((i) => i.invoice_number === 'FS 110/10/2026' && i.order_number === 'ZK 100/10/2026'));
    assert.ok(items.every((i) => Number(i.is_paid) === 0));
    approx(commissionSum(projectId), 536.59 * RATE, 'prowizja z rozbicia ZK');
    assert.equal(reconciliation(projectId, 100), undefined, 'bez uzgodnienia');
    assert.equal(await status.computeSuggestedStatus(projectId), 'W_REALIZACJI');

    // Zapłata nie zmienia hasha (UNCHANGED) — pozycje ZK dostają is_paid, gdy wszystkie FS łańcucha zapłacone.
    await sync([fs(110, 100, [collective(1101, 836.59)], { is_paid: true })]);
    assert.ok(liveItems(projectId).every((i) => Number(i.is_paid) === 1));
    assert.deepEqual(await status.getSuggestedStatus(projectId), { status: 'ZAKOŃCZONY', reason: null });
});

test('ORDER_BREAKDOWN: two FS (300 + 536.59) not mirroring by name, equal sum → items from ZK, invoice numbers by issued_at', async () => {
    await sync([zk(200)]);
    await sync([
        fs(212, 200, [product(2121, { name: 'Tapeta' })], { issued_at: '2026-10-25' }),
        fs(211, 200, [collective(2111, 300, 'Robocizna')], { issued_at: '2026-10-21' }),
    ]);
    const projectId = projectOf(200);
    assert.deepEqual(amountsOf(projectId), [536.59, 300]);
    assert.ok(liveItems(projectId).every((i) => i.invoice_number === 'FS 211/10/2026, FS 212/10/2026'));
    // Pierwsza FS sama (536,59 ≠ 836,59) na chwilę otwiera uzgodnienie, druga zrównuje sumy → zamknięte automatycznie.
    assert.equal(reconciliation(projectId, 200).status, 'AUTO_CLOSED');
    assert.equal(await status.hasOpenReconciliation(projectId), false);
});

test('MIRROR: two FS mirroring the ZK positions 1:1 → items from FS (as before loop 5b)', async () => {
    await sync([zk(300)]);
    await sync([fs(311, 300, [product(3111)]), fs(312, 300, [service(3121, { name: 'montaż ' })])]);
    const projectId = projectOf(300);
    const items = liveItems(projectId);
    assert.deepEqual(items.map((i) => Number(i.amount_net)), [536.59, 300]);
    assert.deepEqual(items.map((i) => i.invoice_number), ['FS 311/10/2026', 'FS 312/10/2026']);
    assert.equal(itemsOfDoc(300).length, 0, 'pozycje ZK zniknęły');
    approx(commissionSum(projectId), 536.59 * RATE);
    // Faktura częściowa (tylko produkt) otwiera uzgodnienie do czasu drugiej FS — potem MIRROR i AUTO_CLOSED.
    assert.equal(reconciliation(projectId, 300).status, 'AUTO_CLOSED');
    assert.equal(logs('SUBIEKT_RECONCILIATION_CLOSED', docRow(300).id).length, 1);
});

// --- RECONCILE → RESOLVED → OPEN ---

test('RECONCILE: FS for 900.00 → OPEN, items from ZK, one OPENED log, status cannot be ZAKOŃCZONY', async () => {
    await sync([fs(110, 100, [collective(1101, 900)], { is_paid: true })]);
    const projectId = projectOf(100);
    const row = reconciliation(projectId, 100);
    assert.equal(row.status, 'OPEN');
    approx(row.zk_net, 836.59);
    approx(row.invoiced_net, 900);
    assert.equal(row.fingerprint, '110:900.00');
    assert.ok(row.opened_at);
    assert.deepEqual(amountsOf(projectId), [536.59, 300], 'pozycje z ZK do czasu uzgodnienia');
    approx(commissionSum(projectId), 536.59 * RATE);

    const opened = logs('SUBIEKT_RECONCILIATION_OPENED', docRow(100).id);
    assert.equal(opened.length, 1);
    assert.equal(opened[0].user_id, null);
    const meta = JSON.parse(opened[0].metadata);
    assert.equal(meta.projectId, projectId);
    approx(meta.zk_net, 836.59);
    approx(meta.invoiced_net, 900);
    assert.deepEqual(meta.invoices, ['FS 110/10/2026']);
    assert.match(opened[0].description, /ZK 100\/10\/2026/);

    // Ponowny sync bez zmian — bez nowego wpisu.
    await sync([zk(100), fs(110, 100, [collective(1101, 900)], { is_paid: true })]);
    assert.equal(logs('SUBIEKT_RECONCILIATION_OPENED', docRow(100).id).length, 1);

    assert.deepEqual(await status.getSuggestedStatus(projectId), { status: 'W_REALIZACJI', reason: 'RECONCILE_OPEN' });
    assert.equal(await status.computeSuggestedStatus(projectId), 'W_REALIZACJI');
    assert.equal(await status.hasOpenReconciliation(projectId), true);

    // Ręczna zmiana statusu na ZAKOŃCZONY — błąd domenowy, bez wyjątku, status bez zmian.
    const result = await projectActions.updateProjectStatus(projectId, 'ZAKOŃCZONY');
    assert.deepEqual(result, { success: false, error: 'Projekt ma nieuzgodnione faktury z Subiekta. Uzgodnij je przed zakończeniem.' });
    assert.equal(projectRow(projectId).status, 'PRZYJĘTY');
    // Inne zmiany statusu działają.
    assert.deepEqual(await projectActions.updateProjectStatus(projectId, 'W_REALIZACJI'), { success: true });
});

test('resolveReconciliationOp validates input and state without changing anything', async () => {
    const projectId = projectOf(100);
    const items = liveItems(projectId);
    const base = { projectId, rootExternalId: 100 };
    const all = (a: number, b: number) => [{ itemId: items[0].id, amount_net: a }, { itemId: items[1].id, amount_net: b }];
    await assert.rejects(ops.resolveReconciliationOp({ ...base, amounts: all(500, 300) }, ADMIN), /Suma kwot \(800,00 zł\) musi być równa kwocie faktur \(900,00 zł\)/);
    await assert.rejects(ops.resolveReconciliationOp({ ...base, amounts: all(600, 300).slice(0, 1) }, ADMIN), /wszystkich pozycji/);
    await assert.rejects(ops.resolveReconciliationOp({ ...base, amounts: [...all(600, 300).slice(0, 1), { itemId: 'obca', amount_net: 300 }] }, ADMIN), /nie należy do tego zamówienia/);
    await assert.rejects(ops.resolveReconciliationOp({ ...base, amounts: all(-1, 901) }, ADMIN), /nie mniejszymi niż 0/);
    await assert.rejects(ops.resolveReconciliationOp({ ...base, amounts: all(600.001, 299.999) }, ADMIN), /do grosza/);
    await assert.rejects(ops.resolveReconciliationOp({ ...base, amounts: all(600, 300), note: 'x'.repeat(501) }, ADMIN), /500 znaków/);
    await assert.rejects(ops.resolveReconciliationOp({ ...base, rootExternalId: 999, amounts: all(600, 300) }, ADMIN), /Brak uzgodnienia/);

    // Stan dokumentów inny niż ten, który admin widział → odśwież stronę.
    db.prepare("UPDATE subiekt_reconciliations SET fingerprint = '110:1.00' WHERE project_id = ? AND root_external_id = 100").run(projectId);
    await assert.rejects(ops.resolveReconciliationOp({ ...base, amounts: all(600, 300) }, ADMIN), /Dokumenty zmieniły się, odśwież stronę/);
    db.prepare("UPDATE subiekt_reconciliations SET fingerprint = '110:900.00' WHERE project_id = ? AND root_external_id = 100").run(projectId);

    assert.deepEqual(amountsOf(projectId), [536.59, 300]);
    assert.equal(reconciliation(projectId, 100).status, 'OPEN');
    assert.equal(logs('SUBIEKT_RECONCILIATION_RESOLVED').length, 0);
});

test('resolveReconciliationOp 600 + 300 → RESOLVED, amounts and commission updated, a later sync keeps them', async () => {
    const projectId = projectOf(100);
    const result = await resolve(projectId, 100, [600, 300], 'Zbiorcza FS — produkt wyceniony wyżej');
    assert.deepEqual(result.affectedProjectIds, [projectId]);

    const row = reconciliation(projectId, 100);
    assert.equal(row.status, 'RESOLVED');
    assert.equal(row.resolved_by, ADMIN);
    assert.ok(row.resolved_at);
    assert.equal(row.note, 'Zbiorcza FS — produkt wyceniony wyżej');
    assert.deepEqual(JSON.parse(row.amounts_json), { 1001: 600, 1002: 300 });
    assert.deepEqual(amountsOf(projectId), [600, 300]);
    approx(commissionSum(projectId), 600 * RATE, 'prowizja z 600');

    const resolved = logs('SUBIEKT_RECONCILIATION_RESOLVED', docRow(100).id);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].user_id, ADMIN);
    const meta = JSON.parse(resolved[0].metadata);
    assert.deepEqual(meta.before.map((b: any) => b.amount_net), [536.59, 300]);
    assert.deepEqual(meta.after.map((a: any) => a.amount_net), [600, 300]);

    assert.deepEqual(await status.getSuggestedStatus(projectId), { status: 'ZAKOŃCZONY', reason: null });

    // Kolejny sync bez zmian dokumentów nie nadpisuje decyzji admina.
    const commissionsBefore = db.prepare('SELECT COUNT(*) AS c FROM commissions WHERE project_id = ?').get(projectId) as any;
    await sync([zk(100), fs(110, 100, [collective(1101, 900)], { is_paid: true })]);
    await sync([zk(100, { remarks: 'zmiana uwag' })]);
    assert.deepEqual(amountsOf(projectId), [600, 300]);
    assert.equal(reconciliation(projectId, 100).status, 'RESOLVED');
    assert.equal((db.prepare('SELECT COUNT(*) AS c FROM commissions WHERE project_id = ?').get(projectId) as any).c, commissionsBefore.c);
    await assert.rejects(resolve(projectId, 100, [600, 300]), /nie jest otwarte/);
});

test('a new KFS −100 changes the fingerprint → OPEN again, 600 / 300 stay until the next decision', async () => {
    const projectId = projectOf(100);
    await sync([doc(120, 'KFS', [collective(1201, 800)].map((p) => ({ ...p, corrects_position_external_id: 1101 })), {
        parent_external_id: 110, net_total: -100,
    })]);
    assert.equal(docRow(120).assignment_status, 'AUTO');
    const row = reconciliation(projectId, 100);
    assert.equal(row.status, 'OPEN');
    assert.equal(row.fingerprint, '110:900.00;120:-100.00');
    approx(row.invoiced_net, 800);
    assert.deepEqual(amountsOf(projectId), [600, 300], 'poprzednie kwoty zostają');
    assert.equal(logs('SUBIEKT_RECONCILIATION_OPENED', docRow(100).id).length, 2);
    assert.equal((await status.getSuggestedStatus(projectId)).reason, 'RECONCILE_OPEN');

    // Nowa decyzja: 500 + 300 = 800; potem ZK zmienia się tak, że sumy się zrównują (ORDER_BREAKDOWN) —
    // RESOLVED z tym samym odciskiem: kwoty admina zostają.
    await resolve(projectId, 100, [500, 300]);
    assert.deepEqual(amountsOf(projectId), [500, 300]);
    await sync([doc(100, 'ZK', [product(1001, { net_total: 500, unit_price_net: 500 }), service(1002)])]);
    assert.equal(reconciliation(projectId, 100).status, 'RESOLVED');
    assert.deepEqual(amountsOf(projectId), [500, 300]);
});

test('ZK positions changed under a RESOLVED reconciliation (new position) → OPEN again, new position from ZK', async () => {
    const projectId = projectOf(100);
    await sync([doc(100, 'ZK', [product(1001, { net_total: 500, unit_price_net: 500 }), service(1002), product(1003, { ordinal: 3, product_id: 88, name: 'Klej', net_total: 50, unit_price_net: 50 })])]);
    assert.equal(reconciliation(projectId, 100).status, 'OPEN');
    assert.deepEqual(amountsOf(projectId), [500, 300, 50]);
});

test('advance FS 300 + final FS 836.59 (sum above ZK) → RECONCILE', async () => {
    await sync([zk(400)]);
    await sync([
        fs(411, 400, [collective(4111, 300, 'Zaliczka')], { issued_at: '2026-10-21' }),
        fs(412, 400, [product(4121), service(4122)], { issued_at: '2026-10-28' }),
    ]);
    const projectId = projectOf(400);
    const row = reconciliation(projectId, 400);
    assert.equal(row.status, 'OPEN');
    approx(row.invoiced_net, 1136.59);
    assert.deepEqual(amountsOf(projectId), [536.59, 300]);
    assert.equal(itemsOfDoc(411).length + itemsOfDoc(412).length, 0);
});

// --- przejścia MIRROR ↔ RECONCILE ---

test('MIRROR → RECONCILE → MIRROR keeps commissions consistent (in progress)', async () => {
    await sync([zk(500)]);
    await sync([fs(510, 500, [product(5101), service(5102)])]);
    const projectId = projectOf(500);
    assert.equal(itemsOfDoc(510).length, 2, 'MIRROR: pozycje z FS');
    approx(commissionSum(projectId), 536.59 * RATE);

    await sync([fs(511, 500, [collective(5111, 100, 'Dopłata')])]);
    assert.equal(reconciliation(projectId, 500).status, 'OPEN');
    assert.equal(itemsOfDoc(510).length, 0);
    assert.equal(itemsOfDoc(500).length, 2, 'RECONCILE: pozycje z ZK');
    approx(commissionSum(projectId), 536.59 * RATE);

    await ops.ignoreDocumentOp(docRow(511).id, 'duplikat', ADMIN);
    assert.equal(itemsOfDoc(510).length, 2, 'znów MIRROR');
    assert.equal(itemsOfDoc(500).length, 0);
    const row = reconciliation(projectId, 500);
    assert.equal(row.status, 'AUTO_CLOSED');
    assert.equal(logs('SUBIEKT_RECONCILIATION_CLOSED', docRow(500).id).length, 1);
    approx(commissionSum(projectId), 536.59 * RATE);
    const pending = db.prepare("SELECT COUNT(*) AS c FROM commissions WHERE project_id = ? AND status = 'PENDING'").get(projectId) as any;
    assert.equal(pending.c, 1, 'jedna PENDING — bez duplikatów');
});

test('MIRROR → RECONCILE → MIRROR on a ZAKOŃCZONY project: corrections net to the same EARNED commission', async (t) => {
    t.mock.method(console, 'warn', () => {});
    await sync([zk(600, { architect_code: 'A-002' })]);
    await sync([fs(610, 600, [product(6101), service(6102)], { is_paid: true })]);
    const projectId = projectOf(600);
    assert.deepEqual(await projectActions.updateProjectStatus(projectId, 'ZAKOŃCZONY'), { success: true });
    approx(commissionSum(projectId, ['EARNED']), 536.59 * RATE);

    await sync([fs(611, 600, [collective(6111, 100, 'Dopłata')], { is_paid: true })]);
    assert.equal(reconciliation(projectId, 600).status, 'OPEN');
    assert.deepEqual(amountsOf(projectId), [536.59, 300], 'pozycje z ZK, pozycje FS skorygowane do 0');
    approx(commissionSum(projectId, ['EARNED']), 536.59 * RATE);

    await ops.ignoreDocumentOp(docRow(611).id, 'duplikat', ADMIN);
    assert.equal(reconciliation(projectId, 600).status, 'AUTO_CLOSED');
    assert.equal(itemsOfDoc(610).length, 2);
    approx(commissionSum(projectId, ['EARNED']), 536.59 * RATE);
    const wallet = db.prepare("SELECT COALESCE(SUM(CASE WHEN type = 'EARN' THEN amount ELSE -amount END), 0) AS s FROM wallet_transactions WHERE user_id = ?").get(ARCHI_B) as any;
    approx(wallet.s, 536.59 * 0.02, 'cashback netto bez zmian');
});

test('type_overridden on a ZK item is kept in ORDER_BREAKDOWN', async () => {
    await sync([zk(700)]);
    const projectId = projectOf(700);
    const installation = liveItems(projectId).find((i) => i.type === 'INSTALLATION');
    await ops.overrideItemTypeOp(installation.id, 'PRODUCT', ADMIN);
    await sync([fs(710, 700, [collective(7101, 836.59)])]);
    const items = liveItems(projectId);
    assert.deepEqual(items.map((i) => i.type), ['PRODUCT', 'PRODUCT']);
    assert.equal(Number(items[1].type_overridden), 1);
    approx(commissionSum(projectId), 836.59 * RATE);
});

// --- łączenie, przenoszenie, ignorowanie ---

test('move: chain with an OPEN reconciliation → the row goes with the documents', async () => {
    await sync([zk(800)]);
    await sync([fs(810, 800, [collective(8101, 900)])]);
    const from = projectOf(800);
    db.prepare("INSERT INTO projects (id, owner_id, name, client_label, status, created_at) VALUES ('p_target8', ?, 'Cel', 'K', 'PRZYJĘTY', CURRENT_TIMESTAMP)").run(ARCHI_A);
    await ops.moveDocumentToProjectOp(docRow(800).id, 'p_target8', ADMIN);
    assert.equal(reconciliation(from, 800), undefined);
    const row = reconciliation('p_target8', 800);
    assert.equal(row.status, 'OPEN');
    assert.equal(logs('SUBIEKT_RECONCILIATION_OPENED', docRow(800).id).length, 1, 'przeniesienie nie otwiera drugi raz');
    assert.equal(await status.hasOpenReconciliation(from), false);
    assert.equal(await status.hasOpenReconciliation('p_target8'), true);
    assert.deepEqual(amountsOf('p_target8'), [536.59, 300]);
});

test('merge: a source project with an OPEN reconciliation → the row moves to the target', async () => {
    await sync([zk(900)]);
    await sync([fs(910, 900, [collective(9101, 900)])]);
    const source = projectOf(900);
    db.prepare("INSERT INTO projects (id, owner_id, name, client_label, status, created_at) VALUES ('p_merge9', ?, 'Cel', 'K', 'PRZYJĘTY', CURRENT_TIMESTAMP)").run(ARCHI_A);
    await ops.mergeProjectsOp('p_merge9', [source], ADMIN);
    assert.equal(reconciliation('p_merge9', 900).status, 'OPEN');
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM subiekt_reconciliations WHERE project_id = ?').get(source).c, 0);
});

test('ignore the root ZK of an OPEN chain → reconciliation AUTO_CLOSED (project no longer blocked)', async () => {
    await sync([zk(1000)]);
    await sync([fs(1010, 1000, [collective(10101, 900)])]);
    const projectId = projectOf(1000);
    assert.equal(await status.hasOpenReconciliation(projectId), true);
    await ops.ignoreDocumentOp(docRow(1000).id, 'test', ADMIN);
    assert.equal(reconciliation(projectId, 1000).status, 'AUTO_CLOSED');
    assert.equal(await status.hasOpenReconciliation(projectId), false);
});

// --- akcja ---

test('resolveReconciliationAction: ADMIN and STAFF, domain errors as { ok: false }, architect unauthorized', async () => {
    await sync([zk(1100)]);
    await sync([fs(1110, 1100, [collective(11101, 900)])]);
    const projectId = projectOf(1100);
    const items = liveItems(projectId);
    const amounts = [{ itemId: items[0].id, amount_net: 600 }, { itemId: items[1].id, amount_net: 300 }];

    setTestSession({ id: 'u_archi_a', role: 'ARCHI' });
    await assert.rejects(subiektActions.resolveReconciliationAction(projectId, 1100, amounts, ''), /Unauthorized/);
    setTestSession({ id: 'u_staff', role: 'STAFF' });
    assert.deepEqual(
        await subiektActions.resolveReconciliationAction(projectId, 1100, [{ itemId: items[0].id, amount_net: 1 }, amounts[1]], ''),
        { ok: false, error: 'Suma kwot (301,00 zł) musi być równa kwocie faktur (900,00 zł).' },
    );
    assert.deepEqual(await subiektActions.resolveReconciliationAction(projectId, 1100, amounts, ''), { ok: true });
    assert.equal(reconciliation(projectId, 1100).status, 'RESOLVED');
    assert.equal(reconciliation(projectId, 1100).note, null);
    setTestSession({ id: ADMIN, role: 'ADMIN', name: 'Admin Główny' });
});
