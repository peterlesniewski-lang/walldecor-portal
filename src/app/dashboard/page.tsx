import Link from 'next/link';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArchitectStats, getArchitectProjects, getUserById } from "@/lib/services";
import {
    TrendingUp,
    Wallet as WalletIcon,
    Award,
    ArrowUpRight,
    Plus,
    ShieldCheck
} from 'lucide-react';
import DashboardPipeline from '@/components/DashboardPipeline';
import AddProjectButton from '@/components/AddProjectButton';
import ProfileSettingsWrapper from "@/components/ProfileSettingsWrapper";
import { formatPLN } from "@/lib/utils";

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);
    if (!session) return null;

    const stats_db = await getArchitectStats(session.user.id);
    const projects = await getArchitectProjects(session.user.id, session.user.role);
    const user = await getUserById(session.user.id);

    if (!stats_db) return null;

    const stats_ui = [
        {
            label: 'Obrót (12m)',
            value: `${formatPLN(stats_db.turnover)} PLN`,
            trend: 'Narastająco',
            icon: TrendingUp,
            color: 'text-brand-primary'
        },
        {
            label: 'Łącznie zarobione',
            value: `${formatPLN(stats_db.totalRealizedCommission)} PLN`,
            trend: 'Suma prowizji',
            icon: Award,
            color: 'text-emerald-500'
        },
        {
            label: 'Portfel Partnera',
            value: `${formatPLN(stats_db.cashbackBalance)} PLN`,
            trend: 'Aktywne',
            icon: WalletIcon,
            color: 'text-amber-500'
        }
    ];

    // Cashback expiry — nearest expiring EARN entry
    let expiryPercent = 0;
    let expiryMonthsLabel = '— mies.';
    if (stats_db.expiringSoon?.expires_at) {
        const msRemaining = new Date(stats_db.expiringSoon.expires_at).getTime() - Date.now();
        const monthsRemaining = Math.max(0, msRemaining / (1000 * 60 * 60 * 24 * 30.44));
        expiryPercent = Math.min(monthsRemaining / 12, 1);
        expiryMonthsLabel = `${Math.round(monthsRemaining)} z 12 mies.`;
    }

    // Tier progress (turnover-based thresholds in PLN)
    const tierThresholds: Record<string, { from: number; to: number }> = {
        BEGINNER: { from: 0, to: 10000 },
        SILVER: { from: 10000, to: 50000 },
        GOLD: { from: 50000, to: 120000 },
        PLATINUM: { from: 120000, to: 120000 },
    };
    const tierColors: Record<string, string> = {
        BEGINNER: 'text-stone-400',
        SILVER: 'text-stone-400',
        GOLD: 'text-brand-primary',
        PLATINUM: 'text-indigo-600',
    };
    const { from: tierFrom, to: tierTo } = tierThresholds[stats_db.tier] ?? { from: 0, to: 10000 };
    const tierProgress = stats_db.tier === 'PLATINUM'
        ? 1
        : Math.min((Number(stats_db.turnover) - tierFrom) / (tierTo - tierFrom), 1);

    return (
        <div className="space-y-12 pb-20">
            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Stat Card (Large) */}
                <div className="md:col-span-2 stat-card bg-gradient-to-br from-[#151518] to-[#0A0A0B] relative overflow-hidden group border border-black/5">
                    <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                        <TrendingUp size={160} />
                    </div>
                    <div className="relative z-10 p-4">
                        <p className="text-sm font-bold text-stone-400 mb-4">{stats_ui[0].label}</p>
                        <h3 className="text-6xl font-black mb-8 tracking-tight gold-text">
                            {stats_ui[0].value}
                        </h3>
                        <div className="inline-flex items-center px-5 py-2.5 rounded-2xl bg-black/5 border border-black/10 text-[10px] font-black text-brand-primary uppercase tracking-widest">
                            {stats_ui[0].trend}
                        </div>
                    </div>
                </div>

                {/* Cashback Progress (Circular) - Side stat */}
                <div className="stat-card bg-card flex flex-col items-center justify-center text-center border border-black/5">
                    <p className="text-[10px] font-bold text-stone-500 uppercase tracking-[0.2em] mb-8">Ważność Cashbacku</p>

                    <div className="relative w-40 h-40 mb-8">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="80" cy="80" r="70"
                                stroke="currentColor" strokeWidth="10"
                                fill="transparent"
                                className="text-stone-900/5"
                            />
                            <circle
                                cx="80" cy="80" r="70"
                                stroke="currentColor" strokeWidth="10"
                                fill="transparent"
                                strokeDasharray={439.8}
                                strokeDashoffset={439.8 * (1 - expiryPercent)}
                                className="text-brand-primary shadow-[0_0_20px_rgba(212,175,55,0.4)]"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            {stats_db.expiringSoon ? (
                                <>
                                    <span className="text-3xl font-black text-stone-900">{Math.round(expiryPercent * 100)}%</span>
                                    <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest mt-1">{expiryMonthsLabel}</span>
                                </>
                            ) : (
                                <span className="text-[9px] font-bold text-stone-600 uppercase tracking-widest px-4">Brak aktywnych środków</span>
                            )}
                        </div>
                    </div>

                    <div className="text-center">
                        <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Dostępny Portfel:</p>
                        <p className="text-xl font-black text-brand-primary">{stats_ui[2].value}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Left Column: Pipeline */}
                <div className="lg:col-span-2">
                    <DashboardPipeline projects={projects} />
                </div>

                {/* Right Column: Mini Stats & Actions */}
                <div className="space-y-10">
                    {/* Earned Commission Mini Card */}
                    <div className="stat-card bg-emerald-500/5 border border-emerald-500/10 p-8">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                <Award size={24} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest">Łącznie zarobiono</p>
                                <p className="text-2xl font-black text-stone-900">{formatPLN(stats_db.totalRealizedCommission)} PLN</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-3">
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Dostępne teraz</span>
                            <span className="text-sm font-black text-stone-900">{formatPLN(stats_db.earnedCommission)} PLN</span>
                        </div>
                        {stats_db.pendingCommission > 0 && (
                            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-black/5 border border-black/5 mb-6">
                                <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">W toku / Planowane</span>
                                <span className="text-sm font-black text-amber-500">{formatPLN(stats_db.pendingCommission)} PLN</span>
                            </div>
                        )}
                        <Link
                            href="/dashboard/wallet"
                            className="flex items-center justify-center w-full py-4 bg-emerald-500 text-black text-xs font-black uppercase tracking-widest rounded-2xl shadow-[0_8px_32px_rgba(16,185,129,0.2)] hover:bg-emerald-400 transition-all"
                        >
                            Wypłać Środki
                        </Link>
                    </div>

                    {/* Quick Registration Actions */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 mb-4 px-2">
                            <Plus size={16} className="text-brand-primary" />
                            <h3 className="text-xs font-black text-stone-500 uppercase tracking-widest text-[10px]">Szybkie Akcje</h3>
                        </div>

                        <AddProjectButton userRole={session.user.role} />

                        <ProfileSettingsWrapper user={user} />
                    </div>

                    {/* Tier Progress */}
                    <div className="stat-card bg-card p-8 border border-black/5">
                        <div className="flex items-center gap-3 mb-6">
                            <ShieldCheck size={16} className={tierColors[stats_db.tier] ?? 'text-stone-400'} />
                            <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Status Partnera</p>
                        </div>

                        <div className="flex items-baseline justify-between mb-4">
                            <span className={`text-lg font-black uppercase tracking-wider ${tierColors[stats_db.tier] ?? 'text-stone-400'}`}>
                                {stats_db.tier}
                            </span>
                            {stats_db.tier !== 'PLATINUM' && (
                                <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                                    → {stats_db.nextTier}
                                </span>
                            )}
                        </div>

                        <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden mb-3">
                            <div
                                className={`h-full rounded-full transition-all ${tierColors[stats_db.tier] ?? 'bg-slate-400'} bg-current`}
                                style={{ width: `${Math.round(tierProgress * 100)}%` }}
                            />
                        </div>

                        <p className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                            {stats_db.tier === 'PLATINUM'
                                ? 'Osiągnięto maksymalny poziom'
                                : `${formatPLN(stats_db.turnoverToNext)} PLN do poziomu ${stats_db.nextTier}`}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
