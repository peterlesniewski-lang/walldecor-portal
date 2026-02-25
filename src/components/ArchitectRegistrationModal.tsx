'use client';

import React, { useState } from 'react';
import { X, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { registerArchitect } from '@/app/actions/projects';

interface ArchitectRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ArchitectRegistrationModal({ isOpen, onClose }: ArchitectRegistrationModalProps) {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        studio_name: '',
        nip: '',
        address: '',
        bank_account: '',
        is_vat_payer: false,
        password: ''
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await registerArchitect(formData);
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setFormData({
                    first_name: '',
                    last_name: '',
                    email: '',
                    studio_name: '',
                    nip: '',
                    address: '',
                    bank_account: '',
                    is_vat_payer: false,
                    password: ''
                });
                onClose();
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Wystąpił błąd podczas rejestracji architekta.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 text-left">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose}></div>

            <div className="relative bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in duration-300 flex flex-col">
                {/* Header */}
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-stone-900">Zarejestruj Architekta</h3>
                        <p className="text-sm text-stone-500 mt-1">Wprowadź pełne dane nowego partnera.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-xl transition-all text-stone-400 hover:text-stone-600 border border-transparent hover:border-slate-100">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto flex-1">
                    {success ? (
                        <div className="py-12 text-center space-y-4">
                            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-100 shadow-xl shadow-emerald-100/50">
                                <CheckCircle2 size={40} />
                            </div>
                            <h4 className="text-xl font-bold text-stone-900">Architekt zarejestrowany!</h4>
                            <p className="text-stone-500">Konto zostało utworzone i jest gotowe do pracy.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Personal Info */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest border-b border-slate-50 pb-2">Dane Osobowe</h4>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">Imię</label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-medium"
                                        value={formData.first_name}
                                        onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">Nazwisko</label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-medium"
                                        value={formData.last_name}
                                        onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">Email</label>
                                    <input
                                        required
                                        type="email"
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-medium"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">Hasło</label>
                                    <input
                                        required
                                        type="password"
                                        placeholder="Min. 6 znaków"
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-medium"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Business Info */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest border-b border-slate-50 pb-2">Dane Firmowe / Freelance</h4>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">Nazwa Pracowni</label>
                                    <input
                                        type="text"
                                        placeholder="Opcjonalnie"
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-medium"
                                        value={formData.studio_name}
                                        onChange={e => setFormData({ ...formData, studio_name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">NIP</label>
                                    <input
                                        type="text"
                                        placeholder="Opcjonalnie (Freelancer)"
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-medium"
                                        value={formData.nip}
                                        onChange={e => setFormData({ ...formData, nip: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">Adres</label>
                                    <textarea
                                        rows={1}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-medium"
                                        value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">Numer Konta</label>
                                    <input
                                        type="text"
                                        placeholder="Opcjonalnie"
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-stone-900 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-medium"
                                        value={formData.bank_account}
                                        onChange={e => setFormData({ ...formData, bank_account: e.target.value })}
                                    />
                                </div>
                                <div className="flex items-center gap-3 pt-2">
                                    <div
                                        onClick={() => setFormData({ ...formData, is_vat_payer: !formData.is_vat_payer })}
                                        className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-all ${formData.is_vat_payer ? 'bg-blue-600' : 'bg-slate-200'}`}
                                    >
                                        <div className={`w-4 h-4 bg-white rounded-full transition-all ${formData.is_vat_payer ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                    <span className="text-xs font-bold text-stone-600">Płatnik VAT (Faktura)</span>
                                </div>
                            </div>

                            <div className="md:col-span-2 pt-4">
                                {error && (
                                    <div className="flex items-center gap-3 p-4 bg-red-50 text-red-600 rounded-2xl text-sm border border-red-100 mb-6">
                                        <AlertCircle size={18} />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black shadow-xl shadow-slate-200 transition-all disabled:opacity-50"
                                >
                                    {loading ? 'Rejestrowanie...' : (
                                        <>
                                            <UserPlus size={20} />
                                            Zarejestruj Architekta
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
