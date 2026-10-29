// Podpowiedź statusu projektu z dokumentów Subiekta (PLAN-SUBIEKT-2026-10-29.md, 2.4 pkt 6).
// Tylko odczyt: wynik nie jest zapisywany w projects.status — admin stosuje go ręcznie (loop 4).
import { query } from '@/lib/db';
import { AMOUNT_EPSILON as EPSILON } from './mapping';

export type SuggestedStatus = 'PRZYJĘTY' | 'W_REALIZACJI' | 'ZAKOŃCZONY';

interface ProjectDocRow { type: string; net_total: number; is_paid: number }


async function loadAssignedDocuments(projectId: string): Promise<ProjectDocRow[]> {
    return query<ProjectDocRow>(
        "SELECT type, net_total, is_paid FROM subiekt_documents WHERE project_id = ? AND assignment_status IN ('AUTO', 'MANUAL')",
        [projectId]
    );
}

const sumOf = (rows: ProjectDocRow[], type: string) =>
    rows.filter((r) => r.type === type).reduce((sum, r) => sum + Number(r.net_total), 0);

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Brak dokumentów → null; brak FS → PRZYJĘTY; jakakolwiek FS niezapłacona → W_REALIZACJI;
 * wszystkie FS zapłacone i FS + KFS ≥ ZK (lub brak ZK) → ZAKOŃCZONY; zapłacone, ale poniżej ZK → W_REALIZACJI.
 */
export async function computeSuggestedStatus(projectId: string): Promise<SuggestedStatus | null> {
    const rows = await loadAssignedDocuments(projectId);
    if (rows.length === 0) return null;

    const invoices = rows.filter((r) => r.type === 'FS');
    if (invoices.length === 0) return 'PRZYJĘTY';
    if (invoices.some((r) => Number(r.is_paid) !== 1)) return 'W_REALIZACJI';

    const hasOrder = rows.some((r) => r.type === 'ZK');
    const invoiced = sumOf(rows, 'FS') + sumOf(rows, 'KFS');
    return !hasOrder || invoiced >= sumOf(rows, 'ZK') - EPSILON ? 'ZAKOŃCZONY' : 'W_REALIZACJI';
}

/** Kwoty netto do widoku projektu: zamówione (ZK), zafakturowane (FS + KFS, czyli po korektach), pozostało. */
export async function getProjectSubiektSummary(projectId: string): Promise<{ zkTotal: number; fsTotal: number; remainingToInvoice: number }> {
    const rows = await loadAssignedDocuments(projectId);
    const zkTotal = round2(sumOf(rows, 'ZK'));
    const fsTotal = round2(sumOf(rows, 'FS') + sumOf(rows, 'KFS'));
    return { zkTotal, fsTotal, remainingToInvoice: Math.max(0, round2(zkTotal - fsTotal)) };
}
