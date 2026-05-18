import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('admin dashboard makes the project pipeline the primary operational surface', async () => {
    const source = await readFile(new URL('../src/app/dashboard/admin/page.tsx', import.meta.url), 'utf8');

    assert.match(source, /AdminProjectPipeline/);
    assert.doesNotMatch(source, /DashboardBottomTabs/);
    assert.match(source, /Partnerzy/);
    assert.match(source, /Pomoc kontekstowa/);
});

test('admin project pipeline uses kanban columns, drawer details, and 90 day inactive window', async () => {
    const source = await readFile(new URL('../src/admin/components/AdminProjectPipeline.tsx', import.meta.url), 'utf8');

    assert.match(source, /RECENT_INACTIVE_DAYS\s*=\s*90/);
    assert.match(source, /selectedProject/);
    assert.match(source, /ProjectDrawer/);
    assert.match(source, /Otwórz pełny projekt/);
    assert.match(source, /xl:grid-cols-5/);
    assert.doesNotMatch(source, /<table/);
});

test('project finalization records who completed the project and when', async () => {
    const actionSource = await readFile(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');
    const migrationSource = await readFile(new URL('../migrations/015_project_completion_audit.sql', import.meta.url), 'utf8');

    assert.match(actionSource, /completed_by = \?/);
    assert.match(actionSource, /completed_at = CURRENT_TIMESTAMP/);
    assert.match(actionSource, /completion_note = \?/);
    assert.match(migrationSource, /completed_by/);
    assert.match(migrationSource, /completed_at/);
    assert.match(migrationSource, /completion_note/);
});
