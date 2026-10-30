// Loop 4b (PLAN-SUBIEKT-2026-10-29.md): ważność cashbacku z CASHBACK_EXPIRY_MONTHS (domyślnie 12 miesięcy).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type ExpiryModule = typeof import('../src/lib/cashbackExpiry');
type CoreModule = typeof import('../src/lib/projectItems');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const expiry: ExpiryModule = await import(new URL('../src/lib/cashbackExpiry.ts', import.meta.url).href);
const core: CoreModule = await import(new URL('../src/lib/projectItems.ts', import.meta.url).href);
const db = testDb.db;

const saved = process.env.CASHBACK_EXPIRY_MONTHS;
test.after(() => {
    if (saved === undefined) delete process.env.CASHBACK_EXPIRY_MONTHS;
    else process.env.CASHBACK_EXPIRY_MONTHS = saved;
    testDb.cleanup();
});

function setMonths(value: string | undefined) {
    if (value === undefined) delete process.env.CASHBACK_EXPIRY_MONTHS;
    else process.env.CASHBACK_EXPIRY_MONTHS = value;
}

async function captureWarn<T>(fn: () => T): Promise<{ result: T; warnings: string[] }> {
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
    try {
        return { result: fn(), warnings };
    } finally {
        console.warn = orig;
    }
}

const NOW = new Date(2026, 9, 30, 14, 5, 0); // 30.10.2026 14:05 czasu lokalnego

test('cashbackExpiresAt defaults to 12 months without the variable', async () => {
    setMonths(undefined);
    const { result, warnings } = await captureWarn(() => expiry.cashbackExpiresAt(NOW));
    assert.equal(result.getTime(), new Date(2027, 9, 30, 14, 5, 0).getTime());
    assert.deepEqual(warnings, []);
    assert.equal(NOW.getTime(), new Date(2026, 9, 30, 14, 5, 0).getTime(), 'argument nie jest modyfikowany');
});

test('cashbackExpiresAt honours CASHBACK_EXPIRY_MONTHS=24 and =12', async () => {
    setMonths('24');
    assert.equal(expiry.cashbackExpiresAt(NOW).getTime(), new Date(2028, 9, 30, 14, 5, 0).getTime());
    setMonths('12');
    assert.equal(expiry.cashbackExpiresAt(NOW).getTime(), new Date(2027, 9, 30, 14, 5, 0).getTime());
});

test('cashbackExpiresAt falls back to 12 months with a warning for garbage, zero or negative values', async () => {
    for (const bad of ['abc', '0', '-6', '1.5', '12 miesięcy']) {
        setMonths(bad);
        const { result, warnings } = await captureWarn(() => expiry.cashbackExpiresAt(NOW));
        assert.equal(result.getTime(), new Date(2027, 9, 30, 14, 5, 0).getTime(), bad);
        assert.equal(warnings.length, 1, bad);
        assert.match(warnings[0], /CASHBACK_EXPIRY_MONTHS/);
    }
});

test('new EARN row from a settled project item expires 24 months ahead with CASHBACK_EXPIRY_MONTHS=24', async () => {
    setMonths('24');
    db.prepare("INSERT INTO users (id, name, email, role) VALUES ('u_archi', 'Architekt', 'archi@test.local', 'ARCHI')").run();
    db.prepare("INSERT INTO projects (id, owner_id, name, client_label, status) VALUES ('p_done', 'u_archi', 'Projekt', 'K', 'ZAKOŃCZONY')").run();

    const before = new Date();
    const { itemId } = await core.addItemCore('p_done', { type: 'PRODUCT', category: 'Tapety', amount_net: 1000 }, { actorId: null });
    const earn = db.prepare("SELECT * FROM wallet_transactions WHERE related_item_id = ? AND type = 'EARN'").get(itemId) as any;
    assert.ok(earn, 'wpis EARN istnieje');
    const expected = new Date(before.getTime());
    expected.setMonth(expected.getMonth() + 24);
    const stored = new Date(String(earn.expires_at).replace(' ', 'T'));
    assert.ok(Math.abs(stored.getTime() - expected.getTime()) < 60_000, `${earn.expires_at} ≈ ${expected.toString()}`);
});

test('no hard-coded one-year expiry left in the three cashback write paths', async () => {
    for (const file of ['../src/lib/projectItems.ts', '../src/app/actions/projects.ts']) {
        const source = await readFile(new URL(file, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /setFullYear/, file);
        assert.match(source, /cashbackExpiresAt\(\)/, file);
    }
    const items = await readFile(new URL('../src/lib/projectItems.ts', import.meta.url), 'utf8');
    assert.equal(items.match(/cashbackExpiresAt\(\)/g)?.length, 2);
});
