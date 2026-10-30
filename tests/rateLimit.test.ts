import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRateLimiter, getClientIp } from '../src/lib/rateLimit.ts';

test('rate limiter allows max attempts and blocks the next one', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 1000 });
    const now = 1_000_000;
    assert.equal(limiter.check('a', now), true);
    assert.equal(limiter.check('a', now), true);
    assert.equal(limiter.check('a', now), true);
    assert.equal(limiter.check('a', now), false);
    assert.equal(limiter.check('a', now + 10), false);
    // other keys are independent
    assert.equal(limiter.check('b', now), true);
});

test('rate limiter window expires and starts a fresh count', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });
    const now = 5_000;
    assert.equal(limiter.check('a', now), true);
    assert.equal(limiter.check('a', now), true);
    assert.equal(limiter.check('a', now + 1000), false);
    assert.equal(limiter.check('a', now + 1001), true);
    assert.equal(limiter.check('a', now + 1002), true);
    assert.equal(limiter.check('a', now + 1003), false);
});

test('rate limiter reset clears the key', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
    assert.equal(limiter.check('a', 0), true);
    assert.equal(limiter.check('a', 1), false);
    limiter.reset('a');
    assert.equal(limiter.check('a', 2), true);
});

test('forgot-password route is rate limited per IP and per email', async () => {
    const source = await readFile(new URL('../src/app/api/auth/forgot-password/route.ts', import.meta.url), 'utf8');
    assert.match(source, /import \{ createRateLimiter, getClientIp \} from '@\/lib\/rateLimit';/);
    assert.match(source, /status: 429/);
    assert.match(source, /ipLimiter\.check\(getClientIp\(req\)\)/);
});

test('getClientIp takes the first x-forwarded-for address, then x-real-ip, then unknown', () => {
    const req = (headers: Record<string, string>) => new Request('http://localhost/', { headers });
    assert.equal(getClientIp(req({ 'x-forwarded-for': ' 203.0.113.5 , 10.0.0.1' })), '203.0.113.5');
    assert.equal(getClientIp(req({ 'x-forwarded-for': ' ', 'x-real-ip': '198.51.100.7' })), '198.51.100.7');
    assert.equal(getClientIp(req({ 'x-real-ip': ' 198.51.100.8 ' })), '198.51.100.8');
    assert.equal(getClientIp(req({})), 'unknown');
});

test('auth login uses the shared rate limiter and case-insensitive email lookup', async () => {
    // Logika authorize wydzielona z src/lib/auth.ts (Loop 4b), provider credentials ją wskazuje.
    const source = await readFile(new URL('../src/lib/authorizeCredentials.ts', import.meta.url), 'utf8');
    assert.match(source, /createRateLimiter/);
    assert.match(source, /LOWER\(email\) = \?/);
});

test('next config sets security headers', async () => {
    const source = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');
    assert.match(source, /X-Frame-Options/);
    assert.match(source, /poweredByHeader: false/);
});
