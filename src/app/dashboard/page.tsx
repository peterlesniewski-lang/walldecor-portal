import Link from 'next/link';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArchitectStats, getArchitectProjects, getUserById } from "@/lib/services";
import {
    ArrowRight,
    BarChart3,
    Check,
    CheckCircle2,
    CreditCard,
    FileText,
} from 'lucide-react';
import DashboardPipeline from '@/components/DashboardPipeline';
import ProfileSettingsWrapper from "@/components/ProfileSettingsWrapper";
import { PARTNER_TIERS } from '@/lib/partnerProgram';
import {
    Card,
    CardBody,
    CardHeader,
    KpiTile,
    StatusPill,
    cx,
    formatDate,
    formatNumber,
    formatPLN,
    formatSignedPLN,
} from "@/components/ui";

interface ArchitectDashboardProject {
    id: string;
    name: string;
    client_label: string;
    status: string;
    total_value?: number | string | null;
    commission_amount?: number | string | null;
    created_at: string;
}

const PAYOUT_MIN = 100;

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);
    if (!session) return null;

    const stats_db = await getArchitectStats(session.user.id);
    const projects = await getArchitectProjects(session.user.id, session.user.role);
    const user = await getUserById(session.user.id);

    if (!stats_db) return null;

    const firstName = (user?.first_name || session.user.name || '').trim().split(/\s+/)[0];
    const earned = Number(stats_db.earnedCommission) || 0;
    const payoutReady = earned >= PAYOUT_MIN;
    const inProgressCount = (projects as ArchitectDashboardProject[])
        .filter((p) => !['ZAKOŃCZONY', 'NIEZREALIZOWANY'].includes(p.status)).length;

    // Pasek postępu: skala 0 → próg najwyższego statusu; znaczniki na progach z programu partnerskiego
    const turnover = Number(stats_db.turnover) || 0;
    const topThreshold = PARTNER_TIERS[PARTNER_TIERS.length - 1].from;
    const tierScale = PARTNER_TIERS.map((tier) => ({
        ...tier,
        left: Math.min((tier.from / topThreshold) * 100, 100),
        pct: Math.round(tier.rate * 100),
    }));
    const turnoverPct = Math.min((turnover / topThreshold) * 100, 100);

    const nextSteps = [
        {
            href: '#profil',
            icon: CheckCircle2,
            label: 'Uzupełnij profil',
            text: 'Dane firmy, NIP i numer konta do przelewu.',
            done: Boolean(user?.bank_account && user?.nip),
        },
        {
            href: '/dashboard/wallet',
            icon: FileText,
            label: 'Dodaj fakturę PDF',
            text: 'Przy wniosku o wypłatę (od 100 PLN) załącz fakturę PDF.',
            done: false,
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

    const tierProgressLabel = !stats_db.nextTier
        ? 'Masz najwyższy poziom prowizji.'
        : `${formatPLN(stats_db.turnoverToNext)} do poziomu ${stats_db.nextTierLabel}`;

    const howItWorks = [
        { title: 'Zgłaszasz projekt', text: 'Podajesz klienta i kategorie produktów. Opiekun WallDecor potwierdza wartość po wycenie.' },
        { title: 'Realizujemy zamówienie', text: 'Projekt przechodzi przez kolejne etapy. Prowizja i cashback 2% naliczają się po jego zakończeniu.' },
        { title: 'Wypłacasz prowizję', text: `Od ${PAYOUT_MIN} PLN składasz wniosek z fakturą PDF. Cashback wymieniasz na kartę rabatową.` },
    ];

    return (
        <div data-testid="architect-dashboard" className="space-y-6 pb-16">
            {/* Powitanie */}
            <section>
                <div className="min-w-0">
                    <h2 className="font-display text-[40px] font-light leading-[1.05] tracking-[-0.015em] text-ink text-balance sm:text-[48px]">
                        Dzień dobry{firstName ? `, ${firstName}` : ''}
                    </h2>
                    <p className="mt-2 text-[15px] text-ink-2">
                        {inProgressCount > 0
                            ? `Masz ${inProgressCount} ${inProgressCount === 1 ? 'projekt' : inProgressCount < 5 ? 'projekty' : 'projektów'} w toku.`
                            : 'Nie masz teraz projektów w toku.'}
                        {payoutReady && ' Prowizja czeka na wypłatę.'}
                    </p>
                </div>
            </section>

            {/* Kafelki */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Podsumowanie">
                <KpiTile
                    label="Prowizja dostępna do wypłaty"
                    value={formatNumber(earned)}
                    unit="PLN"
                    highlight={payoutReady}
                    description={
                        payoutReady ? (
                            <Link href="/dashboard/wallet" className="inline-flex items-center gap-1.5 font-semibold text-brass-ink hover:text-ink">
                                Wypłać prowizję <ArrowRight size={14} aria-hidden="true" />
                            </Link>
                        ) : 'Minimalna kwota wypłaty to 100 PLN'
                    }
                />
                <KpiTile
                    label="Obrót łącznie"
                    value={formatNumber(turnover)}
                    unit="PLN"
                    description="Zakończone projekty, tylko produkty"
                />
                <KpiTile
                    label="Cashback w portfelu"
                    value={formatNumber(stats_db.cashbackBalance)}
                    unit="PLN"
                    description={
                        <Link href="/dashboard/wallet" className="inline-flex items-center gap-1.5 font-semibold text-brass-ink hover:text-ink">
                            Wymień na kartę rabatową <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                    }
                />
                <KpiTile
                    label="Aktywne projekty"
                    value={String(inProgressCount)}
                    description="W toku: zgłoszone, przyjęte, w realizacji"
                />
            </section>

            {/* Poziomy prowizji */}
            <Card as="section" aria-label="Poziomy prowizji">
                <CardHeader
                    title="Poziomy prowizji"
                    action={<StatusPill tone="accent">{stats_db.tierLabel ?? stats_db.tier}</StatusPill>}
                />
                <CardBody>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                        <p className="text-sm text-ink-2">
                            Twój status: <strong className="font-semibold text-ink">{stats_db.tierLabel ?? stats_db.tier}</strong>
                            {' · '}Aktualna prowizja: <strong className="tnum font-semibold text-ink">{Math.round(Number(stats_db.commissionRate ?? 0.10) * 100)}%</strong>
                            {' · '}Obrót: <span className="tnum font-semibold text-ink">{formatPLN(turnover)}</span>
                        </p>
                        <p className="tnum text-sm font-semibold text-ink">{tierProgressLabel}</p>
                    </div>

                    {/* Pasek: cienki, mosiężny, znaczniki na progach; etykiety w siatce 3 kolumn, żeby nigdy nie wychodziły poza kartę */}
                    <div className="relative mt-6">
                        <div
                            className="h-1.5 w-full overflow-hidden rounded-pill bg-ink/10"
                            role="progressbar"
                            aria-label="Postęp do kolejnego poziomu prowizji"
                            aria-valuemin={0}
                            aria-valuemax={topThreshold}
                            aria-valuenow={Math.min(turnover, topThreshold)}
                        >
                            <div className="h-full rounded-pill bg-brass" style={{ width: `${turnoverPct}%` }} />
                        </div>
                        {tierScale.slice(1, -1).map((tier) => (
                            <span
                                key={tier.id}
                                aria-hidden="true"
                                className="absolute top-[-3px] h-3 w-0.5 -translate-x-1/2 rounded-pill bg-ink/30"
                                style={{ left: `${tier.left}%` }}
                            />
                        ))}
                        <ul className="mt-3 grid grid-cols-3 gap-x-3">
                            {tierScale.map((tier, index) => {
                                const reached = tier.id === stats_db.tier;
                                const align = index === 0 ? 'text-left' : index === tierScale.length - 1 ? 'text-right' : 'text-center';
                                return (
                                    <li key={tier.id} className={cx('min-w-0', align)}>
                                        <span className={cx('block text-[13px] font-semibold', reached ? 'text-ink' : 'text-ink-2')}>
                                            {tier.label} <span className="tnum">{tier.pct}%</span>
                                            {reached && <Check size={13} className="ml-1 inline text-brass-ink" aria-label="Twój poziom" />}
                                        </span>
                                        <span className="tnum block text-xs text-ink-3">
                                            {tier.from === 0 ? 'od startu' : `od ${formatPLN(tier.from)}`}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <p className="mt-4 text-[13px] text-ink-2">
                        <strong className="font-semibold text-ink">Cashback 2%</strong>{' '}
                        nalicza się osobno od wartości netto produktów po zakończeniu projektu. W portfelu wymienisz go na kartę lub kod rabatowy.
                    </p>
                </CardBody>
            </Card>

            <DashboardPipeline projects={projects} />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                {/* Historia portfela */}
                <Card as="section" className="min-w-0 self-start">
                    <CardHeader
                        title="Historia portfela"
                        action={
                            <Link href="/dashboard/wallet" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brass-ink hover:text-ink">
                                Otwórz portfel <ArrowRight size={14} aria-hidden="true" />
                            </Link>
                        }
                    />
                    <CardBody flush>
                        <dl className="grid grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                            <div className="px-5 py-4">
                                <dt className="label-caps mb-1.5">Prowizja łącznie</dt>
                                <dd className="tnum text-xl font-semibold text-ink">{formatPLN(stats_db.totalRealizedCommission)}</dd>
                            </div>
                            <div className="px-5 py-4">
                                <dt className="label-caps mb-1.5">W toku i planowane</dt>
                                <dd className="tnum text-xl font-semibold text-ink">{formatPLN(stats_db.pendingCommission)}</dd>
                            </div>
                            <div className="px-5 py-4">
                                <dt className="label-caps mb-1.5">Obrót łącznie</dt>
                                <dd className="tnum text-xl font-semibold text-ink">{formatPLN(stats_db.turnover)}</dd>
                            </div>
                        </dl>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-surface-2">
                                        <th className="label-caps px-5 py-3">Projekt</th>
                                        <th className="label-caps px-5 py-3">Status</th>
                                        <th className="label-caps px-5 py-3 text-right">Prowizja</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {walletHistory.length > 0 ? walletHistory.map((project) => (
                                        <tr key={project.id}>
                                            <td className="px-5 py-3">
                                                <Link href={`/dashboard/projects/${project.id}`} className="font-semibold text-ink hover:text-brass-ink">{project.name}</Link>
                                                <p className="tnum text-xs text-ink-3">{formatDate(project.created_at)}</p>
                                            </td>
                                            <td className="px-5 py-3"><StatusPill kind="project" status={project.status} /></td>
                                            <td className={cx('tnum px-5 py-3 text-right font-semibold', Number(project.commission_amount || 0) < 0 ? 'text-ink-2' : 'text-success')}>{formatSignedPLN(project.commission_amount || 0)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={3} className="px-5 py-8 text-center text-sm text-ink-2">
                                                Brak rozliczonych projektów w historii portfela.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardBody>
                </Card>

                <aside className="space-y-6">
                    <Card as="section" aria-label="Następne kroki">
                        <CardHeader title="Następne kroki" />
                        <CardBody flush>
                            <ul className="divide-y divide-border">
                                {nextSteps.map((item, index) => (
                                    <li key={item.label}>
                                        <Link href={item.href} className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-surface-2">
                                            <span className={cx(
                                                'grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold',
                                                item.done ? 'bg-success-soft text-success' : 'bg-brass-soft text-brass-ink',
                                            )}>
                                                {item.done ? <item.icon size={16} aria-hidden="true" /> : index + 1}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-ink">{item.label}</span>
                                                <span className="block text-[13px] text-ink-2">{item.text}</span>
                                            </span>
                                            <ArrowRight size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </CardBody>
                    </Card>

                    <Card as="section" aria-label="Jak to działa">
                        <CardHeader title="Jak to działa" />
                        <CardBody>
                            <ol className="space-y-4">
                                {howItWorks.map((step, index) => (
                                    <li key={step.title} className="grid grid-cols-[32px_1fr] gap-3.5">
                                        <span className="grid h-8 w-8 place-items-center rounded-full bg-brass-soft text-[13px] font-bold text-brass-ink">{index + 1}</span>
                                        <span>
                                            <span className="block text-sm font-semibold text-ink">{step.title}</span>
                                            <span className="block text-[13px] text-ink-2">{step.text}</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                            <p className="mt-4 border-t border-border pt-3 text-[13px] font-semibold text-ink">Minimalna kwota wypłaty prowizji to {PAYOUT_MIN} PLN.</p>
                        </CardBody>
                    </Card>

                    <div id="profil" className="scroll-mt-24">
                        <ProfileSettingsWrapper user={user} />
                    </div>
                </aside>
            </div>
        </div>
    );
}
