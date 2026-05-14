import test from 'node:test';
import assert from 'node:assert/strict';
import { isTerminalPayoutStatus, mapPayoutActionToStatus } from '../src/lib/payoutWorkflow.ts';

test('maps paid payout action to final PAID status', () => {
    assert.equal(mapPayoutActionToStatus('PAID'), 'PAID');
});

test('keeps approve action distinct from paid action', () => {
    assert.equal(mapPayoutActionToStatus('APPROVE'), 'APPROVED');
});

test('allows legacy approved payouts to be finalized as paid', () => {
    assert.equal(isTerminalPayoutStatus('APPROVED'), false);
    assert.equal(isTerminalPayoutStatus('PAID'), true);
    assert.equal(isTerminalPayoutStatus('REJECTED'), true);
});
