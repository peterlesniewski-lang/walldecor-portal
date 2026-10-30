// Wiersze GT → SubiektDocumentPayload (PLAN-SUBIEKT-2026-10-29.md, Loop 5, uściślenie 4). Czyste funkcje.
import { GT_DOC_TYPE, type ChainSelection, type SelectedDocument } from './chain.ts';
import type { SubiektDocType, SubiektDocumentPayload, SubiektPositionPayload } from './contract.ts';

/** Pozycja dokumentu z queries.ts (SQL_POSITIONS: dok_Pozycja + tw__Towar.tw_Nazwa). */
export interface PositionRow {
    ob_Id: number;
    ob_DokHanId: number;
    ob_DokHanLp: number;
    ob_DoId: number | null;
    /** 1 = pozycja zwykła / po korekcie, −1 = pozycja „przed korektą” na KFS (nie trafia do paczki). */
    ob_Znak: number;
    ob_TowId: number | null;
    /** 1 = towar, 2 = usługa (pozycje jednorazowe zawsze 2). Tylko diagnostyka sondy — typ pozycji ustala portal. */
    ob_TowRodzaj: number;
    ob_Opis: string | null;
    tw_Nazwa: string | null;
    ob_Ilosc: number;
    ob_Jm: string | null;
    ob_CenaNetto: number;
    ob_WartNetto: number;
}

/** Kontrahent dokumentu z queries.ts (SQL_CONTRACTORS): historia adresu, ewidencja adresów, kartoteka. */
export interface ContractorRow {
    dok_Id: number;
    adrh_Nazwa: string | null;
    adrh_NazwaPelna: string | null;
    adrh_NIP: string | null;
    adr_Nazwa: string | null;
    adr_NazwaPelna: string | null;
    adr_NIP: string | null;
    kh_Symbol: string | null;
}

export class PayloadError extends Error {
    readonly externalId: number;
    constructor(externalId: number, message: string) {
        super(message);
        this.externalId = externalId;
    }
}

const TYPE_BY_GT: ReadonlyMap<number, SubiektDocType> = new Map([
    [GT_DOC_TYPE.ZK, 'ZK'], [GT_DOC_TYPE.FS, 'FS'], [GT_DOC_TYPE.KFS, 'KFS'], [GT_DOC_TYPE.WZ, 'WZ'],
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME = 255;
const MAX_UNIT = 16;
const MAX_REMARKS = 4000;
const MAX_NIP = 20;
/** Limit numeru dokumentu w walidatorze portalu. */
const MAX_NUMBER = 64;

/** Zaokrąglenie dziesiętne (przesunięcie wykładnika omija błąd 1.005 * 100), symetryczne względem zera. */
export function roundTo(value: number, digits: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`niepoprawna liczba: ${String(value)}`);
    const n = value;
    const shifted = Math.round(Number(`${Math.abs(n)}e${digits}`));
    const result = Number(`${shifted}e-${digits}`);
    return n < 0 && result !== 0 ? -result : result;
}
/** Kwota / ilość z bazy: NULL, NaN, ±∞ → PayloadError (dokument pominięty z opisem), nie 0 ani NaN w paczce. */
function amount(value: unknown, digits: number, docId: number, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new PayloadError(docId, `${label}: brak lub niepoprawna wartość (${String(value)})`);
    }
    return roundTo(value, digits);
}

const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

/** Niepuste linie ob_Opis połączone spacją; pusty opis → tw_Nazwa. Wynik w jednej linii, ≤ 255 znaków. */
export function positionName(opis: string | null, towarName: string | null): string {
    const fromOpis = (opis ?? '').split(/\r\n|\r|\n/).map(clean).filter(Boolean).join(' ');
    return (fromOpis || clean(towarName)).slice(0, MAX_NAME).trim();
}

function buildPosition(row: PositionRow, docId: number): SubiektPositionPayload {
    const name = positionName(row.ob_Opis, row.tw_Nazwa);
    if (!name) throw new PayloadError(docId, `pozycja ${row.ob_Id}: brak opisu i nazwy towaru`);
    if (!Number.isInteger(row.ob_DokHanLp) || row.ob_DokHanLp <= 0) {
        throw new PayloadError(docId, `pozycja ${row.ob_Id}: niepoprawna liczba porządkowa ${row.ob_DokHanLp}`);
    }
    return {
        external_id: row.ob_Id,
        ordinal: row.ob_DokHanLp,
        product_id: row.ob_TowId ?? null,
        name,
        quantity: amount(row.ob_Ilosc, 4, docId, `pozycja ${row.ob_Id}: ob_Ilosc`),
        unit: clean(row.ob_Jm).slice(0, MAX_UNIT),
        unit_price_net: amount(row.ob_CenaNetto, 2, docId, `pozycja ${row.ob_Id}: ob_CenaNetto`),
        net_total: amount(row.ob_WartNetto, 2, docId, `pozycja ${row.ob_Id}: ob_WartNetto`),
        corrects_position_external_id: null,
    };
}

/** KFS: ob_DoId, gdy wskazuje pozycję FS-rodzica; inaczej jedyna pozycja FS-rodzica o tym samym (product_id, name); inaczej null. */
function correctedPosition(row: PositionRow, built: SubiektPositionPayload, parentPositions: SubiektPositionPayload[] | null): number | null {
    if (!parentPositions) return null;
    if (row.ob_DoId !== null && parentPositions.some((p) => p.external_id === row.ob_DoId)) return row.ob_DoId;
    const matches = parentPositions.filter((p) => p.product_id === built.product_id && p.name === built.name);
    return matches.length === 1 ? (matches[0] as SubiektPositionPayload).external_id : null;
}

function contractorFields(docId: number, row: ContractorRow | undefined): { name: string; nip: string | null } {
    if (!row) throw new PayloadError(docId, 'brak danych kontrahenta (adrh__Historia / adr__Ewid / kh__Kontrahent)');
    const name = [row.adrh_NazwaPelna, row.adrh_Nazwa, row.adr_NazwaPelna, row.adr_Nazwa, row.kh_Symbol]
        .map(clean).find(Boolean);
    if (!name) throw new PayloadError(docId, 'brak nazwy kontrahenta');
    const nip = (clean(row.adrh_NIP) || clean(row.adr_NIP)).replace(/\D/g, '').slice(0, MAX_NIP);
    return { name: name.slice(0, MAX_NAME).trim(), nip: nip || null };
}

export interface DocumentInput {
    selected: SelectedDocument;
    contractor: ContractorRow | undefined;
    positions: PositionRow[];
    isPaid: boolean;
    /** Zbudowane pozycje FS-rodzica (tylko dla KFS) — cel corrects_position_external_id. */
    parentPositions: SubiektPositionPayload[] | null;
}

export function buildDocument(input: DocumentInput): SubiektDocumentPayload {
    const h = input.selected.header;
    const type = TYPE_BY_GT.get(h.dok_Typ);
    if (!type) throw new PayloadError(h.dok_Id, `nieobsługiwany dok_Typ ${h.dok_Typ}`);
    const number = clean(h.dok_NrPelny);
    if (!number) throw new PayloadError(h.dok_Id, 'pusty numer dokumentu');
    if (number.length > MAX_NUMBER) throw new PayloadError(h.dok_Id, `numer dłuższy niż ${MAX_NUMBER} znaki: „${number}”`);
    if (!DATE_RE.test(h.dok_DataWyst ?? '')) throw new PayloadError(h.dok_Id, `niepoprawna data wystawienia „${h.dok_DataWyst}”`);
    const contractor = contractorFields(h.dok_Id, input.contractor);

    const rows = [...input.positions]
        .filter((row) => type !== 'KFS' || row.ob_Znak !== -1)
        .sort((a, b) => a.ob_DokHanLp - b.ob_DokHanLp || a.ob_Id - b.ob_Id);
    const positions = rows.map((row) => {
        const built = buildPosition(row, h.dok_Id);
        if (type === 'KFS') built.corrects_position_external_id = correctedPosition(row, built, input.parentPositions);
        return built;
    });

    const remarks = (h.dok_Uwagi ?? '').trim().slice(0, MAX_REMARKS);
    return {
        external_id: h.dok_Id,
        type,
        number,
        issued_at: h.dok_DataWyst,
        contractor_name: contractor.name,
        contractor_nip: contractor.nip,
        architect_code: null,
        parent_external_id: input.selected.parentId,
        net_total: amount(h.dok_WartNetto, 2, h.dok_Id, 'dok_WartNetto'),
        gross_total: amount(h.dok_WartBrutto, 2, h.dok_Id, 'dok_WartBrutto'),
        is_paid: input.isPaid,
        remarks: remarks || null,
        positions,
    };
}

export interface DocumentDetails {
    contractors: Map<number, ContractorRow>;
    /** ob_DokHanId → pozycje. */
    positions: Map<number, PositionRow[]>;
    /** dok_Id → is_paid (brak wpisu = niezapłacony). */
    paid: Map<number, boolean>;
}

export interface BuildResult {
    documents: SubiektDocumentPayload[];
    errors: Array<{ externalId: number; number: string; message: string }>;
}

/** Buduje paczkę: najpierw dokumenty bez korekt, potem KFS (potrzebują pozycji FS-rodzica). Błąd jednego dokumentu nie zatrzymuje reszty. */
export function buildPayloads(selection: Pick<ChainSelection, 'documents'>, details: DocumentDetails): BuildResult {
    const built = new Map<number, SubiektDocumentPayload>();
    const errors: BuildResult['errors'] = [];
    const ordered = [
        ...selection.documents.filter((d) => d.header.dok_Typ !== GT_DOC_TYPE.KFS),
        ...selection.documents.filter((d) => d.header.dok_Typ === GT_DOC_TYPE.KFS),
    ];
    for (const selected of ordered) {
        const id = selected.header.dok_Id;
        try {
            const parent = selected.parentId === null ? undefined : built.get(selected.parentId);
            built.set(id, buildDocument({
                selected,
                contractor: details.contractors.get(id),
                positions: details.positions.get(id) ?? [],
                isPaid: details.paid.get(id) ?? false,
                parentPositions: selected.header.dok_Typ === GT_DOC_TYPE.KFS && parent?.type === 'FS' ? parent.positions : null,
            }));
        } catch (error) {
            if (!(error instanceof PayloadError)) throw error;
            errors.push({ externalId: id, number: clean(selected.header.dok_NrPelny), message: error.message });
        }
    }
    const documents = selection.documents.map((d) => built.get(d.header.dok_Id)).filter((d): d is SubiektDocumentPayload => d !== undefined);
    return { documents, errors };
}
