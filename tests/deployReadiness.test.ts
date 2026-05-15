import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('server setup installs dev dependencies for build before pruning production deps', async () => {
    const source = await readFile(new URL('../deploy/setup-server.sh', import.meta.url), 'utf8');

    const installIndex = source.indexOf('npm ci');
    const buildIndex = source.indexOf('npm run build');
    const pruneIndex = source.indexOf('npm prune --omit=dev');

    assert.ok(installIndex > -1);
    assert.ok(buildIndex > installIndex);
    assert.ok(pruneIndex > buildIndex);
    assert.doesNotMatch(source, /npm ci --omit=dev[\s\S]*npm run build/);
});

test('google auth provider is enabled only when OAuth credentials are configured', async () => {
    const source = await readFile(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');

    assert.match(source, /const authProviders:[\s\S]*= \[/);
    assert.match(source, /if \(process\.env\.GOOGLE_CLIENT_ID && process\.env\.GOOGLE_CLIENT_SECRET\)/);
    assert.match(source, /providers: authProviders/);
});

test('sign-in page renders google login only when provider is configured', async () => {
    const source = await readFile(new URL('../src/app/auth/signin/page.tsx', import.meta.url), 'utf8');

    assert.match(source, /getProviders/);
    assert.match(source, /hasGoogleProvider/);
    assert.match(source, /hasGoogleProvider &&/);
    assert.doesNotMatch(source, /\/\*\s*Google Sign In\s*\*\/\s*<button[\s\S]*Zaloguj się przez Google/);
});

test('server setup generated env includes explicit email and google configuration placeholders', async () => {
    const source = await readFile(new URL('../deploy/setup-server.sh', import.meta.url), 'utf8');

    assert.match(source, /GOOGLE_CLIENT_ID=/);
    assert.match(source, /GOOGLE_CLIENT_SECRET=/);
    assert.match(source, /EMAIL_HOST=/);
    assert.match(source, /EMAIL_PORT=587/);
    assert.match(source, /EMAIL_FROM=/);
});
