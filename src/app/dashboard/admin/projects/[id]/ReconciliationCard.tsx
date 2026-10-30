'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Wrench } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, StatusPill, cx, formatDateTime } from '@/components/ui';
import { resolveReconciliationAction } from '@/app/actions/subiekt';
import type { ProjectReconciliation } from '@/lib/subiekt/queries';
import { formatDocAmount, formatDocDate, reconciliationTotal } from '@/lib/subiekt/labels';
import { ErrorBanner } from './ErrorBanner';
import { INPUT_CLASS, LABEL_CLASS, TD_CLASS, TEXTAREA_CLASS, TH_CLASS } from './styles';

interface Props {
    projectId: string;
    /** Uzgodnienie OPEN z getProjectReconciliations (rodzic renderuje kartę tylko dla OPEN). */
    reconciliation: ProjectReconciliation;
}

/** Kwota w polu formularza: "536.59" → "536,59" (tak, jak wpisuje admin). */
const toInput = (value: number) => value.toFixed(2).replace('.', ',');

/**
 * „Uzgodnij faktury z zamówieniem” (Loop 5b): faktury łańcucha mają inną kwotę niż ZK i nie odzwierciedlają jego
 * pozycji. Admin rozkłada kwotę faktur na pozycje ZK; zapis aktywny tylko przy zgodnej sumie. Po zapisie
 * resolveReconciliationAction przelicza prowizje, karta znika po odświeżeniu.
 */
export default function ReconciliationCard({ projectId, reconciliation }: Props) {
    const router = useRouter();
    const [amounts, setAmounts] = useState<string[]>(() => reconciliation.items.map((item) => toInput(item.amount_net)));
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const sum = reconciliationTotal(amounts, reconciliation.invoicedNet);
    const remaining = sum.total === null ? null : Math.round((reconciliation.invoicedNet - sum.total) * 100) / 100;

    const setAmount = (index: number, value: string) =>
        setAmounts((prev) => prev.map((current, i) => (i === index ? value : current)));

    const save = async () => {
        if (!sum.matches) return;
        setSaving(true);
        setError('');
        try {
            const result = await resolveReconciliationAction(projectId, reconciliation.rootExternalId, reconciliation.items.map((item, i) => ({
                itemId: item.id,
                amount_net: Number(amounts[i].replace(/[\s ]/g, '').replace(',', '.')),
            })), note);
            if (result.ok) router.refresh();
            else setError(result.error);
        } catch (e: unknown) {
            setError(e instanceof Error && e.message ? e.message : 'Nie udało się zapisać uzgodnienia.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card as="section" className="overflow-hidden border-warning/40">
            <CardHeader
                title={`Uzgodnij faktury z zamówieniem${reconciliation.zkNumber ? ` · ${reconciliation.zkNumber}` : ''}`}
                action={<StatusPill tone="warning">od {formatDateTime(reconciliation.openedAt)}</StatusPill>}
            />
            <CardBody className="space-y-5">
                <p className="text-sm text-ink-2">
                    Faktury z Subiekta mają inną kwotę niż zamówienie i nie powtarzają jego pozycji. Rozłóż kwotę faktur na
                    pozycje zamówienia — prowizja liczy się z wpisanych kwot. Do czasu zapisu projektu nie można zakończyć.
                </p>

                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                        { label: 'Kwota z ZK', value: reconciliation.zkNet },
                        { label: 'Kwota faktur (po korektach)', value: reconciliation.invoicedNet },
                        { label: 'Różnica', value: reconciliation.difference },
                    ].map((entry) => (
                        <div key={entry.label} className="rounded-sm border border-border bg-surface-2 px-4 py-3">
                            <dt className="label-caps">{entry.label}</dt>
                            <dd className="mt-1 font-semibold tnum text-ink">{formatDocAmount(entry.value)}</dd>
                        </div>
                    ))}
                </dl>

                {reconciliation.invoices.length > 0 && (
                    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
                        {reconciliation.invoices.map((doc) => (
                            <li key={doc.number} className="tnum">
                                <span className="font-semibold text-ink">{doc.number}</span> · {formatDocDate(doc.issued_at)} · {formatDocAmount(doc.net_total)}
                            </li>
                        ))}
                    </ul>
                )}

                <div className="overflow-x-auto rounded-sm border border-border">
                    <table className="w-full min-w-[620px] border-collapse text-sm">
                        <thead>
                            <tr>
                                <th scope="col" className={TH_CLASS}>Pozycja</th>
                                <th scope="col" className={TH_CLASS}>Typ</th>
                                <th scope="col" className={`${TH_CLASS} text-right`}>Kwota z ZK</th>
                                <th scope="col" className={`${TH_CLASS} text-right`}>Kwota po uzgodnieniu</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reconciliation.items.map((item, i) => (
                                <tr key={item.id} className="border-t border-border">
                                    <td className={TD_CLASS}>
                                        <label htmlFor={`rec-${item.id}`} className="font-semibold text-ink">{item.description || 'Pozycja'}</label>
                                    </td>
                                    <td className={`${TD_CLASS} whitespace-nowrap text-ink-2`}>
                                        <span className="inline-flex items-center gap-2">
                                            {item.type === 'PRODUCT'
                                                ? <><Package size={14} aria-hidden="true" className="text-brass-ink" />Produkt</>
                                                : <><Wrench size={14} aria-hidden="true" className="text-ink-3" />Montaż</>}
                                        </span>
                                    </td>
                                    <td className={`${TD_CLASS} whitespace-nowrap text-right tnum text-ink-2`}>
                                        {item.zk_amount === null ? '—' : formatDocAmount(item.zk_amount)}
                                    </td>
                                    <td className={`${TD_CLASS} w-48`}>
                                        <input
                                            id={`rec-${item.id}`}
                                            inputMode="decimal"
                                            value={amounts[i]}
                                            onChange={(e) => setAmount(i, e.target.value)}
                                            disabled={saving}
                                            className={`${INPUT_CLASS} text-right`}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-border-strong">
                                <td colSpan={3} className={`${TD_CLASS} text-right font-semibold text-ink`}>Suma</td>
                                <td
                                    className={cx(TD_CLASS, 'text-right font-semibold tnum', sum.matches ? 'text-success' : 'text-danger')}
                                    aria-live="polite"
                                >
                                    {sum.total === null ? 'nieprawidłowa kwota' : formatDocAmount(sum.total)}
                                    <span className="block text-xs font-normal">
                                        {sum.matches
                                            ? 'zgodna z kwotą faktur'
                                            : remaining === null
                                                ? 'kwoty ≥ 0, najwyżej 2 miejsca po przecinku'
                                                : `do rozłożenia: ${formatDocAmount(remaining)}`}
                                    </span>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div>
                    <label className={LABEL_CLASS} htmlFor={`rec-note-${reconciliation.rootExternalId}`}>Notatka (opcjonalnie)</label>
                    <textarea
                        id={`rec-note-${reconciliation.rootExternalId}`}
                        value={note}
                        maxLength={500}
                        onChange={(e) => setNote(e.target.value)}
                        disabled={saving}
                        placeholder="np. FS zbiorcza — produkt wyceniony wyżej niż w zamówieniu"
                        className={TEXTAREA_CLASS}
                    />
                </div>

                {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

                <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" onClick={save} loading={saving} disabled={!sum.matches || saving}>Zapisz uzgodnienie</Button>
                    <span className="text-[13px] text-ink-2">Pozycja z kwotą 0 zostanie usunięta.</span>
                </div>
            </CardBody>
        </Card>
    );
}
