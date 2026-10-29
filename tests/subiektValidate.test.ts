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

function expectError(json: unknown, code: 'INVALID_ENVELOPE' | 'TOO_MANY_DOCUMENTS' = 'INVALID_ENVELOPE'): string {
    const result = parseSyncRequest(json);
    assert.equal(result.ok, false);
    if (result.ok) return '';
    assert.equal(result.code, code);
    return result.error;
}

/** Jeden niepoprawny dokument obok poprawnego: poprawny przechodzi, zwraca odrzucenie złego. */
function rejectionOf(doc: Record<string, unknown>): { external_id: number; reason: string } {
    const result = parseSyncRequest(makeRequest({ documents: [makeDoc(900), doc] }));
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('unreachable');
    assert.deepEqual(result.value.documents.map((d) => d.external_id), [900]);
    assert.equal(result.rejected.length, 1);
    return result.rejected[0];
}
const reasonOf = (doc: Record<string, unknown>) => rejectionOf(doc).reason;

test('accepts a valid two-document request and returns it unchanged', () => {
    const input = makeRequest();
    const result = parseSyncRequest(input);
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.deepEqual(result.value, input);
        assert.deepEqual(result.rejected, []);
    }
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

// --- Koperta: błąd odrzuca całe żądanie (INVALID_ENVELOPE / TOO_MANY_DOCUMENTS) ---

test('rejects a non-object body', () => {
    expectError(null);
    expectError([]);
    expectError('x');
});

test('rejects a request without documents or with non-array documents', () => {
    const input: Record<string, unknown> = makeRequest();
    delete input.documents;
    assert.match(expectError(input), /documents/);
    assert.match(expectError(makeRequest({ documents: {} })), /documents/);
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

test('rejects more than the maximum number of documents with code TOO_MANY_DOCUMENTS', () => {
    const documents = Array.from({ length: SUBIEKT_SYNC_MAX_DOCUMENTS + 1 }, (_, i) => makeDoc(i + 1));
    assert.equal(expectError(makeRequest({ documents }), 'TOO_MANY_DOCUMENTS'), 'TOO_MANY_DOCUMENTS');
});

test('the document limit counts invalid documents too', () => {
    const documents = Array.from({ length: SUBIEKT_SYNC_MAX_DOCUMENTS + 1 }, () => ({ broken: true }));
    expectError(makeRequest({ documents }), 'TOO_MANY_DOCUMENTS');
});

test('accepts exactly the maximum number of documents', () => {
    const documents = Array.from({ length: SUBIEKT_SYNC_MAX_DOCUMENTS }, (_, i) => makeDoc(i + 1));
    assert.equal(parseSyncRequest(makeRequest({ documents })).ok, true);
});

// --- Dokumenty: walidowane pojedynczo, zły dokument → rejected, reszta przechodzi ---

test('an invalid document among valid ones is excluded and reported with a VALIDATION: reason', () => {
    const result = parseSyncRequest(makeRequest({
        documents: [makeDoc(1), makeDoc(2, { type: 'XX' }), makeDoc(3)],
    }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.value.documents.map((d) => d.external_id), [1, 3]);
    assert.deepEqual(result.rejected, [{ external_id: 2, reason: 'VALIDATION:type: expected one of ZK, FS, KFS, FP, WZ' }]);
});

test('a page where every document is invalid still parses, with an empty documents list', () => {
    const result = parseSyncRequest(makeRequest({ documents: [makeDoc(1, { number: '' }), 'x'] }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.value.documents, []);
    assert.deepEqual(result.rejected.map((r) => r.external_id), [1, 0]);
    assert.equal(result.rejected[1].reason, 'VALIDATION:documents[1]: expected object');
});

test('a non-numeric document external_id is reported as external_id 0 with the array index', () => {
    assert.deepEqual(rejectionOf(makeDoc(1, { external_id: '1' })), {
        external_id: 0,
        reason: 'VALIDATION:documents[1]: external_id: expected positive integer',
    });
});

test('a document with a valid external_id but another bad field keeps its external_id', () => {
    assert.deepEqual(rejectionOf(makeDoc(7, { type: 'XX' })).external_id, 7);
});

test('rejects an invalid issued_at', () => {
    assert.match(reasonOf(makeDoc(1, { issued_at: '20.10.2026' })), /^VALIDATION:issued_at: /);
    assert.match(reasonOf(makeDoc(1, { issued_at: '2026-02-31' })), /^VALIDATION:issued_at: /);
});

test('rejects non-finite totals and a non-boolean is_paid', () => {
    assert.match(reasonOf(makeDoc(1, { net_total: null })), /^VALIDATION:net_total: /);
    assert.match(reasonOf(makeDoc(1, { gross_total: 'abc' })), /^VALIDATION:gross_total: /);
    assert.match(reasonOf(makeDoc(1, { is_paid: 0 })), /^VALIDATION:is_paid: /);
});

test('rejects empty contractor_name and overlong nip', () => {
    assert.match(reasonOf(makeDoc(1, { contractor_name: '' })), /^VALIDATION:contractor_name: /);
    assert.match(reasonOf(makeDoc(1, { contractor_nip: 'x'.repeat(21) })), /^VALIDATION:contractor_nip: /);
});

test('rejects a non-integer parent_external_id', () => {
    assert.match(reasonOf(makeDoc(1, { parent_external_id: 0 })), /^VALIDATION:parent_external_id: /);
});

test('names the path of an invalid position field relative to the document', () => {
    const doc = makeDoc(1);
    doc.positions[0].external_id = 'abc' as unknown as number;
    assert.deepEqual(rejectionOf(doc), {
        external_id: 1,
        reason: 'VALIDATION:positions[0].external_id: expected positive integer',
    });
});

test('rejects invalid position fields', () => {
    const bad = (patch: Record<string, unknown>) => {
        const doc = makeDoc(1);
        Object.assign(doc.positions[0], patch);
        return reasonOf(doc);
    };
    assert.match(bad({ ordinal: 0 }), /^VALIDATION:positions\[0\]\.ordinal: /);
    assert.match(bad({ name: '' }), /^VALIDATION:positions\[0\]\.name: /);
    assert.match(bad({ quantity: Infinity }), /^VALIDATION:positions\[0\]\.quantity: /);
    assert.match(bad({ unit: 'x'.repeat(17) }), /^VALIDATION:positions\[0\]\.unit: /);
    assert.match(bad({ product_id: -1 }), /^VALIDATION:positions\[0\]\.product_id: /);
    assert.match(bad({ corrects_position_external_id: 1.5 }), /^VALIDATION:positions\[0\]\.corrects_position_external_id: /);
});
