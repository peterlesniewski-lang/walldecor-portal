import test from 'node:test';
import assert from 'node:assert/strict';
import { GT_DOC_TYPE, type HeaderRow, type SelectedDocument } from '../src/chain.ts';
import { buildDocument, buildPayloads, PayloadError, type ContractorRow, type PositionRow } from '../src/payload.ts';

function header(id: number, type: keyof typeof GT_DOC_TYPE, overrides: Partial<HeaderRow> = {}): HeaderRow {
    return {
        dok_Id: id, dok_Typ: GT_DOC_TYPE[type], dok_Podtyp: 0, dok_NrPelny: `  ${type} 115/PUŁ/10/2026 `,
        dok_DataWyst: '2026-10-05', dok_DoDokId: null, dok_DoDokNrPelny: null, dok_PlatnikId: 500,
        dok_KatId: 14, dok_Uwagi: '#A-0002', dok_WartNetto: 836.59, dok_WartBrutto: 1029.01, ...overrides,
    };
}

const selected = (h: HeaderRow, parentId: number | null = null): SelectedDocument =>
    ({ header: h, parentId, rootReason: parentId === null ? 'BOTH' : null, viaHeuristic: false });

function row(id: number, docId: number, overrides: Partial<PositionRow> = {}): PositionRow {
    return {
        ob_Id: id, ob_DokHanId: docId, ob_DokHanLp: 1, ob_DoId: null, ob_Znak: 1, ob_TowId: null, ob_TowRodzaj: 2,
        ob_Opis: 'usługa montażu szyny\r\n\r\n', tw_Nazwa: null, ob_Ilosc: 1, ob_Jm: 'szt', ob_CenaNetto: 300,
        ob_WartNetto: 300, ...overrides,
    };
}

const contractor: ContractorRow = {
    dok_Id: 31280, adrh_Nazwa: 'Kowalski', adrh_NazwaPelna: 'Jan Kowalski Pracownia', adrh_NIP: '123-456-32-18',
    adr_Nazwa: null, adr_NazwaPelna: null, adr_NIP: null, kh_Symbol: 'KOWALSKI',
};

test('pozycja jednorazowa (ob_TowId NULL) → product_id null; karta towaru → product_id = ob_TowId, nazwa z tw_Nazwa', () => {
    const doc = buildDocument({ selected: selected(header(31280, 'ZK')), contractor, isPaid: false, parentPositions: null, positions: [
        row(56536, 31280),
        row(56537, 31280, { ob_DokHanLp: 2, ob_Opis: 'szyna techno 15 / 484 cm', ob_CenaNetto: 536.59, ob_WartNetto: 536.59 }),
        row(56538, 31280, { ob_DokHanLp: 3, ob_TowId: 3185, ob_TowRodzaj: 1, ob_Opis: '  ', tw_Nazwa: ' Tapeta Arte 1234 ' }),
    ] });
    assert.deepEqual(doc.positions.map((p) => [p.external_id, p.ordinal, p.product_id, p.name]), [
        [56536, 1, null, 'usługa montażu szyny'],
        [56537, 2, null, 'szyna techno 15 / 484 cm'],
        [56538, 3, 3185, 'Tapeta Arte 1234'],
    ]);
    assert.equal('is_service' in (doc.positions[0] as object), false, 'paczka zgodna z bieżącym kontraktem portalu');
});

test('wielowierszowy ob_Opis → name w jednej linii (linie łączone spacją), najwyżej 255 znaków', () => {
    const long = `Fototapeta na wymiar\r\n\r\n  ściana salonu 420 x 270  \n${'x'.repeat(400)}`;
    const doc = buildDocument({ selected: selected(header(1, 'ZK')), contractor, isPaid: false, parentPositions: null, positions: [row(10, 1, { ob_Opis: long })] });
    const name = doc.positions[0].name;
    assert.equal(/[\r\n]/.test(name), false);
    assert.ok(name.length <= 255);
    assert.ok(name.startsWith('Fototapeta na wymiar ściana salonu 420 x 270 xxx'), name);
});

test('nagłówek: issued_at YYYY-MM-DD, numer przycięty, kwoty do 2 miejsc, kontrahent i NIP z historii adresu, architect_code null', () => {
    const doc = buildDocument({
        selected: selected(header(31280, 'ZK', { dok_WartNetto: 836.594999, dok_WartBrutto: 1029.0051, dok_Uwagi: ` ${'u'.repeat(4100)}` })),
        contractor, isPaid: true, parentPositions: null,
        positions: [row(1, 31280, { ob_Ilosc: 2.123456, ob_CenaNetto: 150.005, ob_WartNetto: 300.014 })],
    });
    assert.equal(doc.issued_at, '2026-10-05');
    assert.equal(doc.number, 'ZK 115/PUŁ/10/2026');
    assert.deepEqual([doc.net_total, doc.gross_total], [836.59, 1029.01]);
    assert.deepEqual([doc.positions[0].unit_price_net, doc.positions[0].net_total, doc.positions[0].quantity], [150.01, 300.01, 2.1235]);
    assert.deepEqual([doc.contractor_name, doc.contractor_nip, doc.architect_code, doc.is_paid], ['Jan Kowalski Pracownia', '1234563218', null, true]);
    assert.equal(doc.remarks?.length, 4000);
    assert.equal(doc.type, 'ZK');

    assert.throws(
        () => buildDocument({ selected: selected(header(2, 'ZK', { dok_DataWyst: '05.10.2026' })), contractor, isPaid: false, parentPositions: null, positions: [] }),
        PayloadError,
    );
});

test('KFS: corrects_position_external_id z ob_DoId, a gdy nie wskazuje pozycji FS — z dopasowania (product_id, name)', () => {
    const fs = header(31242, 'FS', { dok_KatId: 1, dok_Uwagi: null, dok_DoDokId: 31200 });
    const kfs = header(31243, 'KFS', { dok_KatId: 1, dok_Uwagi: null, dok_DoDokId: 31242, dok_WartNetto: -3741.5, dok_WartBrutto: -4040.84 });
    const contractors = new Map([[31242, { ...contractor, dok_Id: 31242 }], [31243, { ...contractor, dok_Id: 31243 }]]);
    const positions = new Map<number, PositionRow[]>([
        [31242, [
            row(700, 31242, { ob_TowId: 3185, ob_TowRodzaj: 1, ob_Opis: null, tw_Nazwa: 'Tapeta Arte', ob_Ilosc: 8, ob_WartNetto: 800 }),
            row(701, 31242, { ob_DokHanLp: 2, ob_Opis: 'Montaż tapety' }),
            row(702, 31242, { ob_DokHanLp: 3, ob_Opis: 'Klej' }),
        ]],
        [31243, [
            // przed korektą (ob_Znak −1) — nie trafia do paczki: portal przyjmuje pozycję KFS jako stan PO korekcie
            row(800, 31243, { ob_Znak: -1, ob_DoId: 700, ob_TowId: 3185, ob_TowRodzaj: 1, ob_Opis: null, tw_Nazwa: 'Tapeta Arte', ob_Ilosc: 8, ob_WartNetto: 800 }),
            row(801, 31243, { ob_DoId: 700, ob_TowId: 3185, ob_TowRodzaj: 1, ob_Opis: null, tw_Nazwa: 'Tapeta Arte', ob_Ilosc: 6, ob_WartNetto: 600 }),
            row(802, 31243, { ob_DokHanLp: 2, ob_DoId: 99999, ob_Opis: 'Montaż tapety', ob_WartNetto: 250 }),
            row(803, 31243, { ob_DokHanLp: 3, ob_Opis: 'Coś innego', ob_WartNetto: 10 }),
        ]],
    ]);
    const result = buildPayloads(
        { documents: [selected(kfs, 31242), selected(fs, null)], heuristic: [], ambiguous: [], unlinkedMultiSource: 0 },
        { contractors, positions, paid: new Map([[31242, true]]) },
    );
    assert.deepEqual(result.errors, []);
    const built = result.documents.find((d) => d.external_id === 31243);
    assert.ok(built);
    assert.deepEqual(built.positions.map((p) => [p.external_id, p.corrects_position_external_id]), [[801, 700], [802, 701], [803, null]]);
    assert.deepEqual([built.parent_external_id, built.net_total, built.is_paid], [31242, -3741.5, false]);
    assert.equal(result.documents.find((d) => d.external_id === 31242)?.is_paid, true);
});

test('buildPayloads: dokument, którego nie da się zbudować, trafia do errors, reszta idzie dalej', () => {
    const result = buildPayloads(
        { documents: [selected(header(1, 'ZK')), selected(header(2, 'ZK'))], heuristic: [], ambiguous: [], unlinkedMultiSource: 0 },
        {
            contractors: new Map([[1, { ...contractor, dok_Id: 1 }]]), // brak kontrahenta dla 2
            positions: new Map([[1, [row(10, 1)]], [2, [row(20, 2)]]]),
            paid: new Map(),
        },
    );
    assert.deepEqual(result.documents.map((d) => d.external_id), [1]);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].externalId, 2);
    assert.match(result.errors[0].message, /kontrahent/i);
});
