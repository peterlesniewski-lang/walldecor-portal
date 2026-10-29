// Panel admina integracji Subiekt (PLAN-SUBIEKT-2026-10-29.md, Loop 4B): testy źródłowe stron i komponentów
// (wymagają sesji next-auth i renderu Next.js) oraz test jednostkowy etykiet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

type LabelsModule = typeof import('../src/lib/subiekt/labels');
const { assignmentReasonLabel, documentsLabel, formatDocDate, syncRunStatusEntry }: LabelsModule =
    await import(new URL('../src/lib/subiekt/labels.ts', import.meta.url).href);

const src = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

const INTEGRATION_DIR = 'app/dashboard/admin/integrations/subiekt';
const PROJECT_DIR = 'app/dashboard/admin/projects/[id]';

test('integrations page: operational permission from rbac, data from read models', async () => {
    const page = await src(`${INTEGRATION_DIR}/page.tsx`);
    assert.ok(page.includes("import { canManageOperationalProjects } from '@/lib/rbac'"));
    assert.ok(page.includes('!canManageOperationalProjects(session.user.role)'));
    for (const fn of ['getRecentSyncRuns', 'getUnassignedCount', 'getUnassignedDocuments', 'getUnknownArchitectCodes', 'getArchitectOptions']) {
        assert.ok(page.includes(`${fn}(`), `brak ${fn}`);
    }
    assert.ok(!page.includes("'use client'"), 'strona jest komponentem serwerowym');
    assert.ok(!/\bon[A-Z]\w*=\{/.test(page), 'komponent serwerowy bez handlerów zdarzeń');
});

test('shell header names the integrations page', async () => {
    const { resolveShellTitle }: typeof import('../src/lib/shellTitle') =
        await import(new URL('../src/lib/shellTitle.ts', import.meta.url).href);
    assert.equal(resolveShellTitle('/dashboard/admin/integrations/subiekt', true).title, 'Integracja Subiekt');
});

test('inbox client calls the three server actions', async () => {
    const inbox = await src(`${INTEGRATION_DIR}/SubiektInboxClient.tsx`);
    for (const action of ['assignDocumentToProject(', 'createProjectFromDocument(', 'ignoreDocument(']) {
        assert.ok(inbox.includes(action), `brak ${action}`);
    }
    assert.ok(inbox.includes('router.refresh()'));
    assert.ok(inbox.includes('ErrorBanner'));
});

test('sidebar: Subiekt link with unassigned badge, count computed in the server layout', async () => {
    const sidebar = await src('components/Sidebar.tsx');
    const layout = await src('app/dashboard/layout.tsx');
    assert.ok(sidebar.includes("href: '/dashboard/admin/integrations/subiekt'"));
    assert.ok(sidebar.includes('subiektUnassignedCount'));
    assert.ok(layout.includes('getUnassignedCount()'));
    assert.ok(layout.includes('canManageOperationalProjects(session.user.role)'));
    assert.ok(layout.includes('subiektUnassignedCount={subiektUnassignedCount}'));
});

test('ItemRow: type override through overrideItemType, behind a permission prop', async () => {
    const row = await src(`${PROJECT_DIR}/ItemRow.tsx`);
    assert.ok(row.includes("import { overrideItemType } from '@/app/actions/subiekt'"));
    assert.ok(row.includes('overrideItemType(item.id, nextType)'));
    assert.ok(row.includes('canOverrideType'));
    assert.ok(row.includes('typ zmieniony ręcznie'));
});

test('admin project page: suggested status, documents card, permissions from rbac', async () => {
    const page = await src(`${PROJECT_DIR}/page.tsx`);
    const client = await src(`${PROJECT_DIR}/AdminProjectDetailClient.tsx`);
    assert.ok(page.includes('computeSuggestedStatus'));
    assert.ok(page.includes('getProjectSubiektSummary'));
    assert.ok(page.includes('SuggestedStatusBanner'));
    assert.ok(page.includes('canManageFinancialOperations(session.user.role)'));
    assert.ok(page.includes('canManageOperationalProjects(session.user.role)'));
    assert.ok(client.includes("import SubiektDocumentsCard from './SubiektDocumentsCard'"));
    assert.ok(client.includes('MergeProjectsCard'));
    const banner = await src(`${PROJECT_DIR}/SuggestedStatusBanner.tsx`);
    assert.ok(banner.includes('applySuggestedStatus(projectId)'));
    const docs = await src(`${PROJECT_DIR}/SubiektDocumentsCard.tsx`);
    assert.ok(docs.includes('moveDocumentToProject(root.id, target.id)'));
    const merge = await src(`${PROJECT_DIR}/MergeProjectsCard.tsx`);
    assert.ok(merge.includes('mergeProjects(projectId, chosen.map((c) => c.id))'));
});

test('new client components take permissions as props (no role string literals)', async () => {
    const files = [
        `${INTEGRATION_DIR}/SubiektInboxClient.tsx`,
        `${PROJECT_DIR}/SubiektDocumentsCard.tsx`,
        `${PROJECT_DIR}/MergeProjectsCard.tsx`,
        `${PROJECT_DIR}/SuggestedStatusBanner.tsx`,
        `${PROJECT_DIR}/ItemRow.tsx`,
    ];
    for (const file of files) {
        const source = await src(file);
        assert.ok(source.startsWith("'use client';"), `${file}: komponent kliencki`);
        assert.ok(!/['"](ADMIN|STAFF)['"]/.test(source), `${file}: literał roli`);
    }
});

test('assignmentReasonLabel maps every mapping note to Polish, unknown stays raw', () => {
    assert.equal(assignmentReasonLabel('NO_ARCHITECT'), 'brak kodu architekta');
    assert.equal(assignmentReasonLabel('UNKNOWN_ARCHITECT_CODE:A-ZZZ'), 'nieznany kod A-ZZZ');
    assert.equal(assignmentReasonLabel('NO_ROOT_DOCUMENT'), 'brak dokumentu nadrzędnego');
    assert.equal(assignmentReasonLabel('ROOT_UNASSIGNED'), 'dokument nadrzędny nieprzypisany');
    assert.equal(assignmentReasonLabel('OWNER_MISMATCH:A-002'), 'inny architekt (A-002)');
    assert.equal(assignmentReasonLabel('UNMATCHED_CORRECTION'), 'korekta nie pasuje do faktury');
    assert.equal(assignmentReasonLabel('PROJECT_CANCELLED'), 'projekt niezrealizowany');
    assert.equal(assignmentReasonLabel('SOMETHING_NEW:x'), 'SOMETHING_NEW:x');
    assert.equal(assignmentReasonLabel(null), '—');
});

test('labels: sync run status, document date, plural', () => {
    assert.deepEqual(syncRunStatusEntry('DONE'), { label: 'Zakończona', tone: 'success' });
    assert.deepEqual(syncRunStatusEntry('RUNNING'), { label: 'W toku', tone: 'info' });
    assert.deepEqual(syncRunStatusEntry('WEIRD'), { label: 'WEIRD', tone: 'neutral' });
    assert.equal(formatDocDate('2026-10-20'), '20.10.2026');
    assert.equal(formatDocDate(''), '—');
    assert.deepEqual([1, 2, 5, 12, 22].map(documentsLabel), ['1 dokument', '2 dokumenty', '5 dokumentów', '12 dokumentów', '22 dokumenty']);
});
