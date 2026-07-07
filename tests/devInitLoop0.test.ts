import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

test('dev:init creates an idempotent SQLite database with admin and email templates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'walldecor-loop0-'));
    const dbPath = join(dir, 'walldecor.sqlite');

    try {
        for (let i = 0; i < 2; i++) {
            const result = spawnSync('npm', ['run', 'dev:init'], {
                cwd: new URL('..', import.meta.url),
                env: {
                    ...process.env,
                    DB_TYPE: 'sqlite',
                    DB_PATH: dbPath,
                    DEV_ADMIN_PASSWORD: 'Admin12345',
                },
                encoding: 'utf8',
            });

            assert.equal(result.status, 0, result.stderr || result.stdout);
        }

        const db = new Database(dbPath, { readonly: true });
        const tables = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `).all() as Array<{ name: string }>;

        assert.deepEqual(tables.map((row) => row.name), [
            'activity_logs',
            'cashback_redemptions',
            'commissions',
            'email_templates',
            'password_reset_tokens',
            'payout_requests',
            'project_files',
            'project_items',
            'projects',
            'users',
            'wallet_transactions',
        ]);

        const commissionColumns = db.prepare('PRAGMA table_info(commissions)').all() as Array<{ name: string }>;
        const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
        assert.ok(commissionColumns.some((column) => column.name === 'rate'));
        assert.ok(userColumns.some((column) => column.name === 'must_change_password'));
        assert.ok(userColumns.some((column) => column.name === 'password_changed_at'));

        const admin = db.prepare("SELECT email, role, password, must_change_password FROM users WHERE email = 'admin@e2e.walldecor.test'").get() as {
            email: string;
            role: string;
            password: string;
            must_change_password: number;
        };
        assert.equal(admin.role, 'ADMIN');
        assert.equal(admin.must_change_password, 0);
        assert.match(admin.password, /^\$2[aby]\$/);
        assert.notEqual(admin.password, 'Admin12345');

        const templateCount = db.prepare('SELECT COUNT(*) AS count FROM email_templates WHERE is_active = 1').get() as { count: number };
        assert.equal(templateCount.count, 7);

        const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE email = 'admin@e2e.walldecor.test'").get() as { count: number };
        assert.equal(adminCount.count, 1);

        db.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('Loop 0 validator guards against hard-coded dev password copies', () => {
    const source = readFileSync(new URL('../scripts/init-dev-db.mjs', import.meta.url), 'utf8');
    const occurrences = source.match(/Admin12345/g)?.length ?? 0;
    assert.equal(occurrences, 1);
});
