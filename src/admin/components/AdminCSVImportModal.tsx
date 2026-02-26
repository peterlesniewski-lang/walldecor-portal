'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertTriangle, XCircle, Loader2, FileText, ArrowLeft } from 'lucide-react';
import { getAllArchitectNames } from '@/app/actions/architects';
import { importProjectsFromCSV, ImportRowInput, ImportRowResult } from '@/app/actions/import';

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
    const [step, setStep] = useState<Step>('upload');
    const [architects, setArchitects] = useState<Set<string>>(new Set());
    const [architectsLoading, setArchitectsLoading] = useState(true);
    const [dragging, setDragging] = useState(false);
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [fileName, setFileName] = useState('');
    const [importing, setImporting] = useState(false);
    const [results, setResults] = useState<{ successCount: number; skippedCount: number; errorCount: number; newAccountsCreated: number; results: ImportRowResult[] } | null>(null);
    const [importDate, setImportDate] = useState('');
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

    if (!isOpen) return null;

    const reset = () => {
        setStep('upload');
        setParsedRows([]);
        setFileName('');
        setResults(null);
        setDragging(false);
        setImportDate('');
    };

    const handleClose = () => {
        const didImport = results !== null && results.successCount > 0;
        reset();
        onClose(didImport);
    };

    const processFile = (file: File) => {
        if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
            alert('Wybierz plik CSV.');
            return;
        }
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const rawRows = parseCSV(text);
            if (rawRows.length === 0) { alert('Plik CSV jest pusty.'); return; }

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

            if (rows.length === 0) { alert('Brak danych do zaimportowania.'); return; }
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
        setImporting(true);
        try {
            const result = await importProjectsFromCSV(validRows, importDate || null);
            setResults(result);
            setStep('results');
        } catch (err: any) {
            alert(err.message || 'Błąd podczas importu.');
        } finally {
            setImporting(false);
        }
    };

    const validCount = parsedRows.filter(r => r.isValid).length;
    const autoRegCount = parsedRows.filter(r => r.willAutoRegister && r.isValid).length;
    const invalidCount = parsedRows.length - validCount;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={handleClose} />

            <div className="relative bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] flex flex-col">

                {/* Header */}
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-4">
                        {step === 'preview' && (
                            <button onClick={() => { setStep('upload'); setParsedRows([]); }} className="p-2 rounded-xl hover:bg-black/5 text-stone-400 hover:text-stone-700 transition-all">
                                <ArrowLeft size={16} />
                            </button>
                        )}
                        <div>
                            <h3 className="text-xl font-bold text-stone-900">Import z CSV</h3>
                            <p className="text-sm text-stone-500 mt-0.5">
                                {step === 'upload' && 'Wgraj eksport z Google Sheets'}
                                {step === 'preview' && `Podgląd — ${parsedRows.length} wierszy · ${importDate || 'data dzisiejsza'}`}
                                {step === 'results' && 'Wyniki importu'}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-white rounded-xl transition-all text-stone-400 hover:text-stone-600 border border-transparent hover:border-slate-100">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">

                    {/* ── Step 1: Upload ── */}
                    {step === 'upload' && (
                        <div className="p-8 space-y-6">
                            {/* Column mapping reference */}
                            <div className="bg-black/[0.02] rounded-2xl p-5 border border-black/5">
                                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-3">Oczekiwany format kolumn (Google Sheets)</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-bold text-stone-600">
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
                                        ['K', 'Prowizja rozliczona (Tak/Nie)'],
                                        ['L', 'Nr dokumentu (arch.)'],
                                        ['M', 'Nazwa studia (opcjonalne)'],
                                        ['N', 'NIP (opcjonalne)'],
                                        ['O', 'Adres (opcjonalne)'],
                                    ].map(([col, label]) => (
                                        <div key={col} className="flex items-center gap-1.5">
                                            <span className="w-5 h-5 rounded bg-black/10 flex items-center justify-center text-[9px] font-black text-stone-700 shrink-0">{col}</span>
                                            <span className={label.includes('pomijane') ? 'text-stone-400' : ''}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Drop zone */}
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={handleFileDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${dragging ? 'border-brand-primary bg-brand-primary/5' : 'border-black/10 hover:border-black/20 hover:bg-black/[0.01]'}`}
                            >
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${dragging ? 'bg-brand-primary/10' : 'bg-black/5'}`}>
                                    <Upload size={28} className={dragging ? 'text-brand-primary' : 'text-stone-400'} />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-black text-stone-900">Przeciągnij plik CSV tutaj</p>
                                    <p className="text-[10px] text-stone-400 font-bold mt-1">lub kliknij aby wybrać z dysku</p>
                                </div>
                                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileInput} />
                            </div>

                            {/* Date override */}
                            <div className="bg-black/[0.02] rounded-2xl p-5 border border-black/5">
                                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-3">Data projektów (opcjonalne)</p>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="date"
                                        value={importDate}
                                        max={todayStr}
                                        onChange={e => setImportDate(e.target.value)}
                                        className="bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm font-bold text-stone-900 focus:outline-none focus:border-brand-primary/50 transition-colors"
                                    />
                                    {importDate && (
                                        <button
                                            onClick={() => setImportDate('')}
                                            className="text-[10px] font-black text-stone-400 hover:text-stone-700 uppercase tracking-widest transition-colors"
                                        >
                                            Wyczyść
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-stone-400 font-bold mt-2">
                                    {importDate
                                        ? `Wszystkie projekty zostaną zapisane z datą ${importDate}`
                                        : 'Zostaw puste — użyje daty dzisiejszej (może zaburzać statystyki miesięczne)'
                                    }
                                </p>
                            </div>

                            {architectsLoading && (
                                <div className="flex items-center gap-2 text-stone-400 text-xs font-bold">
                                    <Loader2 size={13} className="animate-spin" />
                                    Wczytywanie listy architektów...
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Step 2: Preview ── */}
                    {step === 'preview' && (
                        <div className="flex flex-col">
                            {/* Summary bar */}
                            <div className="px-8 py-4 border-b border-black/5 flex items-center gap-6 bg-black/[0.01]">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                    <span className="text-xs font-black text-stone-700">{validCount} poprawnych</span>
                                </div>
                                {autoRegCount > 0 && (
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={14} className="text-blue-500" />
                                        <span className="text-xs font-black text-stone-700">{autoRegCount} nowych kont</span>
                                    </div>
                                )}
                                {invalidCount > 0 && (
                                    <div className="flex items-center gap-2">
                                        <XCircle size={14} className="text-red-500" />
                                        <span className="text-xs font-black text-stone-700">{invalidCount} z błędem (pominięte)</span>
                                    </div>
                                )}
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-black/[0.02] border-b border-black/5">
                                            <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">#</th>
                                            <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Status</th>
                                            <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Architekt</th>
                                            <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Klient</th>
                                            <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Nr zamówienia</th>
                                            <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Netto PLN</th>
                                            <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Płatne</th>
                                            <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Rozliczone</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/5">
                                        {parsedRows.map((row, i) => (
                                            <tr key={i} className={`transition-colors ${row.isValid ? 'hover:bg-black/[0.01]' : 'bg-red-50/50'}`}>
                                                <td className="px-5 py-3 text-[10px] font-bold text-stone-400">{i + 1}</td>
                                                <td className="px-5 py-3">
                                                    {row.willAutoRegister ? (
                                                        <span className="flex items-center gap-1 text-[9px] font-black text-blue-600 uppercase tracking-widest whitespace-nowrap">
                                                            <CheckCircle2 size={11} /> Nowe konto
                                                        </span>
                                                    ) : row.isValid ? (
                                                        <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                                                            <CheckCircle2 size={11} /> OK
                                                        </span>
                                                    ) : !row.architectFound ? (
                                                        <span className="flex items-center gap-1 text-[9px] font-black text-amber-600 uppercase tracking-widest whitespace-nowrap">
                                                            <AlertTriangle size={11} /> Brak architekta
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[9px] font-black text-red-600 uppercase tracking-widest whitespace-nowrap">
                                                            <XCircle size={11} /> Błąd kwoty
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`text-xs font-bold ${row.architectFound ? 'text-stone-900' : row.willAutoRegister ? 'text-blue-700' : 'text-red-600'}`}>
                                                        {row.architectName || '—'}
                                                    </span>
                                                    {row.willAutoRegister && (
                                                        <p className="text-[9px] font-bold text-blue-400 mt-0.5">{row.architectEmail}</p>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-xs font-bold text-stone-600">{row.clientLabel || '—'}</td>
                                                <td className="px-5 py-3 text-xs font-mono text-stone-600">{row.orderNumber || '—'}</td>
                                                <td className="px-5 py-3 text-right">
                                                    <span className={`text-xs font-black ${row.validAmount ? 'text-stone-900' : 'text-red-600'}`}>
                                                        {row.amountNet > 0 ? row.amountNet.toLocaleString('pl-PL', { minimumFractionDigits: 2 }) : '—'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    {row.isPaid
                                                        ? <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Tak</span>
                                                        : <span className="text-[9px] font-bold text-stone-400">Nie</span>
                                                    }
                                                </td>
                                                <td className="px-5 py-3">
                                                    {row.prowizjaRozliczona
                                                        ? <span className="text-[9px] font-black text-brand-primary uppercase tracking-widest">Tak</span>
                                                        : <span className="text-[9px] font-bold text-stone-400">Nie</span>
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="px-8 py-6 border-t border-black/5 flex items-center justify-between gap-4 bg-white shrink-0">
                                <p className="text-[10px] text-stone-400 font-bold">
                                    {invalidCount > 0 && `${invalidCount} wierszy z błędami zostanie pominiętych.`}
                                </p>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => { setStep('upload'); setParsedRows([]); }}
                                        className="px-5 py-2.5 bg-black/5 hover:bg-black/10 text-stone-500 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                                    >
                                        Wróć
                                    </button>
                                    <button
                                        onClick={handleImport}
                                        disabled={importing || validCount === 0}
                                        className="px-6 py-2.5 bg-stone-900 hover:bg-black text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50"
                                    >
                                        {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                        Importuj {validCount} {validCount === 1 ? 'projekt' : validCount < 5 ? 'projekty' : 'projektów'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: Results ── */}
                    {step === 'results' && results && (
                        <div className="p-8 space-y-6">
                            {/* Summary */}
                            <div className={`grid gap-4 ${results.newAccountsCreated > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center">
                                    <p className="text-3xl font-black text-emerald-600">{results.successCount}</p>
                                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-1">Zaimportowanych</p>
                                </div>
                                {results.newAccountsCreated > 0 && (
                                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center">
                                        <p className="text-3xl font-black text-blue-600">{results.newAccountsCreated}</p>
                                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-1">Nowych kont</p>
                                    </div>
                                )}
                                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-center">
                                    <p className="text-3xl font-black text-amber-600">{results.skippedCount}</p>
                                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-1">Pominiętych</p>
                                </div>
                                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                                    <p className="text-3xl font-black text-red-600">{results.errorCount}</p>
                                    <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mt-1">Błędów</p>
                                </div>
                            </div>

                            {/* Detail list */}
                            {results.results.length > 0 && (
                                <div className="border border-black/5 rounded-2xl overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-black/[0.02] border-b border-black/5">
                                                <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">#</th>
                                                <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Status</th>
                                                <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Architekt</th>
                                                <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Nr zamówienia</th>
                                                <th className="px-5 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest">Uwagi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/5">
                                            {results.results.map((r, i) => (
                                                <tr key={i} className="hover:bg-black/[0.01] transition-colors">
                                                    <td className="px-5 py-3 text-[10px] font-bold text-stone-400">{r.rowIndex + 1}</td>
                                                    <td className="px-5 py-3">
                                                        {r.status === 'success' && (
                                                            <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                                                                <CheckCircle2 size={11} /> Sukces
                                                            </span>
                                                        )}
                                                        {r.status === 'skipped' && (
                                                            <span className="flex items-center gap-1 text-[9px] font-black text-amber-600 uppercase tracking-widest">
                                                                <AlertTriangle size={11} /> Pominięto
                                                            </span>
                                                        )}
                                                        {r.status === 'error' && (
                                                            <span className="flex items-center gap-1 text-[9px] font-black text-red-600 uppercase tracking-widest">
                                                                <XCircle size={11} /> Błąd
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 text-xs font-bold text-stone-700">{r.architectName || '—'}</td>
                                                    <td className="px-5 py-3 text-xs font-mono text-stone-500">{r.orderNumber || '—'}</td>
                                                    <td className="px-5 py-3 text-xs text-stone-400 font-bold">
                                                        {r.status === 'success' && r.projectId ? (
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <a href={`/dashboard/admin/architects/${r.architectId}`} target="_blank" rel="noreferrer"
                                                                    className="flex items-center gap-1 text-brand-primary hover:underline">
                                                                    <FileText size={11} /> Profil architekta →
                                                                </a>
                                                                {r.newAccountCreated && (
                                                                    <span className="text-[9px] font-black text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 uppercase tracking-widest whitespace-nowrap">
                                                                        Nowe konto
                                                                    </span>
                                                                )}
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
                                <button
                                    onClick={handleClose}
                                    className="px-8 py-3 bg-stone-900 hover:bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                                >
                                    Zamknij
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
