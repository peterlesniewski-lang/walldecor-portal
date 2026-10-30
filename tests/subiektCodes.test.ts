// Loop 4b (PLAN-SUBIEKT-2026-10-29.md): automatyczne kody architektów `A-001…` (src/lib/subiekt/codes.ts),
// nadawanie brakujących kodów z listy architektów i kod przy każdej ścieżce tworzenia konta ARCHI.
// Server actions wołane bezpośrednio — sesja i next/cache z atrap (tests/helpers/nextServerStubs.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type StubsModule = typeof import('./helpers/nextServerStubs');
type CodesModule = typeof import('../src/lib/subiekt/codes');
type SubiektActionsModule = typeof import('../src/app/actions/subiekt');
type ImportModule = typeof import('../src/app/actions/import');
type ProjectsModule = typeof import('../src/app/actions/projects');
type AcceptInvitationModule = typeof import('../src/app/api/auth/accept-invitation/route');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { setTestSession }: StubsModule = await import(new URL('./helpers/nextServerStubs.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const codes: CodesModule = await import(new URL('../src/lib/subiekt/codes.ts', import.meta.url).href);
const subiektActions: SubiektActionsModule = await import(new URL('../src/app/actions/subiekt.ts', import.meta.url).href);
const importActions: ImportModule = await import(new URL('../src/app/actions/import.ts', import.meta.url).href);
const projectActions: ProjectsModule = await import(new URL('../src/app/actions/projects.ts', import.meta.url).href);
const acceptInvitation: AcceptInvitationModule = await import(new URL('../src/app/api/auth/accept-invitation/route.ts', import.meta.url).href);
const { NextRequest } = await import('next/server.js');
const db = testDb.db;

test.after(() => testDb.cleanup());

const ADMIN = { id: 'u_admin', role: 'ADMIN', name: 'Admin' };
const STAFF = { id: 'u_staff', role: 'STAFF', name: 'Zespół' };
db.prepare("INSERT INTO users (id, name, email, role) VALUES ('u_admin', 'Admin', 'admin@test.local', 'ADMIN')").run();
db.prepare("INSERT INTO users (id, name, email, role) VALUES ('u_staff', 'Zespół', 'staff@test.local', 'STAFF')").run();

let seq = 0;
function addArchi(code: string | null, createdAt = '2026-01-01 10:00:00', name = `Architekt ${++seq}`): string {
    const id = `u_archi_${++seq}`;
    db.prepare("INSERT INTO users (id, name, email, role, subiekt_code, created_at) VALUES (?, ?, ?, 'ARCHI', ?, ?)")
        .run(id, name, `${id}@test.local`, code, createdAt);
    return id;
}
const codeOf = (id: string) => (db.prepare('SELECT subiekt_code FROM users WHERE id = ?').get(id) as any)?.subiekt_code ?? null;
const codeByEmail = (email: string) => (db.prepare('SELECT subiekt_code FROM users WHERE email = ?').get(email) as any)?.subiekt_code ?? null;
const resetArchitects = () => db.prepare("DELETE FROM users WHERE role = 'ARCHI'").run();

// ─── nextSubiektCode ──────────────────────────────────────────────────────

test('nextSubiektCode: empty database → A-001', async () => {
    resetArchitects();
    assert.equal(await codes.nextSubiektCode(), 'A-001');
});

test('nextSubiektCode: existing A-001 and A-003 → A-004 (largest number + 1, gaps not reused)', async () => {
    resetArchitects();
    addArchi('A-001');
    addArchi('A-003');
    assert.equal(await codes.nextSubiektCode(), 'A-004');
});

test('nextSubiektCode: manual A-1200 → A-1201; after A-999 comes A-1000', async () => {
    resetArchitects();
    addArchi('A-007');
    addArchi('A-1200');
    assert.equal(await codes.nextSubiektCode(), 'A-1201');

    resetArchitects();
    addArchi('A-999');
    assert.equal(await codes.nextSubiektCode(), 'A-1000');
});

test('nextSubiektCode: codes outside ^A-(\\d+)$ are ignored', async () => {
    resetArchitects();
    addArchi('A-002');
    addArchi('C-900');
    addArchi('A-12X');
    addArchi('AB-500');
    addArchi('A-');
    addArchi('XA-700');
    assert.equal(await codes.nextSubiektCode(), 'A-003');
});

test('formatSubiektCode pads to 3 digits and generated codes pass the edit-modal format', () => {
    assert.equal(codes.formatSubiektCode(1), 'A-001');
    assert.equal(codes.formatSubiektCode(42), 'A-042');
    assert.equal(codes.formatSubiektCode(999), 'A-999');
    assert.equal(codes.formatSubiektCode(1000), 'A-1000');
    for (const code of ['A-001', 'A-1000']) assert.match(code, /^[A-Z0-9_-]{1,64}$/);
});

// ─── assignMissingSubiektCodes ─────────────────────────────────────────────

test('assignMissingSubiektCodesOp: only architects without a code, ordered by created_at then name, logged', async () => {
    resetArchitects();
    db.prepare("DELETE FROM activity_logs").run();
    const kept = addArchi('A-005', '2025-01-01 10:00:00', 'Ma Kod');
    const late = addArchi(null, '2026-03-01 10:00:00', 'Aaa Późny');
    const earlyB = addArchi(null, '2026-01-01 10:00:00', 'Bogdan Wcześnie');
    const earlyA = addArchi(null, '2026-01-01 10:00:00', 'Adam Wcześnie');
    const empty = addArchi('', '2026-02-01 10:00:00', 'Pusty Kod');
    db.prepare("INSERT INTO users (id, name, email, role) VALUES ('u_staff2', 'Bez kodu STAFF', 'staff2@test.local', 'STAFF')").run();

    assert.equal(await codes.countArchitectsWithoutCode(), 4);
    const result = await codes.assignMissingSubiektCodesOp(ADMIN.id);
    assert.equal(result.assigned, 4);

    assert.equal(codeOf(kept), 'A-005');
    assert.equal(codeOf(earlyA), 'A-006');
    assert.equal(codeOf(earlyB), 'A-007');
    assert.equal(codeOf(empty), 'A-008');
    assert.equal(codeOf(late), 'A-009');
    assert.equal(codeOf('u_staff2'), null, 'STAFF nie dostaje kodu architekta');
    assert.equal(await codes.countArchitectsWithoutCode(), 0);

    const logs = db.prepare("SELECT * FROM activity_logs WHERE event_type = 'SUBIEKT_CODES_ASSIGNED'").all() as any[];
    assert.equal(logs.length, 1);
    assert.equal(logs[0].user_id, ADMIN.id);
    assert.equal(JSON.parse(logs[0].metadata).assigned, 4);
    assert.match(logs[0].description, /4/);

    // Drugi raz: nic do nadania, brak kolejnego wpisu.
    const again = await codes.assignMissingSubiektCodesOp(ADMIN.id);
    assert.equal(again.assigned, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM activity_logs WHERE event_type = 'SUBIEKT_CODES_ASSIGNED'").get() as any).n, 1);
    db.prepare("DELETE FROM users WHERE id = 'u_staff2'").run();
});

test('assignMissingSubiektCodes action: ADMIN gets { ok, assigned }, STAFF is refused', async () => {
    resetArchitects();
    const a = addArchi(null);
    setTestSession(STAFF);
    await assert.rejects(() => subiektActions.assignMissingSubiektCodes(), /Unauthorized/);
    assert.equal(codeOf(a), null);

    setTestSession(ADMIN);
    const result = await subiektActions.assignMissingSubiektCodes();
    assert.deepEqual(result, { ok: true, assigned: 1 });
    assert.equal(codeOf(a), 'A-001');
    setTestSession(null);
});

// ─── każda ścieżka tworzenia konta ARCHI zapisuje kod ───────────────────────

test('CSV import: auto-registered architect gets the next code', async () => {
    resetArchitects();
    addArchi('A-010');
    setTestSession(ADMIN);
    const result = await importActions.importProjectsFromCSV([{
        architectName: 'Nowy Z Importu', architectEmail: 'import@test.local', clientLabel: 'Klient', orderNumber: 'IMP/1',
        amountNet: 1000, isPaid: false, prowizjaRozliczona: false, invoiceNumber: '',
    }]);
    setTestSession(null);
    assert.equal(result.newAccountsCreated, 1);
    assert.equal(result.errorCount, 0);
    assert.equal(codeByEmail('import@test.local'), 'A-011');
});

test('registerArchitect (admin/STAFF registration): new architect gets the next code', async () => {
    resetArchitects();
    addArchi('A-020');
    setTestSession(STAFF);
    const result = await projectActions.registerArchitect({ first_name: 'Ewa', last_name: 'Rejestrowana', email: 'register@test.local', is_vat_payer: false });
    setTestSession(null);
    assert.equal(result.success, true);
    assert.equal(codeByEmail('register@test.local'), 'A-021');
});

function invitation(email: string, role: string): string {
    const token = Array.from({ length: 64 }, (_, i) => ((i * 7 + email.length) % 16).toString(16)).join('');
    db.prepare("INSERT INTO invitations (id, email, name, role, token, status, expires_at) VALUES (?, ?, 'Zaproszony', ?, ?, 'PENDING', datetime('now', '+1 day'))")
        .run(`inv_${email}`, email, role, token);
    return token;
}

async function accept(token: string) {
    const req = new NextRequest('http://localhost/api/auth/accept-invitation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, name: 'Zaproszony Architekt', studio_name: 'Studio', password: 'Haslo-Testowe-2026', acceptTerms: true }),
    });
    return acceptInvitation.POST(req);
}

test('accept-invitation: ARCHI account gets the next code, STAFF account none', async () => {
    resetArchitects();
    addArchi('A-030');
    const res = await accept(invitation('invited@test.local', 'ARCHI'));
    assert.equal(res.status, 200);
    assert.equal(codeByEmail('invited@test.local'), 'A-031');

    const staffRes = await accept(invitation('invited.staff@test.local', 'STAFF'));
    assert.equal(staffRes.status, 200);
    assert.equal(codeByEmail('invited.staff@test.local'), null);
});

// ─── lista architektów ─────────────────────────────────────────────────────

test('architects list: "Kod" column, search by code, button only for ADMIN with missing codes', async () => {
    const page = await readFile(new URL('../src/app/dashboard/admin/architects/page.tsx', import.meta.url), 'utf8');
    const list = await readFile(new URL('../src/components/ArchitectList.tsx', import.meta.url), 'utf8');
    const button = await readFile(new URL('../src/app/dashboard/admin/architects/AssignMissingCodesButton.tsx', import.meta.url), 'utf8');

    assert.match(page, /u\.subiekt_code/);
    assert.match(page, /u\.subiekt_code LIKE \?/);
    assert.match(page, /countArchitectsWithoutCode\(\)/);
    assert.match(page, /isAdmin && missingCodes > 0/);
    assert.match(list, />Kod</);
    assert.match(list, /archi\.subiekt_code \|\| '—'/);
    assert.match(button, /Nadaj brakujące kody/);
    assert.match(button, /assignMissingSubiektCodes\(\)/);
    assert.match(button, /router\.refresh\(\)/);
});
