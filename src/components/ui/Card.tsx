import { cx } from './cx';

/**
 * Karta: biała, hairline, promień 12 px.
 *
 *   <Card>
 *     <CardHeader title="Do wypłaty" action={<StatusPill tone="warning">1 wniosek</StatusPill>} />
 *     <CardBody>...</CardBody>
 *   </Card>
 *
 * CardBody ma padding 20 px; `flush` zdejmuje go (np. dla tabeli na całą szerokość karty).
 * Card jest zwykłym <div>, więc można go używać w Server Components.
 */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    as?: 'div' | 'section' | 'article';
}

export function Card({ as: Tag = 'div', className, ...rest }: CardProps) {
    return (
        <Tag
            className={cx('rounded-md border border-border bg-surface shadow-hairline', className)}
            {...rest}
        />
    );
}

interface CardHeaderProps {
    title: React.ReactNode;
    /** Prawa strona nagłówka: pigułka, przełącznik, przycisk. */
    action?: React.ReactNode;
    className?: string;
}

export function CardHeader({ title, action, className }: CardHeaderProps) {
    return (
        <div className={cx('flex items-center justify-between gap-3 border-b border-border px-5 py-4', className)}>
            <h2 className="min-w-0 text-base font-semibold text-ink">{title}</h2>
            {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
    );
}

interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
    flush?: boolean;
}

export function CardBody({ flush = false, className, ...rest }: CardBodyProps) {
    return <div className={cx(!flush && 'p-5', className)} {...rest} />;
}

export default Card;
