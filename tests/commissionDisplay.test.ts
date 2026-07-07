import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    getProjectCommissionTotal,
    getProjectItemCommissionSummary,
} from '../src/lib/projectCommissions.ts';

const commissions = [
    { project_item_id: 'item_a', amount_net: 800, status: 'PENDING', rate: 0.1 },
    { project_item_id: 'item_a', amount_net: 200, status: 'EARNED', rate: 0.1 },
    { project_item_id: 'item_b', amount_net: 350, status: 'PAID', rate: 0.07 },
    { project_item_id: 'item_b', amount_net: 50, status: 'REJECTED', rate: 0.07 },
    { project_item_id: 'item_c', amount_net: 123, status: 'EARNED', rate: null },
];

test('maps project item display commission from commission rows, not legacy item rates', () => {
    const summary = getProjectItemCommissionSummary('item_a', commissions);

    assert.equal(summary.amount, 1000);
    assert.equal(summary.rate, 0.1);
    assert.equal(summary.hasCommission, true);
});

test('returns no display rate when an item has no commission rows or null historical rate', () => {
    assert.deepEqual(getProjectItemCommissionSummary('item_missing', commissions), {
        amount: 0,
        rate: null,
        hasCommission: false,
    });

    assert.deepEqual(getProjectItemCommissionSummary('item_c', commissions), {
        amount: 123,
        rate: null,
        hasCommission: true,
    });
});

test('project commission total uses only active financial commission statuses', () => {
    assert.equal(getProjectCommissionTotal(commissions), 1473);
});

test('architect project detail no longer reads legacy project_items.commission_rate', () => {
    const source = readFileSync(new URL('../src/components/ProjectDetailClient.tsx', import.meta.url), 'utf8');
    assert.equal(source.includes('commission_rate'), false);
});

