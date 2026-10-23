import { Card, CardHeader, StatusPill, formatPLN } from '@/components/ui';
import { ROW_CLASS, TD_CLASS, TH_CLASS } from './styles';
import type { Commission } from './types';

export default function CommissionsCard({ commissions }: { commissions: Commission[] }) {
    return (
        <Card as="section" className="overflow-hidden">
            <CardHeader title="Prowizje" />
            <div className="relative overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                        <tr>
                            <th scope="col" className={TH_CLASS}>Kategoria</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Wartość pozycji</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Prowizja</th>
                            <th scope="col" className={TH_CLASS}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {commissions.map((c) => (
                            <tr key={c.id} className={ROW_CLASS}>
                                <td className={`${TD_CLASS} font-semibold text-ink`}>{c.category}</td>
                                <td className={`${TD_CLASS} whitespace-nowrap text-right tnum text-ink-2`}>
                                    {formatPLN(c.item_amount)}
                                </td>
                                <td className={`${TD_CLASS} whitespace-nowrap text-right tnum font-semibold text-ink`}>
                                    {formatPLN(c.amount_net)}
                                    {c.note && <div className="mt-0.5 text-xs font-normal italic text-ink-2">{c.note}</div>}
                                </td>
                                <td className={TD_CLASS}>
                                    <StatusPill kind="commission" status={c.status} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
