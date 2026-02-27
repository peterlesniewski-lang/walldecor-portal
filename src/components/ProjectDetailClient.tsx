'use client';

import React from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Calendar,
    User,
    CreditCard,
    Package,
    Image as ImageIcon,
    Box,
    Lightbulb,
    Wind,
    Layout,
    Zap,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { applyCashbackToProject } from "@/app/actions/projects";
import { formatPLN } from "@/lib/utils";
import ProjectFilesSection, { ProjectFile } from "@/components/ProjectFilesSection";

interface ProjectDetailClientProps {
    project: any;
    availableCashback: number;
    initialFiles: ProjectFile[];
    currentUserId: string;
}

const categoryIcons: any = {
    'Tapety': ImageIcon,
    'Sztukateria': Layout,
    'Meble': Box,
    'Oświetlenie': Lightbulb,
    'Tekstylia': Wind,
    'Inne': Package
};

export default function ProjectDetailClient({ project, availableCashback, initialFiles, currentUserId }: ProjectDetailClientProps) {
    const [amount, setAmount] = React.useState('');
    const [isPending, startTransition] = React.useTransition();
    const [status, setStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = React.useState('');

    const handleApply = async () => {
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) return;

        setStatus('idle');
        startTransition(async () => {
            try {
                const res = await applyCashbackToProject(project.id, val);
                if (res.success) {
                    setStatus('success');
                    setAmount('');
                }
            } catch (err: any) {
                setStatus('error');
                setErrorMsg(err.message || 'Wystąpił błąd');
            }
        });
    };

    const statusColors: any = {
        'ZGŁOSZONY': 'bg-stone-100 text-stone-400 border border-slate-700',
        'PRZYJĘTY': 'bg-blue-900/30 text-blue-600 border border-blue-800/50',
        'W_REALIZACJI': 'bg-amber-100/30 text-amber-500 border border-amber-800/50',
        'ZAKOŃCZONY': 'bg-emerald-900/30 text-emerald-500 border border-emerald-800/50',
        'NIEZREALIZOWANY': 'bg-red-50 text-red-600 border border-red-800/50'
    };

    const totalNet = project.items?.reduce((acc: number, item: any) => acc + (Number(item.amount_net) || 0), 0) || 0;
    const totalCommission = project.items?.reduce((acc: number, item: any) => acc + ((Number(item.amount_net) || 0) * (item.commission_rate || 0.15)), 0) || 0;

    return (
        <div className="space-y-10 pb-20">
            {/* Navigation & Title */}
            <div className="flex flex-col gap-6">
                <Link
                    href="/dashboard/projects"
                    className="flex items-center gap-2 text-xs font-black text-stone-500 uppercase tracking-widest hover:text-stone-900 transition-colors w-fit"
                >
                    <ArrowLeft size={16} />
                    Wróć do listy
                </Link>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-4 mb-3">
                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${statusColors[project.status]}`}>
                                {project.status.replace('_', ' ')}
                            </span>
                            <span className="text-stone-600 font-bold text-xs uppercase tracking-widest">ID: {project.id}</span>
                        </div>
                        <h1 className="text-4xl font-black text-stone-900 leading-none tracking-tight">{project.name}</h1>
                        <p className="text-stone-500 mt-2 font-bold text-sm uppercase tracking-widest">Klient: {project.client_label}</p>
                    </div>

                    <div className="flex gap-4">
                        <div className="stat-card bg-card py-4 px-6 border border-black/5">
                            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">DATA ZGŁOSZENIA</p>
                            <div className="flex items-center gap-2 text-stone-900 font-black">
                                <Calendar size={14} className="text-brand-primary" />
                                {new Date(project.created_at).toLocaleDateString('pl-PL')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Items List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em]">Elementy Projektu</h3>
                        <Package size={16} className="text-brand-primary" />
                    </div>

                    <div className="space-y-4">
                        {project.items && project.items.length > 0 ? (
                            project.items.map((item: any) => {
                                const Icon = categoryIcons[item.category] || Package;
                                return (
                                    <div key={item.id} className="stat-card bg-card p-6 group hover:bg-stone-50 transition-all">
                                        <div className="flex items-start gap-6">
                                            <div className="w-14 h-14 rounded-2xl bg-black/5 border border-black/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                                                <Icon size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="text-lg font-black text-stone-900">{item.category}</h4>
                                                    <div className="text-right">
                                                        <p className="text-sm font-black text-stone-900">{formatPLN(item.amount_net)} PLN</p>
                                                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Netto</p>
                                                    </div>
                                                </div>
                                                <p className="text-sm font-bold text-stone-500 max-w-md">{item.description || 'Brak opisu elementu.'}</p>
                                                <div className="mt-4 pt-4 border-t border-black/5 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full"></div>
                                                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Prowizja {(item.commission_rate * 100).toFixed(0)}%</span>
                                                    </div>
                                                    <p className="text-sm font-black text-brand-primary">
                                                        {formatPLN(Number(item.amount_net) * item.commission_rate)} PLN
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="stat-card bg-card py-12 text-center border-dashed border-black/10">
                                <p className="text-stone-500 font-bold uppercase tracking-widest text-xs">Brak zdefiniowanych elementów</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Summary Sidebar */}
                <div className="space-y-8">
                    <div className="stat-card bg-gradient-to-br from-brand-primary to-brand-accent p-8 text-black shadow-[0_20px_50px_rgba(212,175,55,0.2)]">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 opacity-70 italic">Łączne Wynagrodzenie</p>
                        <h3 className="text-5xl font-black mb-2 tracking-tighter">
                            {formatPLN(totalCommission)} <span className="text-2xl">PLN</span>
                        </h3>
                        <p className="text-xs font-bold opacity-60 uppercase tracking-widest">Netto do wypłaty</p>

                        <div className="mt-8 pt-6 border-t border-black/10 flex flex-col gap-4">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest">Obrót Netto</span>
                                <span className="font-black">{formatPLN(totalNet)} PLN</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest">Bonus (Tier)</span>
                                <span className="font-black">+ 0 PLN</span>
                            </div>
                        </div>

                        <button className="w-full mt-8 py-4 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black/90 transition-all flex items-center justify-center gap-2">
                            <CreditCard size={14} className="text-brand-primary" />
                            Wypłać Środki
                        </button>
                    </div>

                    {/* Pay with Cashback Section */}
                    {project.status !== 'ZAKOŃCZONY' && project.status !== 'NIEZREALIZOWANY' && (
                        <div className="stat-card bg-card p-8 border border-black/5 space-y-6">
                            <div className="flex items-center gap-3">
                                <Zap size={16} className="text-brand-primary" />
                                <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Zapłać Cashbackiem</h3>
                            </div>

                            <div className="p-4 rounded-2xl bg-black/5 border border-black/5">
                                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Dostępne środki</p>
                                <p className="text-xl font-black text-stone-900">{formatPLN(availableCashback)} PLN</p>
                            </div>

                            {status === 'success' ? (
                                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-600">
                                    <CheckCircle2 size={18} />
                                    <p className="text-xs font-bold">Zastosowano pomyślnie!</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="Kwota do użycia"
                                            className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder:text-stone-600 focus:outline-none focus:border-brand-primary/50 transition-colors"
                                            disabled={isPending}
                                        />
                                        <span className="absolute right-4 top-3.5 text-[10px] font-black text-stone-700 uppercase">PLN</span>
                                    </div>

                                    {status === 'error' && (
                                        <div className="flex items-center gap-2 text-red-600 text-[10px] font-bold">
                                            <AlertCircle size={14} />
                                            {errorMsg}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleApply}
                                        disabled={isPending || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > availableCashback}
                                        className="w-full py-4 bg-black/5 hover:bg-black/10 disabled:opacity-30 disabled:hover:bg-black/5 border border-black/10 rounded-2xl text-[10px] font-black text-stone-900 uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        {isPending ? 'Przetwarzanie...' : 'Zastosuj Cashback'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Timeline / History */}
                    <div className="stat-card bg-card p-8">
                        <h3 className="text-xs font-black text-brand-primary uppercase tracking-[0.2em] mb-8">Historia Zdarzeń</h3>
                        <div className="space-y-8 relative before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-black/5">
                            <div className="relative pl-10">
                                <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-emerald-500/20 border-4 border-[#151518] flex items-center justify-center z-10">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                                </div>
                                <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">ZATWIERDZONO</p>
                                <p className="text-sm font-bold text-stone-900">Projekt zaakceptowany do realizacji</p>
                                <p className="text-[10px] text-stone-600 font-medium mt-1">Dziś, 12:45</p>
                            </div>
                            <div className="relative pl-10">
                                <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-brand-primary/20 border-4 border-[#151518] flex items-center justify-center z-10">
                                    <div className="w-1.5 h-1.5 bg-brand-primary rounded-full"></div>
                                </div>
                                <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">ZGŁOSZONO</p>
                                <p className="text-sm font-bold text-stone-900 font-medium opacity-60">Przesłano formularz projektu</p>
                                <p className="text-[10px] text-stone-600 font-medium mt-1">2 dni temu</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <ProjectFilesSection
                projectId={project.id}
                currentUserId={currentUserId}
                initialFiles={initialFiles}
                isAdmin={false}
            />
        </div>
    );
}
