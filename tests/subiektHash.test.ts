import test from 'node:test';
import assert from 'node:assert/strict';
import { hashDocument } from '../src/lib/subiekt/hash.ts';
import type { SubiektDocumentPayload } from '../src/lib/subiekt/types.ts';

function makeDoc(): SubiektDocumentPayload {
    return {
        external_id: 5001,
        type: 'ZK',
        number: 'ZK 1/10/2026',
        issued_at: '2026-10-20',
        contractor_name: 'Jan Testowy',
        contractor_nip: null,
        architect_code: 'A-001',
        parent_external_id: null,
        net_total: 1000,
        gross_total: 1230,
        is_paid: false,
        remarks: null,
        positions: [
            {
                external_id: 9001, ordinal: 1, product_id: 77, name: 'Tapeta Test',
                quantity: 10, unit: 'szt', unit_price_net: 100, net_total: 1000,
                corrects_position_external_id: null,
            },
            {
                external_id: 9002, ordinal: 2, product_id: null, name: 'Klej',
                quantity: 2, unit: 'szt', unit_price_net: 20, net_total: 40,
                corrects_position_external_id: null,
            },
        ],
    };
}

test('hash is 64 lowercase hex chars', () => {
    assert.match(hashDocument(makeDoc()), /^[0-9a-f]{64}$/);
});

test('hash is deterministic', () => {
    assert.equal(hashDocument(makeDoc()), hashDocument(makeDoc()));
});

test('reordering positions does not change the hash', () => {
    const a = makeDoc();
    const b = makeDoc();
    b.positions.reverse();
    assert.equal(hashDocument(a), hashDocument(b));
});

test('key order inside the payload does not change the hash', () => {
    const a = makeDoc();
    const b = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a).reverse())));
    assert.equal(hashDocument(a), hashDocument(b));
});

test('changing a quantity changes the hash', () => {
    const a = makeDoc();
    const b = makeDoc();
    b.positions[0].quantity = 11;
    assert.notEqual(hashDocument(a), hashDocument(b));
});

test('changing is_paid does not change the hash', () => {
    const a = makeDoc();
    const b = makeDoc();
    b.is_paid = true;
    assert.equal(hashDocument(a), hashDocument(b));
});

test('changing remarks changes the hash', () => {
    const a = makeDoc();
    const b = makeDoc();
    b.remarks = 'dopisek #A-001';
    assert.notEqual(hashDocument(a), hashDocument(b));
});

test('changing the architect code changes the hash', () => {
    const a = makeDoc();
    const b = makeDoc();
    b.architect_code = 'A-002';
    assert.notEqual(hashDocument(a), hashDocument(b));
});
