import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAncestors, fetchPayerHistory, selectChains, GT_DOC_TYPE, type HeaderRow } from '../src/chain.ts';

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

// --- Przodkowie spoza okresu (przegląd jakości Loopa 5, pkt 1) i samoodwołanie (pkt 4) ---

test('fetchAncestors: dociąga brakujących przodków po dok_DoDokId bez limitu daty, iteracyjnie, bez cykli', async () => {
    const db = new Map<number, HeaderRow>([
        [2, h(2, 'FS', { dok_DoDokId: 1, dok_DataWyst: '2024-03-01' })],
        [1, h(1, 'ZK', { dok_KatId: CATEGORY, dok_DataWyst: '2024-02-01' })],
        [7, h(7, 'FS', { dok_DoDokId: 8 })],
        [8, h(8, 'WZ', { dok_DoDokId: 7 })], // cykl 7 ↔ 8
    ]);
    const calls: number[][] = [];
    const fetchByIds = async (ids: number[]) => { calls.push([...ids].sort()); return ids.map((id) => db.get(id)).filter((x): x is HeaderRow => !!x); };
    const period = [h(3, 'KFS', { dok_DoDokId: 2 }), h(4, 'ZK', { dok_DoDokId: 99 }), h(5, 'FS', { dok_DoDokId: 5 }), h(6, 'KFS', { dok_DoDokId: 7 })];
    const ancestors = await fetchAncestors(period, fetchByIds);
    assert.deepEqual(ancestors.map((a) => a.dok_Id).sort(), [1, 2, 7, 8]);
    assert.deepEqual(calls, [[2, 7], [1, 8]], 'ZK (4) nie jest pochodnym — bez zapytania; samoodwołanie (5) pomijane; 7 nie pobierane drugi raz');
});

test('KFS w okresie do FS sprzed okresu → FS i jej ZK architekta w łańcuchu', () => {
    const selection = selectChains(
        [h(3, 'KFS', { dok_DoDokId: 2, dok_DataWyst: '2026-10-20', dok_WartNetto: -50 })],
        OPTIONS,
        { ancestors: [h(2, 'FS', { dok_DoDokId: 1, dok_DataWyst: '2024-03-01' }), h(1, 'ZK', { dok_Uwagi: '#A-0002', dok_DataWyst: '2024-02-01' })] },
    );
    assert.deepEqual(ids(selection), [1, 2, 3]);
    assert.deepEqual([parentOf(selection, 1), parentOf(selection, 2), parentOf(selection, 3)], [null, 1, 2]);
});

test('FS w okresie do ZK architekta sprzed okresu → ZK jako korzeń; przodek bez architekta nie wciąga zwykłej sprzedaży', () => {
    const selection = selectChains(
        [h(2, 'FS', { dok_DoDokId: 1 }), h(12, 'FS', { dok_DoDokId: 11 })],
        OPTIONS,
        { ancestors: [h(1, 'ZK', { dok_KatId: CATEGORY, dok_DataWyst: '2024-02-01' }), h(11, 'ZK', { dok_DataWyst: '2024-02-01' })] },
    );
    assert.deepEqual(ids(selection), [1, 2]);
    assert.equal(selection.documents.find((d) => d.header.dok_Id === 1)?.rootReason, 'CATEGORY');
});

test('dok_DoDokId wskazujący sam dokument = brak rodzica', () => {
    const selection = selectChains([
        h(1, 'ZK', { dok_KatId: CATEGORY }),
        h(2, 'FS', { dok_DoDokId: 2 }),
        h(3, 'FS', { dok_DoDokId: 3, dok_Uwagi: '#A-1' }),
    ], OPTIONS);
    assert.deepEqual(ids(selection), [1, 3]);
    assert.equal(parentOf(selection, 3), null);
});

// --- Heurystyka FS '+' na całej historii płatnika (przegląd jakości Loopa 5, pkt 2) ---

const plus = (id: number, date: string, payer = 700, overrides: Partial<HeaderRow> = {}) =>
    h(id, 'FS', { dok_DoDokId: 9000 + id, dok_DoDokNrPelny: '+', dok_PlatnikId: payer, dok_DataWyst: date, ...overrides });

test("scenariusz z przeglądu: ZK X sprzed okresu i ZK Y w okresie, ten sam płatnik → FS '+' niejednoznaczna, nie przypięta do Y", () => {
    const x = h(1, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700, dok_DataWyst: '2025-01-10' });
    const y = h(2, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700, dok_DataWyst: '2025-02-01' });
    const fs1 = plus(10, '2025-03-01');
    const withoutHistory = selectChains([y, fs1], OPTIONS);
    assert.equal(parentOf(withoutHistory, 10), 2, 'bez historii heurystyka zgadywała Y');

    const selection = selectChains([y, fs1], OPTIONS, { payerHistory: [x, y] });
    assert.deepEqual(ids(selection), [2]);
    assert.deepEqual(selection.heuristic, []);
    assert.deepEqual(selection.ambiguous.map((a) => [a.fs.dok_Id, a.candidates.map((c) => c.dok_Id).sort()]), [[10, [1, 2]]]);
});

test("jedyny kandydat sprzed okresu → FS '+' przypięta, ZK w paczce jako korzeń (bez jego innych pochodnych)", () => {
    const x = h(1, 'ZK', { dok_Uwagi: '#A-0002', dok_PlatnikId: 700, dok_DataWyst: '2025-01-10' });
    const selection = selectChains([plus(10, '2025-03-01')], OPTIONS, { payerHistory: [x] });
    assert.deepEqual(ids(selection), [1, 10]);
    assert.deepEqual([parentOf(selection, 1), parentOf(selection, 10)], [null, 1]);
    assert.deepEqual(selection.heuristic.map((w) => [w.fs.dok_Id, w.parent.dok_Id]), [[10, 1]]);
});

test("historia płatnika: FS sprzed okresu (zwykłe powiązanie lub '+') zajmuje ZK — kolejna FS '+' nie jest do niego przypinana", () => {
    const x = h(1, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700, dok_DataWyst: '2025-01-10' });
    const y = h(2, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700, dok_DataWyst: '2025-02-01' });
    const linkedToX = h(5, 'FS', { dok_DoDokId: 1, dok_PlatnikId: 700, dok_DataWyst: '2025-01-20' });
    // X ma FS → jedynym kandydatem jest Y
    const a = selectChains([plus(10, '2025-03-01')], OPTIONS, { payerHistory: [x, y, linkedToX] });
    assert.equal(parentOf(a, 10), 2);
    assert.equal(ids(a).includes(5), false, 'FS sprzed okresu nie trafia do paczki');

    // FS '+' sprzed okresu przypina się do Y (jedyny kandydat) → FS '+' z okresu nie ma już kandydata
    const b = selectChains([plus(10, '2025-03-01')], OPTIONS, { payerHistory: [y, plus(6, '2025-02-15')] });
    assert.deepEqual(ids(b), []);
    assert.deepEqual(b.ambiguous.map((m) => [m.fs.dok_Id, m.candidates.length]), [[10, 0]]);
});

test('fetchPayerHistory: ZK architektów płatników FS \'+\' z okresu (bez limitu daty), potem ich FS/WZ', async () => {
    const calls: string[] = [];
    const history = await fetchPayerHistory([plus(10, '2026-10-01', 700), plus(11, '2026-10-02', 800), h(12, 'FS', { dok_PlatnikId: 900 })], OPTIONS, {
        architectZkOfPayers: async (payers) => {
            calls.push(`zk:${payers.join(',')}`);
            return [
                h(1, 'ZK', { dok_KatId: CATEGORY, dok_PlatnikId: 700, dok_DataWyst: '2024-01-01' }),
                h(2, 'ZK', { dok_Uwagi: 'kontakt #A brak', dok_PlatnikId: 800 }), // wstępny filtr SQL (LIKE '%#A%') przepuścił, regex nie
            ];
        },
        invoicesOfPayers: async (payers) => {
            calls.push(`fs:${payers.join(',')}`);
            return [h(5, 'FS', { dok_DoDokId: 1, dok_PlatnikId: 700, dok_DataWyst: '2024-02-01' })];
        },
    });
    assert.deepEqual(calls, ['zk:700,800', 'fs:700']);
    assert.deepEqual(history.map((x) => x.dok_Id), [1, 5]);
    assert.deepEqual(await fetchPayerHistory([h(1, 'ZK')], OPTIONS, {
        architectZkOfPayers: async () => { throw new Error('nie powinno pytać'); },
        invoicesOfPayers: async () => { throw new Error('nie powinno pytać'); },
    }), []);
});

test('znacznik korzenia tylko z kodem liczbowym: „#Adam” w Uwagach nie robi ze zwykłej sprzedaży dokumentu architekta', () => {
    const reasonFor = (uwagi: string) => selectChains([h(1, 'ZK', { dok_Uwagi: uwagi })], OPTIONS).documents[0]?.rootReason ?? null;
    assert.equal(reasonFor('Zamówił #Adam z działu'), null);
    assert.equal(reasonFor('#A-0002x'), null);
    assert.equal(reasonFor('#AB12'), null);
    assert.equal(reasonFor('pilne #A-0002, dzwonić'), 'MARKER');
    assert.equal(reasonFor('#a_7'), 'MARKER');
    assert.equal(reasonFor('#A123456'), 'MARKER');
    assert.equal(reasonFor('#A1234567'), null, 'najwyżej 6 cyfr');
});
