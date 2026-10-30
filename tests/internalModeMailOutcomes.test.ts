// Loop 4b, poprawki z przeglądu: mail pominięty w trybie wewnętrznym (sendEmail → skipped: 'INTERNAL_MODE')
// nie może wyglądać w panelu jak nieudana wysyłka. Server actions wołane bezpośrednio na SQLite
// (sesja i next/cache z atrap: tests/helpers/nextServerStubs.ts), sendEmail bez SMTP w trybie development.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type StubsModule = typeof import('./helpers/nextServerStubs');
type ProjectsModule = typeof import('../src/app/actions/projects');
type InvitationsModule = typeof import('../src/app/actions/invitations');
type ArchitectsModule = typeof import('../src/app/actions/architects');
type InternalModeModule = typeof import('../src/lib/internalMode');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { setTestSession }: StubsModule = await import(new URL('./helpers/nextServerStubs.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const projects: ProjectsModule = await import(new URL('../src/app/actions/projects.ts', import.meta.url).href);
const invitations: InvitationsModule = await import(new URL('../src/app/actions/invitations.ts', import.meta.url).href);
const architects: ArchitectsModule = await import(new URL('../src/app/actions/architects.ts', import.meta.url).href);
const internal: InternalModeModule = await import(new URL('../src/lib/internalMode.ts', import.meta.url).href);
const db = testDb.db;

const savedEnv = { NODE_ENV: process.env.NODE_ENV, EMAIL_HOST: process.env.EMAIL_HOST, PORTAL_INTERNAL_MODE: process.env.PORTAL_INTERNAL_MODE };
(process.env as any).NODE_ENV = 'development';
delete process.env.EMAIL_HOST;
const quietLog = console.log;
const quietInfo = console.info;
console.log = () => {};
console.info = () => {};

test.after(() => {
    console.log = quietLog;
    console.info = quietInfo;
    for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete (process.env as any)[key];
        else (process.env as any)[key] = value;
    }
    testDb.cleanup();
});

const setMode = (on: boolean) => { if (on) process.env.PORTAL_INTERNAL_MODE = '1'; else delete process.env.PORTAL_INTERNAL_MODE; };

db.prepare("INSERT INTO users (id, name, email, role) VALUES ('u_admin', 'Admin', 'admin@test.local', 'ADMIN')").run();
db.prepare("INSERT INTO users (id, name, email, role) VALUES ('u_archi', 'Architekt', 'archi@test.local', 'ARCHI')").run();
for (const slug of ['ARCHITECT_REGISTERED', 'ARCHITECT_INVITED', 'PROFILE_INCOMPLETE']) {
    db.prepare("INSERT INTO email_templates (id, slug, name, subject, content) VALUES (?, ?, ?, 'Temat', '<p>Treść</p>')").run(`t_${slug}`, slug, slug);
}
setTestSession({ id: 'u_admin', role: 'ADMIN', name: 'Admin' });

test('constants: welcome-mail and invitation notes for internal mode', () => {
    assert.equal(internal.INTERNAL_MODE_WELCOME_SKIPPED, 'Mail powitalny pominięty (tryb wewnętrzny)');
    assert.equal(internal.INTERNAL_MODE_INVITATION_NOTE, 'pominięto: tryb wewnętrzny');
    assert.equal(internal.isSkippedByInternalMode({ success: false, skipped: 'INTERNAL_MODE' }), true);
    assert.equal(internal.isSkippedByInternalMode({ success: false, error: 'x' }), false);
    assert.equal(internal.isSkippedByInternalMode(undefined), false);
});

// ─── rejestracja architekta ──────────────────────────────────────────────────

test('registerArchitect in internal mode reports the skipped welcome mail, not an error', async () => {
    setMode(true);
    const result = await projects.registerArchitect({ first_name: 'Jan', last_name: 'Wewnętrzny', email: 'jan.w@test.local', is_vat_payer: false, password: 'Haslo-Testowe-2026' });
    assert.equal(result.success, true);
    assert.equal(result.emailSent, false);
    assert.equal(result.emailError, null);
    assert.equal(result.emailSkipped, 'Mail powitalny pominięty (tryb wewnętrzny)');
});

test('registerArchitect without the variable sends as before (no skip note)', async () => {
    setMode(false);
    const result = await projects.registerArchitect({ first_name: 'Ola', last_name: 'Zwykła', email: 'ola.z@test.local', is_vat_payer: false, password: 'Haslo-Testowe-2026' });
    assert.equal(result.emailSent, true);
    assert.equal(result.emailError, null);
    assert.equal(result.emailSkipped, null);
});

test('registration modal shows the skip note as info instead of the failure banner', async () => {
    const modal = await readFile(new URL('../src/components/ArchitectRegistrationModal.tsx', import.meta.url), 'utf8');
    assert.match(modal, /setEmailSkipped\(res\.emailSkipped \?\? null\)/);
    assert.match(modal, /emailSkipped \? \(/);
    assert.match(modal, /<Banner tone="info" title=\{emailSkipped\}/);
});

// ─── zaproszenia ─────────────────────────────────────────────────────────────

let invSeq = 0;
function invitation(): string {
    const id = `inv_${++invSeq}`;
    const token = String(invSeq).padStart(64, 'a');
    db.prepare("INSERT INTO invitations (id, email, name, role, token, status, expires_at) VALUES (?, ?, 'Zaproszony', 'ARCHI', ?, 'PENDING', datetime('now', '+5 day'))")
        .run(id, `${id}@test.local`, token);
    return id;
}
const invRow = (id: string) => db.prepare('SELECT sent_at, send_count, last_error FROM invitations WHERE id = ?').get(id) as any;

test('sendInvitations in internal mode: skipped, not failed; distinguishable last_error', async () => {
    setMode(true);
    const a = invitation();
    const b = invitation();
    const result = await invitations.sendInvitations([a, b]);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.skippedInternalMode, 2);
    assert.deepEqual(result.rows.map((r) => [r.ok, r.skippedInternalMode, r.error]), [
        [false, true, 'pominięto: tryb wewnętrzny'],
        [false, true, 'pominięto: tryb wewnętrzny'],
    ]);
    assert.deepEqual(invRow(a), { sent_at: null, send_count: 0, last_error: 'pominięto: tryb wewnętrzny' });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM activity_logs WHERE event_type = 'INVITATIONS_SENT'").get() as any).n, 0);

    const resend = await invitations.resendInvitation(a);
    assert.equal(resend.failed, 0);
    assert.equal(resend.skippedInternalMode, 1);
});

test('sendInvitations without the variable sends and clears the skip note', async () => {
    setMode(true);
    const id = invitation();
    await invitations.sendInvitations([id]);
    setMode(false);
    const result = await invitations.sendInvitations([id]);
    assert.equal(result.sent, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.skippedInternalMode, 0);
    const row = invRow(id);
    assert.equal(row.send_count, 1);
    assert.equal(row.last_error, null);
    assert.ok(row.sent_at);
});

test('invitations UI: skipped mails counted separately, row shows the internal-mode note, not "Błąd wysyłki"', async () => {
    const client = await readFile(new URL('../src/app/dashboard/admin/invitations/InvitationsClient.tsx', import.meta.url), 'utf8');
    assert.match(client, /skippedInternal \+= res\.skippedInternalMode/);
    assert.match(client, /!r\.ok && !r\.skippedInternalMode/);
    assert.match(client, /Pominięte \(tryb wewnętrzny\)/);
    assert.match(client, /inv\.last_error === INTERNAL_MODE_INVITATION_NOTE/);
    assert.match(client, /res\.skippedInternalMode === 1/);
});

// ─── pozostałe miejsca, w których wynik maila trafia do UI ───────────────────

test('notifyArchitectProfileIncomplete reports the skip in internal mode', async () => {
    setMode(true);
    assert.deepEqual(await architects.notifyArchitectProfileIncomplete('u_archi'), { success: true, skipped: 'INTERNAL_MODE' });
    setMode(false);
    assert.deepEqual(await architects.notifyArchitectProfileIncomplete('u_archi'), { success: true });
    const queue = await readFile(new URL('../src/admin/components/AdminPayoutsQueue.tsx', import.meta.url), 'utf8');
    assert.match(queue, /Pominięto \(tryb wewnętrzny\)/);
});

test('test e-mail from template settings shows the internal-mode skip, not "Błąd wysyłki"', async () => {
    const emails = await readFile(new URL('../src/app/dashboard/admin/settings/emails/EmailsClient.tsx', import.meta.url), 'utf8');
    assert.match(emails, /isSkippedByInternalMode\(res\)/);
    assert.match(emails, /tryb wewnętrzny/);
});
