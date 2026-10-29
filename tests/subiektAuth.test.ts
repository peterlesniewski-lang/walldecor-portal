import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySubiektRequest, signSubiektRequest } from '../src/lib/subiekt/auth.ts';

const TOKEN = 'a'.repeat(64);
const SECRET = 'b'.repeat(64);
const NOW = 1_800_000_000;
const BODY = '{"run_id":"x","documents":[]}';
const env = { token: TOKEN, secret: SECRET };

function goodHeaders(ts = NOW, body = BODY) {
    return {
        authorization: `Bearer ${TOKEN}`,
        timestamp: String(ts),
        signature: signSubiektRequest(SECRET, ts, body),
    };
}

test('returns 503 NOT_CONFIGURED when token or secret is missing', () => {
    assert.deepEqual(
        verifySubiektRequest(goodHeaders(), BODY, NOW, {}),
        { ok: false, status: 503, reason: 'NOT_CONFIGURED' }
    );
    assert.deepEqual(
        verifySubiektRequest(goodHeaders(), BODY, NOW, { token: TOKEN }),
        { ok: false, status: 503, reason: 'NOT_CONFIGURED' }
    );
});

test('rejects a wrong bearer token with 401 BAD_TOKEN', () => {
    const headers = { ...goodHeaders(), authorization: `Bearer ${'c'.repeat(64)}` };
    assert.deepEqual(
        verifySubiektRequest(headers, BODY, NOW, env),
        { ok: false, status: 401, reason: 'BAD_TOKEN' }
    );
});

test('rejects a missing authorization header', () => {
    const headers = { ...goodHeaders(), authorization: null };
    assert.deepEqual(
        verifySubiektRequest(headers, BODY, NOW, env),
        { ok: false, status: 401, reason: 'BAD_TOKEN' }
    );
});

test('a token of a different length is rejected without throwing', () => {
    const headers = { ...goodHeaders(), authorization: 'Bearer short' };
    assert.doesNotThrow(() => verifySubiektRequest(headers, BODY, NOW, env));
    assert.equal(verifySubiektRequest(headers, BODY, NOW, env).ok, false);
});

test('rejects a non-numeric timestamp with BAD_TIMESTAMP', () => {
    const headers = { ...goodHeaders(), timestamp: 'yesterday' };
    assert.deepEqual(
        verifySubiektRequest(headers, BODY, NOW, env),
        { ok: false, status: 401, reason: 'BAD_TIMESTAMP' }
    );
});

test('rejects a timestamp 10 minutes old with the default skew', () => {
    const ts = NOW - 600;
    assert.deepEqual(
        verifySubiektRequest(goodHeaders(ts), BODY, NOW, env),
        { ok: false, status: 401, reason: 'STALE_TIMESTAMP' }
    );
});

test('accepts a timestamp within the default skew', () => {
    assert.deepEqual(verifySubiektRequest(goodHeaders(NOW - 299), BODY, NOW, env), { ok: true });
});

test('respects a custom maxSkewSeconds', () => {
    const ts = NOW - 60;
    assert.deepEqual(
        verifySubiektRequest(goodHeaders(ts), BODY, NOW, { ...env, maxSkewSeconds: 30 }),
        { ok: false, status: 401, reason: 'STALE_TIMESTAMP' }
    );
});

test('rejects a wrong signature with BAD_SIGNATURE', () => {
    const headers = { ...goodHeaders(), signature: 'f'.repeat(64) };
    assert.deepEqual(
        verifySubiektRequest(headers, BODY, NOW, env),
        { ok: false, status: 401, reason: 'BAD_SIGNATURE' }
    );
});

test('rejects a signature computed with a different secret', () => {
    const headers = { ...goodHeaders(), signature: signSubiektRequest('d'.repeat(64), NOW, BODY) };
    assert.equal(verifySubiektRequest(headers, BODY, NOW, env).ok, false);
});

test('accepts a correct token, timestamp and signature', () => {
    assert.deepEqual(verifySubiektRequest(goodHeaders(), BODY, NOW, env), { ok: true });
});

test('rejects a signature computed over the body plus one extra space', () => {
    const headers = { ...goodHeaders(NOW, BODY + ' ') };
    assert.deepEqual(
        verifySubiektRequest(headers, BODY, NOW, env),
        { ok: false, status: 401, reason: 'BAD_SIGNATURE' }
    );
});

test('signSubiektRequest returns 64 lowercase hex chars', () => {
    assert.match(signSubiektRequest(SECRET, NOW, BODY), /^[0-9a-f]{64}$/);
});

test('a non-numeric SUBIEKT_SYNC_MAX_SKEW_SECONDS falls back to 300 s (10-minute-old timestamp is stale)', () => {
    const saved = { ...process.env };
    process.env.SUBIEKT_SYNC_TOKEN = TOKEN;
    process.env.SUBIEKT_SYNC_SECRET = SECRET;
    try {
        for (const skew of ['abc', '-5', '0']) {
            process.env.SUBIEKT_SYNC_MAX_SKEW_SECONDS = skew;
            const ts = NOW - 600;
            assert.deepEqual(
                verifySubiektRequest(goodHeaders(ts), BODY, NOW),
                { ok: false, status: 401, reason: 'STALE_TIMESTAMP' },
                `skew=${skew}`
            );
            assert.deepEqual(verifySubiektRequest(goodHeaders(NOW - 60), BODY, NOW), { ok: true }, `skew=${skew}, świeży`);
        }
    } finally {
        for (const key of ['SUBIEKT_SYNC_TOKEN', 'SUBIEKT_SYNC_SECRET', 'SUBIEKT_SYNC_MAX_SKEW_SECONDS']) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    }
});
