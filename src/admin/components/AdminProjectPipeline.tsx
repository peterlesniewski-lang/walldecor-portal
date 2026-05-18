'use client';

import React, { useMemo, useState } from 'react';
import { updateProjectStatus, assignProjectCaretaker } from '@/app/actions/projects';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    Clock,
    ExternalLink,
    Loader2,
    MoreHorizontal,
    Play,
    Search,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatPLN } from '@/lib/utils';

type ProjectStatus = 'ZGŁOSZONY' | 'PRZYJĘTY' | 'W_REALIZACJI' | 'ZAKOŃCZONY' | 'NIEZREALIZOWANY';

interface Project {
    id: string;
    name: string;
    client_label?: string | null;
    status: ProjectStatus | string;
    architect_name: string;
    staff_id?: string | null;
    staff_name?: string | null;
    product_value: number | string | null;
    estimated_commission?: number | string | null;
    earned_commission?: number | string | null;
    payout_status?: string | null;
    created_at: string;
    updated_at?: string | null;
    completed_at?: string | null;
    completed_by_name?: string | null;
    completion_note?: string | null;
}

interface StaffMember {
    id: string;
    name: string;
}

const RECENT_INACTIVE_DAYS = 90;
const MAX_VISIBLE_PER_COLUMN = 4;

const STATUS_ORDER: ProjectStatus[] = ['ZGŁOSZONY', 'PRZYJĘTY', 'W_REALIZACJI', 'ZAKOŃCZONY', 'NIEZREALIZOWANY'];

const STATUS_META: Record<ProjectStatus, { label: string; tint: string; border: string; dot: string; description: string }> = {
    ZGŁOSZONY: {
        label: 'ZGŁOSZONY',
        tint: 'bg-sky-50/70',
        border: 'border-sky-100',
        dot: 'bg-sky-500',
        description: 'Czeka na akceptację',
    },
    PRZYJĘTY: {
        label: 'PRZYJĘTY',
        tint: 'bg-stone-50',
        border: 'border-stone-200',
        dot: 'bg-stone-500',
        description: 'Zaakceptowany, przed startem',
    },
    W_REALIZACJI: {
        label: 'W_REALIZACJI',
        tint: 'bg-amber-50/70',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
        description: 'Aktywnie prowadzony',
    },
    ZAKOŃCZONY: {
        label: 'ZAKOŃCZONY',
        tint: 'bg-emerald-50/70',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
        description: 'Zweryfikowany i rozliczany',
    },
    NIEZREALIZOWANY: {
        label: 'NIEZREALIZOWANY',
        tint: 'bg-red-50/70',
        border: 'border-red-100',
        dot: 'bg-red-500',
        description: 'Anulowany lub odrzucony',
    },
};

const PRIMARY_ACTION: Partial<Record<ProjectStatus, { label: string; next: ProjectStatus; icon: React.ReactNode }>> = {
    ZGŁOSZONY: { label: 'Przyjmij', next: 'PRZYJĘTY', icon: <CheckCircle2 size={12} /> },
    PRZYJĘTY: { label: 'Start', next: 'W_REALIZACJI', icon: <Play size={12} /> },
    W_REALIZACJI: { label: 'Zakończ', next: 'ZAKOŃCZONY', icon: <CheckCircle2 size={12} /> },
};

const SECONDARY_ACTIONS: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
    ZGŁOSZONY: ['NIEZREALIZOWANY'],
    PRZYJĘTY: ['NIEZREALIZOWANY'],
    W_REALIZACJI: ['NIEZREALIZOWANY'],
};

function statusDate(project: Project): Date {
    return new Date(project.completed_at || project.updated_at || project.created_at);
}

function isVisibleInOperationalWindow(project: Project, now: Date): boolean {
    if (project.status !== 'ZAKOŃCZONY' && project.status !== 'NIEZREALIZOWANY') return true;
    const date = statusDate(project);
    if (Number.isNaN(date.getTime())) return true;
    const ageMs = now.getTime() - date.getTime();
    return ageMs <= RECENT_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
}

function dateLabel(project: Project): string {
    const date = statusDate(project);
    if (Number.isNaN(date.getTime())) return 'Brak daty';
    return date.toLocaleDateString('pl-PL');
}

function ProjectCard({
    project,
    canManageProjects,
    onOpen,
    onRequestStatus,
    onCancelConfirm,
    openMenuId,
    setOpenMenuId,
    confirming,
    loading,
}: {
    project: Project;
    canManageProjects: boolean;
    onOpen: (project: Project) => void;
    onRequestStatus: (project: Project, status: ProjectStatus) => void;
    onCancelConfirm: () => void;
    openMenuId: string | null;
    setOpenMenuId: (id: string | null) => void;
    confirming: { projectId: string; status: ProjectStatus } | null;
    loading: boolean;
}) {
    const primary = PRIMARY_ACTION[project.status as ProjectStatus];
    const secondary = SECONDARY_ACTIONS[project.status as ProjectStatus] || [];
    const isConfirming = confirming?.projectId === project.id;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(project)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onOpen(project);
            }}
            className="group relative rounded-lg border border-black/10 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-black text-stone-900">{project.name}</p>
                    <p className="mt-1 text-[10px] font-bold text-stone-500">{project.id}</p>
                </div>
                {canManageProjects && secondary.length > 0 && (
                    <div className="relative">
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                setOpenMenuId(openMenuId === project.id ? null : project.id);
                            }}
                            className="rounded-md p-1.5 text-stone-400 hover:bg-black/5 hover:text-stone-700"
                            aria-label="Dodatkowe akcje projektu"
                        >
                            <MoreHorizontal size={15} />
                        </button>
                        {openMenuId === project.id && (
                            <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-black/10 bg-white p-1 shadow-lg">
                                {secondary.map((status) => (
                                    <button
                                        key={status}
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setOpenMenuId(null);
                                            onRequestStatus(project, status);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50"
                                    >
                                        <AlertTriangle size={12} />
                                        Odrzuć
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-4 space-y-2 text-xs text-stone-600">
                <p className="truncate font-semibold">Architekt: {project.architect_name}</p>
                <p className="truncate">Klient: {project.client_label || 'Brak danych'}</p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">Wartość</p>
                        <p className="font-black text-stone-900">{formatPLN(project.product_value)} PLN</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">Prowizja</p>
                        <p className="font-black text-emerald-700">
                            {formatPLN(project.earned_commission ?? project.estimated_commission)} PLN
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/5 pt-3">
                <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">Opiekun</p>
                    <p className={`truncate text-xs font-bold ${project.staff_name ? 'text-stone-700' : 'text-orange-600'}`}>
                        {project.staff_name || 'Brak opiekuna'}
                    </p>
                </div>
                <p className="shrink-0 text-[10px] font-bold text-stone-400">{dateLabel(project)}</p>
            </div>

            {canManageProjects && primary && (
                <div className="mt-3">
                    {isConfirming ? (
                        <div className="rounded-lg border border-red-100 bg-red-50 p-2" onClick={(event) => event.stopPropagation()}>
                            <p className="text-[10px] font-bold text-red-700">Potwierdzić zmianę statusu?</p>
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={onCancelConfirm}
                                    className="rounded-md border border-black/10 bg-white px-2 py-1 text-[9px] font-black uppercase text-stone-600"
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => onRequestStatus(project, confirming.status)}
                                    className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[9px] font-black uppercase text-white disabled:opacity-50"
                                >
                                    {loading && <Loader2 size={10} className="animate-spin" />}
                                    Tak
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onRequestStatus(project, primary.next);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-brand-primary hover:bg-brand-primary/20"
                        >
                            {primary.icon}
                            {primary.label}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function ProjectDrawer({
    project,
    canManageProjects,
    staffMembers,
    loading,
    onClose,
    onStatusChange,
    onAssignStaff,
}: {
    project: Project;
    canManageProjects: boolean;
    staffMembers: StaffMember[];
    loading: boolean;
    onClose: () => void;
    onStatusChange: (project: Project, status: ProjectStatus, note?: string) => void;
    onAssignStaff: (project: Project, staffId: string) => void;
}) {
    const [completionNote, setCompletionNote] = useState('');
    const primary = PRIMARY_ACTION[project.status as ProjectStatus];

    return (
        <div className="fixed inset-0 z-[80]">
            <button
                type="button"
                className="absolute inset-0 bg-black/30"
                onClick={onClose}
                aria-label="Zamknij podgląd projektu"
            />
            <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-black/10 bg-[#fbfaf8] shadow-2xl">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-[#fbfaf8]/95 px-6 py-5 backdrop-blur">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">Podgląd projektu</p>
                        <h2 className="mt-1 text-xl font-black text-stone-950">{project.name}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-black/10 bg-white p-2 text-stone-500 hover:text-stone-900"
                        aria-label="Zamknij"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-5 p-6">
                    <div className="rounded-lg border border-black/10 bg-white p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Status</p>
                                <p className="mt-1 text-sm font-black text-stone-900">{STATUS_META[project.status as ProjectStatus]?.label || project.status}</p>
                            </div>
                            <Link
                                href={`/dashboard/admin/projects/${project.id}`}
                                className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-700 hover:border-brand-primary/40 hover:text-brand-primary"
                            >
                                Otwórz pełny projekt
                                <ExternalLink size={13} />
                            </Link>
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">ID</p>
                                <p className="mt-1 font-bold text-stone-800">{project.id}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Klient</p>
                                <p className="mt-1 font-bold text-stone-800">{project.client_label || 'Brak danych'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Architekt</p>
                                <p className="mt-1 font-bold text-stone-800">{project.architect_name}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Data statusu</p>
                                <p className="mt-1 font-bold text-stone-800">{dateLabel(project)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-black/10 bg-white p-5">
                        <h3 className="text-sm font-black text-stone-900">Kwoty do weryfikacji</h3>
                        <div className="mt-4 grid grid-cols-3 gap-3">
                            <div className="rounded-lg bg-stone-50 p-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">Produkty</p>
                                <p className="mt-1 text-lg font-black text-stone-950">{formatPLN(project.product_value)} PLN</p>
                            </div>
                            <div className="rounded-lg bg-emerald-50 p-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Prowizja</p>
                                <p className="mt-1 text-lg font-black text-emerald-800">{formatPLN(project.earned_commission ?? project.estimated_commission)} PLN</p>
                            </div>
                            <div className="rounded-lg bg-sky-50 p-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-sky-700">Wypłata</p>
                                <p className="mt-1 text-sm font-black text-sky-800">{project.payout_status || 'Po fakturze'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-black/10 bg-white p-5">
                        <h3 className="text-sm font-black text-stone-900">Opiekun i audyt</h3>
                        <div className="mt-4 space-y-4">
                            {canManageProjects ? (
                                <label className="block">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Opiekun</span>
                                    <div className="relative mt-2">
                                        <select
                                            value={project.staff_id || 'NONE'}
                                            onChange={(event) => onAssignStaff(project, event.target.value)}
                                            disabled={loading}
                                            className="w-full appearance-none rounded-lg border border-black/10 bg-stone-50 px-3 py-2 text-sm font-bold text-stone-800 focus:border-brand-primary/50 focus:outline-none"
                                        >
                                            <option value="NONE">Brak opiekuna</option>
                                            {staffMembers.map((staff) => (
                                                <option key={staff.id} value={staff.id}>{staff.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-500" />
                                    </div>
                                </label>
                            ) : (
                                <p className="text-sm font-bold text-stone-700">{project.staff_name || 'Brak opiekuna'}</p>
                            )}
                            <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
                                {project.status === 'ZAKOŃCZONY' ? (
                                    <p>
                                        Zweryfikował: <span className="font-bold text-stone-900">{project.completed_by_name || 'Brak danych'}</span>
                                        {project.completed_at ? `, ${new Date(project.completed_at).toLocaleString('pl-PL')}` : ''}
                                    </p>
                                ) : (
                                    <p>Status `ZAKOŃCZONY` będzie traktowany jako weryfikacja projektu i kwot.</p>
                                )}
                                {project.completion_note && <p className="mt-2 italic">{project.completion_note}</p>}
                            </div>
                        </div>
                    </div>

                    {canManageProjects && primary && (
                        <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-5">
                            <h3 className="text-sm font-black text-stone-900">Następna akcja</h3>
                            {primary.next === 'ZAKOŃCZONY' && (
                                <label className="mt-4 block">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">Notatka finalizacji</span>
                                    <textarea
                                        value={completionNote}
                                        onChange={(event) => setCompletionNote(event.target.value)}
                                        rows={3}
                                        placeholder="Opcjonalnie: co zostało zweryfikowane przed finalizacją?"
                                        className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-primary/50 focus:outline-none"
                                    />
                                </label>
                            )}
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => onStatusChange(project, primary.next, completionNote.trim() || 'Zweryfikowano przy finalizacji projektu')}
                                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-stone-950 px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-brand-primary hover:text-black disabled:opacity-50"
                            >
                                {loading && <Loader2 size={13} className="animate-spin" />}
                                {primary.next === 'ZAKOŃCZONY' ? 'Zakończ i nalicz prowizję' : primary.label}
                            </button>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
}

export default function AdminProjectPipeline({
    projects,
    canManageProjects,
    staffMembers,
}: {
    projects: Project[];
    canManageProjects: boolean;
    staffMembers: StaffMember[];
}) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<{ projectId: string; status: ProjectStatus } | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const now = useMemo(() => new Date(), []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return projects.filter((project) => {
            const matchesSearch = !q
                || project.name.toLowerCase().includes(q)
                || (project.architect_name || '').toLowerCase().includes(q)
                || (project.client_label || '').toLowerCase().includes(q)
                || project.id.toLowerCase().includes(q);
            return matchesSearch && isVisibleInOperationalWindow(project, now);
        });
    }, [now, projects, search]);

    const grouped = useMemo(() => {
        return STATUS_ORDER.reduce<Record<ProjectStatus, Project[]>>((acc, status) => {
            acc[status] = filtered.filter((project) => project.status === status);
            return acc;
        }, {
            ZGŁOSZONY: [],
            PRZYJĘTY: [],
            W_REALIZACJI: [],
            ZAKOŃCZONY: [],
            NIEZREALIZOWANY: [],
        });
    }, [filtered]);

    const olderInactiveCount = projects.filter((project) => {
        return (project.status === 'ZAKOŃCZONY' || project.status === 'NIEZREALIZOWANY')
            && !isVisibleInOperationalWindow(project, now);
    }).length;

    const requestStatus = async (project: Project, status: ProjectStatus, completionNote?: string) => {
        if ((status === 'NIEZREALIZOWANY' || status === 'ZAKOŃCZONY') && confirming?.projectId !== project.id && !completionNote) {
            if (status === 'ZAKOŃCZONY') {
                setSelectedProject(project);
                setConfirming({ projectId: project.id, status });
                return;
            }
            setConfirming({ projectId: project.id, status });
            return;
        }

        setLoadingId(project.id);
        try {
            await updateProjectStatus(project.id, status, completionNote);
            setConfirming(null);
            setSelectedProject(null);
            router.refresh();
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingId(null);
        }
    };

    const assignStaff = async (project: Project, staffId: string) => {
        setLoadingId(project.id);
        try {
            await assignProjectCaretaker(project.id, staffId === 'NONE' ? null : staffId);
            router.refresh();
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <section id="project-pipeline" className="scroll-mt-24 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-black text-stone-950">Pipeline projektów</h2>
                        <span className="rounded-full border border-black/10 bg-stone-50 px-2.5 py-1 text-[10px] font-black text-stone-500">
                            {filtered.length} projektów
                        </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-stone-500">
                        Aktywne projekty oraz zakończone/anulowane z ostatnich {RECENT_INACTIVE_DAYS} dni.
                    </p>
                </div>
                <div className="relative w-full lg:w-80">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                        type="text"
                        placeholder="Szukaj projektu, architekta, klienta..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="w-full rounded-lg border border-black/10 bg-stone-50 py-2 pl-9 pr-3 text-sm text-stone-900 placeholder-stone-400 focus:border-brand-primary/50 focus:outline-none"
                    />
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                {STATUS_ORDER.map((status) => {
                    const meta = STATUS_META[status];
                    const projectsInColumn = grouped[status];
                    const visibleProjects = projectsInColumn.slice(0, MAX_VISIBLE_PER_COLUMN);
                    const hiddenCount = projectsInColumn.length - visibleProjects.length;

                    return (
                        <div key={status} className={`min-h-[22rem] rounded-lg border ${meta.border} ${meta.tint} p-3`}>
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                                        <h3 className="text-[11px] font-black uppercase tracking-widest text-stone-800">{meta.label}</h3>
                                    </div>
                                    <p className="mt-1 text-[10px] font-medium text-stone-500">{meta.description}</p>
                                </div>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-stone-600 shadow-sm">
                                    {projectsInColumn.length}
                                </span>
                            </div>

                            <div className="space-y-3">
                                {visibleProjects.length > 0 ? visibleProjects.map((project) => (
                                    <ProjectCard
                                        key={project.id}
                                        project={project}
                                        canManageProjects={canManageProjects}
                                        onOpen={setSelectedProject}
                                        onRequestStatus={requestStatus}
                                        onCancelConfirm={() => setConfirming(null)}
                                        openMenuId={openMenuId}
                                        setOpenMenuId={setOpenMenuId}
                                        confirming={confirming}
                                        loading={loadingId === project.id}
                                    />
                                )) : (
                                    <div className="rounded-lg border border-dashed border-black/10 bg-white/60 p-4 text-center">
                                        <Clock size={18} className="mx-auto text-stone-300" />
                                        <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">Brak projektów</p>
                                    </div>
                                )}

                                {hiddenCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        className="w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-left text-[11px] font-bold text-stone-600 hover:bg-white"
                                    >
                                        + {hiddenCount} innych w tej kolumnie
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {olderInactiveCount > 0 && (
                <p className="mt-4 text-xs font-medium text-stone-500">
                    {olderInactiveCount} starszych zakończonych/anulowanych projektów ukryto z widoku operacyjnego. Pełna historia zostaje na stronach architektów i projektu.
                </p>
            )}

            {selectedProject && (
                <ProjectDrawer
                    project={selectedProject}
                    canManageProjects={canManageProjects}
                    staffMembers={staffMembers}
                    loading={loadingId === selectedProject.id}
                    onClose={() => {
                        setSelectedProject(null);
                        setConfirming(null);
                    }}
                    onStatusChange={requestStatus}
                    onAssignStaff={assignStaff}
                />
            )}
        </section>
    );
}
