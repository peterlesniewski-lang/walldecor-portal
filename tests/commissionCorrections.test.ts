import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadSource() {
    return readFile(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    assert.ok(start > -1, `missing marker: ${startMarker}`);
    const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
    assert.ok(end > start, `missing end marker: ${endMarker}`);
    return source.slice(start, end);
}

test('item correction sums EARNED, IN_PAYMENT and PAID commissions but not PENDING', async () => {
    const source = await loadSource();
    const action = sliceBetween(source, 'export async function updateProjectItem', 'export async function addProjectItem');

    assert.match(
        action,
        /SELECT COALESCE\(SUM\(amount_net\), 0\) as total FROM commissions WHERE project_item_id = \? AND status IN \('EARNED', 'IN_PAYMENT', 'PAID'\)/
    );
    assert.doesNotMatch(action, /SUM\(amount_net\)[^"]*status = 'EARNED'/);
    assert.doesNotMatch(action, /SUM\(amount_net\)[^"]*'PENDING'/);
});

test('item correction runs item update, commission and cashback in one transaction', async () => {
    const source = await loadSource();
    const action = sliceBetween(source, 'export async function updateProjectItem', 'export async function addProjectItem');

    assert.match(action, /await withTransaction\(async \(queryFn\) => \{[\s\S]*UPDATE project_items SET amount_net = \?[\s\S]*INSERT INTO commissions[\s\S]*spendCashback\(/);
    assert.doesNotMatch(action, /await query\("UPDATE project_items SET amount_net/);
});

test('negative cashback correction uses FIFO spendCashback instead of a SPEND row pointing at the item', async () => {
    const source = await loadSource();
    const action = sliceBetween(source, 'export async function updateProjectItem', 'export async function addProjectItem');

    assert.match(action, /spendCashback\(ownerId, Math\.abs\(diffCashback\), note \|\| 'Korekta: pomniejszenie kwoty pozycji', itemId, queryFn\)/);
    // No direct SPEND insert (the old code linked SPEND to the project item id, which the balance formula never matches)
    assert.doesNotMatch(action, /'SPEND'/);
    assert.doesNotMatch(action, /diffCashback > 0 \? 'EARN' : 'SPEND'/);
    // Positive correction still creates an EARN row linked to the item with a 12-month expiry
    assert.match(action, /INSERT INTO wallet_transactions[\s\S]*'EARN', diffCashback, itemId[\s\S]*formatSqlDateTime\(expiresAt\)/);
});

test('uncovered negative cashback correction is logged and does not abort the correction', async () => {
    const source = await loadSource();
    const action = sliceBetween(source, 'export async function updateProjectItem', 'export async function addProjectItem');

    assert.match(action, /Insufficient cashback balance/);
    assert.match(action, /logActivity\(\s*session\.user\.id,\s*'CASHBACK_CORRECTION_UNCOVERED'[\s\S]*\{ projectId, itemId, amount: uncoveredCashback \}/);
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
