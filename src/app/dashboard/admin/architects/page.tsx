import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';
import ArchitectList, { RegisterArchitectButton } from '@/components/ArchitectList';
import { Banner, Button, Card, CardBody, CardHeader, EmptyState, KpiTile, cx, formatNumber } from '@/components/ui';
import { walletBalanceSql } from "@/lib/walletSql";
import { getPartnerStatusInfo } from "@/lib/partnerProgram";

export default async function AdminArchitectsPage({
    searchParams
}: {
    searchParams: Promise<{ q?: string, tier?: string, status?: string }>
}) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return <Banner tone="danger" title="Brak uprawnień">Ta strona jest dostępna tylko dla administratora i zespołu.</Banner>;
    }

    const { q, tier, status } = await searchParams;

    // 1. Fetch Architects with project counts and current balances
    let sql = `
        SELECT 
            u.id, u.name, u.email, u.studio_name, u.tier_override,
            COUNT(DISTINCT CASE WHEN p.status != 'NIEZREALIZOWANY' THEN p.id END) as projects_count,
            (SELECT COUNT(*) FROM projects projectCount WHERE projectCount.owner_id = u.id) as projectCount,
            (SELECT COUNT(*) FROM commissions commissionCount WHERE commissionCount.architect_id = u.id) as commissionCount,
            CASE
                WHEN (SELECT COUNT(*) FROM projects projectCount WHERE projectCount.owner_id = u.id) > 0
                    OR (SELECT COUNT(*) FROM commissions commissionCount WHERE commissionCount.architect_id = u.id) > 0
                THEN 1
                ELSE 0
            END as has_business_history,
            COALESCE((
                SELECT SUM(i.amount_net)
                FROM project_items i
                JOIN projects p ON i.project_id = p.id
                WHERE p.owner_id = u.id AND i.type = 'PRODUCT' AND p.status = 'ZAKOŃCZONY'
            ), 0) as turnover,
            (${walletBalanceSql('u.id')}) as balance,
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

    // Dynamic Tier Calculation — nowy program partnerski (10/12/15%)
    const getTier = (a: any) => getPartnerStatusInfo(Number(a.turnover), a.tier_override).status;

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
    const activeCount = architects.filter((a: any) => a.projects_count > 0).length;

    const isAdmin = session.user.role === 'ADMIN';
    const hasFilters = Boolean(q || tier || status);

    const listItems = architects.map((a: any) => {
        const info = getPartnerStatusInfo(Number(a.turnover), a.tier_override);
        return {
            id: a.id,
            name: a.name,
            email: a.email,
            studio_name: a.studio_name ?? null,
            projects_count: Number(a.projects_count) || 0,
            turnover: Number(a.turnover) || 0,
            balance: Number(a.balance) || 0,
            pending_redemptions: Number(a.pending_redemptions) || 0,
            has_business_history: Number(a.has_business_history) === 1,
            tier_status: info.status,
            tier_label: info.label,
        };
    });

    const filters = [
        { label: 'Wszyscy', href: '/dashboard/admin/architects', active: !tier && !status },
        { label: 'Partner', href: '/dashboard/admin/architects?tier=partner', active: tier === 'partner' },
        { label: 'Plus', href: '/dashboard/admin/architects?tier=partner_plus', active: tier === 'partner_plus' },
        { label: 'Premium', href: '/dashboard/admin/architects?tier=partner_premium', active: tier === 'partner_premium' },
        { label: 'Oczekują na kartę', href: '/dashboard/admin/architects?status=PENDING_CASHBACK', active: status === 'PENDING_CASHBACK' },
    ];

    return (
        <div className="space-y-6 pb-16">
            {/* Wróć + akcja rejestracji (drugorzędna; przycisk główny jest w nagłówku powłoki) */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                    href="/dashboard/admin"
                    className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-ink-2 transition-colors hover:text-ink"
                >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Dashboard
                </Link>
                <RegisterArchitectButton canRegisterArchitects={session.user.role === 'ADMIN' || session.user.role === 'STAFF'} />
            </div>

            {/* Nagłówek sekcji + wyszukiwarka */}
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <form action="/dashboard/admin/architects" method="GET" role="search" className="relative w-full md:w-[360px]">
                    {tier && <input type="hidden" name="tier" value={tier} />}
                    {status && <input type="hidden" name="status" value={status} />}
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={16} aria-hidden="true" />
                    <input
                        type="search"
                        name="q"
                        defaultValue={q}
                        aria-label="Szukaj architekta"
                        placeholder="Szukaj po nazwie, emailu lub pracowni"
                        className="h-10 w-full rounded-sm border border-border-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-3"
                    />
                </form>
            </div>

            {/* KPI: jeden kafelek wyróżniony, ten który wymaga działania */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiTile label="Wszyscy partnerzy" value={formatNumber(architects.length)} description={hasFilters ? 'Zgodnie z filtrem' : 'Konta architektów w systemie'} />
                <KpiTile label="Suma portfeli" value={formatNumber(totalBalance)} unit="PLN" description="Dostępny cashback wszystkich partnerów" />
                <KpiTile
                    label="Wnioski o karty"
                    value={formatNumber(pendingRedemptionsCount)}
                    description={pendingRedemptionsCount > 0 ? 'Partnerzy czekają na decyzję' : 'Brak wniosków do decyzji'}
                    highlight={pendingRedemptionsCount > 0}
                />
                <KpiTile label="Aktywni" value={formatNumber(activeCount)} description="Mają co najmniej jeden projekt" />
            </div>

            {/* Filtr segmentowy */}
            <nav aria-label="Filtr statusu partnerskiego" className="inline-flex max-w-full flex-wrap gap-1 rounded-sm border border-border bg-surface p-1">
                {filters.map((f) => (
                    <Link
                        key={f.label}
                        href={f.href}
                        aria-current={f.active ? 'page' : undefined}
                        className={cx(
                            'inline-flex h-8 items-center rounded-[6px] px-3 text-[13px] font-semibold transition-colors',
                            f.active ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-ink/5 hover:text-ink',
                        )}
                    >
                        {f.label}
                    </Link>
                ))}
            </nav>

            {/* Lista */}
            <Card as="section">
                <CardHeader
                    title="Konta architektów"
                    action={<span className="tnum text-[13px] text-ink-2">Wyniki: {formatNumber(architects.length)}</span>}
                />
                <CardBody flush>
                    {architects.length === 0 ? (
                        <div className="p-5">
                            <EmptyState
                                title="Nie znaleziono architektów"
                                description={hasFilters ? 'Żaden partner nie spełnia wybranych kryteriów. Zmień wyszukiwanie albo zresetuj filtry.' : 'Zarejestruj pierwszego partnera, aby pojawił się na liście.'}
                                action={hasFilters ? <Button variant="secondary" href="/dashboard/admin/architects">Zresetuj filtry</Button> : undefined}
                            />
                        </div>
                    ) : (
                        <ArchitectList architects={listItems} isAdmin={isAdmin} />
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
