'use client';

import React, { useState } from 'react';
import {
    Plus,
    Search,
    Filter,
    MoreVertical,
    FolderKanban,
    FileText
} from 'lucide-react';
import ProjectSubmissionModal from './ProjectSubmissionModal';
import { formatPLN } from '@/lib/utils';

interface ProjectListClientProps {
    initialProjects: any[];
    userId: string;
    userRole?: string;
}

export default function ProjectListClient({ initialProjects, userId, userRole }: ProjectListClientProps) {
    const isAdmin = userRole === 'ADMIN' || userRole === 'STAFF';
    const [activeFilter, setActiveFilter] = useState('WSZYSTKIE');
    const [searchTerm, setSearchTerm] = useState('');

    const statusColors: any = {
        'ZGŁOSZONY': 'bg-stone-100 text-stone-400 border border-slate-700',
        'PRZYJĘTY': 'bg-blue-900/30 text-blue-600 border border-blue-800/50',
        'W_REALIZACJI': 'bg-amber-100/30 text-amber-500 border border-amber-800/50',
        'ZAKOŃCZONY': 'bg-emerald-900/30 text-emerald-500 border border-emerald-800/50',
        'NIEZREALIZOWANY': 'bg-red-50 text-red-600 border border-red-800/50'
    };

    const filters = ['WSZYSTKIE', 'ZGŁOSZONY', 'PRZYJĘTY', 'W_REALIZACJI', 'ZAKOŃCZONY'];

    const filteredProjects = initialProjects.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.client_label.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = activeFilter === 'WSZYSTKIE' || p.status === activeFilter;
        return matchesSearch && matchesFilter;
    });

    const [expandedId, setExpandedId] = useState<string | null>(null);

    return (
        <div className="space-y-10">
            <div className="flex flex-col gap-8">
                {/* Top Actions */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-card border border-black/5 flex items-center justify-center text-brand-primary">
                            <FolderKanban size={24} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-stone-500 uppercase tracking-widest leading-none mb-1">PROJEKTY</h2>
                            <h1 className="text-3xl font-black text-stone-900 leading-none">Lista Projektów</h1>
                        </div>
                    </div>
                </div>

                {/* Sub-header Stats (Stitch Style) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="stat-card bg-card py-6">
                        <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-3">Suma prowizji</p>
                        <div className="flex items-end gap-3">
                            <h3 className="text-3xl font-black text-stone-900 leading-none">
                                {formatPLN(initialProjects.reduce((acc, p) => acc + (Number(p.commission_amount) || 0), 0))} PLN
                            </h3>
                            <span className="text-emerald-500 text-xs font-bold mb-1">↗ +5.2% vs m-c</span>
                        </div>
                    </div>
                    <div className="stat-card bg-card py-6">
                        <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-3">Aktywne projekty</p>
                        <div className="flex items-end gap-3">
                            <h3 className="text-3xl font-black text-stone-900 leading-none">
                                {initialProjects.filter(p => p.status !== 'ZAKOŃCZONY' && p.status !== 'NIEZREALIZOWANY').length}
                            </h3>
                            <span className="text-brand-primary text-xs font-bold mb-1">Status: W realizacji</span>
                        </div>
                    </div>
                </div>

                {/* Search and Filters */}
                <div className="space-y-6">
                    <div className="relative group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-stone-500 group-focus-within:text-brand-primary transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Szukaj projektu lub klienta..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-16 pr-8 py-5 bg-card border border-black/5 rounded-[2rem] text-stone-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-semibold"
                        />
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {filters.map(f => (
                            <button
                                key={f}
                                onClick={() => setActiveFilter(f)}
                                className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeFilter === f
                                    ? 'bg-brand-primary text-black shadow-[0_8px_32px_rgba(212,175,55,0.2)]'
                                    : 'bg-black/5 text-stone-400 border border-black/5 hover:bg-black/10 hover:text-stone-900'
                                    }`}
                            >
                                {f === 'WSZYSTKIE' ? 'Wszystkie' : f.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Project Cards List */}
            <div className="space-y-4">
                {filteredProjects.length > 0 ? (
                    filteredProjects.map((project: any) => (
                        <div
                            key={project.id}
                            className={`stat-card bg-card group hover:bg-stone-50 transition-all cursor-pointer overflow-hidden ${expandedId === project.id ? 'ring-1 ring-brand-primary/30' : ''}`}
                            onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
                        >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-xl font-black text-stone-900 group-hover:gold-text transition-colors">
                                            {project.name}
                                        </h3>
                                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${statusColors[project.status]}`}>
                                            {project.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <p className="text-sm font-bold text-stone-500">Klient: {project.client_label}</p>
                                    {isAdmin && project.architect_name && (
                                        <p className="text-xs font-bold text-brand-primary/70">Architekt: {project.architect_name}</p>
                                    )}
                                </div>

                                <div className="flex items-center gap-12">
                                    <div className="flex items-center gap-4">
                                        {project.invoice_url && (
                                            <a
                                                href={project.invoice_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all group/invoice"
                                                title="Pobierz fakturę"
                                            >
                                                <FileText size={20} className="group-hover/invoice:scale-110 transition-transform" />
                                            </a>
                                        )}
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">WARTOŚĆ</p>
                                            <p className="text-xl font-black text-stone-400">
                                                {formatPLN(project.total_value)} PLN
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">
                                                {project.status === 'ZAKOŃCZONY' ? 'PROWIZJA ZAROBIONA' : 'PROWIZJA PLANOWANA'}
                                            </p>
                                            <p className="text-2xl font-black text-stone-900 gold-text">
                                                {formatPLN(project.commission_amount)} PLN
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs font-black text-brand-primary uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                        Szczegóły
                                        <svg
                                            className={`transition-transform duration-300 ${expandedId === project.id ? 'rotate-90' : ''}`}
                                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                                        >
                                            <path d="m9 18 6-6-6-6" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Accordion Detail Content */}
                            {expandedId === project.id && (
                                <div className="mt-8 pt-6 border-t border-black/5 space-y-6 animate-in slide-in-from-top-2 duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Items List */}
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-black text-stone-600 uppercase tracking-widest">Pozycje Projektu</p>
                                            <div className="space-y-3">
                                                {project.items?.map((item: any) => {
                                                    const comm = project.commissions?.find((c: any) => c.project_item_id === item.id);
                                                    return (
                                                    <div key={item.id} className="flex justify-between items-start p-3 bg-black/[0.02] border border-black/5 rounded-xl gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-black text-stone-900">{item.category}</p>
                                                            {item.description && <p className="text-[9px] text-stone-500 font-bold">{item.description}</p>}
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-xs font-black text-stone-400">{formatPLN(item.amount_net)} PLN</p>
                                                            {comm ? (
                                                                <p className="text-[9px] font-black text-emerald-500 mt-0.5">+{formatPLN(comm.amount_net)} prowizji</p>
                                                            ) : (
                                                                <p className="text-[9px] font-bold text-stone-300 mt-0.5" title="Ta pozycja nie podlega naliczeniu prowizji">bez prowizji</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    );
                                                })}
                                                {(!project.items || project.items.length === 0) && (
                                                    <p className="text-[10px] text-stone-600 font-bold italic">Brak wyszczególnionych pozycji.</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Commission Structure */}
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-black text-stone-600 uppercase tracking-widest">Twoja Prowizja</p>
                                            <div className="space-y-3">
                                                {project.commissions?.map((comm: any) => (
                                                    <div key={comm.id} className="flex justify-between items-center p-3 bg-black/[0.02] border border-black/5 rounded-xl">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-1.5 h-1.5 rounded-full ${comm.status === 'EARNED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                            <p className="text-xs font-black text-stone-900">
                                                                Prowizja ({
                                                                    comm.status === 'EARNED' ? 'ZAROBIONA' :
                                                                        comm.status === 'PENDING' ? 'PLANOWANA' :
                                                                            comm.status === 'IN_PAYMENT' ? 'W WYPŁACIE' :
                                                                                comm.status === 'PAID' ? 'WYPŁACONA' : comm.status
                                                                })
                                                            </p>
                                                        </div>
                                                        <p className="text-xs font-black text-emerald-500">{formatPLN(comm.amount_net)} PLN</p>
                                                    </div>
                                                ))}
                                                {(!project.commissions || project.commissions.length === 0) && (
                                                    <p className="text-[10px] text-stone-600 font-bold italic">Prowizja zostanie naliczona po akceptacji projektu.</p>
                                                )}

                                                <div className="pt-2 flex justify-between items-center border-t border-black/5 mt-2">
                                                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Suma prowizji</p>
                                                    <p className="text-sm font-black text-stone-900">{formatPLN(project.commission_amount)} PLN</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="stat-card bg-card py-20 text-center">
                        <div className="w-20 h-20 bg-black/5 rounded-3xl flex items-center justify-center text-stone-600 mx-auto mb-6 border border-black/10">
                            <FolderKanban size={40} />
                        </div>
                        <h3 className="text-stone-900 font-black text-xl mb-2">Brak projektów</h3>
                        <p className="text-stone-500 font-medium mb-8 max-w-xs mx-auto text-sm">Nie znaleziono żadnych projektów spełniających Twoje kryteria.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
