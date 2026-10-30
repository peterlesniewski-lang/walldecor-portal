// Wysyłka paczki do portalu (PLAN-SUBIEKT-2026-10-29.md 2.1, Loop 5): podpis HMAC identyczny z portalem
// (src/lib/subiekt/auth.ts), strony po 200 dokumentów z jednym run_id, ponowienia z backoffem, log do pliku.
import { createHmac } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
    SUBIEKT_SYNC_MAX_DOCUMENTS,
    type SubiektDocumentPayload,
    type SubiektSyncRequest,
    type SubiektSyncResponse,
} from './contract.ts';

/** Przerwy przed kolejnymi ponowieniami: 3 ponowienia po pierwszej próbie. */
export const RETRY_DELAYS_MS: readonly number[] = [10_000, 60_000, 300_000];
/** Limit czasu jednego żądania; przekroczenie = błąd sieci (ponawiany). */
export const REQUEST_TIMEOUT_MS = 90_000;

export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export interface SendDeps {
    fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<Response>;
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

const TYPE_ORDER: Record<SubiektDocumentPayload['type'], number> = { ZK: 0, FP: 0, WZ: 1, FS: 2, KFS: 3 };

/**
 * Rodzice przed dziećmi: ZK/FP → WZ → FS → KFS, w obrębie typu po dacie i id (jak sortDocumentsForProcessing
 * w portalu). Portal sortuje w obrębie strony; to sortowanie dba o kolejność między stronami. Nie mutuje wejścia.
 */
export function sortForSending(documents: SubiektDocumentPayload[]): SubiektDocumentPayload[] {
    return [...documents].sort((a, b) =>
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
        || (a.issued_at === b.issued_at ? 0 : a.issued_at < b.issued_at ? -1 : 1)
        || a.external_id - b.external_id);
}

/** Strony po `pageSize` dokumentów (po sortForSending) z tym samym run_id. Pusta paczka = jedna pusta strona (portal zapisuje przebieg). */
export function buildPages(
    unsorted: SubiektDocumentPayload[],
    runId: string,
    agentVersion: string,
    pageSize = SUBIEKT_SYNC_MAX_DOCUMENTS,
): SubiektSyncRequest[] {
    const documents = sortForSending(unsorted);
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

/** Odpowiedź 200, której treść nie jest odpowiedzią synchronizacji (np. strona bramki sieciowej). */
export class PortalResponseError extends Error {}

/** 5xx i 429 (limit wywołań) mogą minąć — ponawiamy; pozostałe 4xx (zły token, podpis, koperta) i zła treść 200 nie. */
const isRetryable = (error: unknown) =>
    !(error instanceof PortalResponseError) && (!(error instanceof PortalHttpError) || error.status >= 500 || error.status === 429);

const isCount = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function parseResponse(text: string): SubiektSyncResponse {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        json = null;
    }
    const r = json as Partial<SubiektSyncResponse> | null;
    const valid = r !== null && typeof r === 'object'
        && isCount(r.accepted) && isCount(r.unchanged) && isCount(r.unassigned) && Array.isArray(r.rejected)
        && r.rejected.every((x) => x !== null && typeof x === 'object' && typeof x.external_id === 'number' && typeof x.reason === 'string');
    if (!valid) throw new PortalResponseError(`Nieprawidłowa odpowiedź portalu (HTTP 200): ${text.slice(0, 300)}`);
    return r as SubiektSyncResponse;
}

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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) throw new PortalHttpError(response.status, text);
    return parseResponse(text);
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

/**
 * Logger dopisujący do `<dir>/YYYY-MM-DD.log` (data lokalna w chwili zapisu) i — domyślnie — na konsolę.
 * Błąd zapisu pliku (brak uprawnień, pełny dysk) nigdy nie przerywa uruchomienia: wiersz trafia wtedy na
 * konsolę, a informacja o problemie z logiem pojawia się raz.
 */
export function createFileLogger(
    dir: string,
    options: {
        now?: () => Date;
        echo?: boolean;
        append?: (path: string, text: string) => void;
        mkdir?: (dir: string) => void;
    } = {},
): Logger & { readonly file: string } {
    const now = options.now ?? (() => new Date());
    const echo = options.echo ?? true;
    const append = options.append ?? ((path: string, text: string) => appendFileSync(path, text, 'utf8'));
    const mkdir = options.mkdir ?? ((path: string) => { mkdirSync(path, { recursive: true }); });
    let failureReported = false;
    const reportFailure = (error: unknown) => {
        if (failureReported) return;
        failureReported = true;
        console.error(`Nie można zapisać logu w ${dir}: ${error instanceof Error ? error.message : String(error)} — dalsze wpisy tylko na konsoli`);
    };
    try {
        mkdir(dir);
    } catch (error) {
        reportFailure(error);
    }
    const write = (level: 'INFO' | 'WARN' | 'ERROR', message: string) => {
        const at = now();
        const line = `${localDate(at)} ${localTime(at)} ${level} ${message}`;
        let written = true;
        try {
            append(join(dir, `${localDate(at)}.log`), `${line}\n`);
        } catch (error) {
            written = false;
            reportFailure(error);
        }
        if (echo || !written) (level === 'INFO' && written ? console.log : console.error)(line);
    };
    return {
        get file() { return join(dir, `${localDate(now())}.log`); },
        info: (message) => write('INFO', message),
        warn: (message) => write('WARN', message),
        error: (message) => write('ERROR', message),
    };
}

/** Ile dni trzymamy dzienne logi `RRRR-MM-DD.log`. */
export const LOG_RETENTION_DAYS = 90;
const DAILY_LOG = /^(\d{4}-\d{2}-\d{2})\.log$/;

/** Dzienne logi z datą w nazwie starszą niż `days` dni przed `today` (data lokalna). Inne pliki (probe, dry-run, last-sync) zostają. */
export function staleLogFiles(names: string[], today: Date, days = LOG_RETENTION_DAYS): string[] {
    const cutoff = localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
    return names.filter((name) => {
        const match = DAILY_LOG.exec(name);
        return match !== null && (match[1] as string) < cutoff;
    }).sort();
}

export interface PruneFs {
    readdir: (dir: string) => string[];
    rm: (path: string) => void;
}
const realFs: PruneFs = { readdir: (dir) => readdirSync(dir), rm: (path) => rmSync(path, { force: true }) };

/** Usuwa stare dzienne logi z `dir`; zwraca nazwy usuniętych plików. Rzuca przy błędzie systemu plików. */
export function pruneLogs(dir: string, now = new Date(), days = LOG_RETENTION_DAYS, fs: PruneFs = realFs): string[] {
    if (!existsSync(dir)) return [];
    const stale = staleLogFiles(fs.readdir(dir), now, days);
    for (const name of stale) fs.rm(join(dir, name));
    return stale;
}

/**
 * Sprzątanie logów przy starcie, które nigdy nie przerywa uruchomienia: plik, którego nie da się usunąć
 * (np. otwarty w Notatniku), i błąd odczytu katalogu dają ostrzeżenie w dziennym logu.
 */
export function pruneLogsSafely(dir: string, logger: Logger, now = new Date(), fs: Partial<PruneFs> = {}): string[] {
    const io: PruneFs = { ...realFs, ...fs };
    const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
    let stale: string[];
    try {
        stale = existsSync(dir) ? staleLogFiles(io.readdir(dir), now) : [];
    } catch (error) {
        logger.warn(`Nie udało się przejrzeć starych logów: ${message(error)}`);
        return [];
    }
    const removed: string[] = [];
    for (const name of stale) {
        try {
            io.rm(join(dir, name));
            removed.push(name);
        } catch (error) {
            logger.warn(`Nie udało się usunąć starego logu ${name}: ${message(error)}`);
        }
    }
    return removed;
}
