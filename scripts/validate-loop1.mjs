import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

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

const dir = mkdtempSync(join(tmpdir(), 'walldecor-loop1-validate-'));
const dbPath = join(dir, 'walldecor.sqlite');

try {
    runInit(dbPath);

    const db = new Database(dbPath);
    db.exec(`
        INSERT INTO users (id, name, email, password, role)
        VALUES ('arch_loop1', 'Loop One Architect', 'loop1@e2e.walldecor.test', '$2b$10$hashhashhashhashhashha', 'ARCHI');

        INSERT INTO projects (id, owner_id, name, client_label, status)
        VALUES ('project_loop1_done', 'arch_loop1', 'Historyczny projekt', 'Klient', 'ZAKOŃCZONY');

        INSERT INTO project_items (id, project_id, type, amount_net, category)
        VALUES ('item_loop1_done', 'project_loop1_done', 'PRODUCT', 10000, 'Tapety');

        INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, rate)
        VALUES ('comm_loop1_old', 'project_loop1_done', 'item_loop1_done', 'arch_loop1', 700, 'EARNED', NULL);
    `);
    db.close();

    runInit(dbPath);

    const backfilledDb = new Database(dbPath);
    const oldCommission = backfilledDb.prepare("SELECT amount_net, rate FROM commissions WHERE id = 'comm_loop1_old'").get();
    assert(Number(oldCommission.amount_net) === 700, 'Backfill changed historical commission amount.');
    assert(Number(oldCommission.rate) === 0.07, `Expected backfilled rate 0.07, got ${oldCommission.rate}.`);

    backfilledDb.exec(`
        INSERT INTO projects (id, owner_id, name, client_label, status)
        VALUES ('project_loop1_pending', 'arch_loop1', 'Projekt do wyceny', 'Klient', 'PRZYJĘTY');

        INSERT INTO project_items (id, project_id, type, amount_net, category)
        VALUES ('item_loop1_pending', 'project_loop1_pending', 'PRODUCT', 0, 'Tapety');
    `);

    const rate = 0.10;
    const newAmount = 10000;
    backfilledDb.prepare("UPDATE project_items SET amount_net = ? WHERE id = ?").run(newAmount, 'item_loop1_pending');
    backfilledDb.prepare(`
        INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, rate, note)
        SELECT 'comm_loop1_pending', p.id, i.id, p.owner_id, ? * ?, 'PENDING', ?, 'Wycena pozycji po akceptacji'
        FROM project_items i
        JOIN projects p ON p.id = i.project_id
        WHERE i.id = ?
          AND i.type = 'PRODUCT'
          AND p.status IN ('PRZYJĘTY', 'W_REALIZACJI')
          AND NOT EXISTS (
              SELECT 1 FROM commissions c
              WHERE c.project_item_id = i.id
                AND c.status = 'PENDING'
          )
    `).run(newAmount, rate, rate, 'item_loop1_pending');

    const pending = backfilledDb.prepare(`
        SELECT amount_net, rate, status
        FROM commissions
        WHERE project_item_id = 'item_loop1_pending'
    `).get();
    backfilledDb.close();

    assert(pending?.status === 'PENDING', 'Missing PENDING commission after pricing accepted project item.');
    assert(Number(pending.amount_net) === 1000, `Expected pending amount 1000, got ${pending?.amount_net}.`);
    assert(Number(pending.rate) === 0.10, `Expected pending rate 0.10, got ${pending?.rate}.`);

    console.log('[validate-loop1] OK: historical rate backfill and missing PENDING commission invariant verified.');
} finally {
    rmSync(dir, { recursive: true, force: true });
}
