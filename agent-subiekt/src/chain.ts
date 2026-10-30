// Wybór dokumentów do wysłania (PLAN-SUBIEKT-2026-10-29.md, Loop 5, uściślenie 3). Czyste funkcje na
// wierszach nagłówków dok__Dokument — bez dostępu do bazy. Dokument spoza wybranego zbioru (zwykła
// sprzedaż) nigdy nie trafia do paczki.

/** dok_Typ w bazie GT (zweryfikowane 30.10.2026). */
export const GT_DOC_TYPE = { ZK: 16, FS: 2, KFS: 6, WZ: 11 } as const;

/** Znacznik architekta w Uwagach; ten sam wzorzec co w portalu (src/lib/subiekt/mapping.ts). */
export const ARCHITECT_MARKER = /#A[-_]?[A-Za-z0-9]{1,16}/i;

/** Nagłówek dokumentu z queries.ts (SQL_CHAIN_HEADERS). Daty jako 'YYYY-MM-DD' (CONVERT … 23 w SQL). */
export interface HeaderRow {
    dok_Id: number;
    dok_Typ: number;
    dok_Podtyp: number;
    dok_NrPelny: string;
    dok_DataWyst: string;
    dok_DoDokId: number | null;
    dok_DoDokNrPelny: string | null;
    dok_PlatnikId: number | null;
    dok_KatId: number | null;
    dok_Uwagi: string | null;
    dok_WartNetto: number;
    dok_WartBrutto: number;
}

export type RootReason = 'CATEGORY' | 'MARKER' | 'BOTH';

export interface SelectedDocument {
    header: HeaderRow;
    /** parent_external_id w paczce: dok_DoDokId, gdy wskazuje dokument ze zbioru, albo rodzic z heurystyki. */
    parentId: number | null;
    /** Dlaczego dokument jest korzeniem; null dla dokumentu wyłącznie pochodnego. */
    rootReason: RootReason | null;
    viaHeuristic: boolean;
}

export interface ChainSelection {
    documents: SelectedDocument[];
    /** FS wielodokumentowe ('+') przypięte do jedynego kandydata ZK — ostrzeżenie MULTI_SOURCE_HEURISTIC. */
    heuristic: Array<{ fs: HeaderRow; parent: HeaderRow }>;
    /**
     * FS wielodokumentowe bez jednoznacznego ZK, a płatnik ma oznaczony ZK w zbiorze (kandydatów 0 —
     * np. ZK ma już FS albo późniejszą datę — albo ≥ 2). Pominięte, do ręcznej obsługi.
     */
    ambiguous: Array<{ fs: HeaderRow; candidates: HeaderRow[] }>;
    /** FS wielodokumentowe płatników bez oznaczonego ZK w zbiorze — zwykła sprzedaż, tylko liczone. */
    unlinkedMultiSource: number;
}

const DERIVED_TYPES = new Set<number>([GT_DOC_TYPE.WZ, GT_DOC_TYPE.FS, GT_DOC_TYPE.KFS]);
const ROOT_TYPES = new Set<number>([GT_DOC_TYPE.ZK, GT_DOC_TYPE.FS]);

export function rootReason(header: HeaderRow, architectCategoryId: number): RootReason | null {
    if (!ROOT_TYPES.has(header.dok_Typ)) return null;
    const byCategory = header.dok_KatId === architectCategoryId;
    const byMarker = ARCHITECT_MARKER.test(header.dok_Uwagi ?? '');
    if (byCategory && byMarker) return 'BOTH';
    if (byCategory) return 'CATEGORY';
    return byMarker ? 'MARKER' : null;
}

/** Rodzic z dok_DoDokId; samoodwołanie (dok_DoDokId = dok_Id) = brak rodzica. */
export const linkedParentId = (header: HeaderRow): number | null =>
    header.dok_DoDokId !== null && header.dok_DoDokId !== header.dok_Id ? header.dok_DoDokId : null;

const MAX_CHAIN_DEPTH = 32;

/**
 * Przodkowie dokumentów pochodnych z okresu, których nie ma wśród wierszy okresu (np. FS sprzed okresu dla KFS
 * z okresu, ZK sprzed okresu dla FS). `fetchByIds` czyta nagłówki bez limitu daty; najwyżej 32 poziomy, każdy
 * identyfikator pobierany raz. O tym, które dokumenty POCHODNE wchodzą do paczki, decyduje wyłącznie okres.
 */
export async function fetchAncestors(
    period: HeaderRow[],
    fetchByIds: (ids: number[]) => Promise<HeaderRow[]>,
): Promise<HeaderRow[]> {
    const known = new Set(period.map((h) => h.dok_Id));
    const requested = new Set<number>();
    const ancestors: HeaderRow[] = [];
    let frontier = period;
    for (let depth = 0; depth < MAX_CHAIN_DEPTH && frontier.length > 0; depth++) {
        const missing = [...new Set(frontier
            .filter((h) => DERIVED_TYPES.has(h.dok_Typ))
            .map(linkedParentId)
            .filter((id): id is number => id !== null && !known.has(id) && !requested.has(id)))];
        if (missing.length === 0) break;
        for (const id of missing) requested.add(id);
        frontier = (await fetchByIds(missing)).filter((h) => !known.has(h.dok_Id));
        for (const h of frontier) {
            known.add(h.dok_Id);
            ancestors.push(h);
        }
    }
    return ancestors;
}

const isMultiSource = (header: HeaderRow) => (header.dok_DoDokNrPelny ?? '').trim() === '+';
const byDateThenId = (a: HeaderRow, b: HeaderRow) =>
    a.dok_DataWyst === b.dok_DataWyst ? a.dok_Id - b.dok_Id : a.dok_DataWyst < b.dok_DataWyst ? -1 : 1;

/**
 * Korzenie: ZK/FS z kategorią Architekt lub znacznikiem w Uwagach — z okresu albo wśród przodków (`ancestors`,
 * fetchAncestors) dokumentów okresu. Pochodne: WZ/FS/KFS, których dok_DoDokId wskazuje dokument ze zbioru — do
 * ustalenia się zbioru; spoza okresu wchodzą tylko przodkowie dokumentów okresu. FS z
 * dok_DoDokNrPelny = '+' spoza zbioru: dokładnie jeden korzeń ZK tego samego płatnika z datą ≤ data FS i
 * bez FS w łańcuchu → rodzic z heurystyki; inaczej pominięta (raport `ambiguous` / licznik).
 */
export function selectChains(
    period: HeaderRow[],
    options: { architectCategoryId: number },
    extra: { ancestors?: HeaderRow[] } = {},
): ChainSelection {
    const byId = new Map(period.map((h) => [h.dok_Id, h]));
    for (const h of extra.ancestors ?? []) if (!byId.has(h.dok_Id)) byId.set(h.dok_Id, h);
    const headers = [...byId.values()];
    const children = new Map<number, HeaderRow[]>();
    for (const h of headers) {
        const parent = linkedParentId(h);
        if (parent === null || !DERIVED_TYPES.has(h.dok_Typ)) continue;
        const list = children.get(parent) ?? [];
        list.push(h);
        children.set(parent, list);
    }

    const reasons = new Map<number, RootReason>();
    for (const h of headers) {
        const reason = rootReason(h, options.architectCategoryId);
        if (reason) reasons.set(h.dok_Id, reason);
    }

    const inSet = new Set<number>();
    const heuristicParent = new Map<number, number>();
    const addWithDescendants = (start: number) => {
        const queue = [start];
        inSet.add(start);
        while (queue.length > 0) {
            const id = queue.shift() as number;
            for (const child of children.get(id) ?? []) {
                if (inSet.has(child.dok_Id)) continue;
                inSet.add(child.dok_Id);
                queue.push(child.dok_Id);
            }
        }
    };
    for (const id of reasons.keys()) if (!inSet.has(id)) addWithDescendants(id);

    const parentOf = (id: number): number | null => {
        const viaHeuristic = heuristicParent.get(id);
        if (viaHeuristic !== undefined) return viaHeuristic;
        const header = byId.get(id);
        const parent = header ? linkedParentId(header) : null;
        return parent !== null && inSet.has(parent) ? parent : null;
    };
    const rootOf = (id: number): number => {
        let current = id;
        for (let step = 0; step < 32; step++) {
            const parent = parentOf(current);
            if (parent === null) return current;
            current = parent;
        }
        return current;
    };

    const zkRoots = headers.filter((h) => h.dok_Typ === GT_DOC_TYPE.ZK && reasons.has(h.dok_Id));
    const chainsWithInvoice = new Set<number>();
    for (const id of inSet) if (byId.get(id)?.dok_Typ === GT_DOC_TYPE.FS) chainsWithInvoice.add(rootOf(id));

    const heuristic: ChainSelection['heuristic'] = [];
    const ambiguous: ChainSelection['ambiguous'] = [];
    let unlinkedMultiSource = 0;
    const multiSource = headers.filter((h) => h.dok_Typ === GT_DOC_TYPE.FS && isMultiSource(h)).sort(byDateThenId);
    for (const fs of multiSource) {
        if (inSet.has(fs.dok_Id)) continue;
        const samePayer = fs.dok_PlatnikId === null ? [] : zkRoots.filter((zk) => zk.dok_PlatnikId === fs.dok_PlatnikId);
        const candidates = samePayer.filter((zk) => zk.dok_DataWyst <= fs.dok_DataWyst && !chainsWithInvoice.has(zk.dok_Id));
        if (candidates.length === 1) {
            const parent = candidates[0] as HeaderRow;
            heuristicParent.set(fs.dok_Id, parent.dok_Id);
            addWithDescendants(fs.dok_Id);
            chainsWithInvoice.add(parent.dok_Id);
            heuristic.push({ fs, parent });
        } else if (samePayer.length > 0) {
            ambiguous.push({ fs, candidates });
        } else {
            unlinkedMultiSource++;
        }
    }

    const documents = [...inSet]
        .map((id) => byId.get(id) as HeaderRow)
        .sort(byDateThenId)
        .map((header) => ({
            header,
            parentId: parentOf(header.dok_Id),
            rootReason: reasons.get(header.dok_Id) ?? null,
            viaHeuristic: heuristicParent.has(header.dok_Id),
        }));
    return { documents, heuristic, ambiguous, unlinkedMultiSource };
}
