import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    parseInvitationList,
    deriveInvitationStatus,
    splitFullName,
    buildInvitationLink,
    generateInvitationToken,
    chunk,
    INVITATION_TTL_DAYS,
} from '../src/lib/invitations.ts';
import { buildArchitectInvitedPlaceholders } from '../src/lib/emailPlaceholders.ts';

// ─── parseInvitationList ─────────────────────────────────────────────────

test('parses one person per line with comma, semicolon or tab separators', () => {
    const rows = parseInvitationList(
        'jan@pracownia.pl, Jan Kowalski, Pracownia Kowalski\n' +
        'anna@studio.pl; Anna Nowak\n' +
        'tomasz@example.com\tTomasz Lis\tLis Design\n'
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => [r.email, r.name, r.studio_name, r.error]), [
        ['jan@pracownia.pl', 'Jan Kowalski', 'Pracownia Kowalski', null],
        ['anna@studio.pl', 'Anna Nowak', null, null],
        ['tomasz@example.com', 'Tomasz Lis', 'Lis Design', null],
    ]);
});

test('finds the email regardless of column order and accepts "Name <email>" format', () => {
    const rows = parseInvitationList('Jan Kowalski, jan@pracownia.pl\n"Marek Wiśniewski" <marek@wisniewski.pl>');
    assert.equal(rows[0].email, 'jan@pracownia.pl');
    assert.equal(rows[0].name, 'Jan Kowalski');
    assert.equal(rows[1].email, 'marek@wisniewski.pl');
    assert.equal(rows[1].name, 'Marek Wiśniewski');
});

test('normalizes email to lowercase, skips empty lines and a header row', () => {
    const rows = parseInvitationList('Email;Imię i nazwisko;Pracownia\n\n  JAN@Pracownia.PL ; Jan \n');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'jan@pracownia.pl');
    assert.equal(rows[0].line, 3);
});

test('flags lines without an email and duplicates within the list', () => {
    const rows = parseInvitationList('tylko nazwisko\njan@a.pl\nJAN@a.pl, Jan\nbez emaila w tej linii');
    assert.equal(rows[0].error, 'Brak adresu email');
    assert.equal(rows[1].error, null);
    assert.equal(rows[2].error, 'Duplikat w liście');
    // słowo "email" w środku listy nie robi z linii nagłówka
    assert.equal(rows[3].error, 'Brak adresu email');
});

// ─── deriveInvitationStatus ──────────────────────────────────────────────

test('derives display status from status, sent_at and SQL-computed expiry', () => {
    assert.equal(deriveInvitationStatus({ status: 'PENDING', sent_at: null, is_expired: 0 }), 'UNSENT');
    assert.equal(deriveInvitationStatus({ status: 'PENDING', sent_at: '2026-10-01 10:00:00', is_expired: 0 }), 'SENT');
    assert.equal(deriveInvitationStatus({ status: 'PENDING', sent_at: '2026-10-01 10:00:00', is_expired: 1 }), 'EXPIRED');
    assert.equal(deriveInvitationStatus({ status: 'PENDING', sent_at: null, is_expired: true }), 'EXPIRED');
    assert.equal(deriveInvitationStatus({ status: 'ACCEPTED', sent_at: null, is_expired: 1 }), 'ACCEPTED');
    assert.equal(deriveInvitationStatus({ status: 'REVOKED', sent_at: null, is_expired: 0 }), 'REVOKED');
});

// ─── helpers ─────────────────────────────────────────────────────────────

test('token is 64 hex chars, link points at /auth/invite, names split into first/last', () => {
    assert.match(generateInvitationToken(), /^[a-f0-9]{64}$/);
    assert.equal(buildInvitationLink('https://archi.walldecor.pl/', 'abc'), 'https://archi.walldecor.pl/auth/invite?token=abc');
    assert.deepEqual(splitFullName('Anna Maria Nowak'), { first_name: 'Anna', last_name: 'Maria Nowak' });
    assert.deepEqual(splitFullName('Anna'), { first_name: 'Anna', last_name: null });
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.equal(INVITATION_TTL_DAYS, 14);
});

test('invited email placeholders cover every tag used by the ARCHITECT_INVITED template', async () => {
    const placeholders = buildArchitectInvitedPlaceholders({
        userName: null,
        email: 'jan@a.pl',
        inviteLink: 'https://x/auth/invite?token=t',
        expiresAt: '06.11.2026',
        portalUrl: 'https://x',
    });
    assert.equal(placeholders.user_name, 'jan@a.pl');

    const migration = await readFile(new URL('../migrations/018_invitations.sql', import.meta.url), 'utf8');
    const tags = Array.from(migration.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[1]);
    assert.ok(tags.length > 0);
    for (const tag of tags) assert.ok(tag in placeholders, `missing placeholder ${tag}`);
});

// ─── source guards ───────────────────────────────────────────────────────

test('accept-invitation endpoint is rate limited, transactional and creates a non-temporary password', async () => {
    const source = await readFile(new URL('../src/app/api/auth/accept-invitation/route.ts', import.meta.url), 'utf8');
    assert.match(source, /createRateLimiter/);
    assert.match(source, /withTransaction/);
    assert.match(source, /FOR UPDATE/);
    assert.match(source, /status = 'PENDING'[\s\S]*expires_at > NOW\(\)/);
    assert.match(source, /must_change_password, password_changed_at, last_login_at, subiekt_code\s*\) VALUES \([\s\S]*0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, \?\)/);
    assert.match(source, /SET status = 'ACCEPTED'/);
    assert.match(source, /validatePasswordStrength/);
    assert.match(source, /acceptTerms !== true/);
});

test('invitation actions require admin/staff and never expose tokens to the list page', async () => {
    const actions = await readFile(new URL('../src/app/actions/invitations.ts', import.meta.url), 'utf8');
    assert.match(actions, /canRegisterArchitects/);
    assert.match(actions, /slice\(0, INVITATION_SEND_BATCH\)/);
    assert.match(actions, /sendEmail\('ARCHITECT_INVITED'/);

    const page = await readFile(new URL('../src/app/dashboard/admin/invitations/page.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(page, /i\.token|SELECT \*|i\.\*/);
});

test('production schema script creates the invitations table and email template', async () => {
    const schemaScript = await readFile(new URL('../scripts/ensure-production-schema.mjs', import.meta.url), 'utf8');
    assert.match(schemaScript, /information_schema\.TABLES/);
    assert.match(schemaScript, /CREATE TABLE IF NOT EXISTS invitations/);
    assert.match(schemaScript, /ARCHITECT_INVITED/);

    const seed = await readFile(new URL('../scripts/seed-dev.mjs', import.meta.url), 'utf8');
    assert.match(seed, /CREATE TABLE invitations/);
    assert.match(seed, /ARCHITECT_INVITED/);
});

test('admin navigation links to the invitations module', async () => {
    const sidebar = await readFile(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
    assert.match(sidebar, /\/dashboard\/admin\/invitations/);
    const titles = await readFile(new URL('../src/lib/shellTitle.ts', import.meta.url), 'utf8');
    assert.match(titles, /\/dashboard\/admin\/invitations/);
});
