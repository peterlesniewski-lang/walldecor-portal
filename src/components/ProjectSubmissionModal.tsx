'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, CheckCircle2 } from 'lucide-react';
import { createProject, getAllArchitects } from '@/app/actions/projects';
import { Banner, Button, cx } from '@/components/ui';

interface ProjectSubmissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    userRole?: string;
}

const categories = ['Tapety', 'Sztukateria', 'Farby', 'Tynki', 'Tkaniny', 'Podłogi', 'Inne'];

const FIELD = 'h-10 w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10';
const LABEL = 'text-[13px] font-semibold text-ink-2';

/** Przycisk otwierający modal zgłoszenia projektu (dla stron serwerowych i pustych stanów). */
export function NewProjectButton({
    userRole,
    variant = 'primary',
    size = 'md',
    label = 'Zgłoś nowy projekt',
    className,
}: {
    userRole?: string;
    variant?: 'primary' | 'secondary';
    size?: 'md' | 'sm';
    label?: string;
    className?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <Button variant={variant} size={size} className={className} icon={<Plus size={16} aria-hidden="true" />} onClick={() => setIsOpen(true)}>
                {label}
            </Button>
            <ProjectSubmissionModal isOpen={isOpen} onClose={() => setIsOpen(false)} userRole={userRole} />
        </>
    );
}

export default function ProjectSubmissionModal({ isOpen, onClose, userRole }: ProjectSubmissionModalProps) {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [architects, setArchitects] = useState<any[]>([]);

    const [formData, setFormData] = useState({
        name: '',
        client_label: '',
        ownerId: '',
        items: [{ category: 'Tapety', description: '', amount_net: '' }]
    });

    const isStaff = userRole === 'ADMIN' || userRole === 'STAFF';

    useEffect(() => {
        if (isOpen && isStaff) {
            getAllArchitects().then(setArchitects).catch(console.error);
        }
    }, [isOpen, isStaff]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const addItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { category: 'Tapety', description: '', amount_net: '' }]
        });
    };

    const removeItem = (index: number) => {
        const newItems = [...formData.items];
        newItems.splice(index, 1);
        setFormData({ ...formData, items: newItems });
    };

    const updateItem = (index: number, field: string, value: string) => {
        const newItems = [...formData.items];
        (newItems[index] as any)[field] = value;
        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (isStaff && !formData.ownerId) {
            setError('Wybierz architekta dla tego projektu.');
            setLoading(false);
            return;
        }

        try {
            await createProject({
                name: formData.name,
                client_label: formData.client_label,
                ownerId: isStaff ? formData.ownerId : undefined,
                items: formData.items.map(item => ({
                    category: item.category,
                    description: item.description,
                    amount_net: Number(item.amount_net) || 0
                }))
            });
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setFormData({
                    name: '',
                    client_label: '',
                    ownerId: '',
                    items: [{ category: 'Tapety', description: '', amount_net: '' }]
                });
                onClose();
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Wystąpił błąd podczas zapisywania projektu.');
        } finally {
            setLoading(false);
        }
    };

    const title = isStaff ? 'Rejestracja projektu' : 'Zgłoś nowy projekt';

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="project-modal-title"
                className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg bg-surface shadow-float sm:rounded-lg"
            >
                {/* Nagłówek */}
                <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                    <div>
                        <h3 id="project-modal-title" className="font-display text-2xl font-normal leading-tight text-ink">{title}</h3>
                        <p className="mt-1 text-sm text-ink-2">
                            {isStaff ? 'Ręczne wprowadzenie danych dla architekta.' : 'Podaj szczegóły realizacji i kategorie produktów.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Zamknij"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                {success ? (
                    <div className="px-6 py-16 text-center" role="status">
                        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                            <CheckCircle2 size={28} aria-hidden="true" />
                        </div>
                        <h4 className="font-display text-2xl font-normal text-ink">Projekt zgłoszony</h4>
                        <p className="mt-2 text-sm text-ink-2">Projekt został zarejestrowany. Opiekun WallDecor potwierdzi jego wartość po wycenie.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {isStaff && (
                                    <div className="flex flex-col gap-1.5 md:col-span-2">
                                        <label htmlFor="pm-owner" className={LABEL}>Architekt</label>
                                        <select
                                            id="pm-owner"
                                            required
                                            className={FIELD}
                                            value={formData.ownerId}
                                            onChange={e => setFormData({ ...formData, ownerId: e.target.value })}
                                        >
                                            <option value="">Wybierz partnera</option>
                                            {architects.map(archi => (
                                                <option key={archi.id} value={archi.id}>{archi.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="pm-name" className={LABEL}>Nazwa obiektu</label>
                                    <input
                                        id="pm-name"
                                        required
                                        type="text"
                                        placeholder="np. Apartament Gdańsk"
                                        className={FIELD}
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="pm-client" className={LABEL}>Etykieta klienta</label>
                                    <input
                                        id="pm-client"
                                        required
                                        type="text"
                                        placeholder="np. Nowak / P12"
                                        className={FIELD}
                                        value={formData.client_label}
                                        onChange={e => setFormData({ ...formData, client_label: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h4 className="text-sm font-semibold text-ink">Kategorie i wartości</h4>
                                    <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={addItem}>
                                        Dodaj pozycję
                                    </Button>
                                </div>

                                <div className="space-y-3">
                                    {formData.items.map((item, index) => (
                                        <div key={index} className="relative space-y-3 rounded-md border border-border bg-surface-2 p-4">
                                            {formData.items.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(index)}
                                                    aria-label={`Usuń pozycję ${index + 1}`}
                                                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-danger-soft hover:text-danger"
                                                >
                                                    <X size={16} aria-hidden="true" />
                                                </button>
                                            )}
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                <div className="flex flex-col gap-1.5">
                                                    <label htmlFor={`pm-cat-${index}`} className={LABEL}>Kategoria</label>
                                                    <select
                                                        id={`pm-cat-${index}`}
                                                        className={FIELD}
                                                        value={item.category}
                                                        onChange={e => updateItem(index, 'category', e.target.value)}
                                                    >
                                                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                                    </select>
                                                </div>
                                                <div className="flex flex-col gap-1.5">
                                                    <label htmlFor={`pm-amount-${index}`} className={LABEL}>
                                                        {isStaff ? 'Wartość netto (PLN)' : 'Szacunkowy budżet netto (opcjonalnie)'}
                                                    </label>
                                                    <input
                                                        id={`pm-amount-${index}`}
                                                        required={isStaff}
                                                        type="number"
                                                        min="0"
                                                        placeholder={isStaff ? '0' : 'np. 5000, możesz zostawić puste'}
                                                        className={cx(FIELD, 'tnum')}
                                                        value={item.amount_net}
                                                        onChange={e => updateItem(index, 'amount_net', e.target.value)}
                                                    />
                                                </div>
                                                {!isStaff && (
                                                    <p className="text-xs text-ink-2 md:col-span-2">
                                                        Kwota orientacyjna. Finalną wartość projektu potwierdza opiekun WallDecor po wycenie i dopiero ona jest podstawą prowizji.
                                                    </p>
                                                )}
                                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                                    <label htmlFor={`pm-desc-${index}`} className={LABEL}>Opis (opcjonalnie)</label>
                                                    <input
                                                        id={`pm-desc-${index}`}
                                                        type="text"
                                                        placeholder="np. Wykończenie ścian w salonie"
                                                        className={FIELD}
                                                        value={item.description}
                                                        onChange={e => updateItem(index, 'description', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {error && <Banner tone="danger" title="Nie udało się zapisać projektu">{error}</Banner>}
                        </div>

                        {/* Stopka */}
                        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
                            <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
                            <Button type="submit" loading={loading}>{isStaff ? 'Zarejestruj projekt' : 'Zgłoś projekt'}</Button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
