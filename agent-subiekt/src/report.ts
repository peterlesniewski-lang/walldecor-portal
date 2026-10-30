// Podsumowanie przebiegu (dry-run / sync) w formie tekstu do ręcznej kontroli. Czyste funkcje.
import { ARCHITECT_MARKER, GT_DOC_TYPE, type ChainSelection, type HeaderRow } from './chain.ts';
import type { BuildResult, ContractorRow } from './payload.ts';

/** Skróty dok_Typ z bazy GT (C5, 30.10.2026) — tylko do wyświetlania. */
export const GT_TYPE_LABEL: Readonly<Record<number, string>> = {
    1: 'FZ', 2: 'FS', 4: 'RS', 5: 'KFZ', 6: 'KFS', 9: 'MM', 10: 'PZ', 11: 'WZ', 12: 'PW', 13: 'RW', 14: 'ZW',
    15: 'ZD', 16: 'ZK', 21: 'PA', 51: 'TS',
};
export const typeLabel = (dokTyp: number) => GT_TYPE_LABEL[dokTyp] ?? `typ ${dokTyp}`;

export const money = (n: number) => Number(n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Numer dokumentu do wyświetlenia (odporny na NULL w dok_NrPelny). */
export const docNumber = (h: Pick<HeaderRow, 'dok_NrPelny'>) => (h.dok_NrPelny ?? '').trim() || '(bez numeru)';
const nr = (h: HeaderRow) => `${docNumber(h)} (dok_Id ${h.dok_Id})`;

/**
 * Dokumenty do ręcznej obsługi: FS wielodokumentowe bez jednoznacznego ZK i dokumenty pominięte z powodu błędu
 * danych. > 0 → agent kończy się kodem 4 (także gdy portal przyjął resztę paczki).
 */
export function manualReviewCount(selection: Pick<ChainSelection, 'ambiguous'>, build: Pick<BuildResult, 'errors'>): number {
    return selection.ambiguous.length + build.errors.length;
}

function contractorName(id: number, build: BuildResult, contractors: Map<number, ContractorRow>): string {
    const built = build.documents.find((d) => d.external_id === id);
    if (built) return built.contractor_name;
    const row = contractors.get(id);
    return [row?.adrh_NazwaPelna, row?.adrh_Nazwa, row?.adr_NazwaPelna, row?.adr_Nazwa, row?.kh_Symbol]
        .map((v) => (v ?? '').trim()).find(Boolean) ?? '(brak nazwy)';
}

export interface SummaryInput {
    title: string;
    generatedAt: string;
    since: string;
    agentVersion: string;
    runId: string;
    architectCategoryId: number;
    selection: ChainSelection;
    build: BuildResult;
    contractors: Map<number, ContractorRow>;
}

export function formatSummary(input: SummaryInput): string[] {
    const { selection, build, contractors } = input;
    const lines: string[] = [];
    const push = (line = '') => lines.push(line);

    push(input.title);
    push(`Wygenerowano: ${input.generatedAt} · agent ${input.agentVersion} · run_id ${input.runId}`);
    push(`Dokumenty od: ${input.since} · kategoria architekta: kat_Id ${input.architectCategoryId} · znacznik w Uwagach: ${ARCHITECT_MARKER}`);
    const manual = manualReviewCount(selection, build);
    push(manual > 0
        ? `DO RĘCZNEJ OBSŁUGI: ${manual} (sekcje „FS WIELODOKUMENTOWE BEZ JEDNOZNACZNEGO ZK” i „DOKUMENTY POMINIĘTE” niżej) — kod wyjścia 4`
        : 'DO RĘCZNEJ OBSŁUGI: 0');
    push();

    const sent = new Set(build.documents.map((d) => d.external_id));
    const counts = new Map<string, number>();
    for (const d of build.documents) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
    push(`DOKUMENTY W PACZCE: ${build.documents.length} (${['ZK', 'WZ', 'FS', 'KFS'].map((t) => `${t} ${counts.get(t) ?? 0}`).join(', ')})`);
    const fsSubtypes = new Map<number, number>();
    for (const d of selection.documents) {
        if (d.header.dok_Typ === GT_DOC_TYPE.FS && sent.has(d.header.dok_Id)) {
            fsSubtypes.set(d.header.dok_Podtyp, (fsSubtypes.get(d.header.dok_Podtyp) ?? 0) + 1);
        }
    }
    if (fsSubtypes.size > 0) {
        push(`FS wg dok_Podtyp: ${[...fsSubtypes].sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p}: ${n}`).join(', ')}`);
    }
    push();

    const byId = new Map(selection.documents.map((d) => [d.header.dok_Id, d]));
    const rootOf = (id: number) => {
        let current = id;
        for (let step = 0; step < 32; step++) {
            const parent = byId.get(current)?.parentId ?? null;
            if (parent === null) return current;
            current = parent;
        }
        return current;
    };
    const chains = new Map<number, number[]>();
    for (const d of selection.documents) {
        const root = rootOf(d.header.dok_Id);
        if (root !== d.header.dok_Id) chains.set(root, [...(chains.get(root) ?? []), d.header.dok_Id]);
    }
    const roots = selection.documents.filter((d) => d.parentId === null);
    push(`KORZENIE ŁAŃCUCHÓW: ${roots.length} — sprawdź, że każdy to dokument architekta (zwykła sprzedaż nie może się tu pojawić)`);
    for (const root of roots) {
        const h = root.header;
        const marker = ARCHITECT_MARKER.exec(h.dok_Uwagi ?? '')?.[0];
        const flags = [
            marker ? `znacznik ${marker}` : 'BRAK ZNACZNIKA #A-… (portal: skrzynka „brak kodu architekta”)',
            root.rootReason === 'CATEGORY' || root.rootReason === 'BOTH' ? 'kategoria Architekt' : null,
            root.rootReason === null ? 'dokument pochodny bez rodzica w zbiorze' : null,
        ].filter(Boolean).join(' · ');
        push(`- ${nr(h)} · ${h.dok_DataWyst} · ${contractorName(h.dok_Id, build, contractors)} · netto ${money(h.dok_WartNetto)} · ${flags}${sent.has(h.dok_Id) ? '' : ' · NIE WYSŁANY (błąd danych)'}`);
        for (const childId of chains.get(h.dok_Id) ?? []) {
            const child = byId.get(childId);
            if (!child) continue;
            const c = child.header;
            push(`    └ ${nr(c)} · ${c.dok_DataWyst} · netto ${money(c.dok_WartNetto)}${child.viaHeuristic ? ' · rodzic z heurystyki' : ''}${sent.has(c.dok_Id) ? '' : ' · NIE WYSŁANY (błąd danych)'}`);
        }
    }
    push();

    push(`OSTRZEŻENIA MULTI_SOURCE_HEURISTIC: ${selection.heuristic.length}`);
    for (const { fs, parent } of selection.heuristic) {
        push(`- ${nr(fs)} (z wielu dokumentów, '+') przypisana do ${nr(parent)} — jedyny ZK architekta tego płatnika bez faktury`);
    }
    push();

    push(`FS WIELODOKUMENTOWE BEZ JEDNOZNACZNEGO ZK (pominięte, do ręcznej obsługi): ${selection.ambiguous.length}`);
    for (const { fs, candidates } of selection.ambiguous) {
        const who = candidates.length > 0 ? `kandydaci: ${candidates.map(docNumber).join(', ')}` : 'ZK architekta tego płatnika ma już fakturę albo późniejszą datę';
        push(`- ${nr(fs)} · ${fs.dok_DataWyst} · ${contractorName(fs.dok_Id, build, contractors)} · brutto ${money(fs.dok_WartBrutto)} · ${who}`);
    }
    push(`FS wielodokumentowe płatników bez oznaczonego ZK (zwykła sprzedaż, nie wysyłane): ${selection.unlinkedMultiSource}`);
    push();

    push(`DOKUMENTY POMINIĘTE Z POWODU BŁĘDU DANYCH: ${build.errors.length}`);
    for (const error of build.errors) push(`- ${error.number} (dok_Id ${error.externalId}): ${error.message}`);
    return lines;
}
