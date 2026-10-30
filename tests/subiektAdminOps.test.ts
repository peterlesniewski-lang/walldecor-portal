// Operacje panelu admina (src/lib/subiekt/adminOps.ts, PLAN-SUBIEKT-2026-10-29.md, Loop 4, Krok 2) na
// prawdziwym SQLite. Server actions wymagają sesji next-auth, więc testujemy operacje, które akcje wołają.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type SyncModule = typeof import('../src/lib/subiekt/sync');
type AdminOpsModule = typeof import('../src/lib/subiekt/adminOps');
type StorageModule = typeof import('../src/lib/projectFilesStorage');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const { processSyncPage }: SyncModule = await import(new URL('../src/lib/subiekt/sync.ts', import.meta.url).href);
const ops: AdminOpsModule = await import(new URL('../src/lib/subiekt/adminOps.ts', import.meta.url).href);
const storage: StorageModule = await import(new URL('../src/lib/projectFilesStorage.ts', import.meta.url).href);
const db = testDb.db;

test.after(() => testDb.cleanup());

type Doc = import('../src/lib/subiekt/types').SubiektDocumentPayload;
type Pos = import('../src/lib/subiekt/types').SubiektPositionPayload;

const ADMIN = 'u_admin';
const ARCHI_A = 'u_archi_a';
const ARCHI_B = 'u_archi_b';
const ARCHI_C = 'u_archi_c';
const RATE = 0.10; // architekci bez obrotu i bez override → Partner 10%
db.prepare("INSERT INTO users (id, name, email, role) VALUES (?, 'Admin', 'admin@test.local', 'ADMIN')").run(ADMIN);
db.prepare("INSERT INTO users (id, name, email, role, subiekt_code) VALUES (?, 'Architekt A', 'a@test.local', 'ARCHI', 'A-001')").run(ARCHI_A);
db.prepare("INSERT INTO users (id, name, email, role) VALUES (?, 'Architekt B', 'b@test.local', 'ARCHI')").run(ARCHI_B);
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
const subiektItems = (projectId: string) => itemsOfProject(projectId).filter((i) => i.source === 'SUBIEKT' && i.subiekt_document_id);
const itemsSum = (projectId: string) =>
    Number((db.prepare('SELECT COALESCE(SUM(amount_net), 0) AS s FROM project_items WHERE project_id = ?').get(projectId) as any).s);
const pendingSum = (projectId: string) =>
    Number((db.prepare("SELECT COALESCE(SUM(amount_net), 0) AS s FROM commissions WHERE project_id = ? AND status = 'PENDING'").get(projectId) as any).s);
const commissionsOfItem = (itemId: string) =>
    db.prepare('SELECT * FROM commissions WHERE project_item_id = ? ORDER BY rowid').all(itemId) as any[];
const lastLog = (eventType: string) =>
    db.prepare('SELECT * FROM activity_logs WHERE event_type = ? ORDER BY rowid DESC LIMIT 1').get(eventType) as any;

function newProject(id: string, owner = ARCHI_A, status = 'PRZYJĘTY') {
    db.prepare("INSERT INTO projects (id, owner_id, name, client_label, status, created_at) VALUES (?, ?, ?, 'K', ?, CURRENT_TIMESTAMP)")
        .run(id, owner, `Projekt ${id}`, status);
}

// --- assignDocumentToProject ---

test('assign: UNASSIGNED FS (NO_ARCHITECT) → MANUAL in the project, items with PENDING, architect = project owner, log', async () => {
    newProject('p_assign');
    await sync([doc(100, 'FS')]);
    assert.equal(docRow(100).assignment_note, 'NO_ARCHITECT');

    const result = await ops.assignDocumentToProjectOp(docRow(100).id, 'p_assign', ADMIN);
    assert.deepEqual(result.affectedProjectIds, ['p_assign']);
    const row = docRow(100);
    assert.equal(row.assignment_status, 'MANUAL');
    assert.equal(row.assignment_note, null);
    assert.equal(row.project_id, 'p_assign');
    assert.equal(row.architect_id, ARCHI_A);
    const items = subiektItems('p_assign');
    assert.equal(items.length, 1);
    assert.equal(items[0].invoice_number, 'FS 100/10/2026');
    approx(pendingSum('p_assign'), 1000 * RATE);

    const log = lastLog('SUBIEKT_DOC_ASSIGNED');
    assert.equal(log.user_id, ADMIN);
    assert.equal(log.subject_id, row.id);
    assert.equal(log.description, 'Przypisano FS 100/10/2026 do projektu Projekt p_assign');

    // Kolejna synchronizacja: przypisanie zostaje, treść z Subiekta aktualizuje pozycje.
    const response = await sync([doc(100, 'FS', { positions: [pos(1000, { net_total: 900 })] })]);
    assert.equal(response.unassigned, 0);
    assert.equal(docRow(100).assignment_status, 'MANUAL');
    approx(subiektItems('p_assign')[0].amount_net, 900);
    approx(pendingSum('p_assign'), 900 * RATE);
});

test('assign: owner mismatch, cancelled project and the document’s own project are rejected without changes', async () => {
    await sync([doc(110, 'FS', { architect_code: 'C-003' })]);
    const row = docRow(110);
    assert.equal(row.assignment_note, 'NO_ROOT_DOCUMENT');
    assert.equal(row.architect_id, ARCHI_C);

    await assert.rejects(ops.assignDocumentToProjectOp(row.id, 'p_assign', ADMIN), /Projekt należy do innego architekta\./);
    assert.equal(docRow(110).assignment_status, 'UNASSIGNED');
    assert.equal(docRow(110).project_id, null);

    newProject('p_cancelled', ARCHI_C, 'NIEZREALIZOWANY');
    await assert.rejects(ops.assignDocumentToProjectOp(row.id, 'p_cancelled', ADMIN), /niezrealizowanego/);
    await assert.rejects(ops.assignDocumentToProjectOp(docRow(100).id, 'p_assign', ADMIN), /już w tym projekcie/);
    await assert.rejects(ops.assignDocumentToProjectOp(row.id, 'p_nope', ADMIN), /Projekt nie istnieje\./);
});

test('assign: MANUAL FS in project A → project B of the same owner → items and PENDING only in B', async () => {
    assert.equal(docRow(100).assignment_status, 'MANUAL');
    newProject('p_assign_b');
    const result = await ops.assignDocumentToProjectOp(docRow(100).id, 'p_assign_b', ADMIN);
    assert.deepEqual(result.affectedProjectIds, ['p_assign_b', 'p_assign']);
    assert.equal(docRow(100).project_id, 'p_assign_b');
    assert.equal(docRow(100).assignment_status, 'MANUAL');
    assert.equal(itemsOfProject('p_assign').length, 0);
    approx(pendingSum('p_assign'), 0);
    assert.equal(subiektItems('p_assign_b').length, 1);
    approx(pendingSum('p_assign_b'), 900 * RATE);
});

test('assign: derived FS whose root ZK is unassigned → the whole chain goes MANUAL, FS items lead', async () => {
    await sync([doc(120, 'ZK', { architect_code: 'X-1' }), doc(121, 'FS', { parent_external_id: 120 })]);
    assert.equal(docRow(120).assignment_note, 'UNKNOWN_ARCHITECT_CODE:X-1');
    assert.equal(docRow(121).assignment_note, 'NO_ARCHITECT');
    newProject('p_chain');

    await ops.assignDocumentToProjectOp(docRow(121).id, 'p_chain', ADMIN);
    for (const externalId of [120, 121]) {
        const row = docRow(externalId);
        assert.equal(row.assignment_status, 'MANUAL', `${externalId}`);
        assert.equal(row.project_id, 'p_chain');
        assert.equal(row.root_external_id, 120);
    }
    assert.equal(docRow(120).architect_id, ARCHI_A);
    const items = subiektItems('p_chain');
    assert.equal(items.length, 1);
    assert.equal(items[0].subiekt_document_id, docRow(121).id, 'wiodą pozycje FS');
    assert.equal(items[0].order_number, 'ZK 120/10/2026');
});

test('assign: derived FS of another architect’s root is rejected (whole chain would change owner)', async () => {
    await sync([doc(130, 'ZK'), doc(131, 'FS', { parent_external_id: 130, architect_code: 'C-003' })]);
    assert.equal(docRow(131).assignment_note, 'OWNER_MISMATCH:C-003');
    newProject('p_c', ARCHI_C);
    await assert.rejects(ops.assignDocumentToProjectOp(docRow(131).id, 'p_c', ADMIN), /Dokument źródłowy ZK 130\/10\/2026 należy do innego architekta/);
    assert.equal(subiektItems(docRow(130).project_id).length, 1, 'pozycje ZK nietknięte');
});

test('assign: KFS that does not match the project invoices is rejected and the transaction leaves no trace', async () => {
    await sync([doc(140, 'ZK'), doc(141, 'FS', { parent_external_id: 140 })]);
    const projectId = docRow(140).project_id;
    await sync([doc(142, 'KFS', { parent_external_id: 141, positions: [pos(1420, { net_total: 1, corrects_position_external_id: 999999 })] })]);
    const before = docRow(142);
    assert.equal(before.assignment_note, 'UNMATCHED_CORRECTION');
    const logs = () => Number((db.prepare('SELECT COUNT(*) AS c FROM activity_logs').get() as any).c);
    const logsBefore = logs();

    await assert.rejects(ops.assignDocumentToProjectOp(before.id, projectId, ADMIN), /Korekta nie pasuje/);
    assert.deepEqual(docRow(142), before, 'wiersz dokumentu bez zmian (ROLLBACK)');
    assert.equal(logs(), logsBefore);
    approx(subiektItems(projectId)[0].amount_net, 1000);
});

// --- createProjectFromDocument ---

test('createProjectFromDocument: FS without architect → new PRZYJĘTY project of the chosen architect with items', async () => {
    await sync([doc(200, 'FS', { contractor_name: 'Anna Klient' })]);
    const before = Number((db.prepare('SELECT COUNT(*) AS c FROM projects').get() as any).c);

    const { projectId, projectName } = await ops.createProjectFromDocumentOp(docRow(200).id, ARCHI_B, ADMIN);
    assert.equal(Number((db.prepare('SELECT COUNT(*) AS c FROM projects').get() as any).c), before + 1);
    const project = projectRow(projectId);
    assert.match(projectId, /^p_[0-9a-f]{8}$/);
    assert.equal(project.owner_id, ARCHI_B);
    assert.equal(project.status, 'PRZYJĘTY');
    assert.equal(project.name, 'Anna Klient — FS 200/10/2026');
    assert.equal(projectName, project.name);
    assert.equal(project.client_label, 'Anna Klient');

    const row = docRow(200);
    assert.equal(row.assignment_status, 'MANUAL');
    assert.equal(row.root_external_id, 200);
    assert.equal(row.architect_id, ARCHI_B);
    assert.equal(subiektItems(projectId).length, 1);
    approx(pendingSum(projectId), 1000 * RATE);
    const log = lastLog('SUBIEKT_PROJECT_CREATED');
    assert.equal(log.user_id, ADMIN);
    assert.equal(log.subject_id, row.id);
});

test('createProjectFromDocument: owner must be an architect; assigned, derived-with-root and KFS documents are rejected', async () => {
    await sync([doc(210, 'FS')]);
    await assert.rejects(ops.createProjectFromDocumentOp(docRow(210).id, ADMIN, ADMIN), /nie jest architektem/);
    await assert.rejects(ops.createProjectFromDocumentOp(docRow(200).id, ARCHI_B, ADMIN), /już przypisany/);
    await assert.rejects(ops.createProjectFromDocumentOp(docRow(121).id, ARCHI_A, ADMIN), /już przypisany/);

    await sync([doc(220, 'ZK', { architect_code: null }), doc(221, 'FS', { parent_external_id: 220 })]);
    assert.equal(docRow(221).root_external_id, 220);
    await assert.rejects(ops.createProjectFromDocumentOp(docRow(221).id, ARCHI_A, ADMIN), /pochodzi z ZK 220\/10\/2026/);

    await sync([doc(230, 'KFS', { parent_external_id: 999 })]);
    await assert.rejects(ops.createProjectFromDocumentOp(docRow(230).id, ARCHI_A, ADMIN), /KFS/);
});

test('createProjectFromDocument from a root ZK takes its unassigned FS along (architect inherited)', async () => {
    const { projectId } = await ops.createProjectFromDocumentOp(docRow(220).id, ARCHI_B, ADMIN);
    assert.equal(docRow(220).assignment_status, 'MANUAL');
    const fs = docRow(221);
    assert.equal(fs.project_id, projectId);
    assert.equal(fs.architect_id, ARCHI_B, 'FS bez kodu dziedziczy architekta po korzeniu');
    assert.equal(fs.assignment_status, 'AUTO', 'nieprzypisana FS przechodzi zwykłe reguły po przypisaniu korzenia');
    const items = subiektItems(projectId);
    assert.equal(items.length, 1);
    assert.equal(items[0].subiekt_document_id, fs.id);
});

// --- ignoreDocument ---

test('ignore: AUTO ZK with items → items and PENDING gone, IGNORED with note, a later sync does not re-add', async () => {
    await sync([doc(300, 'ZK')]);
    const projectId = docRow(300).project_id;
    assert.equal(subiektItems(projectId).length, 1);

    await assert.rejects(ops.ignoreDocumentOp(docRow(300).id, '   ', ADMIN), /Podaj powód/);
    await assert.rejects(ops.ignoreDocumentOp(docRow(300).id, 'x'.repeat(501), ADMIN), /Podaj powód/);

    await ops.ignoreDocumentOp(docRow(300).id, '  duplikat testowy ', ADMIN);
    const row = docRow(300);
    assert.equal(row.assignment_status, 'IGNORED');
    assert.equal(row.assignment_note, 'duplikat testowy');
    assert.equal(row.project_id, projectId, 'project_id bez zmian');
    assert.equal(itemsOfProject(projectId).length, 0);
    approx(pendingSum(projectId), 0);
    assert.equal(lastLog('SUBIEKT_DOC_IGNORED').subject_id, row.id);

    const response = await sync([doc(300, 'ZK', { positions: [pos(3000, { net_total: 1500 })] })]);
    assert.equal(response.accepted, 1);
    assert.equal(docRow(300).assignment_status, 'IGNORED');
    assert.equal(itemsOfProject(projectId).length, 0);
});

test('ignore: the only FS of a chain → FS items gone, ZK items come back', async () => {
    // FS odzwierciedla ZK (MIRROR, loop 5b) → pozycje z FS.
    await sync([doc(310, 'ZK'), doc(311, 'FS', { parent_external_id: 310 })]);
    const projectId = docRow(310).project_id;
    assert.equal(subiektItems(projectId)[0].subiekt_document_id, docRow(311).id);

    await ops.ignoreDocumentOp(docRow(311).id, 'faktura anulowana', ADMIN);
    const items = subiektItems(projectId);
    assert.equal(items.length, 1);
    assert.equal(items[0].subiekt_document_id, docRow(310).id, 'wiodący znowu ZK');
    approx(pendingSum(projectId), 1000 * RATE);
});

test('ignore: a KFS on an invoice-led chain (FP root, INVOICE_ONLY) → the FS amount is restored', async () => {
    await sync([doc(315, 'FP', { architect_code: 'A-001' }), doc(316, 'FS', { parent_external_id: 315, positions: [pos(3160, { net_total: 700 })] })]);
    const projectId = docRow(315).project_id;
    await sync([doc(317, 'KFS', { parent_external_id: 316, positions: [pos(3170, { net_total: 500, corrects_position_external_id: 3160 })] })]);
    approx(subiektItems(projectId)[0].amount_net, 500);

    await ops.ignoreDocumentOp(docRow(317).id, 'błędna korekta', ADMIN);
    approx(subiektItems(projectId)[0].amount_net, 700, 'korekta zdjęta');
    approx(pendingSum(projectId), 700 * RATE);
});

test('ignore root ZK → a later FS of that ZK inherits IGNORED (ROOT_IGNORED), assigning the ZK again re-activates it', async () => {
    await sync([doc(320, 'ZK')]);
    const projectId = docRow(320).project_id;
    await ops.ignoreDocumentOp(docRow(320).id, 'test', ADMIN);

    const response = await sync([doc(321, 'FS', { parent_external_id: 320 })]);
    assert.deepEqual([response.accepted, response.unassigned], [1, 0]);
    let fs = docRow(321);
    assert.equal(fs.assignment_status, 'IGNORED');
    assert.equal(fs.assignment_note, 'ROOT_IGNORED');
    assert.equal(fs.project_id, null);
    assert.equal(fs.root_external_id, 320);
    assert.equal(itemsOfProject(projectId).length, 0);

    await ops.assignDocumentToProjectOp(docRow(320).id, projectId, ADMIN);
    assert.equal(docRow(320).assignment_status, 'MANUAL');
    fs = docRow(321);
    assert.equal(fs.assignment_status, 'AUTO');
    assert.equal(fs.assignment_note, null);
    assert.equal(fs.project_id, projectId);
    const items = subiektItems(projectId);
    assert.equal(items.length, 1);
    assert.equal(items[0].subiekt_document_id, fs.id);
});

test('ignore root ZK with existing chain → AUTO FS follows (ROOT_IGNORED, items cleared), MANUAL FS keeps its items', async () => {
    // Dwie FS razem odzwierciedlają pozycje ZK (MIRROR, loop 5b) → pozycje z FS.
    await sync([
        doc(330, 'ZK', { positions: [pos(3300), pos(3301, { ordinal: 2, net_total: 400 })] }),
        doc(331, 'FS', { parent_external_id: 330 }),
        doc(332, 'FS', { parent_external_id: 330, positions: [pos(3320, { net_total: 400 })] }),
    ]);
    const projectId = docRow(330).project_id;
    db.prepare("UPDATE subiekt_documents SET assignment_status = 'MANUAL' WHERE external_id = 332").run();
    assert.equal(subiektItems(projectId).length, 2);

    await ops.ignoreDocumentOp(docRow(330).id, 'duplikat', ADMIN);
    const auto = docRow(331);
    assert.deepEqual([auto.assignment_status, auto.assignment_note, auto.project_id], ['IGNORED', 'ROOT_IGNORED', null]);
    assert.equal(docRow(332).assignment_status, 'MANUAL');
    const items = subiektItems(projectId);
    assert.deepEqual(items.map((i) => i.subiekt_document_id), [docRow(332).id]);
    approx(pendingSum(projectId), 400 * RATE);

    // Ponowny sync zignorowanej FS nic nie zmienia.
    await sync([doc(331, 'FS', { parent_external_id: 330, positions: [pos(3310, { net_total: 1500 })] })]);
    assert.equal(docRow(331).assignment_status, 'IGNORED');
    assert.equal(subiektItems(projectId).length, 1);
});

// --- mergeProjects ---

test('merge: two projects with items → one project, item and PENDING sums kept, docs/files point to target, source deleted, log', async () => {
    await sync([doc(400, 'ZK'), doc(410, 'ZK', { positions: [pos(4100, { net_total: 2500 }), pos(4101, { product_id: null, net_total: 400 })] })]);
    const target = docRow(400).project_id;
    const source = docRow(410).project_id;
    db.prepare("INSERT INTO project_files (id, project_id, uploaded_by, original_name, stored_name, mime_type, file_size) VALUES ('f_1', ?, ?, 'a.pdf', 's.pdf', 'application/pdf', 10)")
        .run(source, ADMIN);
    const items = itemsSum(target) + itemsSum(source);
    const pending = pendingSum(target) + pendingSum(source);
    const itemCount = itemsOfProject(target).length + itemsOfProject(source).length;

    const result = await ops.mergeProjectsOp(target, [source], ADMIN);
    assert.deepEqual(result.affectedProjectIds, [target, source]);
    assert.deepEqual(result.movedFileDirs, [{ from: source, to: target }], 'tylko źródła z plikami');
    assert.ok(projectRow(target).updated_at, 'updated_at celu ustawione');

    // Plik na dysku źródła → po przeniesieniu (jak w akcji, po COMMIT) wiersz wskazuje istniejący plik.
    const filesRoot = mkdtempSync(join(tmpdir(), 'walldecor-merge-'));
    try {
        mkdirSync(storage.projectFilesDir(source, filesRoot), { recursive: true });
        writeFileSync(join(storage.projectFilesDir(source, filesRoot), 's.pdf'), 'pdf');
        await storage.moveProjectFileDirs(result.movedFileDirs, filesRoot);
        const file = db.prepare("SELECT project_id, stored_name FROM project_files WHERE id = 'f_1'").get() as any;
        assert.ok(existsSync(join(storage.projectFilesDir(file.project_id, filesRoot), file.stored_name)));
    } finally {
        rmSync(filesRoot, { recursive: true, force: true });
    }
    assert.equal(projectRow(source), undefined, 'źródło usunięte');
    approx(itemsSum(target), items, 'suma pozycji');
    approx(pendingSum(target), pending, 'suma PENDING');
    assert.equal(itemsOfProject(target).length, itemCount);
    assert.equal(docRow(410).project_id, target);
    assert.equal(docRow(410).assignment_status, 'AUTO');
    assert.equal((db.prepare("SELECT project_id FROM project_files WHERE id = 'f_1'").get() as any).project_id, target);
    assert.equal(Number((db.prepare('SELECT COUNT(*) AS c FROM commissions WHERE project_id = ?').get(source) as any).c), 0);

    const log = lastLog('PROJECTS_MERGED');
    assert.equal(log.user_id, ADMIN);
    assert.equal(log.subject_id, target);
    assert.deepEqual(JSON.parse(log.metadata).sourceProjectIds, [source]);
    assert.match(log.description, /Połączono projekty Jan Testowy — ZK 410\/10\/2026 → Jan Testowy — ZK 400\/10\/2026/);

    // Synchronizacja po połączeniu nie dubluje pozycji.
    await sync([doc(410, 'ZK', { positions: [pos(4100, { net_total: 2000 }), pos(4101, { product_id: null, net_total: 400 })] })]);
    assert.equal(itemsOfProject(target).length, itemCount);
    approx(pendingSum(target), (1000 + 2000) * RATE);
});

test('merge: ZAKOŃCZONY / NIEZREALIZOWANY project, another owner, self-merge and empty list are rejected', async () => {
    const target = docRow(400).project_id;
    newProject('p_done', ARCHI_A, 'ZAKOŃCZONY');
    newProject('p_lost', ARCHI_A, 'NIEZREALIZOWANY');
    newProject('p_b_merge', ARCHI_B);
    await assert.rejects(ops.mergeProjectsOp(target, ['p_done'], ADMIN), /zakończonych ani niezrealizowanych/);
    await assert.rejects(ops.mergeProjectsOp('p_done', [target], ADMIN), /zakończonych ani niezrealizowanych/);
    await assert.rejects(ops.mergeProjectsOp(target, ['p_lost'], ADMIN), /zakończonych ani niezrealizowanych/);
    await assert.rejects(ops.mergeProjectsOp(target, ['p_b_merge'], ADMIN), /tego samego architekta/);
    await assert.rejects(ops.mergeProjectsOp(target, [target], ADMIN), /samym/);
    await assert.rejects(ops.mergeProjectsOp(target, [], ADMIN), /co najmniej jeden/);
    assert.ok(projectRow('p_done') && projectRow('p_lost') && projectRow('p_b_merge'));
});

test('merge: items of a ZGŁOSZONY source get PENDING in an accepted target (through the core)', async () => {
    newProject('p_submitted', ARCHI_A, 'ZGŁOSZONY');
    db.prepare("INSERT INTO project_items (id, project_id, type, amount_net, category) VALUES ('i_sub', 'p_submitted', 'PRODUCT', 300, 'Tapety')").run();
    const target = docRow(400).project_id;
    const before = pendingSum(target);
    await ops.mergeProjectsOp(target, ['p_submitted'], ADMIN);
    approx(pendingSum(target), before + 300 * RATE);
    assert.equal(commissionsOfItem('i_sub').length, 1);

    newProject('p_sub_target', ARCHI_A, 'ZGŁOSZONY');
    await assert.rejects(ops.mergeProjectsOp('p_sub_target', [target], ADMIN), /tylko zgłoszony/);
});

// --- moveDocumentToProject ---

test('move: chain ZK+FS → old project has no SUBIEKT items, new one has them, totals and PENDING preserved', async () => {
    // FS odzwierciedla ZK (MIRROR, loop 5b) → pozycje z FS.
    await sync([doc(500, 'ZK', { positions: [pos(5000, { net_total: 1200 })] }), doc(510, 'FS', { parent_external_id: 500, positions: [pos(5100, { net_total: 1200 })] })]);
    const oldProject = docRow(500).project_id;
    newProject('p_move');
    const [items, pending] = [itemsSum(oldProject), pendingSum(oldProject)];

    const result = await ops.moveDocumentToProjectOp(docRow(500).id, 'p_move', ADMIN);
    assert.deepEqual(result.affectedProjectIds, ['p_move', oldProject]);
    assert.equal(itemsOfProject(oldProject).length, 0);
    approx(pendingSum(oldProject), 0);
    approx(itemsSum('p_move'), items);
    approx(pendingSum('p_move'), pending);
    for (const externalId of [500, 510]) {
        assert.equal(docRow(externalId).project_id, 'p_move');
        assert.equal(docRow(externalId).assignment_status, 'MANUAL');
    }
    assert.equal(subiektItems('p_move')[0].subiekt_document_id, docRow(510).id);
    assert.equal(lastLog('SUBIEKT_CHAIN_MOVED').subject_id, docRow(500).id);

    await sync([doc(500, 'ZK', { positions: [pos(5000, { net_total: 1100 })] }), doc(510, 'FS', { parent_external_id: 500, positions: [pos(5100, { net_total: 1100 })] })]);
    approx(itemsSum('p_move'), 1100);
    assert.equal(itemsOfProject(oldProject).length, 0, 'sync nie wraca do starego projektu');
});

test('move: from a ZAKOŃCZONY project → old items zeroed with corrections and unlinked, new project gets them', async (t) => {
    t.mock.method(console, 'warn', () => {});
    await sync([doc(520, 'ZK'), doc(521, 'FS', { parent_external_id: 520 })]);
    const oldProject = docRow(520).project_id;
    db.prepare("UPDATE projects SET status = 'ZAKOŃCZONY' WHERE id = ?").run(oldProject);
    db.prepare("UPDATE commissions SET status = 'EARNED' WHERE project_id = ? AND status = 'PENDING'").run(oldProject);
    newProject('p_move2');

    await ops.moveDocumentToProjectOp(docRow(520).id, 'p_move2', ADMIN);
    const [old] = itemsOfProject(oldProject);
    approx(old.amount_net, 0);
    assert.equal(old.subiekt_document_id, null);
    approx(Number((db.prepare('SELECT SUM(amount_net) AS s FROM commissions WHERE project_id = ?').get(oldProject) as any).s), 0);
    assert.equal(subiektItems('p_move2').length, 1);
    approx(pendingSum('p_move2'), 1000 * RATE);
});

test('move: ZK item with type overridden to PRODUCT keeps PRODUCT + type_overridden and PENDING in the new project', async () => {
    await sync([doc(530, 'ZK', { positions: [pos(5300, { product_id: null, name: 'Montaż', net_total: 500 })] })]);
    const oldProject = docRow(530).project_id;
    const [item] = subiektItems(oldProject);
    assert.equal(item.type, 'INSTALLATION');
    await ops.overrideItemTypeOp(item.id, 'PRODUCT', ADMIN);
    newProject('p_move_override');

    await ops.moveDocumentToProjectOp(docRow(530).id, 'p_move_override', ADMIN);
    assert.equal(itemsOfProject(oldProject).length, 0);
    const [moved] = subiektItems('p_move_override');
    assert.equal(moved.type, 'PRODUCT');
    assert.equal(moved.type_overridden, 1);
    assert.equal(moved.category, 'Produkt (Subiekt)');
    approx(moved.amount_net, 500);
    assert.ok(pendingSum('p_move_override') > 0);
    approx(pendingSum('p_move_override'), 500 * RATE);
    assert.equal(subiektItems('p_move_override').length, 1, 'bez duplikatu po syncChainItems');

    await sync([doc(530, 'ZK', { positions: [pos(5300, { product_id: null, name: 'Montaż', net_total: 450 })] })]);
    const [after] = subiektItems('p_move_override');
    assert.equal(after.type, 'PRODUCT');
    approx(after.amount_net, 450);
});

test('move: AUTO document with OWNER_MISMATCH goes through mapping (stays visible in the inbox), not forced to MANUAL', async () => {
    await sync([doc(540, 'ZK'), doc(541, 'FS', { parent_external_id: 540 })]);
    const oldProject = docRow(540).project_id;
    await sync([doc(541, 'FS', { parent_external_id: 540, architect_code: 'C-003', positions: [pos(5410, { net_total: 900 })] })]);
    assert.deepEqual([docRow(541).assignment_status, docRow(541).assignment_note], ['AUTO', 'OWNER_MISMATCH:C-003']);
    newProject('p_move_mismatch');

    await ops.moveDocumentToProjectOp(docRow(540).id, 'p_move_mismatch', ADMIN);
    const fs = docRow(541);
    assert.equal(fs.assignment_status, 'UNASSIGNED');
    assert.equal(fs.assignment_note, 'OWNER_MISMATCH:C-003');
    assert.equal(fs.project_id, null);
    assert.equal(itemsOfProject(oldProject).length, 0);
    const items = subiektItems('p_move_mismatch');
    assert.deepEqual(items.map((i) => i.subiekt_document_id), [docRow(540).id], 'bez FS wiodą pozycje ZK');
});

test('move: only roots with a project, same owner, live target', async () => {
    newProject('p_move_b', ARCHI_B);
    await assert.rejects(ops.moveDocumentToProjectOp(docRow(510).id, 'p_move', ADMIN), /tylko dokument źródłowy/);
    await assert.rejects(ops.moveDocumentToProjectOp(docRow(500).id, 'p_move_b', ADMIN), /innego architekta/);
    await assert.rejects(ops.moveDocumentToProjectOp(docRow(500).id, 'p_move', ADMIN), /już w tym projekcie/);
    await assert.rejects(ops.moveDocumentToProjectOp(docRow(500).id, 'p_lost', ADMIN), /niezrealizowanego/);
    assert.equal(subiektItems('p_move').length, 1);
});

// --- overrideItemType ---

test('overrideItemType: INSTALLATION → PRODUCT on PRZYJĘTY creates PENDING, flags type_overridden, survives re-sync', async () => {
    await sync([doc(600, 'ZK', { positions: [pos(6000, { product_id: null, name: 'Montaż', net_total: 500 })] })]);
    const projectId = docRow(600).project_id;
    const [item] = subiektItems(projectId);
    assert.equal(item.type, 'INSTALLATION');
    approx(pendingSum(projectId), 0);

    const result = await ops.overrideItemTypeOp(item.id, 'PRODUCT', ADMIN);
    assert.equal(result.unchanged, false);
    assert.notEqual(result.itemId, item.id, 'pozycja dostaje nowe id');
    const items = subiektItems(projectId);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, result.itemId);
    assert.equal(items[0].type, 'PRODUCT');
    assert.equal(items[0].category, 'Produkt (Subiekt)');
    assert.equal(items[0].type_overridden, 1);
    assert.equal(items[0].subiekt_position_id, 6000);
    assert.equal(items[0].order_number, 'ZK 600/10/2026');
    approx(pendingSum(projectId), 500 * RATE);
    assert.equal(lastLog('SUBIEKT_ITEM_TYPE_OVERRIDDEN').subject_id, docRow(600).id);

    await sync([doc(600, 'ZK', { positions: [pos(6000, { product_id: null, name: 'Montaż', net_total: 600 })] })]);
    const [after] = subiektItems(projectId);
    assert.equal(after.id, result.itemId);
    assert.equal(after.type, 'PRODUCT');
    approx(after.amount_net, 600);
    approx(pendingSum(projectId), 600 * RATE);

    const back = await ops.overrideItemTypeOp(result.itemId, 'INSTALLATION', ADMIN);
    approx(pendingSum(projectId), 0, 'INSTALLATION bez prowizji');
    assert.equal(subiektItems(projectId)[0].id, back.itemId);
    assert.equal((await ops.overrideItemTypeOp(back.itemId, 'INSTALLATION', ADMIN)).unchanged, true);
});

test('overrideItemType: on ZAKOŃCZONY the old row is zeroed and unlinked, the new PRODUCT row gets EARNED + cashback', async (t) => {
    t.mock.method(console, 'warn', () => {});
    await sync([doc(610, 'ZK', { positions: [pos(6100, { product_id: null, net_total: 400 })] })]);
    const projectId = docRow(610).project_id;
    db.prepare("UPDATE projects SET status = 'ZAKOŃCZONY' WHERE id = ?").run(projectId);
    const [item] = subiektItems(projectId);

    const { itemId } = await ops.overrideItemTypeOp(item.id, 'PRODUCT', ADMIN);
    const old = db.prepare('SELECT * FROM project_items WHERE id = ?').get(item.id) as any;
    approx(old.amount_net, 0);
    assert.equal(old.subiekt_document_id, null);
    const comms = commissionsOfItem(itemId);
    assert.equal(comms.length, 1);
    assert.equal(comms[0].status, 'EARNED');
    approx(comms[0].amount_net, 400 * RATE);
    const cashback = db.prepare("SELECT * FROM wallet_transactions WHERE related_item_id = ? AND type = 'EARN'").all(itemId) as any[];
    assert.equal(cashback.length, 1);
    approx(cashback[0].amount, 8);
});

test('overrideItemType: MANUAL items and unknown types are rejected', async () => {
    db.prepare("INSERT INTO project_items (id, project_id, type, amount_net, category) VALUES ('i_manual', 'p_move', 'PRODUCT', 100, 'Tapety')").run();
    await assert.rejects(ops.overrideItemTypeOp('i_manual', 'INSTALLATION', ADMIN), /tylko dla pozycji z Subiekta/);
    await assert.rejects(ops.overrideItemTypeOp('i_manual', 'OTHER' as any, ADMIN), /Nieprawidłowy typ/);
    await assert.rejects(ops.overrideItemTypeOp('i_nope', 'PRODUCT', ADMIN), /nie istnieje/);
});

// --- applySuggestedStatus: kroki ---

test('nextStatusSteps walks forward one status at a time and only allows W_REALIZACJI → PRZYJĘTY backwards', () => {
    assert.deepEqual(ops.nextStatusSteps('PRZYJĘTY', 'PRZYJĘTY'), []);
    assert.deepEqual(ops.nextStatusSteps('PRZYJĘTY', 'W_REALIZACJI'), ['W_REALIZACJI']);
    assert.deepEqual(ops.nextStatusSteps('PRZYJĘTY', 'ZAKOŃCZONY'), ['W_REALIZACJI', 'ZAKOŃCZONY']);
    assert.deepEqual(ops.nextStatusSteps('ZGŁOSZONY', 'ZAKOŃCZONY'), ['PRZYJĘTY', 'W_REALIZACJI', 'ZAKOŃCZONY']);
    assert.deepEqual(ops.nextStatusSteps('ZGŁOSZONY', 'PRZYJĘTY'), ['PRZYJĘTY']);
    assert.deepEqual(ops.nextStatusSteps('W_REALIZACJI', 'ZAKOŃCZONY'), ['ZAKOŃCZONY']);
    assert.deepEqual(ops.nextStatusSteps('W_REALIZACJI', 'PRZYJĘTY'), ['PRZYJĘTY']);
    assert.throws(() => ops.nextStatusSteps('ZAKOŃCZONY', 'W_REALIZACJI'), /zakończony/);
    assert.throws(() => ops.nextStatusSteps('NIEZREALIZOWANY', 'PRZYJĘTY'), /niezrealizowany/);
    assert.throws(() => ops.nextStatusSteps('NIEZNANY', 'PRZYJĘTY'), /Nieprawidłowy status/);
});
