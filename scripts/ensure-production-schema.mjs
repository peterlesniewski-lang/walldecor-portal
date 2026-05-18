import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const requiredProjectColumns = [
    { name: 'completed_by', definition: 'VARCHAR(255) NULL' },
    { name: 'completed_at', definition: 'DATETIME NULL' },
    { name: 'completion_note', definition: 'TEXT NULL' },
];

async function ensureColumn(connection, databaseName, tableName, column) {
    const [rows] = await connection.execute(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [databaseName, tableName, column.name]
    );

    if (Number(rows[0]?.count || 0) > 0) return false;

    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`);
    return true;
}

async function main() {
    if (process.env.DB_TYPE !== 'mysql') {
        console.log('[schema] DB_TYPE is not mysql; skipping production schema checks.');
        return;
    }

    const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    if (!DB_HOST || !DB_USER || !DB_NAME) {
        throw new Error('[schema] Missing DB_HOST, DB_USER or DB_NAME for MySQL schema check.');
    }

    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
    });

    try {
        const added = [];
        for (const column of requiredProjectColumns) {
            if (await ensureColumn(connection, DB_NAME, 'projects', column)) {
                added.push(column.name);
            }
        }

        if (added.length > 0) {
            console.log(`[schema] Added project audit columns: ${added.join(', ')}`);
        } else {
            console.log('[schema] Project audit columns already present.');
        }
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
