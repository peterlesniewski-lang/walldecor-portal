import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('updateProjectItem inserts a missing PENDING product commission after pricing an accepted project', () => {
    const source = readFileSync(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export async function updateProjectItem');
    const end = source.indexOf('export async function addProjectItem');
    const updateProjectItemSource = source.slice(start, end);

    assert.match(updateProjectItemSource, /item\.type === 'PRODUCT'/);
    assert.match(updateProjectItemSource, /pendingRes\.length > 0/);
    assert.match(updateProjectItemSource, /else if \(newCommAmount > 0\)/);
    assert.match(updateProjectItemSource, /INSERT INTO commissions[\s\S]*'PENDING'/);
});
