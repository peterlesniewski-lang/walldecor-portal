import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production schema startup backfills historical commission rates without changing amounts', () => {
    const source = readFileSync(new URL('../scripts/ensure-production-schema.mjs', import.meta.url), 'utf8');

    assert.match(source, /UPDATE commissions c\s+JOIN project_items i/);
    assert.match(source, /SET c\.rate = ROUND\(c\.amount_net \/ i\.amount_net, 4\)/);
    assert.match(source, /c\.status IN \('EARNED', 'IN_PAYMENT', 'PAID'\)/);
});

test('dev init includes the same historical commission rate backfill for SQLite', () => {
    const source = readFileSync(new URL('../scripts/init-dev-db.mjs', import.meta.url), 'utf8');

    assert.match(source, /UPDATE commissions[\s\S]+SET rate = ROUND/);
    assert.match(source, /WHERE rate IS NULL/);
    assert.match(source, /status IN \('EARNED', 'IN_PAYMENT', 'PAID'\)/);
});
