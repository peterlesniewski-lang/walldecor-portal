// Agent ma własną kopię typów paczki (src/contract.ts), bo dist/ musi działać bez kodu portalu.
// Ten test pilnuje zgodności kopii z portalem: paczka zbudowana przez agenta przechodzi przez prawdziwy
// walidator portalu bez odrzuceń i bez zmian (walidator usuwa nieznane pola, więc deepEqual wykrywa pole
// nadmiarowe, a brakujące pole daje odrzucenie).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBIEKT_SYNC_MAX_DOCUMENTS as PORTAL_MAX } from '../../src/lib/subiekt/types.ts';
import { SUBIEKT_SYNC_MAX_DOCUMENTS as AGENT_MAX } from '../src/contract.ts';
import { GT_DOC_TYPE, type HeaderRow } from '../src/chain.ts';
import { buildPayloads, type PositionRow } from '../src/payload.ts';
import { buildPages } from '../src/send.ts';

await import(new URL('../../tests/helpers/srcResolveHooks.ts', import.meta.url).href);
const { parseSyncRequest } = await import('../../src/lib/subiekt/validate.ts');

const header = (id: number, type: keyof typeof GT_DOC_TYPE, parent: number | null): HeaderRow => ({
    dok_Id: id, dok_Typ: GT_DOC_TYPE[type], dok_Podtyp: 0, dok_Status: null, dok_NrPelny: `${type} ${id}/PUŁ/10/2026`, dok_DataWyst: '2026-10-05',
    dok_DoDokId: parent, dok_DoDokNrPelny: null, dok_PlatnikId: 1, dok_KatId: 14, dok_Uwagi: type === 'ZK' ? '#A-0002' : null,
    dok_WartNetto: type === 'KFS' ? -100 : 836.59, dok_WartBrutto: type === 'KFS' ? -123 : 1029.01,
});
const position = (id: number, docId: number, overrides: Partial<PositionRow> = {}): PositionRow => ({
    ob_Id: id, ob_DokHanId: docId, ob_DokHanLp: 1, ob_DoId: null, ob_Znak: 1, ob_TowId: 3185, ob_TowRodzaj: 1, ob_Opis: null,
    tw_Nazwa: 'Tapeta', ob_Ilosc: 2, ob_Jm: 'szt.', ob_CenaNetto: 100, ob_WartNetto: 200, ...overrides,
});

test('limit strony agenta = limit portalu', () => {
    assert.equal(AGENT_MAX, PORTAL_MAX);
});

test('paczka agenta (ZK, FS, KFS) przechodzi przez parseSyncRequest portalu bez odrzuceń i bez zmian', () => {
    const contractor = (id: number) => ({ dok_Id: id, adrh_Nazwa: 'K', adrh_NazwaPelna: null, adrh_NIP: null, adr_Nazwa: null, adr_NazwaPelna: null, adr_NIP: null, kh_Symbol: 'K' });
    const { documents, errors } = buildPayloads(
        {
            documents: [
                { header: header(1, 'ZK', null), parentId: null, rootReason: 'BOTH', viaHeuristic: false },
                { header: header(2, 'FS', 1), parentId: 1, rootReason: null, viaHeuristic: false },
                { header: header(3, 'KFS', 2), parentId: 2, rootReason: null, viaHeuristic: false },
            ],
            heuristic: [], ambiguous: [], unlinkedMultiSource: 0,
        },
        {
            contractors: new Map([[1, contractor(1)], [2, contractor(2)], [3, contractor(3)]]),
            positions: new Map([
                [1, [position(10, 1), position(11, 1, { ob_DokHanLp: 2, ob_TowId: 77, ob_TowRodzaj: 2, tw_Nazwa: 'Montaż' })]],
                [2, [position(20, 2)]],
                [3, [position(30, 3, { ob_DoId: 20, ob_Ilosc: 1, ob_WartNetto: 100 })]],
            ]),
            paid: new Map([[2, true]]),
        },
    );
    assert.deepEqual(errors, []);
    const [request] = buildPages(documents, '11111111-1111-4111-8111-111111111111', '0.1.0');
    const roundTrip = JSON.parse(JSON.stringify(request));
    const result = parseSyncRequest(roundTrip);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.rejected, []);
    assert.deepEqual(result.value, roundTrip);
});
