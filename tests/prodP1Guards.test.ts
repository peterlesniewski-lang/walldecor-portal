import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatSqlDateTime } from '../src/lib/dbDate.ts';
import { walletBalanceSql } from '../src/lib/walletSql.ts';

test('formats SQL datetimes without ISO timezone suffixes', () => {
    const formatted = formatSqlDateTime(new Date(2026, 4, 14, 9, 8, 7));

    assert.equal(formatted, '2026-05-14 09:08:07');
    assert.doesNotMatch(formatted, /[TZ]/);
});

test('backup includes project file metadata', async () => {
    const source = await readFile(new URL('../src/app/api/admin/backup/route.ts', import.meta.url), 'utf8');

    assert.match(source, /'project_files'/);
});

test('backup does not silently replace failed table exports with empty arrays', async () => {
    const source = await readFile(new URL('../src/app/api/admin/backup/route.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /catch\s*\{[\s\S]*exportedTables\[table\]\s*=\s*\[\]/);
    assert.match(source, /failedTables/);
});

test('google sign-in does not auto-create invite-less architect accounts', async () => {
    const source = await readFile(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /INSERT INTO users[\s\S]*'ARCHI'[\s\S]*'google'/);
    assert.match(source, /else\s*\{\s*return false;\s*\}/);
});

test('architect project detail page enforces project ownership before loading files', async () => {
    const source = await readFile(new URL('../src/app/dashboard/projects/[id]/page.tsx', import.meta.url), 'utf8');
    const ownershipCheck = source.indexOf("project.owner_id !== session.user.id");
    const filesQuery = source.indexOf("FROM project_files");

    assert.ok(ownershipCheck > -1);
    assert.ok(filesQuery > ownershipCheck);
});

test('wallet balance SQL subtracts only spends linked to active earning rows', () => {
    const sql = walletBalanceSql('u.id');

    assert.match(sql, /spent\.related_item_id = earn\.id/);
    assert.match(sql, /earn\.type IN \('EARN', 'ADJUST'\)/);
    assert.match(sql, /earn\.expires_at IS NULL OR earn\.expires_at > NOW\(\)/);
});

test('staff cannot mutate payout invoice numbers', async () => {
    const actionSource = await readFile(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');
    const queueSource = await readFile(new URL('../src/admin/components/AdminPayoutsQueue.tsx', import.meta.url), 'utf8');

    assert.match(actionSource, /updatePayoutInvoiceNumber[\s\S]*canManageFinancialOperations/);
    assert.match(queueSource, /InvoiceNumberField[\s\S]*isAdmin: boolean/);
});

test('commission payout locks only still-earned commission rows', async () => {
    const source = await readFile(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');

    assert.match(source, /UPDATE commissions SET status = 'IN_PAYMENT', payout_id = \? WHERE id = \? AND status = 'EARNED'/);
    assert.match(source, /Nie udało się zablokować pełnej kwoty prowizji/);
});

test('payout status updates lock the payout request before final processing', async () => {
    const source = await readFile(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');
    const actionStart = source.indexOf('export async function updatePayoutStatus');
    const actionEnd = source.indexOf('export async function updateProjectItem', actionStart);
    const actionSource = source.slice(actionStart, actionEnd);

    assert.ok(actionStart > -1);
    assert.match(actionSource, /withTransaction\(async \(queryFn\) => \{[\s\S]*FROM payout_requests WHERE id = \? FOR UPDATE/);
    assert.doesNotMatch(actionSource, /const reqRes = await query<any>\("SELECT \* FROM payout_requests WHERE id = \?"/);
});

test('cashback spending locks active earning rows in MySQL transactions', async () => {
    const cashbackSource = await readFile(new URL('../src/lib/cashback.ts', import.meta.url), 'utf8');
    const dbSource = await readFile(new URL('../src/lib/db.ts', import.meta.url), 'utf8');

    assert.match(cashbackSource, /FOR UPDATE/);
    assert.match(dbSource, /FOR UPDATE\\b/);
});

test('project finalization uses deterministic ids for base commission and cashback grants', async () => {
    const source = await readFile(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');

    assert.match(source, /`c_\$\{item\.id\}_earned`/);
    assert.match(source, /`t_\$\{item\.id\}_cashback`/);
});

test('project finalization persists final status in the same transaction as financial grants', async () => {
    const source = await readFile(new URL('../src/app/actions/projects.ts', import.meta.url), 'utf8');
    const actionStart = source.indexOf('export async function updateProjectStatus');
    const finalizationStart = source.indexOf("if (status === 'ZAKOŃCZONY')", actionStart);
    const beforeFinalization = source.slice(actionStart, finalizationStart);
    const finalizationSource = source.slice(finalizationStart);

    assert.ok(actionStart > -1);
    assert.ok(finalizationStart > actionStart);
    assert.doesNotMatch(beforeFinalization, /UPDATE projects SET status/);
    assert.match(finalizationSource, /await withTransaction\(async \(queryFn\) => \{[\s\S]*UPDATE projects SET status = \?/);
});
