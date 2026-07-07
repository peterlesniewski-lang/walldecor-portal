import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('/auth/change-password is a server page that redirects unauthenticated users', () => {
    const source = readFileSync(new URL('../src/app/auth/change-password/page.tsx', import.meta.url), 'utf8');

    assert.equal(source.includes("'use client'"), false);
    assert.match(source, /getServerSession/);
    assert.match(source, /redirect\(["']\/auth\/signin["']\)/);
});

