import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canManageOperationalProjects } from '@/lib/rbac';
import {
    getArchitectOptions,
    getAssignableProjects,
    getOpenReconciliations,
    getRecentSyncRuns,
    getUnassignedCount,
    getUnassignedDocuments,
    getUnknownArchitectCodes,
} from '@/lib/subiekt/queries';
import { documentsLabel, formatDocAmount, syncRunStatusEntry } from '@/lib/subiekt/labels';
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
import RefreshButton from './RefreshButton';
import SubiektInboxClient from './SubiektInboxClient';
import SyncRunsTable from './SyncRunsTable';

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

    const [runs, unassignedCount, documents, unknownCodes, architects, assignableProjects, reconciliations] = await Promise.all([
        getRecentSyncRuns(10),
        getUnassignedCount(),
        getUnassignedDocuments(),
        getUnknownArchitectCodes(),
        getArchitectOptions(),
        getAssignableProjects(),
        getOpenReconciliations(),
    ]);
    const lastRun = runs[0] ?? null;

    return (
        <div className="space-y-6 pb-16">
            {/* Tytuł i opis strony daje nagłówek powłoki (src/lib/shellTitle.ts). */}
            {/* Status synchronizacji */}
            <section aria-labelledby="sync-status" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="sync-status" className="label-caps">Status synchronizacji</h2>
                    <RefreshButton />
                </div>
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

                        <SyncRunsTable runs={runs} />
                    </>
                ) : (
                    <EmptyState
                        title="Brak synchronizacji — agent jeszcze nie wysłał danych."
                        description="Po pierwszym uruchomieniu agenta na komputerze z Subiektem pojawi się tu data, wynik i liczba dokumentów."
                    />
                )}
            </section>

            {/* Do uzgodnienia (Loop 5b): faktury niezgodne z zamówieniem — admin uzgadnia na stronie projektu. */}
            {reconciliations.length > 0 && (
                <Card as="section" className="overflow-hidden">
                    <CardHeader title={`Do uzgodnienia (${reconciliations.length})`} />
                    <CardBody flush>
                        <p className="px-5 pt-4 text-sm text-ink-2">
                            Faktury z Subiekta mają inną kwotę niż zamówienie. Projekt nie może zostać zakończony, dopóki ktoś z zespołu nie rozłoży kwoty faktur na pozycje.
                        </p>
                        <div className="overflow-x-auto">
                            <table className="mt-3 w-full min-w-[760px] border-collapse text-sm">
                                <thead>
                                    <tr>
                                        <th scope="col" className="label-caps px-5 py-3 text-left">Projekt</th>
                                        <th scope="col" className="label-caps px-4 py-3 text-left">Architekt</th>
                                        <th scope="col" className="label-caps px-4 py-3 text-left">Zamówienie</th>
                                        <th scope="col" className="label-caps px-4 py-3 text-right">Kwota ZK</th>
                                        <th scope="col" className="label-caps px-4 py-3 text-right">Kwota faktur</th>
                                        <th scope="col" className="label-caps px-4 py-3 text-right">Różnica</th>
                                        <th scope="col" className="label-caps px-5 py-3 text-left">Od</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reconciliations.map((r) => (
                                        <tr key={`${r.projectId}-${r.rootExternalId}`} className="border-t border-border">
                                            <td className="px-5 py-3">
                                                <Link
                                                    href={`/dashboard/admin/projects/${r.projectId}`}
                                                    className="font-semibold text-brass-ink underline-offset-2 hover:underline"
                                                >
                                                    {r.projectName || r.projectId}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-ink-2">{r.architectName ?? '—'}</td>
                                            <td className="px-4 py-3 text-ink">{r.zkNumber ?? '—'}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right tnum">{formatDocAmount(r.zkNet)}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right tnum">{formatDocAmount(r.invoicedNet)}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tnum text-warning">{formatDocAmount(r.difference)}</td>
                                            <td className="whitespace-nowrap px-5 py-3 tnum text-ink-2">{formatDateTime(r.openedAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardBody>
                </Card>
            )}

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
