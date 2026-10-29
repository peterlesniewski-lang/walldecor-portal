// Blokada edycji ręcznej pozycji z Subiekta (PLAN-SUBIEKT-2026-10-29.md, Loop 3, Krok 3). Test źródłowy:
// akcje wymagają sesji next-auth, więc sprawdzamy, że każdy wrapper woła blokadę przed rdzeniem / UPDATE-em.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const MESSAGE = 'Pozycja pochodzi z Subiekta i nie podlega edycji ręcznej.';
const loadSource = () => readFile(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');

/** Treść funkcji od jej deklaracji do następnego `export async function` (lub końca pliku). */
function functionBody(source: string, name: string): string {
    const start = source.indexOf(`export async function ${name}(`);
    assert.notEqual(start, -1, `brak ${name}`);
    const next = source.indexOf('export async function ', start + 1);
    return source.slice(start, next === -1 ? undefined : next);
}

test('assertManualItem reads project_items.source and throws the exact message for SUBIEKT', async () => {
    const source = await loadSource();
    const start = source.indexOf('async function assertManualItem(');
    assert.notEqual(start, -1);
    const helper = source.slice(start, source.indexOf('\n}\n', start));
    assert.match(helper, /SELECT source FROM project_items WHERE id = \?/);
    assert.match(helper, /source === 'SUBIEKT'/);
    assert.ok(helper.includes(`throw new Error("${MESSAGE}")`));
});

for (const [name, coreCall] of [
    ['updateProjectItem', 'updateItemAmountCore('],
    ['deleteProjectItem', 'deleteItemCore('],
    ['updateProjectItemMeta', 'UPDATE project_items SET order_number'],
] as const) {
    test(`${name} checks the Subiekt lock after auth and before writing`, async () => {
        const body = functionBody(await loadSource(), name);
        const auth = body.indexOf('Unauthorized');
        const lock = body.indexOf('await assertManualItem(itemId)');
        const write = body.indexOf(coreCall);
        assert.ok(auth !== -1 && lock !== -1 && write !== -1, `${name}: brak sesji, blokady lub zapisu`);
        assert.ok(auth < lock && lock < write, `${name}: kolejność sesja → blokada → zapis`);
    });
}

test('core in projectItems.ts stays lock-free (the sync uses it for SUBIEKT items)', async () => {
    const core = await readFile(new URL('../src/lib/projectItems.ts', import.meta.url), 'utf8');
    assert.ok(!core.includes(MESSAGE));
});
