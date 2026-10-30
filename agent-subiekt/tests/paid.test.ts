import test from 'node:test';
import assert from 'node:assert/strict';
import { isPaid, paidByDocument, RECEIVABLE_TYPE, PAYMENT_TYPE, type FinanceRow } from '../src/paid.ts';

const receivable = (doc: number, remaining: number, original = 2651.89): FinanceRow => ({
    nzf_IdDokumentAuto: doc, nzf_Typ: RECEIVABLE_TYPE, nzf_Wartosc: remaining, nzf_WartoscPierwotna: original,
});

test('należność z nzf_Wartosc 0 → zapłacona (FS 60/MAG/10/2026)', () => {
    assert.equal(isPaid([receivable(31480, 0), { ...receivable(31480, 2651.89), nzf_Typ: PAYMENT_TYPE }]), true);
    assert.equal(isPaid([receivable(31480, 0.004)]), true, 'tolerancja 0,005');
});

test('należność częściowo spłacona → niezapłacona', () => {
    assert.equal(isPaid([receivable(1, 651.89)]), false);
    assert.equal(isPaid([receivable(1, 0), receivable(1, 10)]), false, 'suma pozostałych kwot wszystkich należności');
});

test('brak należności → niezapłacona (także gdy jest sama wpłata)', () => {
    assert.equal(isPaid([]), false);
    assert.equal(isPaid([{ ...receivable(1, 0), nzf_Typ: PAYMENT_TYPE }]), false);
});

test('paidByDocument grupuje wiersze po dokumencie', () => {
    const paid = paidByDocument([receivable(1, 0), receivable(2, 5), receivable(3, 0), receivable(3, 0)]);
    assert.deepEqual([paid.get(1), paid.get(2), paid.get(3), paid.get(4)], [true, false, true, undefined]);
});
