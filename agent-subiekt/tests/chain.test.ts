import test from 'node:test';
import assert from 'node:assert/strict';
import { selectChains, GT_DOC_TYPE, type HeaderRow } from '../src/chain.ts';

const CATEGORY = 14;
const OPTIONS = { architectCategoryId: CATEGORY };

function h(id: number, type: keyof typeof GT_DOC_TYPE, overrides: Partial<HeaderRow> = {}): HeaderRow {
    return {
        dok_Id: id, dok_Typ: GT_DOC_TYPE[type], dok_Podtyp: 0, dok_NrPelny: `${type} ${id}/PUŁ/10/2026`,
        dok_DataWyst: '2026-10-10', dok_DoDokId: null, dok_DoDokNrPelny: null, dok_PlatnikId: 500,
        dok_KatId: 1, dok_Uwagi: null, dok_WartNetto: 1000, dok_WartBrutto: 1230, ...overrides,
    };
}

const ids = (selection: ReturnType<typeof selectChains>) => selection.documents.map((d) => d.header.dok_Id).sort((a, b) => a - b);
const parentOf = (selection: ReturnType<typeof selectChains>, id: number) =>
    selection.documents.find((d) => d.header.dok_Id === id)?.parentId;

test('ZK z kategorią Architekt bez znacznika w Uwagach → korzeń', () => {
    const selection = selectChains([h(1, 'ZK', { dok_KatId: CATEGORY })], OPTIONS);
    assert.deepEqual(ids(selection), [1]);
    assert.equal(selection.documents[0].rootReason, 'CATEGORY');
    assert.equal(selection.documents[0].parentId, null);
});

test('ZK ze znacznikiem #A-0002 w Uwagach bez kategorii → korzeń', () => {
    const selection = selectChains([h(1, 'ZK', { dok_Uwagi: 'Klient prosi o kontakt #A-0002' })], OPTIONS);
    assert.deepEqual(ids(selection), [1]);
    assert.equal(selection.documents[0].rootReason, 'MARKER');
    assert.equal(selectChains([h(2, 'ZK', { dok_KatId: CATEGORY, dok_Uwagi: '#a_7' })], OPTIONS).documents[0].rootReason, 'BOTH');
});

test('zwykła FS bez łańcucha do oznaczonego dokumentu → poza zbiorem', () => {
    const selection = selectChains([
        h(1, 'ZK'),
        h(2, 'FS', { dok_DoDokId: 1 }),
        h(3, 'FS'),
        h(4, 'WZ', { dok_Uwagi: '#A-001' }), // WZ nie jest korzeniem nawet ze znacznikiem
    ], OPTIONS);
    assert.deepEqual(ids(selection), []);
    assert.equal(selection.unlinkedMultiSource, 0);
});

test('FS → ZK przez dok_DoDokId → FS w zbiorze z rodzicem ZK', () => {
    const selection = selectChains([h(1, 'ZK', { dok_KatId: CATEGORY }), h(2, 'FS', { dok_DoDokId: 1 })], OPTIONS);
    assert.deepEqual(ids(selection), [1, 2]);
    assert.equal(parentOf(selection, 2), 1);
    assert.equal(selection.documents.find((d) => d.header.dok_Id === 2)?.rootReason, null);
});

test('ZK → WZ → FS → KFS → cały łańcuch (kolejność wierszy bez znaczenia)', () => {
    const selection = selectChains([
        h(4, 'KFS', { dok_DoDokId: 3, dok_WartNetto: -100 }),
        h(3, 'FS', { dok_DoDokId: 2 }),
        h(2, 'WZ', { dok_DoDokId: 1 }),
        h(1, 'ZK', { dok_Uwagi: '#A-0002' }),
        h(9, 'ZK', { dok_DoDokId: 1 }), // ZK nie jest dokumentem pochodnym
    ], OPTIONS);
    assert.deepEqual(ids(selection), [1, 2, 3, 4]);
    assert.deepEqual([parentOf(selection, 2), parentOf(selection, 3), parentOf(selection, 4)], [1, 2, 3]);
});

test('oznaczona FS bez oznaczonego źródła → korzeń z parent null (rodzic spoza zbioru nie jest wysyłany)', () => {
    const selection = selectChains([h(1, 'ZK'), h(2, 'FS', { dok_DoDokId: 1, dok_KatId: CATEGORY })], OPTIONS);
    assert.deepEqual(ids(selection), [2]);
    assert.equal(parentOf(selection, 2), null);
});

test("FS '+' z jednym kandydatem ZK (ten sam płatnik, wcześniejsza data, bez FS) → rodzic z heurystyki i ostrzeżenie", () => {
    const selection = selectChains([
        h(1, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700, dok_DataWyst: '2026-10-01' }),
        h(2, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700, dok_DataWyst: '2026-10-20' }), // późniejszy niż FS
        h(3, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 800, dok_DataWyst: '2026-10-01' }), // inny płatnik
        h(10, 'FS', { dok_DoDokId: 555, dok_DoDokNrPelny: '+', dok_PlatnikId: 700, dok_DataWyst: '2026-10-15' }),
        h(11, 'KFS', { dok_DoDokId: 10, dok_DataWyst: '2026-10-25' }),
    ], OPTIONS);
    assert.deepEqual(ids(selection), [1, 2, 3, 10, 11]);
    assert.equal(parentOf(selection, 10), 1);
    assert.equal(parentOf(selection, 11), 10, 'KFS do FS z heurystyki też wchodzi');
    assert.equal(selection.documents.find((d) => d.header.dok_Id === 10)?.viaHeuristic, true);
    assert.deepEqual(selection.heuristic.map((w) => [w.fs.dok_Id, w.parent.dok_Id]), [[10, 1]]);
    assert.deepEqual(selection.ambiguous, []);
});

test("FS '+' z dwoma kandydatami → pominięta i w raporcie; ZK z FS nie jest kandydatem", () => {
    const selection = selectChains([
        h(1, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700, dok_DataWyst: '2026-10-01' }),
        h(2, 'ZK', { dok_Uwagi: '#A-005', dok_PlatnikId: 700, dok_DataWyst: '2026-10-02' }),
        h(10, 'FS', { dok_DoDokId: 555, dok_DoDokNrPelny: '+', dok_PlatnikId: 700, dok_DataWyst: '2026-10-15' }),
        h(4, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 900, dok_DataWyst: '2026-10-01' }),
        h(5, 'FS', { dok_DoDokId: 4, dok_PlatnikId: 900, dok_DataWyst: '2026-10-03' }),
        h(20, 'FS', { dok_DoDokId: 666, dok_DoDokNrPelny: '+', dok_PlatnikId: 900, dok_DataWyst: '2026-10-15' }),
        h(30, 'FS', { dok_DoDokId: 777, dok_DoDokNrPelny: '+', dok_PlatnikId: 123, dok_DataWyst: '2026-10-15' }),
    ], OPTIONS);
    assert.deepEqual(ids(selection), [1, 2, 4, 5]);
    assert.deepEqual(selection.heuristic, []);
    assert.deepEqual(selection.ambiguous.map((a) => [a.fs.dok_Id, a.candidates.map((c) => c.dok_Id).sort()]), [[10, [1, 2]], [20, []]]);
    assert.equal(selection.unlinkedMultiSource, 1, "FS '+' płatnika bez żadnego oznaczonego ZK = zwykła sprzedaż, tylko liczona");
});

test("FS '+' wskazująca dokument ze zbioru → zwykłe powiązanie, bez heurystyki", () => {
    const selection = selectChains([
        h(1, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700 }),
        h(2, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700 }),
        h(10, 'FS', { dok_DoDokId: 2, dok_DoDokNrPelny: '+', dok_PlatnikId: 700, dok_DataWyst: '2026-10-15' }),
    ], OPTIONS);
    assert.equal(parentOf(selection, 10), 2);
    assert.deepEqual([selection.heuristic, selection.ambiguous], [[], []]);
});
