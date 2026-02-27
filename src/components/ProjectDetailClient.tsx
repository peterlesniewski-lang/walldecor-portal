'use client';

import Link from 'next/link';
import {
    ArrowLeft,
    Calendar,
    CreditCard,
    Package,
    Image as ImageIcon,
    Box,
    Lightbulb,
    Wind,
    Layout,
    Clock,
    BadgeCheck
} from 'lucide-react';
import { formatPLN } from "@/lib/utils";
import ProjectFilesSection, { ProjectFile } from "@/components/ProjectFilesSection";

interface ProjectDetailClientProps {
    project: any;
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

// Status-driven timeline entry
interface TimelineEvent {
    label: string;
    desc: string;
    date: string | null;
    dotClass: string;
    dotInnerClass: string;
}

function buildTimeline(project: any): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    const submissionDate = new Date(project.created_at).toLocaleDateString('pl-PL');

    // Most recent event first
    if (project.status === 'NIEZREALIZOWANY') {
        events.push({
            label: 'NIEZREALIZOWANY',
            desc: 'Projekt odrzucony lub anulowany',
            date: null,
            dotClass: 'bg-red-500/20',
            dotInnerClass: 'bg-red-500'
        });
    } else if (project.status === 'ZAKOŃCZONY') {
        events.push({
            label: 'ZAKOŃCZONO',
            desc: 'Projekt zrealizowany pomyślnie',
            date: null,
            dotClass: 'bg-emerald-500/20',
            dotInnerClass: 'bg-emerald-500'
        });
    } else if (project.status === 'W_REALIZACJI') {
        events.push({
            label: 'W REALIZACJI',
            desc: 'Projekt przekazany do realizacji',
            date: null,
            dotClass: 'bg-amber-500/20',
            dotInnerClass: 'bg-amber-500'
        });
    } else if (project.status === 'PRZYJĘTY') {
        events.push({
            label: 'PRZYJĘTO',
            desc: 'Projekt przyjęty przez WallDecor',
            date: null,
            dotClass: 'bg-blue-500/20',
            dotInnerClass: 'bg-blue-500'
        });
    }

    // Submission always last
    events.push({
        label: 'ZGŁOSZONO',
        desc: 'Przesłano formularz projektu',
        date: submissionDate,
        dotClass: 'bg-brand-primary/20',
        dotInnerClass: 'bg-brand-primary'
    });

    return events;
}

export default function ProjectDetailClient({ project, initialFiles, currentUserId }: ProjectDetailClientProps) {
    const statusColors: any = {
        'ZGŁOSZONY': 'bg-stone-100 text-stone-400 border border-slate-700',
        'PRZYJĘTY': 'bg-blue-900/30 text-blue-600 border border-blue-800/50',
        'W_REALIZACJI': 'bg-amber-100/30 text-amber-500 border border-amber-800/50',
        'ZAKOŃCZONY': 'bg-emerald-900/30 text-emerald-500 border border-emerald-800/50',
        'NIEZREALIZOWANY': 'bg-red-50 text-red-600 border border-red-800/50'
    };

    const totalNet = project.items?.reduce((acc: number, item: any) => acc + (Number(item.amount_net) || 0), 0) || 0;
    const totalCommission = project.items?.reduce((acc: number, item: any) => acc + ((Number(item.amount_net) || 0) * (item.commission_rate || 0.15)), 0) || 0;

    const timeline = buildTimeline(project);

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
                    {(() => {
                        const payoutStatus = project.payout?.status ?? null;
                        const isPaid = payoutStatus === 'PAID';
                        const isInPayment = payoutStatus === 'IN_PAYMENT';
                        const isPending = payoutStatus === 'PENDING';
                        const hasNoRequest = !payoutStatus;

                        let subtitle = 'Netto do wypłaty';
                        if (project.status === 'NIEZREALIZOWANY') subtitle = 'Projekt niezrealizowany';
                        else if (isPaid) subtitle = 'Wypłacono';
                        else if (isInPayment) subtitle = 'W trakcie wypłaty';
                        else if (isPending) subtitle = 'Wniosek złożony – oczekuje';

                        return (
                            <div className="stat-card bg-gradient-to-br from-brand-primary to-brand-accent p-8 text-black shadow-[0_20px_50px_rgba(212,175,55,0.2)]">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 opacity-70 italic">Łączne Wynagrodzenie</p>
                                <h3 className="text-5xl font-black mb-2 tracking-tighter">
                                    {formatPLN(totalCommission)} <span className="text-2xl">PLN</span>
                                </h3>
                                <div className="flex items-center gap-2">
                                    {isPaid && <BadgeCheck size={14} className="opacity-70" />}
                                    {isInPayment && <Clock size={14} className="opacity-70" />}
                                    <p className="text-xs font-bold opacity-60 uppercase tracking-widest">{subtitle}</p>
                                </div>

                                <div className="mt-8 pt-6 border-t border-black/10 flex flex-col gap-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black uppercase tracking-widest">Obrót Netto</span>
                                        <span className="font-black">{formatPLN(totalNet)} PLN</span>
                                    </div>
                                </div>

                                {hasNoRequest && project.status === 'ZAKOŃCZONY' && (
                                    <Link
                                        href="/dashboard/payouts"
                                        className="w-full mt-8 py-4 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black/90 transition-all flex items-center justify-center gap-2"
                                    >
                                        <CreditCard size={14} className="text-brand-primary" />
                                        Wypłać Środki
                                    </Link>
                                )}
                            </div>
                        );
                    })()}

                    {/* Timeline / History */}
                    <div className="stat-card bg-card p-8">
                        <h3 className="text-xs font-black text-brand-primary uppercase tracking-[0.2em] mb-8">Historia Zdarzeń</h3>
                        <div className="space-y-8 relative before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-black/5">
                            {timeline.map((event, i) => (
                                <div key={i} className="relative pl-10">
                                    <div className={`absolute left-0 top-1 w-5 h-5 rounded-full ${event.dotClass} border-4 border-[#151518] flex items-center justify-center z-10`}>
                                        <div className={`w-1.5 h-1.5 ${event.dotInnerClass} rounded-full`}></div>
                                    </div>
                                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">{event.label}</p>
                                    <p className="text-sm font-bold text-stone-900">{event.desc}</p>
                                    {event.date && (
                                        <p className="text-[10px] text-stone-600 font-medium mt-1">{event.date}</p>
                                    )}
                                </div>
                            ))}
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
