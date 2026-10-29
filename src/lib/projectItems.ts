// Rdzeń pozycji projektu: dodanie / zmiana kwoty / usunięcie pozycji wraz z prowizją i cashbackiem.
// Wspólny dla akcji panelu admina (src/app/actions/projects.ts) i synchronizacji z Subiektem GT.
//
// Moduł celowo NIE jest plikiem 'use server' i nie zna sesji ani cache Next.js: uprawnienia sprawdza
// wywołujący, a revalidatePath zostaje w akcji. Autor zmiany przychodzi jako `actor.actorId`
// (null = system, np. synchronizacja maszynowa).
import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/services";
import { v4 as uuidv4 } from 'uuid';
import { spendCashback } from "@/lib/cashback";
import { formatSqlDateTime } from "@/lib/dbDate";
import { getCommissionRateForTurnover, CASHBACK_RATE } from "@/lib/partnerProgram";

export interface ItemActor { actorId: string | null; note?: string | null }

export interface NewItemInput {
    type: 'PRODUCT' | 'INSTALLATION';
    category: string;
    description?: string | null;
    amount_net: number;
    order_number?: string | null;
    invoice_number?: string | null;
    is_paid?: boolean;
    source?: 'MANUAL' | 'SUBIEKT';
    subiekt_document_id?: string | null;
    subiekt_position_id?: number | null;
}

// Obrót netto kwalifikowany architekta (PRODUCT w projektach ZAKOŃCZONYCH),
// opcjonalnie z wyłączeniem wskazanego projektu — status awansuje "od kolejnego projektu".
async function getQualifiedTurnover(architectId: string, excludeProjectId?: string, queryFn: typeof query = query): Promise<number> {
    const res = await queryFn<any>(`
        SELECT COALESCE(SUM(i.amount_net), 0) as total
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE p.owner_id = ?
          AND i.type = 'PRODUCT'
          AND p.status = 'ZAKOŃCZONY'
          ${excludeProjectId ? 'AND p.id != ?' : ''}
    `, excludeProjectId ? [architectId, excludeProjectId] : [architectId]);
    return Number(res[0]?.total || 0);
}

// Aktualna stawka prowizji architekta wg programu partnerskiego (z ręcznym override admina).
export async function getArchitectCommissionRate(architectId: string, excludeProjectId?: string, queryFn: typeof query = query): Promise<number> {
    const [turnover, userRes] = await Promise.all([
        getQualifiedTurnover(architectId, excludeProjectId, queryFn),
        queryFn<any>("SELECT tier_override FROM users WHERE id = ?", [architectId]),
    ]);
    return getCommissionRateForTurnover(turnover, userRes[0]?.tier_override);
}

// Stawka użyta przy rozliczeniu projektu: najpierw stawka zapisana na prowizjach projektu
// (historyczna, nie zmienia się po awansie architekta), w razie braku — stawka bieżąca.
export async function getProjectCommissionRate(projectId: string, architectId: string, queryFn: typeof query = query): Promise<number> {
    const res = await queryFn<any>(
        "SELECT rate FROM commissions WHERE project_id = ? AND rate IS NOT NULL LIMIT 1",
        [projectId]
    );
    if (res.length > 0 && res[0].rate != null) return Number(res[0].rate);
    return getArchitectCommissionRate(architectId, projectId, queryFn);
}

// Zmiana kwoty pozycji wraz z korektą prowizji (PENDING lub wpis korygujący EARNED) i cashbacku.
// Z domyślnym `queryFn` zapis idzie we własnej transakcji; wywołujący, który przekazuje własny
// transakcyjny `queryFn`, sam odpowiada za transakcję (rdzeń nie otwiera wtedy zagnieżdżonej).
export async function updateItemAmountCore(itemId: string, amountNet: number, actor: ItemActor, queryFn: typeof query = query): Promise<void> {
    if (amountNet < 0) throw new Error("Kwota nie może być ujemna");

    // Get current item and project info
    const itemRes = await queryFn<any>(`
        SELECT i.*, p.status, p.owner_id 
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE i.id = ?
    `, [itemId]);

    if (itemRes.length === 0) throw new Error("Pozycja nie istnieje");
    const item = itemRes[0];
    const oldAmount = Number(item.amount_net);
    const projectId = item.project_id;
    const status = item.status;
    const ownerId = item.owner_id;

    // Odczyty stawek (poza transakcją) — nie zmieniają się w trakcie korekty.
    let pendingRate = 0;
    let projectRate = 0;
    if (status === 'PRZYJĘTY' || status === 'W_REALIZACJI') {
        // Zachowaj stawkę zapisaną na prowizji PENDING; dla starych rekordów bez stawki użyj bieżącej.
        const pendingRes = await queryFn<any>(
            "SELECT rate FROM commissions WHERE project_item_id = ? AND status = 'PENDING' LIMIT 1",
            [itemId]
        );
        pendingRate = pendingRes.length > 0 && pendingRes[0].rate != null
            ? Number(pendingRes[0].rate)
            : await getArchitectCommissionRate(ownerId, undefined, queryFn);
    } else if (status === 'ZAKOŃCZONY' && item.type === 'PRODUCT') {
        // Korekta pozycji rozliczonego projektu: prowizja liczona płaską stawką historyczną
        // projektu (zapisaną przy rozliczeniu) — zmiana statusu architekta nie zmienia stawki wstecz.
        projectRate = await getProjectCommissionRate(projectId, ownerId, queryFn);
    }

    // Korekta cashbacku w dół, której nie da się pokryć (architekt już wydał środki) — logowana po transakcji.
    let uncoveredCashback = 0;

    // 1 + 2. Aktualizacja pozycji oraz prowizji/cashbacku — atomowo w jednej transakcji.
    const applyCorrection = async (txQuery: typeof query) => {
        await txQuery("UPDATE project_items SET amount_net = ? WHERE id = ?", [amountNet, itemId]);

        if (status === 'PRZYJĘTY' || status === 'W_REALIZACJI') {
            // Prowizja planowana (PENDING) dotyczy wyłącznie pozycji PRODUCT; INSTALLATION nie generuje prowizji.
            if (item.type === 'PRODUCT') {
                const newCommAmount = amountNet * pendingRate;
                const pendingExisting = await txQuery<any>(
                    "SELECT id FROM commissions WHERE project_item_id = ? AND status = 'PENDING' LIMIT 1",
                    [itemId]
                );

                if (pendingExisting.length === 0) {
                    // Pozycja zgłoszona bez kwoty (0) — prowizja planowana powstaje dopiero przy wycenie.
                    if (newCommAmount > 0) {
                        await txQuery(
                            "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, rate, note) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)",
                            [`c_${uuidv4().substring(0, 8)}`, projectId, itemId, ownerId, newCommAmount, pendingRate, 'Wycena pozycji po akceptacji']
                        );
                    }
                } else if (newCommAmount > 0) {
                    await txQuery(
                        "UPDATE commissions SET amount_net = ?, rate = ?, note = ? WHERE project_item_id = ? AND status = 'PENDING'",
                        [newCommAmount, pendingRate, actor.note || 'Korekta kwoty', itemId]
                    );
                } else {
                    // Nowa kwota = 0 — usuwamy prowizję planowaną tej pozycji.
                    await txQuery(
                        "DELETE FROM commissions WHERE project_item_id = ? AND status = 'PENDING'",
                        [itemId]
                    );
                }
            }
        } else if (status === 'ZAKOŃCZONY' && item.type === 'PRODUCT') {
            const targetComm = amountNet * projectRate;

            // Suma WSZYSTKICH istniejących (rozliczonych) rekordów prowizji pozycji: EARNED + IN_PAYMENT + PAID
            // (rekord początkowy + dotychczasowe korekty). PENDING wykluczony. Bez IN_PAYMENT/PAID suma byłaby 0
            // po wypłacie i korekta wstawiłaby drugą pełną prowizję (podwójna wypłata).
            const existingCommRes = await txQuery<any>(
                "SELECT COALESCE(SUM(amount_net), 0) as total FROM commissions WHERE project_item_id = ? AND status IN ('EARNED', 'IN_PAYMENT', 'PAID')",
                [itemId]
            );
            const existingComm = Number(existingCommRes[0]?.total || 0);
            const diffComm = targetComm - existingComm;

            if (Math.abs(diffComm) > 0.001) {
                await txQuery(
                    "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, rate, note) VALUES (?, ?, ?, ?, ?, 'EARNED', ?, ?)",
                    [`c_${uuidv4().substring(0, 8)}`, projectId, itemId, ownerId, diffComm, projectRate, actor.note || 'Korekta kwoty (przeliczenie pozycji)']
                );
            }

            // Cashback: flat 2% delta for the edited item only
            const oldCashback = oldAmount * CASHBACK_RATE;
            const newCashback = amountNet * CASHBACK_RATE;
            const diffCashback = newCashback - oldCashback;

            if (diffCashback > 0.01) {
                const expiresAt = new Date();
                expiresAt.setFullYear(expiresAt.getFullYear() + 1);

                await txQuery(
                    "INSERT INTO wallet_transactions (id, user_id, type, amount, related_item_id, description, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [`t_${uuidv4().substring(0, 8)}`, ownerId, 'EARN', diffCashback, itemId, actor.note || 'Korekta: zwiększenie kwoty', formatSqlDateTime(expiresAt)]
                );
            } else if (diffCashback < -0.01) {
                // SPEND musi wskazywać na ID transakcji EARN (nie pozycji projektu) — robi to FIFO spendCashback.
                try {
                    await spendCashback(ownerId, Math.abs(diffCashback), actor.note || 'Korekta: pomniejszenie kwoty pozycji', itemId, txQuery);
                } catch (err) {
                    // Architekt już wydał cashback — nie przerywamy korekty, zgłaszamy niepokrytą różnicę.
                    if (err instanceof Error && err.message.includes('Insufficient cashback balance')) {
                        uncoveredCashback = Math.abs(diffCashback);
                    } else {
                        throw err;
                    }
                }
            }
        }
    };

    if (queryFn === query) {
        await withTransaction(applyCorrection);
    } else {
        await applyCorrection(queryFn);
    }

    if (uncoveredCashback > 0) {
        await logActivity(
            actor.actorId,
            'CASHBACK_CORRECTION_UNCOVERED',
            `Korekta pozycji ${itemId}: brak środków cashback na pokrycie pomniejszenia o ${uncoveredCashback} PLN (architekt wydał już cashback)`,
            { projectId, itemId, amount: uncoveredCashback }
        );
    }

    await logActivity(
        actor.actorId,
        'PROJECT_ITEM_VALUE_CHANGED',
        `Zmieniono wartość pozycji ${itemId} z ${oldAmount} PLN na ${amountNet} PLN`,
        { projectId, itemId, oldAmount, newAmount: amountNet, note: actor.note || null }
    );
}

// Nowa pozycja projektu wraz z prowizją wg statusu projektu: PRZYJĘTY/W_REALIZACJI → PENDING,
// ZAKOŃCZONY (tylko PRODUCT) → EARNED + cashback EARN. ZGŁOSZONY: sama pozycja.
export async function addItemCore(projectId: string, input: NewItemInput, actor: ItemActor, queryFn: typeof query = query): Promise<{ itemId: string }> {
    if (!input.category || !input.category.trim()) throw new Error("Kategoria pozycji jest wymagana.");
    if (typeof input.amount_net !== 'number' || !Number.isFinite(input.amount_net) || input.amount_net <= 0) {
        throw new Error("Kwota musi być większa od 0");
    }
    if (input.type !== 'PRODUCT' && input.type !== 'INSTALLATION') throw new Error("Nieprawidłowy typ pozycji.");

    const projRes = await queryFn<any>("SELECT status, owner_id FROM projects WHERE id = ?", [projectId]);
    if (projRes.length === 0) throw new Error("Projekt nie istnieje.");
    const { status, owner_id } = projRes[0];

    if (status === 'NIEZREALIZOWANY') {
        throw new Error("Nie można dodawać pozycji do projektu niezrealizowanego.");
    }

    const itemId = `i_${uuidv4().substring(0, 8)}`;
    await queryFn(
        "INSERT INTO project_items (id, project_id, type, category, description, amount_net, order_number, invoice_number, is_paid, source, subiekt_document_id, subiekt_position_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            itemId, projectId, input.type, input.category.trim(), input.description || null, input.amount_net,
            input.order_number || null, input.invoice_number || null, input.is_paid ? 1 : 0,
            input.source || 'MANUAL', input.subiekt_document_id ?? null, input.subiekt_position_id ?? null,
        ]
    );

    if (status === 'PRZYJĘTY' || status === 'W_REALIZACJI') {
        const rate = await getArchitectCommissionRate(owner_id, undefined, queryFn);
        const commAmount = input.amount_net * rate;
        if (commAmount > 0) {
            await queryFn(
                "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, rate, note) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)",
                [`c_${uuidv4().substring(0, 8)}`, projectId, itemId, owner_id, commAmount, rate, actor.note || 'Nowa pozycja po akceptacji']
            );
        }
    } else if (status === 'ZAKOŃCZONY' && input.type === 'PRODUCT') {
        // Immediate EARNED commission (historyczna stawka projektu) and EARN cashback
        const rate = await getProjectCommissionRate(projectId, owner_id, queryFn);
        const commAmount = input.amount_net * rate;

        if (commAmount > 0) {
            await queryFn(
                "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, rate, note) VALUES (?, ?, ?, ?, ?, 'EARNED', ?, ?)",
                [`c_${uuidv4().substring(0, 8)}`, projectId, itemId, owner_id, commAmount, rate, actor.note || 'Nowa pozycja po rozliczeniu']
            );
        }

        const cashbackAmount = input.amount_net * CASHBACK_RATE;
        if (cashbackAmount > 0) {
            const expiresAt = new Date();
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
            await queryFn(
                "INSERT INTO wallet_transactions (id, user_id, type, amount, related_item_id, description, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [`t_${uuidv4().substring(0, 8)}`, owner_id, 'EARN', cashbackAmount, itemId, actor.note || 'Cashback: nowa pozycja po rozliczeniu', formatSqlDateTime(expiresAt)]
            );
        }
    }

    await logActivity(
        actor.actorId,
        'PROJECT_ITEM_ADDED',
        `Dodano pozycję ${itemId} (${input.type}, ${input.amount_net} PLN) do projektu ${projectId}`,
        { projectId, itemId, type: input.type, amount: input.amount_net, note: actor.note || null }
    );

    return { itemId };
}

// Usunięcie pozycji. W projekcie ZAKOŃCZONY pozycja zostaje i jest korygowana do 0 (wpisy korygujące
// prowizję i cashback); w pozostałych statusach znika razem z prowizją PENDING. Brak pozycji = no-op.
export async function deleteItemCore(itemId: string, actor: ItemActor, queryFn: typeof query = query): Promise<void> {
    const itemRes = await queryFn<any>(`
        SELECT i.*, p.status, p.owner_id 
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE i.id = ?
    `, [itemId]);
    if (itemRes.length === 0) return;

    const item = itemRes[0];
    const projectId = item.project_id;
    const status = item.status;

    if (status === 'ZAKOŃCZONY') {
        // Adjust amount to 0 — generates correction entries for commission and cashback
        await updateItemAmountCore(itemId, 0, { actorId: actor.actorId, note: actor.note || 'Usunięcie pozycji (korekta do 0)' }, queryFn);
        return;
    }

    // For other statuses, we can delete and also cleanup PENDING commissions
    await queryFn("DELETE FROM commissions WHERE project_item_id = ? AND status = 'PENDING'", [itemId]);
    await queryFn("DELETE FROM project_items WHERE id = ?", [itemId]);

    await logActivity(
        actor.actorId,
        'PROJECT_ITEM_DELETED',
        `Usunięto pozycję ${itemId} (${item.amount_net} PLN) z projektu ${projectId}`,
        { projectId, itemId, amount: item.amount_net, note: actor.note || null }
    );
}
