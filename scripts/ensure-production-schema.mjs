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
    // 019: integracja Subiekt GT — pochodzenie pozycji projektu
    { table: 'project_items', name: 'source', definition: "VARCHAR(16) NOT NULL DEFAULT 'MANUAL'" },
    { table: 'project_items', name: 'subiekt_document_id', definition: 'VARCHAR(36) NULL' },
    { table: 'project_items', name: 'subiekt_position_id', definition: 'INTEGER NULL' },
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

// 018: zaproszenia do portalu (masowe dodawanie architektów przez link aktywacyjny).
const requiredTables = [
    {
        name: 'invitations',
        createSql: `CREATE TABLE IF NOT EXISTS invitations (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            name VARCHAR(255) NULL,
            studio_name VARCHAR(255) NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'ARCHI',
            token VARCHAR(64) NOT NULL UNIQUE,
            status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            invited_by VARCHAR(36) NULL,
            expires_at DATETIME NOT NULL,
            sent_at DATETIME NULL,
            send_count INT NOT NULL DEFAULT 0,
            last_error TEXT NULL,
            accepted_at DATETIME NULL,
            accepted_user_id VARCHAR(36) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_invitations_email (email),
            INDEX idx_invitations_status (status)
        )`,
    },
];

// 018: szablon maila z zaproszeniem — dodawany tylko, gdy brak slugu (ręczne edycje admina zostają).
const requiredEmailTemplates = [
    {
        id: 'et_8',
        slug: 'ARCHITECT_INVITED',
        name: 'Zaproszenie do portalu',
        subject: 'Zaproszenie do Panelu Architekta WallDecor',
        content: '<p>Dzień dobry,</p><p>zapraszamy Cię do <strong>Panelu Architekta WallDecor</strong> — miejsca, w którym w jednym widoku zobaczysz projekty realizowane wspólnie z nami, zamówienia i rozliczenia prowizyjne.</p><p>Po aktywacji konta możesz:</p><ul><li>sprawdzać status aktualnych projektów i zamówień,</li><li>śledzić etap realizacji poszczególnych zgłoszeń,</li><li>kontrolować aktualną wartość prowizji dostępnej do wypłaty,</li><li>sprawdzać historię rozliczeń,</li><li>korzystać z dostępnych środków cashback,</li><li>dodawać faktury PDF potrzebne do wypłaty prowizji,</li><li>sprawdzać swój aktualny poziom prowizyjny.</li></ul><p style="background:#f8f7f5;border-radius:12px;padding:20px;margin:24px 0;"><strong>Aktywacja konta:</strong><br><br><a href="{{invite_link}}" style="display:inline-block;background:#1a1917;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">Aktywuj konto i ustaw hasło</a><br><br>Login: <strong>{{email}}</strong><br>Link jest ważny do <strong>{{expires_at}}</strong>.</p><p style="color:#666;font-size:13px;">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br>{{invite_link}}</p><p>Jeśli nie spodziewasz się tej wiadomości, po prostu ją zignoruj — konto nie zostanie utworzone.</p><p>W razie pytań pozostajemy do dyspozycji.</p><p>Pozdrawiamy serdecznie,<br><strong>Zespół WallDecor</strong></p>',
        description: 'Wysyłane do zaproszonego architekta: link aktywacyjny do założenia konta (moduł Zaproszenia)',
    },
];

async function ensureTable(connection, databaseName, table) {
    const [rows] = await connection.execute(
        `SELECT COUNT(*) AS count
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [databaseName, table.name]
    );
    if (Number(rows[0]?.count || 0) > 0) return false;
    await connection.query(table.createSql);
    return true;
}

async function ensureEmailTemplate(connection, template) {
    const [rows] = await connection.execute(
        'SELECT COUNT(*) AS count FROM email_templates WHERE slug = ?',
        [template.slug]
    );
    if (Number(rows[0]?.count || 0) > 0) return false;
    await connection.execute(
        'INSERT INTO email_templates (id, slug, name, subject, content, description) VALUES (?, ?, ?, ?, ?, ?)',
        [template.id, template.slug, template.name, template.subject, template.content, template.description]
    );
    return true;
}

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

        for (const table of requiredTables) {
            if (await ensureTable(connection, DB_NAME, table)) {
                console.log(`[schema] Created table: ${table.name}`);
            }
        }

        for (const template of requiredEmailTemplates) {
            if (await ensureEmailTemplate(connection, template)) {
                console.log(`[schema] Added email template: ${template.slug}`);
            }
        }
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
