import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getAdminMetrics } from "@/lib/services";
import {
    AlertTriangle,
    ArrowRight,
    HelpCircle,
    ShieldCheck,
    Users,
    Wallet,
} from 'lucide-react';
import Link from 'next/link';
import AddArchitectButton from "@/components/AddArchitectButton";
import PayoutForecastDrilldown from "@/admin/components/PayoutForecastDrilldown";
import AdminPayoutsQueue from '@/admin/components/AdminPayoutsQueue';
import AdminProjectPipeline from '@/admin/components/AdminProjectPipeline';
import AdminCharts from '@/admin/components/AdminCharts';
import { getPendingRedemptions } from "@/app/actions/cashback";
import { formatPLN } from "@/lib/utils";

interface LeaderboardRow {
    name: string;
    total_turnover: number;
    projects_count: number;
}

interface PayoutRequestRow {
    id: string;
    architect_id: string;
    architect_name: string;
    amount: number;
    created_at: string;
    status: 'PENDING' | 'IN_PAYMENT' | 'HOLD' | 'PAID' | 'APPROVED' | 'REJECTED' | string;
    project_names?: string;
    project_ids?: string;
    invoice_url?: string;
    invoice_number?: string | null;
    bank_account?: string | null;
    nip?: string | null;
    address?: string | null;
    studio_name?: string | null;
    is_vat_payer?: number | null;
}

interface AdminProjectRow {
    id: string;
    name: string;
    client_label?: string | null;
    status: string;
    created_at: string;
    updated_at?: string | null;
    staff_id?: string | null;
    architect_name: string;
    staff_name?: string | null;
    product_value: number | string | null;
    estimated_commission?: number | string | null;
    earned_commission?: number | string | null;
    payout_status?: string | null;
}

interface StaffMemberRow {
    id: string;
    name: string;
}

interface MonthlyTurnoverRow {
    month: string;
    total: number;
}

interface PaidPayoutSummaryRow {
    total: number | string | null;
    count: number;
}

export default async function AdminDashboard() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return <div className="p-8">Brak uprawnień.</div>;
    }

    const metrics = await getAdminMetrics();
    const { partner: partnerCount, partnerPlus: partnerPlusCount, partnerPremium: partnerPremiumCount } = metrics.tiers;

    const leaderboard = await query<LeaderboardRow>(`
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

    const payoutRequests = await query<PayoutRequestRow>(`
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

    const paidPayouts = await query<PaidPayoutSummaryRow>(`
        SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
        FROM payout_requests
        WHERE status = 'PAID'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    const allProjects = await query<AdminProjectRow>(`
        SELECT p.id, p.name, p.client_label, p.status, p.created_at, p.updated_at, p.staff_id,
               u.name as architect_name,
               s.name as staff_name,
               COALESCE((SELECT SUM(i.amount_net) FROM project_items i WHERE i.project_id = p.id AND i.type = 'PRODUCT'), 0) as product_value,
               COALESCE((SELECT SUM(c.amount_net) FROM commissions c WHERE c.project_id = p.id AND c.status = 'PENDING'), 0) as estimated_commission,
               COALESCE((SELECT SUM(c.amount_net) FROM commissions c WHERE c.project_id = p.id AND c.status IN ('EARNED', 'IN_PAYMENT', 'PAID')), 0) as earned_commission,
               (SELECT GROUP_CONCAT(DISTINCT pr.status)
                FROM commissions c
                JOIN payout_requests pr ON pr.id = c.payout_id
                WHERE c.project_id = p.id) as payout_status
        FROM projects p
        JOIN users u ON p.owner_id = u.id
        LEFT JOIN users s ON p.staff_id = s.id
        ORDER BY p.created_at DESC
    `);

    const staffMembers = await query<StaffMemberRow>("SELECT id, name FROM users WHERE role IN ('ADMIN', 'STAFF') ORDER BY name ASC");
    const redemptions = await getPendingRedemptions();

    const monthlyTurnover = await query<MonthlyTurnoverRow>(`
        SELECT substr(p.updated_at, 1, 7) as month,
               COALESCE(SUM(i.amount_net), 0) as total
        FROM projects p
        JOIN project_items i ON p.id = i.project_id AND i.type = 'PRODUCT'
        WHERE p.status = 'ZAKOŃCZONY'
        GROUP BY substr(p.updated_at, 1, 7)
        ORDER BY month ASC
        LIMIT 12
    `);

    const pendingPayouts = payoutRequests.filter((r) => r.status === 'PENDING');
    const inPaymentPayouts = payoutRequests.filter((r) => r.status === 'IN_PAYMENT');
    const holdPayouts = payoutRequests.filter((r) => r.status === 'HOLD');
    const sumPayouts = (items: PayoutRequestRow[]) => items.reduce((acc, r) => acc + Number(r.amount), 0);
    const paidPayoutSummary = paidPayouts[0] || { total: 0, count: 0 };
    const canRegisterArchitects = session.user.role === 'ADMIN' || session.user.role === 'STAFF';
    const canManageProjects = session.user.role === 'ADMIN' || session.user.role === 'STAFF';

    const payoutCards = [
        {
            label: 'Do wypłaty',
            value: sumPayouts(pendingPayouts),
            count: pendingPayouts.length,
            tone: 'border-brand-primary/40 bg-brand-primary/5 text-stone-950',
        },
        {
            label: 'W trakcie płatności',
            value: sumPayouts(inPaymentPayouts),
            count: inPaymentPayouts.length,
            tone: 'border-sky-100 bg-sky-50 text-sky-900',
        },
        {
            label: 'Wstrzymane (HOLD)',
            value: sumPayouts(holdPayouts),
            count: holdPayouts.length,
            tone: 'border-amber-100 bg-amber-50 text-amber-800',
        },
        {
            label: 'Wypłacone (30 dni)',
            value: Number(paidPayoutSummary.total),
            count: Number(paidPayoutSummary.count),
            tone: 'border-emerald-100 bg-emerald-50 text-emerald-800',
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6 pb-20 xl:grid-cols-[minmax(0,1fr)_21rem]">
            <main className="space-y-6">
                <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {payoutCards.map((card) => (
                        <div key={card.label} className={`rounded-lg border p-5 shadow-sm ${card.tone}`}>
                            <p className="text-sm font-semibold text-stone-700">{card.label}</p>
                            <p className="mt-2 text-2xl font-black">{formatPLN(card.value)} zł</p>
                            <p className="mt-1 text-xs font-medium text-stone-500">{card.count} pozycji</p>
                        </div>
                    ))}
                </section>

                {payoutRequests.length > 0 && (
                    <section className="space-y-4 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-black text-stone-950">Do wypłaty</h2>
                                <p className="text-sm font-medium text-stone-500">Pozycje wymagające pracy admina nad płatnością.</p>
                            </div>
                            <span className="rounded-full bg-brand-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-brand-primary">
                                {payoutRequests.length} wniosków
                            </span>
                        </div>
                        <AdminPayoutsQueue
                            initialPayouts={payoutRequests}
                            isAdmin={session.user.role === 'ADMIN'}
                        />
                    </section>
                )}

                <AdminProjectPipeline
                    projects={allProjects}
                    canManageProjects={canManageProjects}
                    staffMembers={staffMembers}
                />

                <section className="space-y-5 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Analityka i partnerzy</p>
                        <h2 className="mt-1 text-xl font-black text-stone-950">Kontekst po operacjach</h2>
                    </div>

                    <AdminCharts
                        monthlyTurnover={monthlyTurnover}
                        tiers={{
                            partner: partnerCount,
                            partnerPlus: partnerPlusCount,
                            partnerPremium: partnerPremiumCount,
                        }}
                    />

                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
                        <div className="overflow-hidden rounded-lg border border-black/10">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-stone-50">
                                        <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-stone-500">Architekt / Biuro</th>
                                        <th className="px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest text-stone-500">Projekty</th>
                                        <th className="px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest text-stone-500">Obrót netto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5">
                                    {leaderboard.map((item) => (
                                        <tr key={item.name} className="hover:bg-stone-50/70">
                                            <td className="px-5 py-4 text-sm font-black text-stone-900">{item.name}</td>
                                            <td className="px-5 py-4 text-right text-sm font-bold text-stone-500">{item.projects_count}</td>
                                            <td className="px-5 py-4 text-right text-sm font-black text-brand-primary">{formatPLN(item.total_turnover)} PLN</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="rounded-lg border border-black/10 bg-stone-50 p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="font-black text-stone-950">Baza architektów</h3>
                                    <p className="mt-1 text-xs font-medium text-stone-500">Pełna lista, edycja kont i usuwanie pustych kont.</p>
                                </div>
                                <Users size={18} className="text-brand-primary" />
                            </div>
                            <div className="mt-5 flex flex-col gap-3">
                                <Link
                                    href="/dashboard/admin/architects"
                                    className="inline-flex items-center justify-between rounded-lg border border-black/10 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-stone-700 hover:border-brand-primary/40 hover:text-brand-primary"
                                >
                                    Otwórz listę
                                    <ArrowRight size={14} />
                                </Link>
                                <AddArchitectButton canRegisterArchitects={canRegisterArchitects} />
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <aside className="space-y-5 xl:sticky xl:top-6 xl:h-fit">
                <div className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="font-black text-stone-950">Pomoc kontekstowa</h2>
                            <p className="mt-1 text-xs font-medium text-stone-500">Statusy wypłat i następne działania.</p>
                        </div>
                        <HelpCircle size={18} className="text-brand-primary" />
                    </div>
                    <div className="mt-5 space-y-4">
                        {[
                            { status: 'PENDING', text: 'Wypłata czeka na decyzję admina.' },
                            { status: 'IN_PAYMENT', text: 'Admin rozpoczął proces płatności.' },
                            { status: 'HOLD', text: 'Wstrzymane do wyjaśnienia danych lub faktury.' },
                            { status: 'PAID', text: 'Finalny status po realnym przelewie.' },
                        ].map((item) => (
                            <div key={item.status} className="grid grid-cols-[6.5rem_1fr] gap-3">
                                <span className="rounded-md bg-stone-100 px-2 py-1 text-center text-[10px] font-black text-stone-700">{item.status}</span>
                                <p className="text-xs font-medium leading-relaxed text-stone-600">{item.text}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <h2 className="font-black text-stone-950">Partnerzy</h2>
                        <ShieldCheck size={18} className="text-brand-primary" />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {[
                            { label: 'Partner', slug: 'partner', value: partnerCount },
                            { label: 'Plus', slug: 'partner_plus', value: partnerPlusCount },
                            { label: 'Premium', slug: 'partner_premium', value: partnerPremiumCount },
                        ].map((tier) => (
                            <Link
                                key={tier.label}
                                href={`/dashboard/admin/architects?tier=${tier.slug}`}
                                className="rounded-lg border border-black/10 bg-stone-50 p-3 text-center hover:border-brand-primary/40"
                            >
                                <p className="text-[9px] font-black uppercase tracking-widest text-stone-500">{tier.label}</p>
                                <p className="mt-1 text-xl font-black text-stone-950">{tier.value}</p>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <h2 className="font-black text-stone-950">Sygnały</h2>
                        <AlertTriangle size={18} className="text-amber-600" />
                    </div>
                    <div className="mt-4 space-y-3">
                        {[
                            { label: 'Do akceptacji', value: metrics.projects.submitted, href: '#project-pipeline' },
                            { label: 'Brak opiekuna', value: metrics.alerts.withoutCaretaker, href: '#project-pipeline' },
                            { label: 'Nieaktywne 14d', value: metrics.alerts.staleProjects, href: '#project-pipeline' },
                            { label: 'Cashback do decyzji', value: redemptions.length, href: '#analytics' },
                        ].map((signal) => (
                            <Link key={signal.label} href={signal.href} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 hover:bg-stone-100">
                                <span className="text-xs font-bold text-stone-600">{signal.label}</span>
                                <span className="text-sm font-black text-stone-950">{signal.value}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <Wallet size={16} className="text-sky-600" />
                        <h2 className="font-black text-stone-950">Prognoza wypłat</h2>
                    </div>
                    <div className="mt-4 space-y-4">
                        <div>
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Gotowi</p>
                                <p className="text-xl font-black text-stone-950">{metrics.payoutForecast.eligibleCount}</p>
                            </div>
                            <PayoutForecastDrilldown items={metrics.payoutForecast.eligible} label="Gotowi do wypłaty" />
                        </div>
                        <div>
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Prawie gotowi</p>
                                <p className="text-xl font-black text-stone-950">{metrics.payoutForecast.nearEligibleCount}</p>
                            </div>
                            <PayoutForecastDrilldown items={metrics.payoutForecast.nearEligible} label="Prawie gotowi" />
                        </div>
                        <div className="border-t border-black/5 pt-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">Prognoza łączna</p>
                            <p className="mt-1 text-xl font-black text-brand-primary">{formatPLN(metrics.payoutForecast.forecastTotal)} PLN</p>
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    );
}
