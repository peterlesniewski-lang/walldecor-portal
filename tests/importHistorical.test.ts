import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loadImportSource = () => readFile(new URL('../src/app/actions/import.ts', import.meta.url), 'utf8');

test('historical import does not finalize projects via updateProjectStatus', async () => {
    const source = await loadImportSource();

    assert.doesNotMatch(source, /updateProjectStatus\(/);
});

test('historical import records settled commissions as PAID', async () => {
    const source = await loadImportSource();

    assert.match(source, /INSERT INTO commissions[^"]*'PAID'/);
    assert.doesNotMatch(source, /INSERT INTO commissions[^"]*'EARNED'/);
    assert.match(source, /c_\$\{itemId\}_import/);
    assert.match(source, /withTransaction/);
    assert.match(source, /getCommissionRateForTurnover/);
});

test('historical import never grants cashback wallet transactions', async () => {
    const source = await loadImportSource();

    assert.doesNotMatch(source, /INSERT INTO wallet_transactions/);
});

test('historical import builds portal URL from NEXTAUTH_URL', async () => {
    const source = await loadImportSource();

    assert.match(source, /NEXTAUTH_URL/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_APP_URL/);
});
