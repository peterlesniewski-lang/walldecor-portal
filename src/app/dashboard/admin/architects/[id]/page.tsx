import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { notFound } from "next/navigation";
import {
    Building2,
    CreditCard,
    Wallet,
    ShieldCheck,
    TrendingUp,
    ArrowLeft,
    Receipt,
    FileText,
} from 'lucide-react';
import Link from 'next/link';
import { formatPLN } from '@/lib/utils';
import ArchitectProfileClient from './ArchitectProfileClient';
import ArchitectDataCard from './ArchitectDataCard';
import AdminRedemptionQueue from '@/admin/components/AdminRedemptionQueue';
import AdminPayoutsQueue from '@/admin/components/AdminPayoutsQueue';
import { getArchitectRedemptions } from "@/app/actions/cashback";

export default async function ArchitectProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return <div className="p-8">Brak uprawnień.</div>;
    }

    const isAdmin = session.user.role === 'ADMIN';

    // 1. Architect base data
    const userRes = await query<any>("SELECT * FROM users WHERE id = ? AND role = 'ARCHI'", [id]);
    if (userRes.length === 0) notFound();
    const architect = userRes[0];

    // 2. Cumulative turnover (PRODUCT items, non-rejected projects)
    const turnoverRes = await query<any>(`
        SELECT COALESCE(SUM(i.amount_net), 0) as total
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE p.owner_id = ? AND i.type = 'PRODUCT' AND p.status != 'NIEZREALIZOWANY'
    `, [id]);
    const turnover = Number(turnoverRes[0]?.total || 0);

    // 3. Commissions
    const commissionsRes = await query<any>(`
        SELECT
            COALESCE(SUM(CASE WHEN status IN ('EARNED', 'PAID') THEN amount_net ELSE 0 END), 0) as earned,
            COALESCE(SUM(CASE WHEN status IN ('PENDING', 'IN_PAYMENT') THEN amount_net ELSE 0 END), 0) as pending
        FROM commissions
        WHERE architect_id = ?
    `, [id]);
    const commissions = commissionsRes[0] || { earned: 0, pending: 0 };

    // 4. Wallet balance (excluding expired EARN)
    const walletRes = await query<any>(`
        SELECT COALESCE(SUM(CASE
            WHEN type = 'EARN' AND (expires_at IS NULL OR expires_at > NOW()) THEN amount
            WHEN type = 'ADJUST' THEN amount
            WHEN type NOT IN ('EARN', 'ADJUST') THEN -amount
            ELSE 0
        END), 0) as balance
        FROM wallet_transactions
        WHERE user_id = ?
    `, [id]);
    const walletBalance = Number(walletRes[0]?.balance || 0);

    // 5. Projects list
    const projects = await query<any>(`
        SELECT p.*,
               (SELECT COALESCE(SUM(amount_net), 0) FROM project_items WHERE project_id = p.id AND type = 'PRODUCT') as product_value,
               (SELECT COALESCE(SUM(amount_net), 0) FROM project_items WHERE project_id = p.id) as total_value,
               (SELECT COALESCE(SUM(amount_net), 0) FROM commissions WHERE project_id = p.id) as commission_amount,
               (SELECT status FROM commissions WHERE project_id = p.id LIMIT 1) as commission_status
        FROM projects p
        WHERE p.owner_id = ?
        ORDER BY p.created_at DESC
    `, [id]);

    // 6. Wallet transactions (last 30)
    const walletTxns = await query<any>(`
        SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30
    `, [id]);

    // 7. Redemptions
    const redemptions = await getArchitectRedemptions(id);

    // 7a. Payout requests
    const payoutRequests = await query<any>(`
        SELECT pr.*, u.name as architect_name,
               u.bank_account, u.nip, u.studio_name, u.is_vat_payer,
               (SELECT GROUP_CONCAT(DISTINCT p.name)
                FROM commissions c
                JOIN projects p ON c.project_id = p.id
                WHERE c.payout_id = pr.id) as project_names,
               (SELECT GROUP_CONCAT(DISTINCT p.id)
                FROM commissions c
                JOIN projects p ON c.project_id = p.id
                WHERE c.payout_id = pr.id) as project_ids
        FROM payout_requests pr
        JOIN users u ON pr.architect_id = u.id
        WHERE pr.architect_id = ?
        ORDER BY pr.created_at DESC
        LIMIT 10
    `, [id]);

    // 8. Calculated tier
    const autoTier = turnover >= 120000 ? 'PLATINUM' : turnover >= 50000 ? 'GOLD' : turnover >= 10000 ? 'SILVER' : 'BEGINNER';
    const displayTier = architect.tier_override || autoTier;

    const tierColors: Record<string, string> = {
        BEGINNER: 'text-stone-400',
        SILVER: 'text-stone-400',
        GOLD: 'text-brand-primary',
        PLATINUM: 'text-indigo-600',
    };

    const statusColors: Record<string, string> = {
        ZGŁOSZONY: 'bg-blue-900/30 text-blue-600 border-blue-800/30',
        PRZYJĘTY: 'bg-emerald-900/30 text-emerald-600 border-emerald-800/30',
        W_REALIZACJI: 'bg-amber-100/30 text-amber-600 border-amber-800/30',
        ZAKOŃCZONY: 'bg-stone-200/30 text-stone-400 border-slate-600/30',
        NIEZREALIZOWANY: 'bg-red-50 text-red-600 border-red-800/30',
    };

    const commissionStatusLabels: Record<string, string> = {
        PENDING: 'Planowana',
        EARNED: 'Zarobiona',
        IN_PAYMENT: 'W wypłacie',
        PAID: 'Opłacona',
        REJECTED: 'Odrzucona'
    };

    const commissionStatusColors: Record<string, string> = {
        PENDING: 'text-amber-500',
        EARNED: 'text-emerald-500',
        IN_PAYMENT: 'text-blue-600',
        PAID: 'text-emerald-600',
        REJECTED: 'text-red-600'
    };

    return (
        <div className="space-y-10 pb-20">

            {/* Back navigation */}
            <Link
                href="/dashboard/admin"
                className="inline-flex items-center gap-2 text-[10px] font-black text-stone-500 uppercase tracking-widest hover:text-stone-900 transition-all"
            >
                <ArrowLeft size={14} />
                Powrót do panelu admin
            </Link>

            {/* Header */}
            <div className="stat-card bg-gradient-to-br from-[#151518] to-[#0A0A0B] border border-black/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-3xl bg-black/5 border border-black/10 flex items-center justify-center text-3xl font-black text-stone-100">
                        {architect.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-stone-100 mb-1">{architect.name}</h1>
                        {architect.studio_name && (
                            <p className="text-sm text-stone-300 font-bold mb-2">{architect.studio_name}</p>
                        )}
                        <div className="flex items-center gap-3">
                            <span className={`text-xs font-black uppercase tracking-widest ${tierColors[displayTier]}`}>
                                {displayTier}
                                {architect.tier_override && (
                                    <span className="ml-1 text-[9px] text-stone-600 font-bold">(ręcznie)</span>
                                )}
                            </span>
                            <span className="text-stone-500">·</span>
                            <span className="text-[10px] text-stone-400 font-bold">{architect.email}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Financial KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Obrót łącznie', value: `${formatPLN(turnover)} PLN`, icon: TrendingUp, color: 'text-brand-primary', bg: 'bg-brand-primary/10' },
                    { label: 'Prowizje zarobione', value: `${formatPLN(commissions.earned)} PLN`, icon: Receipt, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Prowizje w toku', value: `${formatPLN(commissions.pending)} PLN`, icon: CreditCard, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Portfel cashback', value: `${formatPLN(walletBalance)} PLN`, icon: Wallet, color: 'text-sky-600', bg: 'bg-sky-50' },
                ].map((kpi, i) => (
                    <div key={i} className="stat-card bg-card border border-black/5 py-6">
                        <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center ${kpi.color} border border-black/5 mb-4`}>
                            <kpi.icon size={20} />
                        </div>
                        <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">{kpi.label}</p>
                        <p className="text-xl font-black text-stone-900 leading-tight">{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

                {/* Left: Personal data + tier management */}
                <div className="space-y-8">

                    {/* Personal data */}
                    <ArchitectDataCard architect={architect} isAdmin={isAdmin} />

                    {/* Tier management — ADMIN only */}
                    {isAdmin && (
                        <ArchitectProfileClient
                            architectId={id}
                            currentTierOverride={architect.tier_override || null}
                            autoTier={autoTier}
                        />
                    )}

                    {/* Tier info (STAFF view) */}
                    {!isAdmin && (
                        <div className="stat-card bg-card border border-black/5">
                            <div className="flex items-center gap-3 mb-4">
                                <ShieldCheck size={16} className="text-brand-primary" />
                                <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Tier</h3>
                            </div>
                            <p className={`text-2xl font-black uppercase ${tierColors[displayTier]}`}>{displayTier}</p>
                            <p className="text-[10px] text-stone-600 mt-2">Obrót: {formatPLN(turnover)} PLN</p>
                        </div>
                    )}
                </div>

                {/* Right: Projects + Wallet transactions */}
                <div className="lg:col-span-2 space-y-10">

                    {/* Projects */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <FileText size={16} className="text-brand-primary" />
                            <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
                                Projekty ({projects.length})
                            </h3>
                        </div>
                        {projects.length === 0 ? (
                            <div className="stat-card bg-card border border-dashed border-black/5 py-12 text-center">
                                <p className="text-[10px] text-stone-600 font-bold uppercase tracking-widest">Brak projektów</p>
                            </div>
                        ) : (
                            <div className="stat-card bg-card p-0 overflow-hidden border border-black/5">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-black/5">
                                            <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest">Projekt</th>
                                            <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest">Status</th>
                                            <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Wartość</th>
                                            <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Prowizja</th>
                                            <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Status Prowizji</th>
                                            <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Data</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/5">
                                        {projects.map((p: any) => (
                                            <tr key={p.id} className="hover:bg-black/[0.02] transition-colors">
                                                <td className="px-6 py-4">
                                                    <Link
                                                        href={`/dashboard/admin/projects/${p.id}`}
                                                        className="text-sm font-black text-stone-900 hover:gold-text transition-all"
                                                    >
                                                        {p.name}
                                                    </Link>
                                                    <p className="text-[10px] text-stone-600 mt-0.5">{p.client_label}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${statusColors[p.status] || 'bg-black/5 text-stone-500 border-black/10'}`}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-stone-900 text-sm">
                                                    {formatPLN(p.product_value)} <span className="text-[9px] text-stone-500">PLN</span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-black gold-text text-sm">
                                                    {formatPLN(p.commission_amount)} <span className="text-[9px] text-stone-500">PLN</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${commissionStatusColors[p.commission_status] || 'text-stone-600'}`}>
                                                        {commissionStatusLabels[p.commission_status] || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right text-[10px] text-stone-500 font-bold">
                                                    {new Date(p.created_at).toLocaleDateString('pl-PL')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Wallet transactions */}
                    <div className="space-y-10">
                        {/* Payouts queue (if any pending) */}
                        {payoutRequests.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <CreditCard size={16} className="text-brand-primary" />
                                    <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em]">
                                        Oczekująca Wypłata
                                    </h3>
                                </div>
                                <AdminPayoutsQueue initialPayouts={payoutRequests} />
                            </div>
                        )}

                        {/* Redemptions queue (if any pending or history) */}
                        {redemptions.length > 0 && (
                            <AdminRedemptionQueue requests={redemptions} />
                        )}

                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Wallet size={16} className="text-sky-600" />
                                <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
                                    Transakcje Portfela
                                </h3>
                            </div>
                            {walletTxns.length === 0 ? (
                                <div className="stat-card bg-card border border-dashed border-black/5 py-12 text-center">
                                    <p className="text-[10px] text-stone-600 font-bold uppercase tracking-widest">Brak transakcji</p>
                                </div>
                            ) : (
                                <div className="stat-card bg-card p-0 overflow-hidden border border-black/5">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-black/5">
                                                <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest">Typ</th>
                                                <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest">Opis</th>
                                                <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Kwota</th>
                                                <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Data</th>
                                                <th className="px-6 py-4 text-[9px] font-black text-stone-500 uppercase tracking-widest text-right">Wygasa</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/5">
                                            {walletTxns.map((t: any) => (
                                                <tr key={t.id} className="hover:bg-black/[0.02] transition-colors">
                                                    <td className="px-6 py-4">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${t.type === 'EARN' ? 'bg-emerald-900/30 text-emerald-600 border-emerald-800/30' :
                                                            t.type === 'SPEND' ? 'bg-red-50 text-red-600 border-red-800/30' :
                                                                'bg-stone-200/30 text-stone-400 border-slate-600/30'
                                                            }`}>
                                                            {t.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-[11px] font-bold text-stone-400">
                                                        {t.description || (t.type === 'EARN' ? 'Naliczenie Cashback' : t.type === 'ADJUST' ? 'Korekta salda' : 'Obciążenie konta')}
                                                    </td>
                                                    <td className={`px-6 py-4 text-right font-black text-sm ${t.type === 'SPEND' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                        {t.type === 'SPEND' ? '−' : '+'}{formatPLN(t.amount)} PLN
                                                    </td>
                                                    <td className="px-6 py-4 text-right text-[10px] text-stone-500 font-bold">
                                                        {new Date(t.created_at).toLocaleDateString('pl-PL')}
                                                    </td>
                                                    <td className="px-6 py-4 text-right text-[10px] text-stone-600 font-bold">
                                                        {t.expires_at ? new Date(t.expires_at).toLocaleDateString('pl-PL') : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
