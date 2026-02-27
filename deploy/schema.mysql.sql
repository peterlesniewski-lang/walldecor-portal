-- WallDecor Portal — MySQL Production Schema
-- Generated from SQLite schema (all migrations applied through 011)
-- Run ONCE on a fresh MySQL database: mysql -u walldecor -p walldecor_prod < schema.mysql.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── Core tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    role VARCHAR(50) DEFAULT 'ARCHI',
    commission_rate DECIMAL(15,4) DEFAULT 0.00,
    cashback_rate DECIMAL(15,4) DEFAULT 2.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    studio_name VARCHAR(255),
    nip VARCHAR(20),
    address TEXT,
    is_vat_payer TINYINT(1) DEFAULT 0,
    bank_account VARCHAR(50),
    tier_override TEXT NULL,
    last_login_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(255) PRIMARY KEY,
    owner_id VARCHAR(255),
    name VARCHAR(255),
    client_label VARCHAR(255),
    status VARCHAR(50) DEFAULT 'ZGŁOSZONY',
    staff_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_items (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255),
    type TEXT NOT NULL,
    amount_net DECIMAL(15,2) NOT NULL,
    category TEXT,
    description TEXT,
    commission_rate DECIMAL(15,4) DEFAULT 0.15,
    order_number TEXT NULL,
    invoice_number TEXT NULL,
    is_paid TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commissions (
    id VARCHAR(255) PRIMARY KEY,
    project_item_id VARCHAR(255),
    architect_id VARCHAR(255),
    amount_net DECIMAL(15,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'EARNED',
    payout_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    project_id VARCHAR(255) NULL,
    note TEXT NULL,
    FOREIGN KEY (project_item_id) REFERENCES project_items(id),
    FOREIGN KEY (architect_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    type TEXT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    related_item_id VARCHAR(255) NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    reference_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    event_type VARCHAR(100),
    description TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payout_requests (
    id VARCHAR(255) PRIMARY KEY,
    architect_id VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    type VARCHAR(50) NOT NULL DEFAULT 'CASHBACK',
    invoice_url TEXT,
    invoice_number VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    processed_by VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cashback_redemptions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    code TEXT,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_templates (
    id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    content LONGTEXT NOT NULL,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_files (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL,
    original_name VARCHAR(500) NOT NULL,
    stored_name VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INT NOT NULL,
    category VARCHAR(20) DEFAULT 'DOC',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Seed: email templates ────────────────────────────────────────────────────

INSERT IGNORE INTO email_templates (id, slug, name, subject, content, description) VALUES
('et_1', 'PROJECT_ADDED_USER', 'Potwierdzenie zgłoszenia projektu',
 'Dziękujemy za zgłoszenie projektu',
 '<p>Cześć <strong>{{user_name}}</strong>,</p><p>Twój projekt <strong>{{project_name}}</strong> został pomyślnie zgłoszony. Wkrótce skontaktujemy się z Tobą.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
 'Wysyłane do architekta po zgłoszeniu projektu'),

('et_2', 'PROJECT_ADDED_ADMIN', 'Nowy projekt do weryfikacji',
 'Nowy projekt: {{project_name}}',
 '<p>Nowy projekt <strong>{{project_name}}</strong> został zgłoszony przez <strong>{{user_name}}</strong>.</p>',
 'Wysyłane do admina po zgłoszeniu projektu'),

('et_3', 'PROJECT_ACCEPTED', 'Projekt został zaakceptowany',
 'Twój projekt {{project_name}} został zaakceptowany',
 '<p>Cześć <strong>{{user_name}}</strong>,</p><p>Z przyjemnością informujemy, że Twój projekt <strong>{{project_name}}</strong> został zaakceptowany.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
 'Wysyłane do architekta po akceptacji projektu'),

('et_4', 'PAYOUT_REDEEMED_CARD', 'Twoja karta rabatowa jest gotowa',
 'Karta rabatowa WallDecor',
 '<p>Cześć <strong>{{user_name}}</strong>,</p><p>Twoja karta rabatowa jest gotowa do odbioru.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
 'Wysyłane po przygotowaniu karty rabatowej'),

('et_5', 'PAYOUT_PROCESSED', 'Wypłata została zrealizowana',
 'Wypłata {{amount}} PLN zrealizowana',
 '<p>Cześć <strong>{{user_name}}</strong>,</p><p>Twoja wypłata w wysokości <strong>{{amount}} PLN</strong> została przelana na konto bankowe.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
 'Wysyłane po wykonaniu przelewu'),

('et_6', 'ARCHITECT_REGISTERED', 'Rejestracja konta architekta',
 'Twoje konto w Portalu WallDecor jest gotowe',
 '<p>Cześć <strong>{{user_name}}</strong>,</p><p>Zostało dla Ciebie założone konto w <strong>Portalu Architekta WallDecor</strong>.</p><p style="background:#f8f7f5;border-radius:12px;padding:20px;margin:24px 0;"><strong>Twoje dane logowania:</strong><br><br>Login (email): <strong>{{email}}</strong><br>Hasło tymczasowe: <strong style="font-family:monospace;font-size:16px;letter-spacing:2px;">{{password}}</strong></p><p>Zaloguj się tutaj: <a href="{{portal_url}}">{{portal_url}}</a></p><p style="color:#999;font-size:12px;">Zalecamy zmianę hasła po pierwszym logowaniu.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
 'Wysyłane do nowego architekta po założeniu konta');

SET FOREIGN_KEY_CHECKS = 1;
