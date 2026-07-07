import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

dotenv.config();

const dbPath = resolve(process.env.DB_PATH || './walldecor.sqlite');
const adminPassword = process.env.DEV_ADMIN_PASSWORD || 'Admin12345';

const emailTemplates = [
    {
        id: 'et_1',
        slug: 'PROJECT_ADDED_USER',
        name: 'Potwierdzenie zgłoszenia projektu',
        subject: 'Dziękujemy za zgłoszenie projektu',
        content: '<p>Cześć <strong>{{user_name}}</strong>,</p><p>Twój projekt <strong>{{project_name}}</strong> został pomyślnie zgłoszony. Wkrótce skontaktujemy się z Tobą.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
        description: 'Wysyłane do architekta po zgłoszeniu projektu',
    },
    {
        id: 'et_2',
        slug: 'PROJECT_ADDED_ADMIN',
        name: 'Nowy projekt do weryfikacji',
        subject: 'Nowy projekt: {{project_name}}',
        content: '<p>Nowy projekt <strong>{{project_name}}</strong> został zgłoszony przez <strong>{{user_name}}</strong>.</p>',
        description: 'Wysyłane do admina po zgłoszeniu projektu',
    },
    {
        id: 'et_3',
        slug: 'PROJECT_ACCEPTED',
        name: 'Projekt został zaakceptowany',
        subject: 'Twój projekt {{project_name}} został zaakceptowany',
        content: '<p>Cześć <strong>{{user_name}}</strong>,</p><p>Z przyjemnością informujemy, że Twój projekt <strong>{{project_name}}</strong> został zaakceptowany.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
        description: 'Wysyłane do architekta po akceptacji projektu',
    },
    {
        id: 'et_5',
        slug: 'PAYOUT_PROCESSED',
        name: 'Wypłata została zrealizowana',
        subject: 'Wypłata {{amount}} PLN zrealizowana',
        content: '<p>Cześć <strong>{{user_name}}</strong>,</p><p>Twoja wypłata w wysokości <strong>{{amount}} PLN</strong> została przelana na konto bankowe.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
        description: 'Wysyłane po wykonaniu przelewu',
    },
    {
        id: 'et_6',
        slug: 'ARCHITECT_REGISTERED',
        name: 'Rejestracja konta architekta',
        subject: 'Dostęp do Panelu Architekta WallDecor',
        content: '<p>Dzień dobry,</p><p>utworzyliśmy dla Ciebie konto w <strong>Panelu Architekta WallDecor</strong>.</p><p>Panel ułatwi bieżącą współpracę z nami i zapewni szybki dostęp do najważniejszych informacji dotyczących projektów, zamówień oraz rozliczeń prowizyjnych.</p><p>Po zalogowaniu możesz:</p><ul><li>sprawdzać status aktualnych projektów i zamówień,</li><li>śledzić etap realizacji poszczególnych zgłoszeń,</li><li>kontrolować aktualną wartość prowizji dostępnej do wypłaty,</li><li>sprawdzać historię rozliczeń,</li><li>korzystać z dostępnych środków cashback,</li><li>dodawać faktury PDF potrzebne do wypłaty prowizji,</li><li>sprawdzać swój aktualny poziom prowizyjny.</li></ul><p style="background:#f8f7f5;border-radius:12px;padding:20px;margin:24px 0;"><strong>Dane do logowania:</strong><br><br>Adres panelu: <a href="{{portal_url}}">{{portal_url}}</a><br>Login: <strong>{{email}}</strong><br>Hasło tymczasowe: <strong style="font-family:monospace;font-size:16px;letter-spacing:2px;">{{password}}</strong></p><p>Po pierwszym zalogowaniu system poprosi Cię o ustawienie własnego hasła.</p><p>Mamy nadzieję, że Panel Architekta usprawni naszą współpracę i pozwoli wygodniej zarządzać projektami realizowanymi wspólnie z WallDecor.</p><p>W razie pytań lub problemów z logowaniem pozostajemy oczywiście do dyspozycji.</p><p>Pozdrawiamy serdecznie,<br><strong>Zespół WallDecor</strong></p>',
        description: 'Wysyłane do nowego architekta po założeniu konta',
    },
    {
        id: 'et_7',
        slug: 'PASSWORD_RESET',
        name: 'Reset hasła',
        subject: 'Reset hasła — Portal Architekta WallDecor',
        content: '<p>Cześć,</p><p>Otrzymaliśmy prośbę o reset hasła do Twojego konta w <strong>Portalu Architekta WallDecor</strong>.</p><p style="background:#f8f7f5;border-radius:12px;padding:20px;margin:24px 0;text-align:center;"><a href="{{reset_link}}" style="display:inline-block;background:linear-gradient(135deg,#D4AF37,#FFD700);color:#000;font-weight:900;padding:14px 32px;border-radius:999px;text-decoration:none;font-size:14px;letter-spacing:0.1em;text-transform:uppercase;">Resetuj hasło</a></p><p style="font-size:13px;color:#666;">Link jest ważny przez <strong>1 godzinę</strong>. Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
        description: 'Wysyłane po kliknięciu "Zapomniałem hasła" na stronie logowania',
    },
    {
        id: 'et_8',
        slug: 'PROFILE_INCOMPLETE',
        name: 'Prośba o uzupełnienie profilu',
        subject: 'Uzupełnij swój profil w Portalu Architekta WallDecor',
        content: '<p>Cześć {{user_name}},</p><p>Zauważyliśmy, że Twój profil w <strong>Portalu Architekta WallDecor</strong> nie jest w pełni uzupełniony — brakuje m.in. numeru konta bankowego lub danych do faktury.</p><p>Bez tych informacji nie będziemy mogli zrealizować Twojej wypłaty prowizji.</p><p>Zaloguj się do panelu i uzupełnij swoje dane w profilu.</p><p>Pozdrawiamy,<br>Zespół WallDecor</p>',
        description: 'Wysyłane do architekta gdy brakuje danych bankowych przy próbie wypłaty',
    },
];

function createSchema(db) {
    db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT NULL,
            provider TEXT NOT NULL DEFAULT 'credentials',
            provider_account_id TEXT NULL,
            role TEXT DEFAULT 'ARCHI',
            commission_rate REAL DEFAULT 0.00,
            cashback_rate REAL DEFAULT 2.00,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            first_name TEXT,
            last_name TEXT,
            studio_name TEXT,
            nip TEXT,
            address TEXT,
            is_vat_payer INTEGER DEFAULT 0,
            bank_account TEXT,
            tier_override TEXT NULL,
            last_login_at TEXT NULL,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            password_changed_at TEXT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_account ON users(provider, provider_account_id);

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            owner_id TEXT,
            name TEXT,
            client_label TEXT,
            status TEXT DEFAULT 'ZGŁOSZONY',
            staff_id TEXT,
            completed_by TEXT NULL,
            completed_at TEXT NULL,
            completion_note TEXT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id),
            FOREIGN KEY (completed_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS project_items (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            type TEXT NOT NULL,
            amount_net REAL NOT NULL,
            category TEXT,
            description TEXT,
            commission_rate REAL DEFAULT 0.15,
            order_number TEXT NULL,
            invoice_number TEXT NULL,
            is_paid INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE TABLE IF NOT EXISTS commissions (
            id TEXT PRIMARY KEY,
            project_item_id TEXT,
            architect_id TEXT,
            amount_net REAL NOT NULL,
            status TEXT DEFAULT 'EARNED',
            payout_id TEXT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            project_id TEXT NULL,
            note TEXT NULL,
            rate REAL NULL,
            FOREIGN KEY (project_item_id) REFERENCES project_items(id),
            FOREIGN KEY (architect_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS wallet_transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            related_item_id TEXT NULL,
            expires_at TEXT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            description TEXT,
            reference_id TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            event_type TEXT,
            description TEXT,
            metadata TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS payout_requests (
            id TEXT PRIMARY KEY,
            architect_id TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            type TEXT NOT NULL DEFAULT 'CASHBACK',
            invoice_url TEXT,
            invoice_number TEXT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            processed_at TEXT NULL,
            processed_by TEXT NULL,
            FOREIGN KEY (architect_id) REFERENCES users(id),
            FOREIGN KEY (processed_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS cashback_redemptions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            amount REAL NOT NULL,
            code TEXT,
            status TEXT DEFAULT 'PENDING',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            processed_at TEXT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS email_templates (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            content TEXT NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS project_files (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            uploaded_by TEXT NOT NULL,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            category TEXT DEFAULT 'DOC',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id TEXT NOT NULL PRIMARY KEY,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);
}

function seedEmailTemplates(db) {
    const stmt = db.prepare(`
        INSERT INTO email_templates (id, slug, name, subject, content, description, is_active)
        VALUES (@id, @slug, @name, @subject, @content, @description, 1)
        ON CONFLICT(slug) DO UPDATE SET
            name = excluded.name,
            subject = excluded.subject,
            content = excluded.content,
            description = excluded.description,
            is_active = 1,
            updated_at = CURRENT_TIMESTAMP
    `);

    for (const template of emailTemplates) {
        stmt.run(template);
    }
}

async function seedAdmin(db) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    db.prepare(`
        INSERT INTO users (id, name, email, password, role, must_change_password)
        VALUES ('admin_e2e_seed', 'Admin E2E', 'admin@e2e.walldecor.test', ?, 'ADMIN', 0)
        ON CONFLICT(email) DO UPDATE SET
            name = excluded.name,
            role = 'ADMIN',
            must_change_password = 0
    `).run(passwordHash);
}

function backfillHistoricalCommissionRates(db) {
    const result = db.prepare(`
        UPDATE commissions
        SET rate = ROUND(
            amount_net / (
                SELECT i.amount_net
                FROM project_items i
                WHERE i.id = commissions.project_item_id
            ),
            4
        )
        WHERE rate IS NULL
          AND status IN ('EARNED', 'IN_PAYMENT', 'PAID')
          AND EXISTS (
              SELECT 1
              FROM project_items i
              WHERE i.id = commissions.project_item_id
                AND i.amount_net > 0
          )
    `).run();

    if (result.changes > 0) {
        console.log(`[dev:init] Backfilled historical commission rates: ${result.changes}`);
    }
}

async function main() {
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);

    try {
        createSchema(db);
        backfillHistoricalCommissionRates(db);
        seedEmailTemplates(db);
        await seedAdmin(db);
        console.log(`[dev:init] SQLite database ready: ${dbPath}`);
        console.log('[dev:init] Admin login: admin@e2e.walldecor.test');
    } finally {
        db.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
