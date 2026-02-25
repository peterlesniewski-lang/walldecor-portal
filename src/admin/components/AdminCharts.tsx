'use client';

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts';

interface MonthlyTurnover {
    month: string;
    total: number;
}

interface TierCounts {
    beginner: number;
    silver: number;
    gold: number;
    platinum: number;
}

interface Props {
    monthlyTurnover: MonthlyTurnover[];
    tiers: TierCounts;
}

const TIER_COLORS: Record<string, string> = {
    Beginner: '#94a3b8',
    Silver: '#cbd5e1',
    Gold: '#D4AF37',
    Platinum: '#6366f1',
};

function formatMonthLabel(ym: string): string {
    // ym is 'YYYY-MM'
    const [year, month] = ym.split('-');
    const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
    return `${months[parseInt(month, 10) - 1]} ${year.slice(2)}`;
}

function formatK(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return `${value}`;
}

const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 shadow-lg text-sm">
            <p className="font-black text-stone-700 mb-1">{label}</p>
            <p className="text-brand-primary font-bold">
                {Number(payload[0].value).toLocaleString('pl-PL', { minimumFractionDigits: 0 })} PLN
            </p>
        </div>
    );
};

const CustomPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 shadow-lg text-sm">
            <p className="font-black text-stone-700">{payload[0].name}: {payload[0].value}</p>
        </div>
    );
};

export default function AdminCharts({ monthlyTurnover, tiers }: Props) {
    const barData = monthlyTurnover.map((row) => ({
        month: formatMonthLabel(row.month),
        total: Number(row.total),
    }));

    const pieData = [
        { name: 'Beginner', value: tiers.beginner },
        { name: 'Silver', value: tiers.silver },
        { name: 'Gold', value: tiers.gold },
        { name: 'Platinum', value: tiers.platinum },
    ].filter((d) => d.value > 0);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Monthly turnover bar chart — spans 2 cols */}
            <div className="md:col-span-2 stat-card p-6 space-y-4">
                <h3 className="text-xs font-black text-stone-400 uppercase tracking-[0.3em]">
                    Obrót miesięczny (ZAKOŃCZONY)
                </h3>
                {barData.length === 0 ? (
                    <p className="text-sm text-stone-400 py-8 text-center">Brak danych</p>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <XAxis
                                dataKey="month"
                                tick={{ fontSize: 11, fill: '#78716c' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tickFormatter={formatK}
                                tick={{ fontSize: 11, fill: '#78716c' }}
                                axisLine={false}
                                tickLine={false}
                                width={40}
                            />
                            <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                            <Bar dataKey="total" fill="#D4AF37" radius={[6, 6, 0, 0]} maxBarSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Tier distribution donut */}
            <div className="stat-card p-6 space-y-4">
                <h3 className="text-xs font-black text-stone-400 uppercase tracking-[0.3em]">
                    Rozkład Tierów
                </h3>
                {pieData.length === 0 ? (
                    <p className="text-sm text-stone-400 py-8 text-center">Brak architektów</p>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={80}
                                paddingAngle={3}
                                dataKey="value"
                            >
                                {pieData.map((entry) => (
                                    <Cell key={entry.name} fill={TIER_COLORS[entry.name]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomPieTooltip />} />
                            <Legend
                                iconType="circle"
                                iconSize={8}
                                formatter={(value) => (
                                    <span className="text-[11px] text-stone-600 font-semibold">{value}</span>
                                )}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
