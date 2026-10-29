import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canManageOperationalProjects } from '@/lib/rbac';
import {
    getArchitectOptions,
    getAssignableProjects,
    getRecentSyncRuns,
    getUnassignedCount,
    getUnassignedDocuments,
    getUnknownArchitectCodes,
} from '@/lib/subiekt/queries';
import { documentsLabel, syncRunStatusEntry } from '@/lib/subiekt/labels';
import {
    Banner,
    Card,
    CardBody,
    CardHeader,
    EmptyState,
    KpiTile,
    StatusPill,
    formatDateTime,
    formatNumber,
} from '@/components/ui';
import { TD_CLASS, TH_CLASS, ROW_CLASS } from '../../projects/[id]/styles';
import SubiektInboxClient from './SubiektInboxClient';

export const dynamic = 'force-dynamic';

/**
 * Integracja Subiekt GT (PLAN-SUBIEKT-2026-10-29.md, Loop 4): stan synchronizacji, skrzynka nieprzypisanych
 * dokumentów z akcjami admina i nieznane kody architektów. Wszystko z bazy; ADMIN i STAFF.
 */
export default async function SubiektIntegrationPage() {
    const session = await getServerSession(authOptions);
    if (!session || !canManageOperationalProjects(session.user.role)) {
        return <Banner tone="danger" title="Brak uprawnień">Ta strona jest dostępna tylko dla administratora i zespołu.</Banner>;
    }

    const [runs, unassignedCount, documents, unknownCodes, architects, assignableProjects] = await Promise.all([
        getRecentSyncRuns(10),
        getUnassignedCount(),
        getUnassignedDocuments(),
        getUnknownArchitectCodes(),
        getArchitectOptions(),
        getAssignableProjects(),
    ]);
    const lastRun = runs[0] ?? null;

    return (
        <div className="space-y-6 pb-16">
            {/* Tytuł i opis strony daje nagłówek powłoki (src/lib/shellTitle.ts). */}
            {/* Status synchronizacji */}
            <section aria-labelledby="sync-status" className="space-y-4">
                <h2 id="sync-status" className="label-caps">Status synchronizacji</h2>
                {lastRun ? (
                    <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <KpiTile
                                label="Ostatnia synchronizacja"
                                value={<span className="text-[24px]">{formatDateTime(lastRun.started_at)}</span>}
                                description={
                                    <span className="inline-flex flex-wrap items-center gap-2">
                                        <StatusPill tone={syncRunStatusEntry(lastRun.status).tone}>
                                            {syncRunStatusEntry(lastRun.status).label}
                                        </StatusPill>
                                        {lastRun.agent_version && <span>agent {lastRun.agent_version}</span>}
                                    </span>
                                }
                            />
                            <KpiTile
                                label="Ostatnia paczka"
                                value={formatNumber(lastRun.documents_accepted)}
                                unit="przyjętych"
                                description={`bez zmian: ${formatNumber(lastRun.documents_unchanged)} · odrzucone: ${formatNumber(lastRun.documents_rejected)}`}
                            />
                            <KpiTile
                                label="Nieprzypisane"
                                value={formatNumber(unassignedCount)}
                                description={unassignedCount > 0 ? 'Czekają w skrzynce poniżej' : 'Skrzynka jest pusta'}
                                highlight={unassignedCount > 0}
                            />
                        </div>

                        <Card className="overflow-hidden">
                            <CardHeader title="Ostatnie uruchomienia" />
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[860px] border-collapse text-sm">
                                    <thead>
                                        <tr>
                                            <th scope="col" className={TH_CLASS}>Start</th>
                                            <th scope="col" className={TH_CLASS}>Koniec</th>
                                            <th scope="col" className={TH_CLASS}>Status</th>
                                            <th scope="col" className={`${TH_CLASS} text-right`}>Strony</th>
                                            <th scope="col" className={`${TH_CLASS} text-right`}>Przyjęte</th>
                                            <th scope="col" className={`${TH_CLASS} text-right`}>Bez zmian</th>
                                            <th scope="col" className={`${TH_CLASS} text-right`}>Odrzucone</th>
                                            <th scope="col" className={`${TH_CLASS} text-right`}>Nieprzypisane</th>
                                            <th scope="col" className={TH_CLASS}>Błąd</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {runs.map((run) => {
                                            const status = syncRunStatusEntry(run.status);
                                            return (
                                                <tr key={run.id} className={ROW_CLASS}>
                                                    <td className={`${TD_CLASS} whitespace-nowrap tnum`}>{formatDateTime(run.started_at)}</td>
                                                    <td className={`${TD_CLASS} whitespace-nowrap tnum text-ink-2`}>{formatDateTime(run.finished_at)}</td>
                                                    <td className={TD_CLASS}><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                                                    <td className={`${TD_CLASS} text-right tnum`}>{run.pages_received}/{run.pages_expected}</td>
                                                    <td className={`${TD_CLASS} text-right tnum`}>{formatNumber(run.documents_accepted)}</td>
                                                    <td className={`${TD_CLASS} text-right tnum`}>{formatNumber(run.documents_unchanged)}</td>
                                                    <td className={`${TD_CLASS} text-right tnum`}>{formatNumber(run.documents_rejected)}</td>
                                                    <td className={`${TD_CLASS} text-right tnum`}>{formatNumber(run.documents_unassigned)}</td>
                                                    <td className={`${TD_CLASS} max-w-[280px] text-ink-2`}>
                                                        {run.error ? <span className="break-words text-danger">{run.error}</span> : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </>
                ) : (
                    <EmptyState
                        title="Brak synchronizacji — agent jeszcze nie wysłał danych."
                        description="Po pierwszym uruchomieniu agenta na komputerze z Subiektem pojawi się tu data, wynik i liczba dokumentów."
                    />
                )}
            </section>

            {/* Skrzynka nieprzypisanych */}
            <SubiektInboxClient documents={documents} architects={architects} assignableProjects={assignableProjects} />

            {/* Nieznane kody architektów */}
            {unknownCodes.length > 0 && (
                <Card as="section">
                    <CardHeader title="Nieznane kody architektów" />
                    <CardBody className="space-y-4">
                        <ul className="divide-y divide-border rounded-sm border border-border">
                            {unknownCodes.map((entry) => (
                                <li key={entry.code} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                                    <span className="font-mono font-semibold text-ink">{entry.code}</span>
                                    <span className="tnum text-ink-2">{documentsLabel(entry.documents)}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-sm text-ink-2">
                            Ustaw kod w profilu architekta (pole „Kod w Subiekcie”), dokumenty przypiszą się przy następnej synchronizacji.{' '}
                            <Link
                                href="/dashboard/admin/architects"
                                className="font-semibold text-brass-ink underline-offset-2 hover:underline"
                            >
                                Przejdź do architektów
                            </Link>
                        </p>
                    </CardBody>
                </Card>
            )}
        </div>
    );
}
