// Konfiguracja agenta z `.env` w katalogu agenta (wczytuje main.ts) i argumenty wiersza poleceń.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Katalog agenta: rodzic `dist/` (po kompilacji) albo `src/` (testy). */
export const AGENT_DIR = fileURLToPath(new URL('..', import.meta.url));

export const AGENT_VERSION: string = (JSON.parse(readFileSync(join(AGENT_DIR, 'package.json'), 'utf8')) as { version: string }).version;

export interface DbConfig {
    server: string;
    /** Nazwana instancja SQL (przez SQL Browser); null, gdy podano port. */
    instanceName: string | null;
    port: number | null;
    database: string;
    user: string;
    password: string;
}

export interface PortalConfig {
    /** Pełny adres endpointu synchronizacji. */
    endpoint: string;
    token: string;
    secret: string;
}

export interface AgentConfig {
    db: DbConfig;
    /** null, gdy brak PORTAL_URL / tokenu / sekretu — wystarcza do --probe i --dry-run. */
    portal: PortalConfig | null;
    portalProblems: string[];
    lookbackMonths: number;
    architectCategoryId: number;
    logsDir: string;
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

const value = (env: Env, key: string) => (env[key] ?? '').trim();

function positiveInt(env: Env, key: string, fallback: number, problems: string[]): number {
    const raw = value(env, key);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        problems.push(`${key} musi być dodatnią liczbą całkowitą (jest „${raw}”)`);
        return fallback;
    }
    return n;
}

/** Czyta i sprawdza konfigurację; błędy bazy i parametrów → ConfigError z listą problemów. */
export function loadConfig(env: Env, agentDir = AGENT_DIR): AgentConfig {
    const problems: string[] = [];
    for (const key of ['SUBIEKT_DB_NAME', 'SUBIEKT_DB_USER', 'SUBIEKT_DB_PASSWORD']) {
        if (!value(env, key)) problems.push(`brak ${key}`);
    }
    const port = value(env, 'SUBIEKT_DB_PORT') ? positiveInt(env, 'SUBIEKT_DB_PORT', 0, problems) : null;
    const db: DbConfig = {
        server: value(env, 'SUBIEKT_DB_SERVER') || 'localhost',
        instanceName: port ? null : (value(env, 'SUBIEKT_DB_INSTANCE') || 'INSERTGT'),
        port: port || null,
        database: value(env, 'SUBIEKT_DB_NAME'),
        user: value(env, 'SUBIEKT_DB_USER'),
        password: env.SUBIEKT_DB_PASSWORD ?? '',
    };
    const lookbackMonths = positiveInt(env, 'LOOKBACK_MONTHS', 18, problems);
    const architectCategoryId = positiveInt(env, 'ARCHITECT_CATEGORY_ID', 14, problems);
    if (problems.length > 0) throw new ConfigError(problems.join('; '));

    const portalProblems: string[] = [];
    let endpoint = '';
    const portalUrl = value(env, 'PORTAL_URL');
    if (!portalUrl) portalProblems.push('brak PORTAL_URL');
    else {
        try {
            const url = new URL('/api/integrations/subiekt/sync', portalUrl);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
            endpoint = url.toString();
        } catch {
            portalProblems.push(`PORTAL_URL nie jest adresem http(s): „${portalUrl}”`);
        }
    }
    if (!value(env, 'SUBIEKT_SYNC_TOKEN')) portalProblems.push('brak SUBIEKT_SYNC_TOKEN');
    if (!value(env, 'SUBIEKT_SYNC_SECRET')) portalProblems.push('brak SUBIEKT_SYNC_SECRET');
    const portal = portalProblems.length === 0
        ? { endpoint, token: value(env, 'SUBIEKT_SYNC_TOKEN'), secret: value(env, 'SUBIEKT_SYNC_SECRET') }
        : null;

    return { db, portal, portalProblems, lookbackMonths, architectCategoryId, logsDir: join(agentDir, 'logs') };
}

export type Mode = 'sync' | 'dry-run' | 'probe' | 'help';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(argv: string[]): { mode: Mode; since: string | null } {
    let mode: Mode = 'sync';
    let since: string | null = null;
    const setMode = (next: Mode) => {
        if (mode !== 'sync' && mode !== next) throw new ConfigError('Podaj najwyżej jeden z trybów --dry-run / --probe.');
        mode = next;
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i] as string;
        if (arg === '--dry-run') setMode('dry-run');
        else if (arg === '--probe') setMode('probe');
        else if (arg === '--help' || arg === '-h') return { mode: 'help', since: null };
        else if (arg === '--since' || arg.startsWith('--since=')) {
            const raw = arg === '--since' ? argv[++i] : arg.slice('--since='.length);
            if (!raw || !DATE_RE.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) {
                throw new ConfigError('--since wymaga daty w formacie RRRR-MM-DD, np. --since 2026-01-01');
            }
            since = raw;
        } else throw new ConfigError(`Nieznany argument: ${arg}`);
    }
    return { mode, since };
}

/** Dzisiejsza data lokalna minus `months` miesięcy, jako 'YYYY-MM-DD' (31.03 − 1 mies. → 28/29.02). */
export function lookbackStart(today: Date, months: number): string {
    const year = today.getFullYear();
    const monthIndex = today.getMonth() - months;
    const target = new Date(year, monthIndex, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(today.getDate(), lastDay));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}
