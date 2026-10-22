import Link from 'next/link';
import { Logo } from '@/components/ui';

/**
 * Wspólna rama stron logowania: jasne tło, logo, tytuł w Fraunces, biała karta 420 px, stopka.
 * Plik pomocniczy (nie strona), używany przez signin, forgot-password, reset-password i change-password.
 */
export const AUTH_LABEL = 'text-[13px] font-semibold text-ink-2';
export const AUTH_INPUT =
    'h-10 w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 ' +
    'focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_rgba(26,25,23,0.08)] disabled:opacity-60';

export function AuthShell({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <main className="flex min-h-screen flex-col items-center bg-bg px-4 py-10 sm:py-14">
            <div className="flex w-full max-w-[420px] flex-1 flex-col justify-center">
                <div className="mb-8 text-center">
                    <div className="mb-6 flex justify-center">
                        <Logo variant="dark" height={56} priority />
                    </div>
                    <h1 className="font-display text-[32px] font-normal leading-tight tracking-[-0.01em] text-ink">
                        {title}
                    </h1>
                    {subtitle && <p className="mt-2 text-sm text-ink-2">{subtitle}</p>}
                </div>

                <div className="rounded-lg border border-border bg-surface p-6 shadow-hairline sm:p-8">{children}</div>
            </div>

            <footer className="mt-10 flex items-center justify-center gap-3 text-[13px] text-ink-2">
                <span>Portal Partnera WallDecor, wersja 1.2</span>
                <span aria-hidden="true">·</span>
                <Link href="/regulamin" target="_blank" className="text-brass-ink underline-offset-2 hover:underline">
                    Regulamin
                </Link>
            </footer>
        </main>
    );
}

/** Pole formularza: etykieta 13 px, kontrolka 40 px, opcjonalna podpowiedź pod polem. */
export function AuthField({
    id,
    label,
    hint,
    labelAside,
    children,
}: {
    id: string;
    label: string;
    hint?: React.ReactNode;
    labelAside?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={id} className={AUTH_LABEL}>
                    {label}
                </label>
                {labelAside}
            </div>
            {children}
            {hint && <p className="text-xs text-ink-2">{hint}</p>}
        </div>
    );
}
