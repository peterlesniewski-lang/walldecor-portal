'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, StatusPill, formatDateTime, formatNumber } from '@/components/ui';
import type { SyncRunRow } from '@/lib/subiekt/queries';
import { syncRunStatusEntry } from '@/lib/subiekt/labels';
import { ROW_CLASS, TD_CLASS, TH_CLASS } from '../../projects/[id]/styles';

/** Domyślnie widać tyle uruchomień, żeby skrzynka została wysoko; reszta po kliknięciu. */
const COLLAPSED_ROWS = 5;

/** „Ostatnie uruchomienia” agenta (do 10 z getRecentSyncRuns), zwijane po stronie klienta. */
export default function SyncRunsTable({ runs }: { runs: SyncRunRow[] }) {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? runs : runs.slice(0, COLLAPSED_ROWS);
    const canToggle = runs.length > COLLAPSED_ROWS;

    return (
        <Card className="overflow-hidden">
            <CardHeader
                title="Ostatnie uruchomienia"
                action={
                    canToggle ? (
                        <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                            {expanded ? 'Pokaż mniej' : `Pokaż wszystkie (${runs.length})`}
                        </Button>
                    ) : undefined
                }
            />
            <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] border-collapse text-sm">
                    <thead>
                        <tr>
                            <th scope="col" className={TH_CLASS}>Start</th>
                            <th scope="col" className={TH_CLASS}>Koniec</th>
                            <th scope="col" className={TH_CLASS}>Status</th>
                            <th scope="col" className={TH_CLASS}>Agent</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Strony</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Przyjęte</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Bez zmian</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Odrzucone</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Nieprzypisane</th>
                            <th scope="col" className={TH_CLASS}>Błąd</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((run) => {
                            const status = syncRunStatusEntry(run.status);
                            const tooManyPages = run.pages_received > run.pages_expected;
                            return (
                                <tr key={run.id} className={ROW_CLASS}>
                                    <td className={`${TD_CLASS} whitespace-nowrap tnum`}>{formatDateTime(run.started_at)}</td>
                                    <td className={`${TD_CLASS} whitespace-nowrap tnum text-ink-2`}>{formatDateTime(run.finished_at)}</td>
                                    <td className={TD_CLASS}><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                                    <td className={`${TD_CLASS} whitespace-nowrap font-mono text-xs text-ink-2`}>{run.agent_version ?? '—'}</td>
                                    <td className={`${TD_CLASS} text-right tnum`}>
                                        <span className="inline-flex flex-wrap items-center justify-end gap-2">
                                            {tooManyPages && <StatusPill tone="warning">więcej stron niż zapowiedziano</StatusPill>}
                                            {run.pages_received}/{run.pages_expected}
                                        </span>
                                    </td>
                                    <td className={`${TD_CLASS} text-right tnum`}>{formatNumber(run.documents_accepted)}</td>
                                    <td className={`${TD_CLASS} text-right tnum`}>{formatNumber(run.documents_unchanged)}</td>
                                    <td className={`${TD_CLASS} text-right tnum`}>{formatNumber(run.documents_rejected)}</td>
                                    <td className={`${TD_CLASS} text-right tnum`}>{formatNumber(run.documents_unassigned)}</td>
                                    <td className={`${TD_CLASS} max-w-[260px] text-ink-2`}>
                                        {run.error ? <span className="break-words text-danger">{run.error}</span> : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
