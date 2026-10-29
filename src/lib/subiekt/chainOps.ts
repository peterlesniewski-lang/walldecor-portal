// Odpinanie pozycji łańcucha / dokumentu Subiekta od projektu (PLAN-SUBIEKT-2026-10-29.md, Loop 4 —
// wymagania z przeglądu loopa 2, pkt b). Używane przy przeniesieniu łańcucha, ręcznym przypisaniu dokumentu
// z innego projektu i ignorowaniu dokumentu. Wołać w transakcji (zob. db.ts — bez savepointów).
//
// Pozycje usuwa wyłącznie rdzeń (deleteItemCore): w projekcie w toku pozycja znika razem z PENDING, w projekcie
// ZAKOŃCZONY zostaje z kwotą 0 (wpisy korygujące prowizję i cashback). Taki wyzerowany wiersz odpinamy od
// dokumentu (subiekt_document_id / subiekt_position_id = NULL), żeby resync w nowym projekcie i kolejne
// synchronizacje go nie widziały. Wiersz zostaje `source = 'SUBIEKT'`, więc nadal nie podlega edycji ręcznej.
import { query } from '@/lib/db';
import { deleteItemCore, type ItemActor } from '@/lib/projectItems';

const EPSILON = 0.005;

interface LinkedItem { id: string; amount_net: number; status: string }

async function clearItems(items: LinkedItem[], actor: ItemActor): Promise<void> {
    for (const item of items) {
        // Pozycja już wyzerowana w projekcie ZAKOŃCZONY: kolejna korekta do 0 dałaby tylko pusty wpis w logu.
        const alreadyZero = item.status === 'ZAKOŃCZONY' && Math.abs(Number(item.amount_net)) < EPSILON;
        if (!alreadyZero) await deleteItemCore(item.id, actor);
        // Po DELETE (projekt w toku) UPDATE nic nie zmienia; po korekcie do 0 odpina wiersz od dokumentu.
        await query('UPDATE project_items SET subiekt_document_id = NULL, subiekt_position_id = NULL WHERE id = ?', [item.id]);
    }
}

const SELECT_LINKED = `SELECT i.id, i.amount_net, p.status
    FROM project_items i JOIN projects p ON p.id = i.project_id
    WHERE i.project_id = ? AND i.source = 'SUBIEKT'`;

/**
 * Usuwa z projektu `projectId` wszystkie pozycje SUBIEKT dokumentów łańcucha (`root_external_id = root` albo
 * sam korzeń `external_id = root`). Pozycje tych dokumentów w innych projektach zostają.
 */
export async function clearChainItems(rootExternalId: number, projectId: string, actor: ItemActor): Promise<void> {
    const items = await query<LinkedItem>(
        `${SELECT_LINKED} AND i.subiekt_document_id IN (
            SELECT id FROM subiekt_documents WHERE root_external_id = ? OR external_id = ?
         ) ORDER BY i.id`,
        [projectId, rootExternalId, rootExternalId]
    );
    await clearItems(items, actor);
}

/** Jak clearChainItems, ale tylko pozycje jednego dokumentu w `projectId`. */
export async function clearDocumentItems(subiektDocumentId: string, projectId: string, actor: ItemActor): Promise<void> {
    const items = await query<LinkedItem>(`${SELECT_LINKED} AND i.subiekt_document_id = ? ORDER BY i.id`, [projectId, subiektDocumentId]);
    await clearItems(items, actor);
}
