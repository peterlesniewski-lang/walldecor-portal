// Prowizja pozycji w widoku architekta: suma rekordu początkowego i korekt (Loop 6, krok 8 — KFS po rozliczeniu).
import test from 'node:test';
import assert from 'node:assert/strict';

const { summarizeItemCommission }: typeof import('../src/lib/itemCommission') =
    await import(new URL('../src/lib/itemCommission.ts', import.meta.url).href);

const commissions = [
    { project_item_id: 'i_1', amount_net: 80, status: 'EARNED', rate: 0.1 },
    { project_item_id: 'i_2', amount_net: 30, status: 'PENDING', rate: 0.1 },
    { project_item_id: 'i_1', amount_net: -20, status: 'EARNED', rate: 0.1 },
];

test('item with a correction → amount is the sum (80 − 20 = 60), status and rate of the first record', () => {
    assert.deepEqual(summarizeItemCommission(commissions, 'i_1'), { amount: 60, status: 'EARNED', rate: 0.1 });
});

test('item with one record → that record; item without commission → null', () => {
    assert.deepEqual(summarizeItemCommission(commissions, 'i_2'), { amount: 30, status: 'PENDING', rate: 0.1 });
    assert.equal(summarizeItemCommission(commissions, 'i_3'), null);
});

test('string amounts from MySQL DECIMAL and missing rate', () => {
    const rows = [{ project_item_id: 'i_9', amount_net: '100.50', status: 'PAID', rate: null }, { project_item_id: 'i_9', amount_net: '-0.50', status: 'EARNED', rate: '0.10' }];
    assert.deepEqual(summarizeItemCommission(rows, 'i_9'), { amount: 100, status: 'PAID', rate: null });
});
