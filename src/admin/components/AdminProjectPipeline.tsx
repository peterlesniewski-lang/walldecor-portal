'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { updateProjectStatus, assignProjectCaretaker } from '@/app/actions/projects';
import {
    ChevronDown,
    ExternalLink,
    MoreHorizontal,
    Search,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Banner,
    Button,
    Card,
    CardHeader,
    EmptyState,
    InlineConfirm,
    StatusPill,
    cx,
    formatDate,
    formatPLN,
    getStatusEntry,
} from '@/components/ui';

type ProjectStatus = 'ZGŁOSZONY' | 'PRZYJĘTY' | 'W_REALIZACJI' | 'ZAKOŃCZONY' | 'NIEZREALIZOWANY';
type Segment = 'active' | 'done' | 'all';

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
const PAGE_SIZE = 15;

const STATUS_ORDER: ProjectStatus[] = ['ZGŁOSZONY', 'PRZYJĘTY', 'W_REALIZACJI', 'ZAKOŃCZONY', 'NIEZREALIZOWANY'];
const ACTIVE_STATUSES: ProjectStatus[] = ['ZGŁOSZONY', 'PRZYJĘTY', 'W_REALIZACJI'];

const SEGMENTS: { id: Segment; label: string }[] = [
    { id: 'active', label: 'Aktywne' },
    { id: 'done', label: 'Zakończone' },
    { id: 'all', label: 'Wszystkie' },
];

const PRIMARY_ACTION: Partial<Record<ProjectStatus, { label: string; next: ProjectStatus }>> = {
    ZGŁOSZONY: { label: 'Przyjmij', next: 'PRZYJĘTY' },
    PRZYJĘTY: { label: 'Start', next: 'W_REALIZACJI' },
    W_REALIZACJI: { label: 'Zakończ', next: 'ZAKOŃCZONY' },
};

const SECONDARY_ACTIONS: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
    ZGŁOSZONY: ['NIEZREALIZOWANY'],
    PRZYJĘTY: ['NIEZREALIZOWANY'],
    W_REALIZACJI: ['NIEZREALIZOWANY'],
};

const FIELD_CLASS =
    'rounded-sm border border-border-strong bg-surface text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none';

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
    return formatDate(date);
}

/** Prowizja do pokazania: zarobiona, a gdy jej nie ma, planowana (przygaszona). */
function commissionOf(project: Project): { amount: number; planned: boolean } {
    const earned = Number(project.earned_commission) || 0;
    if (earned > 0) return { amount: earned, planned: false };
    const planned = Number(project.estimated_commission) || 0;
    return { amount: planned, planned: true };
}

function CommissionValue({ project }: { project: Project }) {
    const { amount, planned } = commissionOf(project);
    if (amount <= 0) return <span className="text-ink-3">—</span>;
    return (
        <span className={planned ? 'text-ink-2' : 'text-ink'} title={planned ? 'Prowizja planowana' : 'Prowizja zarobiona'}>
            {formatPLN(amount)}
        </span>
    );
}

function CaretakerValue({
    project,
    canManageProjects,
    onOpen,
}: {
    project: Project;
    canManageProjects: boolean;
    onOpen: (project: Project) => void;
}) {
    if (project.staff_name) return <span className="truncate text-ink">{project.staff_name}</span>;
    if (!canManageProjects) return <span className="text-warning">Brak opiekuna</span>;
    return (
        <button
            type="button"
            onClick={() => onOpen(project)}
            className="truncate rounded-sm text-left text-warning underline decoration-warning/40 underline-offset-2 hover:decoration-warning"
            title="Przypisz opiekuna"
        >
            Brak opiekuna
        </button>
    );
}

function confirmQuestion(status: ProjectStatus): string {
    if (status === 'ZAKOŃCZONY') return 'Zakończyć projekt i naliczyć prowizję?';
    if (status === 'NIEZREALIZOWANY') return 'Oznaczyć projekt jako niezrealizowany?';
    return 'Zmienić status projektu?';
}

function confirmLabel(status: ProjectStatus): string {
    if (status === 'ZAKOŃCZONY') return 'Zakończ projekt';
    if (status === 'NIEZREALIZOWANY') return 'Odrzuć projekt';
    return 'Zmień status';
}

interface RowActionsProps {
    project: Project;
    canManageProjects: boolean;
    onRequestStatus: (project: Project, status: ProjectStatus) => void;
    openMenuId: string | null;
    setOpenMenuId: (id: string | null) => void;
    loading: boolean;
    align?: 'start' | 'end';
}

function RowActions({ project, canManageProjects, onRequestStatus, openMenuId, setOpenMenuId, loading, align = 'end' }: RowActionsProps) {
    const primary = PRIMARY_ACTION[project.status as ProjectStatus];
    const secondary = SECONDARY_ACTIONS[project.status as ProjectStatus] || [];
    if (!canManageProjects || (!primary && secondary.length === 0)) return null;

    return (
        <div className={cx('flex items-center gap-1.5', align === 'end' ? 'justify-end' : 'justify-start')}>
            {primary && (
                <Button size="sm" variant="secondary" loading={loading} onClick={() => onRequestStatus(project, primary.next)}>
                    {primary.label}
                </Button>
            )}
            {secondary.length > 0 && (
                <div className="relative">
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId(openMenuId === project.id ? null : project.id);
                        }}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === project.id}
                        aria-label="Dodatkowe akcje projektu"
                        className="grid h-8 w-8 place-items-center rounded-sm text-ink-2 hover:bg-ink/5 hover:text-ink"
                    >
                        <MoreHorizontal size={16} aria-hidden="true" />
                    </button>
                    {openMenuId === project.id && (
                        <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-sm border border-border bg-surface p-1 shadow-float">
                            {secondary.map((status) => (
                                <button
                                    key={status}
                                    type="button"
                                    role="menuitem"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setOpenMenuId(null);
                                        onRequestStatus(project, status);
                                    }}
                                    className="flex w-full items-center rounded-sm px-3 py-2 text-left text-sm font-medium text-danger hover:bg-danger-soft"
                                >
                                    Odrzuć projekt
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface ItemProps extends Omit<RowActionsProps, 'align'> {
    canManageProjects: boolean;
    onOpen: (project: Project) => void;
    onCancelConfirm: () => void;
    confirming: { projectId: string; status: ProjectStatus } | null;
}

function ConfirmRow({ project, confirming, loading, onRequestStatus, onCancelConfirm, className }: {
    project: Project;
    confirming: ItemProps['confirming'];
    loading: boolean;
    onRequestStatus: ItemProps['onRequestStatus'];
    onCancelConfirm: () => void;
    className?: string;
}) {
    if (!confirming || confirming.projectId !== project.id) return null;
    return (
        <div className={className}>
            <InlineConfirm
                question={confirmQuestion(confirming.status)}
                confirmLabel={confirmLabel(confirming.status)}
                cancelLabel="Anuluj"
                danger={confirming.status === 'NIEZREALIZOWANY'}
                loading={loading}
                onConfirm={() => onRequestStatus(project, confirming.status)}
                onCancel={onCancelConfirm}
            />
        </div>
    );
}

const TD = 'px-5 py-3.5 align-middle';

function ProjectTableRow(props: ItemProps) {
    const { project, canManageProjects, onOpen, loading, confirming } = props;
    const isConfirming = confirming?.projectId === project.id;
    return (
        <>
            <tr className={cx('hover:bg-surface-2', !isConfirming && 'border-b border-border last:border-b-0')}>
                <td className={TD}>
                    <button
                        type="button"
                        onClick={() => onOpen(project)}
                        className="block max-w-full truncate rounded-sm text-left font-semibold text-ink hover:underline hover:underline-offset-2"
                    >
                        {project.name}
                    </button>
                    <div className="truncate text-[13px] text-ink-3">{project.client_label || 'Brak danych klienta'}</div>
                </td>
                <td className={cx(TD, 'text-ink-2')}><div className="truncate">{project.architect_name}</div></td>
                <td className={TD}><StatusPill kind="project" status={project.status} /></td>
                <td className={cx(TD, 'text-sm')}>
                    <div className="flex min-w-0">
                        <CaretakerValue project={project} canManageProjects={canManageProjects} onOpen={onOpen} />
                    </div>
                </td>
                <td className={cx(TD, 'tnum whitespace-nowrap text-right font-medium text-ink')}>{formatPLN(project.product_value)}</td>
                <td className={cx(TD, 'tnum whitespace-nowrap text-right')}><CommissionValue project={project} /></td>
                <td className={TD}>
                    <div className="flex min-w-0 items-center justify-end">
                        <RowActions {...props} loading={loading} />
                    </div>
                </td>
            </tr>
            {isConfirming && (
                <tr className="border-b border-border last:border-b-0 hover:bg-surface-2">
                    <td colSpan={7} className="px-5 pb-3.5">
                        <ConfirmRow {...props} />
                    </td>
                </tr>
            )}
        </>
    );
}

function ProjectCard(props: ItemProps) {
    const { project, canManageProjects, onOpen, loading } = props;
    return (
        <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <button
                        type="button"
                        onClick={() => onOpen(project)}
                        className="block max-w-full truncate rounded-sm text-left font-semibold text-ink hover:underline hover:underline-offset-2"
                    >
                        {project.name}
                    </button>
                    <div className="mt-0.5 truncate font-mono text-[13px] text-ink-3">{project.id}</div>
                </div>
                <StatusPill kind="project" status={project.status} />
            </div>

            <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-3">Architekt</dt>
                    <dd className="min-w-0 truncate text-ink">{project.architect_name}</dd>
                </div>
                <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-3">Klient</dt>
                    <dd className="min-w-0 truncate text-ink">{project.client_label || 'Brak danych'}</dd>
                </div>
                <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-3">Opiekun</dt>
                    <dd className="flex min-w-0 text-ink">
                        <CaretakerValue project={project} canManageProjects={canManageProjects} onOpen={onOpen} />
                    </dd>
                </div>
            </dl>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div>
                    <div className="label-caps">Wartość</div>
                    <div className="tnum mt-0.5 font-medium text-ink">{formatPLN(project.product_value)}</div>
                </div>
                <div>
                    <div className="label-caps">Prowizja</div>
                    <div className="tnum mt-0.5 font-medium"><CommissionValue project={project} /></div>
                </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
                <span className="tnum text-[13px] text-ink-3">{dateLabel(project)}</span>
                <RowActions {...props} loading={loading} />
            </div>
            <ConfirmRow {...props} className="mt-3" />
        </div>
    );
}

function PayoutStatusPills({ value }: { value?: string | null }) {
    const codes = Array.from(new Set((value || '').split(',').map((code) => code.trim()).filter(Boolean)));
    if (codes.length === 0) return <span className="text-sm text-ink-2">Po fakturze</span>;
    return (
        <div className="flex flex-wrap gap-1.5">
            {codes.map((code) => <StatusPill key={code} kind="payout" status={code} />)}
        </div>
    );
}

function ProjectDrawer({
    project,
    canManageProjects,
    staffMembers,
    loading,
    confirmingFinish,
    onClose,
    onStatusChange,
    onAssignStaff,
}: {
    project: Project;
    canManageProjects: boolean;
    staffMembers: StaffMember[];
    loading: boolean;
    confirmingFinish: boolean;
    onClose: () => void;
    onStatusChange: (project: Project, status: ProjectStatus, note?: string) => void;
    onAssignStaff: (project: Project, staffId: string) => void;
}) {
    const [completionNote, setCompletionNote] = useState('');
    const primary = PRIMARY_ACTION[project.status as ProjectStatus];
    const commission = commissionOf(project);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[80]">
            <button
                type="button"
                className="absolute inset-0 bg-ink/30"
                onClick={onClose}
                aria-label="Zamknij podgląd projektu"
            />
            <aside
                role="dialog"
                aria-modal="true"
                aria-label={`Podgląd projektu ${project.name}`}
                className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-bg shadow-float"
            >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
                    <div className="min-w-0">
                        <p className="label-caps">Podgląd projektu</p>
                        <h2 className="mt-1 truncate font-display text-2xl text-ink">{project.name}</h2>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose} aria-label="Zamknij" icon={<X size={16} aria-hidden="true" />} />
                </div>

                <div className="space-y-4 p-6">
                    <Card className="p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="label-caps">Status</p>
                                <div className="mt-1.5"><StatusPill kind="project" status={project.status} /></div>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                href={`/dashboard/admin/projects/${project.id}`}
                                icon={<ExternalLink size={14} aria-hidden="true" />}
                            >
                                Otwórz pełny projekt
                            </Button>
                        </div>
                        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <dt className="label-caps">ID</dt>
                                <dd className="mt-1 break-all font-mono text-[13px] text-ink">{project.id}</dd>
                            </div>
                            <div>
                                <dt className="label-caps">Klient</dt>
                                <dd className="mt-1 text-ink">{project.client_label || 'Brak danych'}</dd>
                            </div>
                            <div>
                                <dt className="label-caps">Architekt</dt>
                                <dd className="mt-1 text-ink">{project.architect_name}</dd>
                            </div>
                            <div>
                                <dt className="label-caps">Data statusu</dt>
                                <dd className="tnum mt-1 text-ink">{dateLabel(project)}</dd>
                            </div>
                        </dl>
                    </Card>

                    <Card className="p-5">
                        <h3 className="text-base font-semibold text-ink">Kwoty do weryfikacji</h3>
                        <div className="mt-4 grid grid-cols-3 gap-3">
                            <div className="rounded-sm bg-surface-2 p-3">
                                <p className="label-caps">Produkty</p>
                                <p className="tnum mt-1.5 font-display text-xl text-ink">{formatPLN(project.product_value)}</p>
                            </div>
                            <div className="rounded-sm bg-surface-2 p-3">
                                <p className="label-caps">{commission.planned ? 'Prowizja plan.' : 'Prowizja'}</p>
                                <p className="tnum mt-1.5 font-display text-xl text-ink">{commission.amount > 0 ? formatPLN(commission.amount) : '—'}</p>
                            </div>
                            <div className="rounded-sm bg-surface-2 p-3">
                                <p className="label-caps">Wypłata</p>
                                <div className="mt-1.5"><PayoutStatusPills value={project.payout_status} /></div>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-5">
                        <h3 className="text-base font-semibold text-ink">Opiekun i audyt</h3>
                        <div className="mt-4 space-y-4">
                            {canManageProjects ? (
                                <label className="block">
                                    <span className="label-caps">Opiekun</span>
                                    <div className="relative mt-2">
                                        <select
                                            value={project.staff_id || 'NONE'}
                                            onChange={(event) => onAssignStaff(project, event.target.value)}
                                            disabled={loading}
                                            className={cx(FIELD_CLASS, 'h-10 w-full appearance-none px-3 pr-9 disabled:opacity-50')}
                                        >
                                            <option value="NONE">Brak opiekuna</option>
                                            {staffMembers.map((staff) => (
                                                <option key={staff.id} value={staff.id}>{staff.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-2" />
                                    </div>
                                </label>
                            ) : (
                                <p className={cx('text-sm', project.staff_name ? 'text-ink' : 'text-warning')}>{project.staff_name || 'Brak opiekuna'}</p>
                            )}
                            <div className="rounded-sm bg-surface-2 p-3 text-sm text-ink-2">
                                {project.status === 'ZAKOŃCZONY' ? (
                                    <p>
                                        Zweryfikował: <span className="font-semibold text-ink">{project.completed_by_name || 'Brak danych'}</span>
                                        {project.completed_at ? `, ${new Date(project.completed_at).toLocaleString('pl-PL')}` : ''}
                                    </p>
                                ) : (
                                    <p>Status „Zakończony” będzie traktowany jako weryfikacja projektu i kwot.</p>
                                )}
                                {project.completion_note && <p className="mt-2 italic">{project.completion_note}</p>}
                            </div>
                        </div>
                    </Card>

                    {canManageProjects && primary && (
                        <Card className="border-brass p-5">
                            <h3 className="text-base font-semibold text-ink">Następna akcja</h3>
                            {confirmingFinish && (
                                <div className="mt-3">
                                    <Banner tone="warning">Zakończenie projektu nalicza prowizję. Dodaj notatkę i potwierdź poniżej.</Banner>
                                </div>
                            )}
                            {primary.next === 'ZAKOŃCZONY' && (
                                <label className="mt-4 block">
                                    <span className="label-caps">Notatka finalizacji</span>
                                    <textarea
                                        value={completionNote}
                                        onChange={(event) => setCompletionNote(event.target.value)}
                                        rows={3}
                                        placeholder="Opcjonalnie: co zostało zweryfikowane przed finalizacją?"
                                        className={cx(FIELD_CLASS, 'mt-2 w-full px-3 py-2')}
                                    />
                                </label>
                            )}
                            <Button
                                className="mt-4"
                                loading={loading}
                                onClick={() => onStatusChange(project, primary.next, completionNote.trim() || 'Zweryfikowano przy finalizacji projektu')}
                            >
                                {primary.next === 'ZAKOŃCZONY' ? 'Zakończ i nalicz prowizję' : primary.label}
                            </Button>
                        </Card>
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
    const [segment, setSegment] = useState<Segment>('active');
    const [statusFilter, setStatusFilter] = useState<ProjectStatus | null>(null);
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<{ projectId: string; status: ProjectStatus } | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [actionError, setActionError] = useState('');
    const now = useMemo(() => new Date(), []);

    // Menu "…" zamyka się po kliknięciu poza nim i klawiszem Escape.
    useEffect(() => {
        if (!openMenuId) return;
        const close = () => setOpenMenuId(null);
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        document.addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('click', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [openMenuId]);

    // Projekty po wyszukiwarce i oknie operacyjnym (90 dni dla zakończonych/anulowanych).
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

    const statusCounts = useMemo(() => {
        const counts: Record<ProjectStatus, number> = {
            ZGŁOSZONY: 0,
            PRZYJĘTY: 0,
            W_REALIZACJI: 0,
            ZAKOŃCZONY: 0,
            NIEZREALIZOWANY: 0,
        };
        filtered.forEach((project) => {
            if (project.status in counts) counts[project.status as ProjectStatus] += 1;
        });
        return counts;
    }, [filtered]);

    const visible = useMemo(() => {
        return filtered.filter((project) => {
            if (statusFilter) return project.status === statusFilter;
            const isActive = ACTIVE_STATUSES.includes(project.status as ProjectStatus);
            if (segment === 'active') return isActive;
            if (segment === 'done') return !isActive;
            return true;
        });
    }, [filtered, segment, statusFilter]);

    const shown = visible.slice(0, limit);
    const hiddenCount = visible.length - shown.length;

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
        setActionError('');
        try {
            const result = await updateProjectStatus(project.id, status, completionNote);
            setConfirming(null);
            setSelectedProject(null);
            if (!result.success) {
                setActionError(`„${project.name}”: ${result.error}`);
                return;
            }
            router.refresh();
        } catch (err) {
            console.error(err);
            setActionError(`Nie udało się zmienić statusu projektu „${project.name}”. Spróbuj ponownie.`);
        } finally {
            setLoadingId(null);
        }
    };

    const assignStaff = async (project: Project, staffId: string) => {
        setLoadingId(project.id);
        setActionError('');
        try {
            await assignProjectCaretaker(project.id, staffId === 'NONE' ? null : staffId);
            router.refresh();
        } catch (err) {
            console.error(err);
            setActionError(`Nie udało się przypisać opiekuna do projektu „${project.name}”. Spróbuj ponownie.`);
        } finally {
            setLoadingId(null);
        }
    };

    const itemProps = (project: Project): ItemProps => ({
        project,
        canManageProjects,
        onOpen: setSelectedProject,
        onRequestStatus: requestStatus,
        onCancelConfirm: () => setConfirming(null),
        openMenuId,
        setOpenMenuId,
        confirming,
        loading: loadingId === project.id,
    });

    const selectSegment = (next: Segment) => {
        setSegment(next);
        setStatusFilter(null);
        setLimit(PAGE_SIZE);
    };

    const toggleStatus = (status: ProjectStatus) => {
        setStatusFilter((current) => (current === status ? null : status));
        setLimit(PAGE_SIZE);
    };

    return (
        <Card as="section" id="project-pipeline" className="scroll-mt-24">
            <CardHeader
                title={
                    <span className="inline-flex items-center gap-3">
                        Pipeline projektów
                        <span className="tnum text-[13px] font-normal text-ink-3">{visible.length} z {filtered.length}</span>
                    </span>
                }
                action={
                    <div role="group" aria-label="Zakres projektów" className="inline-flex rounded-sm bg-ink/[0.06] p-[3px]">
                        {SEGMENTS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                aria-pressed={segment === item.id && !statusFilter}
                                onClick={() => selectSegment(item.id)}
                                className={cx(
                                    'rounded-[6px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                                    segment === item.id && !statusFilter ? 'bg-surface text-ink shadow-hairline' : 'text-ink-2 hover:text-ink',
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                }
            />

            <div className="space-y-3 border-b border-border px-5 py-4">
                <div className="relative w-full lg:max-w-sm">
                    <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                    <input
                        type="search"
                        placeholder="Szukaj projektu, architekta, klienta…"
                        aria-label="Szukaj projektu, architekta lub klienta"
                        value={search}
                        onChange={(event) => { setSearch(event.target.value); setLimit(PAGE_SIZE); }}
                        className={cx(FIELD_CLASS, 'h-10 w-full pl-9 pr-3')}
                    />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                    {STATUS_ORDER.map((status) => {
                        const active = statusFilter === status;
                        return (
                            <button
                                key={status}
                                type="button"
                                aria-pressed={active}
                                onClick={() => toggleStatus(status)}
                                title={`Pokaż tylko: ${getStatusEntry('project', status).label}`}
                                className={cx(
                                    'flex items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left transition-colors',
                                    active ? 'border-ink bg-surface' : 'border-border bg-surface-2 hover:border-border-strong',
                                )}
                            >
                                <StatusPill kind="project" status={status} />
                                <span className="tnum text-sm font-semibold text-ink">{statusCounts[status]}</span>
                            </button>
                        );
                    })}
                </div>
                {actionError && (
                    <Banner
                        tone="danger"
                        action={<Button size="sm" variant="ghost" onClick={() => setActionError('')}>Zamknij</Button>}
                    >
                        {actionError}
                    </Banner>
                )}
            </div>

            {visible.length === 0 ? (
                <div className="p-5">
                    <EmptyState
                        title="Brak projektów"
                        description={search.trim() ? 'Żaden projekt nie pasuje do wyszukiwania. Zmień frazę albo zakres.' : 'W tym zakresie nie ma jeszcze projektów.'}
                        action={(search.trim() || statusFilter) ? (
                            <Button variant="secondary" size="sm" onClick={() => { setSearch(''); selectSegment('all'); }}>
                                Pokaż wszystkie
                            </Button>
                        ) : undefined}
                    />
                </div>
            ) : (
                <>
                    {/* Desktop: tabela */}
                    <div className="relative hidden overflow-x-auto xl:block">
                        <table aria-label="Pipeline projektów" className="w-full min-w-[1040px] table-fixed border-collapse text-left text-sm">
                            <colgroup>
                                <col />
                                <col />
                                <col className="w-[9.5rem]" />
                                <col />
                                <col className="w-[8.5rem]" />
                                <col className="w-[8.5rem]" />
                                <col className="w-[10rem]" />
                            </colgroup>
                            <thead>
                                <tr className="border-b border-border">
                                    <th scope="col" className="label-caps px-5 py-3 text-left">Projekt</th>
                                    <th scope="col" className="label-caps px-5 py-3 text-left">Architekt</th>
                                    <th scope="col" className="label-caps px-5 py-3 text-left">Status</th>
                                    <th scope="col" className="label-caps px-5 py-3 text-left">Opiekun</th>
                                    <th scope="col" className="label-caps px-5 py-3 text-right">Wartość</th>
                                    <th scope="col" className="label-caps px-5 py-3 text-right">Prowizja</th>
                                    <th scope="col" className="px-5 py-3"><span className="sr-only">Akcje</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((project) => (
                                    <ProjectTableRow key={project.id} {...itemProps(project)} />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile i tablet: karty */}
                    <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:hidden">
                        {shown.map((project) => (
                            <ProjectCard key={project.id} {...itemProps(project)} />
                        ))}
                    </div>

                    {hiddenCount > 0 && (
                        <div className="flex justify-center border-t border-border px-5 py-3">
                            <Button variant="ghost" size="sm" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
                                Pokaż więcej ({hiddenCount})
                            </Button>
                        </div>
                    )}
                </>
            )}

            <p className="border-t border-border px-5 py-3 text-[13px] text-ink-3">
                Aktywne projekty oraz zakończone i niezrealizowane z ostatnich {RECENT_INACTIVE_DAYS} dni.
                {olderInactiveCount > 0 && ` ${olderInactiveCount} starszych ukryto z widoku operacyjnego, pełna historia zostaje na stronach architektów i projektu.`}
            </p>

            {selectedProject && (
                <ProjectDrawer
                    project={projects.find((project) => project.id === selectedProject.id) ?? selectedProject}
                    canManageProjects={canManageProjects}
                    staffMembers={staffMembers}
                    loading={loadingId === selectedProject.id}
                    confirmingFinish={confirming?.projectId === selectedProject.id && confirming.status === 'ZAKOŃCZONY'}
                    onClose={() => {
                        setSelectedProject(null);
                        setConfirming(null);
                    }}
                    onStatusChange={requestStatus}
                    onAssignStaff={assignStaff}
                />
            )}
        </Card>
    );
}
