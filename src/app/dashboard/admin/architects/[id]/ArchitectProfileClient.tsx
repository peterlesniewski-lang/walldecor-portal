'use client';

import React, { useState } from 'react';
import { ShieldCheck, Save, Loader2, Key } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { updateArchitectAdminFields, resetArchitectPassword } from '@/app/actions/architects';

interface Props {
    architectId: string;
    currentTierOverride: string | null;
    autoTier: string;
}

export default function ArchitectProfileClient({ architectId, currentTierOverride, autoTier }: Props) {
    const router = useRouter();
    const [tierOverride, setTierOverride] = useState<string>(currentTierOverride || 'AUTO');
    const [loading, setLoading] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [resetPassword, setResetPassword] = useState('');
    const [resetSuccess, setResetSuccess] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            await updateArchitectAdminFields(architectId, {
                tier_override: tierOverride === 'AUTO' ? null : tierOverride,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            router.refresh();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!resetPassword) return;
        setResetLoading(true);
        try {
            await resetArchitectPassword(architectId, resetPassword);
            setResetSuccess(true);
            setResetPassword('');
            setTimeout(() => setResetSuccess(false), 3000);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setResetLoading(false);
        }
    };

    return (
        <div className="stat-card bg-card border border-black/5 space-y-6">
            <div className="flex items-center gap-3">
                <ShieldCheck size={16} className="text-brand-primary" />
                <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Zarządzanie Tier</h3>
            </div>

            {/* Auto tier display */}
            <div className="bg-black/[0.02] rounded-2xl px-4 py-3 border border-black/5">
                <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mb-1">Tier automatyczny (obrót)</p>
                <p className="text-sm font-black text-stone-900 uppercase">{autoTier}</p>
            </div>

            {/* Tier override */}
            <div className="space-y-2">
                <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Override Tier</label>
                <select
                    value={tierOverride}
                    onChange={(e) => setTierOverride(e.target.value)}
                    className="w-full bg-black/5 border border-black/10 rounded-2xl px-4 py-3 text-sm font-black text-stone-900 uppercase focus:outline-none focus:border-brand-primary/50 transition-all appearance-none"
                >
                    <option value="AUTO">Auto (z obrotu)</option>
                    <option value="SILVER">SILVER</option>
                    <option value="GOLD">GOLD</option>
                    <option value="PLATINUM">PLATINUM</option>
                </select>
            </div>

            <button
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-brand-primary hover:bg-brand-secondary text-black py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saved ? 'Zapisano!' : 'Zapisz zmiany'}
            </button>

            <div className="pt-6 border-t border-black/5 space-y-4">
                <div className="flex items-center gap-3">
                    <Key size={16} className="text-amber-600" />
                    <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Reset Hasła</h3>
                </div>
                <div className="space-y-2">
                    <input
                        type="password"
                        placeholder="Nowe hasło"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        className="w-full bg-black/5 border border-black/10 rounded-2xl px-4 py-3 text-sm font-black text-stone-900 focus:outline-none focus:border-brand-primary/50 transition-all"
                    />
                </div>
                <button
                    onClick={handleResetPassword}
                    disabled={resetLoading || !resetPassword}
                    className="w-full bg-black/5 border border-black/10 hover:bg-black/10 text-stone-900 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-30"
                >
                    {resetLoading ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                    {resetSuccess ? 'Hasło zresetowane!' : 'Zresetuj Hasło'}
                </button>
            </div>
        </div>
    );
}
