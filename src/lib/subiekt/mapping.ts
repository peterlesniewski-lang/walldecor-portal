// Czyste reguły mapowania dokumentów Subiekta GT (PLAN-SUBIEKT-2026-10-29.md, 2.4).
// Bez dostępu do bazy — wołający (sync) dostarcza dane przez parametry i callbacki.
import type { SubiektDocumentPayload, SubiektPositionPayload, SubiektDocType } from './types';
import type { NewItemInput } from '@/lib/projectItems';

/** Tolerancja porównań kwot (DECIMAL(12,2)) w mapowaniu, pozycjach i podpowiedzi statusu. */
export const AMOUNT_EPSILON = 0.005;
/** assignment_note dokumentu pochodnego, który dziedziczy IGNORED po zignorowanym korzeniu łańcucha. */
export const ROOT_IGNORED = 'ROOT_IGNORED';

const REMARKS_MARKER = /#A[-_]?([A-Za-z0-9]{1,16})/i;
const MAX_CHAIN_STEPS = 32;

/** Kod architekta: pole własne ma pierwszeństwo; w polu własnym bierzemy token przed pierwszą spacją ("A-001 Nowak" → "A-001"), trim + uppercase. Gdy brak, znacznik z uwag: /#A[-_]?([A-Za-z0-9]{1,16})/i → "A-" + grupa uppercase ("#A-001" i "#a001" → "A-001"). Brak → null. */
export function resolveArchitectCode(doc: Pick<SubiektDocumentPayload, 'architect_code' | 'remarks'>): string | null {
    const own = (doc.architect_code ?? '').trim();
    if (own) {
        const token = own.split(/\s+/)[0];
        if (token) return token.toUpperCase();
    }
    const match = REMARKS_MARKER.exec(doc.remarks ?? '');
    if (match) return `A-${match[1].toUpperCase()}`;
    return null;
}

function typeRank(type: SubiektDocType): number {
    switch (type) {
        case 'ZK':
        case 'FP': return 0;
        case 'WZ': return 1;
        case 'FS': return 2;
        case 'KFS': return 3;
    }
}

/** Kolejność przetwarzania: ZK i FP (ranga 0) → WZ (1) → FS (2) → KFS (3); w obrębie rangi po issued_at rosnąco, potem external_id rosnąco. Nie mutuje wejścia. */
export function sortDocumentsForProcessing<T extends Pick<SubiektDocumentPayload, 'type' | 'issued_at' | 'external_id'>>(docs: T[]): T[] {
    return [...docs].sort((a, b) => {
        const byRank = typeRank(a.type) - typeRank(b.type);
        if (byRank !== 0) return byRank;
        if (a.issued_at !== b.issued_at) return a.issued_at < b.issued_at ? -1 : 1;
        return a.external_id - b.external_id;
    });
}

/** Idzie po parent_external_id aż do dokumentu bez rodzica. `parentOf(id)` zwraca parent_external_id dokumentu albo `undefined`, gdy dokument o tym id jest nieznany. Zwraca { rootExternalId } albo { missingExternalId } (łańcuch urwany: nieznany dokument) — i chroni przed cyklem (max 32 kroki → traktuj jak urwany łańcuch z missingExternalId = ostatnio odwiedzony). */
export function resolveRoot(
    externalId: number,
    parentOf: (id: number) => number | null | undefined,
): { rootExternalId: number } | { missingExternalId: number } {
    let current = externalId;
    for (let step = 0; step < MAX_CHAIN_STEPS; step++) {
        const parent = parentOf(current);
        if (parent === undefined) return { missingExternalId: current };
        if (parent === null) return { rootExternalId: current };
        current = parent;
    }
    return { missingExternalId: current };
}

/** Pozycja z kartą towaru → 'PRODUCT', jednorazowa (product_id null) → 'INSTALLATION'. */
export function positionToItemType(pos: Pick<SubiektPositionPayload, 'product_id'>): 'PRODUCT' | 'INSTALLATION' {
    return pos.product_id === null || pos.product_id === undefined ? 'INSTALLATION' : 'PRODUCT';
}

/** Kategoria pozycji z Subiekta dla typu (także po ręcznej zmianie typu w panelu admina). */
export function subiektCategory(type: 'PRODUCT' | 'INSTALLATION'): string {
    return type === 'PRODUCT' ? 'Produkt (Subiekt)' : 'Montaż (Subiekt)';
}

/** Buduje NewItemInput dla pozycji dokumentu wiodącego: type wg positionToItemType (lub `forcedType` gdy podany — używane dla pozycji z type_overridden), category 'Produkt (Subiekt)' / 'Montaż (Subiekt)', description = pos.name, amount_net = pos.net_total, order_number = rootZkNumber (może być null), invoice_number = doc.number gdy doc.type === 'FS', inaczej null, is_paid = doc.is_paid, source 'SUBIEKT', subiekt_document_id, subiekt_position_id = pos.external_id. */
export function buildItemInput(
    doc: SubiektDocumentPayload,
    pos: SubiektPositionPayload,
    ctx: { subiektDocumentId: string; rootZkNumber: string | null; forcedType?: 'PRODUCT' | 'INSTALLATION' },
): NewItemInput {
    const type = ctx.forcedType ?? positionToItemType(pos);
    return {
        type,
        category: subiektCategory(type),
        description: pos.name,
        amount_net: pos.net_total,
        order_number: ctx.rootZkNumber,
        invoice_number: doc.type === 'FS' ? doc.number : null,
        is_paid: doc.is_paid,
        source: 'SUBIEKT',
        subiekt_document_id: ctx.subiektDocumentId,
        subiekt_position_id: pos.external_id,
    };
}

/** Dokument wiodący łańcucha: jeśli wśród `chainTypes` jest 'FS' → 'FS', inaczej 'ZK'. (FP i WZ nigdy nie tworzą pozycji.) */
export function leadingDocType(chainTypes: SubiektDocType[]): 'FS' | 'ZK' {
    return chainTypes.includes('FS') ? 'FS' : 'ZK';
}

/** Czy dokument tego typu tworzy pozycje projektu, gdy jest dokumentem wiodącym. */
export function createsItems(type: SubiektDocType): boolean {
    return type === 'ZK' || type === 'FS';
}
