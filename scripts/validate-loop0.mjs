import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

const expectedTables = [
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
];

const expectedSlugs = [
    'ARCHITECT_REGISTERED',
    'PASSWORD_RESET',
    'PAYOUT_PROCESSED',
    'PROFILE_INCOMPLETE',
    'PROJECT_ACCEPTED',
    'PROJECT_ADDED_ADMIN',
    'PROJECT_ADDED_USER',
];

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function runInit(dbPath) {
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
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout);
    }
    return result.stdout.trim();
}

const dir = mkdtempSync(join(tmpdir(), 'walldecor-loop0-validate-'));
const dbPath = join(dir, 'walldecor.sqlite');

try {
    const first = runInit(dbPath);
    const db = new Database(dbPath);

    const tableNames = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `).all().map((row) => row.name);
    assert(JSON.stringify(tableNames) === JSON.stringify(expectedTables), `Unexpected tables: ${tableNames.join(', ')}`);

    const admin = db.prepare("SELECT password, role, must_change_password FROM users WHERE email = 'admin@e2e.walldecor.test'").get();
    assert(admin?.role === 'ADMIN', 'Seed admin missing or wrong role.');
    assert(Number(admin.must_change_password) === 0, 'Seed admin must not be forced to change password.');
    assert(/^\$2[aby]\$/.test(admin.password), 'Seed admin password is not a bcrypt hash.');
    assert(admin.password !== 'Admin12345', 'Seed admin password was stored as plaintext.');

    const slugs = db.prepare('SELECT slug FROM email_templates WHERE is_active = 1 ORDER BY slug').all().map((row) => row.slug);
    assert(JSON.stringify(slugs) === JSON.stringify(expectedSlugs), `Unexpected email template slugs: ${slugs.join(', ')}`);

    const commissionColumns = db.prepare('PRAGMA table_info(commissions)').all().map((row) => row.name);
    const userColumns = db.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
    assert(commissionColumns.includes('rate'), 'commissions.rate missing.');
    assert(userColumns.includes('must_change_password'), 'users.must_change_password missing.');
    assert(userColumns.includes('password_changed_at'), 'users.password_changed_at missing.');

    const before = {
        users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
        templates: db.prepare('SELECT COUNT(*) AS count FROM email_templates').get().count,
    };
    db.close();

    runInit(dbPath);

    const dbAgain = new Database(dbPath);
    const after = {
        users: dbAgain.prepare('SELECT COUNT(*) AS count FROM users').get().count,
        templates: dbAgain.prepare('SELECT COUNT(*) AS count FROM email_templates').get().count,
    };
    dbAgain.close();
    assert(before.users === after.users, 'dev:init duplicated users.');
    assert(before.templates === after.templates, 'dev:init duplicated templates.');

    const source = readFileSync(new URL('./init-dev-db.mjs', import.meta.url), 'utf8');
    assert((source.match(/Admin12345/g)?.length ?? 0) === 1, 'Default dev password appears more than once in init script.');

    console.log(first);
    console.log('[validate-loop0] OK: schema, seed admin, email templates and idempotency verified.');
} finally {
    rmSync(dir, { recursive: true, force: true });
}
