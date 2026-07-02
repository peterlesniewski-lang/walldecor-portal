import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const requiredColumns = [
    // 015: audyt zakończenia projektu
    { table: 'projects', name: 'completed_by', definition: 'VARCHAR(255) NULL' },
    { table: 'projects', name: 'completed_at', definition: 'DATETIME NULL' },
    { table: 'projects', name: 'completion_note', definition: 'TEXT NULL' },
    // 016: program partnerski — stawka zapisana na prowizji
    { table: 'commissions', name: 'rate', definition: 'DECIMAL(6,4) NULL' },
    // 016: wymuszenie zmiany hasła po pierwszym logowaniu
    { table: 'users', name: 'must_change_password', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'users', name: 'password_changed_at', definition: 'DATETIME NULL' },
];

// 017: jednorazowa aktualizacja szablonu maila powitalnego (tylko jeśli nie był ręcznie edytowany —
// warunek na stary temat), bez załączników, z informacją o wymuszonej zmianie hasła.
const architectRegisteredEmailUpdate = {
    sql: `UPDATE email_templates
          SET subject = ?, content = ?
          WHERE slug = 'ARCHITECT_REGISTERED'
            AND subject = 'Twoje konto w Portalu WallDecor jest gotowe'`,
    params: [
        'Dostęp do Panelu Architekta WallDecor',
        '<p>Dzień dobry,</p><p>utworzyliśmy dla Ciebie konto w <strong>Panelu Architekta WallDecor</strong>.</p><p>Panel ułatwi bieżącą współpracę z nami i zapewni szybki dostęp do najważniejszych informacji dotyczących projektów, zamówień oraz rozliczeń prowizyjnych.</p><p>Po zalogowaniu możesz:</p><ul><li>sprawdzać status aktualnych projektów i zamówień,</li><li>śledzić etap realizacji poszczególnych zgłoszeń,</li><li>kontrolować aktualną wartość prowizji dostępnej do wypłaty,</li><li>sprawdzać historię rozliczeń,</li><li>korzystać z dostępnych środków cashback,</li><li>dodawać faktury PDF potrzebne do wypłaty prowizji,</li><li>sprawdzać swój aktualny poziom prowizyjny.</li></ul><p style="background:#f8f7f5;border-radius:12px;padding:20px;margin:24px 0;"><strong>Dane do logowania:</strong><br><br>Adres panelu: <a href="{{portal_url}}">{{portal_url}}</a><br>Login: <strong>{{email}}</strong><br>Hasło tymczasowe: <strong style="font-family:monospace;font-size:16px;letter-spacing:2px;">{{password}}</strong></p><p>Po pierwszym zalogowaniu system poprosi Cię o ustawienie własnego hasła.</p><p>Mamy nadzieję, że Panel Architekta usprawni naszą współpracę i pozwoli wygodniej zarządzać projektami realizowanymi wspólnie z WallDecor.</p><p>W razie pytań lub problemów z logowaniem pozostajemy oczywiście do dyspozycji.</p><p>Pozdrawiamy serdecznie,<br><strong>Zespół WallDecor</strong></p>',
    ],
};

async function ensureColumn(connection, databaseName, column) {
    const [rows] = await connection.execute(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [databaseName, column.table, column.name]
    );

    if (Number(rows[0]?.count || 0) > 0) return false;

    await connection.query(`ALTER TABLE ${column.table} ADD COLUMN ${column.name} ${column.definition}`);
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
        for (const column of requiredColumns) {
            if (await ensureColumn(connection, DB_NAME, column)) {
                added.push(`${column.table}.${column.name}`);
            }
        }

        if (added.length > 0) {
            console.log(`[schema] Added columns: ${added.join(', ')}`);
        } else {
            console.log('[schema] Required columns already present.');
        }

        const [result] = await connection.execute(
            architectRegisteredEmailUpdate.sql,
            architectRegisteredEmailUpdate.params
        );
        if (result.affectedRows > 0) {
            console.log('[schema] Updated ARCHITECT_REGISTERED email template to the new welcome copy.');
        }
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
