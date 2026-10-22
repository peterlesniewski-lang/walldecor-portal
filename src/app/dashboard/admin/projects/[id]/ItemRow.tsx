'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePenLine, Package, Pencil, Trash2, Wrench } from 'lucide-react';
import { Button, InlineConfirm, StatusPill, formatPLN } from '@/components/ui';
import { updateProjectItem, updateProjectItemMeta, deleteProjectItem } from '@/app/actions/projects';
import { ErrorBanner } from './ErrorBanner';
import { IconButton } from './IconButton';
import { INPUT_CLASS, LABEL_CLASS, ROW_CLASS, TD_CLASS } from './styles';
import type { ProjectItem } from './types';

type Panel = 'amount' | 'meta' | 'delete' | null;

export default function ItemRow({
    item,
    canEdit,
    isFinalized,
}: {
    item: ProjectItem;
    canEdit: boolean;
    isFinalized: boolean;
}) {
    const router = useRouter();
    const [panel, setPanel] = useState<Panel>(null);
    const [amount, setAmount] = useState(String(item.amount_net));
    const [note, setNote] = useState('');
    const [orderNumber, setOrderNumber] = useState(item.order_number || '');
    const [invoiceNumber, setInvoiceNumber] = useState(item.invoice_number || '');
    const [isPaid, setIsPaid] = useState(Boolean(item.is_paid));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const paid = Boolean(item.is_paid);

    const cancelAmount = () => {
        setPanel(null);
        setAmount(String(item.amount_net));
        setNote('');
        setError('');
    };

    const cancelMeta = () => {
        setPanel(null);
        setOrderNumber(item.order_number || '');
        setInvoiceNumber(item.invoice_number || '');
        setIsPaid(Boolean(item.is_paid));
        setError('');
    };

    const cancelDelete = () => {
        setPanel(null);
        setNote('');
        setError('');
    };

    const saveAmount = async () => {
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) { setError('Kwota musi być > 0'); return; }
        setSaving(true);
        setError('');
        try {
            await updateProjectItem(item.id, val, note);
            setPanel(null);
            setNote('');
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd zapisu.');
        } finally {
            setSaving(false);
        }
    };

    const saveMeta = async () => {
        setSaving(true);
        setError('');
        try {
            await updateProjectItemMeta(item.id, {
                order_number: orderNumber.trim() || null,
                invoice_number: invoiceNumber.trim() || null,
                is_paid: isPaid,
            });
            setPanel(null);
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd zapisu metadanych.');
        } finally {
            setSaving(false);
        }
    };

    const doDelete = async () => {
        setSaving(true);
        setError('');
        try {
            await deleteProjectItem(item.id, note);
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd usuwania.');
            setPanel(null);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <tr className={ROW_CLASS}>
                <td className={TD_CLASS}>
                    <div className="font-semibold text-ink">{item.category}</div>
                    {item.description && <div className="mt-0.5 text-[13px] text-ink-2">{item.description}</div>}
                    {(item.order_number || item.invoice_number) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {item.order_number && (
                                <span className="rounded-sm bg-ink/5 px-1.5 py-0.5 font-mono text-xs text-ink-2">
                                    Zam: {item.order_number}
                                </span>
                            )}
                            {item.invoice_number && (
                                <span className="rounded-sm bg-ink/5 px-1.5 py-0.5 font-mono text-xs text-ink-2">
                                    FV: {item.invoice_number}
                                </span>
                            )}
                        </div>
                    )}
                </td>
                <td className={`${TD_CLASS} whitespace-nowrap text-ink-2`}>
                    <span className="inline-flex items-center gap-2">
                        {item.type === 'PRODUCT' ? (
                            <>
                                <Package size={14} aria-hidden="true" className="text-brass-ink" />
                                Produkt
                            </>
                        ) : (
                            <>
                                <Wrench size={14} aria-hidden="true" className="text-ink-3" />
                                Montaż — bez prowizji
                            </>
                        )}
                    </span>
                </td>
                <td className={TD_CLASS}>
                    <StatusPill tone={paid ? 'success' : 'neutral'}>{paid ? 'Opłacone' : 'Nieopłacone'}</StatusPill>
                </td>
                <td className={`${TD_CLASS} whitespace-nowrap text-right font-semibold tnum text-ink`}>
                    {formatPLN(item.amount_net)}
                </td>
                <td className={TD_CLASS}>
                    {canEdit && (
                        <div className="flex items-center justify-end gap-0.5">
                            {!isFinalized && (
                                <IconButton
                                    label="Edytuj kwotę"
                                    disabled={saving}
                                    onClick={() => { setError(''); setPanel('amount'); }}
                                >
                                    <Pencil size={15} aria-hidden="true" />
                                </IconButton>
                            )}
                            <IconButton
                                label="Edytuj numery zamówienia i faktury oraz status płatności"
                                disabled={saving}
                                onClick={() => { setError(''); setPanel('meta'); }}
                            >
                                <FilePenLine size={15} aria-hidden="true" />
                            </IconButton>
                            <IconButton
                                label="Usuń pozycję"
                                danger
                                disabled={saving}
                                onClick={() => { setError(''); setPanel('delete'); }}
                            >
                                <Trash2 size={15} aria-hidden="true" />
                            </IconButton>
                        </div>
                    )}
                </td>
            </tr>

            {(panel || error) && (
                <tr className="border-t border-border bg-surface-2">
                    <td colSpan={5} className="space-y-3 px-4 py-4">
                        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

                        {panel === 'amount' && (
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="w-44">
                                    <label className={LABEL_CLASS} htmlFor={`amount-${item.id}`}>Kwota netto (PLN)</label>
                                    <input
                                        id={`amount-${item.id}`}
                                        type="number"
                                        step="0.01"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className={`${INPUT_CLASS} text-right`}
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveAmount();
                                            if (e.key === 'Escape') cancelAmount();
                                        }}
                                    />
                                </div>
                                <div className="min-w-[200px] flex-1">
                                    <label className={LABEL_CLASS} htmlFor={`amount-note-${item.id}`}>Powód zmiany (opcjonalnie)</label>
                                    <input
                                        id={`amount-note-${item.id}`}
                                        type="text"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="np. korekta po obmiarze"
                                        className={INPUT_CLASS}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="secondary" loading={saving} onClick={saveAmount}>Zapisz</Button>
                                    <Button variant="ghost" disabled={saving} onClick={cancelAmount}>Anuluj</Button>
                                </div>
                            </div>
                        )}

                        {panel === 'meta' && (
                            <div className="space-y-3">
                                <div className="label-caps">Dane dokumentowe</div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <label className={LABEL_CLASS} htmlFor={`order-${item.id}`}>Nr zamówienia</label>
                                        <input
                                            id={`order-${item.id}`}
                                            type="text"
                                            value={orderNumber}
                                            onChange={(e) => setOrderNumber(e.target.value)}
                                            placeholder="np. ZAM-2024-001"
                                            className={`${INPUT_CLASS} font-mono text-sm`}
                                        />
                                    </div>
                                    <div>
                                        <label className={LABEL_CLASS} htmlFor={`invoice-${item.id}`}>Nr faktury klienta</label>
                                        <input
                                            id={`invoice-${item.id}`}
                                            type="text"
                                            value={invoiceNumber}
                                            onChange={(e) => setInvoiceNumber(e.target.value)}
                                            placeholder="np. FV/2024/001"
                                            className={`${INPUT_CLASS} font-mono text-sm`}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-4">
                                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                                        <input
                                            type="checkbox"
                                            checked={isPaid}
                                            onChange={(e) => setIsPaid(e.target.checked)}
                                            className="h-4 w-4 accent-brass-ink"
                                        />
                                        Opłacone przez klienta
                                    </label>
                                    <div className="ml-auto flex gap-2">
                                        <Button variant="secondary" loading={saving} onClick={saveMeta}>Zapisz</Button>
                                        <Button variant="ghost" disabled={saving} onClick={cancelMeta}>Anuluj</Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {panel === 'delete' && (
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="min-w-[200px] flex-1">
                                    <label className={LABEL_CLASS} htmlFor={`delete-note-${item.id}`}>Powód usunięcia (opcjonalnie)</label>
                                    <input
                                        id={`delete-note-${item.id}`}
                                        type="text"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="np. pozycja dodana omyłkowo"
                                        className={INPUT_CLASS}
                                    />
                                </div>
                                <InlineConfirm
                                    question={`Usunąć pozycję „${item.category}”?`}
                                    confirmLabel="Usuń pozycję"
                                    cancelLabel="Zostaw"
                                    danger
                                    loading={saving}
                                    onConfirm={doDelete}
                                    onCancel={cancelDelete}
                                />
                            </div>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}
