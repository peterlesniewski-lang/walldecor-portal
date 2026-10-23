import { cx } from './cx';

/**
 * Kafelek KPI: etykieta 12 px wielkimi literami, wartość w Fraunces 34 px z cyframi tabelarycznymi.
 *
 *   <KpiTile label="Do wypłaty" value={formatNumber(350)} unit="PLN" description="1 wniosek czeka na decyzję" highlight />
 *   <KpiTile label="Projekty w toku" value="3" />                       // bez jednostki
 *
 * value: gotowy tekst (użyj formatNumber z ./format, bez waluty, bo walutę daje `unit`).
 * unit: mała jednostka po wartości, zwykle "PLN".
 * highlight: mosiężna ramka i delikatne tło. TYLKO JEDEN kafelek na ekran, ten który wymaga działania.
 */
interface KpiTileProps {
    label: string;
    value: React.ReactNode;
    unit?: string;
    description?: React.ReactNode;
    highlight?: boolean;
    className?: string;
}

export function KpiTile({ label, value, unit, description, highlight = false, className }: KpiTileProps) {
    return (
        <div
            className={cx(
                'min-w-0 rounded-md border px-5 py-[18px] shadow-hairline',
                highlight ? 'border-brass bg-[linear-gradient(180deg,#FFFDF5,#FFFFFF)]' : 'border-border bg-surface',
                className,
            )}
        >
            <div className="label-caps mb-2.5">{label}</div>
            <div className="font-display text-[34px] font-normal leading-none tracking-[-0.01em] tnum text-ink">
                {value}
                {unit && <small className="ml-1.5 font-sans text-sm font-normal tracking-normal text-ink-3">{unit}</small>}
            </div>
            {description && <div className="mt-2.5 text-[13px] text-ink-2">{description}</div>}
        </div>
    );
}

export default KpiTile;
