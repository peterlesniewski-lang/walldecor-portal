import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import { cx } from './cx';

/**
 * Komunikat w treści strony (nie toast): ikona w kółku, tytuł, opis, opcjonalna akcja po prawej.
 *
 *   <Banner tone="warning" title="Brak numeru konta">Wypłata zostanie wstrzymana, dopóki partner nie uzupełni danych.</Banner>
 *   <Banner tone="info" title="Nowe zasady od 1 stycznia" action={<Button size="sm" variant="secondary" href="/regulamin">Zobacz regulamin</Button>} />
 *
 * tone: 'info' | 'warning' | 'success' | 'danger'. Dla błędów formularza użyj tone="danger"; komunikat mówi, co zrobić.
 * Banner z tone="danger" i "warning" ma role="alert", pozostałe role="status".
 */
export type BannerTone = 'info' | 'warning' | 'success' | 'danger';

const ICON: Record<BannerTone, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
    info: Info,
    warning: AlertTriangle,
    success: CheckCircle2,
    danger: OctagonAlert,
};

const ICON_CLASS: Record<BannerTone, string> = {
    info: 'bg-info-soft text-info',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
};

interface BannerProps {
    tone?: BannerTone;
    title?: React.ReactNode;
    children?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}

export function Banner({ tone = 'info', title, children, action, className }: BannerProps) {
    const Icon = ICON[tone];
    return (
        <div
            role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
            className={cx('flex w-full items-start gap-3.5 rounded-md border border-border bg-surface px-4 py-3.5', className)}
        >
            <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full', ICON_CLASS[tone])}>
                <Icon size={16} aria-hidden={true} />
            </span>
            <div className="min-w-0 flex-1">
                {title && <strong className="block font-semibold text-ink">{title}</strong>}
                {children && <div className="text-sm text-ink-2">{children}</div>}
            </div>
            {action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
    );
}

export default Banner;
