// Wysyłka paczki do portalu (PLAN-SUBIEKT-2026-10-29.md 2.1, Loop 5): podpis HMAC identyczny z portalem
// (src/lib/subiekt/auth.ts), strony po 200 dokumentów z jednym run_id, ponowienia z backoffem, log do pliku.
import { createHmac } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    SUBIEKT_SYNC_MAX_DOCUMENTS,
    type SubiektDocumentPayload,
    type SubiektSyncRequest,
    type SubiektSyncResponse,
} from './contract.ts';

/** Przerwy przed kolejnymi ponowieniami: 3 ponowienia po pierwszej próbie. */
export const RETRY_DELAYS_MS: readonly number[] = [10_000, 60_000, 300_000];

export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export interface SendDeps {
    fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Response>;
    sleep: (ms: number) => Promise<void>;
    /** Czas w milisekundach (Date.now). */
    now: () => number;
    logger: Logger;
}

export interface PortalAuth {
    token: string;
    secret: string;
}

/** hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`) — ta sama formuła co signSubiektRequest w portalu. */
export function signBody(secret: string, timestampSeconds: number, rawBody: string): string {
    return createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');
}

/** Strony po `pageSize` dokumentów z tym samym run_id. Pusta paczka = jedna pusta strona (portal zapisuje przebieg). */
export function buildPages(
    documents: SubiektDocumentPayload[],
    runId: string,
    agentVersion: string,
    pageSize = SUBIEKT_SYNC_MAX_DOCUMENTS,
): SubiektSyncRequest[] {
    const pages = Math.max(1, Math.ceil(documents.length / pageSize));
    return Array.from({ length: pages }, (_, index) => ({
        run_id: runId,
        agent_version: agentVersion,
        page: index + 1,
        pages,
        documents: documents.slice(index * pageSize, (index + 1) * pageSize),
    }));
}

export class PortalHttpError extends Error {
    readonly status: number;
    constructor(status: number, body: string) {
        super(`HTTP ${status}: ${body.slice(0, 500)}`);
        this.status = status;
    }
}

/** 5xx i 429 (limit wywołań) mogą minąć — ponawiamy; pozostałe 4xx (zły token, podpis, koperta) nie. */
const isRetryable = (error: unknown) =>
    !(error instanceof PortalHttpError) || error.status >= 500 || error.status === 429;

async function attempt(endpoint: string, request: SubiektSyncRequest, auth: PortalAuth, deps: SendDeps): Promise<SubiektSyncResponse> {
    const body = JSON.stringify(request);
    // Timestamp i podpis przy każdej próbie: portal odrzuca żądania starsze niż 5 min.
    const timestamp = Math.floor(deps.now() / 1000);
    const response = await deps.fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${auth.token}`,
            'X-Subiekt-Timestamp': String(timestamp),
            'X-Subiekt-Signature': signBody(auth.secret, timestamp, body),
            'Content-Type': 'application/json',
        },
        body,
    });
    const text = await response.text();
    if (!response.ok) throw new PortalHttpError(response.status, text);
    return JSON.parse(text) as SubiektSyncResponse;
}

/** Jedna strona z ponowieniami (RETRY_DELAYS_MS). Rzuca ostatni błąd, gdy wszystkie próby zawiodły. */
export async function postPage(endpoint: string, request: SubiektSyncRequest, auth: PortalAuth, deps: SendDeps): Promise<SubiektSyncResponse> {
    for (let retry = 0; ; retry++) {
        try {
            return await attempt(endpoint, request, auth, deps);
        } catch (error) {
            const delay = RETRY_DELAYS_MS[retry];
            const message = error instanceof Error ? error.message : String(error);
            if (delay === undefined || !isRetryable(error)) throw error;
            deps.logger.warn(`Strona ${request.page}/${request.pages}: ${message} — ponowienie za ${delay / 1000} s`);
            await deps.sleep(delay);
        }
    }
}

export interface SendSummary {
    pagesSent: number;
    pages: number;
    accepted: number;
    unchanged: number;
    unassigned: number;
    rejected: SubiektSyncResponse['rejected'];
}

/** Wysyła strony po kolei; pierwsza strona, która nie przeszła mimo ponowień, przerywa wysyłkę. */
export async function sendAll(endpoint: string, pages: SubiektSyncRequest[], auth: PortalAuth, deps: SendDeps): Promise<SendSummary> {
    const summary: SendSummary = { pagesSent: 0, pages: pages.length, accepted: 0, unchanged: 0, unassigned: 0, rejected: [] };
    for (const page of pages) {
        let response: SubiektSyncResponse;
        try {
            response = await postPage(endpoint, page, auth, deps);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Wysyłka przerwana na stronie ${page.page}/${page.pages}: ${message}`, { cause: error });
        }
        summary.pagesSent++;
        summary.accepted += response.accepted;
        summary.unchanged += response.unchanged;
        summary.unassigned += response.unassigned;
        summary.rejected.push(...response.rejected);
        deps.logger.info(
            `Strona ${page.page}/${page.pages}: dokumentów ${page.documents.length}, przyjęte ${response.accepted}, ` +
            `bez zmian ${response.unchanged}, nieprzypisane ${response.unassigned}, odrzucone ${response.rejected.length}`,
        );
    }
    return summary;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' w czasie lokalnym. */
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Logger dopisujący do `<dir>/YYYY-MM-DD.log` (data lokalna w chwili zapisu) i — domyślnie — na konsolę. */
export function createFileLogger(dir: string, options: { now?: () => Date; echo?: boolean } = {}): Logger & { readonly file: string } {
    const now = options.now ?? (() => new Date());
    const echo = options.echo ?? true;
    mkdirSync(dir, { recursive: true });
    const write = (level: 'INFO' | 'WARN' | 'ERROR', message: string) => {
        const at = now();
        const line = `${localDate(at)} ${localTime(at)} ${level} ${message}`;
        appendFileSync(join(dir, `${localDate(at)}.log`), `${line}\n`, 'utf8');
        if (echo) (level === 'INFO' ? console.log : console.error)(line);
    };
    return {
        get file() { return join(dir, `${localDate(now())}.log`); },
        info: (message) => write('INFO', message),
        warn: (message) => write('WARN', message),
        error: (message) => write('ERROR', message),
    };
}
