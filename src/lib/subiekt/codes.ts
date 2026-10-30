// Kody architektów do pola „Uwagi” ZK w Subiekcie GT (`#A-001`), PLAN-SUBIEKT-2026-10-29.md, Loop 4b.
// Kod automatyczny: `A-` + numer dopełniony zerami do 3 cyfr (A-001 … A-999, dalej A-1000), kolejny po
// największym numerze spośród kodów `^A-(\d+)$` (luki nie są wypełniane). Kod wpisany ręcznie w modalu
// „Edytuj dane” wygrywa (updateArchitectAdminFields) — jeśli pasuje do wzorca, następny automatyczny idzie po nim.
//
// Współbieżność: odczyt maksimum idzie w transakcji z `FOR UPDATE` (na MySQL blokuje zakres indeksu
// idx_users_subiekt_code do końca transakcji wywołującego), a unikalny indeks na users.subiekt_code
// (migracja 019) odrzuca duplikat, gdyby dwa zapisy jednak się przeplotły. Wywołujący zapisuje kod
// w TEJ SAMEJ transakcji (withTransaction jest re-entrant), inaczej blokada nic nie daje.
import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/services";

const AUTO_CODE_PATTERN = /^A-(\d+)$/;

export function formatSubiektCode(n: number): string {
    return `A-${String(n).padStart(3, '0')}`;
}

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

/** Następny wolny kod architekta. Wołać w transakcji, w której kod zostanie zapisany. */
export async function nextSubiektCode(): Promise<string> {
    return withTransaction(async () => formatSubiektCode((await maxAutoCodeNumber()) + 1));
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
    return withTransaction(async (txQuery) => {
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
