// Diff pozycji ZK/FP i tekst wpisu do logu (PLAN-SUBIEKT-2026-10-29.md, 2.5 + Loop 3, Krok 1). Bez bazy.
// Kwoty z formatPLNFixed (src/lib/utils.ts): separator tysięcy to twarda spacja U+00A0 — stąd NBSP w oczekiwaniach.
import test from 'node:test';
import assert from 'node:assert/strict';

type DiffModule = typeof import('../src/lib/subiekt/diff');
type Pos = import('../src/lib/subiekt/types').SubiektPositionPayload;

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { diffPositions, formatDiffForLog }: DiffModule = await import(new URL('../src/lib/subiekt/diff.ts', import.meta.url).href);

const NBSP = ' ';

function pos(externalId: number, overrides: Partial<Pos> = {}): Pos {
    return {
        external_id: externalId, ordinal: 1, product_id: 77, name: 'Tapeta Floral', quantity: 10, unit: 'szt',
        unit_price_net: 120, net_total: 1200, corrects_position_external_id: null, ...overrides,
    };
}

test('quantity change → QUANTITY with exact before/after descriptions', () => {
    const lines = diffPositions([pos(1)], [pos(1, { quantity: 8, net_total: 960 })]);
    assert.deepEqual(lines, [{ kind: 'QUANTITY', name: 'Tapeta Floral', before: '10 szt × 120,00', after: '8 szt × 120,00' }]);
});

test('fractional quantity and 4-digit price keep Polish formatting', () => {
    const lines = diffPositions(
        [pos(1, { quantity: 12.5, unit: 'm2', unit_price_net: 1500 })],
        [pos(1, { quantity: 10, unit: 'm2', unit_price_net: 1500 })]
    );
    assert.equal(lines[0].before, `12,5 m2 × 1${NBSP}500,00`);
    assert.equal(formatDiffForLog('ZK 1/10/2026', lines, 0, 0), `ZK 1/10/2026: Tapeta Floral 12,5 → 10 m2; wartość 0,00 → 0,00 zł`);
});

test('new position → ADDED with its net value', () => {
    const lines = diffPositions([pos(1)], [pos(1), pos(2, { ordinal: 2, product_id: null, name: 'Montaż', quantity: 1, unit_price_net: 1200, net_total: 1200 })]);
    assert.deepEqual(lines, [{ kind: 'ADDED', name: 'Montaż', before: null, after: `1${NBSP}200,00` }]);
    assert.equal(formatDiffForLog('ZK 1/10/2026', lines, 1200, 2400), `ZK 1/10/2026: dodano Montaż 1${NBSP}200,00 zł; wartość 1${NBSP}200,00 → 2${NBSP}400,00 zł`);
});

test('missing position → REMOVED', () => {
    const lines = diffPositions([pos(1), pos(2, { ordinal: 2, name: 'Klej' })], [pos(1)]);
    assert.deepEqual(lines, [{ kind: 'REMOVED', name: 'Klej', before: `1${NBSP}200,00`, after: null }]);
    assert.equal(formatDiffForLog('ZK 1/10/2026', lines, 2400, 1200), `ZK 1/10/2026: usunięto Klej; wartość 2${NBSP}400,00 → 1${NBSP}200,00 zł`);
});

test('price change → PRICE', () => {
    const lines = diffPositions([pos(1)], [pos(1, { unit_price_net: 99.5, net_total: 995 })]);
    assert.deepEqual(lines, [{ kind: 'PRICE', name: 'Tapeta Floral', before: '10 szt × 120,00', after: '10 szt × 99,50' }]);
    assert.equal(formatDiffForLog('ZK 1/10/2026', lines, 1200, 995), 'ZK 1/10/2026: Tapeta Floral cena 120,00 → 99,50 zł; wartość 1 200,00 → 995,00 zł');
});

test('name change → NAME', () => {
    const lines = diffPositions([pos(1)], [pos(1, { name: 'Tapeta Floral Gold' })]);
    assert.deepEqual(lines, [{ kind: 'NAME', name: 'Tapeta Floral Gold', before: 'Tapeta Floral', after: 'Tapeta Floral Gold' }]);
    assert.equal(formatDiffForLog('ZK 1/10/2026', lines, 1200, 1200),
        `ZK 1/10/2026: nazwa: Tapeta Floral → Tapeta Floral Gold; wartość 1${NBSP}200,00 → 1${NBSP}200,00 zł`);
});

test('quantity and price changed → two lines, QUANTITY then PRICE', () => {
    const lines = diffPositions([pos(1)], [pos(1, { quantity: 8, unit_price_net: 150, net_total: 1200 })]);
    assert.deepEqual(lines.map((l) => l.kind), ['QUANTITY', 'PRICE']);
    assert.equal(lines[0].after, '8 szt × 150,00');
    assert.equal(formatDiffForLog('ZK 1/10/2026', lines, 1200, 1200),
        `ZK 1/10/2026: Tapeta Floral 10 → 8 szt; Tapeta Floral cena 120,00 → 150,00 zł; wartość 1${NBSP}200,00 → 1${NBSP}200,00 zł`);
});

test('order: next by ordinal, then REMOVED by prev ordinal; position order in payload does not matter', () => {
    const prev = [pos(3, { ordinal: 3, name: 'C' }), pos(1, { ordinal: 1, name: 'A' }), pos(4, { ordinal: 4, name: 'D' }), pos(2, { ordinal: 2, name: 'B' })];
    const next = [pos(5, { ordinal: 3, name: 'E' }), pos(2, { ordinal: 1, name: 'B', quantity: 1 })];
    assert.deepEqual(diffPositions(prev, next).map((l) => `${l.kind}:${l.name}`), ['QUANTITY:B', 'ADDED:E', 'REMOVED:A', 'REMOVED:C', 'REMOVED:D']);
    assert.deepEqual(diffPositions(prev, [...prev].reverse()), [], 'ta sama treść w innej kolejności → brak zmian');
});

test('plan example string is reproduced exactly (thousands separator = NBSP from formatPLNFixed)', () => {
    const lines = [
        { kind: 'QUANTITY' as const, name: 'Tapeta Floral', before: '10 szt × 1 170,00', after: '8 szt × 1 170,00' },
        { kind: 'ADDED' as const, name: 'Montaż', before: null, after: `1${NBSP}200,00` },
    ];
    // To samo, ale wyliczone z pozycji:
    const computed = diffPositions(
        [pos(1, { unit_price_net: 1170, net_total: 11700 }), pos(2, { ordinal: 2, name: 'Klej', quantity: 26, unit: 'op', unit_price_net: 100, net_total: 2600 })],
        [
            pos(1, { quantity: 8, unit_price_net: 1170, net_total: 9360 }),
            pos(2, { ordinal: 2, name: 'Klej', quantity: 26, unit: 'op', unit_price_net: 100, net_total: 2600 }),
            pos(3, { ordinal: 3, product_id: null, name: 'Montaż', quantity: 1, unit: 'usł', unit_price_net: 1200, net_total: 1200 }),
        ]
    );
    assert.deepEqual(computed, lines);

    const text = formatDiffForLog('ZK 45/10/2026', computed, 14300, 13160);
    assert.equal(text, `ZK 45/10/2026: Tapeta Floral 10 → 8 szt; dodano Montaż 1${NBSP}200,00 zł; wartość 14${NBSP}300,00 → 13${NBSP}160,00 zł`);
    assert.equal(text.replace(/ /g, ' '), 'ZK 45/10/2026: Tapeta Floral 10 → 8 szt; dodano Montaż 1 200,00 zł; wartość 14 300,00 → 13 160,00 zł');
});

test('no position changes but total changed → only the "wartość" part', () => {
    assert.deepEqual(diffPositions([pos(1)], [pos(1)]), []);
    assert.equal(formatDiffForLog('FP 7/10/2026', [], 1000, 800), 'FP 7/10/2026: wartość 1 000,00 → 800,00 zł');
});
