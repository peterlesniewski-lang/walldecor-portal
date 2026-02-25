'use client';

import React from 'react';
import {
    CheckCircle2,
    XCircle,
    ExternalLink,
    ChevronRight,
    Building2
} from 'lucide-react';
import { updateProjectStatus } from '@/app/actions/projects';
import { formatPLN } from '@/lib/utils';

interface AdminProjectItemProps {
    project: any;
}

export default function AdminProjectItem({ project }: AdminProjectItemProps) {
    const handleStatusUpdate = async (newStatus: string) => {
        if (confirm(`Czy na pewno chcesz zmienić status projektu na ${newStatus}?`)) {
            await updateProjectStatus(project.id, newStatus);
        }
    };

    return (
        <div className="stat-card bg-card group hover:bg-stone-50 transition-all relative overflow-hidden">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-black/5 flex items-center justify-center text-brand-primary border border-black/5 group-hover:scale-105 transition-transform">
                        <Building2 size={32} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h4 className="text-xl font-black text-stone-900 group-hover:gold-text transition-all leading-none">{project.name}</h4>
                            <span className="text-[9px] bg-stone-100 text-stone-500 px-2 py-1 rounded-lg uppercase font-black tracking-widest border border-slate-700/50">
                                {project.id}
                            </span>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-stone-200"></span>
                                {project.architect_name}
                            </div>
                            <div className="text-lg font-black gold-text">
                                {formatPLN(project.total_value)} <span className="text-[10px]">PLN</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 ml-auto md:ml-0">
                    <button
                        onClick={() => handleStatusUpdate('NIEZREALIZOWANY')}
                        className="p-3.5 text-stone-700 hover:text-red-600 hover:bg-red-900/10 rounded-2xl transition-all border border-transparent hover:border-red-900/30"
                        title="Odrzuć Ekspedycję"
                    >
                        <XCircle size={22} />
                    </button>

                    {project.status === 'ZGŁOSZONY' && (
                        <button
                            onClick={() => handleStatusUpdate('PRZYJĘTY')}
                            className="bg-blue-600 hover:bg-blue-500 text-white h-14 px-8 rounded-[2rem] font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all shadow-[0_10px_20px_rgba(37,99,235,0.2)] hover:shadow-[0_15px_30px_rgba(37,99,235,0.3)] active:scale-95"
                        >
                            <CheckCircle2 size={20} />
                            Akceptuj
                            <ChevronRight size={16} className="opacity-50" />
                        </button>
                    )}

                    {project.status === 'PRZYJĘTY' && (
                        <button
                            onClick={() => handleStatusUpdate('ZAKOŃCZONY')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white h-14 px-8 rounded-[2rem] font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all shadow-[0_10px_20px_rgba(16,185,129,0.2)] hover:shadow-[0_15px_30px_rgba(16,185,129,0.3)] active:scale-95"
                        >
                            <CheckCircle2 size={20} />
                            Finalizuj
                            <ChevronRight size={16} className="opacity-50" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
