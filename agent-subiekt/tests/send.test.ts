import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifySubiektRequest } from '../../src/lib/subiekt/auth.ts';
import { buildPages, createFileLogger, postPage, pruneLogs, sendAll, sortForSending, staleLogFiles, RETRY_DELAYS_MS, type SendDeps } from '../src/send.ts';
import type { SubiektDocumentPayload, SubiektSyncRequest } from '../src/contract.ts';

const AUTH = { token: 't'.repeat(64), secret: 's'.repeat(64) };
const ENDPOINT = 'https://portal.test/api/integrations/subiekt/sync';
const NOW_MS = 1_800_000_000_000;
const RUN_ID = '11111111-1111-4111-8111-111111111111';

function doc(id: number, type: SubiektDocumentPayload['type'] = 'ZK', issuedAt = '2026-10-05'): SubiektDocumentPayload {
    return {
        external_id: id, type, number: `${type} ${id}/10/2026`, issued_at: issuedAt, contractor_name: 'Jan',
        contractor_nip: null, architect_code: null, parent_external_id: null, net_total: 1, gross_total: 1.23,
        is_paid: false, remarks: '#A-001', positions: [],
    };
}

type Call = { url: string; headers: Record<string, string>; body: string; signal: unknown };

function okResponse(request: SubiektSyncRequest) {
    return new Response(JSON.stringify({ run_id: request.run_id, accepted: request.documents.length, unchanged: 0, rejected: [], unassigned: 0 }), { status: 200 });
}

function deps(responder: (call: Call, attempt: number) => Response | Promise<Response>, clock = { ms: NOW_MS }) {
    const calls: Call[] = [];
    const sleeps: number[] = [];
    const lines: string[] = [];
    const d: SendDeps = {
        fetch: async (url, init) => {
            const call = { url: String(url), headers: { ...(init?.headers as Record<string, string>) }, body: String(init?.body), signal: init?.signal };
            calls.push(call);
            return responder(call, calls.length);
        },
        sleep: async (ms) => { sleeps.push(ms); clock.ms += ms; },
        now: () => clock.ms,
        logger: { info: (m) => lines.push(`INFO ${m}`), warn: (m) => lines.push(`WARN ${m}`), error: (m) => lines.push(`ERROR ${m}`) },
    };
    return { d, calls, sleeps, lines, clock };
}

test('podpis zgodny z verifySubiektRequest portalu (ten sam token, sekret, timestamp i surowe body)', async () => {
    const { d, calls } = deps((call) => okResponse(JSON.parse(call.body)));
    const [page] = buildPages([doc(1)], RUN_ID, '0.1.0');
    const response = await postPage(ENDPOINT, page, AUTH, d);
    assert.equal(response.accepted, 1);

    const [call] = calls;
    assert.equal(call.url, ENDPOINT);
    assert.equal(call.headers['Content-Type'], 'application/json');
    const verdict = verifySubiektRequest(
        { authorization: call.headers.Authorization, timestamp: call.headers['X-Subiekt-Timestamp'], signature: call.headers['X-Subiekt-Signature'] },
        call.body, NOW_MS / 1000, AUTH,
    );
    assert.deepEqual(verdict, { ok: true });
    assert.equal(call.headers['X-Subiekt-Timestamp'], String(NOW_MS / 1000));
    assert.equal(verifySubiektRequest(
        { authorization: call.headers.Authorization, timestamp: call.headers['X-Subiekt-Timestamp'], signature: call.headers['X-Subiekt-Signature'] },
        `${call.body} `, NOW_MS / 1000, AUTH,
    ).ok, false, 'zmienione body → podpis nie pasuje');
});

test('podział po 200 dokumentów, jeden run_id na wszystkie strony; pusta paczka = jedna pusta strona', () => {
    const docs = Array.from({ length: 401 }, (_, i) => doc(i + 1));
    const pages = buildPages(docs, RUN_ID, '0.1.0');
    assert.deepEqual(pages.map((p) => [p.page, p.pages, p.documents.length]), [[1, 3, 200], [2, 3, 200], [3, 3, 1]]);
    assert.deepEqual(new Set(pages.map((p) => p.run_id)), new Set([RUN_ID]));
    assert.deepEqual(pages.flatMap((p) => p.documents.map((x) => x.external_id)), docs.map((x) => x.external_id));
    assert.deepEqual(buildPages([], RUN_ID, '0.1.0').map((p) => [p.page, p.pages, p.documents.length]), [[1, 1, 0]]);
});

test('retry: błąd sieci i 5xx → ponowienia po 10 s i 60 s, każde z nowym timestampem i podpisem', async () => {
    const { d, calls, sleeps } = deps((call, attempt) => {
        if (attempt === 1) throw new TypeError('fetch failed');
        if (attempt === 2) return new Response('{"error":"INTERNAL_ERROR"}', { status: 500 });
        return okResponse(JSON.parse(call.body));
    });
    const [page] = buildPages([doc(1)], RUN_ID, '0.1.0');
    await postPage(ENDPOINT, page, AUTH, d);
    assert.deepEqual(sleeps, [10_000, 60_000]);
    assert.equal(calls.length, 3);
    const stamps = calls.map((c) => Number(c.headers['X-Subiekt-Timestamp']));
    assert.deepEqual(stamps, [NOW_MS / 1000, NOW_MS / 1000 + 10, NOW_MS / 1000 + 70]);
    for (const call of calls) {
        const ts = Number(call.headers['X-Subiekt-Timestamp']);
        assert.equal(verifySubiektRequest({ authorization: call.headers.Authorization, timestamp: String(ts), signature: call.headers['X-Subiekt-Signature'] }, call.body, ts, AUTH).ok, true);
    }
});

test('retry: po 3 ponowieniach (10 s / 60 s / 5 min) błąd; 401 i 400 bez ponowień', async () => {
    assert.deepEqual(RETRY_DELAYS_MS, [10_000, 60_000, 300_000]);
    const failing = deps(() => new Response('{"error":"INTERNAL_ERROR"}', { status: 503 }));
    const [page] = buildPages([doc(1)], RUN_ID, '0.1.0');
    await assert.rejects(postPage(ENDPOINT, page, AUTH, failing.d), /HTTP 503/);
    assert.equal(failing.calls.length, 4);
    assert.deepEqual(failing.sleeps, [10_000, 60_000, 300_000]);

    for (const status of [400, 401, 413]) {
        const permanent = deps(() => new Response('{"error":"BAD_SIGNATURE"}', { status }));
        await assert.rejects(postPage(ENDPOINT, page, AUTH, permanent.d), new RegExp(`HTTP ${status}`));
        assert.equal(permanent.calls.length, 1, `HTTP ${status} bez ponowień`);
        assert.deepEqual(permanent.sleeps, []);
    }
});

test('sendAll sumuje odpowiedzi stron i zatrzymuje się na pierwszej stronie, która nie przeszła', async () => {
    const pages = buildPages(Array.from({ length: 450 }, (_, i) => doc(i + 1)), RUN_ID, '0.1.0');
    const ok = deps((call) => {
        const request = JSON.parse(call.body) as SubiektSyncRequest;
        return new Response(JSON.stringify({ run_id: RUN_ID, accepted: request.documents.length - 1, unchanged: 1, rejected: request.page === 2 ? [{ external_id: 201, reason: 'VALIDATION:x' }] : [], unassigned: 2 }), { status: 200 });
    });
    const summary = await sendAll(ENDPOINT, pages, AUTH, ok.d);
    assert.deepEqual(summary, { pagesSent: 3, pages: 3, accepted: 447, unchanged: 3, unassigned: 6, rejected: [{ external_id: 201, reason: 'VALIDATION:x' }] });

    const broken = deps((_call, attempt) => (attempt === 1 ? okResponse(pages[0]) : new Response('{}', { status: 401 })));
    await assert.rejects(sendAll(ENDPOINT, pages, AUTH, broken.d), /stronie 2\/3.*HTTP 401/);
    assert.equal(broken.calls.length, 2, 'strona 3 nie jest wysyłana');
});

test('log do pliku logs/YYYY-MM-DD.log (data lokalna), dopisywanie kolejnych wierszy', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-subiekt-log-'));
    try {
        const at = new Date(2026, 9, 30, 20, 0, 5); // 30.10.2026 20:00:05 czasu lokalnego
        const logger = createFileLogger(dir, { now: () => at, echo: false });
        logger.info('Start synchronizacji');
        logger.error('HTTP 401');
        assert.deepEqual(readdirSync(dir), ['2026-10-30.log']);
        const lines = readFileSync(join(dir, '2026-10-30.log'), 'utf8').trim().split('\n');
        assert.equal(lines.length, 2);
        assert.match(lines[0], /^2026-10-30 20:00:05 INFO Start synchronizacji$/);
        assert.match(lines[1], /ERROR HTTP 401$/);
        assert.equal(logger.file, join(dir, '2026-10-30.log'));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('retry: HTTP 429 (limit wywołań portalu) i przekroczony czas żądania są ponawiane; każde żądanie ma AbortSignal', async () => {
    const limited = deps((call, attempt) => {
        if (attempt === 1) return new Response('{"error":"RATE_LIMITED"}', { status: 429 });
        if (attempt === 2) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
        return okResponse(JSON.parse(call.body));
    });
    const [page] = buildPages([doc(1)], RUN_ID, '0.1.0');
    await postPage(ENDPOINT, page, AUTH, limited.d);
    assert.deepEqual(limited.sleeps, [10_000, 60_000]);
    assert.ok(limited.calls.every((c) => c.signal instanceof AbortSignal));
});

test('odpowiedź 200 bez pól accepted / unchanged / rejected[] / unassigned albo nie-JSON → czytelny błąd, bez ponowień', async () => {
    const [page] = buildPages([doc(1)], RUN_ID, '0.1.0');
    for (const body of ['{"ok":true}', '<html>Bramka sieci</html>', '{"accepted":1,"unchanged":0,"unassigned":0,"rejected":[{"external_id":"x"}]}']) {
        const bad = deps(() => new Response(body, { status: 200 }));
        await assert.rejects(postPage(ENDPOINT, page, AUTH, bad.d), /Nieprawidłowa odpowiedź portalu/, body);
        assert.equal(bad.calls.length, 1);
    }
});

test('kolejność wysyłki: rodzice przed dziećmi (ZK → WZ → FS → KFS), potem data i id — także między stronami', () => {
    const mixed = [doc(5, 'KFS', '2026-10-01'), doc(4, 'FS', '2026-10-02'), doc(3, 'WZ', '2026-10-03'), doc(2, 'ZK', '2026-10-04'), doc(1, 'ZK', '2026-10-04'), doc(0, 'ZK', '2026-09-30')];
    assert.deepEqual(sortForSending(mixed).map((d) => d.external_id), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(mixed.map((d) => d.external_id), [5, 4, 3, 2, 1, 0], 'wejście bez zmian');
    const pages = buildPages([doc(9999, 'KFS'), ...Array.from({ length: 200 }, (_, i) => doc(i + 1))], RUN_ID, '0.1.0');
    assert.equal(pages[0]?.documents[0]?.type, 'ZK');
    assert.deepEqual(pages[1]?.documents.map((d) => d.external_id), [9999]);
});

test('retencja logów: dzienne RRRR-MM-DD.log starsze niż 90 dni są usuwane; inne pliki zostają', () => {
    const today = new Date(2026, 9, 30, 20, 0);
    const names = ['2026-07-31.log', '2026-08-01.log', '2026-10-30.log', 'probe-2026-01-01.txt', 'dry-run-2025-01-01.json', 'last-sync.txt', 'notatki.log'];
    assert.deepEqual(staleLogFiles(names, today, 90), ['2026-07-31.log']);

    const dir = mkdtempSync(join(tmpdir(), 'agent-subiekt-prune-'));
    try {
        for (const name of names) writeFileSync(join(dir, name), 'x');
        assert.deepEqual(pruneLogs(dir, today), ['2026-07-31.log']);
        assert.deepEqual(readdirSync(dir).sort(), names.filter((n) => n !== '2026-07-31.log').sort());
        assert.deepEqual(pruneLogs(join(dir, 'brak'), today), [], 'brak katalogu to nie błąd');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
