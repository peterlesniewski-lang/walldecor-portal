import { cx } from './cx';

/**
 * Pusty stan: przerywana ramka, tytuł, wyjaśnienie, opcjonalna akcja.
 *
 *   <EmptyState title="Brak projektów" description="Zgłoś pierwszy projekt, a prowizja pojawi się tutaj." action={<Button>Zgłoś projekt</Button>} />
 *
 * `icon`: opcjonalna ikona lucide (np. <Inbox size={20} />). Tekst mówi, co zrobić dalej.
 */
interface EmptyStateProps {
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
    icon?: React.ReactNode;
    className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
    return (
        <div
            className={cx(
                'w-full rounded-md border border-dashed border-border-strong px-8 py-8 text-center text-ink-2',
                className,
            )}
        >
            {icon && <div className="mb-3 flex justify-center text-ink-3">{icon}</div>}
            <strong className="block font-semibold text-ink">{title}</strong>
            {description && <p className="mx-auto mt-1 max-w-[52ch] text-sm">{description}</p>}
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
}

export default EmptyState;
