import Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dbPath = process.env.DB_PATH || './e2e.sqlite';
const json = process.argv.includes('--json');

function placeholders(values) {
    return values.map(() => '?').join(', ');
}

function selectIds(db, sql, params = []) {
    return db.prepare(sql).all(params).map((row) => row.id);
}

function runDelete(db, table, where, params = []) {
    return db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(params).changes;
}

function deleteFiles(invoiceUrls) {
    let deleted = 0;
    for (const invoiceUrl of invoiceUrls) {
        const filename = String(invoiceUrl || '').split('/').pop();
        if (!filename || !/^invoice_[a-zA-Z0-9_-]+\.pdf$/.test(filename)) continue;
        const filePath = join(process.cwd(), 'private_uploads', 'invoices', filename);
        if (existsSync(filePath)) {
            rmSync(filePath, { force: true });
            deleted++;
        }
    }
    return deleted;
}

if (!existsSync(dbPath)) {
    const empty = { skipped: true, reason: `Database not found: ${dbPath}` };
    console.log(json ? JSON.stringify(empty) : `[cleanup-e2e] ${empty.reason}`);
    process.exit(0);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

const report = db.transaction(() => {
    const userIds = selectIds(
        db,
        "SELECT id FROM users WHERE email LIKE '%@e2e.walldecor.test' AND email != 'admin@e2e.walldecor.test'"
    );

    if (userIds.length === 0) {
        return {
            users: 0,
            projects: 0,
            project_items: 0,
            project_files: 0,
            commissions: 0,
            wallet_transactions: 0,
            payout_requests: 0,
            password_reset_tokens: 0,
            activity_logs: 0,
            invoice_files: 0,
            remaining_marker_rows: 0,
        };
    }

    const userIn = placeholders(userIds);
    const projectIds = selectIds(db, `SELECT id FROM projects WHERE owner_id IN (${userIn})`, userIds);
    const projectIn = projectIds.length ? placeholders(projectIds) : "''";
    const itemIds = projectIds.length
        ? selectIds(db, `SELECT id FROM project_items WHERE project_id IN (${projectIn})`, projectIds)
        : [];
    const itemIn = itemIds.length ? placeholders(itemIds) : "''";
    const payoutRows = db.prepare(`SELECT id, invoice_url FROM payout_requests WHERE architect_id IN (${userIn})`).all(userIds);
    const payoutIds = payoutRows.map((row) => row.id);
    const payoutIn = payoutIds.length ? placeholders(payoutIds) : "''";

    const counts = {
        commissions: 0,
        wallet_transactions: 0,
        payout_requests: 0,
        project_files: 0,
        project_items: 0,
        projects: 0,
        password_reset_tokens: 0,
        activity_logs: 0,
        users: 0,
        invoice_files: deleteFiles(payoutRows.map((row) => row.invoice_url)),
        remaining_marker_rows: 0,
    };

    if (payoutIds.length) {
        counts.commissions += runDelete(db, 'commissions', `payout_id IN (${payoutIn})`, payoutIds);
    }
    if (itemIds.length) {
        counts.commissions += runDelete(db, 'commissions', `project_item_id IN (${itemIn})`, itemIds);
        counts.wallet_transactions += runDelete(db, 'wallet_transactions', `related_item_id IN (${itemIn})`, itemIds);
    }
    if (projectIds.length) {
        counts.commissions += runDelete(db, 'commissions', `project_id IN (${projectIn})`, projectIds);
        counts.project_files += runDelete(db, 'project_files', `project_id IN (${projectIn})`, projectIds);
        counts.project_items += runDelete(db, 'project_items', `project_id IN (${projectIn})`, projectIds);
        counts.projects += runDelete(db, 'projects', `id IN (${projectIn})`, projectIds);
    }

    counts.wallet_transactions += runDelete(db, 'wallet_transactions', `user_id IN (${userIn})`, userIds);
    counts.payout_requests += runDelete(db, 'payout_requests', `architect_id IN (${userIn})`, userIds);
    counts.password_reset_tokens += runDelete(db, 'password_reset_tokens', `user_id IN (${userIn})`, userIds);
    counts.activity_logs += runDelete(db, 'activity_logs', `user_id IN (${userIn})`, userIds);

    const markerPatterns = [
        ...userIds,
        ...projectIds,
        '[E2E]',
        '@e2e.walldecor.test',
    ];
    for (const marker of markerPatterns) {
        counts.activity_logs += db.prepare("DELETE FROM activity_logs WHERE description LIKE ? OR metadata LIKE ?")
            .run(`%${marker}%`, `%${marker}%`).changes;
    }

    counts.users += runDelete(db, 'users', `id IN (${userIn})`, userIds);

    counts.remaining_marker_rows = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM users WHERE email LIKE '%@e2e.walldecor.test' AND email != 'admin@e2e.walldecor.test')
          + (SELECT COUNT(*) FROM projects WHERE name LIKE '%[E2E]%')
          + (SELECT COUNT(*) FROM payout_requests WHERE invoice_url LIKE '%invoice_%')
          AS count
    `).get().count;

    return counts;
})();

db.pragma('foreign_keys = ON');
db.close();

if (json) {
    console.log(JSON.stringify(report));
} else {
    console.log('[cleanup-e2e] removed records:');
    for (const [table, count] of Object.entries(report)) {
        console.log(`  ${table}: ${count}`);
    }
}
