import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePasswordStrength, PASSWORD_POLICY_HINT } from '../src/lib/passwordPolicy.ts';

function load(path: string) {
    return readFile(new URL(path, import.meta.url), 'utf8');
}

function sliceBetween(source: string, start: string, end: string) {
    const from = source.indexOf(start);
    assert.ok(from > -1, `missing marker: ${start}`);
    const to = end ? source.indexOf(end, from + start.length) : -1;
    return source.slice(from, to > -1 ? to : undefined);
}

test('updateProjectStatus validates status transitions against ALLOWED_TRANSITIONS', async () => {
    const source = await load('../src/app/actions/projects.ts');
    const action = sliceBetween(source, 'export async function updateProjectStatus', 'export async function getAllArchitects');

    assert.match(source, /const ALLOWED_TRANSITIONS/);
    assert.match(source, /'ZAKOŃCZONY': \[\]/);
    assert.match(action, /ALLOWED_TRANSITIONS\[previousStatus\]/);
    assert.match(action, /Niedozwolona zmiana statusu: \$\{previousStatus\} → \$\{status\}/);
    assert.match(action, /Projekt nie istnieje\./);
    assert.match(action, /unchanged: true/);
    // Walidacja przejścia następuje przed jakimkolwiek zapisem
    assert.ok(action.indexOf('Niedozwolona zmiana statusu') < action.indexOf('UPDATE projects SET status'));
});

test('registerArchitect normalizes email, rejects duplicates and enforces the password policy', async () => {
    const source = await load('../src/app/actions/projects.ts');
    const action = sliceBetween(source, 'export async function registerArchitect', 'export async function getArchitectById');

    assert.match(action, /\.trim\(\)\.toLowerCase\(\)/);
    assert.match(action, /SELECT id FROM users WHERE LOWER\(email\) = \?/);
    assert.match(action, /Użytkownik z tym adresem email już istnieje\./);
    assert.match(action, /validatePasswordStrength\(data\.password\)/);
    assert.ok(action.indexOf('LOWER(email)') < action.indexOf('INSERT INTO users'));
});

test('updateArchitect checks email duplicates excluding the edited account', async () => {
    const source = await load('../src/app/actions/projects.ts');
    const action = sliceBetween(source, 'export async function updateArchitect(', 'export async function requestPayout');

    assert.match(action, /SELECT id FROM users WHERE LOWER\(email\) = \? AND id != \?/);
    assert.match(action, /Użytkownik z tym adresem email już istnieje\./);
});

test('password-setting paths use validatePasswordStrength instead of a bare length check', async () => {
    for (const path of [
        '../src/app/actions/settings.ts',
        '../src/app/actions/architects.ts',
        '../src/app/api/auth/reset-password/route.ts',
    ]) {
        const source = await load(path);
        assert.match(source, /import \{ validatePasswordStrength \} from ['"]@\/lib\/passwordPolicy['"]/, path);
        assert.match(source, /validatePasswordStrength\(/, path);
        assert.doesNotMatch(source, /length < 8/, path);
    }
});

test('assignProjectCaretaker accepts only STAFF/ADMIN accounts and existing projects', async () => {
    const source = await load('../src/app/actions/projects.ts');
    const action = sliceBetween(source, 'export async function assignProjectCaretaker', 'export async function getAllStaff');

    assert.match(action, /role IN \('ADMIN','STAFF'\)/);
    assert.match(action, /Opiekun musi być kontem STAFF lub ADMIN\./);
    assert.match(action, /Projekt nie istnieje\./);
});

test('addProjectItem validates the project, category and amount before inserting', async () => {
    const source = await load('../src/app/actions/projects.ts');
    const action = sliceBetween(source, 'export async function addProjectItem', 'export async function deleteProjectItem');

    assert.match(action, /Number\.isFinite\(data\.amount_net\)/);
    assert.match(action, /data\.category\.trim\(\)/);
    assert.match(action, /Nie można dodawać pozycji do projektu niezrealizowanego\./);
    assert.ok(action.indexOf('Projekt nie istnieje.') < action.indexOf('INSERT INTO project_items'));
});

test('registration modal shows the password policy hint', async () => {
    const source = await load('../src/components/ArchitectRegistrationModal.tsx');

    assert.match(source, /PASSWORD_POLICY_HINT/);
    assert.match(source, /minLength=\{8\}/);
    assert.match(source, /Min\. 8 znaków, litera i cyfra/);
    assert.match(source, /przy pierwszym logowaniu/);
});

test('validatePasswordStrength rejects passwords without a digit', () => {
    assert.ok(validatePasswordStrength('abcdefgh'));
    assert.ok(validatePasswordStrength('abc1'));
    assert.ok(validatePasswordStrength('12345678'));
});

test('validatePasswordStrength accepts letter+digit passwords of 8+ characters', () => {
    assert.equal(validatePasswordStrength('abcdefg1'), null);
    assert.equal(typeof PASSWORD_POLICY_HINT, 'string');
});
