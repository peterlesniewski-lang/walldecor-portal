// Uzgodnienie faktur z zamówieniem (PLAN-SUBIEKT-2026-10-29.md, Loop 5b) — czyste reguły, bez bazy.
// ZK jest źródłem rozbicia produkt / montaż, faktury (FS + KFS) źródłem kwoty i zapłaty. Łańcuch = korzeń ZK
// i przypisane WZ/FS/KFS tego samego root_external_id w projekcie; mappingDb.ts → syncChainOf wybiera według
// trybu, z którego dokumentu powstają pozycje projektu.
import { createHash } from 'node:crypto';
import { AMOUNT_EPSILON } from './mapping';
import type { SubiektPositionPayload } from './types';

export type ChainMode = 'ORDER_ONLY' | 'INVOICE_ONLY' | 'MIRROR' | 'ORDER_BREAKDOWN' | 'RECONCILE';

/** Pozycja w porównaniu rozbicia: klucz (product_id / nazwa) i kwota netto (dla FS — po korekcie KFS). */
export type BreakdownPosition = Pick<SubiektPositionPayload, 'product_id' | 'name' | 'net_total'>;

export interface ChainInput {
    /** ZK łańcucha (w praktyce jedno — korzeń). */
    orders: Array<{ net_total: number; positions: BreakdownPosition[] }>;
    /** FS łańcucha; `positions` z kwotami PO korektach KFS. */
    invoices: Array<{ net_total: number; positions: BreakdownPosition[] }>;
    /** Przypisane KFS łańcucha — `net_total` to różnica korekty (zwykle ujemna). */
    corrections: Array<{ net_total: number }>;
}

/** Długość kolumny subiekt_reconciliations.fingerprint. */
export const FINGERPRINT_MAX_LENGTH = 2000;

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const sum = (rows: Array<{ net_total: number }>) => rows.reduce((total, row) => total + Number(row.net_total), 0);
const normalizeName = (name: string | null | undefined) => (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const hasProduct = (p: BreakdownPosition) => p.product_id !== null && p.product_id !== undefined;

/** Ten sam klucz rozbicia: product_id, gdy oba niepuste; inaczej nazwa (trim, zbite białe znaki, bez wielkości liter). */
export function sameBreakdownKey(a: BreakdownPosition, b: BreakdownPosition): boolean {
    if (hasProduct(a) && hasProduct(b)) return Number(a.product_id) === Number(b.product_id);
    return normalizeName(a.name) === normalizeName(b.name);
}

/**
 * Czy faktury odzwierciedlają rozbicie ZK: po odrzuceniu pozycji ≤ 0 liczba pozycji FS równa liczbie pozycji ZK
 * i każda pozycja FS ma jedną niewykorzystaną pozycję ZK o tym samym kluczu i kwocie (± AMOUNT_EPSILON).
 * Pusta lista pozycji nie jest odzwierciedleniem.
 */
export function mirrors(zkPositions: BreakdownPosition[], fsPositionsAfterKfs: BreakdownPosition[]): boolean {
    const zk = zkPositions.filter((p) => Number(p.net_total) > 0);
    const fs = fsPositionsAfterKfs.filter((p) => Number(p.net_total) > 0);
    if (zk.length === 0 || zk.length !== fs.length) return false;
    const used = new Set<number>();
    for (const invoicePosition of fs) {
        const index = zk.findIndex((orderPosition, i) =>
            !used.has(i) &&
            sameBreakdownKey(orderPosition, invoicePosition) &&
            Math.abs(Number(orderPosition.net_total) - Number(invoicePosition.net_total)) < AMOUNT_EPSILON);
        if (index === -1) return false;
        used.add(index);
    }
    return true;
}

/** zkNet = Σ ZK, invoicedNet = Σ FS + Σ KFS łańcucha, oba do 2 miejsc. */
export function chainTotals(input: ChainInput): { zkNet: number; invoicedNet: number } {
    return {
        zkNet: round2(sum(input.orders)),
        invoicedNet: round2(sum(input.invoices) + sum(input.corrections)),
    };
}

/**
 * Brak FS → ORDER_ONLY; brak ZK → INVOICE_ONLY; FS odzwierciedlają ZK → MIRROR; sumy równe → ORDER_BREAKDOWN;
 * inaczej RECONCILE (ręczne uzgodnienie przez admina).
 */
export function chainMode(input: ChainInput): ChainMode {
    if (input.invoices.length === 0) return 'ORDER_ONLY';
    if (input.orders.length === 0) return 'INVOICE_ONLY';
    const zkPositions = input.orders.flatMap((order) => order.positions);
    const fsPositions = input.invoices.flatMap((invoice) => invoice.positions);
    if (mirrors(zkPositions, fsPositions)) return 'MIRROR';
    const { zkNet, invoicedNet } = chainTotals(input);
    return Math.abs(invoicedNet - zkNet) < AMOUNT_EPSILON ? 'ORDER_BREAKDOWN' : 'RECONCILE';
}

/**
 * Odcisk faktur łańcucha: `external_id:net_total` wszystkich FS i KFS, posortowane po external_id, złączone `;`
 * (kwoty z 2 miejscami). Zmiana zestawu faktur lub kwoty = inny odcisk = uzgodnienie wraca do OPEN. Dłuższy niż
 * kolumna → `sha256:<hex>` z tego samego tekstu (nadal stabilny).
 */
export function fingerprint(documents: Array<{ external_id: number; net_total: number }>): string {
    const text = [...documents]
        .map((d) => ({ id: Number(d.external_id), net: round2(d.net_total) }))
        .sort((a, b) => a.id - b.id)
        .map((d) => `${d.id}:${d.net.toFixed(2)}`)
        .join(';');
    return text.length > FINGERPRINT_MAX_LENGTH ? `sha256:${createHash('sha256').update(text).digest('hex')}` : text;
}
