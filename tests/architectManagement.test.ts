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

test('admin fields action normalises and guards the architect Subiekt code', async () => {
    const source = await readFile(new URL('../src/app/actions/architects.ts', import.meta.url), 'utf8');
    const actionStart = source.indexOf('export async function updateArchitectAdminFields');
    const actionEnd = source.indexOf('export async function updateProfile', actionStart);
    const actionSource = source.slice(actionStart, actionEnd);
    const normalizerStart = source.indexOf('function normalizeSubiektCode');
    const normalizerSource = source.slice(normalizerStart, actionStart);

    assert.ok(actionStart > -1 && normalizerStart > -1);
    // normalizacja: trim + uppercase, pusty → NULL, dozwolone znaki i długość
    assert.match(normalizerSource, /\.trim\(\)\.toUpperCase\(\)/);
    assert.match(normalizerSource, /if \(!code\) return null/);
    assert.match(source, /\/\^\[A-Z0-9_-\]\{1,64\}\$\//);
    // unikalność i uprawnienie ADMIN
    assert.match(actionSource, /role !== 'ADMIN'/);
    assert.match(actionSource, /SELECT id FROM users WHERE subiekt_code = \? AND id != \?/);
    assert.match(actionSource, /Ten kod ma już inny architekt\./);
    assert.match(actionSource, /UPDATE users SET subiekt_code = \? WHERE id = \?/);
    assert.match(actionSource, /logActivity\(/);
    // pole pominięte nie nadpisuje statusu partnerskiego
    assert.match(actionSource, /data\.tier_override !== undefined/);
});

test('edit architect modal saves and reloads the Subiekt code', async () => {
    const modal = await readFile(new URL('../src/components/EditArchitectModal.tsx', import.meta.url), 'utf8');
    const card = await readFile(new URL('../src/app/dashboard/admin/architects/[id]/ArchitectDataCard.tsx', import.meta.url), 'utf8');

    assert.match(modal, /Kod w Subiekcie/);
    assert.match(modal, /Wartość pola własnego «Architekt» w Subiekcie, np\. A-001\. Dokumenty z tym kodem trafiają do tego architekta\./);
    assert.match(modal, /subiekt_code: data\.subiekt_code \|\| ''/);
    assert.match(modal, /updateArchitectAdminFields\(architectId, \{ subiekt_code \}\)/);
    assert.match(card, /Kod w Subiekcie/);
    assert.match(card, /architect\.subiekt_code/);
});
