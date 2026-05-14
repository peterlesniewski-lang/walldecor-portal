import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('architect deletion checks dependent business records before deleting the user', async () => {
    const source = await readFile(new URL('../src/app/actions/architects.ts', import.meta.url), 'utf8');
    const actionStart = source.indexOf('export async function deleteArchitect');
    const actionEnd = source.indexOf('export async function getAllArchitectNames', actionStart);
    const actionSource = source.slice(actionStart, actionEnd);

    assert.ok(actionStart > -1);
    assert.match(actionSource, /SELECT COUNT\(\*\) as count FROM projects WHERE owner_id = \?/);
    assert.match(actionSource, /SELECT COUNT\(\*\) as count FROM commissions WHERE architect_id = \?/);
    assert.match(actionSource, /Nie można usunąć architekta z historią projektów lub rozliczeń/);
    assert.match(actionSource, /DELETE FROM users WHERE id = \? AND role = 'ARCHI'/);
});
