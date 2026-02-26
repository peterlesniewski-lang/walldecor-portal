import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getAdminMetrics } from "@/lib/services";
import {
    Users,
    TrendingUp,
    Clock,
    ShieldCheck,
    Wallet,
    AlertTriangle,
    CreditCard,
    Activity,
    Timer,
    FolderOpen,
    CheckCircle2,
    Send,
    Wrench,
} from 'lucide-react';
import Link from 'next/link';
import AddArchitectButton from "@/components/AddArchitectButton";
import PayoutForecastDrilldown from "@/admin/components/PayoutForecastDrilldown";
import ArchitectList from '@/components/ArchitectList';
import AdminPayoutsQueue from '@/admin/components/AdminPayoutsQueue';
import AdminProjectListItem from '@/components/AdminProjectListItem';
import AdminCharts from '@/admin/components/AdminCharts';
import DashboardBottomTabs from '@/admin/components/DashboardBottomTabs';
import { getPendingRedemptions } from "@/app/actions/cashback";
import { formatPLN } from "@/lib/utils";

export default async function AdminDashboard() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return <div className="p-8">Brak uprawnień.</div>;
    }

    // 1. Global financial metrics
    const metrics = await getAdminMetrics();

    // 2. Architects list with tier data (balance excludes expired EARN entries)
    const architects = await query<any>(`
        SELECT
            u.id, u.name, u.email,
            COUNT(DISTINCT CASE WHEN p.status != 'NIEZREALIZOWANY' THEN p.id END) as projects_count,
            COALESCE(SUM(CASE
                WHEN t.type = 'EARN' AND (t.expires_at IS NULL OR t.expires_at > datetime('now')) THEN t.amount
                WHEN t.type = 'ADJUST' THEN t.amount
                WHEN t.type NOT IN ('EARN', 'ADJUST') THEN -t.amount
                ELSE 0
            END), 0) as balance
        FROM users u
        LEFT JOIN projects p ON u.id = p.owner_id
        LEFT JOIN wallet_transactions t ON u.id = t.user_id
        WHERE u.role = 'ARCHI'
        GROUP BY u.id
    `);

    // Tier counts come from getAdminMetrics (turnover-based)
    const { silver: silverCount, gold: goldCount, platinum: platinumCount } = metrics.tiers;

    // 3. Leaderboard by turnover (completed projects only)
    const leaderboard = await query<any>(`
        SELECT
            u.name,
            COALESCE(SUM(i.amount_net), 0) as total_turnover,
            COUNT(DISTINCT p.id) as projects_count
        FROM users u
        LEFT JOIN projects p ON u.id = p.owner_id AND p.status = 'ZAKOŃCZONY'
        LEFT JOIN project_items i ON p.id = i.project_id AND i.type = 'PRODUCT'
        WHERE u.role = 'ARCHI'
        GROUP BY u.id
        ORDER BY total_turnover DESC
        LIMIT 5
    `);

    // 4. Projects pending approval (ZGŁOSZONY)
    const pendingProjects = await query<any>(`
        SELECT p.*, u.name as architect_name,
               (SELECT COALESCE(SUM(amount_net), 0) FROM project_items WHERE project_id = p.id) as total_value
        FROM projects p
        JOIN users u ON p.owner_id = u.id
        WHERE p.status = 'ZGŁOSZONY'
        ORDER BY p.created_at DESC
    `);

    // 5. Payout requests queue
    const payoutRequests = await query<any>(`
        SELECT pr.*, u.name as architect_name,
               u.bank_account, u.nip, u.address, u.studio_name, u.is_vat_payer,
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
        WHERE pr.status IN ('PENDING', 'IN_PAYMENT', 'HOLD')
        ORDER BY pr.created_at ASC
    `);

    // 6. Full project pipeline (all statuses)
    const allProjects = await query<any>(`
        SELECT p.id, p.name, p.client_label, p.status, p.created_at, p.staff_id,
               u.name as architect_name,
               s.name as staff_name,
               COALESCE((SELECT SUM(i.amount_net) FROM project_items i WHERE i.project_id = p.id AND i.type = 'PRODUCT'), 0) as product_value
        FROM projects p
        JOIN users u ON p.owner_id = u.id
        LEFT JOIN users s ON p.staff_id = s.id
        ORDER BY p.created_at DESC
    `);

    // 7. Get staff list for assignment
    const staffMembers = await query<any>("SELECT id, name FROM users WHERE role IN ('ADMIN', 'STAFF') ORDER BY name ASC");


    // 7. Pending cashback redemptions
    const redemptions = await getPendingRedemptions();

    // 8. Monthly turnover for chart (last 12 months of ZAKOŃCZONY projects)
    const monthlyTurnover = await query<any>(`
        SELECT substr(p.updated_at, 1, 7) as month,
               COALESCE(SUM(i.amount_net), 0) as total
        FROM projects p
        JOIN project_items i ON p.id = i.project_id AND i.type = 'PRODUCT'
        WHERE p.status = 'ZAKOŃCZONY'
        GROUP BY substr(p.updated_at, 1, 7)
        ORDER BY month ASC
        LIMIT 12
    `);

    // Derived counts
    const totalPayoutQueued = payoutRequests.reduce((acc: number, r: any) => acc + Number(r.amount), 0);

    return (
        <div className="space-y-10 pb-20">

            {/* ── Row 1: Global Financial KPIs ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                    {
                        label: 'Obrót (12m)',
                        value: `${formatPLN(metrics.turnover12m)} PLN`,
                        icon: TrendingUp,
                        iconColor: 'text-brand-primary',
                        bg: 'bg-brand-primary/10',
                        sub: 'Tylko projekty ZAKOŃCZONY'
                    },
                    {
                        label: 'Prowizje zarobione',
                        value: `${formatPLN(metrics.commissions.earned)} PLN`,
                        icon: CreditCard,
                        iconColor: 'text-emerald-600',
                        bg: 'bg-emerald-50',
                        sub: 'Zarobione / Zapłacone'
                    },
                    {
                        label: 'Prowizje w toku',
                        value: `${formatPLN(metrics.commissions.pendingApproval)} PLN`,
                        icon: Clock,
                        iconColor: 'text-amber-600',
                        bg: 'bg-amber-50',
                        sub: 'Szacunkowo (flat rate) · finalizacja przy ZAKOŃCZONY'
                    },
                    {
                        label: 'Portfel łącznie',
                        value: `${formatPLN(metrics.wallet.totalAvailable)} PLN`,
                        icon: Wallet,
                        iconColor: 'text-sky-600',
                        bg: 'bg-sky-50',
                        sub: 'Aktywne, bez wygasłych'
                    },
                    {
                        label: 'Wygasa w 30 dni',
                        value: `${formatPLN(metrics.wallet.expiring30d)} PLN`,
                        icon: Timer,
                        iconColor: 'text-red-600',
                        bg: 'bg-red-50',
                        sub: 'Cashback do wygaśnięcia'
                    },
                ].map((kpi, i) => (
                    <div key={i} className="stat-card bg-card py-6 border border-black/5">
                        <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center ${kpi.iconColor} border border-black/5 mb-4`}>
                            <kpi.icon size={20} />
                        </div>
                        <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">{kpi.label}</p>
                        <p className="text-xl font-black text-stone-900 leading-tight">{kpi.value}</p>
                        <p className="text-[9px] text-stone-600 mt-1">{kpi.sub}</p>
                    </div>
                ))}
            </div>

            {/* ── Row 2: Tier + Alert Counts ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-4">
                {[
                    { label: 'Partnerzy Silver', value: silverCount, icon: ShieldCheck, iconColor: 'text-stone-400', bg: 'bg-black/5', href: '/dashboard/admin/architects?tier=silver' },
                    { label: 'Partnerzy Gold', value: goldCount, icon: ShieldCheck, iconColor: 'text-brand-primary', bg: 'bg-brand-primary/10', href: '/dashboard/admin/architects?tier=gold' },
                    { label: 'Partnerzy Platinum', value: platinumCount, icon: ShieldCheck, iconColor: 'text-indigo-600', bg: 'bg-indigo-50', href: '/dashboard/admin/architects?tier=platinum' },
                    { label: 'Do Akceptacji', value: pendingProjects.length, icon: Clock, iconColor: 'text-red-600', bg: 'bg-red-50', href: '#pending-projects' },
                    { label: 'Zgłoszone', value: metrics.projects.submitted, icon: Send, iconColor: 'text-blue-600', bg: 'bg-blue-50', href: '#project-pipeline' },
                    { label: 'W realizacji', value: metrics.projects.inProgress, icon: Wrench, iconColor: 'text-amber-600', bg: 'bg-amber-50', href: '#project-pipeline' },
                    { label: 'Brak Opiekuna', value: metrics.alerts.withoutCaretaker, icon: AlertTriangle, iconColor: 'text-orange-600', bg: 'bg-orange-50', href: '#project-pipeline' },
                    { label: 'Nieaktywne (14d)', value: metrics.alerts.staleProjects, icon: Activity, iconColor: 'text-rose-600', bg: 'bg-rose-50', href: '#project-pipeline' },
                ].map((stat, i) => (
                    <Link key={i} href={stat.href} className="stat-card bg-card py-6 border border-black/5 hover:border-black/10 transition-all group">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center ${stat.iconColor} border border-black/5 group-hover:scale-110 transition-transform`}>
                                <stat.icon size={18} />
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-0.5 group-hover:text-stone-400 transition-colors">{stat.label}</p>
                                <p className="text-2xl font-black text-stone-900">{stat.value}</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* ── Pipeline Health ── */}
            {(() => {
                const p = metrics.projects;
                const active = p.total - p.rejected;
                const pct = (n: number) => active > 0 ? Math.round(n / p.total * 100) : 0;
                const cr = p.conversionRate;
                const crColor = cr >= 70
                    ? { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-600', bar: 'bg-emerald-500' }
                    : cr >= 50
                        ? { bg: 'bg-amber-500/5', border: 'border-amber-500/20', text: 'text-amber-600', bar: 'bg-amber-500' }
                        : { bg: 'bg-red-500/5', border: 'border-red-500/20', text: 'text-red-600', bar: 'bg-red-500' };
                return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Tile 1: Zgłoszone */}
                        <div className="stat-card bg-card py-6 border border-black/5">
                            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600 border border-black/5 mb-4">
                                <FolderOpen size={20} />
                            </div>
                            <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Projekty zgłoszone</p>
                            <p className="text-3xl font-black text-stone-900 leading-tight">{active}</p>
                            <p className="text-[9px] text-stone-600 mt-1">Łącznie aktywne (bez odrzuconych)</p>
                        </div>

                        {/* Tile 2: Zrealizowane */}
                        <div className="stat-card bg-card py-6 border border-black/5">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-black/5 mb-4">
                                <CheckCircle2 size={20} />
                            </div>
                            <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Projekty zrealizowane</p>
                            <p className="text-3xl font-black text-stone-900 leading-tight">{p.completed}</p>
                            <p className="text-[9px] text-stone-600 mt-1">Status ZAKOŃCZONY</p>
                        </div>

                        {/* Tile 3: Konwersja + stacked bar */}
                        <div className={`stat-card py-6 border ${crColor.bg} ${crColor.border}`}>
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Wskaźnik konwersji</p>
                                    <p className={`text-3xl font-black leading-tight ${crColor.text}`}>{cr}%</p>
                                    <p className="text-[9px] text-stone-600 mt-1">Zakończone / aktywne</p>
                                </div>
                            </div>
                            {/* Stacked bar */}
                            <div className="w-full h-2 rounded-full overflow-hidden flex mt-4 mb-3">
                                <div className="bg-blue-400"   style={{ width: `${pct(p.submitted)}%` }} title={`Zgłoszone: ${p.submitted}`} />
                                <div className="bg-emerald-400" style={{ width: `${pct(p.accepted)}%` }} title={`Przyjęte: ${p.accepted}`} />
                                <div className="bg-amber-400"  style={{ width: `${pct(p.inProgress)}%` }} title={`W realizacji: ${p.inProgress}`} />
                                <div className="bg-stone-400"  style={{ width: `${pct(p.completed)}%` }} title={`Zakończone: ${p.completed}`} />
                                <div className="bg-red-400"    style={{ width: `${pct(p.rejected)}%` }} title={`Odrzucone: ${p.rejected}`} />
                            </div>
                            {/* Legend */}
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {[
                                    { label: 'Zgłoszone', count: p.submitted, color: 'bg-blue-400' },
                                    { label: 'Przyjęte', count: p.accepted, color: 'bg-emerald-400' },
                                    { label: 'Realizacja', count: p.inProgress, color: 'bg-amber-400' },
                                    { label: 'Zakończone', count: p.completed, color: 'bg-stone-400' },
                                    { label: 'Odrzucone', count: p.rejected, color: 'bg-red-400' },
                                ].map(s => (
                                    <div key={s.label} className="flex items-center gap-1">
                                        <div className={`w-2 h-2 rounded-full ${s.color}`} />
                                        <span className="text-[9px] text-stone-500 font-bold">{s.label}: {s.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Charts ── */}
            <AdminCharts
                monthlyTurnover={monthlyTurnover}
                tiers={{
                    beginner: metrics.tiers.beginner,
                    silver: silverCount,
                    gold: goldCount,
                    platinum: platinumCount,
                }}
            />

            {/* ── Main Grid: 2/3 + 1/3 ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

                {/* Left column */}
                <div className="lg:col-span-2 space-y-14">

                    {/* Pending submissions */}
                    <div id="pending-projects" className="space-y-6 scroll-mt-24">
                        <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-3">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                            Pilne: Zgłoszenia do Akceptacji
                            <span className="bg-red-50 text-red-600 text-[10px] px-3 py-1 rounded-full font-black ml-2 border border-red-800/30">
                                {pendingProjects.length}
                            </span>
                        </h3>
                        <div className="space-y-4">
                            {pendingProjects.length > 0 ? pendingProjects.map((project: any) => (
                                <AdminProjectListItem key={project.id} project={project} />
                            )) : (
                                <div className="stat-card bg-card py-16 text-center border-dashed border-black/5">
                                    <Clock size={40} className="mx-auto mb-4 text-stone-700 opacity-50" />
                                    <h4 className="text-stone-900 font-black text-base mb-1">Czysta karta</h4>
                                    <p className="text-stone-500 font-medium text-sm">Wszystkie zgłoszenia zostały przetworzone.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Payout queue */}
                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-3">
                            <CreditCard size={16} className="text-brand-primary" />
                            Kolejka Wypłat
                            {payoutRequests.length > 0 && (
                                <span className="bg-brand-primary/10 text-brand-primary text-[10px] px-3 py-1 rounded-full font-black border border-brand-primary/20">
                                    {payoutRequests.length} wniosków · {formatPLN(totalPayoutQueued)} PLN
                                </span>
                            )}
                        </h3>
                        <AdminPayoutsQueue initialPayouts={payoutRequests} />
                    </div>

                    {/* Leaderboard */}
                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-3">
                            <TrendingUp size={16} className="text-emerald-500" />
                            Best Archi – Ranking Obrotów
                        </h3>
                        <div className="stat-card bg-card p-0 overflow-hidden border border-black/5">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-black/5">
                                        <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-widest">#</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-widest">Architekt / Biuro</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-widest text-right">Projekty</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-widest text-right">Obrót Netto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5">
                                    {leaderboard.map((item: any, i: number) => (
                                        <tr key={i} className="hover:bg-black/[0.02] transition-colors group">
                                            <td className="px-8 py-5">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-brand-primary text-black shadow-[0_0_20px_rgba(212,175,55,0.3)]' :
                                                    i === 1 ? 'bg-stone-200 text-stone-900' :
                                                        i === 2 ? 'bg-amber-100 text-amber-500' :
                                                            'bg-black/5 text-stone-500'
                                                    }`}>
                                                    {i + 1}
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="font-black text-stone-900 group-hover:gold-text transition-all cursor-default">
                                                    {item.name}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-right font-black text-stone-400">
                                                {item.projects_count}
                                            </td>
                                            <td className="px-8 py-5 text-right font-black">
                                                <span className="gold-text text-lg">
                                                    {formatPLN(item.total_turnover)} <span className="text-[10px]">PLN</span>
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Activity + Cashback + Pipeline (tabbed) */}
                    <DashboardBottomTabs
                        projects={allProjects}
                        isAdmin={session.user.role === 'ADMIN'}
                        staffMembers={staffMembers}
                        redemptions={redemptions}
                        projectCount={allProjects.length}
                    />
                </div>

                {/* Right column */}
                <div className="space-y-10">

                    {/* Payout Forecast */}
                    <div className="stat-card bg-card p-8 border border-black/5 space-y-6">
                        <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-3">
                            <Wallet size={16} className="text-sky-600" />
                            Prognoza Wypłat
                        </h3>
                        <div className="space-y-4">
                            <div className="py-4 border-b border-black/5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Gotowi do wypłaty</p>
                                        <p className="text-[9px] text-stone-600">Portfel ≥ 300 PLN, brak wniosku</p>
                                    </div>
                                    <p className="text-2xl font-black text-stone-900">{metrics.payoutForecast.eligibleCount}</p>
                                </div>
                                <PayoutForecastDrilldown items={metrics.payoutForecast.eligible} label="Gotowi do wypłaty" />
                            </div>
                            <div className="py-4 border-b border-black/5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Prawie gotowi</p>
                                        <p className="text-[9px] text-stone-600">Portfel 150–299 PLN</p>
                                    </div>
                                    <p className="text-2xl font-black text-stone-900">{metrics.payoutForecast.nearEligibleCount}</p>
                                </div>
                                <PayoutForecastDrilldown items={metrics.payoutForecast.nearEligible} label="Prawie gotowi" />
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Prognoza łączna</p>
                                <p className="text-xl font-black gold-text">
                                    {formatPLN(metrics.payoutForecast.forecastTotal)} <span className="text-[10px]">PLN</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Architect List */}
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-3">
                                <Users size={16} className="text-brand-primary" />
                                Baza Architektów
                            </h3>
                            <AddArchitectButton />
                        </div>
                        <ArchitectList architects={architects} />
                    </div>
                </div>
            </div>
        </div>
    );
}
