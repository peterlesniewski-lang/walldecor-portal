'use client';

import {
    BarChart,
    Bar,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { Card, CardBody, CardHeader, formatPLN } from '@/components/ui';

interface MonthlyTurnover {
    month: string;
    total: number;
}

interface TierCounts {
    partner: number;
    partnerPlus: number;
    partnerPremium: number;
}

interface Props {
    monthlyTurnover: MonthlyTurnover[];
    tiers: TierCounts;
}

// Kolory serii to tokeny designu (chart-1…chart-5), bez gradientów.
const TIER_COLORS: Record<string, string> = {
    'Partner (10%)': 'var(--color-chart-3)',
    'Partner Plus (12%)': 'var(--color-chart-1)',
    'Partner Premium (15%)': 'var(--color-chart-2)',
};

const TICK = { fontSize: 12, fill: 'var(--color-ink-3)' };

function formatMonthLabel(ym: string): string {
    // ym is 'YYYY-MM'
    const [year, month] = ym.split('-');
    const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
    return `${months[parseInt(month, 10) - 1]} ${year.slice(2)}`;
}

function formatK(value: number): string {
    if (value >= 1000) return `${(value / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 0 })} tys.`;
    return `${value}`;
}

const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-sm border border-border bg-surface px-3.5 py-2.5 text-sm shadow-float">
            <p className="label-caps mb-1">{label}</p>
            <p className="font-display text-lg tnum text-ink">{formatPLN(Number(payload[0].value))}</p>
        </div>
    );
};

const CustomPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-sm border border-border bg-surface px-3.5 py-2.5 text-sm shadow-float">
            <p className="text-ink">
                {payload[0].name}: <strong className="tnum font-semibold">{payload[0].value}</strong>
            </p>
        </div>
    );
};

export default function AdminCharts({ monthlyTurnover, tiers }: Props) {
    const barData = monthlyTurnover.map((row) => ({
        month: formatMonthLabel(row.month),
        total: Number(row.total),
    }));

    const pieData = [
        { name: 'Partner (10%)', value: tiers.partner },
        { name: 'Partner Plus (12%)', value: tiers.partnerPlus },
        { name: 'Partner Premium (15%)', value: tiers.partnerPremium },
    ].filter((d) => d.value > 0);

    return (
        <div id="analytics" className="grid scroll-mt-24 grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
                <CardHeader title="Obrót miesięczny" action={<span className="text-[13px] text-ink-3">Projekty zakończone, 12 miesięcy</span>} />
                <CardBody>
                    {barData.length === 0 ? (
                        <p className="py-10 text-center text-sm text-ink-2">Brak zakończonych projektów w ostatnich 12 miesiącach.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke="var(--color-border)" strokeWidth={1} vertical={false} />
                                <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={formatK} tick={TICK} axisLine={false} tickLine={false} width={56} />
                                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(26, 25, 23, 0.04)' }} />
                                <Bar dataKey="total" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardBody>
            </Card>

            <Card>
                <CardHeader title="Rozkład statusów partnerskich" />
                <CardBody>
                    {pieData.length === 0 ? (
                        <p className="py-10 text-center text-sm text-ink-2">Brak architektów.</p>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={160}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={46}
                                        outerRadius={72}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="var(--color-surface)"
                                        strokeWidth={2}
                                    >
                                        {pieData.map((entry) => (
                                            <Cell key={entry.name} fill={TIER_COLORS[entry.name]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomPieTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                            <ul className="mt-3 space-y-1.5">
                                {pieData.map((entry) => (
                                    <li key={entry.name} className="flex items-center justify-between gap-3 text-sm text-ink-2">
                                        <span className="inline-flex items-center gap-2">
                                            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLORS[entry.name] }} />
                                            {entry.name}
                                        </span>
                                        <span className="tnum font-semibold text-ink">{entry.value}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
