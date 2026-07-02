import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getPartnerStatusInfo,
    getCommissionRateForTurnover,
    normalizeStatusOverride,
} from '../src/lib/partnerProgram.ts';

test('new architect starts as Partner with 10% commission (never 7%)', () => {
    const info = getPartnerStatusInfo(0);
    assert.equal(info.status, 'PARTNER');
    assert.equal(info.rate, 0.10);
    assert.equal(info.nextStatus, 'PARTNER_PLUS');
    assert.equal(info.turnoverToNext, 30000);
});

test('status thresholds follow the 30k / 50k qualified turnover brackets', () => {
    assert.equal(getCommissionRateForTurnover(29999.99), 0.10);
    assert.equal(getCommissionRateForTurnover(30000), 0.12);
    assert.equal(getCommissionRateForTurnover(49999.99), 0.12);
    assert.equal(getCommissionRateForTurnover(50000), 0.15);
    assert.equal(getCommissionRateForTurnover(500000), 0.15);
});

test('manual admin override takes precedence over turnover and drives the rate', () => {
    const info = getPartnerStatusInfo(0, 'PARTNER_PREMIUM');
    assert.equal(info.status, 'PARTNER_PREMIUM');
    assert.equal(info.rate, 0.15);
    assert.equal(info.isOverride, true);
});

test('legacy tier_override values map onto the new statuses', () => {
    assert.equal(normalizeStatusOverride('BEGINNER'), 'PARTNER');
    assert.equal(normalizeStatusOverride('SILVER'), 'PARTNER');
    assert.equal(normalizeStatusOverride('GOLD'), 'PARTNER_PLUS');
    assert.equal(normalizeStatusOverride('PLATINUM'), 'PARTNER_PREMIUM');
    assert.equal(normalizeStatusOverride(null), null);
    assert.equal(normalizeStatusOverride('NONSENSE'), null);
});

test('progress towards the next threshold is reported for the dashboard bar', () => {
    const info = getPartnerStatusInfo(15000);
    assert.equal(info.status, 'PARTNER');
    assert.equal(info.turnoverToNext, 15000);
    assert.equal(info.progress, 0.5);

    const top = getPartnerStatusInfo(80000);
    assert.equal(top.status, 'PARTNER_PREMIUM');
    assert.equal(top.nextStatus, null);
    assert.equal(top.progress, 1);
});
