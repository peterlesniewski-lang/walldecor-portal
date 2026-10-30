// Porównanie wymaganych kolumn (queries.ts REQUIRED_COLUMNS) z INFORMATION_SCHEMA. Czyste funkcje.

export interface ColumnRow {
    TABLE_NAME: string;
    COLUMN_NAME: string;
}

export interface MissingColumn {
    table: string;
    /** null = brak całej tabeli. */
    column: string | null;
    /** Najbliższe istniejące nazwy (kolumny tej tabeli albo — dla braku tabeli — tabele bazy). */
    suggestions: string[];
}

function distance(a: string, b: string): number {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
    for (let i = 1; i <= x.length; i++) {
        const current = [i];
        for (let j = 1; j <= y.length; j++) {
            const cost = x[i - 1] === y[j - 1] ? 0 : 1;
            current[j] = Math.min((previous[j] as number) + 1, (current[j - 1] as number) + 1, (previous[j - 1] as number) + cost);
        }
        previous = current;
    }
    return previous[y.length] as number;
}

/** Do 3 nazw najbliższych `name`: zawierające ją (lub zawarte w niej) albo w odległości edycyjnej ≤ 1/3 długości. */
export function closestNames(name: string, candidates: string[], limit = 3): string[] {
    const lower = name.toLowerCase();
    return candidates
        .map((candidate) => {
            const c = candidate.toLowerCase();
            const contains = c.includes(lower) || lower.includes(c);
            return { candidate, score: contains ? 0 : distance(name, candidate) };
        })
        .filter((entry) => entry.score <= Math.max(2, Math.ceil(name.length / 3)))
        .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
        .slice(0, limit)
        .map((entry) => entry.candidate);
}

/** Braki w kolejności `required`; nazwy porównywane bez wielkości liter (kolacja bazy GT jest CI). */
export function findMissingColumns(
    required: Readonly<Record<string, readonly string[]>>,
    actual: ColumnRow[],
    allTables: string[] = [],
): MissingColumn[] {
    const byTable = new Map<string, string[]>();
    for (const row of actual) {
        const key = row.TABLE_NAME.toLowerCase();
        byTable.set(key, [...(byTable.get(key) ?? []), row.COLUMN_NAME]);
    }
    const missing: MissingColumn[] = [];
    for (const [table, columns] of Object.entries(required)) {
        const present = byTable.get(table.toLowerCase());
        if (!present) {
            missing.push({ table, column: null, suggestions: closestNames(table, allTables) });
            continue;
        }
        const presentLower = new Set(present.map((c) => c.toLowerCase()));
        for (const column of columns) {
            if (!presentLower.has(column.toLowerCase())) {
                missing.push({ table, column, suggestions: closestNames(column, present) });
            }
        }
    }
    return missing;
}
