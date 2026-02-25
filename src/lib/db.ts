import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';

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
        sqliteDb = new Database(process.env.DB_PATH || 'database.sqlite');
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

    return processed;
}

/**
 * Runs a callback inside a DB transaction.
 * The callback receives a `queryFn` bound to the transaction's connection.
 * On failure the transaction is rolled back automatically.
 */
export async function withTransaction<T>(fn: (queryFn: typeof query) => Promise<T>): Promise<T> {
    if (isSQLite) {
        const db = getSQLiteDb();
        db.prepare('BEGIN').run();
        try {
            const result = await fn(query);
            db.prepare('COMMIT').run();
            return result;
        } catch (e) {
            try { db.prepare('ROLLBACK').run(); } catch { /* ignore rollback error */ }
            throw e;
        }
    } else {
        const pool = getMySQLPool();
        const conn = await pool.getConnection();
        await conn.beginTransaction();

        const transactionalQuery = async <R>(sql: string, params?: any[]): Promise<R[]> => {
            const finalSql = preprocessSQL(sql);
            const [rows] = await conn.execute(finalSql, params || []);
            return rows as R[];
        };

        try {
            const result = await fn(transactionalQuery as typeof query);
            await conn.commit();
            return result;
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }
}

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
    const finalSql = preprocessSQL(sql);

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
        const pool = getMySQLPool();
        const [rows] = await pool.execute(finalSql, params);
        return rows as T[];
    }
}
