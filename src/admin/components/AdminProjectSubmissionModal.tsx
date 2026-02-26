import React, { useState, useEffect } from 'react';
import { X, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createProject, getAllArchitects } from '@/app/actions/projects';

interface ProjectSubmissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    userRole?: string;
}

const categories = ['Tapety', 'Sztukateria', 'Farby', 'Tynki', 'Tkaniny', 'Podłogi', 'Inne'];

export default function AdminProjectSubmissionModal({ isOpen, onClose, userRole }: ProjectSubmissionModalProps) {
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

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>

            <div className="relative bg-background border border-black/5 rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="p-10 border-b border-black/5 flex justify-between items-center bg-black/5">
                    <div>
                        <h3 className="text-2xl font-black text-stone-900 tracking-tight">{isStaff ? 'Rejestracja Projektu' : 'Zgłoś Nowy Projekt'}</h3>
                        <p className="text-sm text-stone-500 mt-1 font-medium">{isStaff ? 'Manualne wprowadzenie danych dla architekta.' : 'Podaj szczegóły realizacji i kategorii produktów.'}</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-black/5 hover:bg-black/10 rounded-2xl transition-all text-stone-400 hover:text-stone-900 border border-black/5">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-10 max-h-[70vh] overflow-y-auto space-y-8 scrollbar-hide">
                    {success ? (
                        <div className="py-20 text-center space-y-6">
                            <div className="w-24 h-24 gold-gradient text-black rounded-3xl flex items-center justify-center mx-auto shadow-[0_20px_40px_rgba(212,175,55,0.3)]">
                                <CheckCircle2 size={48} />
                            </div>
                            <div>
                                <h4 className="text-2xl font-black text-stone-900 tracking-tight">Gotowe!</h4>
                                <p className="text-stone-500 font-medium mt-2">Projekt został pomyślnie zarejestrowany.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {isStaff && (
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">Współpracownik (Architekt)</label>
                                        <select
                                            required
                                            className="w-full px-6 py-4 bg-black/5 border border-black/10 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-semibold appearance-none"
                                            value={formData.ownerId}
                                            onChange={e => setFormData({ ...formData, ownerId: e.target.value })}
                                        >
                                            <option value="" className="bg-background">-- Wybierz Partnera --</option>
                                            {architects.map(archi => (
                                                <option key={archi.id} value={archi.id} className="bg-background">{archi.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">Nazwa Obiektu</label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="np. Apartament Gdańsk"
                                        className="w-full px-6 py-4 bg-black/5 border border-black/10 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-semibold"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">Etykieta Klienta</label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="np. Nowak / P12"
                                        className="w-full px-6 py-4 bg-black/5 border border-black/10 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/20 transition-all font-semibold"
                                        value={formData.client_label}
                                        onChange={e => setFormData({ ...formData, client_label: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em]">Kategorie i Wartości</h4>
                                    <button
                                        type="button"
                                        onClick={addItem}
                                        className="flex items-center gap-2 text-[10px] font-black text-stone-400 hover:text-stone-900 transition-colors"
                                    >
                                        <Plus size={14} /> DODAJ POZYCJĘ
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {formData.items.map((item, index) => (
                                        <div key={index} className="p-6 bg-black/5 border border-black/10 rounded-3xl space-y-4 relative group">
                                            {formData.items.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(index)}
                                                    className="absolute top-4 right-4 text-stone-600 hover:text-red-600 transition-colors"
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-stone-600 uppercase tracking-widest ml-1">Kategoria</label>
                                                    <select
                                                        className="w-full px-4 py-3 bg-black/5 border border-black/10 rounded-xl text-stone-900 focus:outline-none focus:border-brand-primary/30 transition-all font-bold appearance-none text-sm"
                                                        value={item.category}
                                                        onChange={e => updateItem(index, 'category', e.target.value)}
                                                    >
                                                        {categories.map(cat => <option key={cat} value={cat} className="bg-background">{cat}</option>)}
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-stone-600 uppercase tracking-widest ml-1">Wartość Netto (PLN)</label>
                                                    <input
                                                        required
                                                        type="number"
                                                        placeholder="0.00"
                                                        className="w-full px-4 py-3 bg-black/5 border border-black/10 rounded-xl text-stone-900 focus:outline-none focus:border-brand-primary/30 transition-all font-bold text-sm"
                                                        value={item.amount_net}
                                                        onChange={e => updateItem(index, 'amount_net', e.target.value)}
                                                    />
                                                </div>
                                                <div className="md:col-span-2 space-y-2">
                                                    <label className="text-[9px] font-black text-stone-600 uppercase tracking-widest ml-1">Opis (opcjonalnie)</label>
                                                    <input
                                                        type="text"
                                                        placeholder="np. Wykończenie ścian w salonie"
                                                        className="w-full px-4 py-3 bg-black/5 border border-black/10 rounded-xl text-stone-900 focus:outline-none focus:border-brand-primary/30 transition-all font-bold text-sm"
                                                        value={item.description}
                                                        onChange={e => updateItem(index, 'description', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-3 p-5 bg-red-50 text-red-600 rounded-[2rem] text-xs font-bold border border-red-500/20">
                                    <AlertCircle size={18} />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                disabled={loading}
                                type="submit"
                                className="w-full py-5 gold-gradient text-black rounded-[2rem] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:shadow-[0_20px_40px_rgba(212,175,55,0.2)] transition-all disabled:opacity-50"
                            >
                                {loading ? 'Zapisywanie...' : (
                                    <>
                                        <Plus size={20} />
                                        Zarejestruj Projekt
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </form>
            </div>
        </div>
    );
}
