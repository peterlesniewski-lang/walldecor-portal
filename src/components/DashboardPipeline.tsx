'use client';

import React from 'react';
import Link from 'next/link';
import { ExternalLink, ChevronRight } from 'lucide-react';

interface Project {
    id: string;
    name: string;
    client_label: string;
    status: string;
    total_value?: number;
    created_at: string;
}

interface DashboardPipelineProps {
    projects: Project[];
}

export default function DashboardPipeline({ projects }: DashboardPipelineProps) {
    const statusColors: any = {
        'ZGŁOSZONY': 'text-stone-400',
        'PRZYJĘTY': 'text-blue-600',
        'W_REALIZACJI': 'text-amber-500',
        'ZAKOŃCZONY': 'text-emerald-500',
        'NIEZREALIZOWANY': 'text-red-600'
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-3">
                    <span className="w-2 h-2 bg-brand-primary rounded-full animate-pulse"></span>
                    Ostatnie Projekty
                </h3>
                <Link
                    href="/dashboard/projects"
                    className="text-[10px] font-black text-stone-600 uppercase tracking-widest hover:text-brand-primary transition-all"
                >
                    Zobacz Wszystkie →
                </Link>
            </div>

            <div className="stat-card bg-card p-0 overflow-hidden">
                <div className="divide-y divide-black/5">
                    {projects.length > 0 ? (
                        projects.slice(0, 5).map((project) => (
                            <Link
                                key={project.id}
                                href={`/dashboard/projects/${project.id}`}
                                className="p-6 hover:bg-black/[0.02] transition-all flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-6">
                                    <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center text-stone-500 border border-black/5 group-hover:border-brand-primary/20 transition-colors">
                                        <ExternalLink size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-stone-900 group-hover:gold-text transition-all leading-tight">
                                            {project.name}
                                        </h4>
                                        <p className="text-[10px] text-stone-500 uppercase font-black tracking-widest mt-1">
                                            {project.client_label} • <span className={statusColors[project.status] || 'text-stone-500'}>
                                                {project.status.replace('_', ' ')}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-stone-700 group-hover:text-brand-primary transition-all" />
                            </Link>
                        ))
                    ) : (
                        <div className="p-10 text-center">
                            <p className="text-sm font-bold text-stone-500 uppercase tracking-widest">Brak aktywnych projektów</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
