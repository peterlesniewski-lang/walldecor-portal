import { Card, CardBody, CardHeader, formatDateTime } from '@/components/ui';
import type { ProjectZkChange } from '@/lib/subiekt/queries';

/** Autor wpisów zapisanych przez synchronizację (activity_logs.user_id = NULL). */
const SUBIEKT_AUTHOR_LABEL = 'Subiekt (synchronizacja)';

/**
 * „Zmiany dokumentów (Subiekt)” (zmiany ZK/FP i korekty KFS) na stronie projektu — admin i architekt. Dane z getProjectZkChanges.
 * Bez wpisów nie renderuje nic (żadnego pustego nagłówka). Bez hooków, więc działa w komponencie
 * serwerowym i klienckim.
 */
export default function SubiektChangesCard({ changes }: { changes: ProjectZkChange[] }) {
    if (changes.length === 0) return null;

    return (
        <Card as="section">
            <CardHeader title="Zmiany dokumentów (Subiekt)" />
            <CardBody flush>
                <ol className="divide-y divide-border">
                    {changes.map((change) => (
                        <li key={change.id} className="px-5 py-3.5">
                            <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                                <time className="tnum" dateTime={change.created_at}>{formatDateTime(change.created_at)}</time>
                                <span aria-hidden="true">·</span>
                                <span>{SUBIEKT_AUTHOR_LABEL}</span>
                            </p>
                            <p className="mt-1 text-sm text-ink">{change.description}</p>
                        </li>
                    ))}
                </ol>
            </CardBody>
        </Card>
    );
}
