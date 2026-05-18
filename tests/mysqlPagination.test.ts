import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin activity avoids MySQL prepared placeholders in LIMIT clause', async () => {
    const source = await readFile(new URL('../src/lib/services.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export async function getAdminActivity');
    const end = source.indexOf('\n}', start) + 2;
    const functionSource = source.slice(start, end);

    assert.ok(start > -1);
    assert.doesNotMatch(functionSource, /LIMIT \?/);
    assert.match(functionSource, /Number\.isFinite/);
    assert.match(functionSource, /Math\.trunc/);
});

test('admin pipeline avoids MySQL prepared placeholders in LIMIT and OFFSET clauses', async () => {
    const source = await readFile(new URL('../src/app/api/admin/pipeline/route.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /LIMIT \? OFFSET \?/);
    assert.match(source, /safePage/);
    assert.match(source, /safeLimit/);
    assert.match(source, /safeOffset/);
});
