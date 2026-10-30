import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig, lookbackStart, parseArgs, parseEnvFile } from '../src/config.ts';

const DB = { SUBIEKT_DB_NAME: 'WD_sp', SUBIEKT_DB_USER: 'portal_reader', SUBIEKT_DB_PASSWORD: 'a#b c' };
const PORTAL = { PORTAL_URL: 'https://archi.walldecor.pl', SUBIEKT_SYNC_TOKEN: 't', SUBIEKT_SYNC_SECRET: 's' };

test('loadConfig: wartości domyślne (localhost\\INSERTGT, 18 mies., kategoria 14) i endpoint portalu', () => {
    const config = loadConfig({ ...DB, ...PORTAL }, '/agent');
    assert.deepEqual(config.db, { server: 'localhost', instanceName: 'INSERTGT', port: null, database: 'WD_sp', user: 'portal_reader', password: 'a#b c' });
    assert.deepEqual([config.lookbackMonths, config.architectCategoryId], [18, 14]);
    assert.equal(config.portal?.endpoint, 'https://archi.walldecor.pl/api/integrations/subiekt/sync');
    assert.equal(config.logsDir, '/agent/logs');
});

test('loadConfig: port zastępuje instancję; brak portalu nie blokuje --probe / --dry-run', () => {
    const config = loadConfig({ ...DB, SUBIEKT_DB_SERVER: '127.0.0.1', SUBIEKT_DB_PORT: '50167', SUBIEKT_DB_INSTANCE: 'INSERTGT' });
    assert.deepEqual([config.db.server, config.db.port, config.db.instanceName], ['127.0.0.1', 50167, null]);
    assert.equal(config.portal, null);
    assert.deepEqual(config.portalProblems, ['brak PORTAL_URL', 'brak SUBIEKT_SYNC_TOKEN', 'brak SUBIEKT_SYNC_SECRET']);
    assert.match(loadConfig({ ...DB, ...PORTAL, PORTAL_URL: 'ftp://x' }).portalProblems.join(), /nie jest adresem http/);
});

test('loadConfig: brakujące i niepoprawne wartości → ConfigError z listą', () => {
    assert.throws(() => loadConfig({}), (e: unknown) => e instanceof ConfigError && /SUBIEKT_DB_NAME.*SUBIEKT_DB_USER.*SUBIEKT_DB_PASSWORD/.test(e.message));
    assert.throws(() => loadConfig({ ...DB, LOOKBACK_MONTHS: '0' }), /LOOKBACK_MONTHS/);
    assert.throws(() => loadConfig({ ...DB, SUBIEKT_DB_PORT: 'abc' }), /SUBIEKT_DB_PORT/);
    assert.throws(() => loadConfig({ ...DB, ARCHITECT_CATEGORY_ID: '1.5' }), /ARCHITECT_CATEGORY_ID/);
});

test('parseArgs: tryby, --since w obu formach, ścisła data, błędy', () => {
    assert.deepEqual(parseArgs([]), { mode: 'sync', since: null });
    assert.deepEqual(parseArgs(['--dry-run', '--since', '2026-01-01']), { mode: 'dry-run', since: '2026-01-01' });
    assert.deepEqual(parseArgs(['--since=2024-02-29', '--probe']), { mode: 'probe', since: '2024-02-29' });
    assert.equal(parseArgs(['--help']).mode, 'help');
    for (const bad of [['--since', '2026-02-30'], ['--since', '2025-02-29'], ['--since', '2026-13-01'], ['--since', '30.10.2026'], ['--since'], ['--sync'], ['--dry-run', '--probe']]) {
        assert.throws(() => parseArgs(bad), ConfigError, bad.join(' '));
    }
    assert.throws(() => parseArgs(['--since', '2026-02-30']), /„2026-02-30” nie jest poprawną datą/);
});

test('lookbackStart: miesiące wstecz w czasie lokalnym, z przycięciem końca miesiąca', () => {
    assert.equal(lookbackStart(new Date(2026, 9, 30), 18), '2025-04-30');
    assert.equal(lookbackStart(new Date(2026, 2, 31), 1), '2026-02-28');
    assert.equal(lookbackStart(new Date(2028, 2, 31), 1), '2028-02-29');
    assert.equal(lookbackStart(new Date(2026, 0, 15), 13), '2024-12-15');
});

test('parseEnvFile: BOM z Notatnika nie psuje pierwszego klucza; cudzysłowy i komentarze', () => {
    const env = parseEnvFile('﻿SUBIEKT_DB_SERVER=localhost\r\n# komentarz\r\nSUBIEKT_DB_PASSWORD="ab#cd ef"\r\n');
    assert.deepEqual(env, { SUBIEKT_DB_SERVER: 'localhost', SUBIEKT_DB_PASSWORD: 'ab#cd ef' });
});
