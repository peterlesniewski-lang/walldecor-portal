// Testy integracyjne rdzenia pozycji projektu (src/lib/projectItems.ts) na tymczasowej bazie SQLite.
// Sprawdzają prawdziwe wiersze w project_items / commissions / wallet_transactions / activity_logs.
import test from 'node:test';
import assert from 'node:assert/strict';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type CoreModule = typeof import('../src/lib/projectItems');

// Importy przez URL (nie literał ścieżki), bo src/ używa aliasu `@/` rozwiązywanego przez hook,
// a env bazy musi być ustawiony przed pierwszym importem src/lib/db.ts.
await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const core: CoreModule = await import(new URL('../src/lib/projectItems.ts', import.meta.url).href);
const db = testDb.db;

test.after(() => testDb.cleanup());

const ADMIN_ID = 'u_admin';
const ARCHI_ID = 'u_archi';
// Ręczny status Partner Plus = 12% (różny od domyślnych 10%), żeby test pokazał użycie stawki architekta.
const ARCHI_RATE = 0.12;
const CASHBACK = 0.02;

db.prepare("INSERT INTO users (id, name, email, role) VALUES (?, 'Admin', 'admin@test.local', 'ADMIN')").run(ADMIN_ID);
db.prepare("INSERT INTO users (id, name, email, role, tier_override) VALUES (?, 'Architekt', 'archi@test.local', 'ARCHI', 'PARTNER_PLUS')").run(ARCHI_ID);

// Osobny architekt (Partner Plus, pusty portfel) dla testu korekty cashbacku — FIFO spendCashback
// zdejmuje środki z najstarszego EARN architekta, więc portfel nie może dzielić się z innymi testami.
const WALLET_ARCHI_ID = 'u_archi_wallet';
db.prepare("INSERT INTO users (id, name, email, role, tier_override) VALUES (?, 'Architekt 2', 'archi2@test.local', 'ARCHI', 'PARTNER_PLUS')").run(WALLET_ARCHI_ID);

let projectSeq = 0;
function createProject(status: string, ownerId = ARCHI_ID): string {
    const id = `p_test_${++projectSeq}`;
    db.prepare("INSERT INTO projects (id, owner_id, name, client_label, status) VALUES (?, ?, ?, 'Klient', ?)")
        .run(id, ownerId, `Projekt ${projectSeq}`, status);
    return id;
}

function approx(actual: number, expected: number, message?: string) {
    assert.ok(Math.abs(Number(actual) - expected) < 0.005, `${message ?? 'kwota'}: ${actual} ≠ ${expected}`);
}

const commissionsOfItem = (itemId: string) =>
    db.prepare('SELECT * FROM commissions WHERE project_item_id = ? ORDER BY rowid').all(itemId) as any[];

function walletBalance(userId: string): number {
    const earned = db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM wallet_transactions WHERE user_id = ? AND type IN ('EARN', 'ADJUST')").get(userId) as any;
    const spent = db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM wallet_transactions WHERE user_id = ? AND type IN ('SPEND', 'EXPIRE')").get(userId) as any;
    return Number(earned.s) - Number(spent.s);
}

const admin = { actorId: ADMIN_ID };

test('addItemCore on PRZYJĘTY creates the item and a PENDING commission at the architect rate', async () => {
    const projectId = createProject('PRZYJĘTY');

    const { itemId } = await core.addItemCore(projectId, {
        type: 'PRODUCT', category: 'Tapety', description: 'Salon', amount_net: 5000,
        order_number: 'ZK 1/2026', invoice_number: null, is_paid: true,
    }, admin);

    assert.match(itemId, /^i_/);
    const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(itemId) as any;
    assert.equal(item.project_id, projectId);
    assert.equal(item.type, 'PRODUCT');
    assert.equal(item.category, 'Tapety');
    approx(item.amount_net, 5000);
    assert.equal(item.order_number, 'ZK 1/2026');
    assert.equal(item.is_paid, 1);
    assert.equal(item.source, 'MANUAL');
    assert.equal(item.subiekt_document_id, null);
    assert.equal(item.subiekt_position_id, null);

    const comms = commissionsOfItem(itemId);
    assert.equal(comms.length, 1);
    assert.equal(comms[0].status, 'PENDING');
    assert.equal(comms[0].project_id, projectId);
    assert.equal(comms[0].architect_id, ARCHI_ID);
    approx(comms[0].rate, ARCHI_RATE, 'stawka');
    approx(comms[0].amount_net, 5000 * ARCHI_RATE);
    assert.equal(comms[0].note, 'Nowa pozycja po akceptacji');

    // Projekt w toku nie nalicza cashbacku.
    const wallet = db.prepare('SELECT * FROM wallet_transactions WHERE related_item_id = ?').all(itemId);
    assert.equal(wallet.length, 0);

    const log = db.prepare("SELECT * FROM activity_logs WHERE event_type = 'PROJECT_ITEM_ADDED' AND description LIKE ?").get(`%${itemId}%`) as any;
    assert.equal(log.user_id, ADMIN_ID);
});

test('addItemCore on ZAKOŃCZONY creates an EARNED commission and an EARN cashback expiring in 12 months', async () => {
    const projectId = createProject('ZAKOŃCZONY');

    const { itemId } = await core.addItemCore(projectId, {
        type: 'PRODUCT', category: 'Fototapeta', amount_net: 10000,
    }, { actorId: ADMIN_ID, note: 'Dosprzedaż po rozliczeniu' });

    const comms = commissionsOfItem(itemId);
    assert.equal(comms.length, 1);
    assert.equal(comms[0].status, 'EARNED');
    approx(comms[0].rate, ARCHI_RATE, 'stawka');
    approx(comms[0].amount_net, 10000 * ARCHI_RATE);
    assert.equal(comms[0].note, 'Dosprzedaż po rozliczeniu');

    const wallet = db.prepare('SELECT * FROM wallet_transactions WHERE related_item_id = ?').all(itemId) as any[];
    assert.equal(wallet.length, 1);
    assert.equal(wallet[0].type, 'EARN');
    assert.equal(wallet[0].user_id, ARCHI_ID);
    approx(wallet[0].amount, 10000 * CASHBACK);

    const expected = new Date();
    expected.setFullYear(expected.getFullYear() + 1);
    const expiresAt = new Date(String(wallet[0].expires_at).replace(' ', 'T'));
    assert.ok(Math.abs(expiresAt.getTime() - expected.getTime()) < 5 * 60 * 1000, `expires_at ${wallet[0].expires_at} nie jest za 12 miesięcy`);
});

test('updateItemAmountCore on ZAKOŃCZONY 10 000 → 8 000 writes negative commission and cashback corrections', async () => {
    const projectId = createProject('ZAKOŃCZONY', WALLET_ARCHI_ID);
    const { itemId } = await core.addItemCore(projectId, { type: 'PRODUCT', category: 'Tapety', amount_net: 10000 }, admin);
    const balanceBefore = walletBalance(WALLET_ARCHI_ID);
    approx(balanceBefore, 10000 * CASHBACK, 'saldo po rozliczeniu pozycji');

    await core.updateItemAmountCore(itemId, 8000, admin);

    const item = db.prepare('SELECT amount_net FROM project_items WHERE id = ?').get(itemId) as any;
    approx(item.amount_net, 8000);

    const comms = commissionsOfItem(itemId);
    assert.equal(comms.length, 2, 'rekord początkowy + korekta');
    const correction = comms[1];
    assert.equal(correction.status, 'EARNED');
    approx(correction.amount_net, -2000 * ARCHI_RATE, 'korekta prowizji');
    approx(correction.rate, ARCHI_RATE, 'stawka korekty');
    assert.equal(correction.note, 'Korekta kwoty (przeliczenie pozycji)');

    const projectTotal = db.prepare('SELECT SUM(amount_net) AS s FROM commissions WHERE project_id = ?').get(projectId) as any;
    approx(projectTotal.s, 8000 * ARCHI_RATE, 'suma prowizji projektu');

    // Pomniejszenie cashbacku idzie przez FIFO spendCashback: SPEND wskazuje na transakcję EARN pozycji.
    const earn = db.prepare("SELECT id FROM wallet_transactions WHERE related_item_id = ? AND type = 'EARN'").get(itemId) as any;
    const spends = db.prepare("SELECT * FROM wallet_transactions WHERE type = 'SPEND' AND reference_id = ?").all(itemId) as any[];
    assert.equal(spends.length, 1);
    assert.equal(spends[0].related_item_id, earn.id);
    approx(spends[0].amount, 2000 * CASHBACK);
    assert.equal(spends[0].user_id, WALLET_ARCHI_ID);
    approx(walletBalance(WALLET_ARCHI_ID) - balanceBefore, -2000 * CASHBACK, 'zmiana salda cashback');

    const log = db.prepare("SELECT * FROM activity_logs WHERE event_type = 'PROJECT_ITEM_VALUE_CHANGED' AND description LIKE ?").get(`%${itemId}%`) as any;
    assert.equal(log.user_id, ADMIN_ID);
    assert.deepEqual(JSON.parse(log.metadata), { projectId, itemId, oldAmount: 10000, newAmount: 8000, note: null });
});

test('updateItemAmountCore then deleteItemCore on PRZYJĘTY updates and then removes the PENDING commission', async () => {
    const projectId = createProject('PRZYJĘTY');
    const { itemId } = await core.addItemCore(projectId, { type: 'PRODUCT', category: 'Tapety', amount_net: 5000 }, admin);

    await core.updateItemAmountCore(itemId, 4000, admin);
    let comms = commissionsOfItem(itemId);
    assert.equal(comms.length, 1);
    assert.equal(comms[0].status, 'PENDING');
    approx(comms[0].amount_net, 4000 * ARCHI_RATE);

    await core.deleteItemCore(itemId, { actorId: ADMIN_ID, note: 'Pomyłka' });

    assert.equal(db.prepare('SELECT id FROM project_items WHERE id = ?').get(itemId), undefined);
    comms = commissionsOfItem(itemId);
    assert.equal(comms.length, 0);

    const log = db.prepare("SELECT * FROM activity_logs WHERE event_type = 'PROJECT_ITEM_DELETED' AND description LIKE ?").get(`%${itemId}%`) as any;
    assert.equal(log.user_id, ADMIN_ID);
    assert.equal(JSON.parse(log.metadata).note, 'Pomyłka');
});

test('addItemCore with source SUBIEKT stores source, subiekt_document_id and subiekt_position_id', async () => {
    const projectId = createProject('W_REALIZACJI');

    const { itemId } = await core.addItemCore(projectId, {
        type: 'PRODUCT', category: 'Tapety', amount_net: 1234.5,
        source: 'SUBIEKT', subiekt_document_id: 'sd_0001', subiekt_position_id: 7,
    }, { actorId: null });

    const item = db.prepare('SELECT source, subiekt_document_id, subiekt_position_id FROM project_items WHERE id = ?').get(itemId) as any;
    assert.deepEqual({ ...item }, { source: 'SUBIEKT', subiekt_document_id: 'sd_0001', subiekt_position_id: 7 });

    const comms = commissionsOfItem(itemId);
    assert.equal(comms.length, 1);
    assert.equal(comms[0].status, 'PENDING');
    approx(comms[0].amount_net, 1234.5 * ARCHI_RATE);

    // Synchronizacja maszynowa nie ma użytkownika — log zapisuje actorId = null.
    const log = db.prepare("SELECT * FROM activity_logs WHERE event_type = 'PROJECT_ITEM_ADDED' AND description LIKE ?").get(`%${itemId}%`) as any;
    assert.equal(log.user_id, null);
});
