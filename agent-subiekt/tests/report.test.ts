import test from 'node:test';
import assert from 'node:assert/strict';
import { GT_DOC_TYPE, type HeaderRow } from '../src/chain.ts';
import { countsLine, formatSummary, manualReviewCount } from '../src/report.ts';

const h = (id: number, type: keyof typeof GT_DOC_TYPE, overrides: Partial<HeaderRow> = {}): HeaderRow => ({
    dok_Id: id, dok_Typ: GT_DOC_TYPE[type], dok_Podtyp: 0, dok_NrPelny: `${type} ${id}/10/2026`, dok_DataWyst: '2026-10-10',
    dok_DoDokId: null, dok_DoDokNrPelny: null, dok_PlatnikId: 700, dok_KatId: 14, dok_Uwagi: null, dok_WartNetto: 100,
    dok_WartBrutto: 123, ...overrides,
});
const emptyBuild = { documents: [], errors: [] };
const noSelection = { documents: [], heuristic: [], ambiguous: [], unlinkedMultiSource: 3 };

test('manualReviewCount: FS niejednoznaczne + dokumenty z błędem danych; zwykła sprzedaż (licznik) się nie liczy', () => {
    assert.equal(manualReviewCount(noSelection, emptyBuild), 0);
    const fs = h(10, 'FS', { dok_DoDokNrPelny: '+' });
    assert.equal(manualReviewCount({ ...noSelection, ambiguous: [{ fs, candidates: [] }] }, emptyBuild), 1);
    assert.equal(manualReviewCount({ ...noSelection, ambiguous: [{ fs, candidates: [] }] },
        { documents: [], errors: [{ externalId: 1, number: 'ZK 1', message: 'brak nazwy kontrahenta' }] }), 2);
});

test('podsumowanie zaczyna się od informacji o dokumentach do ręcznej obsługi i kodzie 4', () => {
    const lines = formatSummary({
        title: 'DRY-RUN', generatedAt: 'teraz', since: '2025-04-30', agentVersion: '0.1.0', runId: 'r', architectCategoryId: 14,
        selection: { ...noSelection, ambiguous: [{ fs: h(10, 'FS', { dok_DoDokNrPelny: '+', dok_NrPelny: null as unknown as string }), candidates: [] }] },
        build: emptyBuild, contractors: new Map(),
    });
    assert.match(lines.join('\n'), /DO RĘCZNEJ OBSŁUGI: 1 .*kod wyjścia 4/);
    assert.match(lines.join('\n'), /\(bez numeru\) \(dok_Id 10\)/, 'pusty numer nie wywraca podsumowania');
});

test('countsLine (dziennik synchronizacji): same liczby, bez nazw kontrahentów i numerów dokumentów', () => {
    const zk = h(1, 'ZK', { dok_NrPelny: 'ZK 7/PUŁ/10/2026' });
    const line = countsLine(
        { documents: [{ header: zk, parentId: null, rootReason: 'CATEGORY', viaHeuristic: false }], heuristic: [], ambiguous: [], unlinkedMultiSource: 2 },
        { documents: [{ external_id: 1, type: 'ZK', number: 'ZK 7/PUŁ/10/2026', issued_at: '2026-10-10', contractor_name: 'Jan Kowalski', contractor_nip: '1234563218', architect_code: null, parent_external_id: null, net_total: 1, gross_total: 1, is_paid: false, remarks: '#A-1', positions: [] }], errors: [] },
    );
    assert.equal(line, 'Dokumenty w paczce: 1 (ZK 1, WZ 0, FS 0, KFS 0); korzenie 1; heurystyka FS \'+\': 0; do ręcznej obsługi: 0; FS \'+\' zwykłej sprzedaży: 2');
    assert.doesNotMatch(line, /Kowalski|ZK 7\/PUŁ|1234563218/);
});
