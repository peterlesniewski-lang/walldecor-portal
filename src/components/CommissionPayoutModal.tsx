'use client';

import React, { useState, useRef } from 'react';
import {
    X,
    Upload,
    FileText,
    CheckCircle2,
    AlertCircle,
    Info,
    ChevronRight,
    Loader2
} from 'lucide-react';
import { requestCommissionPayout } from '@/app/actions/projects';
import { formatPLN } from '@/lib/utils';

interface CommissionPayoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    amount: number;
    projectNames: string[];
}

export default function CommissionPayoutModal({ isOpen, onClose, amount, projectNames }: CommissionPayoutModalProps) {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected && selected.type === 'application/pdf') {
            setFile(selected);
            setError(null);
        } else if (selected) {
            setError('Proszę załączyć plik w formacie PDF.');
            setFile(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError('Załączenie faktury w formacie PDF jest wymagane.');
            return;
        }

        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('amount', amount.toString());
        formData.append('invoice', file);

        try {
            const res = await requestCommissionPayout(formData);
            if (res.success) {
                setConfirmedAmount(amount);
                setSuccess(true);
            }
        } catch (err: any) {
            setError(err.message || 'Wystąpił błąd podczas zgłaszania wypłaty.');
        } finally {
            setLoading(false);
        }
    };

    const projectListText = projectNames.join(', ');

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-xl bg-white border border-black/10 rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="absolute top-6 right-6 z-10">
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full bg-black/5 text-stone-400 hover:text-stone-900 hover:bg-black/10 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {success ? (
                    <div className="p-12 text-center">
                        <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-[24px] flex items-center justify-center text-emerald-500 mx-auto mb-8 animate-bounce">
                            <CheckCircle2 size={40} />
                        </div>
                        <h3 className="text-2xl font-black text-stone-900 mb-4 uppercase tracking-tight">Wniosek Złożony!</h3>
                        <p className="text-stone-400 text-sm leading-relaxed mb-10 max-w-xs mx-auto">
                            Twoja prośba o wypłatę {formatPLN(confirmedAmount || amount)} PLN została przekazana do weryfikacji przez administratora.
                        </p>
                        <button
                            onClick={onClose}
                            className="w-full py-5 bg-emerald-500 text-black text-xs font-black uppercase tracking-widest rounded-2xl shadow-[0_8px_32px_rgba(16,185,129,0.2)] hover:bg-emerald-400 transition-all"
                        >
                            Zamknij
                        </button>
                    </div>
                ) : (
                    <div className="p-8 sm:p-10">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 rounded-2xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                                <FileText size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight">Wypłata Prowizji</h3>
                                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">Zlecenie rozliczenia środków</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Tips Section */}
                            <div className="p-6 rounded-2xl bg-black/5 border border-black/5 space-y-4">
                                <div className="flex items-center gap-3 text-brand-primary">
                                    <Info size={16} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Wskazówki do faktury</span>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-stone-500">Kwota (netto):</span>
                                        <span className="text-stone-900 font-black">{formatPLN(amount)} PLN</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        <span className="text-[10px] text-stone-500 uppercase font-black block">Tytuł faktury:</span>
                                        <div className="p-3 rounded-xl bg-black/40 border border-black/5 text-[11px] font-medium text-stone-400 leading-relaxed italic">
                                            konsultacja projektowa + {projectListText}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                        <div className="space-y-1">
                                            <span className="text-[9px] text-stone-600 uppercase font-black block">Termin płatności:</span>
                                            <span className="text-[10px] text-stone-400 font-bold">14 dni</span>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <span className="text-[9px] text-stone-600 uppercase font-black block">Sposób płatności:</span>
                                            <span className="text-[10px] text-stone-400 font-bold">Przelew bankowy</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Upload Area */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={`group relative p-10 border-2 border-dashed rounded-[24px] transition-all cursor-pointer flex flex-col items-center justify-center text-center ${file ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-black/10 hover:border-brand-primary/50 hover:bg-black/5'
                                    }`}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    className="hidden"
                                    accept=".pdf"
                                />

                                {file ? (
                                    <>
                                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-4">
                                            <FileText size={24} />
                                        </div>
                                        <p className="text-sm font-bold text-stone-900 mb-1 truncate max-w-full px-4">{file.name}</p>
                                        <p className="text-[10px] text-emerald-500/60 font-black uppercase tracking-widest">Kliknij aby zmienić</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-14 h-14 rounded-2xl bg-black/5 flex items-center justify-center text-stone-400 group-hover:text-brand-primary group-hover:bg-brand-primary/10 transition-all mb-4">
                                            <Upload size={24} />
                                        </div>
                                        <p className="text-sm font-bold text-stone-400 mb-1">Wgraj obraz faktury (PDF)</p>
                                        <p className="text-[10px] text-stone-500 font-black uppercase tracking-widest">Przeciągnij lub kliknij tutaj</p>
                                    </>
                                )}
                            </div>

                            {error && (
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-[10px] font-bold uppercase tracking-widest">
                                    <AlertCircle size={14} />
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleSubmit}
                                disabled={loading || !file}
                                className={`w-full py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${loading || !file
                                    ? 'bg-black/5 text-stone-600 cursor-not-allowed border border-black/5'
                                    : 'gold-gradient text-black hover:shadow-[0_10px_30px_rgba(212,175,55,0.3)]'
                                    }`}
                            >
                                {loading ? (
                                    <Loader2 className="animate-spin" size={18} />
                                ) : (
                                    'Złóż wniosek o wypłatę'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
