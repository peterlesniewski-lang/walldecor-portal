'use client';

import { summarizeItemCommission } from "@/lib/itemCommission";
import React, { useState } from 'react';
import Link from 'next/link';
import { Search, FileText, ChevronRight, FolderOpen } from 'lucide-react';
import { NewProjectButton } from './ProjectSubmissionModal';
import {
    Button,
    Card,
    CardBody,
    EmptyState,
    KpiTile,
    StatusPill,
    cx,
    formatDate,
    formatNumber,
    formatPLN,
    formatSignedPLN,
} from '@/components/ui';

interface ProjectListClientProps {
    initialProjects: any[];
    userId: string;
    userRole?: string;
}

// Filtr statusu: kod z bazy -> polska etykieta segmentu
const FILTERS: { value: string; label: string }[] = [
    { value: 'WSZYSTKIE', label: 'Wszystkie' },
    { value: 'ZGŁOSZONY', label: 'Zgłoszone' },
    { value: 'PRZYJĘTY', label: 'Przyjęte' },
    { value: 'W_REALIZACJI', label: 'W realizacji' },
    { value: 'ZAKOŃCZONY', label: 'Zakończone' },
    { value: 'NIEZREALIZOWANY', label: 'Niezrealizowane' },
];

const COLUMNS = 'md:grid-cols-[minmax(0,2.2fr)_150px_130px_150px_28px]';

/** Suma prowizji projektu (wszystkie statusy) i status pozycji do podpisu pod kwotą. */
function commissionSummary(project: any): { total: number; status: string | null } {
    const commissions: any[] = project.commissions ?? [];
    const total = commissions.reduce((acc, c) => acc + (Number(c.amount_net) || 0), 0);
    if (commissions.length === 0) return { total: Number(project.commission_amount) || 0, status: null };
    const statuses = new Set(commissions.map((c) => c.status));
    const status = statuses.size === 1 ? [...statuses][0] : statuses.has('PENDING') ? 'PENDING' : 'EARNED';
    return { total, status };
}

const COMMISSION_NOTE: Record<string, string> = {
    PENDING: 'planowana',
    EARNED: 'zarobiona',
    IN_PAYMENT: 'w wypłacie',
    PAID: 'wypłacona',
};

export default function ProjectListClient({ initialProjects, userId, userRole }: ProjectListClientProps) {
    const isAdmin = userRole === 'ADMIN' || userRole === 'STAFF';
    const [activeFilter, setActiveFilter] = useState('WSZYSTKIE');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const filteredProjects = initialProjects.filter(p => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = String(p.name ?? '').toLowerCase().includes(term) ||
            String(p.client_label ?? '').toLowerCase().includes(term);
        const matchesFilter = activeFilter === 'WSZYSTKIE' || p.status === activeFilter;
        return matchesSearch && matchesFilter;
    });

    const totalCommission = initialProjects.reduce((acc, p) => acc + commissionSummary(p).total, 0);
    const activeCount = initialProjects.filter(p => p.status !== 'ZAKOŃCZONY' && p.status !== 'NIEZREALIZOWANY').length;
    const hasProjects = initialProjects.length > 0;

    return (
        <div className="space-y-6 pb-16">
            {hasProjects && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <KpiTile label="Suma prowizji" value={formatNumber(totalCommission)} unit="PLN" description="Ze wszystkich projektów, także planowana" />
                    <KpiTile label="Aktywne projekty" value={String(activeCount)} description="Zgłoszone, przyjęte i w realizacji" />
                </div>
            )}

            {!hasProjects ? (
                <EmptyState
                    icon={<FolderOpen size={22} aria-hidden="true" />}
                    title="Nie masz jeszcze projektów"
                    description="Zgłoś pierwszy projekt, a jego status i prowizja pojawią się tutaj."
                    action={<NewProjectButton userRole={userRole} variant="secondary" />}
                />
            ) : (
                <>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div role="group" aria-label="Filtr statusu" className="-mx-1 flex max-w-full overflow-x-auto px-1 pb-1 lg:pb-0">
                            <div className="inline-flex rounded-sm bg-ink/[0.06] p-[3px]">
                                {FILTERS.map(f => (
                                    <button
                                        key={f.value}
                                        type="button"
                                        onClick={() => setActiveFilter(f.value)}
                                        aria-pressed={activeFilter === f.value}
                                        className={cx(
                                            'whitespace-nowrap rounded-[6px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                                            activeFilter === f.value ? 'bg-surface text-ink shadow-hairline' : 'text-ink-2 hover:text-ink',
                                        )}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="relative w-full lg:w-80">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={16} aria-hidden="true" />
                            <input
                                type="search"
                                aria-label="Szukaj projektu lub klienta"
                                placeholder="Szukaj projektu lub klienta"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-10 w-full rounded-sm border border-border-strong bg-surface pl-9 pr-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
                            />
                        </div>
                    </div>

                    {filteredProjects.length > 0 ? (
                        <Card as="section" aria-label="Lista projektów">
                            <CardBody flush>
                                <div className={cx('hidden gap-4 border-b border-border bg-surface-2 px-5 py-3 md:grid', COLUMNS)}>
                                    <span className="label-caps">Projekt</span>
                                    <span className="label-caps">Status</span>
                                    <span className="label-caps text-right">Wartość</span>
                                    <span className="label-caps text-right">Prowizja</span>
                                    <span />
                                </div>
                                <ul className="divide-y divide-border">
                                    {filteredProjects.map((project: any) => {
                                        const summary = commissionSummary(project);
                                        const open = expandedId === project.id;
                                        return (
                                            <li key={project.id}>
                                                <div className={cx('grid grid-cols-1 items-center gap-x-4 gap-y-2 px-5 py-4', COLUMNS)}>
                                                    <div className="min-w-0">
                                                        <Link
                                                            href={`/dashboard/projects/${project.id}`}
                                                            className="block truncate text-[15px] font-semibold text-ink hover:text-brass-ink"
                                                        >
                                                            {project.name}
                                                        </Link>
                                                        <p className="truncate text-[13px] text-ink-2">
                                                            Klient: {project.client_label}
                                                            <span className="tnum text-ink-3"> · {formatDate(project.created_at)}</span>
                                                        </p>
                                                        {isAdmin && project.architect_name && (
                                                            <p className="text-xs text-brass-ink">Architekt: {project.architect_name}</p>
                                                        )}
                                                    </div>
                                                    <div><StatusPill kind="project" status={project.status} /></div>
                                                    <div className="tnum flex items-baseline justify-between gap-2 md:block md:text-right">
                                                        <span className="text-xs text-ink-3 md:hidden">Wartość</span>
                                                        <span className="text-sm font-semibold text-ink">{formatPLN(project.total_value)}</span>
                                                    </div>
                                                    <div className="tnum flex items-baseline justify-between gap-2 md:block md:text-right">
                                                        <span className="text-xs text-ink-3 md:hidden">Prowizja</span>
                                                        <span>
                                                            <span className="block text-sm font-semibold text-ink">{summary.total > 0 ? formatPLN(summary.total) : '—'}</span>
                                                            {summary.status && summary.total > 0 && (
                                                                <span className="block text-xs text-ink-2">{COMMISSION_NOTE[summary.status] ?? ''}</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2 md:justify-end">
                                                        {project.invoice_url ? (
                                                            <a
                                                                href={project.invoice_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brass-ink hover:text-ink md:hidden"
                                                            >
                                                                <FileText size={14} aria-hidden="true" /> Faktura
                                                            </a>
                                                        ) : <span className="md:hidden" />}
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedId(open ? null : project.id)}
                                                            aria-expanded={open}
                                                            aria-label={open ? `Zwiń szczegóły projektu ${project.name}` : `Pokaż szczegóły projektu ${project.name}`}
                                                            className="grid h-7 w-7 place-items-center rounded-sm text-ink-2 hover:bg-ink/5 hover:text-ink"
                                                        >
                                                            <ChevronRight size={16} className={cx('transition-transform', open && 'rotate-90')} aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {open && (
                                                    <div className="grid grid-cols-1 gap-6 border-t border-border bg-surface-2 px-5 py-5 md:grid-cols-2">
                                                        <div>
                                                            <p className="label-caps mb-3">Pozycje projektu</p>
                                                            <ul className="space-y-2">
                                                                {project.items?.map((item: any) => {
                                                                    const comm = summarizeItemCommission(project.commissions ?? [], item.id);
                                                                    return (
                                                                        <li key={item.id} className="flex items-start justify-between gap-3 rounded-sm border border-border bg-surface px-3 py-2.5">
                                                                            <div className="min-w-0">
                                                                                <p className="text-sm font-semibold text-ink">{item.category}</p>
                                                                                {item.description && <p className="text-xs text-ink-2">{item.description}</p>}
                                                                            </div>
                                                                            <div className="tnum shrink-0 text-right">
                                                                                <p className="text-sm text-ink">{formatPLN(item.amount_net)}</p>
                                                                                {comm ? (
                                                                                    <p className={`text-xs font-semibold ${comm.amount < 0 ? 'text-ink-2' : 'text-success'}`}>{formatSignedPLN(comm.amount)} prowizji</p>
                                                                                ) : (
                                                                                    <p className="text-xs text-ink-2" title="Ta pozycja nie podlega naliczeniu prowizji">bez prowizji</p>
                                                                                )}
                                                                            </div>
                                                                        </li>
                                                                    );
                                                                })}
                                                                {(!project.items || project.items.length === 0) && (
                                                                    <li className="text-sm text-ink-2">Brak wyszczególnionych pozycji.</li>
                                                                )}
                                                            </ul>
                                                        </div>

                                                        <div>
                                                            <p className="label-caps mb-3">Twoja prowizja</p>
                                                            <ul className="space-y-2">
                                                                {project.commissions?.map((comm: any) => (
                                                                    <li key={comm.id} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface px-3 py-2.5">
                                                                        <StatusPill kind="commission" status={comm.status} />
                                                                        <span className="tnum text-sm font-semibold text-ink">{formatPLN(comm.amount_net)}</span>
                                                                    </li>
                                                                ))}
                                                                {(!project.commissions || project.commissions.length === 0) && (
                                                                    <li className="text-sm text-ink-2">Prowizja zostanie naliczona po akceptacji projektu.</li>
                                                                )}
                                                            </ul>
                                                            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                                                                <span className="text-sm text-ink-2">Suma prowizji</span>
                                                                <span className="tnum text-sm font-semibold text-ink">{formatPLN(summary.total)}</span>
                                                            </div>
                                                            <div className="mt-4 flex flex-wrap gap-2">
                                                                <Button href={`/dashboard/projects/${project.id}`} variant="secondary" size="sm">Otwórz projekt</Button>
                                                                {project.invoice_url && (
                                                                    <Button href={project.invoice_url} target="_blank" rel="noopener noreferrer" variant="ghost" size="sm" icon={<FileText size={14} aria-hidden="true" />}>
                                                                        Pobierz fakturę
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </CardBody>
                        </Card>
                    ) : (
                        <EmptyState
                            icon={<Search size={22} aria-hidden="true" />}
                            title="Brak wyników"
                            description="Żaden projekt nie spełnia wybranych kryteriów. Zmień filtr lub frazę wyszukiwania."
                            action={
                                <Button variant="secondary" onClick={() => { setActiveFilter('WSZYSTKIE'); setSearchTerm(''); }}>
                                    Wyczyść filtry
                                </Button>
                            }
                        />
                    )}
                </>
            )}
        </div>
    );
}
