'use client';

import React, { useState, useMemo } from 'react';
import { updateProjectStatus, assignProjectCaretaker } from '@/app/actions/projects';
import { Search, FolderKanban, Loader2, User, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatPLN } from '@/lib/utils';

interface Project {
    id: string;
    name: string;
    client_label: string;
    status: string;
    architect_name: string;
    staff_id: string | null;
    staff_name: string | null;
    product_value: number;
    created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
    ZGŁOSZONY: 'Zgłoszony',
    PRZYJĘTY: 'Przyjęty',
    W_REALIZACJI: 'W realizacji',
    ZAKOŃCZONY: 'Zakończony',
    NIEZREALIZOWANY: 'Niezrealizowany',
};

const STATUS_COLORS: Record<string, string> = {
    ZGŁOSZONY: 'bg-blue-900/30 text-blue-600 border-blue-800/30',
    PRZYJĘTY: 'bg-emerald-900/30 text-emerald-600 border-emerald-800/30',
    W_REALIZACJI: 'bg-amber-100/30 text-amber-600 border-amber-800/30',
    ZAKOŃCZONY: 'bg-stone-200/30 text-stone-400 border-slate-600/30',
    NIEZREALIZOWANY: 'bg-red-50 text-red-600 border-red-800/30',
};

const NEXT_STATUSES: Record<string, string[]> = {
    ZGŁOSZONY: ['PRZYJĘTY', 'NIEZREALIZOWANY'],
    PRZYJĘTY: ['W_REALIZACJI', 'NIEZREALIZOWANY'],
    W_REALIZACJI: ['ZAKOŃCZONY', 'NIEZREALIZOWANY'],
    ZAKOŃCZONY: [],
    NIEZREALIZOWANY: [],
};

function ProjectRow({ project, isAdmin, staffMembers }: { project: Project; isAdmin: boolean; staffMembers: { id: string; name: string }[] }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const nextStatuses = NEXT_STATUSES[project.status] ?? [];

    const handleConfirm = async () => {
        if (!confirming) return;
        setLoading(true);
        try {
            await updateProjectStatus(project.id, confirming);
            setConfirming(null);
            router.refresh();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignStaff = async (staffId: string) => {
        setLoading(true);
        try {
            await assignProjectCaretaker(project.id, staffId === 'NONE' ? null : staffId);
            router.refresh();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <tr className="hover:bg-black/[0.02] transition-colors">
            <td className="px-6 py-4">
                <Link
                    href={`/dashboard/admin/projects/${project.id}`}
                    className="text-sm font-black text-stone-900 hover:gold-text transition-all"
                >
                    {project.name}
                </Link>
                <p className="text-[10px] text-stone-600 mt-0.5">{project.client_label}</p>
            </td>
            <td className="px-6 py-4">
                <p className="text-[10px] font-bold text-stone-400">{project.architect_name}</p>
            </td>
            <td className="px-6 py-4">
                {isAdmin ? (
                    <div className="relative group/select">
                        <select
                            defaultValue={project.staff_id || 'NONE'}
                            onChange={(e) => handleAssignStaff(e.target.value)}
                            disabled={loading}
                            className={`appearance-none bg-black/5 border border-black/10 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-brand-primary/50 transition-all cursor-pointer pr-8 ${!project.staff_id ? 'text-orange-600' : 'text-stone-400'
                                }`}
                        >
                            <option value="NONE" className="bg-card">Brak Opiekuna</option>
                            {staffMembers.map(s => (
                                <option key={s.id} value={s.id} className="bg-card">{s.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-600 pointer-events-none" />
                    </div>
                ) : (
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${project.staff_name ? 'text-stone-400' : 'text-orange-600 opacity-60'}`}>
                        {project.staff_name || 'Brak Opiekuna'}
                    </span>
                )}
            </td>
            <td className="px-6 py-4">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${STATUS_COLORS[project.status] || 'bg-black/5 text-stone-500 border-black/10'}`}>
                    {STATUS_LABELS[project.status] || project.status}
                </span>
            </td>
            <td className="px-6 py-4 text-right">
                <span className="text-sm font-black text-stone-900">
                    {formatPLN(project.product_value)}
                    <span className="text-[9px] text-stone-500 ml-1">PLN</span>
                </span>
            </td>
            <td className="px-6 py-4 text-right text-[10px] text-stone-500 font-bold">
                {new Date(project.created_at).toLocaleDateString('pl-PL')}
            </td>
            {isAdmin && (
                <td className="px-6 py-4">
                    {confirming ? (
                        <div className="flex items-center gap-2 bg-black/5 border border-black/10 rounded-2xl px-3 py-2">
                            <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest whitespace-nowrap">
                                → {STATUS_LABELS[confirming]}?
                            </span>
                            <button
                                onClick={() => setConfirming(null)}
                                disabled={loading}
                                className="px-2 py-1 rounded-lg bg-black/5 text-stone-500 text-[9px] font-black uppercase hover:bg-black/10 transition-all disabled:opacity-40"
                            >
                                Nie
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={loading}
                                className="px-3 py-1 rounded-lg bg-brand-primary text-black text-[9px] font-black uppercase flex items-center gap-1 transition-all disabled:opacity-50"
                            >
                                {loading && <Loader2 size={10} className="animate-spin" />}
                                Tak
                            </button>
                        </div>
                    ) : nextStatuses.length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap">
                            {nextStatuses.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setConfirming(s)}
                                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${s === 'NIEZREALIZOWANY'
                                        ? 'text-red-600 border-red-900/30 bg-red-900/10 hover:bg-red-50'
                                        : 'text-emerald-600 border-emerald-900/30 bg-emerald-900/10 hover:bg-emerald-50'
                                        }`}
                                >
                                    {STATUS_LABELS[s]}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <span className="text-[9px] text-stone-700 font-bold">—</span>
                    )}
                </td>
            )}
        </tr>
    );
}

export default function AdminProjectPipeline({ projects, isAdmin, staffMembers }: { projects: Project[]; isAdmin: boolean; staffMembers: { id: string; name: string }[] }) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    const filtered = useMemo(() => {
        return projects.filter((p) => {
            const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
            const q = search.toLowerCase();
            const matchSearch = !q
                || p.name.toLowerCase().includes(q)
                || (p.architect_name || '').toLowerCase().includes(q)
                || (p.client_label || '').toLowerCase().includes(q);
            return matchStatus && matchSearch;
        });
    }, [projects, search, statusFilter]);

    return (
        <div id="project-pipeline" className="space-y-4 scroll-mt-24">
            <div className="flex flex-col gap-3">
                <div className="relative">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-600" />
                    <input
                        type="text"
                        placeholder="Szukaj projektu, architekta, klienta..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-black/5 border border-black/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-brand-primary/50 transition-all"
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setStatusFilter('ALL')}
                        className={`px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border ${statusFilter === 'ALL'
                            ? 'bg-brand-primary text-black border-brand-primary'
                            : 'bg-black/5 text-stone-500 border-black/5 hover:border-black/20 hover:text-stone-900'
                            }`}
                    >
                        Wszystkie <span className="ml-1 opacity-60">{projects.length}</span>
                    </button>
                    {Object.keys(STATUS_LABELS).map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border ${statusFilter === s
                                ? 'bg-brand-primary text-black border-brand-primary'
                                : 'bg-black/5 text-stone-500 border-black/5 hover:border-black/20 hover:text-stone-900'
                                }`}
                        >
                            {STATUS_LABELS[s]}
                            <span className="ml-1.5 opacity-60">{projects.filter((p) => p.status === s).length}</span>
                        </button>
                    ))}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="stat-card bg-card border border-dashed border-black/5 py-12 text-center">
                    <FolderKanban size={32} className="mx-auto mb-3 text-slate-800" />
                    <p className="text-[10px] text-stone-600 font-bold uppercase tracking-widest">Brak projektów spełniających kryteria</p>
                </div>
            ) : (
                <div className="stat-card bg-card p-0 overflow-hidden border border-black/5">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-black/5">
                                    <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest">Projekt</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest">Architekt</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest">Opiekun</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Wartość</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Data</th>
                                    {isAdmin && <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest">Akcje</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5">
                                {filtered.map((p) => (
                                    <ProjectRow key={p.id} project={p} isAdmin={isAdmin} staffMembers={staffMembers} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-6 py-3 bg-white/[0.01] border-t border-black/5">
                        <p className="text-[9px] text-stone-600 font-bold uppercase tracking-widest">
                            {filtered.length} z {projects.length} projektów
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
