'use client';

import React, { useState } from 'react';
import {
    ShieldCheck, KeyRound, UserPlus, Loader2,
    CheckCircle2, AlertCircle, RefreshCw, Eye, EyeOff, Copy, Check
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createUser, resetUserPassword, updateUserRole } from '@/app/actions/settings';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'STAFF';
    last_login_at: string | null;
    created_at: string;
}

interface Props {
    teamMembers: TeamMember[];
    currentUserId: string;
}

// ─── Password input with show/hide + copy ─────────────────────────────────

function PasswordInput({ value, onChange, placeholder }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    const [show, setShow] = useState(false);
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative flex items-center">
            <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder || 'Hasło (min. 8 znaków)'}
                className="w-full bg-black/5 border border-black/10 rounded-xl pl-4 pr-20 py-2.5 text-sm font-mono text-stone-900 focus:outline-none focus:border-brand-primary/50"
            />
            <div className="absolute right-2 flex items-center gap-1">
                <button type="button" onClick={() => setShow(!show)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-black/5 transition-all">
                    {show ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                {value && (
                    <button type="button" onClick={copy}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-brand-primary hover:bg-black/5 transition-all">
                        {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Inline feedback ──────────────────────────────────────────────────────

function Feedback({ type, msg }: { type: 'success' | 'error'; msg: string }) {
    return (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-bold border ${type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
            : 'bg-red-500/10 border-red-500/20 text-red-600'
            }`}>
            {type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {msg}
        </div>
    );
}

// ─── Reset password row ───────────────────────────────────────────────────

function ResetPasswordRow({ member }: { member: TeamMember }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const generate = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
        setPassword(Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
    };

    const save = async () => {
        setSaving(true);
        setFeedback(null);
        try {
            await resetUserPassword(member.id, password);
            setFeedback({ type: 'success', msg: 'Hasło zostało zmienione.' });
            setTimeout(() => { setOpen(false); setPassword(''); setFeedback(null); }, 2000);
            router.refresh();
        } catch (e: any) {
            setFeedback({ type: 'error', msg: e.message || 'Błąd zmiany hasła.' });
        } finally {
            setSaving(false);
        }
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 text-stone-500 hover:text-stone-900 hover:bg-black/10 text-[10px] font-black uppercase tracking-widest transition-all"
            >
                <KeyRound size={12} />
                Reset hasła
            </button>
        );
    }

    return (
        <div className="mt-3 p-4 bg-black/[0.02] border border-black/10 rounded-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Nowe hasło dla {member.name}</p>
            <div className="flex items-center gap-2">
                <div className="flex-1">
                    <PasswordInput value={password} onChange={setPassword} />
                </div>
                <button
                    type="button"
                    onClick={generate}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-black/5 hover:bg-black/10 text-stone-500 hover:text-stone-900 text-[10px] font-black uppercase tracking-widest transition-all shrink-0"
                    title="Auto-generuj hasło"
                >
                    <RefreshCw size={12} />
                    Auto
                </button>
            </div>
            {feedback && <Feedback type={feedback.type} msg={feedback.msg} />}
            <div className="flex items-center gap-2">
                <button
                    onClick={save}
                    disabled={saving || password.length < 8}
                    className="px-4 py-2 bg-brand-primary hover:bg-brand-secondary text-black rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50 transition-all"
                >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                    Zapisz hasło
                </button>
                <button
                    onClick={() => { setOpen(false); setPassword(''); setFeedback(null); }}
                    className="px-4 py-2 bg-black/5 hover:bg-black/10 text-stone-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                    Anuluj
                </button>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────

export default function SettingsTeamClient({ teamMembers, currentUserId }: Props) {
    const router = useRouter();

    // Add user form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'STAFF' | 'ADMIN'>('STAFF');
    const [addSaving, setAddSaving] = useState(false);
    const [addFeedback, setAddFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const generateForNew = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
        setNewPassword(Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
    };

    const submitCreate = async () => {
        setAddSaving(true);
        setAddFeedback(null);
        try {
            await createUser({ name: newName, email: newEmail, password: newPassword, role: newRole });
            setAddFeedback({ type: 'success', msg: `Użytkownik ${newName} został dodany.` });
            setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('STAFF');
            setTimeout(() => { setShowAddForm(false); setAddFeedback(null); router.refresh(); }, 2000);
        } catch (e: any) {
            setAddFeedback({ type: 'error', msg: e.message || 'Błąd dodawania użytkownika.' });
        } finally {
            setAddSaving(false);
        }
    };

    const changeRole = async (userId: string, role: 'STAFF' | 'ADMIN') => {
        try {
            await updateUserRole(userId, role);
            router.refresh();
        } catch (e: any) {
            alert(e.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary border border-black/5">
                        <ShieldCheck size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-black text-stone-900">Zespół WallDecor</p>
                        <p className="text-[10px] text-stone-500 mt-0.5">
                            {teamMembers.length} {teamMembers.length === 1 ? 'użytkownik' : 'użytkowników'} z dostępem administracyjnym
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-secondary text-black text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_4px_16px_rgba(212,175,55,0.2)]"
                >
                    <UserPlus size={14} />
                    Dodaj użytkownika
                </button>
            </div>

            {/* Add user form */}
            {showAddForm && (
                <div className="stat-card bg-card border border-brand-primary/20 p-6 space-y-4">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Nowy użytkownik systemu</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-stone-600 uppercase tracking-widest">Imię i nazwisko</label>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Jan Kowalski"
                                className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-stone-900 focus:outline-none focus:border-brand-primary/50"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-stone-600 uppercase tracking-widest">Email</label>
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="jan@walldecor.pl"
                                className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-stone-900 focus:outline-none focus:border-brand-primary/50"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-stone-600 uppercase tracking-widest">Hasło</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <PasswordInput value={newPassword} onChange={setNewPassword} />
                                </div>
                                <button
                                    type="button"
                                    onClick={generateForNew}
                                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-black/5 hover:bg-black/10 text-stone-500 hover:text-stone-900 text-[10px] font-black uppercase tracking-widest transition-all shrink-0"
                                >
                                    <RefreshCw size={12} />
                                    Auto
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-stone-600 uppercase tracking-widest">Rola</label>
                            <div className="flex gap-2">
                                {(['STAFF', 'ADMIN'] as const).map((r) => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setNewRole(r)}
                                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${newRole === r
                                            ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary'
                                            : 'bg-black/5 border-black/5 text-stone-500 hover:border-black/10'
                                            }`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {addFeedback && <Feedback type={addFeedback.type} msg={addFeedback.msg} />}

                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={submitCreate}
                            disabled={addSaving || !newName || !newEmail || newPassword.length < 8}
                            className="px-6 py-2.5 bg-brand-primary hover:bg-brand-secondary text-black rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 transition-all"
                        >
                            {addSaving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                            Utwórz konto
                        </button>
                        <button
                            onClick={() => { setShowAddForm(false); setAddFeedback(null); }}
                            className="px-5 py-2.5 bg-black/5 hover:bg-black/10 text-stone-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                            Anuluj
                        </button>
                    </div>
                </div>
            )}

            {/* Team members list */}
            <div className="stat-card bg-card border border-black/5 p-0 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-black/[0.02] border-b border-black/5">
                            <th className="px-6 py-3 text-left text-[9px] font-black text-stone-500 uppercase tracking-widest">Użytkownik</th>
                            <th className="px-6 py-3 text-left text-[9px] font-black text-stone-500 uppercase tracking-widest">Rola</th>
                            <th className="px-6 py-3 text-left text-[9px] font-black text-stone-500 uppercase tracking-widest">Ostatnie logowanie</th>
                            <th className="px-6 py-3 text-left text-[9px] font-black text-stone-500 uppercase tracking-widest">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                        {teamMembers.map((m) => (
                            <tr key={m.id} className="hover:bg-black/[0.01] transition-colors">
                                <td className="px-6 py-4">
                                    <p className="text-sm font-black text-stone-900">{m.name}</p>
                                    <p className="text-[10px] text-stone-400 font-bold mt-0.5">{m.email}</p>
                                </td>
                                <td className="px-6 py-4">
                                    {m.id === currentUserId ? (
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${m.role === 'ADMIN'
                                            ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
                                            : 'bg-black/5 text-stone-500 border-black/5'
                                            }`}>
                                            {m.role}
                                        </span>
                                    ) : (
                                        <select
                                            value={m.role}
                                            onChange={(e) => changeRole(m.id, e.target.value as 'STAFF' | 'ADMIN')}
                                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border cursor-pointer focus:outline-none transition-all ${m.role === 'ADMIN'
                                                ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
                                                : 'bg-black/5 text-stone-500 border-black/5'
                                                }`}
                                        >
                                            <option value="STAFF">STAFF</option>
                                            <option value="ADMIN">ADMIN</option>
                                        </select>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {m.last_login_at ? (
                                        <p className="text-[10px] text-stone-500 font-bold">
                                            {new Date(m.last_login_at).toLocaleString('pl-PL', {
                                                day: '2-digit', month: '2-digit', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </p>
                                    ) : (
                                        <p className="text-[10px] text-stone-300 font-bold italic">Brak danych</p>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <ResetPasswordRow member={m} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
