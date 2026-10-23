'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { addProjectItem } from '@/app/actions/projects';
import { ErrorBanner } from './ErrorBanner';
import { INPUT_CLASS, LABEL_CLASS } from './styles';

const TYPES = [
    { value: 'PRODUCT', label: 'Produkt' },
    { value: 'INSTALLATION', label: 'Montaż — bez prowizji' },
] as const;

/** Formularz dodawania pozycji, osadzony w karcie „Pozycje projektu”. */
export default function AddItemForm({ projectId }: { projectId: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [type, setType] = useState<'PRODUCT' | 'INSTALLATION'>('PRODUCT');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [orderNumber, setOrderNumber] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [isPaid, setIsPaid] = useState(false);
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const reset = () => {
        setType('PRODUCT'); setCategory(''); setDescription('');
        setAmount(''); setOrderNumber(''); setInvoiceNumber('');
        setIsPaid(false); setNote('');
    };

    const submit = async () => {
        const val = parseFloat(amount);
        if (!category.trim()) { setError('Podaj kategorię.'); return; }
        if (isNaN(val) || val <= 0) { setError('Kwota musi być > 0.'); return; }
        setLoading(true);
        setError('');
        try {
            await addProjectItem(projectId, {
                type,
                category: category.trim(),
                description: description.trim() || undefined,
                amount_net: val,
                order_number: orderNumber.trim() || undefined,
                invoice_number: invoiceNumber.trim() || undefined,
                is_paid: isPaid,
            }, note);
            setOpen(false);
            reset();
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd dodawania pozycji.');
        } finally {
            setLoading(false);
        }
    };

    if (!open) {
        return (
            <div className="border-t border-border px-5 py-4">
                <Button variant="secondary" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setOpen(true)}>
                    Dodaj pozycję
                </Button>
            </div>
        );
    }

    return (
        <form
            className="space-y-4 border-t border-border bg-surface-2 p-5"
            onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
            <h3 className="text-base font-semibold text-ink">Nowa pozycja</h3>

            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    <span className={LABEL_CLASS} id="new-item-type">Typ</span>
                    <div role="group" aria-labelledby="new-item-type" className="flex gap-2">
                        {TYPES.map((t) => (
                            <button
                                key={t.value}
                                type="button"
                                aria-pressed={type === t.value}
                                onClick={() => setType(t.value)}
                                className={`h-10 flex-1 rounded-sm border px-3 text-sm font-semibold transition-colors ${
                                    type === t.value
                                        ? 'border-ink bg-surface text-ink'
                                        : 'border-border-strong bg-surface text-ink-2 hover:border-ink-3'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className={LABEL_CLASS} htmlFor="new-item-amount">Kwota netto (PLN)</label>
                    <input
                        id="new-item-amount"
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0,00"
                        className={INPUT_CLASS}
                    />
                </div>

                <div>
                    <label className={LABEL_CLASS} htmlFor="new-item-category">Kategoria</label>
                    <input
                        id="new-item-category"
                        type="text"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="np. Tapeta, Farba, Montaż"
                        className={INPUT_CLASS}
                    />
                </div>

                <div>
                    <label className={LABEL_CLASS} htmlFor="new-item-description">Opis (opcjonalnie)</label>
                    <input
                        id="new-item-description"
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Szczegóły…"
                        className={INPUT_CLASS}
                    />
                </div>

                <div>
                    <label className={LABEL_CLASS} htmlFor="new-item-order">Nr zamówienia (opcjonalnie)</label>
                    <input
                        id="new-item-order"
                        type="text"
                        value={orderNumber}
                        onChange={(e) => setOrderNumber(e.target.value)}
                        placeholder="np. ZAM-2024-001"
                        className={`${INPUT_CLASS} font-mono text-sm`}
                    />
                </div>

                <div>
                    <label className={LABEL_CLASS} htmlFor="new-item-invoice">Nr faktury klienta (opcjonalnie)</label>
                    <input
                        id="new-item-invoice"
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        placeholder="np. FV/2024/001"
                        className={`${INPUT_CLASS} font-mono text-sm`}
                    />
                </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                <input
                    type="checkbox"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                    className="h-4 w-4 accent-brass-ink"
                />
                Opłacone przez klienta
            </label>

            <div>
                <label className={LABEL_CLASS} htmlFor="new-item-note">Powód / adnotacja (opcjonalnie)</label>
                <input
                    id="new-item-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="np. zwrot towaru, korekta pozycjonowania"
                    className={INPUT_CLASS}
                />
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={loading} icon={<Plus size={16} aria-hidden="true" />}>
                    Dodaj pozycję
                </Button>
                <Button
                    variant="ghost"
                    disabled={loading}
                    onClick={() => { setOpen(false); reset(); setError(''); }}
                >
                    Anuluj
                </Button>
            </div>
        </form>
    );
}
