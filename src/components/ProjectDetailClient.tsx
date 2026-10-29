'use client';

import Link from 'next/link';
import {
    ArrowLeft,
    Banknote,
    Package,
    Image as ImageIcon,
    Box,
    Lightbulb,
    Wind,
    Layout,
} from 'lucide-react';
import {
    Button,
    Card,
    CardBody,
    CardHeader,
    EmptyState,
    KpiTile,
    StatusPill,
    cx,
    formatDate,
    formatNumber,
    formatPLN,
    type Tone,
} from '@/components/ui';
import { CASHBACK_RATE } from '@/lib/partnerProgram';
import ProjectFilesSection, { ProjectFile } from "@/components/ProjectFilesSection";
import SubiektChangesCard from "@/components/SubiektChangesCard";
import { summarizeItemCommission } from "@/lib/itemCommission";
import type { ProjectZkChange } from "@/lib/subiekt/queries";

interface ProjectDetailClientProps {
    project: any;
    initialFiles: ProjectFile[];
    currentUserId: string;
    zkChanges: ProjectZkChange[];
}

const categoryIcons: any = {
    'Tapety': ImageIcon,
    'Sztukateria': Layout,
    'Meble': Box,
    'Oświetlenie': Lightbulb,
    'Tekstylia': Wind,
    'Inne': Package
};

// Wpis osi czasu zależny od statusu
interface TimelineEvent {
    label: string;
    desc: string;
    date: string | null;
    tone: Tone;
}

const TONE_DOT: Partial<Record<Tone, string>> = {
    danger: 'bg-danger',
    success: 'bg-success',
    info: 'bg-info',
    accent: 'bg-brass',
    neutral: 'bg-ink-3',
};

function buildTimeline(project: any): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    const submissionDate = formatDate(project.created_at);

    // Najnowsze zdarzenie na górze
    if (project.status === 'NIEZREALIZOWANY') {
        events.push({ label: 'Niezrealizowany', desc: 'Projekt odrzucony lub anulowany', date: null, tone: 'danger' });
    } else if (project.status === 'ZAKOŃCZONY') {
        events.push({ label: 'Zakończono', desc: 'Projekt zrealizowany pomyślnie', date: null, tone: 'success' });
    } else if (project.status === 'W_REALIZACJI') {
        events.push({ label: 'W realizacji', desc: 'Projekt przekazany do realizacji', date: null, tone: 'info' });
    } else if (project.status === 'PRZYJĘTY') {
        events.push({ label: 'Przyjęto', desc: 'Projekt przyjęty przez WallDecor', date: null, tone: 'accent' });
    }

    // Zgłoszenie zawsze na końcu
    events.push({ label: 'Zgłoszono', desc: 'Przesłano formularz projektu', date: submissionDate, tone: 'neutral' });

    return events;
}

export default function ProjectDetailClient({ project, initialFiles, currentUserId, zkChanges }: ProjectDetailClientProps) {
    const items: any[] = project.items ?? [];
    const totalNet = items.reduce((acc: number, item: any) => acc + (Number(item.amount_net) || 0), 0);
    const productNet = items
        .filter((item: any) => item.type !== 'INSTALLATION')
        .reduce((acc: number, item: any) => acc + (Number(item.amount_net) || 0), 0);
    const commissions: any[] = project.commissions ?? [];
    const sumByStatus = (statuses: string[]) => commissions
        .filter((c: any) => statuses.includes(c.status))
        .reduce((acc: number, c: any) => acc + (Number(c.amount_net) || 0), 0);
    const totalCommission = commissions.reduce((acc: number, c: any) => acc + (Number(c.amount_net) || 0), 0);
    const pendingCommission = sumByStatus(['PENDING']);
    const earnedCommission = sumByStatus(['EARNED']);
    const inPaymentCommission = sumByStatus(['IN_PAYMENT']);
    const paidCommission = sumByStatus(['PAID']);

    const cashbackAmount = productNet * CASHBACK_RATE;
    const cashbackCredited = project.status === 'ZAKOŃCZONY';

    const payoutStatus = project.payout?.status ?? null;
    let commissionNote = 'Netto do wypłaty';
    if (project.status === 'NIEZREALIZOWANY') commissionNote = 'Projekt niezrealizowany';
    else if (payoutStatus === 'PAID') commissionNote = 'Wypłacono';
    else if (payoutStatus === 'IN_PAYMENT') commissionNote = 'W trakcie wypłaty';
    else if (payoutStatus === 'PENDING') commissionNote = 'Wniosek złożony, oczekuje';

    const timeline = buildTimeline(project);

    const breakdown: { label: string; value: number }[] = [
        { label: 'Planowana', value: pendingCommission },
        { label: 'Zarobiona', value: earnedCommission },
        { label: 'W wypłacie', value: inPaymentCommission },
        { label: 'Wypłacona', value: paidCommission },
    ].filter((row) => row.value > 0);

    return (
        <div className="space-y-6 pb-16">
            <Link
                href="/dashboard/projects"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
            >
                <ArrowLeft size={16} aria-hidden="true" />
                Wróć do listy
            </Link>

            {/* Nagłówek projektu */}
            <Card as="section">
                <CardBody className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="min-w-0">
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                            <StatusPill kind="project" status={project.status} />
                            <span className="font-mono text-xs text-ink-3">ID: {project.id}</span>
                        </div>
                        <h2 className="font-display text-[34px] font-normal leading-[1.1] tracking-[-0.01em] text-ink">{project.name}</h2>
                        <p className="mt-2 text-sm text-ink-2">Klient: <span className="font-semibold text-ink">{project.client_label}</span></p>
                    </div>
                    <div className="shrink-0 md:text-right">
                        <p className="label-caps mb-1">Data zgłoszenia</p>
                        <p className="tnum text-base font-semibold text-ink">{formatDate(project.created_at)}</p>
                    </div>
                </CardBody>
            </Card>

            {/* Kafelki */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <KpiTile
                    label="Wartość projektu"
                    value={formatNumber(totalNet)}
                    unit="PLN"
                    description="Suma pozycji netto"
                />
                <KpiTile
                    label="Prowizja"
                    value={formatNumber(totalCommission)}
                    unit="PLN"
                    highlight={earnedCommission > 0}
                    description={
                        breakdown.length > 0 ? (
                            <span className="block space-y-0.5">
                                {breakdown.map((row) => (
                                    <span key={row.label} className="tnum flex justify-between gap-3">
                                        <span>{row.label}</span>
                                        <span className="font-semibold text-ink">{formatPLN(row.value)}</span>
                                    </span>
                                ))}
                            </span>
                        ) : (
                            commissionNote
                        )
                    }
                />
                <KpiTile
                    label={`Cashback ${Math.round(CASHBACK_RATE * 100)}%`}
                    value={formatNumber(cashbackAmount)}
                    unit="PLN"
                    description={cashbackCredited ? 'Naliczony po zakończeniu projektu, sprawdź w portfelu' : 'Naliczany od produktów po zakończeniu projektu'}
                />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Pozycje i prowizje per pozycja */}
                <Card as="section" className="min-w-0 lg:col-span-2">
                    <CardHeader title="Elementy projektu" />
                    <CardBody flush>
                        {items.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-border bg-surface-2">
                                            <th className="label-caps px-5 py-3">Pozycja</th>
                                            <th className="label-caps px-3 py-3 text-right">Wartość netto</th>
                                            <th className="label-caps px-3 py-3">Prowizja</th>
                                            <th className="label-caps px-5 py-3 text-right">Kwota</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {items.map((item: any) => {
                                            const Icon = categoryIcons[item.category] || Package;
                                            const isInstallation = item.type === 'INSTALLATION';
                                            const comm = summarizeItemCommission(commissions, item.id);
                                            const commRate = comm?.rate != null ? Math.round(comm.rate * 100) : null;
                                            return (
                                                <tr key={item.id}>
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex items-start gap-3">
                                                            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-brass-soft text-brass-ink">
                                                                <Icon size={16} aria-hidden="true" />
                                                            </span>
                                                            <div className="min-w-0">
                                                                <p className="font-semibold text-ink">{item.category}</p>
                                                                <p className="text-[13px] text-ink-2">{item.description || 'Brak opisu elementu.'}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="tnum px-3 py-3.5 text-right font-semibold text-ink">{formatPLN(item.amount_net)}</td>
                                                    <td className="px-3 py-3.5">
                                                        {comm ? (
                                                            <span className="inline-flex flex-wrap items-center gap-2">
                                                                <StatusPill kind="commission" status={comm.status} />
                                                                {commRate !== null && <span className="tnum text-[13px] text-ink-2">{commRate}%</span>}
                                                            </span>
                                                        ) : isInstallation ? (
                                                            <span className="text-[13px] text-ink-2">Montaż — bez prowizji</span>
                                                        ) : project.status === 'ZGŁOSZONY' ? (
                                                            <span className="text-[13px] text-ink-2">Prowizja po akceptacji</span>
                                                        ) : (
                                                            <span className="text-[13px] text-ink-2">bez prowizji</span>
                                                        )}
                                                    </td>
                                                    <td className={cx('tnum px-5 py-3.5 text-right font-semibold', comm ? 'text-ink' : 'text-ink-3')}>
                                                        {comm ? formatPLN(comm.amount) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-5">
                                <EmptyState title="Brak zdefiniowanych elementów" description="Opiekun WallDecor doda pozycje po wycenie projektu." />
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* Rozliczenie i historia */}
                <div className="space-y-6">
                    <Card as="section">
                        <CardHeader title="Rozliczenie prowizji" />
                        <CardBody className="space-y-3">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="text-sm text-ink-2">Obrót netto</span>
                                <span className="tnum text-sm font-semibold text-ink">{formatPLN(totalNet)}</span>
                            </div>
                            {breakdown.map((row) => (
                                <div key={row.label} className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm text-ink-2">{row.label}</span>
                                    <span className="tnum text-sm font-semibold text-ink">{formatPLN(row.value)}</span>
                                </div>
                            ))}
                            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
                                <span className="text-sm font-semibold text-ink">Łącznie</span>
                                <span className="tnum text-base font-semibold text-ink">{formatPLN(totalCommission)}</span>
                            </div>
                            <p className="text-xs text-ink-2">{commissionNote}</p>

                            {earnedCommission > 0 && (
                                <Button
                                    href="/dashboard/wallet"
                                    fullWidth
                                    icon={<Banknote size={16} aria-hidden="true" />}
                                >
                                    Wypłać środki
                                </Button>
                            )}
                        </CardBody>
                    </Card>

                    <Card as="section">
                        <CardHeader title="Historia zdarzeń" />
                        <CardBody>
                            <ol className="relative space-y-6 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-border">
                                {timeline.map((event, i) => (
                                    <li key={i} className="relative pl-7">
                                        <span className={cx('absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-4 ring-surface', TONE_DOT[event.tone] ?? 'bg-ink-3')} aria-hidden="true" />
                                        <p className="text-sm font-semibold text-ink">{event.label}</p>
                                        <p className="text-[13px] text-ink-2">{event.desc}</p>
                                        {event.date && <p className="tnum mt-0.5 text-xs text-ink-3">{event.date}</p>}
                                    </li>
                                ))}
                            </ol>
                        </CardBody>
                    </Card>
                </div>
            </div>

            <SubiektChangesCard changes={zkChanges} />

            <ProjectFilesSection
                projectId={project.id}
                currentUserId={currentUserId}
                initialFiles={initialFiles}
                isAdmin={false}
            />
        </div>
    );
}
