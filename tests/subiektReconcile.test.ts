// Loop 5b (PLAN-SUBIEKT-2026-10-29.md): czyste reguły uzgodnienia faktur z zamówieniem (src/lib/subiekt/reconcile.ts).
import test from 'node:test';
import assert from 'node:assert/strict';

type ReconcileModule = typeof import('../src/lib/subiekt/reconcile.ts');
await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { mirrors, chainMode, chainTotals, fingerprint, sameBreakdownKey }: ReconcileModule =
    await import(new URL('../src/lib/subiekt/reconcile.ts', import.meta.url).href);
import type { SubiektPositionPayload } from '../src/lib/subiekt/types.ts';

let nextId = 1;
function pos(overrides: Partial<SubiektPositionPayload> = {}): SubiektPositionPayload {
    return {
        external_id: nextId++, ordinal: 1, product_id: 77, name: 'Tapeta Floral', quantity: 1, unit: 'szt',
        unit_price_net: 536.59, net_total: 536.59, corrects_position_external_id: null, ...overrides,
    };
}
const product = (overrides: Partial<SubiektPositionPayload> = {}) => pos(overrides);
const service = (overrides: Partial<SubiektPositionPayload> = {}) =>
    pos({ product_id: null, name: 'Montaż', unit_price_net: 300, net_total: 300, ...overrides });

test('mirrors: identical positions (by product_id and by name) → true, order does not matter', () => {
    const zk = [product(), service()];
    const fs = [service({ name: '  MONTAŻ ' }), product({ name: 'Inna nazwa na fakturze' })];
    assert.equal(mirrors(zk, fs), true);
});

test('mirrors: one collective "usługa" position on the invoice → false', () => {
    const zk = [product(), service()];
    const fs = [service({ name: 'Usługa', net_total: 836.59 })];
    assert.equal(mirrors(zk, fs), false);
});

test('mirrors: same positions with another amount → false; within AMOUNT_EPSILON → true', () => {
    assert.equal(mirrors([product(), service()], [product({ net_total: 600 }), service()]), false);
    assert.equal(mirrors([product()], [product({ net_total: 536.594 })]), true);
});

test('mirrors: key is product_id when both have it, name otherwise; whitespace collapsed, case ignored', () => {
    // Ten sam towar pod inną nazwą → zgodne po product_id.
    assert.equal(mirrors([product({ product_id: 5, name: 'A' })], [product({ product_id: 5, name: 'B' })]), true);
    // Różne karty towaru o tej samej nazwie → niezgodne (product_id ma pierwszeństwo).
    assert.equal(mirrors([product({ product_id: 5 })], [product({ product_id: 6 })]), false);
    // Jedna strona bez karty → porównanie po nazwie.
    assert.equal(mirrors([product({ product_id: 5, name: 'Tapeta  Floral' })], [product({ product_id: null, name: 'tapeta floral' })]), true);
    assert.equal(mirrors([service({ name: 'Montaż ścian' })], [service({ name: 'Montaż sufitu' })]), false);
    assert.equal(sameBreakdownKey(service({ name: 'A\tB' }), service({ name: 'a b' })), true);
});

test('mirrors: positions ≤ 0 are skipped on both sides; each ZK position is used at most once', () => {
    assert.equal(mirrors([product(), product({ name: 'Gratis', product_id: 9, net_total: 0 })], [product()]), true);
    assert.equal(mirrors([product()], [product(), product({ product_id: 9, net_total: -10 })]), true);
    // Dwie identyczne pozycje FS nie mogą obie użyć jednej pozycji ZK.
    assert.equal(mirrors([product(), service()], [product(), product()]), false);
    assert.equal(mirrors([product(), product()], [product(), product()]), true);
    assert.equal(mirrors([], []), false, 'brak pozycji to nie odzwierciedlenie');
});

test('chainTotals: zkNet = ZK net, invoicedNet = FS + KFS (KFS negative), rounded to 2 places', () => {
    assert.deepEqual(chainTotals({
        orders: [{ net_total: 836.59, positions: [] }],
        invoices: [{ net_total: 300.1, positions: [] }, { net_total: 536.2, positions: [] }],
        corrections: [{ net_total: -100.005 }],
    }), { zkNet: 836.59, invoicedNet: 736.3 });
});

test('chainMode: the five modes', () => {
    const zkPositions = [product(), service()];
    const zk = { net_total: 836.59, positions: zkPositions };
    assert.equal(chainMode({ orders: [zk], invoices: [], corrections: [] }), 'ORDER_ONLY');
    assert.equal(chainMode({ orders: [], invoices: [], corrections: [] }), 'ORDER_ONLY');
    assert.equal(chainMode({ orders: [], invoices: [{ net_total: 100, positions: [product({ net_total: 100 })] }], corrections: [] }), 'INVOICE_ONLY');
    assert.equal(chainMode({ orders: [zk], invoices: [{ net_total: 836.59, positions: [product(), service()] }], corrections: [] }), 'MIRROR');
    assert.equal(chainMode({ orders: [zk], invoices: [{ net_total: 836.59, positions: [service({ name: 'Usługa', net_total: 836.59 })] }], corrections: [] }), 'ORDER_BREAKDOWN');
    assert.equal(chainMode({ orders: [zk], invoices: [{ net_total: 900, positions: [service({ name: 'Usługa', net_total: 900 })] }], corrections: [] }), 'RECONCILE');
    // Zaliczka 300 + końcowa 836,59 → suma 1136,59 > ZK.
    assert.equal(chainMode({
        orders: [zk],
        invoices: [
            { net_total: 300, positions: [service({ name: 'Zaliczka', net_total: 300 })] },
            { net_total: 836.59, positions: [product(), service()] },
        ],
        corrections: [],
    }), 'RECONCILE');
    // Mirror sprawdza pozycje FS po korekcie KFS (tu: 536,59 → 436,59) — korekta w dół to RECONCILE.
    assert.equal(chainMode({
        orders: [zk],
        invoices: [{ net_total: 836.59, positions: [product({ net_total: 436.59 }), service()] }],
        corrections: [{ net_total: -100 }],
    }), 'RECONCILE');
});

test('fingerprint: sorted external_id:net_total of FS and KFS, stable regardless of order', () => {
    const a = fingerprint([{ external_id: 30, net_total: 300 }, { external_id: 4, net_total: -100.5 }, { external_id: 12, net_total: 536.589 }]);
    const b = fingerprint([{ external_id: 12, net_total: 536.59 }, { external_id: 30, net_total: 300 }, { external_id: 4, net_total: -100.5 }]);
    assert.equal(a, '4:-100.50;12:536.59;30:300.00');
    assert.equal(a, b);
    assert.equal(fingerprint([]), '');
    assert.notEqual(fingerprint([{ external_id: 4, net_total: -100 }]), a);
});

test('fingerprint: longer than the column (2000) → stable sha256 digest', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ external_id: 100000 + i, net_total: 12345.67 }));
    const value = fingerprint(many);
    assert.match(value, /^sha256:[0-9a-f]{64}$/);
    assert.equal(value, fingerprint([...many].reverse()));
});
