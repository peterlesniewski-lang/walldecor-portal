import test from 'node:test';
import assert from 'node:assert/strict';
import { GT_DOC_TYPE, type HeaderRow } from '../src/chain.ts';
import { formatSummary, manualReviewCount } from '../src/report.ts';

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
