import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cx } from './cx';

/**
 * Przycisk. Jeden wariant `primary` na ekran.
 *
 *   <Button onClick={...}>Przekaż do płatności</Button>                 // primary, md (40 px)
 *   <Button variant="secondary" size="sm">Zarejestruj architekta</Button>
 *   <Button href="/dashboard/help" variant="ghost">Pomoc</Button>        // z href renderuje <Link>
 *   <Button variant="danger" loading>Odrzuć</Button>
 *
 * variant: 'primary' (mosiądz, ciemny tekst) | 'secondary' (biały, hairline) | 'ghost' | 'danger'
 * size: 'md' (40 px) | 'sm' (32 px)
 * loading: pokazuje spinner i blokuje kliknięcie. disabled: przygaszony.
 * Etykieta nazywa skutek ("Zakończ projekt"), bez wielkich liter.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
    primary: 'border-transparent bg-brass text-ink hover:bg-[#D9B64A]',
    secondary: 'bg-surface border-border-strong text-ink hover:border-ink-3',
    ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-ink/5 hover:text-ink',
    danger: 'bg-surface border-danger text-danger hover:bg-danger-soft',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
    md: 'h-10 px-[18px] text-sm',
    sm: 'h-8 px-3 text-[13px]',
};

interface ButtonOwnProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
    /** Ikona lucide (np. <Plus size={16} />) przed etykietą. */
    icon?: React.ReactNode;
    fullWidth?: boolean;
    className?: string;
    children?: React.ReactNode;
}

type ButtonAsButton = ButtonOwnProps &
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps> & { href?: undefined };
type ButtonAsLink = ButtonOwnProps &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonOwnProps | 'href'> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
    const {
        variant = 'primary',
        size = 'md',
        loading = false,
        disabled = false,
        icon,
        fullWidth = false,
        className,
        children,
        ...rest
    } = props;

    const isInactive = disabled || loading;
    const classes = cx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm border font-semibold leading-none',
        'transition-[background-color,border-color] duration-150 active:translate-y-px',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        fullWidth && 'w-full',
        isInactive && 'cursor-not-allowed opacity-45 active:translate-y-0',
        className,
    );

    const content = (
        <>
            {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : icon}
            {children}
        </>
    );

    if ('href' in rest && rest.href !== undefined) {
        const { href, onClick, ...anchorRest } = rest as Omit<ButtonAsLink, keyof ButtonOwnProps>;
        return (
            <Link
                href={href}
                aria-disabled={isInactive || undefined}
                tabIndex={isInactive ? -1 : undefined}
                // Handler tylko gdy jest potrzebny: komponent serwerowy nie może przekazać funkcji do <Link>.
                onClick={
                    onClick
                        ? (e) => {
                              if (isInactive) {
                                  e.preventDefault();
                                  return;
                              }
                              onClick(e);
                          }
                        : undefined
                }
                className={cx(classes, isInactive && 'pointer-events-none')}
                {...anchorRest}
            >
                {content}
            </Link>
        );
    }

    const { type = 'button', ...buttonRest } = rest as Omit<ButtonAsButton, keyof ButtonOwnProps>;
    return (
        <button
            type={type}
            disabled={isInactive}
            aria-busy={loading || undefined}
            className={classes}
            {...buttonRest}
        >
            {content}
        </button>
    );
}

export default Button;
