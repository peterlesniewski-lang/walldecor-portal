import { Card, CardBody, CardHeader, formatDate } from '@/components/ui';

/** Wpis logu zmian ZK/FP z Subiekta (zob. getProjectZkChanges w src/lib/subiekt/queries.ts). */
export interface SubiektChange {
    id: string;
    /** ISO 8601. */
    created_at: string;
    description: string;
}

/** Autor wpisów zapisanych przez synchronizację (activity_logs.user_id = NULL). */
export const SUBIEKT_AUTHOR_LABEL = 'Subiekt (synchronizacja)';

/**
 * „Zmiany zamówienia (Subiekt)” na stronie projektu — admin i architekt. Bez wpisów nie renderuje nic
 * (żadnego pustego nagłówka). Bez hooków, więc działa w komponencie serwerowym i klienckim.
 */
export default function SubiektChangesCard({ changes }: { changes: SubiektChange[] }) {
    if (changes.length === 0) return null;

    return (
        <Card as="section">
            <CardHeader title="Zmiany zamówienia (Subiekt)" />
            <CardBody flush>
                <ol className="divide-y divide-border">
                    {changes.map((change) => (
                        <li key={change.id} className="px-5 py-3.5">
                            <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                                <time className="tnum" dateTime={change.created_at}>{formatDate(change.created_at)}</time>
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
