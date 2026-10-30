// Loop 4b (PLAN-SUBIEKT-2026-10-29.md): tryb wewnętrzny PORTAL_INTERNAL_MODE — maile tylko do ADMIN/STAFF,
// brak resetu hasła i logowania dla ARCHI, plakietka w powłoce. Bez zmiennej zachowanie jak dotąd.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcrypt';

type TestDbModule = typeof import('./helpers/sqliteTestDb');
type InternalModeModule = typeof import('../src/lib/internalMode');
type EmailModule = typeof import('../src/lib/email');
type AuthorizeModule = typeof import('../src/lib/authorizeCredentials');
type ForgotPasswordModule = typeof import('../src/app/api/auth/forgot-password/route');

await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
await import(new URL('./helpers/nextServerStubs.ts', import.meta.url).href);
const { createTestDb }: TestDbModule = await import(new URL('./helpers/sqliteTestDb.ts', import.meta.url).href);
const testDb = createTestDb();
const internal: InternalModeModule = await import(new URL('../src/lib/internalMode.ts', import.meta.url).href);
const email: EmailModule = await import(new URL('../src/lib/email.ts', import.meta.url).href);
const auth: AuthorizeModule = await import(new URL('../src/lib/authorizeCredentials.ts', import.meta.url).href);
const forgot: ForgotPasswordModule = await import(new URL('../src/app/api/auth/forgot-password/route.ts', import.meta.url).href);
const { NextRequest } = await import('next/server.js');
const db = testDb.db;

const PASSWORD = 'Haslo-Testowe-2026';
const hash = bcrypt.hashSync(PASSWORD, 4);
const insertUser = db.prepare("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)");
insertUser.run('u_admin', 'Admin', 'admin@test.local', hash, 'ADMIN');
insertUser.run('u_staff', 'Zespół', 'staff@test.local', hash, 'STAFF');
insertUser.run('u_archi', 'Architekt', 'archi@test.local', hash, 'ARCHI');
db.prepare("INSERT INTO email_templates (id, slug, name, subject, content) VALUES ('t1', 'TEST_MAIL', 'Test', 'Temat {{x}}', '<p>Treść {{x}}</p>')").run();
db.prepare("INSERT INTO email_templates (id, slug, name, subject, content) VALUES ('t2', 'PASSWORD_RESET', 'Reset', 'Reset', '<p>{{reset_link}}</p>')").run();

// sendEmail bez SMTP w trybie development tylko loguje mail i zwraca { success: true, logged: true }.
const savedEnv = { NODE_ENV: process.env.NODE_ENV, EMAIL_HOST: process.env.EMAIL_HOST, PORTAL_INTERNAL_MODE: process.env.PORTAL_INTERNAL_MODE };
(process.env as any).NODE_ENV = 'development';
delete process.env.EMAIL_HOST;

test.after(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete (process.env as any)[key];
        else (process.env as any)[key] = value;
    }
    testDb.cleanup();
});

function setMode(value: string | undefined) {
    if (value === undefined) delete process.env.PORTAL_INTERNAL_MODE;
    else process.env.PORTAL_INTERNAL_MODE = value;
}

/** Przechwytuje console.info / console.log na czas wywołania (sendEmail loguje wysyłkę i pominięcie). */
async function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; info: string[]; log: string[] }> {
    const info: string[] = [];
    const log: string[] = [];
    const origInfo = console.info;
    const origLog = console.log;
    console.info = (...args: unknown[]) => { info.push(args.join(' ')); };
    console.log = (...args: unknown[]) => { log.push(args.join(' ')); };
    try {
        return { result: await fn(), info, log };
    } finally {
        console.info = origInfo;
        console.log = origLog;
    }
}

// ─── isInternalMode ──────────────────────────────────────────────────────────

test('isInternalMode accepts 1 / true only', () => {
    for (const on of ['1', 'true', 'TRUE', ' true ']) {
        setMode(on);
        assert.equal(internal.isInternalMode(), true, on);
    }
    for (const off of [undefined, '', '0', 'false', 'yes']) {
        setMode(off);
        assert.equal(internal.isInternalMode(), false, String(off));
    }
});

// ─── sendEmail ───────────────────────────────────────────────────────────────

test('sendEmail in internal mode skips ARCHI and unknown addresses without sending', async () => {
    setMode('1');
    for (const to of ['archi@test.local', 'nobody@test.local']) {
        const { result, info, log } = await captureConsole(() => email.sendEmail('TEST_MAIL', to, { x: '1' }));
        assert.deepEqual(result, { success: false, skipped: 'INTERNAL_MODE' });
        assert.deepEqual(info, [`[internal-mode] pominięto mail TEST_MAIL do ${to}`]);
        assert.equal(log.some((l) => l.includes('Development Email Log')), false, 'mail nie został wysłany');
    }
});

test('sendEmail in internal mode sends to STAFF and ADMIN', async () => {
    setMode('true');
    for (const to of ['staff@test.local', 'ADMIN@test.local']) {
        const { result, info, log } = await captureConsole(() => email.sendEmail('TEST_MAIL', to, { x: '1' }));
        assert.deepEqual(result, { success: true, logged: true });
        assert.deepEqual(info, []);
        assert.ok(log.some((l) => l.includes('Development Email Log')));
    }
});

test('sendEmail without the variable sends to ARCHI and unknown addresses as before', async () => {
    setMode(undefined);
    for (const to of ['archi@test.local', 'nobody@test.local']) {
        const { result, info } = await captureConsole(() => email.sendEmail('TEST_MAIL', to, { x: '1' }));
        assert.deepEqual(result, { success: true, logged: true });
        assert.deepEqual(info, []);
    }
});

// ─── forgot-password ─────────────────────────────────────────────────────────

let ipSeq = 0;
async function forgotPassword(address: string) {
    const req = new NextRequest('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ipSeq}` },
        body: JSON.stringify({ email: address }),
    });
    const res = await forgot.POST(req);
    return { status: res.status, body: await res.json() };
}
const tokensOf = (userId: string) => (db.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ?').get(userId) as any).n;

test('forgot-password in internal mode: ARCHI gets the same answer as an unknown address, no token', async () => {
    setMode('1');
    const unknown = await forgotPassword('nobody@test.local');
    const archi = await forgotPassword('archi@test.local');
    assert.deepEqual(archi, unknown);
    assert.deepEqual(archi, { status: 200, body: { ok: true } });
    assert.equal(tokensOf('u_archi'), 0);

    const staff = await forgotPassword('staff@test.local');
    assert.deepEqual(staff, { status: 200, body: { ok: true } });
    assert.equal(tokensOf('u_staff'), 1, 'STAFF resetuje hasło normalnie');
});

test('forgot-password without the variable creates a token for ARCHI as before', async () => {
    setMode(undefined);
    const archi = await forgotPassword('archi@test.local');
    assert.deepEqual(archi, { status: 200, body: { ok: true } });
    assert.equal(tokensOf('u_archi'), 1);
});

// ─── logowanie ───────────────────────────────────────────────────────────────

test('authorize in internal mode refuses ARCHI with the preparation message, admits STAFF and ADMIN', async () => {
    setMode('1');
    assert.equal(internal.INTERNAL_MODE_LOGIN_MESSAGE, 'Portal dla architektów jest w przygotowaniu. Spróbuj później.');
    await assert.rejects(
        () => auth.authorizeCredentials({ email: 'archi@test.local', password: PASSWORD }),
        (err: Error) => err.message === 'Portal dla architektów jest w przygotowaniu. Spróbuj później.',
    );
    // Złe hasło architekta nadal daje zwykłą odmowę (null), komunikat nie zdradza konta bez hasła.
    assert.equal(await auth.authorizeCredentials({ email: 'archi@test.local', password: 'zle-haslo-1' }), null);

    const staff = await auth.authorizeCredentials({ email: 'staff@test.local', password: PASSWORD });
    assert.deepEqual(staff, { id: 'u_staff', name: 'Zespół', email: 'staff@test.local', role: 'STAFF' });
    const admin = await auth.authorizeCredentials({ email: 'admin@test.local', password: PASSWORD });
    assert.equal(admin?.role, 'ADMIN');
});

test('authorize without the variable admits ARCHI as before', async () => {
    setMode(undefined);
    const archi = await auth.authorizeCredentials({ email: 'archi@test.local', password: PASSWORD });
    assert.deepEqual(archi, { id: 'u_archi', name: 'Architekt', email: 'archi@test.local', role: 'ARCHI' });
});

test('sign-in page shows the preparation message; Google sign-in and shell badge follow the mode', async () => {
    const signin = await readFile(new URL('../src/app/auth/signin/page.tsx', import.meta.url), 'utf8');
    const authSource = await readFile(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');
    const layout = await readFile(new URL('../src/app/dashboard/layout.tsx', import.meta.url), 'utf8');

    assert.match(signin, /INTERNAL_MODE_LOGIN_MESSAGE/);
    assert.match(authSource, /authorize: authorizeCredentials/);
    assert.match(authSource, /isInternalMode\(\) && dbUser\.role === 'ARCHI'/);
    assert.match(layout, /isInternalMode\(\) && canManageOperationalProjects\(session\.user\.role\)/);
    assert.match(layout, /Tryb wewnętrzny/);
});
