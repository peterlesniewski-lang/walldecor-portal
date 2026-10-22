'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, FileText, ArrowLeft, Loader2 } from 'lucide-react';
import { getAllArchitectNames } from '@/app/actions/architects';
import { importProjectsFromCSV, ImportRowInput, ImportRowResult } from '@/app/actions/import';
import { Banner, Button, KpiTile, StatusPill, formatDate, formatNumber } from '@/components/ui';

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
    return lines.map(line => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
            else { current += char; }
        }
        result.push(current.trim());
        return result;
    });
}

function parseAmount(val: string): number {
    const cleaned = (val || '').replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

function parseBool(val: string): boolean {
    return ['tak', 't', '1', 'yes', 'true'].includes((val || '').toLowerCase().trim());
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface ParsedRow extends ImportRowInput {
    architectFound: boolean;
    willAutoRegister: boolean;
    validAmount: boolean;
    isValid: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
    isOpen: boolean;
    onClose: (didImport: boolean) => void;
}

type Step = 'upload' | 'preview' | 'results';

export default function AdminCSVImportModal({ isOpen, onClose }: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const closeRef = useRef<() => void>(() => {});
    const [step, setStep] = useState<Step>('upload');
    const [architects, setArchitects] = useState<Set<string>>(new Set());
    const [architectsLoading, setArchitectsLoading] = useState(true);
    const [dragging, setDragging] = useState(false);
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [fileName, setFileName] = useState('');
    const [importing, setImporting] = useState(false);
    const [results, setResults] = useState<{ successCount: number; skippedCount: number; errorCount: number; newAccountsCreated: number; results: ImportRowResult[] } | null>(null);
    const [importDate, setImportDate] = useState('');
    const [fileError, setFileError] = useState<string | null>(null);
    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch architect names on open
    useEffect(() => {
        if (!isOpen) return;
        setArchitectsLoading(true);
        getAllArchitectNames()
            .then(list => setArchitects(new Set(list.map(a => a.name.toLowerCase().trim()))))
            .catch(() => setArchitects(new Set()))
            .finally(() => setArchitectsLoading(false));
    }, [isOpen]);

    // Esc zamyka okno
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen]);

    if (!isOpen) return null;

    const reset = () => {
        setStep('upload');
        setParsedRows([]);
        setFileName('');
        setResults(null);
        setDragging(false);
        setImportDate('');
        setFileError(null);
    };

    const handleClose = () => {
        const didImport = results !== null && results.successCount > 0;
        reset();
        onClose(didImport);
    };

    closeRef.current = handleClose;

    const processFile = (file: File) => {
        setFileError(null);
        if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
            setFileError('Wybierz plik CSV.');
            return;
        }
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const rawRows = parseCSV(text);
            if (rawRows.length === 0) { setFileError('Plik CSV jest pusty.'); return; }

            // Auto-detect header: if column H (index 7, Netto) of first row isn't a number → skip
            const firstRowAmount = parseAmount(rawRows[0]?.[7] || '');
            const hasHeader = firstRowAmount === 0 && isNaN(parseFloat((rawRows[0]?.[7] || '').replace(',', '.')));
            const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

            const rows: ParsedRow[] = dataRows
                .map(cells => {
                    // Pad to 15 columns to avoid undefined
                    while (cells.length < 15) cells.push('');
                    const architectName = cells[0].trim();
                    const architectEmail = cells[1].trim();
                    const clientLabel = cells[2].trim();
                    const orderNumber = cells[3].trim();
                    // cells[4] = Nr faktury — SKIP
                    // cells[5] = Kwota Zamówienia (brutto) — SKIP
                    // cells[6] = VAT — SKIP
                    const amountNet = parseAmount(cells[7]);
                    const isPaid = parseBool(cells[8]);
                    // cells[9] = Prowizja netto — SKIP
                    const prowizjaRozliczona = parseBool(cells[10]);
                    const invoiceNumber = cells[11].trim();
                    const architectStudio = cells[12].trim() || undefined;
                    const architectNip = cells[13].trim() || undefined;
                    const architectAddress = cells[14].trim() || undefined;

                    const architectFound = architectName !== '' && architects.has(architectName.toLowerCase().trim());
                    const willAutoRegister = !architectFound && architectEmail.includes('@');
                    const validAmount = amountNet > 0;
                    const isValid = (architectFound || willAutoRegister) && validAmount;

                    return { architectName, architectEmail, architectStudio, architectNip, architectAddress, clientLabel, orderNumber, amountNet, isPaid, prowizjaRozliczona, invoiceNumber, architectFound, willAutoRegister, validAmount, isValid };
                })
                // Filter completely empty rows
                .filter(r => r.architectName || r.clientLabel || r.orderNumber);

            if (rows.length === 0) { setFileError('Brak danych do zaimportowania.'); return; }
            setParsedRows(rows);
            setStep('preview');
        };
        reader.readAsText(file, 'UTF-8');
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        e.target.value = '';
    };

    const handleImport = async () => {
        const validRows: ImportRowInput[] = parsedRows
            .filter(r => r.isValid)
            .map(({ architectName, architectEmail, architectStudio, architectNip, architectAddress, clientLabel, orderNumber, amountNet, isPaid, prowizjaRozliczona, invoiceNumber }) => ({
                architectName, architectEmail, architectStudio, architectNip, architectAddress, clientLabel, orderNumber, amountNet, isPaid, prowizjaRozliczona, invoiceNumber
            }));

        if (validRows.length === 0) return;
        setFileError(null);
        setImporting(true);
        try {
            const result = await importProjectsFromCSV(validRows, importDate || null);
            setResults(result);
            setStep('results');
        } catch (err: any) {
            setFileError(err.message || 'Błąd podczas importu.');
        } finally {
            setImporting(false);
        }
    };

    const validCount = parsedRows.filter(r => r.isValid).length;
    const autoRegCount = parsedRows.filter(r => r.willAutoRegister && r.isValid).length;
    const invalidCount = parsedRows.length - validCount;
    const settledCount = parsedRows.filter(r => r.isValid && r.prowizjaRozliczona).length;

    const TH = 'label-caps px-4 py-3 text-left';
    const resultsSummary = results ? [
        { label: 'Zaimportowanych', value: results.successCount },
        ...(results.newAccountsCreated > 0 ? [{ label: 'Nowych kont', value: results.newAccountsCreated }] : []),
        { label: 'Pominiętych', value: results.skippedCount },
        { label: 'Błędów', value: results.errorCount },
    ] : [];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink/40" onClick={handleClose} />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="csv-import-title"
                className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-float"
            >

                {/* Header */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        {step === 'preview' && (
                            <button
                                onClick={() => { setStep('upload'); setParsedRows([]); }}
                                aria-label="Wróć do wyboru pliku"
                                className="rounded-sm p-2 text-ink-2 hover:bg-ink/5 hover:text-ink"
                            >
                                <ArrowLeft size={16} />
                            </button>
                        )}
                        <div>
                            <h3 id="csv-import-title" className="font-display text-xl text-ink">Import z CSV</h3>
                            <p className="mt-0.5 text-sm text-ink-2">
                                {step === 'upload' && 'Wgraj eksport z Google Sheets'}
                                {step === 'preview' && `Podgląd: ${parsedRows.length} wierszy · ${importDate ? formatDate(importDate) : 'data dzisiejsza'}`}
                                {step === 'results' && 'Wyniki importu'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        aria-label="Zamknij"
                        className="rounded-sm p-2 text-ink-2 hover:bg-ink/5 hover:text-ink"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">

                    {/* ── Step 1: Upload ── */}
                    {step === 'upload' && (
                        <div className="space-y-5 p-5 sm:p-6">
                            {/* Column mapping reference */}
                            <div className="rounded-md border border-border bg-surface-2 p-5">
                                <p className="label-caps mb-3">Oczekiwany format kolumn (Google Sheets)</p>
                                <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] text-ink sm:grid-cols-2 md:grid-cols-3">
                                    {[
                                        ['A', 'Architekt'],
                                        ['B', 'Email architekta ✓'],
                                        ['C', 'Nazwisko klienta'],
                                        ['D', 'Nr zamówienia'],
                                        ['E', 'Nr faktury (pomijane)'],
                                        ['F', 'Kwota brutto (pomijane)'],
                                        ['G', 'VAT (pomijane)'],
                                        ['H', 'Netto PLN ✓'],
                                        ['I', 'Zapłacone (Tak/Nie)'],
                                        ['J', 'Prowizja netto (pomijane)'],
                                        ['K', 'Prowizja rozliczona (Tak = historia: projekt zakończony, prowizja wypłacona, bez cashbacku)'],
                                        ['L', 'Nr dokumentu (arch.)'],
                                        ['M', 'Nazwa studia (opcjonalne)'],
                                        ['N', 'NIP (opcjonalne)'],
                                        ['O', 'Adres (opcjonalne)'],
                                    ].map(([col, label]) => (
                                        <div key={col} className="flex items-start gap-2">
                                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-ink/[0.06] font-mono text-[11px] font-medium text-ink">{col}</span>
                                            <span className={label.includes('pomijane') ? 'text-ink-2' : ''}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Drop zone */}
                            <div
                                role="button"
                                tabIndex={0}
                                aria-label="Wybierz plik CSV lub przeciągnij go tutaj"
                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={handleFileDrop}
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-12 text-center ${dragging ? 'border-brass-ink bg-brass-soft' : 'border-border-strong hover:bg-surface-2'}`}
                            >
                                <span className={`grid h-12 w-12 place-items-center rounded-full ${dragging ? 'bg-surface text-brass-ink' : 'bg-ink/[0.06] text-ink-2'}`}>
                                    <Upload size={22} aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="font-semibold text-ink">Przeciągnij plik CSV tutaj</p>
                                    <p className="mt-1 text-sm text-ink-2">lub kliknij, aby wybrać z dysku</p>
                                </div>
                                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileInput} />
                            </div>

                            {/* Date override */}
                            <div className="rounded-md border border-border bg-surface-2 p-5">
                                <label htmlFor="csv-import-date" className="text-[13px] font-semibold text-ink-2">Data projektów (opcjonalne)</label>
                                <div className="mt-1.5 flex items-center gap-3">
                                    <input
                                        id="csv-import-date"
                                        type="date"
                                        value={importDate}
                                        max={todayStr}
                                        onChange={e => setImportDate(e.target.value)}
                                        className="tnum h-10 rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-ink focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_rgba(26,25,23,0.08)]"
                                    />
                                    {importDate && (
                                        <Button variant="ghost" size="sm" onClick={() => setImportDate('')}>
                                            Wyczyść
                                        </Button>
                                    )}
                                </div>
                                <p className="mt-2 text-[13px] text-ink-2">
                                    {importDate
                                        ? `Wszystkie projekty zostaną zapisane z datą ${formatDate(importDate)}`
                                        : 'Zostaw puste, aby użyć daty dzisiejszej (może zaburzać statystyki miesięczne).'
                                    }
                                </p>
                            </div>

                            {fileError && <Banner tone="danger">{fileError}</Banner>}

                            {architectsLoading && (
                                <div className="flex items-center gap-2 text-sm text-ink-2">
                                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                    Wczytywanie listy architektów...
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Step 2: Preview ── */}
                    {step === 'preview' && (
                        <div className="flex flex-col">
                            {/* Summary bar */}
                            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-5 py-3 sm:px-6">
                                <StatusPill tone="success">{validCount} poprawnych</StatusPill>
                                {autoRegCount > 0 && <StatusPill tone="info">{autoRegCount} nowych kont</StatusPill>}
                                {invalidCount > 0 && <StatusPill tone="danger">{invalidCount} z błędem (pominięte)</StatusPill>}
                            </div>

                            <div className="space-y-3 px-5 pt-4 sm:px-6">
                                {fileError && <Banner tone="danger">{fileError}</Banner>}

                                {settledCount > 0 && (
                                    <Banner tone="warning" title={`Rozliczone = Tak (${settledCount} ${settledCount === 1 ? 'wiersz' : 'wierszy'})`}>
                                        Projekt trafi od razu do statusu Zakończony, a prowizja zostanie zapisana jako wypłacona poza portalem (nie trafi do wypłat). Cashback 2% NIE zostanie naliczony. Stawka prowizji wynika z obrotu architekta przed danym projektem.
                                    </Banner>
                                )}
                            </div>

                            {/* Table */}
                            <div className="mt-4 overflow-x-auto border-y border-border">
                                <table className="w-full min-w-[720px] text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-border bg-surface-2">
                                            <th className={TH}>#</th>
                                            <th className={TH}>Status</th>
                                            <th className={TH}>Architekt</th>
                                            <th className={TH}>Klient</th>
                                            <th className={TH}>Nr zamówienia</th>
                                            <th className={`${TH} text-right`}>Netto PLN</th>
                                            <th className={TH}>Płatne</th>
                                            <th className={TH}>Rozliczone</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedRows.map((row, i) => (
                                            <tr key={i} className={`border-b border-border last:border-b-0 ${row.isValid ? 'hover:bg-surface-2' : 'bg-danger-soft/50'}`}>
                                                <td className="tnum px-4 py-3 text-ink-2">{i + 1}</td>
                                                <td className="px-4 py-3">
                                                    {row.willAutoRegister ? (
                                                        <StatusPill tone="info">Nowe konto</StatusPill>
                                                    ) : row.isValid ? (
                                                        <StatusPill tone="success">OK</StatusPill>
                                                    ) : !row.architectFound ? (
                                                        <StatusPill tone="warning">Brak architekta</StatusPill>
                                                    ) : (
                                                        <StatusPill tone="danger">Błąd kwoty</StatusPill>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`font-medium ${row.architectFound ? 'text-ink' : row.willAutoRegister ? 'text-info' : 'text-danger'}`}>
                                                        {row.architectName || '—'}
                                                    </span>
                                                    {row.willAutoRegister && (
                                                        <p className="mt-0.5 text-xs text-ink-2">{row.architectEmail}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-ink-2">{row.clientLabel || '—'}</td>
                                                <td className="px-4 py-3 font-mono text-[13px] text-ink-2">{row.orderNumber || '—'}</td>
                                                <td className="tnum px-4 py-3 text-right">
                                                    <span className={`font-semibold ${row.validAmount ? 'text-ink' : 'text-danger'}`}>
                                                        {row.amountNet > 0 ? formatNumber(row.amountNet) : '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {row.isPaid
                                                        ? <span className="font-semibold text-success">Tak</span>
                                                        : <span className="text-ink-2">Nie</span>
                                                    }
                                                </td>
                                                <td className="px-4 py-3">
                                                    {row.prowizjaRozliczona
                                                        ? <span className="font-semibold text-brass-ink">Tak</span>
                                                        : <span className="text-ink-2">Nie</span>
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                                <p className="text-[13px] text-ink-2">
                                    {invalidCount > 0 && `${invalidCount} wierszy z błędami zostanie pominiętych.`}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" onClick={() => { setStep('upload'); setParsedRows([]); }}>
                                        Wróć
                                    </Button>
                                    <Button
                                        onClick={handleImport}
                                        loading={importing}
                                        disabled={validCount === 0}
                                        icon={<Upload size={16} />}
                                    >
                                        Importuj {validCount} {validCount === 1 ? 'projekt' : validCount < 5 ? 'projekty' : 'projektów'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: Results ── */}
                    {step === 'results' && results && (
                        <div className="space-y-5 p-5 sm:p-6">
                            {/* Summary */}
                            <div className={`grid grid-cols-2 gap-3 ${results.newAccountsCreated > 0 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                                {resultsSummary.map(({ label, value }) => (
                                    <KpiTile key={label} label={label} value={formatNumber(value)} />
                                ))}
                            </div>

                            {/* Detail list */}
                            {results.results.length > 0 && (
                                <div className="overflow-x-auto rounded-md border border-border">
                                    <table className="w-full min-w-[560px] text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-border bg-surface-2">
                                                <th className={TH}>#</th>
                                                <th className={TH}>Status</th>
                                                <th className={TH}>Architekt</th>
                                                <th className={TH}>Nr zamówienia</th>
                                                <th className={TH}>Uwagi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {results.results.map((r, i) => (
                                                <tr key={i} className="border-b border-border last:border-b-0 hover:bg-surface-2">
                                                    <td className="tnum px-4 py-3 text-ink-2">{r.rowIndex + 1}</td>
                                                    <td className="px-4 py-3">
                                                        {r.status === 'success' && <StatusPill tone="success">Sukces</StatusPill>}
                                                        {r.status === 'skipped' && <StatusPill tone="warning">Pominięto</StatusPill>}
                                                        {r.status === 'error' && <StatusPill tone="danger">Błąd</StatusPill>}
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-ink">{r.architectName || '—'}</td>
                                                    <td className="px-4 py-3 font-mono text-[13px] text-ink-2">{r.orderNumber || '—'}</td>
                                                    <td className="px-4 py-3 text-ink-2">
                                                        {r.status === 'success' && r.projectId ? (
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <a href={`/dashboard/admin/architects/${r.architectId}`} target="_blank" rel="noreferrer"
                                                                    className="flex items-center gap-1 font-semibold text-brass-ink hover:underline">
                                                                    <FileText size={13} aria-hidden="true" /> Profil architekta →
                                                                </a>
                                                                {r.newAccountCreated && <StatusPill tone="info">Nowe konto</StatusPill>}
                                                            </div>
                                                        ) : r.message}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button onClick={handleClose}>Zamknij</Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
