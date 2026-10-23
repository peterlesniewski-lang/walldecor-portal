#!/usr/bin/env node
/**
 * WallDecor Portal — lokalna baza SQLite z danymi testowymi (tylko do podglądu UI).
 * Użycie: DB_PATH=dev.sqlite node scripts/seed-dev.mjs   (tworzy plik od zera, nadpisuje istniejący)
 * Konta testowe (hasło dla wszystkich: Portal-Test-2026!):
 *   admin@dev.local  (ADMIN) · zespol@dev.local (STAFF) · kamila@dev.local (ARCHI) · marcin@dev.local (ARCHI)
 */
import { createRequire } from 'node:module';
import { existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'package.json'));
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const DB_PATH = process.env.DB_PATH || 'dev.sqlite';
if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT,
  provider TEXT NOT NULL DEFAULT 'credentials', provider_account_id TEXT,
  role TEXT DEFAULT 'ARCHI', commission_rate REAL DEFAULT 0, cashback_rate REAL DEFAULT 2,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, first_name TEXT, last_name TEXT, studio_name TEXT,
  nip TEXT, address TEXT, is_vat_payer INTEGER DEFAULT 0, bank_account TEXT, tier_override TEXT, last_login_at TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0, password_changed_at TEXT
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, client_label TEXT, status TEXT DEFAULT 'ZGŁOSZONY',
  staff_id TEXT, completed_by TEXT, completed_at TEXT, completion_note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT
);
CREATE TABLE project_items (
  id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, amount_net REAL NOT NULL, category TEXT,
  description TEXT, commission_rate REAL DEFAULT 0.15, order_number TEXT, invoice_number TEXT, is_paid INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE commissions (
  id TEXT PRIMARY KEY, project_item_id TEXT, architect_id TEXT, amount_net REAL NOT NULL, status TEXT DEFAULT 'EARNED',
  payout_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, project_id TEXT, note TEXT, rate REAL
);
CREATE TABLE wallet_transactions (
  id TEXT PRIMARY KEY, user_id TEXT, type TEXT NOT NULL, amount REAL NOT NULL, related_item_id TEXT,
  expires_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, description TEXT, reference_id TEXT
);
CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY, user_id TEXT, event_type TEXT, description TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE payout_requests (
  id TEXT PRIMARY KEY, architect_id TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
  type TEXT NOT NULL DEFAULT 'CASHBACK', invoice_url TEXT, invoice_number TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, processed_at TEXT, processed_by TEXT
);
CREATE TABLE cashback_redemptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount REAL NOT NULL, code TEXT, status TEXT DEFAULT 'PENDING',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, processed_at TEXT
);
CREATE TABLE email_templates (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, subject TEXT NOT NULL, content TEXT NOT NULL,
  description TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE project_files (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, uploaded_by TEXT NOT NULL, original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL, mime_type TEXT NOT NULL, file_size INTEGER NOT NULL, category TEXT DEFAULT 'DOC',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const PASSWORD = 'Portal-Test-2026!';
const hash = bcrypt.hashSync(PASSWORD, 10);
const d = (daysAgo, h = 10) => {
  const t = new Date(Date.now() - daysAgo * 86400000); t.setHours(h, 15, 0, 0);
  return t.toISOString().slice(0, 19).replace('T', ' ');
};
const plus = (days) => d(-days);

const ins = (table, rows) => {
  for (const r of rows) {
    const cols = Object.keys(r).filter((c) => r[c] !== undefined);
    db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(cols.map((c) => r[c]));
  }
};

ins('users', [
  { id: 'u_admin', name: 'Anna Nowak', email: 'admin@dev.local', password: hash, role: 'ADMIN', created_at: d(400), last_login_at: d(0, 9) },
  { id: 'u_staff', name: 'Tomasz Zieliński', email: 'zespol@dev.local', password: hash, role: 'STAFF', created_at: d(300), last_login_at: d(1) },
  { id: 'u_kamila', name: 'Kamila Wiśniewska', email: 'kamila@dev.local', password: hash, role: 'ARCHI', first_name: 'Kamila', last_name: 'Wiśniewska', studio_name: 'Studio Wiśniewska', nip: '5252812345', address: 'ul. Puławska 176, 02-670 Warszawa', is_vat_payer: 1, bank_account: '12 1140 2004 0000 3002 7654 3210', created_at: d(200), last_login_at: d(2) },
  { id: 'u_marcin', name: 'Marcin Czubaszek', email: 'marcin@dev.local', password: hash, role: 'ARCHI', first_name: 'Marcin', last_name: 'Czubaszek', studio_name: 'Czubaszek Design', address: 'ul. Jagiellońska 52, 03-463 Warszawa', is_vat_payer: 0, created_at: d(120), last_login_at: d(20) },
  { id: 'u_ola', name: 'Aleksandra Bodecka', email: 'ola@dev.local', password: hash, role: 'ARCHI', first_name: 'Aleksandra', last_name: 'Bodecka', studio_name: 'Bodecka Interiors', tier_override: 'PARTNER_PLUS', created_at: d(90) },
]);

ins('projects', [
  { id: 'p_krupia', owner_id: 'u_kamila', name: 'Dom w Krupiej Wólce', client_label: 'Michał Trzebiński', status: 'ZAKOŃCZONY', staff_id: 'u_staff', completed_by: 'u_admin', completed_at: d(40), completion_note: 'Montaż odebrany', created_at: d(130), updated_at: d(40) },
  { id: 'p_mokotow', owner_id: 'u_kamila', name: 'Apartament Mokotów', client_label: 'Zk12/PUŁ/01/2026', status: 'ZAKOŃCZONY', staff_id: 'u_staff', completed_by: 'u_admin', completed_at: d(5), created_at: d(70), updated_at: d(5) },
  { id: 'p_kowalska', owner_id: 'u_marcin', name: 'Salon Kowalska', client_label: 'Kowalska Ola', status: 'W_REALIZACJI', staff_id: 'u_staff', created_at: d(30), updated_at: d(3) },
  { id: 'p_sielce', owner_id: 'u_marcin', name: 'Sielce', client_label: 'Nowak', status: 'PRZYJĘTY', created_at: d(12), updated_at: d(12) },
  { id: 'p_zoliborz', owner_id: 'u_ola', name: 'Willa Żoliborz', client_label: 'Państwo Kaczmarek', status: 'ZGŁOSZONY', created_at: d(1), updated_at: d(1) },
  { id: 'p_anulowany', owner_id: 'u_ola', name: 'Biuro Wola', client_label: 'Wola Office Sp. z o.o.', status: 'NIEZREALIZOWANY', created_at: d(60), updated_at: d(50) },
  { id: 'p_hist', owner_id: 'u_kamila', name: 'Kamienica Praga', client_label: 'Import historyczny', status: 'ZAKOŃCZONY', completed_by: 'u_admin', completed_at: d(300), completion_note: 'Import historyczny — prowizja rozliczona poza portalem', created_at: d(300), updated_at: d(300) },
]);

ins('project_items', [
  { id: 'i_krupia_1', project_id: 'p_krupia', type: 'PRODUCT', amount_net: 5000, category: 'Tapety', description: 'Tapetowanie w salonie i sypialni', commission_rate: 0.10, is_paid: 1, invoice_number: 'FV 118/06/2026' },
  { id: 'i_krupia_2', project_id: 'p_krupia', type: 'INSTALLATION', amount_net: 1200, category: 'Montaż', description: 'Montaż tapet', commission_rate: 0, is_paid: 1 },
  { id: 'i_mokotow_1', project_id: 'p_mokotow', type: 'PRODUCT', amount_net: 12000, category: 'Sztukateria', description: 'Listwy ścienne i gzymsy', commission_rate: 0.10, is_paid: 1, invoice_number: 'FV 201/10/2026' },
  { id: 'i_mokotow_2', project_id: 'p_mokotow', type: 'PRODUCT', amount_net: 3800, category: 'Zasłony', description: 'Zasłony na wymiar, 4 okna', commission_rate: 0.10, is_paid: 0 },
  { id: 'i_kowalska_1', project_id: 'p_kowalska', type: 'PRODUCT', amount_net: 5000, category: 'Tapety', description: 'Tapeta panoramiczna', commission_rate: 0.10 },
  { id: 'i_sielce_1', project_id: 'p_sielce', type: 'PRODUCT', amount_net: 14000, category: 'Sztukateria', description: 'Boazeria i sufity', commission_rate: 0.10 },
  { id: 'i_hist_1', project_id: 'p_hist', type: 'PRODUCT', amount_net: 9000, category: 'Tapety', description: 'Import z arkusza', commission_rate: 0.10, is_paid: 1 },
]);

ins('payout_requests', [
  { id: 'pr_krupia', architect_id: 'u_kamila', amount: 500, status: 'PENDING', type: 'COMMISSION', invoice_number: null, invoice_url: null, created_at: d(10) },
]);

ins('commissions', [
  { id: 'c_krupia', project_item_id: 'i_krupia_1', architect_id: 'u_kamila', project_id: 'p_krupia', amount_net: 500, status: 'IN_PAYMENT', payout_id: 'pr_krupia', rate: 0.10, created_at: d(40) },
  { id: 'c_mokotow_1', project_item_id: 'i_mokotow_1', architect_id: 'u_kamila', project_id: 'p_mokotow', amount_net: 1200, status: 'EARNED', rate: 0.10, created_at: d(5) },
  { id: 'c_mokotow_2', project_item_id: 'i_mokotow_2', architect_id: 'u_kamila', project_id: 'p_mokotow', amount_net: 380, status: 'EARNED', rate: 0.10, created_at: d(5) },
  { id: 'c_kowalska', project_item_id: 'i_kowalska_1', architect_id: 'u_marcin', project_id: 'p_kowalska', amount_net: 500, status: 'PENDING', rate: 0.10, note: 'Wycena pozycji po akceptacji', created_at: d(20) },
  { id: 'c_sielce', project_item_id: 'i_sielce_1', architect_id: 'u_marcin', project_id: 'p_sielce', amount_net: 1400, status: 'PENDING', rate: 0.10, note: 'Wycena pozycji po akceptacji', created_at: d(12) },
  { id: 'c_hist', project_item_id: 'i_hist_1', architect_id: 'u_kamila', project_id: 'p_hist', amount_net: 630, status: 'PAID', rate: 0.07, note: 'Import historyczny', created_at: d(300) },
]);

ins('wallet_transactions', [
  { id: 'w_krupia', user_id: 'u_kamila', type: 'EARN', amount: 100, related_item_id: 'i_krupia_1', expires_at: plus(325), created_at: d(40), description: 'Naliczenie Cashback: Dom w Krupiej Wólce' },
  { id: 'w_mokotow_1', user_id: 'u_kamila', type: 'EARN', amount: 240, related_item_id: 'i_mokotow_1', expires_at: plus(360), created_at: d(5), description: 'Naliczenie Cashback: Apartament Mokotów' },
  { id: 'w_mokotow_2', user_id: 'u_kamila', type: 'EARN', amount: 76, related_item_id: 'i_mokotow_2', expires_at: plus(360), created_at: d(5), description: 'Naliczenie Cashback: Apartament Mokotów' },
  { id: 'w_spend', user_id: 'u_kamila', type: 'SPEND', amount: -50, related_item_id: 'w_krupia', created_at: d(20), description: 'Karta rabatowa 50 PLN', reference_id: 'cr_1' },
]);

ins('cashback_redemptions', [
  { id: 'cr_1', user_id: 'u_kamila', amount: 50, code: 'WD-7F3K-2026', status: 'PENDING', created_at: d(20) },
]);

ins('activity_logs', [
  { id: 'a1', user_id: 'u_admin', event_type: 'PROJECT_COMPLETED', description: 'Zakończono projekt Apartament Mokotów', created_at: d(5) },
  { id: 'a2', user_id: 'u_kamila', event_type: 'PAYOUT_REQUESTED', description: 'Wniosek o wypłatę 500 PLN', created_at: d(10) },
  { id: 'a3', user_id: 'u_ola', event_type: 'PROJECT_SUBMITTED', description: 'Zgłoszono projekt Willa Żoliborz', created_at: d(1) },
]);

ins('email_templates', [
  { id: 'et_1', slug: 'PROJECT_ADDED_USER', name: 'Potwierdzenie zgłoszenia projektu', subject: 'Dziękujemy za zgłoszenie projektu', content: '<p>Cześć <strong>{{user_name}}</strong>, Twój projekt <strong>{{project_name}}</strong> został zgłoszony.</p>', description: 'Wysyłane do architekta po zgłoszeniu projektu' },
  { id: 'et_2', slug: 'PROJECT_ADDED_ADMIN', name: 'Nowy projekt do weryfikacji', subject: 'Nowy projekt: {{project_name}}', content: '<p>Nowy projekt <strong>{{project_name}}</strong> od <strong>{{user_name}}</strong>.</p>', description: 'Wysyłane do admina po zgłoszeniu projektu' },
  { id: 'et_3', slug: 'PROJECT_ACCEPTED', name: 'Projekt został zaakceptowany', subject: 'Twój projekt {{project_name}} został zaakceptowany', content: '<p>Cześć <strong>{{user_name}}</strong>, projekt <strong>{{project_name}}</strong> został zaakceptowany.</p>', description: 'Wysyłane do architekta po akceptacji projektu' },
  { id: 'et_4', slug: 'PAYOUT_REDEEMED_CARD', name: 'Twoja karta rabatowa jest gotowa', subject: 'Karta rabatowa WallDecor', content: '<p>Karta gotowa do odbioru.</p>', description: 'Wysyłane po przygotowaniu karty rabatowej' },
  { id: 'et_5', slug: 'PAYOUT_PROCESSED', name: 'Wypłata została zrealizowana', subject: 'Wypłata {{amount}} PLN zrealizowana', content: '<p>Wypłata <strong>{{amount}} PLN</strong> przelana.</p>', description: 'Wysyłane po wykonaniu przelewu' },
  { id: 'et_6', slug: 'ARCHITECT_REGISTERED', name: 'Rejestracja konta architekta', subject: 'Twoje konto w Portalu WallDecor jest gotowe', content: '<p>Login: {{email}}, hasło: {{password}}, {{portal_url}}</p>', description: 'Wysyłane do nowego architekta' },
  { id: 'et_7', slug: 'PASSWORD_RESET', name: 'Reset hasła', subject: 'Reset hasła — Portal Architekta WallDecor', content: '<p><a href="{{reset_link}}">Resetuj hasło</a></p>', description: 'Wysyłane po kliknięciu „Zapomniałem hasła”' },
]);

const counts = {};
for (const t of ['users', 'projects', 'project_items', 'commissions', 'wallet_transactions', 'payout_requests', 'cashback_redemptions', 'email_templates']) {
  counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
}
console.log(`Seed OK → ${DB_PATH}`, counts);
db.close();
