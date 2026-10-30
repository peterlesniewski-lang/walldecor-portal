// Diff pozycji dokumentu zamówieniowego (ZK/FP) między snapshotami i tekst wpisu do logu aktywności
// (PLAN-SUBIEKT-2026-10-29.md, 2.5). Czyste funkcje, bez bazy.
import { formatPLNFixed } from '@/lib/utils';
import type { SubiektPositionPayload } from './types';

export interface PositionDiffLine {
    kind: 'ADDED' | 'REMOVED' | 'QUANTITY' | 'PRICE' | 'NAME';
    /** Nazwa pozycji (dla NAME i zmian ilości/ceny — nazwa po zmianie, dla REMOVED — ostatnia znana). */
    name: string;
    /**
     * QUANTITY / PRICE: opis pozycji "<ilość> <jm> × <cena netto>", np. "10 szt × 120,00".
     * NAME: stara i nowa nazwa. ADDED: before = null, after = wartość netto pozycji ("1 200,00").
     * REMOVED: before = wartość netto usuniętej pozycji, after = null.
     */
    before: string | null;
    after: string | null;
}

/** Ilość bez grupowania tysięcy (jeden token bez spacji), do 4 miejsc po przecinku: 12.5 → "12,5". */
function formatQuantity(quantity: number): string {
    return Number(quantity).toLocaleString('pl-PL', { maximumFractionDigits: 4, useGrouping: false });
}

function describe(position: SubiektPositionPayload): string {
    const qtyAndUnit = [formatQuantity(position.quantity), (position.unit ?? '').trim()].filter(Boolean).join(' ');
    return `${qtyAndUnit} × ${formatPLNFixed(position.unit_price_net)}`;
}

/** Odwrotność describe(): "10 szt × 120,00" → { quantity: "10", unit: "szt", price: "120,00" }. */
function parseDescription(text: string | null): { quantity: string; unit: string; price: string } {
    const match = /^(\S+)(?: (.*?))? × (.+)$/.exec(text ?? '');
    if (!match) return { quantity: text ?? '', unit: '', price: '' };
    return { quantity: match[1], unit: match[2] ?? '', price: match[3] };
}

const sameQuantity = (a: number, b: number) => Math.round(Number(a) * 10000) === Math.round(Number(b) * 10000);
/** Równość kwot z dokładnością do grosza (ceny pozycji, wartości dokumentu). */
export const sameAmount = (a: number, b: number) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
const byOrdinal = (a: SubiektPositionPayload, b: SubiektPositionPayload) => a.ordinal - b.ordinal;

/**
 * Zmiany pozycji: dopasowanie po external_id (ob_Id — GT zachowuje je przy edycji dokumentu).
 * Kolejność: pozycje `next` wg ordinal (dla jednej pozycji NAME → QUANTITY → PRICE), potem usunięte wg
 * ordinal z `prev`. Ilość porównywana z dokładnością do 0,0001, cena do grosza.
 */
export function diffPositions(prev: SubiektPositionPayload[], next: SubiektPositionPayload[]): PositionDiffLine[] {
    const prevById = new Map(prev.map((p) => [p.external_id, p]));
    const nextIds = new Set(next.map((p) => p.external_id));
    const lines: PositionDiffLine[] = [];

    for (const after of [...next].sort(byOrdinal)) {
        const before = prevById.get(after.external_id);
        if (!before) {
            lines.push({ kind: 'ADDED', name: after.name, before: null, after: formatPLNFixed(after.net_total) });
            continue;
        }
        if (before.name !== after.name) {
            lines.push({ kind: 'NAME', name: after.name, before: before.name, after: after.name });
        }
        if (!sameQuantity(before.quantity, after.quantity)) {
            lines.push({ kind: 'QUANTITY', name: after.name, before: describe(before), after: describe(after) });
        }
        if (!sameAmount(before.unit_price_net, after.unit_price_net)) {
            lines.push({ kind: 'PRICE', name: after.name, before: describe(before), after: describe(after) });
        }
    }

    for (const removed of [...prev].sort(byOrdinal)) {
        if (!nextIds.has(removed.external_id)) {
            lines.push({ kind: 'REMOVED', name: removed.name, before: formatPLNFixed(removed.net_total), after: null });
        }
    }

    return lines;
}

function fragment(line: PositionDiffLine): string {
    switch (line.kind) {
        case 'QUANTITY': {
            const before = parseDescription(line.before);
            const after = parseDescription(line.after);
            return `${line.name} ${before.quantity} → ${after.quantity}${after.unit ? ` ${after.unit}` : ''}`;
        }
        case 'PRICE':
            return `${line.name} cena ${parseDescription(line.before).price} → ${parseDescription(line.after).price} zł`;
        case 'NAME':
            return `nazwa: ${line.before} → ${line.after}`;
        case 'ADDED':
            return `dodano ${line.name} ${line.after} zł`;
        case 'REMOVED':
            return `usunięto ${line.name}`;
    }
}

/**
 * Tekst wpisu SUBIEKT_ZK_CHANGED, np.
 * "ZK 45/10/2026: Tapeta Floral 10 → 8 szt; dodano Montaż 1 200,00 zł; wartość 14 300,00 → 13 160,00 zł".
 * Część „wartość” jest zawsze na końcu (także bez zmian pozycji). Kwoty jak formatPLNFixed — separator
 * tysięcy to twarda spacja U+00A0.
 */
export function formatDiffForLog(docNumber: string, lines: PositionDiffLine[], netBefore: number, netAfter: number): string {
    const parts = [...lines.map(fragment), `wartość ${formatPLNFixed(netBefore)} → ${formatPLNFixed(netAfter)} zł`];
    return `${docNumber}: ${parts.join('; ')}`;
}

/**
 * Tekst wpisu SUBIEKT_CORRECTION (korekta KFS), np.
 * "KFS 3/10/2026 (korekta FS 7/10/2026): Tapeta Test 8 → 6 szt; wartość korekty -200,00 zł".
 * `lines` = diffPositions(pozycje korygowanej FS, pozycje KFS) — agent wysyła w KFS stan PO korekcie.
 */
export function formatCorrectionForLog(docNumber: string, invoiceNumber: string | null, lines: PositionDiffLine[], netTotal: number): string {
    const head = invoiceNumber ? `${docNumber} (korekta ${invoiceNumber})` : docNumber;
    const parts = [...lines.map(fragment), `wartość korekty ${formatPLNFixed(netTotal)} zł`];
    return `${head}: ${parts.join('; ')}`;
}

// --- Uzgodnienie faktur z zamówieniem (Loop 5b): wpisy SUBIEKT_RECONCILIATION_* ---

const zl = (value: number) => `${formatPLNFixed(value)} zł`;

/**
 * SUBIEKT_RECONCILIATION_OPENED, np. "ZK 45/10/2026: faktury niezgodne z zamówieniem — zamówienie 836,59 zł,
 * faktury 900,00 zł (FS 7/10/2026); różnica 63,41 zł. Kwoty pozycji uzgadnia admin."
 */
export function formatReconciliationOpened(zkNumber: string, zkNet: number, invoicedNet: number, invoiceNumbers: string[]): string {
    const docs = invoiceNumbers.length > 0 ? ` (${invoiceNumbers.join(', ')})` : '';
    return `${zkNumber}: faktury niezgodne z zamówieniem — zamówienie ${zl(zkNet)}, faktury ${zl(invoicedNet)}${docs}; `
        + `różnica ${zl(Math.round((invoicedNet - zkNet) * 100) / 100)}. Kwoty pozycji uzgadnia admin.`;
}

/** SUBIEKT_RECONCILIATION_CLOSED: łańcuch znów zgodny (mirror, równe sumy albo bez faktur). */
export function formatReconciliationClosed(zkNumber: string, zkNet: number, invoicedNet: number): string {
    return `${zkNumber}: uzgodnienie zamknięte automatycznie — faktury ${zl(invoicedNet)}, zamówienie ${zl(zkNet)}.`;
}

export interface ReconciliationAmountChange {
    description: string | null;
    before: number;
    after: number;
}

/**
 * SUBIEKT_RECONCILIATION_RESOLVED, np. "ZK 45/10/2026: faktury uzgodnione ręcznie — Tapeta Floral 536,59 → 600,00 zł;
 * Montaż 300,00 zł bez zmian; razem 900,00 zł. Notatka: …"
 */
export function formatReconciliationResolved(zkNumber: string, changes: ReconciliationAmountChange[], total: number, note: string | null): string {
    const parts = changes.map((c) => {
        const name = c.description || 'pozycja';
        return sameAmount(c.before, c.after)
            ? `${name} ${zl(c.after)} bez zmian`
            : `${name} ${formatPLNFixed(c.before)} → ${zl(c.after)}`;
    });
    const head = `${zkNumber}: faktury uzgodnione ręcznie — ${[...parts, `razem ${zl(total)}`].join('; ')}.`;
    return note ? `${head} Notatka: ${note}` : head;
}

/** Wersja wpisów SUBIEKT_RECONCILIATION_* dla architekta — bez kwot faktur i bez szczegółów decyzji. */
export function formatReconciliationForArchitect(eventType: string, zkNumber: string | null): string {
    const head = zkNumber ? `${zkNumber}: ` : '';
    switch (eventType) {
        case 'SUBIEKT_RECONCILIATION_OPENED':
            return `${head}faktury w uzgadnianiu z zamówieniem — kwoty pozycji mogą się jeszcze zmienić.`;
        case 'SUBIEKT_RECONCILIATION_RESOLVED':
            return `${head}faktury uzgodnione z zamówieniem, kwoty pozycji zaktualizowane.`;
        default:
            return `${head}faktury zgodne z zamówieniem.`;
    }
}
