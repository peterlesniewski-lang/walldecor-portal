'use client';

import React, { useState } from 'react';
import {
    CheckCircle2,
    XCircle,
    ChevronRight,
    Building2,
    Loader2
} from 'lucide-react';
import { updateProjectStatus } from '@/app/actions/projects';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatPLN } from '@/lib/utils';

interface AdminProjectListItemProps {
    project: any;
}

export default function AdminProjectListItem({ project }: AdminProjectListItemProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    // null | 'PRZYJĘTY' | 'NIEZREALIZOWANY'
    const [confirming, setConfirming] = useState<string | null>(null);

    const requestConfirm = (status: string) => {
        setConfirming(status);
    };

    const handleConfirm = async () => {
        if (!confirming) return;
        setLoading(true);
        try {
            await updateProjectStatus(project.id, confirming);
            router.refresh();
        } catch (err: any) {
            console.error(err);
            setConfirming(null);
        } finally {
            setLoading(false);
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
                            <Link
                                href={`/dashboard/admin/projects/${project.id}`}
                                className="text-xl font-black text-stone-900 hover:gold-text transition-all leading-none"
                            >
                                {project.name}
                            </Link>
                            <span className="text-[9px] bg-stone-100 text-stone-500 px-2 py-1 rounded-lg uppercase font-black tracking-widest border border-slate-700/50 max-w-[140px] truncate">
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

                <div className="flex items-center gap-3 ml-auto md:ml-0">
                    {confirming ? (
                        /* Inline confirmation row */
                        <div className="flex items-center gap-3 bg-black/5 border border-black/10 rounded-[2rem] px-5 py-3">
                            <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest whitespace-nowrap">
                                {confirming === 'PRZYJĘTY' ? 'Zaakceptować?' : 'Odrzucić?'}
                            </span>
                            <button
                                onClick={() => setConfirming(null)}
                                disabled={loading}
                                className="px-4 py-2 rounded-xl bg-black/5 text-stone-400 text-[10px] font-black uppercase tracking-widest hover:bg-black/10 transition-all disabled:opacity-40"
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={loading}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50 ${confirming === 'PRZYJĘTY'
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                    : 'bg-red-700 hover:bg-red-600 text-white'
                                    }`}
                            >
                                {loading
                                    ? <Loader2 size={14} className="animate-spin" />
                                    : confirming === 'PRZYJĘTY'
                                        ? <CheckCircle2 size={14} />
                                        : <XCircle size={14} />
                                }
                                {confirming === 'PRZYJĘTY' ? 'Tak, akceptuj' : 'Tak, odrzuć'}
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => requestConfirm('NIEZREALIZOWANY')}
                                className="p-3.5 text-stone-700 hover:text-red-600 hover:bg-red-900/10 rounded-2xl transition-all border border-transparent hover:border-red-900/30"
                                title="Odrzuć"
                            >
                                <XCircle size={22} />
                            </button>
                            <button
                                onClick={() => requestConfirm('PRZYJĘTY')}
                                className="bg-blue-600 hover:bg-blue-500 text-white h-14 px-8 rounded-[2rem] font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all shadow-[0_10px_20px_rgba(37,99,235,0.2)] hover:shadow-[0_15px_30px_rgba(37,99,235,0.3)] active:scale-95"
                            >
                                <CheckCircle2 size={20} />
                                Akceptuj
                                <ChevronRight size={16} className="opacity-50" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
