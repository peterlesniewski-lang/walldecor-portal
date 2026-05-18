import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('architect dashboard follows the P2B operational layout', async () => {
    const source = await readFile(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8');

    assert.match(source, /data-testid="architect-dashboard"/);
    assert.match(source, /Prowizja dostępna/);
    assert.match(source, /Cashback/);
    assert.match(source, /Aktywne projekty/);
    assert.match(source, /DashboardPipeline/);
    assert.match(source, /Historia portfela/);
    assert.match(source, /Następne kroki/);
    assert.match(source, /Poziomy prowizji/);
    assert.match(source, /Twój poziom/);
    assert.match(source, /tierProgressLabel/);
    assert.match(source, /Cashback 2%/);
});

test('architect next steps are actionable links instead of passive rows', async () => {
    const source = await readFile(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8');

    assert.match(source, /nextSteps/);
    assert.match(source, /href: '\/dashboard\/wallet'/);
    assert.match(source, /href: '\/dashboard\/projects'/);
    assert.match(source, /href: '\/dashboard\/help'/);
});

test('architect pipeline keeps the five-stage kanban contract', async () => {
    const source = await readFile(new URL('../src/components/DashboardPipeline.tsx', import.meta.url), 'utf8');

    assert.match(source, /STATUS_ORDER/);
    assert.match(source, /grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5/);
    assert.match(source, /Zobacz wszystkie projekty/);
    assert.match(source, /\/dashboard\/projects\/\$\{project\.id\}/);
});
