'use client';

import { Button } from './Button';
import { cx } from './cx';

/**
 * Potwierdzenie inline, w miejscu akcji. Zastępuje window.confirm().
 * Steruj nim stanem rodzica: pokaż InlineConfirm zamiast przycisku, gdy użytkownik kliknie akcję.
 *
 *   const [confirming, setConfirming] = useState(false);
 *   {confirming ? (
 *     <InlineConfirm
 *       question="Odrzucić wniosek PR_4AD59?"
 *       confirmLabel="Odrzuć"
 *       cancelLabel="Zostaw"
 *       danger
 *       loading={pending}
 *       onConfirm={doReject}
 *       onCancel={() => setConfirming(false)}
 *     />
 *   ) : (
 *     <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>Odrzuć</Button>
 *   )}
 *
 * confirmLabel nazywa skutek ("Odrzuć", "Zakończ projekt"), nie "Tak". danger: czerwony przycisk potwierdzenia.
 */
interface InlineConfirmProps {
    question: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    loading?: boolean;
    className?: string;
}

export function InlineConfirm({
    question,
    onConfirm,
    onCancel,
    confirmLabel = 'Potwierdź',
    cancelLabel = 'Anuluj',
    danger = false,
    loading = false,
    className,
}: InlineConfirmProps) {
    return (
        <div
            role="alertdialog"
            aria-label={typeof question === 'string' ? question : undefined}
            className={cx(
                'inline-flex flex-wrap items-center gap-2.5 rounded-sm border border-[#EAD9A6] bg-warning-soft py-2 pl-3.5 pr-2 text-sm text-ink',
                className,
            )}
        >
            <span>{question}</span>
            <Button size="sm" variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
                {confirmLabel}
            </Button>
            <Button size="sm" variant="ghost" disabled={loading} onClick={onCancel}>
                {cancelLabel}
            </Button>
        </div>
    );
}

export default InlineConfirm;
