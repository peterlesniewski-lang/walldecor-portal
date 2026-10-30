// Agent Subiekt GT → Portal Architekta. Tryby: synchronizacja (domyślnie), --dry-run, --probe, --since RRRR-MM-DD.
// Kody wyjścia: zob. EXIT poniżej i README.md.
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAncestors, fetchPayerHistory, selectChains, GT_DOC_TYPE, type ChainSelection, type HeaderRow } from './chain.ts';
import { AGENT_DIR, AGENT_VERSION, applyEnvFile, ConfigError, LOGS_DIR, loadConfig, lookbackStart, parseArgs, type AgentConfig } from './config.ts';
import { categoryParam, isDatabaseError, openPool, queryByIds, queryByNames, queryRows, sinceParam, type Pool } from './db.ts';
import { isPaid, paidByDocument, type FinanceRow } from './paid.ts';
import { buildPayloads, type BuildResult, type ContractorRow, type PositionRow } from './payload.ts';
import { findMissingColumns, type ColumnRow } from './probe.ts';
import {
    REQUIRED_COLUMNS, SQL_ADDRESS_HISTORY_SAMPLE, SQL_CATEGORY, SQL_CHAIN_HEADERS, SQL_TABLES, SQL_TYPE_COUNTS,
    sqlArchitectZkOfPayers, sqlColumns, sqlContractors, sqlFinance, sqlHeadersByIds, sqlInvoicesOfPayers, sqlPositions,
} from './queries.ts';
import { docNumber, formatSummary, manualReviewCount, money, typeLabel } from './report.ts';
import { buildPages, createFileLogger, localDate, sendAll, type Logger } from './send.ts';

export const EXIT = {
    OK: 0,
    CONFIG: 1,
    DATABASE: 2,
    PORTAL: 3,
    INCOMPLETE: 4,
    UNEXPECTED: 5,
} as const;

const HELP = `Agent Subiekt GT → Portal Architekta ${AGENT_VERSION}

  node dist/main.js               synchronizacja: odczyt bazy GT i wysyłka do portalu
  node dist/main.js --dry-run     buduje paczkę i zapisuje ją w logs/, nic nie wysyła
  node dist/main.js --probe       sprawdza połączenie i schemat bazy GT (tabele, kolumny, przykłady)
  --since RRRR-MM-DD              dokumenty od tej daty zamiast LOOKBACK_MONTHS

Kody wyjścia: 0 OK · 1 konfiguracja · 2 baza GT / brak kolumn · 3 portal · 4 dokumenty do ręcznej obsługi · 5 nieoczekiwany błąd agenta`;

interface Collected {
    headers: HeaderRow[];
    selection: ChainSelection;
    contractors: Map<number, ContractorRow>;
    positions: Map<number, PositionRow[]>;
    finance: FinanceRow[];
    build: BuildResult;
}

async function collect(pool: Pool, config: AgentConfig, since: string): Promise<Collected> {
    const headers = await queryRows<HeaderRow>(pool, SQL_CHAIN_HEADERS, sinceParam(since));
    const ancestors = await fetchAncestors(headers, (ids) => queryByIds<HeaderRow>(pool, sqlHeadersByIds, ids));
    const options = { architectCategoryId: config.architectCategoryId };
    const payerHistory = await fetchPayerHistory(headers, options, {
        architectZkOfPayers: (ids) => queryByIds<HeaderRow>(pool, sqlArchitectZkOfPayers, ids, categoryParam(config.architectCategoryId)),
        invoicesOfPayers: (ids) => queryByIds<HeaderRow>(pool, sqlInvoicesOfPayers, ids),
    });
    const selection = selectChains(headers, options, { ancestors, payerHistory });
    const ids = selection.documents.map((d) => d.header.dok_Id);
    const contractorRows = await queryByIds<ContractorRow>(pool, sqlContractors, [...ids, ...selection.ambiguous.map((a) => a.fs.dok_Id)]);
    const positionRows = ids.length > 0 ? await queryByIds<PositionRow>(pool, sqlPositions, ids) : [];
    const finance = ids.length > 0 ? await queryByIds<FinanceRow>(pool, sqlFinance, ids) : [];

    const contractors = new Map(contractorRows.map((row) => [row.dok_Id, row]));
    const positions = new Map<number, PositionRow[]>();
    for (const row of positionRows) positions.set(row.ob_DokHanId, [...(positions.get(row.ob_DokHanId) ?? []), row]);
    const build = buildPayloads(selection, { contractors, positions, paid: paidByDocument(finance) });
    return { headers, selection, contractors, positions, finance, build };
}

function summaryLines(title: string, config: AgentConfig, since: string, runId: string, data: Collected): string[] {
    return formatSummary({
        title, generatedAt: new Date().toLocaleString('pl-PL'), since, agentVersion: AGENT_VERSION, runId,
        architectCategoryId: config.architectCategoryId, selection: data.selection, build: data.build, contractors: data.contractors,
    });
}

async function dryRun(pool: Pool, config: AgentConfig, since: string, logger: Logger): Promise<number> {
    const runId = randomUUID();
    const data = await collect(pool, config, since);
    const pages = buildPages(data.build.documents, runId, AGENT_VERSION);
    const stamp = localDate(new Date());
    const jsonFile = join(config.logsDir, `dry-run-${stamp}.json`);
    const txtFile = join(config.logsDir, `dry-run-${stamp}.txt`);
    writeFileSync(jsonFile, `${JSON.stringify(pages, null, 2)}\n`, 'utf8');
    const lines = summaryLines('DRY-RUN — paczka NIE została wysłana', config, since, runId, data);
    writeFileSync(txtFile, `${lines.join('\r\n')}\r\n`, 'utf8');
    for (const warning of data.selection.heuristic) logger.warn(`MULTI_SOURCE_HEURISTIC ${docNumber(warning.fs)} → ${docNumber(warning.parent)}`);
    logger.info(`Dry-run: ${data.build.documents.length} dokumentów, stron: ${pages.length}; paczka ${jsonFile}, podsumowanie ${txtFile}`);
    const manual = manualReviewCount(data.selection, data.build);
    if (manual > 0) logger.warn(`Do ręcznej obsługi: ${manual} dokumentów — szczegóły w ${txtFile}`);
    return manual > 0 ? EXIT.INCOMPLETE : EXIT.OK;
}

async function sync(pool: Pool, config: AgentConfig, since: string, logger: Logger): Promise<number> {
    if (!config.portal) {
        logger.error(`Brak konfiguracji portalu: ${config.portalProblems.join('; ')}`);
        return EXIT.CONFIG;
    }
    const runId = randomUUID();
    const data = await collect(pool, config, since);
    for (const line of summaryLines('SYNCHRONIZACJA', config, since, runId, data)) logger.info(line);
    for (const warning of data.selection.heuristic) logger.warn(`MULTI_SOURCE_HEURISTIC ${docNumber(warning.fs)} → ${docNumber(warning.parent)}`);

    const pages = buildPages(data.build.documents, runId, AGENT_VERSION);
    logger.info(`Wysyłka do ${config.portal.endpoint}: ${data.build.documents.length} dokumentów, stron ${pages.length}, run_id ${runId}`);
    try {
        const summary = await sendAll(config.portal.endpoint, pages, config.portal, {
            fetch: (url, init) => fetch(url, init),
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            now: () => Date.now(),
            logger,
        });
        logger.info(`Portal: przyjęte ${summary.accepted}, bez zmian ${summary.unchanged}, nieprzypisane ${summary.unassigned}, odrzucone ${summary.rejected.length}`);
        for (const rejected of summary.rejected) logger.warn(`Odrzucony dokument ${rejected.external_id}: ${rejected.reason}`);
        const manual = manualReviewCount(data.selection, data.build);
        if (manual > 0) logger.warn(`Do ręcznej obsługi: ${manual} dokumentów (FS wielodokumentowe bez jednoznacznego ZK, błędy danych)`);
        return summary.rejected.length > 0 || manual > 0 ? EXIT.INCOMPLETE : EXIT.OK;
    } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        return EXIT.PORTAL;
    }
}

function describeValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return `<binarne, ${value.length} B>`;
    const text = String(value).replace(/\s+/g, ' ');
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

async function probe(pool: Pool, config: AgentConfig, since: string, logger: Logger): Promise<number> {
    const out: string[] = [];
    const print = (line = '') => { out.push(line); console.log(line); };
    let failed = false;
    const section = async (title: string, run: () => Promise<void>) => {
        print();
        print(`== ${title}`);
        try {
            await run();
        } catch (error) {
            failed = true;
            print(`BŁĄD: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    print(`SONDA agenta ${AGENT_VERSION} · baza ${config.db.database} na ${config.db.server}${config.db.instanceName ? `\\${config.db.instanceName}` : `:${config.db.port}`} · dokumenty od ${since}`);

    let missingCount = 0;
    await section('Tabele i kolumny używane przez agenta (INFORMATION_SCHEMA.COLUMNS)', async () => {
        const tables = Object.keys(REQUIRED_COLUMNS);
        const columns = await queryByNames<ColumnRow>(pool, sqlColumns, tables);
        const allTables = (await queryRows<{ TABLE_NAME: string }>(pool, SQL_TABLES)).map((row) => row.TABLE_NAME);
        const missing = findMissingColumns(REQUIRED_COLUMNS, columns, allTables);
        missingCount = missing.length;
        const total = Object.values(REQUIRED_COLUMNS).reduce((sum, list) => sum + list.length, 0);
        if (missing.length === 0) print(`OK: ${tables.length} tabel, ${total} kolumn — wszystkie istnieją.`);
        for (const m of missing) {
            const what = m.column === null ? `BRAK TABELI ${m.table}` : `BRAK KOLUMNY ${m.table}.${m.column}`;
            print(`${what} — najbliższe nazwy: ${m.suggestions.length > 0 ? m.suggestions.join(', ') : '(brak podobnych)'}`);
        }
    });

    await section(`Dokumenty wg dok_Typ / dok_Podtyp od ${since}`, async () => {
        const rows = await queryRows<{ dok_Typ: number; dok_Podtyp: number; ile: number }>(pool, SQL_TYPE_COUNTS, sinceParam(since));
        for (const row of rows) print(`${typeLabel(row.dok_Typ).padEnd(4)} dok_Typ ${String(row.dok_Typ).padStart(2)} podtyp ${row.dok_Podtyp}: ${row.ile}`);
    });

    await section(`Kategoria architekta (ARCHITECT_CATEGORY_ID = ${config.architectCategoryId})`, async () => {
        const [row] = await queryRows<{ kat_Id: number; kat_Nazwa: string }>(pool, SQL_CATEGORY, categoryParam(config.architectCategoryId));
        if (!row) throw new Error(`brak kategorii kat_Id ${config.architectCategoryId} w sl_Kategoria`);
        print(`kat_Id ${row.kat_Id}: „${row.kat_Nazwa}”${row.kat_Nazwa.trim() === 'Architekt' ? '' : ' — UWAGA: oczekiwano „Architekt”'}`);
    });

    let data: Collected | null = null;
    await section('Korzenie i łańcuchy (ta sama logika co --dry-run)', async () => {
        data = await collect(pool, config, since);
        const roots = data.selection.documents.filter((d) => d.rootReason !== null);
        const count = (reason: string) => roots.filter((d) => d.rootReason === reason).length;
        print(`Korzenie: ${roots.length} (tylko kategoria ${count('CATEGORY')}, tylko znacznik ${count('MARKER')}, oba ${count('BOTH')})`);
        const byType = new Map<number, number>();
        for (const d of data.selection.documents) byType.set(d.header.dok_Typ, (byType.get(d.header.dok_Typ) ?? 0) + 1);
        print(`Dokumenty w zbiorze: ${data.selection.documents.length} (${[...byType].map(([t, n]) => `${typeLabel(t)} ${n}`).join(', ')})`);
        print(`Heurystyka FS '+': ${data.selection.heuristic.length}, niejednoznaczne: ${data.selection.ambiguous.length}, '+' bez ZK architekta: ${data.selection.unlinkedMultiSource}`);
        print(`Błędy budowy paczki: ${data.build.errors.length}${data.build.errors.slice(0, 5).map((e) => `\n  ${e.number}: ${e.message}`).join('')}`);
    });

    await section('Przykłady FS w zbiorze wg dok_Podtyp (do 5 na podtyp)', async () => {
        if (!data) throw new Error('brak danych łańcuchów (poprzednia sekcja nie powiodła się)');
        const collected: Collected = data;
        const fs = collected.selection.documents.filter((d) => d.header.dok_Typ === GT_DOC_TYPE.FS);
        if (fs.length === 0) print('Brak FS w zbiorze.');
        for (const subtype of [...new Set(fs.map((d) => d.header.dok_Podtyp))].sort((a, b) => a - b)) {
            print(`Podtyp ${subtype}:`);
            for (const d of fs.filter((x) => x.header.dok_Podtyp === subtype).slice(-5)) {
                const parent = d.parentId === null ? 'bez rodzica' : `rodzic ${(() => { const p = collected.selection.documents.find((x) => x.header.dok_Id === d.parentId); return p ? docNumber(p.header) : '?'; })()}`;
                print(`  ${docNumber(d.header)} (${d.header.dok_Id}) ${d.header.dok_DataWyst} netto ${money(d.header.dok_WartNetto)} brutto ${money(d.header.dok_WartBrutto)} · ${parent}`);
            }
        }
    });

    await section('nz__Finanse najnowszej FS w zbiorze', async () => {
        if (!data) throw new Error('brak danych łańcuchów');
        const collected: Collected = data;
        const newest = collected.selection.documents.filter((d) => d.header.dok_Typ === GT_DOC_TYPE.FS).at(-1);
        if (!newest) { print('Brak FS w zbiorze.'); return; }
        const rows = collected.finance.filter((row) => row.nzf_IdDokumentAuto === newest.header.dok_Id);
        print(`${docNumber(newest.header)} (${newest.header.dok_Id}) brutto ${money(newest.header.dok_WartBrutto)}: wierszy ${rows.length}, is_paid = ${isPaid(rows)}`);
        for (const row of rows) print(`  ${Object.entries(row).map(([k, v]) => `${k}=${describeValue(v)}`).join(' ')}`);
    });

    await section('adrh__Historia — SELECT TOP 1 *', async () => {
        const [row] = await queryRows<Record<string, unknown>>(pool, SQL_ADDRESS_HISTORY_SAMPLE);
        if (!row) { print('Tabela pusta.'); return; }
        for (const [key, value] of Object.entries(row)) print(`  ${key} = ${describeValue(value)}`);
    });

    await section('Pozycje najnowszej KFS w zbiorze i jej FS (ob_Znak, ob_DoId — weryfikacja korekt)', async () => {
        if (!data) throw new Error('brak danych łańcuchów');
        const collected: Collected = data;
        const kfs = collected.selection.documents.filter((d) => d.header.dok_Typ === GT_DOC_TYPE.KFS).at(-1);
        if (!kfs) { print('Brak KFS w zbiorze.'); return; }
        for (const id of [kfs.header.dok_Id, kfs.parentId].filter((x): x is number => x !== null)) {
            const doc = collected.selection.documents.find((d) => d.header.dok_Id === id)?.header;
            print(`${doc ? docNumber(doc) : '?'} (${id}) netto ${money(doc?.dok_WartNetto ?? 0)}:`);
            for (const p of collected.positions.get(id) ?? []) {
                print(`  ob_Id ${p.ob_Id} lp ${p.ob_DokHanLp} ob_Znak ${p.ob_Znak} ob_DoId ${p.ob_DoId ?? 'NULL'} ob_TowId ${p.ob_TowId ?? 'NULL'} rodzaj ${p.ob_TowRodzaj} ilość ${p.ob_Ilosc} netto ${money(p.ob_WartNetto)} · ${describeValue(p.ob_Opis ?? p.tw_Nazwa)}`);
            }
        }
    });

    const code = missingCount > 0 || failed ? EXIT.DATABASE : EXIT.OK;
    print();
    print(code === EXIT.OK ? 'WYNIK: OK (kod 0)' : `WYNIK: BŁĄD (kod ${code}) — ${missingCount > 0 ? `brakuje ${missingCount} tabel/kolumn` : 'część sprawdzeń się nie powiodła'}`);
    const file = join(config.logsDir, `probe-${localDate(new Date())}.txt`);
    writeFileSync(file, `${out.join('\r\n')}\r\n`, 'utf8');
    logger.info(`Sonda zakończona kodem ${code}; raport ${file}`);
    return code;
}

const describeError = (error: unknown) => (error instanceof Error ? error.stack ?? error.message : String(error));

export async function main(argv: string[]): Promise<number> {
    // Logger przed konfiguracją: błąd `.env` też ląduje w logs/ (zadanie z Harmonogramu nie ma konsoli).
    const logger = createFileLogger(LOGS_DIR);
    let args: ReturnType<typeof parseArgs>;
    let config: AgentConfig;
    try {
        args = parseArgs(argv);
        if (args.mode === 'help') { console.log(HELP); return EXIT.OK; }
        const envFile = join(AGENT_DIR, '.env');
        if (existsSync(envFile)) applyEnvFile(envFile, process.env);
        config = loadConfig(process.env);
    } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        logger.error(`Błąd konfiguracji: ${error.message}`);
        console.error(`\n${HELP}`);
        return EXIT.CONFIG;
    }

    const since = args.since ?? lookbackStart(new Date(), config.lookbackMonths);
    logger.info(`Start ${args.mode} · agent ${AGENT_VERSION} · dokumenty od ${since}`);

    let pool: Pool;
    try {
        pool = await openPool(config.db);
    } catch (error) {
        logger.error(`Nie udało się połączyć z bazą GT: ${error instanceof Error ? error.message : String(error)}`);
        return EXIT.DATABASE;
    }
    try {
        if (args.mode === 'probe') return await probe(pool, config, since, logger);
        if (args.mode === 'dry-run') return await dryRun(pool, config, since, logger);
        return await sync(pool, config, since, logger);
    } catch (error) {
        if (isDatabaseError(error)) {
            logger.error(`Błąd odczytu bazy GT: ${describeError(error)}`);
            return EXIT.DATABASE;
        }
        logger.error(`Nieoczekiwany błąd agenta: ${describeError(error)}`);
        return EXIT.UNEXPECTED;
    } finally {
        try {
            await pool.close();
        } catch (error) {
            logger.warn(`Nie udało się zamknąć połączenia z bazą: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => { console.error(error); process.exitCode = EXIT.UNEXPECTED; },
);
