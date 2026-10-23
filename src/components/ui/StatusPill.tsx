import { cx } from './cx';
import { getStatusEntry, type StatusKind, type Tone } from './statusMaps';

export {
    PROJECT_STATUS,
    COMMISSION_STATUS,
    PAYOUT_STATUS,
    CASHBACK_STATUS,
    STATUS_MAPS,
    getStatusEntry,
} from './statusMaps';
export type { Tone, StatusEntry, StatusKind } from './statusMaps';

/**
 * Pigułka statusu: 24 px, kropka + polska etykieta.
 *
 *   <StatusPill kind="project" status={project.status} />      // kody z bazy -> polskie etykiety
 *   <StatusPill kind="payout" status={payout.status} />
 *   <StatusPill tone="warning">1 wniosek</StatusPill>          // własny tekst i ton
 *
 * kind: 'project' | 'commission' | 'payout' | 'cashback'
 * tone: 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'
 */
const TONE_CLASS: Record<Tone, string> = {
    neutral: 'bg-ink/[0.06] text-ink-2',
    accent: 'bg-brass-soft text-brass-ink',
    info: 'bg-info-soft text-info',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
};

interface StatusPillProps {
    kind?: StatusKind;
    status?: string | null;
    tone?: Tone;
    children?: React.ReactNode;
    className?: string;
}

export function StatusPill({ kind, status, tone, children, className }: StatusPillProps) {
    const entry = kind ? getStatusEntry(kind, status) : null;
    const resolvedTone: Tone = tone ?? entry?.tone ?? 'neutral';
    const label = children ?? entry?.label ?? '';

    return (
        <span
            className={cx(
                'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 text-xs font-semibold tracking-[0.02em]',
                TONE_CLASS[resolvedTone],
                className,
            )}
        >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            {label}
        </span>
    );
}

export default StatusPill;
