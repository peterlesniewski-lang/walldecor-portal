'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardBody, CardHeader, Button, StatusPill, cx, formatPLN, formatDate, getStatusEntry } from '@/components/ui';

interface Project {
    id: string;
    name: string;
    client_label: string;
    status: string;
    total_value?: number | string | null;
    commission_amount?: number | string | null;
    created_at: string;
}

interface DashboardPipelineProps {
    projects: Project[];
}

const STATUS_ORDER = ['ZGŁOSZONY', 'PRZYJĘTY', 'W_REALIZACJI', 'ZAKOŃCZONY', 'NIEZREALIZOWANY'];

const STATUS_HELPER: Record<string, string> = {
    ZGŁOSZONY: 'Czeka na weryfikację',
    PRZYJĘTY: 'Zaakceptowany przez WallDecor',
    W_REALIZACJI: 'W obsłudze WallDecor',
    ZAKOŃCZONY: 'Prowizja rozliczona',
    NIEZREALIZOWANY: 'Anulowany lub odrzucony',
};

export default function DashboardPipeline({ projects }: DashboardPipelineProps) {
    // Na telefonie (< sm) puste kolumny nie zajmują miejsca: zostają projekty i jedna linia o pozostałych statusach.
    const emptyStatuses = STATUS_ORDER.filter((status) => !projects.some((project) => project.status === status));
    const hideEmptyOnMobile = emptyStatuses.length < STATUS_ORDER.length;

    return (
        <Card as="section" aria-label="Twoje projekty">
            <CardHeader
                title="Twoje projekty"
                action={
                    <Button href="/dashboard/projects" variant="secondary" size="sm" icon={<ArrowRight size={14} aria-hidden="true" />}>
                        Zobacz wszystkie projekty
                    </Button>
                }
            />
            <CardBody>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {STATUS_ORDER.map((status) => {
                        const allStatusProjects = projects.filter((project) => project.status === status);
                        const statusProjects = allStatusProjects.slice(0, 3);
                        const hiddenCount = Math.max(0, allStatusProjects.length - statusProjects.length);
                        return (
                            <section
                                key={status}
                                className={cx(
                                    'min-w-0 rounded-md border border-border bg-surface-2 p-3',
                                    hideEmptyOnMobile && allStatusProjects.length === 0 && 'hidden sm:block',
                                )}
                            >
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <StatusPill kind="project" status={status} />
                                    <span className="tnum text-[13px] font-semibold text-ink-2">{allStatusProjects.length}</span>
                                </div>
                                <p className="mb-3 text-xs text-ink-2">{STATUS_HELPER[status]}</p>
                                <div className="space-y-2">
                                    {statusProjects.length > 0 ? statusProjects.map((project) => (
                                        <Link
                                            key={project.id}
                                            href={`/dashboard/projects/${project.id}`}
                                            className="block rounded-sm border border-border bg-surface p-3 transition-colors hover:border-border-strong"
                                        >
                                            <h5 className="truncate text-sm font-semibold leading-tight text-ink">{project.name}</h5>
                                            <p className="mt-0.5 truncate text-xs text-ink-2">Klient: {project.client_label}</p>
                                            <p className="tnum mt-2 text-[13px] font-semibold text-ink">{formatPLN(project.total_value || 0)}</p>
                                            {project.commission_amount ? (
                                                <p className="tnum text-xs text-success">Prowizja {formatPLN(project.commission_amount)}</p>
                                            ) : null}
                                            <p className="tnum mt-1 text-xs text-ink-3">{formatDate(project.created_at)}</p>
                                        </Link>
                                    )) : (
                                        <div className="rounded-sm border border-dashed border-border-strong px-3 py-4 text-center">
                                            <p className="text-xs text-ink-2">Brak projektów</p>
                                        </div>
                                    )}
                                    {hiddenCount > 0 && (
                                        <Link href="/dashboard/projects" className="block rounded-sm px-3 py-1.5 text-center text-xs font-semibold text-brass-ink hover:bg-brass-soft">
                                            + {hiddenCount} innych
                                        </Link>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
                {hideEmptyOnMobile && emptyStatuses.length > 0 && (
                    <p className="mt-3 text-[13px] text-ink-2 sm:hidden">
                        Pozostałe statusy ({emptyStatuses.map((status) => getStatusEntry('project', status).label).join(', ')}): 0 projektów
                    </p>
                )}
            </CardBody>
        </Card>
    );
}
