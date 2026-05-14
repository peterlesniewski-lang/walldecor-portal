import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('spendCashback supports transaction-bound query execution', async () => {
    const source = await readFile(new URL('../src/lib/cashback.ts', import.meta.url), 'utf8');

    assert.match(source, /queryFn:\s*typeof query\s*=\s*query/);
    assert.match(source, /const activeEarns = await queryFn/);
    assert.match(source, /await queryFn\(\s*"INSERT INTO wallet_transactions/);
});

test('cashback redemption request is atomic', async () => {
    const source = await readFile(new URL('../src/app/actions/cashback.ts', import.meta.url), 'utf8');

    assert.match(source, /import \{ query, withTransaction \} from "@\/lib\/db";/);
    assert.match(source, /await withTransaction\(async \(queryFn\) =>/);
    assert.match(source, /await spendCashback\(userId, amount, "Wymiana na kartę podarunkową", redemptionId, queryFn\)/);
});

test('project cashback application spends wallet balance inside a transaction', async () => {
    const source = await readFile(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');
    const actionStart = source.indexOf('export async function applyCashbackToProject');
    const actionSource = source.slice(actionStart);

    assert.ok(actionStart > -1);
    assert.match(actionSource, /await withTransaction\(async \(queryFn\) =>/);
    assert.match(actionSource, /await spendCashback\(session\.user\.id, amount,[\s\S]*queryFn\)/);
});

test('cashback discount code issuance completes only pending redemptions atomically', async () => {
    const source = await readFile(new URL('../src/app/actions/cashback.ts', import.meta.url), 'utf8');
    const actionStart = source.indexOf('export async function issueDiscountCode');
    const actionEnd = source.indexOf('export async function getMyRedemptions', actionStart);
    const actionSource = source.slice(actionStart, actionEnd);

    assert.ok(actionStart > -1);
    assert.match(actionSource, /await withTransaction\(async \(queryFn\) =>/);
    assert.match(actionSource, /UPDATE cashback_redemptions SET code = \?, status = 'COMPLETED', processed_at = CURRENT_TIMESTAMP WHERE id = \? AND status = 'PENDING'/);
    assert.match(actionSource, /UPDATE wallet_transactions SET description = \? WHERE reference_id = \?/);
    assert.match(actionSource, /affectedRows/);
});

test('batch payout does not reject requests after a processing error', async () => {
    const source = await readFile(new URL('../src/app/api/admin/payouts/batch/route.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /updatePayoutStatus\(payoutReq\.id,\s*'REJECTED'\)/);
});
