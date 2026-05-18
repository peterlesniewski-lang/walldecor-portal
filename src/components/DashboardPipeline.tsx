'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, MoreVertical } from 'lucide-react';
import { formatPLN } from '@/lib/utils';

interface Project {
    id: string;
    name: string;
    client_label: string;
    status: string;
    total_value?: number;
    commission_amount?: number;
    created_at: string;
}

interface DashboardPipelineProps {
    projects: Project[];
}

const STATUS_ORDER = ['ZGŁOSZONY', 'PRZYJĘTY', 'W_REALIZACJI', 'ZAKOŃCZONY', 'NIEZREALIZOWANY'];

const STATUS_STYLES: Record<string, { label: string; border: string; text: string; bg: string; helper: string }> = {
    ZGŁOSZONY: { label: 'ZGŁOSZONY', border: 'border-t-stone-300', text: 'text-stone-700', bg: 'bg-stone-50', helper: 'Czeka na weryfikację' },
    PRZYJĘTY: { label: 'PRZYJĘTY', border: 'border-t-blue-400', text: 'text-blue-700', bg: 'bg-blue-50/60', helper: 'Zaakceptowany' },
    W_REALIZACJI: { label: 'W_REALIZACJI', border: 'border-t-amber-500', text: 'text-amber-700', bg: 'bg-amber-50/70', helper: 'W obsłudze WallDecor' },
    ZAKOŃCZONY: { label: 'ZAKOŃCZONY', border: 'border-t-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50/70', helper: 'Prowizja rozliczana' },
    NIEZREALIZOWANY: { label: 'NIEZREALIZOWANY', border: 'border-t-red-500', text: 'text-red-700', bg: 'bg-red-50/70', helper: 'Anulowany lub odrzucony' },
};

export default function DashboardPipeline({ projects }: DashboardPipelineProps) {
    return (
        <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-black text-stone-900">Twoje projekty</h3>
                    <p className="mt-1 text-sm font-medium text-stone-500">Aktualny przepływ projektów i prowizji.</p>
                </div>
                <Link
                    href="/dashboard/projects"
                    className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-[10px] font-black text-stone-700 uppercase tracking-widest hover:border-brand-primary/40 hover:text-brand-primary transition-all"
                >
                    Zobacz wszystkie projekty <ArrowRight size={14} />
                </Link>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {STATUS_ORDER.map((status) => {
                    const style = STATUS_STYLES[status];
                    const allStatusProjects = projects.filter((project) => project.status === status);
                    const statusProjects = allStatusProjects.slice(0, 3);
                    const hiddenCount = Math.max(0, allStatusProjects.length - statusProjects.length);
                    return (
                        <div key={status} className={`min-h-[18rem] rounded-lg border border-black/10 border-t-2 ${style.border} ${style.bg} p-3`}>
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                    <h4 className={`text-[10px] font-black uppercase tracking-widest ${style.text}`}>{style.label}</h4>
                                    <p className="mt-1 text-[10px] font-medium text-stone-500">{style.helper}</p>
                                </div>
                                <span className="rounded-full bg-white/80 border border-black/5 px-2 py-0.5 text-[10px] font-black text-stone-500">
                                    {allStatusProjects.length}
                                </span>
                            </div>
                            <div className="space-y-2">
                                {statusProjects.length > 0 ? statusProjects.map((project) => (
                                    <Link
                                        key={project.id}
                                        href={`/dashboard/projects/${project.id}`}
                                        className="block rounded-lg border border-black/10 bg-white p-3 shadow-sm hover:border-brand-primary/40 transition-all"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <h5 className="text-xs font-black text-stone-900 leading-tight">{project.name}</h5>
                                                <p className="mt-1 text-[10px] font-bold text-stone-500">Klient: {project.client_label}</p>
                                            </div>
                                            <MoreVertical size={14} className="text-stone-400 shrink-0" />
                                        </div>
                                        <div className="mt-3 space-y-1">
                                            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Wartość produktu</p>
                                            <p className="text-xs font-black text-stone-900">{formatPLN(project.total_value || 0)} PLN</p>
                                            {project.commission_amount ? (
                                                <>
                                                    <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Zarobiona prowizja</p>
                                                    <p className="text-xs font-black text-emerald-700">{formatPLN(project.commission_amount)} PLN</p>
                                                </>
                                            ) : null}
                                            <p className="text-[9px] font-bold text-stone-500">
                                                {new Date(project.created_at).toLocaleDateString('pl-PL')}
                                            </p>
                                        </div>
                                    </Link>
                                )) : (
                                    <div className="rounded-lg border border-dashed border-black/10 bg-white/50 p-4 text-center">
                                        <p className="text-[10px] font-bold text-stone-400">Brak projektów</p>
                                    </div>
                                )}
                                {hiddenCount > 0 && (
                                    <Link href="/dashboard/projects" className="block rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-[10px] font-bold text-stone-600 hover:bg-white">
                                        + {hiddenCount} innych
                                    </Link>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
