import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { notFound } from "next/navigation";
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Banner, Card, CardBody, CardHeader, EmptyState, KpiTile, StatusPill, formatDate, formatNumber, formatPLN, formatSignedPLN } from '@/components/ui';
import type { Tone } from '@/components/ui';
import ArchitectProfileClient from './ArchitectProfileClient';
import ArchitectDataCard from './ArchitectDataCard';
import AdminRedemptionQueue from '@/admin/components/AdminRedemptionQueue';
import AdminPayoutsQueue from '@/admin/components/AdminPayoutsQueue';
import { getArchitectRedemptions } from "@/app/actions/cashback";
import { walletBalanceSql } from "@/lib/walletSql";
import { getPartnerStatusInfo } from "@/lib/partnerProgram";

export default async function ArchitectProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return <Banner tone="danger" title="Brak uprawnień">Ta strona jest dostępna tylko dla administratora i zespołu.</Banner>;
    }

    const isAdmin = session.user.role === 'ADMIN';

    // 1. Architect base data
    const userRes = await query<any>("SELECT * FROM users WHERE id = ? AND role = 'ARCHI'", [id]);
    if (userRes.length === 0) notFound();
    const architect = userRes[0];

    // 2. Qualified turnover (PRODUCT items, completed projects only) + pipeline (accepted / in progress)
    const turnoverRes = await query<any>(`
        SELECT COALESCE(SUM(i.amount_net), 0) as total
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE p.owner_id = ? AND i.type = 'PRODUCT' AND p.status = 'ZAKOŃCZONY'
    `, [id]);
    const turnover = Number(turnoverRes[0]?.total || 0);

    const pipelineRes = await query<any>(`
        SELECT COALESCE(SUM(i.amount_net), 0) as total
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE p.owner_id = ? AND i.type = 'PRODUCT' AND p.status IN ('PRZYJĘTY', 'W_REALIZACJI')
    `, [id]);
    const pipelineTurnover = Number(pipelineRes[0]?.total || 0);

    // 3. Commissions
    const commissionsRes = await query<any>(`
        SELECT
            COALESCE(SUM(CASE WHEN status IN ('EARNED', 'PAID') THEN amount_net ELSE 0 END), 0) as earned,
            COALESCE(SUM(CASE WHEN status IN ('PENDING', 'IN_PAYMENT') THEN amount_net ELSE 0 END), 0) as pending
        FROM commissions
        WHERE architect_id = ?
    `, [id]);
    const commissions = commissionsRes[0] || { earned: 0, pending: 0 };

    const walletRes = await query<any>(`SELECT (${walletBalanceSql('?')}) as balance`, [id]);
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

    // 8. Status partnerski (program 10/12/15%)
    const autoStatus = getPartnerStatusInfo(turnover, null);
    const effectiveStatus = getPartnerStatusInfo(turnover, architect.tier_override);
    const autoTier = autoStatus.label;
    const displayTier = `${effectiveStatus.label} (${Math.round(effectiveStatus.rate * 100)}%)`;

    const TIER_TONE: Record<string, Tone> = {
        PARTNER: 'accent',
        PARTNER_PLUS: 'info',
        PARTNER_PREMIUM: 'success',
    };
    const tierTone = TIER_TONE[effectiveStatus.status] ?? 'neutral';

    const nameParts = String(architect.name || '').trim().split(/\s+/).filter(Boolean);
    const initials = nameParts.length === 0
        ? '?'
        : nameParts.length === 1
            ? nameParts[0].slice(0, 2).toUpperCase()
            : (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();

    const WALLET_TYPE: Record<string, { label: string; tone: Tone }> = {
        EARN: { label: 'Naliczenie', tone: 'success' },
        SPEND: { label: 'Wykorzystanie', tone: 'info' },
        ADJUST: { label: 'Korekta', tone: 'neutral' },
    };

    const th = 'label-caps px-5 py-3';

    return (
        <div className="space-y-6 pb-16">

            {/* Wróć */}
            <Link
                href="/dashboard/admin"
                className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-ink-2 transition-colors hover:text-ink"
            >
                <ArrowLeft size={16} aria-hidden="true" />
                Powrót do panelu admin
            </Link>

            {/* Nagłówek profilu */}
            <Card as="section">
                <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <span
                        aria-hidden="true"
                        className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-brass-soft font-display text-2xl text-brass-ink"
                    >
                        {initials}
                    </span>
                    <div className="min-w-0">
                        <h2 className="font-display text-[28px] font-normal leading-tight tracking-[-0.01em] text-ink">{architect.name}</h2>
                        {architect.studio_name && <p className="mt-0.5 text-sm text-ink-2">{architect.studio_name}</p>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                            <StatusPill tone={tierTone}>{displayTier}</StatusPill>
                            {architect.tier_override && <span className="text-[13px] text-ink-2">ustawiony ręcznie</span>}
                            <span className="break-all text-sm text-ink-2">{architect.email}</span>
                        </div>
                    </div>
                </CardBody>
            </Card>

            {/* KPI finansowe: jeden rząd na desktopie */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <KpiTile label="Obrót kwalifikowany (ZAKOŃCZONE)" value={formatNumber(turnover)} unit="PLN" />
                <KpiTile label="Pipeline (w toku)" value={formatNumber(pipelineTurnover)} unit="PLN" />
                <KpiTile label="Prowizje zarobione" value={formatNumber(commissions.earned)} unit="PLN" />
                <KpiTile label="Prowizje w toku" value={formatNumber(commissions.pending)} unit="PLN" />
                <KpiTile label="Portfel cashback" value={formatNumber(walletBalance)} unit="PLN" />
            </div>

            {/* Główna siatka */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">

                {/* Lewa kolumna: dane i status partnerski */}
                <div className="space-y-6">
                    <ArchitectDataCard architect={architect} isAdmin={isAdmin} />

                    {/* Zarządzanie statusem: tylko ADMIN */}
                    {isAdmin && (
                        <ArchitectProfileClient
                            architectId={id}
                            currentTierOverride={architect.tier_override || null}
                            autoTier={autoTier}
                        />
                    )}

                    {/* Status partnerski (widok STAFF) */}
                    {!isAdmin && (
                        <Card as="section">
                            <CardHeader title="Status partnerski" />
                            <CardBody>
                                <StatusPill tone={tierTone}>{displayTier}</StatusPill>
                                <p className="tnum mt-3 text-sm text-ink-2">Obrót kwalifikowany: {formatPLN(turnover)}</p>
                            </CardBody>
                        </Card>
                    )}
                </div>

                {/* Prawa kolumna: projekty, wypłaty, portfel */}
                <div className="min-w-0 space-y-6">

                    {/* Projekty */}
                    <Card as="section">
                        <CardHeader
                            title={`Projekty (${projects.length})`}
                        />
                        <CardBody flush>
                            {projects.length === 0 ? (
                                <div className="p-5">
                                    <EmptyState title="Brak projektów" description="Projekty zgłoszone przez tego architekta pojawią się tutaj." />
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[720px] text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-border">
                                                <th scope="col" className={th}>Projekt</th>
                                                <th scope="col" className={th}>Status</th>
                                                <th scope="col" className={`${th} text-right`}>Wartość</th>
                                                <th scope="col" className={`${th} text-right`}>Prowizja</th>
                                                <th scope="col" className={th}>Status prowizji</th>
                                                <th scope="col" className={`${th} text-right`}>Data</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {projects.map((p: any) => (
                                                <tr key={p.id} className="transition-colors hover:bg-surface-2">
                                                    <td className="px-5 py-3">
                                                        <Link
                                                            href={`/dashboard/admin/projects/${p.id}`}
                                                            className="font-semibold text-ink hover:underline hover:underline-offset-4"
                                                        >
                                                            {p.name}
                                                        </Link>
                                                        {p.client_label && <p className="mt-0.5 text-[13px] text-ink-2">{p.client_label}</p>}
                                                    </td>
                                                    <td className="px-5 py-3"><StatusPill kind="project" status={p.status} /></td>
                                                    <td className="tnum whitespace-nowrap px-5 py-3 text-right text-ink">{formatPLN(p.product_value)}</td>
                                                    <td className="tnum whitespace-nowrap px-5 py-3 text-right font-semibold text-ink">{formatPLN(p.commission_amount)}</td>
                                                    <td className="px-5 py-3">
                                                        {!p.commission_status ? (
                                                            <span className="text-ink-3">—</span>
                                                        ) : p.commission_status === 'REJECTED' ? (
                                                            <StatusPill tone="danger">Odrzucona</StatusPill>
                                                        ) : (
                                                            <StatusPill kind="commission" status={p.commission_status} />
                                                        )}
                                                    </td>
                                                    <td className="tnum whitespace-nowrap px-5 py-3 text-right text-ink-3">{formatDate(p.created_at)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardBody>
                    </Card>

                    {/* Oczekujące wypłaty */}
                    {payoutRequests.length > 0 && (
                        <section className="space-y-3">
                            <h2 className="text-base font-semibold text-ink">Oczekująca wypłata</h2>
                            <AdminPayoutsQueue initialPayouts={payoutRequests} isAdmin={isAdmin} />
                        </section>
                    )}

                    {/* Wnioski o karty cashback */}
                    {redemptions.length > 0 && (
                        <AdminRedemptionQueue requests={redemptions} isAdmin={isAdmin} />
                    )}

                    {/* Transakcje portfela */}
                    <Card as="section">
                        <CardHeader title="Transakcje portfela" />
                        <CardBody flush>
                            {walletTxns.length === 0 ? (
                                <div className="p-5">
                                    <EmptyState title="Brak transakcji" description="Naliczenia i wykorzystanie cashbacku pojawią się tutaj." />
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[640px] text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-border">
                                                <th scope="col" className={th}>Typ</th>
                                                <th scope="col" className={th}>Opis</th>
                                                <th scope="col" className={`${th} text-right`}>Kwota</th>
                                                <th scope="col" className={`${th} text-right`}>Data</th>
                                                <th scope="col" className={`${th} text-right`}>Wygasa</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {walletTxns.map((t: any) => {
                                                const type = WALLET_TYPE[t.type] ?? { label: 'Transakcja', tone: 'neutral' as Tone };
                                                // W bazie SPEND jest ujemny (a EARN dodatni): znak pokazujemy raz, z wartości kwoty.
                                                const signedAmount = t.type === 'SPEND' ? -Math.abs(Number(t.amount)) : Number(t.amount);
                                                return (
                                                    <tr key={t.id} className="transition-colors hover:bg-surface-2">
                                                        <td className="px-5 py-3"><StatusPill tone={type.tone}>{type.label}</StatusPill></td>
                                                        <td className="px-5 py-3 text-ink-2">
                                                            {t.description || (t.type === 'EARN' ? 'Naliczenie cashbacku' : t.type === 'ADJUST' ? 'Korekta salda' : 'Obciążenie konta')}
                                                        </td>
                                                        <td className={`tnum whitespace-nowrap px-5 py-3 text-right font-semibold ${signedAmount < 0 ? 'text-ink-2' : 'text-success'}`}>
                                                            {formatSignedPLN(signedAmount)}
                                                        </td>
                                                        <td className="tnum whitespace-nowrap px-5 py-3 text-right text-ink-3">{formatDate(t.created_at)}</td>
                                                        <td className="tnum whitespace-nowrap px-5 py-3 text-right text-ink-3">{formatDate(t.expires_at)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardBody>
                    </Card>
                </div>
            </div>
        </div>
    );
}
