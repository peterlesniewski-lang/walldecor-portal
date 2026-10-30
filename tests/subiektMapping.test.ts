import test from 'node:test';
import assert from 'node:assert/strict';

// mapping.ts importuje ./codeFormat bez rozszerzenia (jak reszta src/) — potrzebny hook rozwiązywania.
type MappingModule = typeof import('../src/lib/subiekt/mapping.ts');
await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const {
    resolveArchitectCode, sortDocumentsForProcessing, resolveRoot, positionToItemType,
    buildItemInput, leadingDocType, createsItems,
}: MappingModule = await import(new URL('../src/lib/subiekt/mapping.ts', import.meta.url).href);
import type { SubiektDocumentPayload, SubiektPositionPayload, SubiektDocType } from '../src/lib/subiekt/types.ts';

function makePos(overrides: Partial<SubiektPositionPayload> = {}): SubiektPositionPayload {
    return {
        external_id: 9001, ordinal: 1, product_id: 77, name: 'Tapeta Test', quantity: 10, unit: 'szt',
        unit_price_net: 100, net_total: 1000, corrects_position_external_id: null, ...overrides,
    };
}

function makeDoc(overrides: Partial<SubiektDocumentPayload> = {}): SubiektDocumentPayload {
    return {
        external_id: 5001, type: 'ZK', number: 'ZK 1/10/2026', issued_at: '2026-10-20',
        contractor_name: 'Jan Testowy', contractor_nip: null, architect_code: 'A-001',
        parent_external_id: null, net_total: 1000, gross_total: 1230, is_paid: false, remarks: null,
        positions: [makePos()], ...overrides,
    };
}

test('resolveArchitectCode: pole własne — token przed spacją, trim, uppercase', () => {
    assert.equal(resolveArchitectCode({ architect_code: 'A-001 Nowak', remarks: null }), 'A-001');
    assert.equal(resolveArchitectCode({ architect_code: ' a-001 ', remarks: null }), 'A-001');
});

test('resolveArchitectCode: znacznik z uwag', () => {
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: 'Projekt salon #A-001 pilne' }), 'A-001');
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: '#a001' }), 'A-001');
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: '#A_xy9' }), 'A-XY9');
});

test('resolveArchitectCode: numeric remarks marker is zero-padded like generated codes (A-001)', () => {
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: 'ZK dla #A-1' }), 'A-001');
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: '#A-01' }), 'A-001');
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: '#a42' }), 'A-042');
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: '#A-0001' }), 'A-001');
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: '#A-1200' }), 'A-1200');
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: '#A-12X' }), 'A-12X', 'niecyfrowy sufiks bez zmian');
});

test('resolveArchitectCode: pole własne wygrywa, brak → null, pusty string = brak', () => {
    assert.equal(resolveArchitectCode({ architect_code: 'B-7', remarks: '#A-001' }), 'B-7');
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: null }), null);
    assert.equal(resolveArchitectCode({ architect_code: '', remarks: null }), null);
    assert.equal(resolveArchitectCode({ architect_code: '   ', remarks: '#A-002' }), 'A-002');
    assert.equal(resolveArchitectCode({ architect_code: null, remarks: 'bez znacznika' }), null);
});

test('sortDocumentsForProcessing: ranga typu, potem data, potem external_id; bez mutacji', () => {
    const input = [
        { type: 'KFS' as const, issued_at: '2026-10-01', external_id: 1 },
        { type: 'FS' as const, issued_at: '2026-10-02', external_id: 2 },
        { type: 'WZ' as const, issued_at: '2026-10-03', external_id: 3 },
        { type: 'FP' as const, issued_at: '2026-10-05', external_id: 4 },
        { type: 'ZK' as const, issued_at: '2026-10-05', external_id: 5 },
        { type: 'ZK' as const, issued_at: '2026-10-04', external_id: 9 },
    ];
    const snapshot = JSON.stringify(input);
    const sorted = sortDocumentsForProcessing(input);
    assert.deepEqual(sorted.map(d => d.external_id), [9, 4, 5, 3, 2, 1]);
    assert.equal(JSON.stringify(input), snapshot);
    assert.notEqual(sorted, input);
});

test('resolveRoot: łańcuch ZK → WZ → FS prowadzi do ZK', () => {
    const parents = new Map<number, number | null>([[1, null], [2, 1], [3, 2]]);
    const parentOf = (id: number) => parents.get(id);
    assert.deepEqual(resolveRoot(1, parentOf), { rootExternalId: 1 });
    assert.deepEqual(resolveRoot(2, parentOf), { rootExternalId: 1 });
    assert.deepEqual(resolveRoot(3, parentOf), { rootExternalId: 1 });
});

test('resolveRoot: nieznany rodzic → missingExternalId', () => {
    const parents = new Map<number, number | null>([[5, 4]]);
    assert.deepEqual(resolveRoot(5, id => parents.get(id)), { missingExternalId: 4 });
    assert.deepEqual(resolveRoot(99, id => parents.get(id)), { missingExternalId: 99 });
});

test('resolveRoot: cykl nie zapętla się', () => {
    const parents = new Map<number, number | null>([[7, 8], [8, 7]]);
    const result = resolveRoot(7, id => parents.get(id));
    assert.ok('missingExternalId' in result);
    assert.ok([7, 8].includes((result as { missingExternalId: number }).missingExternalId));
});

test('positionToItemType: karta towaru → PRODUCT, jednorazowa → INSTALLATION', () => {
    assert.equal(positionToItemType({ product_id: 77 }), 'PRODUCT');
    assert.equal(positionToItemType({ product_id: null }), 'INSTALLATION');
});

test('buildItemInput: FS niesie numer faktury i numer ZK korzenia', () => {
    const doc = makeDoc({ type: 'FS', number: 'FS 123/10/2026', is_paid: true });
    const item = buildItemInput(doc, makePos(), { subiektDocumentId: 'sd_abc', rootZkNumber: 'ZK 1/10/2026' });
    assert.deepEqual(item, {
        type: 'PRODUCT', category: 'Produkt (Subiekt)', description: 'Tapeta Test', amount_net: 1000,
        order_number: 'ZK 1/10/2026', invoice_number: 'FS 123/10/2026', is_paid: true, source: 'SUBIEKT',
        subiekt_document_id: 'sd_abc', subiekt_position_id: 9001,
    });
});

test('buildItemInput: ZK bez numeru faktury, jednorazowa → Montaż, forcedType ma pierwszeństwo', () => {
    const doc = makeDoc();
    const install = buildItemInput(doc, makePos({ product_id: null, external_id: 9002 }), { subiektDocumentId: 'sd_1', rootZkNumber: null });
    assert.equal(install.type, 'INSTALLATION');
    assert.equal(install.category, 'Montaż (Subiekt)');
    assert.equal(install.invoice_number, null);
    assert.equal(install.order_number, null);
    assert.equal(install.is_paid, false);
    assert.equal(install.subiekt_position_id, 9002);

    const forced = buildItemInput(doc, makePos({ product_id: null }), { subiektDocumentId: 'sd_1', rootZkNumber: 'ZK 1', forcedType: 'PRODUCT' });
    assert.equal(forced.type, 'PRODUCT');
    assert.equal(forced.category, 'Produkt (Subiekt)');

    const forcedInst = buildItemInput(doc, makePos({ product_id: 5 }), { subiektDocumentId: 'sd_1', rootZkNumber: 'ZK 1', forcedType: 'INSTALLATION' });
    assert.equal(forcedInst.type, 'INSTALLATION');
    assert.equal(forcedInst.category, 'Montaż (Subiekt)');
});

test('leadingDocType i createsItems', () => {
    const cases: Array<[SubiektDocType[], 'FS' | 'ZK']> = [
        [['ZK'], 'ZK'], [['ZK', 'WZ'], 'ZK'], [['ZK', 'FS'], 'FS'], [['ZK', 'WZ', 'FS', 'KFS'], 'FS'], [['FP'], 'ZK'], [[], 'ZK'],
    ];
    for (const [types, expected] of cases) assert.equal(leadingDocType(types), expected, types.join(','));
    assert.equal(createsItems('ZK'), true);
    assert.equal(createsItems('FS'), true);
    assert.equal(createsItems('KFS'), false);
    assert.equal(createsItems('FP'), false);
    assert.equal(createsItems('WZ'), false);
});
