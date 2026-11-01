// Panel admina integracji Subiekt (PLAN-SUBIEKT-2026-10-29.md, Loop 4B): testy źródłowe stron i komponentów
// (wymagają sesji next-auth i renderu Next.js) oraz test jednostkowy etykiet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// labels.ts importuje przez alias `@/…` (statusMaps, utils) — potrzebny hook rozwiązywania modułów.
await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
type LabelsModule = typeof import('../src/lib/subiekt/labels');
const { assignmentReasonLabel, documentsLabel, formatDocAmount, formatDocDate, projectStatusLabel, syncRunStatusEntry }: LabelsModule =
    await import(new URL('../src/lib/subiekt/labels.ts', import.meta.url).href);

const src = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

const INTEGRATION_DIR = 'app/dashboard/admin/integrations/subiekt';
const PROJECT_DIR = 'app/dashboard/admin/projects/[id]';

test('integrations page: operational permission from rbac, data from read models', async () => {
    const page = await src(`${INTEGRATION_DIR}/page.tsx`);
    assert.match(page, /import \{ canManageOperationalProjects \} from '@\/lib\/rbac'/);
    assert.match(page, /!canManageOperationalProjects\(session\.user\.role\)/);
    for (const fn of ['getRecentSyncRuns', 'getUnassignedCount', 'getUnassignedDocuments', 'getUnknownArchitectCodes', 'getArchitectOptions']) {
        assert.match(page, new RegExp(`${fn}\\(`), `brak ${fn}`);
    }
    assert.match(page, /<RefreshButton \/>/);
    assert.ok(!page.includes("'use client'"), 'strona jest komponentem serwerowym');
    assert.ok(!/\bon[A-Z]\w*=\{/.test(page), 'komponent serwerowy bez handlerów zdarzeń');
});

test('shell header names the integrations page', async () => {
    const { resolveShellTitle }: typeof import('../src/lib/shellTitle') =
        await import(new URL('../src/lib/shellTitle.ts', import.meta.url).href);
    assert.equal(resolveShellTitle('/dashboard/admin/integrations/subiekt', true).title, 'Integracja Subiekt');
});

test('actions return { ok, error } for domain errors; only Unauthorized is thrown', async () => {
    const actions = await src('app/actions/subiekt.ts');
    assert.match(actions, /export type SubiektActionResult/);
    assert.match(actions, /\{\s*ok: false,\s*error:/);
    const exported = [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    assert.equal(exported.length, 9);
    for (const name of exported) {
        const start = actions.indexOf(`export async function ${name}(`);
        const next = actions.indexOf('\nexport ', start + 1);
        const body = actions.slice(start, next === -1 ? undefined : next);
        assert.match(body, /Promise<SubiektActionResult/, `${name}: typ wyniku`);
        assert.match(body, /return attempt\(/, `${name}: błędy domenowe jako wynik`);
        assert.equal([...body.matchAll(/throw new Error\("Unauthorized"\)/g)].length, 1, `${name}: rzuca tylko Unauthorized (poza attempt)`);
    }
});

test('inbox client calls the three server actions and shows result.error', async () => {
    const inbox = await src(`${INTEGRATION_DIR}/SubiektInboxClient.tsx`);
    for (const action of ['assignDocumentToProject', 'createProjectFromDocument', 'ignoreDocument']) {
        assert.match(inbox, new RegExp(`${action}\\(doc\\.id,`), `brak ${action}`);
    }
    assert.match(inbox, /setError\(result\.error\)/);
    assert.match(inbox, /router\.refresh\(\)/);
    assert.match(inbox, /<option value="">Wybierz projekt…<\/option>/);
});

test('sidebar: Subiekt link with unassigned badge, count computed in the server layout', async () => {
    const sidebar = await src('components/Sidebar.tsx');
    const layout = await src('app/dashboard/layout.tsx');
    assert.match(sidebar, /href: '\/dashboard\/admin\/integrations\/subiekt'/);
    assert.match(sidebar, /subiektUnassignedCount/);
    assert.match(layout, /getUnassignedCount\(\)/);
    assert.match(layout, /canManageOperationalProjects\(session\.user\.role\)/);
    assert.match(layout, /subiektUnassignedCount=\{subiektUnassignedCount\}/);
    const queries = await src('lib/subiekt/queries.ts');
    assert.match(queries, /export const getUnassignedCount = cache\(/, 'layout i strona dzielą jedno zapytanie');
});

test('ItemRow: type override through overrideItemType, behind a permission prop', async () => {
    const row = await src(`${PROJECT_DIR}/ItemRow.tsx`);
    assert.match(row, /import \{ overrideItemType \} from '@\/app\/actions\/subiekt'/);
    assert.match(row, /await overrideItemType\(item\.id,/);
    assert.match(row, /setError\(result\.error\)/);
    assert.match(row, /canOverrideType/);
    assert.match(row, /typ zmieniony ręcznie/);
});

test('admin project page: suggested status, documents card, permissions from rbac', async () => {
    const page = await src(`${PROJECT_DIR}/page.tsx`);
    const client = await src(`${PROJECT_DIR}/AdminProjectDetailClient.tsx`);
    assert.match(page, /getSuggestedStatus\(/, "Loop 5b: podpowiedź z powodem blokady (computeSuggestedStatus bez powodu)");
    assert.match(page, /getProjectSubiektSummary\(/);
    assert.match(page, /SuggestedStatusBanner/);
    assert.match(page, /canManageFinancialOperations\(session\.user\.role\)/);
    assert.match(page, /canManageOperationalProjects\(session\.user\.role\)/);
    assert.match(client, /import SubiektDocumentsCard from '\.\/SubiektDocumentsCard'/);
    assert.match(client, /MergeProjectsCard/);

    const banner = await src(`${PROJECT_DIR}/SuggestedStatusBanner.tsx`);
    assert.match(banner, /await applySuggestedStatus\(projectId\)/);
    assert.match(banner, /finally \{[\s\S]*router\.refresh\(\)/, 'odświeżenie także po błędzie');
    assert.match(banner, /Status mógł zmienić się częściowo/);

    const docs = await src(`${PROJECT_DIR}/SubiektDocumentsCard.tsx`);
    assert.match(docs, /await moveDocumentToProject\(root\.id,/);
    assert.match(docs, /setError\(result\.error\)/);

    const merge = await src(`${PROJECT_DIR}/MergeProjectsCard.tsx`);
    assert.match(merge, /await mergeProjects\(projectId,/);
    assert.match(merge, /setError\(result\.error\)/);
    assert.match(merge, /disabled=\{loading \|\| confirming\}/);
});

test('new client components take permissions as props (no role string literals)', async () => {
    const files = [
        `${INTEGRATION_DIR}/SubiektInboxClient.tsx`,
        `${INTEGRATION_DIR}/SyncRunsTable.tsx`,
        `${INTEGRATION_DIR}/RefreshButton.tsx`,
        `${PROJECT_DIR}/SubiektDocumentsCard.tsx`,
        `${PROJECT_DIR}/MergeProjectsCard.tsx`,
        `${PROJECT_DIR}/SuggestedStatusBanner.tsx`,
        `${PROJECT_DIR}/ItemRow.tsx`,
    ];
    for (const file of files) {
        const source = await src(file);
        assert.ok(source.startsWith("'use client';"), `${file}: komponent kliencki`);
        assert.doesNotMatch(source, /['"](ADMIN|STAFF)['"]/, `${file}: literał roli`);
    }
});

test('runs table: agent version, 5 rows by default, warning for unexpected pages', async () => {
    const table = await src(`${INTEGRATION_DIR}/SyncRunsTable.tsx`);
    assert.match(table, />Agent</);
    assert.match(table, /COLLAPSED_ROWS = 5/);
    assert.match(table, /Pokaż wszystkie \(\$\{runs\.length\}\)/);
    assert.match(table, /pages_received > run\.pages_expected/);
    assert.match(table, /więcej stron niż zapowiedziano/);
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
    assert.equal(projectStatusLabel('W_REALIZACJI'), 'W realizacji');
    assert.equal(projectStatusLabel('NOWY_KOD'), 'NOWY_KOD');
    assert.equal(formatDocAmount(2400.5).replace(/\u00a0/g, ' '), '2 400,50 PLN');
});
