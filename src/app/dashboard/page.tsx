import Link from 'next/link';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArchitectStats, getArchitectProjects, getUserById } from "@/lib/services";
import {
    Wallet as WalletIcon,
    ArrowRight,
    BadgePercent,
    BarChart3,
    CheckCircle2,
    CircleHelp,
    CreditCard,
    FileText,
} from 'lucide-react';
import DashboardPipeline from '@/components/DashboardPipeline';
import AddProjectButton from '@/components/AddProjectButton';
import ProfileSettingsWrapper from "@/components/ProfileSettingsWrapper";
import { formatPLN } from "@/lib/utils";

interface ArchitectDashboardProject {
    id: string;
    name: string;
    client_label: string;
    status: string;
    total_value?: number | string | null;
    commission_amount?: number | string | null;
    created_at: string;
}

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);
    if (!session) return null;

    const stats_db = await getArchitectStats(session.user.id);
    const projects = await getArchitectProjects(session.user.id, session.user.role);
    const user = await getUserById(session.user.id);

    if (!stats_db) return null;

    const tierThresholds: Record<string, { from: number; to: number }> = {
        BEGINNER: { from: 0, to: 10000 },
        SILVER: { from: 10000, to: 50000 },
        GOLD: { from: 50000, to: 120000 },
        PLATINUM: { from: 120000, to: 120000 },
    };
    const tierColors: Record<string, string> = {
        BEGINNER: 'text-stone-500',
        SILVER: 'text-stone-500',
        GOLD: 'text-brand-primary',
        PLATINUM: 'text-indigo-600',
    };
    const { from: tierFrom, to: tierTo } = tierThresholds[stats_db.tier] ?? { from: 0, to: 10000 };
    const tierProgress = stats_db.tier === 'PLATINUM'
        ? 1
        : Math.min((Number(stats_db.turnover) - tierFrom) / Math.max(tierTo - tierFrom, 1), 1);
    const activeProjectRatio = Math.min(Number(stats_db.activeProjects) / 12, 1);

    const nextSteps = [
        {
            href: '/dashboard/wallet',
            icon: CheckCircle2,
            label: 'Uzupełnij profil',
            text: 'Dane firmy i preferencje płatności.',
            done: Boolean(user?.bank_account),
        },
        {
            href: '/dashboard/wallet',
            icon: FileText,
            label: 'Dodaj fakturę PDF',
            text: 'Wgraj fakturę przy wniosku wypłaty.',
            done: Number(stats_db.earnedCommission) < 100,
        },
        {
            href: '/dashboard/projects',
            icon: BarChart3,
            label: 'Sprawdź status projektu',
            text: 'Zobacz postęp i zarobioną prowizję.',
            done: false,
        },
        {
            href: '/dashboard/help',
            icon: CreditCard,
            label: 'Sprawdź cashback',
            text: 'Zasady 2% i wymiana w portfelu.',
            done: false,
        },
    ];

    const walletHistory = (projects as ArchitectDashboardProject[])
        .filter((project) => Number(project.commission_amount || 0) > 0 || project.status === 'ZAKOŃCZONY')
        .slice(0, 5);

    const commissionTiers = [
        { id: 'SILVER', name: 'Silver', rate: '7%', threshold: 'od 10 000 PLN', tone: 'border-stone-200 bg-stone-50 text-stone-700' },
        { id: 'GOLD', name: 'Gold', rate: '10%', threshold: 'od 50 000 PLN', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
        { id: 'PLATINUM', name: 'Platinum', rate: '14%', threshold: 'od 120 000 PLN', tone: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
    ];
    const tierProgressLabel = stats_db.tier === 'PLATINUM'
        ? 'Masz najwyższy poziom prowizji.'
        : `${formatPLN(stats_db.turnoverToNext)} PLN do poziomu ${stats_db.nextTier}`;

    return (
        <div data-testid="architect-dashboard" className="grid grid-cols-1 gap-8 pb-20 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <main className="min-w-0 space-y-6">
                <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-stone-700">Prowizja dostępna</p>
                                <p className="mt-3 text-4xl font-black tracking-tight text-emerald-700">{formatPLN(stats_db.earnedCommission)} PLN</p>
                                <p className="mt-2 text-xs font-medium text-stone-500">Do wypłaty od 100 PLN</p>
                            </div>
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-emerald-700">
                                <WalletIcon size={26} />
                            </div>
                        </div>
                        <Link href="/dashboard/wallet" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-800 transition-colors hover:bg-emerald-100">
                            Wypłać prowizję <ArrowRight size={14} />
                        </Link>
                    </div>

                    <div className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-stone-700">Cashback</p>
                                <p className="mt-3 text-4xl font-black tracking-tight text-blue-700">{formatPLN(stats_db.cashbackBalance)} PLN</p>
                                <p className="mt-2 text-xs font-medium text-stone-500">Dostępne środki na karty rabatowe</p>
                            </div>
                            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-700">
                                <CreditCard size={26} />
                            </div>
                        </div>
                        <Link href="/dashboard/wallet" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-800 transition-colors hover:bg-blue-100">
                            Wymień na kartę <ArrowRight size={14} />
                        </Link>
                    </div>

                    <div className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-stone-700">Aktywne projekty</p>
                                <p className="mt-3 text-4xl font-black tracking-tight text-stone-950">{stats_db.activeProjects}</p>
                                <p className="mt-2 text-xs font-medium text-stone-500">W realizacji i obsłudze</p>
                            </div>
                            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-700">
                                <BarChart3 size={26} />
                            </div>
                        </div>
                        <div className="mt-5 flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-blue-100">
                                <div className="h-full rounded-full bg-blue-700" style={{ width: `${Math.round(activeProjectRatio * 100)}%` }} />
                            </div>
                            <span className="text-xs font-black text-stone-500">{Math.round(activeProjectRatio * 100)}%</span>
                        </div>
                    </div>
                </section>

                <DashboardPipeline projects={projects} />

                <section className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-black/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-lg font-black text-stone-900">Historia portfela</h3>
                            <p className="text-xs font-medium text-stone-500">Ostatnie projekty z prowizją i status rozliczenia.</p>
                        </div>
                        <Link href="/dashboard/wallet" className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-stone-700 transition-all hover:border-brand-primary/40 hover:text-brand-primary">
                            Otwórz portfel <ArrowRight size={14} />
                        </Link>
                    </div>
                    <div className="grid grid-cols-1 divide-y divide-black/10 md:grid-cols-3 md:divide-x md:divide-y-0">
                        <div className="p-5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">Prowizja łącznie</p>
                            <p className="mt-2 text-2xl font-black text-stone-900">{formatPLN(stats_db.totalRealizedCommission)} PLN</p>
                        </div>
                        <div className="p-5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">W toku / planowane</p>
                            <p className="mt-2 text-2xl font-black text-amber-700">{formatPLN(stats_db.pendingCommission)} PLN</p>
                        </div>
                        <div className="p-5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">Obrót 12m</p>
                            <p className="mt-2 text-2xl font-black text-stone-900">{formatPLN(stats_db.turnover)} PLN</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto border-t border-black/10">
                        <table className="w-full text-left">
                            <thead className="bg-stone-50">
                                <tr>
                                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-stone-500">Projekt</th>
                                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-stone-500">Status</th>
                                    <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-stone-500">Prowizja</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5">
                                {walletHistory.length > 0 ? walletHistory.map((project) => (
                                    <tr key={project.id}>
                                        <td className="px-5 py-3">
                                            <Link href={`/dashboard/projects/${project.id}`} className="text-sm font-black text-stone-900 hover:text-brand-primary">{project.name}</Link>
                                            <p className="text-[10px] font-medium text-stone-500">{new Date(project.created_at).toLocaleDateString('pl-PL')}</p>
                                        </td>
                                        <td className="px-5 py-3 text-xs font-bold text-stone-600">{project.status}</td>
                                        <td className="px-5 py-3 text-right text-sm font-black text-emerald-700">+ {formatPLN(project.commission_amount || 0)} PLN</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={3} className="px-5 py-8 text-center text-xs font-bold text-stone-400">
                                            Brak rozliczonych projektów w historii portfela.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            <aside className="space-y-5">
                <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                    <h3 className="mb-5 text-lg font-black text-stone-900">Następne kroki</h3>
                    {nextSteps.map((item, index) => (
                        <Link key={item.label} href={item.href} className="mb-3 flex items-center gap-4 rounded-lg border border-black/10 bg-white px-4 py-3 transition-all hover:border-brand-primary/40 hover:bg-stone-50">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-black ${item.done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-stone-200 bg-stone-50 text-stone-500'}`}>
                                {item.done ? <item.icon size={16} /> : index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-stone-900">{item.label}</p>
                                <p className="text-xs font-medium text-stone-500">{item.text}</p>
                            </div>
                            <ArrowRight size={16} className="shrink-0 text-stone-400" />
                        </Link>
                    ))}
                </section>

                <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <CircleHelp size={18} className="text-amber-700" />
                        <h3 className="text-lg font-black text-stone-900">Jak to działa?</h3>
                    </div>
                    <p className="text-sm font-medium leading-relaxed text-stone-700">
                        Projekty przechodzą przez kolejne etapy. Prowizję otrzymujesz po zakończeniu projektu i zaksięgowaniu płatności przez klienta.
                    </p>
                    <p className="mt-4 text-sm font-bold text-stone-800">Minimalna kwota wypłaty prowizji to 100 PLN.</p>
                </section>

                <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-black text-stone-900">Poziomy prowizji</h3>
                        <BadgePercent size={18} className="text-brand-primary" />
                    </div>
                    <div className="mb-4 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">Twój poziom</p>
                                <p className={`mt-1 text-xl font-black uppercase ${tierColors[stats_db.tier] ?? 'text-stone-700'}`}>{stats_db.tier}</p>
                            </div>
                            <p className="max-w-[8.5rem] text-right text-xs font-bold leading-snug text-stone-700">{tierProgressLabel}</p>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                            <div className="h-full rounded-full bg-brand-primary" style={{ width: `${Math.round(tierProgress * 100)}%` }} />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {commissionTiers.map((tier) => (
                            <div key={tier.name} className={`rounded-lg border p-3 ${tier.tone} ${stats_db.tier === tier.id ? 'ring-2 ring-brand-primary ring-offset-2' : ''}`}>
                                <div className="flex min-h-9 flex-col justify-between gap-1">
                                    <p className="text-[9px] font-black uppercase tracking-widest">{tier.name}</p>
                                    {stats_db.tier === tier.id && <p className="text-[8px] font-black uppercase tracking-widest text-brand-primary">Twój</p>}
                                </div>
                                <p className="mt-2 text-xl font-black">{tier.rate}</p>
                                <p className="mt-1 text-[10px] font-bold leading-tight opacity-80">{tier.threshold}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <p className="text-xs font-black uppercase tracking-widest text-blue-800">Cashback 2%</p>
                        <p className="mt-1 text-xs font-medium leading-relaxed text-blue-900">
                            Nalicza się osobno od wartości netto produktów po zakończeniu projektu. W portfelu wymienisz go na kartę lub kod rabatowy.
                        </p>
                    </div>
                    <Link href="/dashboard/wallet" className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand-primary">
                        Przejdź do portfela <ArrowRight size={14} />
                    </Link>
                </section>

                <div className="space-y-3">
                    <AddProjectButton userRole={session.user.role} />
                    <ProfileSettingsWrapper user={user} />
                </div>
            </aside>
        </div>
    );
}
