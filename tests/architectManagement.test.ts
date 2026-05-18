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

test('admin architect list exposes delete action only when account has no business history', async () => {
    const pageSource = await readFile(new URL('../src/app/dashboard/admin/architects/page.tsx', import.meta.url), 'utf8');
    const listSource = await readFile(new URL('../src/components/ArchitectList.tsx', import.meta.url), 'utf8');

    assert.match(pageSource, /has_business_history/);
    assert.match(pageSource, /commissionCount/);
    assert.match(listSource, /Trash2/);
    assert.match(listSource, /deleteArchitect/);
    assert.match(listSource, /archi\.has_business_history/);
    assert.match(listSource, /Nie można usunąć konta z historią projektów lub rozliczeń/);
});

test('architect detail delete copy matches backend history guard', async () => {
    const source = await readFile(new URL('../src/app/dashboard/admin/architects/[id]/ArchitectDataCard.tsx', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /Projekty i historia finansowa pozostaną w systemie/);
    assert.match(source, /Usunięcie jest możliwe tylko dla kont bez projektów i rozliczeń/);
});
