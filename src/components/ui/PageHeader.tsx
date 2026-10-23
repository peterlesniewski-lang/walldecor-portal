import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cx } from './cx';

/**
 * Nagłówek strony: tytuł w Fraunces, podtytuł, akcje po prawej, opcjonalny link "wróć".
 *
 *   <PageHeader
 *     title="Centrum operacyjne"
 *     subtitle="Wypłaty, projekty i partnerzy w jednym widoku."
 *     back={{ href: '/dashboard/admin', label: 'Wróć do listy' }}
 *     actions={<><Button variant="secondary">Zarejestruj architekta</Button><Button>Dodaj projekt</Button></>}
 *   />
 *
 * Renderuje <h1>: na stronie ma być dokładnie jeden PageHeader. Akcje to jeden przycisk primary + reszta secondary.
 */
interface PageHeaderProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
    back?: { href: string; label?: string };
    className?: string;
}

export function PageHeader({ title, subtitle, actions, back, className }: PageHeaderProps) {
    return (
        <header className={cx('mb-6 lg:mb-8', className)}>
            {back && (
                <Link
                    href={back.href}
                    className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
                >
                    <ArrowLeft size={16} aria-hidden="true" />
                    {back.label ?? 'Wróć'}
                </Link>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="font-display text-[28px] font-normal leading-[1.15] tracking-[-0.01em] text-ink text-balance lg:text-[32px]">
                        {title}
                    </h1>
                    {subtitle && <p className="mt-1 text-[15px] text-ink-2">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
            </div>
        </header>
    );
}

export default PageHeader;
