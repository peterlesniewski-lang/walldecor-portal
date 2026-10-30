// Loop 5b (PLAN-SUBIEKT-2026-10-29.md): UI uzgodnienia faktur z zamówieniem — testy źródłowe stron i komponentów
// (wymagają sesji next-auth i renderu Next.js) oraz czyste pomocniki formularza z labels.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
type LabelsModule = typeof import('../src/lib/subiekt/labels');
const { parseAmountInput, reconciliationTotal, subiektBadgeLabel }: LabelsModule =
    await import(new URL('../src/lib/subiekt/labels.ts', import.meta.url).href);

const src = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
const PROJECT_DIR = 'app/dashboard/admin/projects/[id]';

test('parseAmountInput: Polish and dot decimals, spaces, at most 2 places, no negatives', () => {
    assert.equal(parseAmountInput('600'), 600);
    assert.equal(parseAmountInput('536,59'), 536.59);
    assert.equal(parseAmountInput(' 1 200.5 '), 1200.5);
    assert.equal(parseAmountInput('1 200,00'), 1200);
    assert.equal(parseAmountInput('0'), 0);
    assert.equal(parseAmountInput(''), null);
    assert.equal(parseAmountInput('-5'), null);
    assert.equal(parseAmountInput('1,234'), null);
    assert.equal(parseAmountInput('abc'), null);
});

test('reconciliationTotal: live sum and whether it equals the invoiced amount', () => {
    assert.deepEqual(reconciliationTotal(['600', '300'], 900), { total: 900, matches: true, valid: true });
    assert.deepEqual(reconciliationTotal(['536,59', '300'], 900), { total: 836.59, matches: false, valid: true });
    assert.deepEqual(reconciliationTotal(['600', 'x'], 900), { total: null, matches: false, valid: false });
    assert.deepEqual(reconciliationTotal(['0.1', '0.2'], 0.3), { total: 0.3, matches: true, valid: true });
});

test('subiektBadgeLabel: unassigned + reconciliations in one badge with a separate label', () => {
    assert.equal(subiektBadgeLabel(2, 1), 'Subiekt: nieprzypisane dokumenty 2 + uzgodnienia faktur 1');
    assert.equal(subiektBadgeLabel(0, 0), 'Subiekt: nieprzypisane dokumenty 0 + uzgodnienia faktur 0');
});

test('ReconciliationCard: one form, live sum, save only when the sum matches, result.error shown, refresh after save', async () => {
    const card = await src(`${PROJECT_DIR}/ReconciliationCard.tsx`);
    assert.ok(card.startsWith("'use client';"));
    assert.match(card, /import \{ resolveReconciliationAction \} from '@\/app\/actions\/subiekt'/);
    assert.match(card, /resolveReconciliationAction\(projectId, reconciliation\.rootExternalId,/);
    assert.match(card, /reconciliationTotal\(/);
    assert.match(card, /disabled=\{!sum\.matches \|\| saving\}/);
    assert.match(card, /Zapisz uzgodnienie/);
    assert.match(card, /setError\(result\.error\)/);
    assert.match(card, /router\.refresh\(\)/);
    assert.match(card, /maxLength=\{500\}/);
    for (const text of ['Kwota z ZK', 'Kwota faktur', 'Różnica']) assert.ok(card.includes(text), text);
});

test('admin project page: reconciliation data from the read model, card above the items, banner with reason', async () => {
    const page = await src(`${PROJECT_DIR}/page.tsx`);
    assert.match(page, /getProjectReconciliations\(id\)/);
    assert.match(page, /getSuggestedStatus\(id\)/);
    assert.match(page, /reason=\{suggestion\.reason\}/);
    const client = await src(`${PROJECT_DIR}/AdminProjectDetailClient.tsx`);
    const cardAt = client.indexOf('<ReconciliationCard');
    assert.ok(cardAt !== -1 && cardAt < client.indexOf('<ItemsCard'), 'karta nad pozycjami');
    assert.match(client, /r\.status === 'OPEN'/);
    assert.match(client, /canChangeStatus &&/);

    const banner = await src(`${PROJECT_DIR}/SuggestedStatusBanner.tsx`);
    assert.match(banner, /reason === 'RECONCILE_OPEN'/);
    assert.match(banner, /Najpierw uzgodnij faktury z zamówieniem/);
});

test('documents card links a resolved reconciliation to the history card', async () => {
    const card = await src(`${PROJECT_DIR}/SubiektDocumentsCard.tsx`);
    assert.match(card, /Faktury uzgodnione ręcznie/);
    assert.match(card, /href="#zmiany-subiekt"/);
    const changes = await src('components/SubiektChangesCard.tsx');
    assert.match(changes, /id="zmiany-subiekt"/);
    assert.match(changes, /change\.author \?\? SUBIEKT_AUTHOR_LABEL/);
});

test('integrations page: "Do uzgodnienia (n)" with links to projects; badge counts both', async () => {
    const page = await src('app/dashboard/admin/integrations/subiekt/page.tsx');
    assert.match(page, /getOpenReconciliations\(\)/);
    assert.match(page, /Do uzgodnienia \(\$\{reconciliations\.length\}\)/);
    assert.match(page, /href=\{`\/dashboard\/admin\/projects\/\$\{r\.projectId\}`\}/);
    const layout = await src('app/dashboard/layout.tsx');
    assert.match(layout, /getOpenReconciliationCount\(\)/);
    assert.match(layout, /subiektReconciliationCount=\{subiektReconciliationCount\}/);
    const sidebar = await src('components/Sidebar.tsx');
    assert.match(sidebar, /count: subiektUnassignedCount \+ subiektReconciliationCount/);
    assert.match(sidebar, /subiektBadgeLabel\(subiektUnassignedCount, subiektReconciliationCount\)/);
});

test('architect project page: "Faktury w uzgadnianiu" without invoice amounts, neutral history', async () => {
    const page = await src('app/dashboard/projects/[id]/page.tsx');
    assert.match(page, /getProjectZkChanges\(id, 'ARCHITECT'\)/);
    assert.match(page, /hasOpenReconciliation\(id\)/);
    const client = await src('components/ProjectDetailClient.tsx');
    assert.match(client, /Faktury w uzgadnianiu/);
    assert.ok(!client.includes('invoicedNet') && !client.includes('getProjectReconciliations'));
});

test('status changes from the UI handle the { success: false, error } result of updateProjectStatus', async () => {
    for (const file of [`${PROJECT_DIR}/ProjectStatusCard.tsx`, 'admin/components/AdminProjectPipeline.tsx', 'components/AdminProjectListItem.tsx']) {
        const source = await src(file);
        assert.match(source, /const result = await updateProjectStatus\(/, file);
        assert.match(source, /if \(!result\.success\)/, file);
    }
});
