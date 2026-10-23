import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getAdminMetrics } from "@/lib/services";
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import AddArchitectButton from "@/components/AddArchitectButton";
import PayoutForecastDrilldown from "@/admin/components/PayoutForecastDrilldown";
import AdminPayoutsQueue from '@/admin/components/AdminPayoutsQueue';
import AdminProjectPipeline from '@/admin/components/AdminProjectPipeline';
import AdminCharts from '@/admin/components/AdminCharts';
import AdminRedemptionQueue from '@/admin/components/AdminRedemptionQueue';
import { getPendingRedemptions } from "@/app/actions/cashback";
import {
    Card,
    CardBody,
    CardHeader,
    EmptyState,
    KpiTile,
    StatusPill,
    formatNumber,
    formatPLN,
} from '@/components/ui';

/** Polska odmiana liczebnika: 1 wniosek, 2 wnioski, 5 wniosków. */
function plural(count: number, one: string, few: string, many: string): string {
    const abs = Math.abs(count);
    if (abs === 1) return one;
    const lastTwo = abs % 100;
    const last = abs % 10;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
    return many;
}

function countLabel(count: number, one: string, few: string, many: string, empty = 'Brak pozycji'): string {
    return count === 0 ? empty : `${count} ${plural(count, one, few, many)}`;
}

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
        SELECT substr(COALESCE(p.completed_at, p.updated_at, p.created_at), 1, 7) as month,
               COALESCE(SUM(i.amount_net), 0) as total
        FROM projects p
        JOIN project_items i ON p.id = i.project_id AND i.type = 'PRODUCT'
        WHERE p.status = 'ZAKOŃCZONY'
          AND COALESCE(p.completed_at, p.updated_at, p.created_at) >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY substr(COALESCE(p.completed_at, p.updated_at, p.created_at), 1, 7)
        ORDER BY month ASC
    `);

    const pendingPayouts = payoutRequests.filter((r) => r.status === 'PENDING');
    const inPaymentPayouts = payoutRequests.filter((r) => r.status === 'IN_PAYMENT');
    const holdPayouts = payoutRequests.filter((r) => r.status === 'HOLD');
    const sumPayouts = (items: PayoutRequestRow[]) => items.reduce((acc, r) => acc + Number(r.amount), 0);
    const paidPayoutSummary = paidPayouts[0] || { total: 0, count: 0 };
    const canRegisterArchitects = session.user.role === 'ADMIN' || session.user.role === 'STAFF';
    const canManageProjects = session.user.role === 'ADMIN' || session.user.role === 'STAFF';

    const payoutTiles = [
        {
            label: 'Do wypłaty',
            value: sumPayouts(pendingPayouts),
            count: pendingPayouts.length,
            description: countLabel(pendingPayouts.length, 'wniosek czeka na decyzję', 'wnioski czekają na decyzję', 'wniosków czeka na decyzję', 'Brak wniosków'),
            highlight: pendingPayouts.length > 0,
        },
        {
            label: 'W trakcie płatności',
            value: sumPayouts(inPaymentPayouts),
            count: inPaymentPayouts.length,
            description: countLabel(inPaymentPayouts.length, 'wniosek', 'wnioski', 'wniosków'),
            highlight: false,
        },
        {
            label: 'Wstrzymane',
            value: sumPayouts(holdPayouts),
            count: holdPayouts.length,
            description: countLabel(holdPayouts.length, 'wniosek', 'wnioski', 'wniosków'),
            highlight: false,
        },
        {
            label: 'Wypłacone · 30 dni',
            value: Number(paidPayoutSummary.total),
            count: Number(paidPayoutSummary.count),
            description: countLabel(Number(paidPayoutSummary.count), 'wypłata', 'wypłaty', 'wypłat'),
            highlight: false,
        },
    ];

    const signals = [
        { label: 'Do akceptacji', value: metrics.projects.submitted, href: '#project-pipeline', warn: false },
        { label: 'Brak opiekuna', value: metrics.alerts.withoutCaretaker, href: '#project-pipeline', warn: true },
        { label: 'Nieaktywne 14 dni', value: metrics.alerts.staleProjects, href: '#project-pipeline', warn: false },
        { label: 'Cashback do decyzji', value: redemptions.length, href: redemptions.length > 0 ? '#cashback' : '#analytics', warn: false },
    ];

    const tiers = [
        { label: 'Partner', slug: 'partner', value: partnerCount },
        { label: 'Plus', slug: 'partner_plus', value: partnerPlusCount },
        { label: 'Premium', slug: 'partner_premium', value: partnerPremiumCount },
    ];

    return (
        <div className="space-y-4 pb-20">
            {/* KPI: wyróżniony tylko kafelek, który wymaga działania */}
            <section aria-label="Wypłaty w liczbach" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {payoutTiles.map((tile) => (
                    <KpiTile
                        key={tile.label}
                        label={tile.label}
                        value={formatNumber(tile.value)}
                        unit="PLN"
                        description={<span className={tile.count === 0 ? 'text-ink-3' : undefined}>{tile.description}</span>}
                        highlight={tile.highlight}
                    />
                ))}
            </section>

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                    <Card as="section">
                        <CardHeader
                            title="Do wypłaty"
                            action={
                                payoutRequests.length > 0
                                    ? <StatusPill tone="warning">{payoutRequests.length} {plural(payoutRequests.length, 'wniosek', 'wnioski', 'wniosków')}</StatusPill>
                                    : undefined
                            }
                        />
                        {payoutRequests.length > 0 ? (
                            <AdminPayoutsQueue
                                flush
                                initialPayouts={payoutRequests}
                                isAdmin={session.user.role === 'ADMIN'}
                            />
                        ) : (
                            <CardBody>
                                <EmptyState
                                    title="Brak wniosków do wypłaty"
                                    description="Gdy partner złoży wniosek o wypłatę prowizji, pojawi się tutaj."
                                />
                            </CardBody>
                        )}
                    </Card>

                    {redemptions.length > 0 && (
                        <Card as="section" id="cashback" className="scroll-mt-24">
                            <CardHeader
                                title="Cashback do decyzji"
                                action={<StatusPill tone="warning">{redemptions.length} {plural(redemptions.length, 'wniosek', 'wnioski', 'wniosków')}</StatusPill>}
                            />
                            <AdminRedemptionQueue
                                flush
                                requests={redemptions}
                                isAdmin={session.user.role === 'ADMIN'}
                            />
                        </Card>
                    )}
                </div>

                <aside className="space-y-4">
                    <Card as="section">
                        <CardHeader title="Sygnały" />
                        <CardBody className="px-5 py-2">
                            {signals.map((signal) => (
                                <Link
                                    key={signal.label}
                                    href={signal.href}
                                    className="flex items-center justify-between gap-3 border-t border-border py-2.5 text-sm first:border-t-0 hover:text-ink"
                                >
                                    <span className="text-ink-2">{signal.label}</span>
                                    <b className={`tnum font-semibold ${signal.warn && signal.value > 0 ? 'text-warning' : 'text-ink'}`}>{signal.value}</b>
                                </Link>
                            ))}
                        </CardBody>
                    </Card>

                    <Card as="section">
                        <CardHeader title="Prognoza wypłat prowizji" />
                        <CardBody className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm text-ink-2">Gotowi do wypłaty</span>
                                    <b className="tnum font-display text-2xl font-normal text-ink">{metrics.payoutForecast.eligibleCount}</b>
                                </div>
                                <PayoutForecastDrilldown items={metrics.payoutForecast.eligible} label="Gotowi do wypłaty" />
                            </div>
                            <div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm text-ink-2">Prawie gotowi</span>
                                    <b className="tnum font-display text-2xl font-normal text-ink">{metrics.payoutForecast.nearEligibleCount}</b>
                                </div>
                                <PayoutForecastDrilldown items={metrics.payoutForecast.nearEligible} label="Prawie gotowi" />
                            </div>
                            <div className="flex items-baseline justify-between gap-3 border-t-2 border-ink pt-3">
                                <span className="text-sm text-ink-2">Prognoza łączna</span>
                                <span className="tnum font-display text-[28px] leading-none text-ink">{formatPLN(metrics.payoutForecast.forecastTotal)}</span>
                            </div>
                        </CardBody>
                    </Card>

                    <Card as="section">
                        <CardHeader title="Partnerzy" />
                        <CardBody>
                            <div className="grid grid-cols-3 gap-2">
                                {tiers.map((tier) => (
                                    <Link
                                        key={tier.label}
                                        href={`/dashboard/admin/architects?tier=${tier.slug}`}
                                        className="rounded-sm border border-border bg-surface-2 px-3 py-3 text-center transition-colors hover:border-border-strong"
                                    >
                                        <p className="label-caps">{tier.label}</p>
                                        <p className="tnum mt-1.5 font-display text-2xl leading-none text-ink">{tier.value}</p>
                                    </Link>
                                ))}
                            </div>
                        </CardBody>
                    </Card>
                </aside>
            </div>

            <AdminProjectPipeline
                projects={allProjects}
                canManageProjects={canManageProjects}
                staffMembers={staffMembers}
            />

            <AdminCharts
                monthlyTurnover={monthlyTurnover}
                tiers={{
                    partner: partnerCount,
                    partnerPlus: partnerPlusCount,
                    partnerPremium: partnerPremiumCount,
                }}
            />

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Card as="section">
                    <CardHeader title="Najlepsi architekci" action={<span className="text-[13px] text-ink-3">Obrót netto z zakończonych projektów</span>} />
                    {leaderboard.length === 0 ? (
                        <CardBody>
                            <EmptyState title="Brak danych" description="Ranking pojawi się po zakończeniu pierwszych projektów." />
                        </CardBody>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr>
                                        <th scope="col" className="label-caps border-b border-border px-5 py-3">Architekt / Biuro</th>
                                        <th scope="col" className="label-caps border-b border-border px-5 py-3 text-right">Projekty</th>
                                        <th scope="col" className="label-caps border-b border-border px-5 py-3 text-right">Obrót netto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((item) => (
                                        <tr key={item.name} className="border-b border-border last:border-b-0 hover:bg-surface-2">
                                            <td className="px-5 py-3.5 font-semibold text-ink">{item.name}</td>
                                            <td className="tnum px-5 py-3.5 text-right text-ink-2">{item.projects_count}</td>
                                            <td className="tnum px-5 py-3.5 text-right font-medium text-ink">{formatPLN(item.total_turnover)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <div className="space-y-4">
                    <Card as="section">
                        <CardHeader title="Baza architektów" />
                        <CardBody className="space-y-3">
                            <p className="text-sm text-ink-2">Pełna lista, edycja kont i usuwanie pustych kont.</p>
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Link zamiast <Button href>: Button przekazuje onClick do <Link>, czego Server Component nie może zrobić. */}
                                <Link
                                    href="/dashboard/admin/architects"
                                    className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-border-strong bg-surface px-3 text-[13px] font-semibold leading-none text-ink transition-[border-color] duration-150 hover:border-ink-3"
                                >
                                    <ArrowRight size={14} aria-hidden="true" />
                                    Otwórz listę
                                </Link>
                                <AddArchitectButton canRegisterArchitects={canRegisterArchitects} />
                            </div>
                        </CardBody>
                    </Card>

                    <Card as="section">
                        <CardHeader title="Pomoc kontekstowa" />
                        <CardBody className="space-y-3">
                            <p className="text-sm text-ink-2">Statusy wypłat i następne działania.</p>
                            {[
                                { status: 'PENDING', text: 'Wypłata czeka na decyzję admina.' },
                                { status: 'IN_PAYMENT', text: 'Admin rozpoczął proces płatności.' },
                                { status: 'HOLD', text: 'Wstrzymane do wyjaśnienia danych lub faktury.' },
                                { status: 'PAID', text: 'Finalny status po realnym przelewie.' },
                            ].map((item) => (
                                <div key={item.status} className="grid grid-cols-[8rem_1fr] items-center gap-3">
                                    <span><StatusPill kind="payout" status={item.status} /></span>
                                    <p className="text-[13px] text-ink-2">{item.text}</p>
                                </div>
                            ))}
                        </CardBody>
                    </Card>
                </div>
            </div>
        </div>
    );
}
