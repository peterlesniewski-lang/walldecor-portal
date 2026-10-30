// Kody architektów do pola „Uwagi” ZK w Subiekcie GT (`#A-001`), PLAN-SUBIEKT-2026-10-29.md, Loop 4b.
// Kod automatyczny: `A-` + numer dopełniony zerami do 3 cyfr (A-001 … A-999, dalej A-1000), kolejny po
// największym numerze spośród kodów `^A-(\d+)$` (luki nie są wypełniane). Kod wpisany ręcznie w modalu
// „Edytuj dane” wygrywa (updateArchitectAdminFields) — jeśli pasuje do wzorca, następny automatyczny idzie po nim.
//
// Współbieżność: nextSubiektCode czyta maksimum z `FOR UPDATE` i musi być wołany w transakcji, w której kod
// zostanie zapisany (inaczej rzuca). To NIE serializuje równoległych zapisów: na MySQL, gdy nie ma jeszcze
// żadnego kodu `A-…` (albo dwa zapisy trafią w tę samą lukę), obie transakcje dostają zgodne blokady luki,
// liczą ten sam kod i jedna kończy się deadlockiem (1213) albo duplikatem na unikalnym indeksie
// idx_users_subiekt_code (1062, migracja 019). Dlatego tworzenie konta z kodem idzie przez
// withSubiektCodeRetry: jedna powtórka całej transakcji, a utrzymujący się konflikt kodu → polski komunikat.
import { inTransaction, query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/services";
import { AUTO_CODE_PATTERN, formatSubiektCode } from "./codeFormat";

export { formatSubiektCode };

/** Największy numer kodu automatycznego w `users` (0, gdy brak) — w bieżącej transakcji, z blokadą. */
async function maxAutoCodeNumber(): Promise<number> {
    const rows = await query<{ subiekt_code: string | null }>(
        "SELECT subiekt_code FROM users WHERE subiekt_code LIKE 'A-%' FOR UPDATE"
    );
    let max = 0;
    for (const row of rows) {
        const match = AUTO_CODE_PATTERN.exec(String(row.subiekt_code ?? ''));
        if (match) max = Math.max(max, Number(match[1]));
    }
    return max;
}

/** Następny wolny kod architekta. Tylko w transakcji, w której kod zostanie zapisany (inaczej rzuca). */
export async function nextSubiektCode(): Promise<string> {
    if (!inTransaction()) {
        throw new Error("nextSubiektCode: wywołanie poza transakcją — kod musi być zapisany w tej samej transakcji.");
    }
    return formatSubiektCode((await maxAutoCodeNumber()) + 1);
}

export const SUBIEKT_CODE_COLLISION_MESSAGE =
    'Nie udało się nadać kodu architekta — w tej samej chwili zapisano inne konto. Spróbuj ponownie.';

type DbError = { errno?: number; code?: string; message?: string; sqlMessage?: string };

function isDeadlock(err: DbError): boolean {
    return err?.errno === 1213 || err?.code === 'ER_LOCK_DEADLOCK';
}

/** Duplikat na users.subiekt_code (MySQL 1062 na idx_users_subiekt_code, SQLite UNIQUE). Inne duplikaty (e-mail) — nie. */
function isDuplicateCode(err: DbError): boolean {
    const duplicate = err?.errno === 1062 || err?.code === 'ER_DUP_ENTRY' || err?.code === 'SQLITE_CONSTRAINT_UNIQUE';
    return duplicate && /subiekt_code/.test(`${err?.sqlMessage ?? ''} ${err?.message ?? ''}`);
}

/**
 * Transakcja zapisu z kodem architekta: przy deadlocku (1213) lub duplikacie kodu (1062) jedna powtórka
 * całej transakcji; utrzymujący się konflikt → SUBIEKT_CODE_COLLISION_MESSAGE zamiast tekstu z bazy.
 * Wewnątrz cudzej transakcji nie powtarza (zewnętrzna została wycofana / decyduje wywołujący).
 */
export async function withSubiektCodeRetry<T>(work: (txQuery: typeof query) => Promise<T>): Promise<T> {
    const retryAllowed = !inTransaction();
    for (let attempt = 1; ; attempt++) {
        try {
            return await withTransaction(work);
        } catch (err) {
            const conflict = isDeadlock(err as DbError) || isDuplicateCode(err as DbError);
            if (!conflict || !retryAllowed) throw err;
            if (attempt < 2) continue;
            throw new Error(SUBIEKT_CODE_COLLISION_MESSAGE);
        }
    }
}

const MISSING_CODE_WHERE = "role = 'ARCHI' AND (subiekt_code IS NULL OR subiekt_code = '')";

/** Liczba kont architektów bez kodu (przycisk „Nadaj brakujące kody” na liście architektów). */
export async function countArchitectsWithoutCode(): Promise<number> {
    const rows = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE ${MISSING_CODE_WHERE}`);
    return Number(rows[0]?.n ?? 0);
}

/**
 * Nadaje kody wszystkim architektom bez kodu, w kolejności `created_at`, potem `name`. Jedna transakcja;
 * wpis SUBIEKT_CODES_ASSIGNED z liczbą nadanych (tylko gdy coś nadano). Uprawnienie sprawdza akcja.
 */
export async function assignMissingSubiektCodesOp(actorId: string): Promise<{ assigned: number }> {
    return withSubiektCodeRetry(async (txQuery) => {
        let next = (await maxAutoCodeNumber()) + 1;
        const missing = await txQuery<{ id: string }>(
            `SELECT id FROM users WHERE ${MISSING_CODE_WHERE} ORDER BY created_at ASC, name ASC, id ASC FOR UPDATE`
        );
        const assignedCodes: Array<{ id: string; code: string }> = [];
        for (const { id } of missing) {
            const code = formatSubiektCode(next++);
            await txQuery("UPDATE users SET subiekt_code = ? WHERE id = ?", [code, id]);
            assignedCodes.push({ id, code });
        }
        if (assignedCodes.length > 0) {
            const first = assignedCodes[0].code;
            const last = assignedCodes[assignedCodes.length - 1].code;
            await logActivity(
                actorId,
                'SUBIEKT_CODES_ASSIGNED',
                `Nadano kody Subiekt ${assignedCodes.length} architektom (${first === last ? first : `${first} … ${last}`})`,
                { assigned: assignedCodes.length, codes: assignedCodes }
            );
        }
        return { assigned: assignedCodes.length };
    });
}
