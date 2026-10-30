import test from 'node:test';
import assert from 'node:assert/strict';
import * as queries from '../src/queries.ts';

/** Każdy tekst SQL z queries.ts (funkcje wywołane z przykładową listą IN). */
function allSql(): string[] {
    return Object.entries(queries)
        .filter(([name]) => name.startsWith('SQL_') || name.startsWith('sql'))
        .map(([, value]) => (typeof value === 'function' ? (value as (inList: string) => string)('@id0') : String(value)));
}

test('każda kolumna GT użyta w SQL (dok_, ob_, tw_, kh_, adrh_, adr_, nzf_, kat_) jest w REQUIRED_COLUMNS, więc sprawdza ją sonda', () => {
    const required = new Set(Object.values(queries.REQUIRED_COLUMNS).flat().map((c) => c.toLowerCase()));
    const tables = new Set(Object.keys(queries.REQUIRED_COLUMNS).map((t) => t.toLowerCase()));
    const used = new Set<string>();
    for (const text of allSql()) {
        for (const match of text.matchAll(/\b(?:dok|ob|tw|kh|adrh|adr|nzf|kat)_[A-Za-z]+\b/g)) used.add(match[0]);
    }
    const missing = [...used].filter((token) => !tables.has(token.toLowerCase()) && !required.has(token.toLowerCase()));
    assert.ok(used.size > 30, `znaleziono ${used.size} kolumn`);
    assert.deepEqual(missing, []);
});

test('każda tabela z FROM / JOIN jest w REQUIRED_COLUMNS', () => {
    const tables = new Set(Object.keys(queries.REQUIRED_COLUMNS).map((t) => t.toLowerCase()));
    const used = new Set<string>();
    for (const text of allSql()) {
        for (const match of text.matchAll(/\b(?:FROM|JOIN)\s+dbo\.(\w+)/gi)) used.add(match[1] as string);
    }
    assert.deepEqual([...used].filter((t) => !tables.has(t.toLowerCase())), []);
});
