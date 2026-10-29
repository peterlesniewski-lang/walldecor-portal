import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import type { PoolConnection } from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';

const isSQLite = process.env.DB_TYPE === 'sqlite';

// MySQL Pool (lazy initialized)
let mysqlPool: any = null;

// SQLite Instance (lazy initialized)
let sqliteDb: any = null;

function getMySQLPool() {
    if (!mysqlPool) {
        mysqlPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return mysqlPool;
}

function getSQLiteDb() {
    if (!sqliteDb) {
        sqliteDb = new Database(process.env.DB_PATH || 'walldecor.sqlite');
        // Enable foreign keys
        sqliteDb.pragma('foreign_keys = ON');
    }
    return sqliteDb;
}

function preprocessSQL(sql: string): string {
    if (!isSQLite) return sql;

    let processed = sql;

    // 1. Handle NOW() -> datetime('now') which is UTC, matching CURRENT_TIMESTAMP behavior
    processed = processed.replace(/NOW\(\)/gi, "datetime('now')");

    // 2. Handle DATE_SUB(date, INTERVAL val UNIT)
    // We handle the most common case where date is already replaced NOW() or a column
    const intervalRegex = /DATE_SUB\(\s*([^,]+)\s*,\s*INTERVAL\s+(\d+)\s+(SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR)\s*\)/gi;
    processed = processed.replace(intervalRegex, (match, date, val, unit) => {
        const u = unit.toLowerCase();
        return `datetime(${date.trim()}, '-${val} ${u}${u.endsWith('s') ? '' : 's'}')`;
    });

    // 3. Handle DATE_ADD(date, INTERVAL val UNIT)
    const addIntervalRegex = /DATE_ADD\(\s*([^,]+)\s*,\s*INTERVAL\s+(\d+)\s+(SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR)\s*\)/gi;
    processed = processed.replace(addIntervalRegex, (match, date, val, unit) => {
        const u = unit.toLowerCase();
        return `datetime(${date.trim()}, '+${val} ${u}${u.endsWith('s') ? '' : 's'}')`;
    });

    // 4. MySQL row locks are unnecessary in SQLite's write transaction model.
    processed = processed.replace(/\s+FOR UPDATE\b/gi, '');

    return processed;
}

// Bieżąca transakcja w łańcuchu async (per żądanie / per wywołanie). Dzięki temu `query` i
// zagnieżdżone `withTransaction` same dołączają do otwartej transakcji — także w kodzie, który
// nie dostał `queryFn` (np. logActivity, rdzeń src/lib/projectItems.ts).
// `active` gasi kontekst po COMMIT/ROLLBACK, gdyby jakaś kontynuacja async przeżyła transakcję.
type TxContext =
    | { engine: 'sqlite'; active: boolean }
    | { engine: 'mysql'; conn: PoolConnection; active: boolean };

const txStorage = new AsyncLocalStorage<TxContext>();

function activeTx(): TxContext | undefined {
    const ctx = txStorage.getStore();
    return ctx?.active ? ctx : undefined;
}

/**
 * Runs a callback inside a DB transaction.
 * The callback receives `queryFn` (= `query`, which routes to the transaction's connection).
 * Re-entrant: called inside an active transaction it just runs the callback in that transaction —
 * the outermost call decides commit/rollback. On failure the transaction is rolled back automatically.
 *
 * Rule: nested calls join the outer transaction; there are no savepoints, so an error inside must
 * propagate to the transaction boundary. Catching an error from a nested `withTransaction` and carrying
 * on would leave its partial writes in the outer transaction — only catch at the outermost call.
 */
export async function withTransaction<T>(fn: (queryFn: typeof query) => Promise<T>): Promise<T> {
    if (activeTx()) return fn(query);

    if (isSQLite) {
        const db = getSQLiteDb();
        const ctx: TxContext = { engine: 'sqlite', active: true };
        db.prepare('BEGIN').run();
        try {
            const result = await txStorage.run(ctx, () => fn(query));
            ctx.active = false;
            db.prepare('COMMIT').run();
            return result;
        } catch (e) {
            ctx.active = false;
            try { db.prepare('ROLLBACK').run(); } catch { /* ignore rollback error */ }
            throw e;
        }
    } else {
        const pool = getMySQLPool();
        const conn: PoolConnection = await pool.getConnection();
        const ctx: TxContext = { engine: 'mysql', conn, active: true };
        try {
            await conn.beginTransaction();
        } catch (e) {
            conn.release();
            throw e;
        }

        try {
            const result = await txStorage.run(ctx, () => fn(query));
            ctx.active = false;
            await conn.commit();
            return result;
        } catch (e) {
            ctx.active = false;
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }
}

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
    const finalSql = preprocessSQL(sql);

    // Kontekst transakcji istnieje, ale jest już zamknięty (COMMIT/ROLLBACK): to zagubiony callback,
    // który przeżył transakcję. Zapytanie i tak idzie poza transakcją (pula / połączenie główne).
    const storedTx = txStorage.getStore();
    if (storedTx && !storedTx.active) {
        console.warn('[db] query po zakończeniu transakcji (zagubiony callback?):', finalSql.slice(0, 80));
    }

    if (isSQLite) {
        const db = getSQLiteDb();
        try {
            const stmt = db.prepare(finalSql);
            if (finalSql.trim().toUpperCase().startsWith('SELECT')) {
                return stmt.all(params || []) as T[];
            } else {
                const result = stmt.run(params || []);
                return [{ insertId: result.lastInsertRowid, affectedRows: result.changes }] as any;
            }
        } catch (error) {
            console.error('SQLite Query Error:', { sql: finalSql, params, error });
            throw error;
        }
    } else {
        const ctx = activeTx();
        if (ctx?.engine === 'mysql') {
            const [rows] = await ctx.conn.execute(finalSql, params || []);
            return rows as T[];
        }
        const pool = getMySQLPool();
        const [rows] = await pool.execute(finalSql, params);
        return rows as T[];
    }
}
