import { cx } from '@/components/ui';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Opis akcji: aria-label i podpowiedź. */
    label: string;
    danger?: boolean;
}

/** Ikonowy przycisk akcji w wierszu tabeli (32 px, ghost). */
export function IconButton({ label, danger = false, className, children, ...rest }: IconButtonProps) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            className={cx(
                'grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-2 transition-colors',
                'hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45',
                danger && 'hover:bg-danger-soft hover:text-danger',
                className,
            )}
            {...rest}
        >
            {children}
        </button>
    );
}

export default IconButton;
