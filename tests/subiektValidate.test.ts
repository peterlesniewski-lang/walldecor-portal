import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBIEKT_SYNC_MAX_DOCUMENTS } from '../src/lib/subiekt/types.ts';

// validate.ts importuje './types' bez rozszerzenia (jak reszta src/) — potrzebny hook rozwiązywania modułów.
await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { parseSyncRequest } = await import('../src/lib/subiekt/validate.ts');

function makeDoc(externalId: number, overrides: Record<string, unknown> = {}) {
    return {
        external_id: externalId,
        type: 'ZK',
        number: `ZK ${externalId}/10/2026`,
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
                external_id: externalId * 10,
                ordinal: 1,
                product_id: 77,
                name: 'Tapeta Test',
                quantity: 10,
                unit: 'szt',
                unit_price_net: 100,
                net_total: 1000,
                corrects_position_external_id: null,
            },
        ],
        ...overrides,
    };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
        run_id: '11111111-1111-4111-8111-111111111111',
        agent_version: '0.1.0',
        page: 1,
        pages: 1,
        documents: [makeDoc(1), makeDoc(2, { type: 'KFS', parent_external_id: 1, net_total: -50, gross_total: -61.5, positions: [] })],
        ...overrides,
    };
}

function expectError(json: unknown): string {
    const result = parseSyncRequest(json);
    assert.equal(result.ok, false);
    return result.ok ? '' : result.error;
}

test('accepts a valid two-document request and returns it unchanged', () => {
    const input = makeRequest();
    const result = parseSyncRequest(input);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, input);
});

test('drops unknown extra fields', () => {
    const input = makeRequest({ extra_top: 1 });
    (input.documents[0] as Record<string, unknown>).extra_doc = 'x';
    (input.documents[0].positions[0] as Record<string, unknown>).extra_pos = 'y';
    const result = parseSyncRequest(input);
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal('extra_top' in result.value, false);
        assert.equal('extra_doc' in result.value.documents[0], false);
        assert.equal('extra_pos' in result.value.documents[0].positions[0], false);
    }
});

test('rejects a non-object body', () => {
    expectError(null);
    expectError([]);
    expectError('x');
});

test('rejects a request without documents', () => {
    const input: Record<string, unknown> = makeRequest();
    delete input.documents;
    assert.match(expectError(input), /documents/);
});

test('rejects a bad run_id', () => {
    assert.match(expectError(makeRequest({ run_id: 'not-a-uuid' })), /run_id/);
});

test('rejects an empty or too long agent_version', () => {
    assert.match(expectError(makeRequest({ agent_version: '' })), /agent_version/);
    assert.match(expectError(makeRequest({ agent_version: 'x'.repeat(33) })), /agent_version/);
});

test('rejects page greater than pages', () => {
    assert.match(expectError(makeRequest({ page: 3, pages: 2 })), /page/);
});

test('rejects non-positive or fractional page numbers', () => {
    assert.match(expectError(makeRequest({ page: 0 })), /page/);
    assert.match(expectError(makeRequest({ pages: 1.5 })), /pages/);
});

test('rejects external_id given as a string', () => {
    const input = makeRequest({ documents: [makeDoc(1, { external_id: '1' })] });
    assert.match(expectError(input), /documents\[0\]\.external_id/);
});

test('rejects an unknown document type', () => {
    const input = makeRequest({ documents: [makeDoc(1, { type: 'XX' })] });
    assert.match(expectError(input), /documents\[0\]\.type/);
});

test('rejects more than the maximum number of documents', () => {
    const documents = Array.from({ length: SUBIEKT_SYNC_MAX_DOCUMENTS + 1 }, (_, i) => makeDoc(i + 1));
    assert.equal(expectError(makeRequest({ documents })), 'TOO_MANY_DOCUMENTS');
});

test('accepts exactly the maximum number of documents', () => {
    const documents = Array.from({ length: SUBIEKT_SYNC_MAX_DOCUMENTS }, (_, i) => makeDoc(i + 1));
    assert.equal(parseSyncRequest(makeRequest({ documents })).ok, true);
});

test('rejects an invalid issued_at', () => {
    assert.match(expectError(makeRequest({ documents: [makeDoc(1, { issued_at: '20.10.2026' })] })), /documents\[0\]\.issued_at/);
    assert.match(expectError(makeRequest({ documents: [makeDoc(1, { issued_at: '2026-02-31' })] })), /documents\[0\]\.issued_at/);
});

test('rejects non-finite totals and a non-boolean is_paid', () => {
    assert.match(expectError(makeRequest({ documents: [makeDoc(1, { net_total: null })] })), /documents\[0\]\.net_total/);
    assert.match(expectError(makeRequest({ documents: [makeDoc(1, { gross_total: 'abc' })] })), /documents\[0\]\.gross_total/);
    assert.match(expectError(makeRequest({ documents: [makeDoc(1, { is_paid: 0 })] })), /documents\[0\]\.is_paid/);
});

test('rejects empty contractor_name and overlong nip', () => {
    assert.match(expectError(makeRequest({ documents: [makeDoc(1, { contractor_name: '' })] })), /contractor_name/);
    assert.match(expectError(makeRequest({ documents: [makeDoc(1, { contractor_nip: 'x'.repeat(21) })] })), /contractor_nip/);
});

test('rejects a non-integer parent_external_id', () => {
    assert.match(expectError(makeRequest({ documents: [makeDoc(1, { parent_external_id: 0 })] })), /parent_external_id/);
});

test('names the path of an invalid position field', () => {
    const doc = makeDoc(1);
    doc.positions[0].external_id = 'abc' as unknown as number;
    assert.equal(
        expectError(makeRequest({ documents: [doc] })),
        'documents[0].positions[0].external_id: expected positive integer'
    );
});

test('rejects invalid position fields', () => {
    const bad = (patch: Record<string, unknown>) => {
        const doc = makeDoc(1);
        Object.assign(doc.positions[0], patch);
        return expectError(makeRequest({ documents: [doc] }));
    };
    assert.match(bad({ ordinal: 0 }), /positions\[0\]\.ordinal/);
    assert.match(bad({ name: '' }), /positions\[0\]\.name/);
    assert.match(bad({ quantity: Infinity }), /positions\[0\]\.quantity/);
    assert.match(bad({ unit: 'x'.repeat(17) }), /positions\[0\]\.unit/);
    assert.match(bad({ product_id: -1 }), /positions\[0\]\.product_id/);
    assert.match(bad({ corrects_position_external_id: 1.5 }), /positions\[0\]\.corrects_position_external_id/);
});
