import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadSource(path = '../src/app/actions/projects.ts') {
    return readFile(new URL(path, import.meta.url), 'utf8');
}

// Logika korekty pozycji żyje w rdzeniu src/lib/projectItems.ts (akcja updateProjectItem to wrapper).
async function loadItemAmountCore() {
    const source = await loadSource('../src/lib/projectItems.ts');
    return sliceBetween(source, 'export async function updateItemAmountCore', 'export async function addItemCore');
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    assert.ok(start > -1, `missing marker: ${startMarker}`);
    const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
    assert.ok(end > start, `missing end marker: ${endMarker}`);
    return source.slice(start, end);
}

test('item correction sums EARNED, IN_PAYMENT and PAID commissions but not PENDING', async () => {
    const action = await loadItemAmountCore();

    assert.match(
        action,
        /SELECT COALESCE\(SUM\(amount_net\), 0\) as total FROM commissions WHERE project_item_id = \? AND status IN \('EARNED', 'IN_PAYMENT', 'PAID'\)/
    );
    assert.doesNotMatch(action, /SUM\(amount_net\)[^"]*status = 'EARNED'/);
    assert.doesNotMatch(action, /SUM\(amount_net\)[^"]*'PENDING'/);
});

test('item correction runs item update, commission and cashback in one transaction', async () => {
    const action = await loadItemAmountCore();

    // Wszystkie zapisy (pozycja, prowizja, cashback, log) leżą wewnątrz jednego callbacku withTransaction.
    const txStart = action.indexOf('await withTransaction(async (txQuery) => {');
    const txEnd = action.indexOf('return { projectId };');
    assert.ok(txStart > -1, 'brak withTransaction w updateItemAmountCore');
    assert.ok(txEnd > txStart, 'withTransaction musi zamykać się przed zwrotem wyniku');
    assert.equal(action.split('withTransaction(').length - 1, 1, 'dokładnie jedna transakcja');

    const writes = [
        /txQuery\("UPDATE project_items SET amount_net = \?/g,
        /INSERT INTO commissions/g,
        /UPDATE commissions SET/g,
        /DELETE FROM commissions/g,
        /INSERT INTO wallet_transactions/g,
        /spendCashback\(/g,
        /logActivity\(/g,
    ];
    for (const pattern of writes) {
        const hits = [...action.matchAll(pattern)].map(m => m.index ?? -1);
        assert.ok(hits.length > 0, `brak zapisu ${pattern}`);
        for (const at of hits) assert.ok(at > txStart && at < txEnd, `${pattern} poza transakcją`);
    }
    assert.match(action, /txQuery\("UPDATE project_items SET amount_net = \?[\s\S]*INSERT INTO commissions[\s\S]*spendCashback\(/);
    // Żaden zapis nie idzie zwykłym query(...) z pominięciem transakcji.
    assert.doesNotMatch(action, /await query(<any>)?\(\s*["`]\s*(UPDATE|INSERT|DELETE)/);
});

test('negative cashback correction uses FIFO spendCashback instead of a SPEND row pointing at the item', async () => {
    const action = await loadItemAmountCore();

    assert.match(action, /spendCashback\(ownerId, Math\.abs\(diffCashback\), actor\.note \|\| 'Korekta: pomniejszenie kwoty pozycji', itemId, txQuery\)/);
    // No direct SPEND insert (the old code linked SPEND to the project item id, which the balance formula never matches)
    assert.doesNotMatch(action, /'SPEND'/);
    assert.doesNotMatch(action, /diffCashback > 0 \? 'EARN' : 'SPEND'/);
    // Positive correction still creates an EARN row linked to the item with a 12-month expiry
    assert.match(action, /INSERT INTO wallet_transactions[\s\S]*'EARN', diffCashback, itemId[\s\S]*formatSqlDateTime\(expiresAt\)/);
});

test('uncovered negative cashback correction is logged and does not abort the correction', async () => {
    const action = await loadItemAmountCore();

    assert.match(action, /Insufficient cashback balance/);
    assert.match(action, /logActivity\(\s*actor\.actorId,\s*'CASHBACK_CORRECTION_UNCOVERED'[\s\S]*\{ projectId, itemId, amount: uncoveredCashback \}/);
});

test('project finalization guard also skips grants when settled commissions already exist', async () => {
    const source = await loadSource();
    const action = sliceBetween(source, 'export async function updateProjectStatus', 'export async function getAllArchitects');

    assert.match(action, /FROM commissions WHERE project_id = \? AND status IN \('EARNED', 'IN_PAYMENT', 'PAID'\)/);
    assert.match(action, /existingTrans\.length > 0 \|\| existingSettledComm\.length > 0/);
    // Project status is still persisted before the guard returns
    const statusUpdate = action.indexOf('UPDATE projects SET status = ?');
    const guard = action.indexOf('existingTrans.length > 0 ||');
    assert.ok(statusUpdate > -1 && guard > statusUpdate);
});

test('commission payout locks every EARNED row (including negative corrections) and enforces the minimum', async () => {
    const source = await loadSource();
    const action = sliceBetween(source, 'export async function requestCommissionPayout', 'export async function updatePayoutStatus');

    assert.match(action, /earnedTotal < 100/);
    assert.match(action, /const toLock: string\[\] = earnedComms\.map\(/);
    // The old "accumulate until the requested amount is covered" loop is gone
    assert.doesNotMatch(action, /accumulated/);
    assert.doesNotMatch(action, /if \(accumulated >= amount\) break/);
    // Per-row guard against concurrent state changes is preserved
    assert.match(action, /UPDATE commissions SET status = 'IN_PAYMENT', payout_id = \? WHERE id = \? AND status = 'EARNED'/);
    assert.match(action, /affectedRows !== 1/);
});
