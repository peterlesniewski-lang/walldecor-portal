import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import {
    Users,
    Search,
    Filter,
    ShieldCheck,
    Wallet,
    ArrowLeft,
    Plus,
    CreditCard
} from 'lucide-react';
import Link from 'next/link';
import ArchitectList from '@/components/ArchitectList';
import AddArchitectButton from "@/components/AddArchitectButton";
import { getAdminMetrics } from "@/lib/services";
import { getPendingRedemptions } from "@/app/actions/cashback";
import { formatPLN } from "@/lib/utils";

export default async function AdminArchitectsPage({
    searchParams
}: {
    searchParams: Promise<{ q?: string, tier?: string, status?: string }>
}) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return <div className="p-8 text-stone-900 font-black uppercase tracking-widest bg-red-50 border border-red-800/30 rounded-2xl">Brak uprawnień.</div>;
    }

    const { q, tier, status } = await searchParams;

    // 1. Fetch Architects with project counts and current balances
    let sql = `
        SELECT 
            u.id, u.name, u.email, u.studio_name, u.tier_override,
            COUNT(DISTINCT CASE WHEN p.status != 'NIEZREALIZOWANY' THEN p.id END) as projects_count,
            COALESCE((
                SELECT SUM(i.amount_net)
                FROM project_items i
                JOIN projects p ON i.project_id = p.id
                WHERE p.owner_id = u.id AND i.type = 'PRODUCT' AND p.status != 'NIEZREALIZOWANY'
            ), 0) as turnover,
            COALESCE((
                SELECT SUM(CASE 
                    WHEN t.type = 'EARN' AND (t.expires_at IS NULL OR t.expires_at > datetime('now')) THEN t.amount
                    WHEN t.type = 'ADJUST' THEN t.amount
                    WHEN t.type NOT IN ('EARN', 'ADJUST') THEN -t.amount
                    ELSE 0 
                END)
                FROM wallet_transactions t
                WHERE t.user_id = u.id
            ), 0) as balance,
            (SELECT COUNT(*) FROM cashback_redemptions WHERE user_id = u.id AND status = 'PENDING') as pending_redemptions
        FROM users u
        LEFT JOIN projects p ON u.id = p.owner_id
        WHERE u.role = 'ARCHI'
    `;

    const params: any[] = [];
    if (q) {
        sql += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.studio_name LIKE ?) `;
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    sql += ` GROUP BY u.id ORDER BY u.name ASC`;

    let architects = await query<any>(sql, params);

    // Dynamic Tier Calculation
    const getTier = (a: any) => {
        if (a.tier_override) return a.tier_override;
        const t = Number(a.turnover);
        if (t >= 120000) return 'PLATINUM';
        if (t >= 50000) return 'GOLD';
        if (t >= 10000) return 'SILVER';
        return 'BEGINNER';
    };

    // 2. Client-side filtering (Tier/Status)
    if (tier) {
        architects = architects.filter((a: any) => getTier(a) === tier.toUpperCase());
    }
    if (status === 'PENDING_CASHBACK') {
        architects = architects.filter((a: any) => a.pending_redemptions > 0);
    }

    // 3. Overall Stats for KPIs
    const totalBalance = architects.reduce((acc: number, a: any) => acc + Number(a.balance), 0);
    const pendingRedemptionsCount = architects.filter((a: any) => a.pending_redemptions > 0).length;

    return (
        <div className="space-y-10 pb-20">
            {/* Breadcrumbs */}
            <div className="flex items-center justify-between">
                <Link
                    href="/dashboard/admin"
                    className="inline-flex items-center gap-2 text-[10px] font-black text-stone-500 uppercase tracking-widest hover:text-stone-900 transition-all underline-offset-4 hover:underline"
                >
                    <ArrowLeft size={14} />
                    Dashboard
                </Link>
                <AddArchitectButton />
            </div>

            {/* Header / Title */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black text-stone-900 mb-2 uppercase tracking-tighter">Baza Architektów</h1>
                    <p className="text-stone-500 font-bold">Zarządzanie partnerami, ich tierami oraz portfelami cashback.</p>
                </div>

                {/* Search Bar */}
                <form action="/dashboard/admin/architects" method="GET" className="relative group min-w-[320px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-600 group-focus-within:text-brand-primary transition-colors" size={18} />
                    <input
                        type="text"
                        name="q"
                        defaultValue={q}
                        placeholder="Szukaj po nazwie, emailu lub biurze..."
                        className="w-full bg-card border border-black/5 rounded-2xl py-4 pl-12 pr-6 text-stone-900 font-bold placeholder:text-stone-700 focus:outline-none focus:border-brand-primary/50 transition-all shadow-xl"
                    />
                </form>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Wszyscy Partnerzy', value: architects.length, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-900/10' },
                    { label: 'Suma Portfeli', value: `${formatPLN(totalBalance)} PLN`, icon: Wallet, color: 'text-sky-600', bg: 'bg-sky-900/10' },
                    { label: 'Wnioski o Karty', value: pendingRedemptionsCount, icon: CreditCard, color: 'text-amber-600', bg: 'bg-amber-100/10' },
                    { label: 'Aktywne Tillery', value: architects.filter((a: any) => a.projects_count > 0).length, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-900/10' },
                ].map((kpi, i) => (
                    <div key={i} className="stat-card bg-card border border-black/5 py-6">
                        <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center ${kpi.color} border border-black/5 mb-4`}>
                            <kpi.icon size={20} />
                        </div>
                        <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">{kpi.label}</p>
                        <p className="text-2xl font-black text-stone-900 tracking-tighter">{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mr-2 flex items-center gap-2">
                    <Filter size={12} />
                    Filtruj:
                </p>
                {[
                    { label: 'Wszyscy', href: '/dashboard/admin/architects', active: !tier && !status },
                    { label: 'Beginner', href: '/dashboard/admin/architects?tier=beginner', active: tier === 'beginner' },
                    { label: 'Silver', href: '/dashboard/admin/architects?tier=silver', active: tier === 'silver' },
                    { label: 'Gold', href: '/dashboard/admin/architects?tier=gold', active: tier === 'gold' },
                    { label: 'Platinum', href: '/dashboard/admin/architects?tier=platinum', active: tier === 'platinum' },
                    { label: 'Oczekują na Kartę', href: '/dashboard/admin/architects?status=PENDING_CASHBACK', active: status === 'PENDING_CASHBACK', highlight: true },
                ].map((pill, i) => (
                    <Link
                        key={i}
                        href={pill.href}
                        className={`text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl border transition-all ${pill.active
                            ? (pill.highlight ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' : 'bg-brand-primary/10 border-brand-primary/50 text-brand-primary')
                            : 'bg-black/5 border-black/5 text-stone-500 hover:text-stone-900 hover:border-black/10'
                            }`}
                    >
                        {pill.label}
                    </Link>
                ))}
            </div>

            {/* Main List */}
            <div className="stat-card bg-card p-0 border border-black/5 overflow-hidden">
                <div className="p-8 border-b border-black/5 flex items-center justify-between">
                    <h2 className="text-lg font-black text-stone-900 flex items-center gap-3">
                        <Users size={20} className="text-brand-primary" />
                        Lista Kont Architektów
                    </h2>
                </div>
                {architects.length === 0 ? (
                    <div className="py-20 text-center">
                        <Users size={48} className="mx-auto text-slate-800 mb-4 opacity-20" />
                        <p className="text-stone-500 font-bold">Nie znaleziono architektów spełniających kryteria.</p>
                        <Link href="/dashboard/admin/architects" className="text-brand-primary text-xs font-black uppercase mt-4 inline-block tracking-widest hover:underline">Zresetuj filtry</Link>
                    </div>
                ) : (
                    <div className="divide-y divide-black/5">
                        <ArchitectList architects={architects} />
                    </div>
                )}
            </div>
        </div>
    );
}
