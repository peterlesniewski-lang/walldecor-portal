import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function load(path: string) {
    return readFile(new URL(path, import.meta.url), 'utf8');
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    assert.ok(start > -1, `missing marker: ${startMarker}`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(end > start, `missing end marker: ${endMarker}`);
    return source.slice(start, end);
}

test('admin architect list and profile count turnover only from ZAKOŃCZONY projects', async () => {
    const list = await load('../src/app/dashboard/admin/architects/page.tsx');
    const profile = await load('../src/app/dashboard/admin/architects/[id]/page.tsx');

    const listTurnover = sliceBetween(list, 'SELECT SUM(i.amount_net)', 'as turnover');
    assert.match(listTurnover, /p\.status = 'ZAKOŃCZONY'/);
    assert.doesNotMatch(listTurnover, /!= 'NIEZREALIZOWANY'/);

    const profileTurnover = sliceBetween(profile, 'const turnoverRes', 'const turnover =');
    assert.match(profileTurnover, /p\.status = 'ZAKOŃCZONY'/);
    assert.doesNotMatch(profileTurnover, /!= 'NIEZREALIZOWANY'/);

    assert.match(profile, /Obrót kwalifikowany \(ZAKOŃCZONE\)/);
    assert.match(profile, /Pipeline \(w toku\)/);
    assert.match(profile, /p\.status IN \('PRZYJĘTY', 'W_REALIZACJI'\)/);
});

test('updateProjectItem creates a PENDING commission when a zero-amount item is priced after acceptance', async () => {
    // Akcja deleguje do rdzenia src/lib/projectItems.ts (Loop 0 integracji Subiekt).
    const actions = await load('../src/app/actions/projects.ts');
    const wrapper = sliceBetween(actions, 'export async function updateProjectItem', 'export async function addProjectItem');
    assert.match(wrapper, /updateItemAmountCore\(itemId, amount_net, \{ actorId: session\.user\.id, note \}\)/);

    const source = await load('../src/lib/projectItems.ts');
    const action = sliceBetween(source, 'export async function updateItemAmountCore', 'export async function addItemCore');

    assert.match(action, /INSERT INTO commissions[^"]*'PENDING'[^"]*"[\s\S]{0,200}'Wycena pozycji po akceptacji'/);
    assert.match(action, /item\.type === 'PRODUCT'/);
    assert.match(action, /DELETE FROM commissions WHERE project_item_id = \? AND status = 'PENDING'/);
});

test('updateProjectStatus creates PENDING commissions per item, not per project', async () => {
    const source = await load('../src/app/actions/projects.ts');
    const action = sliceBetween(source, 'export async function updateProjectStatus', 'export async function getAllArchitects');

    assert.match(action, /SELECT id FROM commissions WHERE project_item_id = \? LIMIT 1/);
    assert.doesNotMatch(action, /SELECT id FROM commissions WHERE project_id = \? LIMIT 1/);
    assert.match(action, /previousStatus/);
});

test('admin payout forecast is based on EARNED commissions with the 100 PLN threshold', async () => {
    const source = await load('../src/lib/services.ts');
    const forecast = sliceBetween(source, '// 6. Payout Forecast', '// 7. Project pipeline stats');

    assert.match(forecast, /status = 'EARNED'/);
    assert.match(forecast, />= 100/);
    assert.match(forecast, /status IN \('PENDING', 'IN_PAYMENT', 'HOLD'\)/);
    assert.doesNotMatch(forecast, /walletBalanceSql/);
    assert.doesNotMatch(forecast, /300/);
});

test('admin monthly turnover groups by completion date within the last 12 months', async () => {
    const source = await load('../src/app/dashboard/admin/page.tsx');
    const query = sliceBetween(source, 'const monthlyTurnover', 'const pendingPayouts');

    assert.match(query, /COALESCE\(p\.completed_at, p\.updated_at, p\.created_at\)/);
    assert.match(query, /DATE_SUB\(NOW\(\), INTERVAL 12 MONTH\)/);
    assert.doesNotMatch(query, /LIMIT 12/);
    assert.match(source, /Prognoza wypłat prowizji/);
});
