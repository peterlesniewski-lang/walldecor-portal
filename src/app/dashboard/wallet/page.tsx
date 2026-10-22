import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getArchitectStats } from "@/lib/services";
import { CheckCircle2, Info, AlertCircle, Mail } from 'lucide-react';
import CommissionPayoutButton from "@/components/CommissionPayoutButton";
import RedeemCashbackButton from "@/components/RedeemCashbackButton";
import MyDiscountCards from "@/components/MyDiscountCards";
import { getMyRedemptions } from "@/app/actions/cashback";
import {
    Banner,
    Card,
    CardBody,
    CardHeader,
    EmptyState,
    KpiTile,
    StatusPill,
    formatDate,
    formatNumber,
    formatPLN,
    formatSignedPLN,
} from "@/components/ui";

const PAYOUT_MIN = 100;

export default async function WalletPage() {
    const session = await getServerSession(authOptions);
    if (!session) return null;

    const [stats, transactions, pendingPayout, redemptions, commissionTotals, commissionHistory] = await Promise.all([
        getArchitectStats(session.user.id),
        query<any>(
            "SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 200",
            [session.user.id]
        ),
        query<any>(
            "SELECT id, amount, status, created_at FROM payout_requests WHERE architect_id = ? AND (status IN ('PENDING', 'IN_PAYMENT', 'HOLD') OR (status IN ('REJECTED', 'PAID') AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY))) ORDER BY created_at DESC",
            [session.user.id]
        ),
        getMyRedemptions(),
        query<any>(
            "SELECT status, COALESCE(SUM(amount_net), 0) as total FROM commissions WHERE architect_id = ? GROUP BY status",
            [session.user.id]
        ),
        query<any>(
            `SELECT c.id, c.amount_net, c.status, c.rate, c.created_at, p.name as project_name, i.category as item_category
             FROM commissions c
             LEFT JOIN projects p ON c.project_id = p.id
             LEFT JOIN project_items i ON c.project_item_id = i.id
             WHERE c.architect_id = ?
             ORDER BY c.created_at DESC
             LIMIT 100`,
            [session.user.id]
        ),
    ]);

    const activePayout = pendingPayout.find((pr: any) => ['PENDING', 'IN_PAYMENT', 'HOLD'].includes(pr.status));
    const hasPendingRequest = !!activePayout;
    const isCommissionEligible = !hasPendingRequest && stats.earnedCommission >= PAYOUT_MIN;

    const totalFor = (status: string) => Number(commissionTotals.find((row: any) => row.status === status)?.total || 0);
    const inPaymentTotal = totalFor('IN_PAYMENT');
    const paidTotal = totalFor('PAID');
    const earned = Number(stats.earnedCommission) || 0;
    const thresholdProgress = Math.min((earned / PAYOUT_MIN) * 100, 100);

    const th = 'label-caps px-5 py-3 text-left';

    return (
        <div className="space-y-6 pb-16">
            {/* Kafelki */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiTile
                    label="Prowizja dostępna"
                    value={formatNumber(earned)}
                    unit="PLN"
                    highlight={isCommissionEligible}
                    description={isCommissionEligible ? 'Możesz złożyć wniosek o wypłatę' : `Wypłata od ${PAYOUT_MIN} PLN`}
                />
                <KpiTile label="W wypłacie" value={formatNumber(inPaymentTotal)} unit="PLN" description="Wnioski przekazane do płatności" />
                <KpiTile label="Wypłacone" value={formatNumber(paidTotal)} unit="PLN" description="Prowizje przelane na Twoje konto" />
                <KpiTile label="Portfel cashback" value={formatNumber(stats.cashbackBalance)} unit="PLN" description="Do wymiany na karty rabatowe" />
            </div>

            {/* Wniosek o wypłatę + cashback */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card as="section">
                    <CardHeader
                        title="Wniosek o wypłatę prowizji"
                        action={hasPendingRequest ? <StatusPill kind="payout" status={activePayout.status} /> : undefined}
                    />
                    <CardBody className="space-y-5">
                        <div className="flex items-baseline justify-between gap-3">
                            <div>
                                <p className="label-caps mb-1">Kwota do wypłaty</p>
                                <p className="font-display text-[34px] font-normal leading-none tnum text-ink">
                                    {formatNumber(earned)}<small className="ml-1.5 font-sans text-sm text-ink-3">PLN</small>
                                </p>
                            </div>
                            {isCommissionEligible && (
                                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                                    <CheckCircle2 size={16} aria-hidden="true" /> Próg osiągnięty
                                </span>
                            )}
                        </div>

                        {hasPendingRequest ? (
                            <Banner tone={activePayout.status === 'HOLD' ? 'warning' : 'info'}>
                                {activePayout.status === 'IN_PAYMENT'
                                    ? `Wypłata ${formatPLN(activePayout.amount)} jest w trakcie realizacji.`
                                    : activePayout.status === 'HOLD'
                                        ? `Wniosek o wypłatę ${formatPLN(activePayout.amount)} został wstrzymany.`
                                        : `Wniosek o wypłatę ${formatPLN(activePayout.amount)} oczekuje na zatwierdzenie.`
                                }
                            </Banner>
                        ) : (
                            <div>
                                <div className="mb-2 flex justify-between text-[13px]">
                                    <span className="text-ink-2">Próg wypłaty</span>
                                    <span className="tnum font-semibold text-ink">{PAYOUT_MIN} PLN</span>
                                </div>
                                <div
                                    className="h-1.5 w-full overflow-hidden rounded-pill bg-ink/10"
                                    role="progressbar"
                                    aria-label="Postęp do progu wypłaty"
                                    aria-valuemin={0}
                                    aria-valuemax={PAYOUT_MIN}
                                    aria-valuenow={Math.min(earned, PAYOUT_MIN)}
                                >
                                    <div className="h-full rounded-pill bg-brass" style={{ width: `${thresholdProgress}%` }} />
                                </div>
                            </div>
                        )}

                        <ul className="space-y-1.5 text-[13px] text-ink-2">
                            <li>Wypłacamy pełną dostępną kwotę, bez wypłat częściowych.</li>
                            <li>Do wniosku załącz fakturę lub rachunek w formacie PDF.</li>
                        </ul>

                        <CommissionPayoutButton
                            isEligible={isCommissionEligible}
                            amount={stats.earnedCommission}
                            projectNames={stats.earnedProjects || []}
                        />
                    </CardBody>
                </Card>

                <Card as="section">
                    <CardHeader title="Cashback" />
                    <CardBody className="space-y-5">
                        <div>
                            <p className="label-caps mb-1">Saldo portfela</p>
                            <p className="font-display text-[34px] font-normal leading-none tnum text-ink">
                                {formatNumber(stats.cashbackBalance)}<small className="ml-1.5 font-sans text-sm text-ink-3">PLN</small>
                            </p>
                        </div>
                        <Banner tone="info">
                            Wymień cashback na karty rabatowe do sklepu WallDecor.
                        </Banner>
                        <RedeemCashbackButton balance={stats.cashbackBalance} />
                    </CardBody>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="min-w-0 space-y-6 lg:col-span-2">
                    {/* Wnioski o wypłatę */}
                    {pendingPayout.length > 0 && (
                        <Card as="section">
                            <CardHeader title="Wnioski o wypłatę" />
                            <CardBody flush>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[420px] text-sm">
                                        <thead>
                                            <tr className="border-b border-border bg-surface-2">
                                                <th className={th}>Data</th>
                                                <th className={th}>Status</th>
                                                <th className={`${th} text-right`}>Kwota</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {pendingPayout.map((pr: any) => (
                                                <tr key={pr.id}>
                                                    <td className="tnum px-5 py-3 text-ink-2">{formatDate(pr.created_at)}</td>
                                                    <td className="px-5 py-3"><StatusPill kind="payout" status={pr.status} /></td>
                                                    <td className={`tnum px-5 py-3 text-right font-semibold ${pr.status === 'REJECTED' ? 'text-ink-3 line-through' : 'text-ink'}`}>
                                                        {formatPLN(pr.amount)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardBody>
                        </Card>
                    )}

                    {/* Historia prowizji */}
                    <Card as="section">
                        <CardHeader title="Historia prowizji" />
                        <CardBody flush>
                            {commissionHistory.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[560px] text-sm">
                                        <thead>
                                            <tr className="border-b border-border bg-surface-2">
                                                <th className={th}>Projekt</th>
                                                <th className={th}>Status</th>
                                                <th className={`${th} text-right`}>Stawka</th>
                                                <th className={`${th} text-right`}>Kwota</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {commissionHistory.map((c: any) => (
                                                <tr key={c.id}>
                                                    <td className="px-5 py-3">
                                                        <p className="font-semibold text-ink">{c.project_name || 'Projekt'}</p>
                                                        <p className="tnum text-xs text-ink-3">
                                                            {[c.item_category, formatDate(c.created_at)].filter(Boolean).join(' · ')}
                                                        </p>
                                                    </td>
                                                    <td className="px-5 py-3"><StatusPill kind="commission" status={c.status} /></td>
                                                    <td className="tnum px-5 py-3 text-right text-ink-2">
                                                        {c.rate != null && c.rate !== '' ? `${Math.round(Number(c.rate) * 100)}%` : '—'}
                                                    </td>
                                                    <td className="tnum px-5 py-3 text-right font-semibold text-ink">{formatPLN(c.amount_net)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-5">
                                    <EmptyState title="Brak prowizji" description="Prowizja pojawi się tutaj po przyjęciu pierwszego projektu." />
                                </div>
                            )}
                        </CardBody>
                    </Card>

                    {/* Historia cashback */}
                    <Card as="section">
                        <CardHeader title="Historia cashback" />
                        <CardBody flush>
                            {transactions.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[560px] text-sm">
                                        <thead>
                                            <tr className="border-b border-border bg-surface-2">
                                                <th className={th}>Operacja</th>
                                                <th className={th}>Typ</th>
                                                <th className={th}>Ważne do</th>
                                                <th className={`${th} text-right`}>Kwota</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {transactions.map((t: any) => {
                                                const positive = t.type === 'EARN' || (t.type === 'ADJUST' && Number(t.amount) >= 0);
                                                return (
                                                    <tr key={t.id}>
                                                        <td className="px-5 py-3">
                                                            <p className="font-semibold text-ink">
                                                                {t.description || (t.type === 'EARN' ? 'Naliczenie cashback' : t.type === 'ADJUST' ? 'Korekta salda' : 'Obciążenie konta')}
                                                            </p>
                                                            <p className="tnum text-xs text-ink-3">{formatDate(t.created_at)}</p>
                                                        </td>
                                                        <td className="px-5 py-3">
                                                            {t.type === 'EARN' ? <StatusPill tone="success">Naliczony</StatusPill>
                                                                : t.type === 'ADJUST' ? <StatusPill tone="info">Korekta</StatusPill>
                                                                    : <StatusPill tone="neutral">Wykorzystany</StatusPill>}
                                                        </td>
                                                        <td className="tnum px-5 py-3 text-ink-2">{t.expires_at ? formatDate(t.expires_at) : '—'}</td>
                                                        <td className={`tnum px-5 py-3 text-right font-semibold ${positive ? 'text-success' : 'text-ink'}`}>
                                                            {formatSignedPLN(positive ? Math.abs(Number(t.amount)) : -Math.abs(Number(t.amount)))}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-5">
                                    <EmptyState title="Brak operacji cashback" description="Cashback 2% naliczymy po zakończeniu pierwszego projektu." />
                                </div>
                            )}
                        </CardBody>
                    </Card>

                    {/* Karty rabatowe */}
                    <MyDiscountCards redemptions={redemptions} />
                </div>

                {/* Zasady i kontakt */}
                <div className="space-y-6">
                    <Card as="section">
                        <CardHeader title="Zasady programu" />
                        <CardBody className="space-y-5">
                            <div className="flex gap-3">
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-success-soft text-success"><CheckCircle2 size={16} aria-hidden="true" /></span>
                                <div>
                                    <p className="text-sm font-semibold text-ink">Naliczenie</p>
                                    <p className="text-[13px] text-ink-2">Prowizja staje się dostępna, gdy WallDecor oznaczy projekt jako zakończony.</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-info-soft text-info"><Info size={16} aria-hidden="true" /></span>
                                <div>
                                    <p className="text-sm font-semibold text-ink">Rozliczenia</p>
                                    <p className="text-[13px] text-ink-2">Wypłata środków możliwa jest po przedłożeniu faktury lub rachunku (min. 100 PLN).</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-warning-soft text-warning"><AlertCircle size={16} aria-hidden="true" /></span>
                                <div>
                                    <p className="text-sm font-semibold text-ink">Ważność</p>
                                    <p className="text-[13px] text-ink-2">Środki w Portfelu (Cashback) wygasają po 12 miesiącach od daty ich przyznania.</p>
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    <Card as="section">
                        <CardBody>
                            <p className="label-caps mb-2">Opiekun finansowy</p>
                            <a
                                href="mailto:finanse@walldecor.pl"
                                className="inline-flex items-center gap-2 text-sm font-semibold text-brass-ink underline underline-offset-2 hover:text-ink"
                            >
                                <Mail size={16} aria-hidden="true" /> finanse@walldecor.pl
                            </a>
                        </CardBody>
                    </Card>
                </div>
            </div>
        </div>
    );
}
