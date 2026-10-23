'use client';

import React, { useState } from 'react';
import {
    KeyRound, UserPlus, RefreshCw, Eye, EyeOff, Copy, Check,
    Users, ExternalLink, Upload, Download
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createUser, resetUserPassword, updateUserRole } from '@/app/actions/settings';
import AdminCSVImportModal from '@/admin/components/AdminCSVImportModal';
import { Banner, Button, Card, EmptyState, InlineConfirm, KpiTile, StatusPill, formatDate, formatNumber } from '@/components/ui';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'STAFF';
    last_login_at: string | null;
    created_at: string;
}

interface Architect {
    id: string;
    name: string;
    email: string;
    last_login_at: string | null;
    created_at: string;
}

interface DbStats {
    architectsCount: number;
    projectsCount: number;
    itemsCount: number;
    commissionsCount: number;
    transactionsCount: number;
    payoutsCount: number;
    logsCount: number;
}

interface Props {
    teamMembers: TeamMember[];
    architects: Architect[];
    currentUserId: string;
    dbStats: DbStats;
}

// ─── Style pól (design system: 40 px, hairline, fokus ink) ─────────────────

const FIELD_LABEL = 'text-[13px] font-semibold text-ink-2';
const FIELD_INPUT =
    'h-10 w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 ' +
    'focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_rgba(26,25,23,0.08)]';
const TH = 'label-caps px-4 py-3 text-left sm:px-5';
const TD = 'px-4 py-3.5 align-middle sm:px-5';

const ROLE_LABEL: Record<'ADMIN' | 'STAFF', string> = { ADMIN: 'Administrator', STAFF: 'Pracownik' };

function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

// ─── Password input with show/hide + copy ─────────────────────────────────

function PasswordInput({ id, value, onChange, placeholder }: {
    id?: string;
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
                id={id}
                type={show ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder || 'Hasło (min. 8 znaków)'}
                autoComplete="new-password"
                className={`${FIELD_INPUT} pr-[72px] font-mono text-sm`}
            />
            <div className="absolute right-1.5 flex items-center gap-0.5">
                <button type="button" onClick={() => setShow(!show)}
                    aria-label={show ? 'Ukryj hasło' : 'Pokaż hasło'}
                    className="rounded-sm p-1.5 text-ink-2 hover:bg-ink/5 hover:text-ink">
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                {value && (
                    <button type="button" onClick={copy}
                        aria-label="Kopiuj hasło"
                        className="rounded-sm p-1.5 text-ink-2 hover:bg-ink/5 hover:text-ink">
                        {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Inline feedback ──────────────────────────────────────────────────────

function Feedback({ type, msg }: { type: 'success' | 'error'; msg: string }) {
    return <Banner tone={type === 'success' ? 'success' : 'danger'}>{msg}</Banner>;
}

// ─── Reset password panel (rozwijany pod wierszem) ────────────────────────

function ResetPasswordPanel({ member, onClose }: { member: TeamMember; onClose: () => void }) {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const save = async () => {
        setSaving(true);
        setFeedback(null);
        try {
            await resetUserPassword(member.id, password);
            setFeedback({ type: 'success', msg: 'Hasło zostało zmienione.' });
            setTimeout(() => { onClose(); setPassword(''); setFeedback(null); }, 2000);
            router.refresh();
        } catch (e: any) {
            setFeedback({ type: 'error', msg: e.message || 'Błąd zmiany hasła.' });
        } finally {
            setSaving(false);
        }
    };

    const inputId = `reset-pw-${member.id}`;

    return (
        <div className="max-w-xl space-y-3 rounded-sm border border-border bg-surface-2 p-4">
            <label htmlFor={inputId} className={FIELD_LABEL}>Nowe hasło dla {member.name}</label>
            <div className="flex items-center gap-2">
                <div className="flex-1">
                    <PasswordInput id={inputId} value={password} onChange={setPassword} />
                </div>
                <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => setPassword(generatePassword())} title="Wygeneruj hasło automatycznie">
                    Generuj
                </Button>
            </div>
            {feedback && <Feedback type={feedback.type} msg={feedback.msg} />}
            <div className="flex items-center gap-2">
                <Button size="sm" loading={saving} disabled={password.length < 8} icon={<KeyRound size={14} />} onClick={save}>
                    Zapisz hasło
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { onClose(); setPassword(''); setFeedback(null); }}>
                    Anuluj
                </Button>
            </div>
        </div>
    );
}

// ─── Shared last-login formatter ──────────────────────────────────────────

function LastLogin({ value }: { value: string | null }) {
    if (!value) return <span className="text-sm text-ink-2">Brak logowań</span>;
    return <span className="tnum text-sm text-ink-2">{formatDate(value)}</span>;
}

function UserCell({ name, email }: { name: string; email: string }) {
    return (
        <>
            <p className="font-semibold text-ink">{name}</p>
            <p className="mt-0.5 text-[13px] text-ink-2">{email}</p>
        </>
    );
}

// ─── Main component ───────────────────────────────────────────────────────

type Tab = 'team' | 'architects' | 'database';

export default function SettingsTeamClient({ teamMembers, architects, currentUserId, dbStats }: Props) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>('team');
    const [showImport, setShowImport] = useState(false);
    const [resetOpenFor, setResetOpenFor] = useState<string | null>(null);

    // Potwierdzenie zmiany roli (zamiast zmiany jednym kliknięciem w select)
    const [pendingRole, setPendingRole] = useState<{ id: string; role: 'STAFF' | 'ADMIN' } | null>(null);
    const [roleSaving, setRoleSaving] = useState(false);

    // Add user form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'STAFF' | 'ADMIN'>('STAFF');
    const [addSaving, setAddSaving] = useState(false);
    const [addFeedback, setAddFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [roleFeedback, setRoleFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

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
        setRoleFeedback(null);
        setRoleSaving(true);
        try {
            await updateUserRole(userId, role);
            setPendingRole(null);
            router.refresh();
        } catch (e: any) {
            setPendingRole(null);
            setRoleFeedback({ type: 'error', msg: e.message || 'Nie udało się zmienić roli.' });
        } finally {
            setRoleSaving(false);
        }
    };

    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'team', label: 'Zespół', count: teamMembers.length },
        { id: 'architects', label: 'Architekci', count: architects.length },
        { id: 'database', label: 'Baza danych' },
    ];

    return (
        <>
        <AdminCSVImportModal
            isOpen={showImport}
            onClose={(didImport) => { setShowImport(false); if (didImport) router.refresh(); }}
        />
        <Card className="overflow-hidden">
            {/* Tab bar */}
            <div role="tablist" aria-label="Sekcje ustawień" className="flex gap-1 overflow-x-auto border-b border-border px-3 sm:px-5">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => { setActiveTab(tab.id); setShowAddForm(false); setResetOpenFor(null); setPendingRole(null); }}
                        className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3.5 text-sm font-medium ${
                            activeTab === tab.id
                                ? 'border-ink text-ink'
                                : 'border-transparent text-ink-2 hover:text-ink'
                        }`}
                    >
                        {tab.label}
                        {tab.count !== undefined && (
                            <span className="tnum rounded-pill bg-ink/[0.06] px-2 py-0.5 text-xs font-semibold text-ink-2">
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Tab: Zespół ── */}
            {activeTab === 'team' && (
                <div role="tabpanel" className="space-y-5 p-4 sm:p-6">
                    {/* Header row */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-ink-2">
                            {teamMembers.length} {teamMembers.length === 1 ? 'użytkownik' : 'użytkowników'} z dostępem administracyjnym
                        </p>
                        <Button
                            variant={showAddForm ? 'secondary' : 'primary'}
                            icon={<UserPlus size={16} />}
                            onClick={() => setShowAddForm(!showAddForm)}
                        >
                            Dodaj użytkownika
                        </Button>
                    </div>

                    {roleFeedback && <Feedback type={roleFeedback.type} msg={roleFeedback.msg} />}

                    {/* Add user form */}
                    {showAddForm && (
                        <div className="space-y-4 rounded-md border border-border bg-surface-2 p-5">
                            <h3 className="font-display text-lg text-ink">Nowy użytkownik systemu</h3>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="new-user-name" className={FIELD_LABEL}>Imię i nazwisko</label>
                                    <input
                                        id="new-user-name"
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder="Jan Kowalski"
                                        className={FIELD_INPUT}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="new-user-email" className={FIELD_LABEL}>Email</label>
                                    <input
                                        id="new-user-email"
                                        type="email"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        placeholder="jan@walldecor.pl"
                                        className={FIELD_INPUT}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="new-user-password" className={FIELD_LABEL}>Hasło</label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <PasswordInput id="new-user-password" value={newPassword} onChange={setNewPassword} />
                                        </div>
                                        <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => setNewPassword(generatePassword())} title="Wygeneruj hasło automatycznie">
                                            Generuj
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className={FIELD_LABEL} id="new-user-role-label">Rola</span>
                                    <div role="radiogroup" aria-labelledby="new-user-role-label" className="flex gap-2">
                                        {(['STAFF', 'ADMIN'] as const).map((r) => (
                                            <button
                                                key={r}
                                                type="button"
                                                role="radio"
                                                aria-checked={newRole === r}
                                                onClick={() => setNewRole(r)}
                                                className={`h-10 flex-1 rounded-sm border text-sm font-semibold ${newRole === r
                                                    ? 'border-ink bg-surface text-ink shadow-[0_0_0_3px_rgba(26,25,23,0.08)]'
                                                    : 'border-border-strong bg-surface text-ink-2 hover:border-ink-3'
                                                    }`}
                                            >
                                                {ROLE_LABEL[r]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {addFeedback && <Feedback type={addFeedback.type} msg={addFeedback.msg} />}

                            <div className="flex items-center gap-3 pt-1">
                                <Button
                                    loading={addSaving}
                                    disabled={!newName || !newEmail || newPassword.length < 8}
                                    icon={<UserPlus size={16} />}
                                    onClick={submitCreate}
                                >
                                    Utwórz konto
                                </Button>
                                <Button variant="ghost" onClick={() => { setShowAddForm(false); setAddFeedback(null); }}>
                                    Anuluj
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Team members table */}
                    <div className="overflow-x-auto rounded-md border border-border">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="border-b border-border bg-surface-2">
                                    <th className={TH}>Użytkownik</th>
                                    <th className={TH}>Rola</th>
                                    <th className={TH}>Ostatnie logowanie</th>
                                    <th className={TH}>Akcje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {teamMembers.map((m) => (
                                    <React.Fragment key={m.id}>
                                        <tr className="border-b border-border last:border-b-0 hover:bg-surface-2">
                                            <td className={TD}>
                                                <UserCell name={m.name} email={m.email} />
                                            </td>
                                            <td className={TD}>
                                                {m.id === currentUserId ? (
                                                    <StatusPill tone={m.role === 'ADMIN' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</StatusPill>
                                                ) : pendingRole?.id === m.id ? (
                                                    <InlineConfirm
                                                        question={`Zmienić rolę na: ${ROLE_LABEL[pendingRole.role]}?`}
                                                        confirmLabel="Zmień rolę"
                                                        loading={roleSaving}
                                                        onConfirm={() => changeRole(m.id, pendingRole.role)}
                                                        onCancel={() => setPendingRole(null)}
                                                    />
                                                ) : (
                                                    <select
                                                        value={m.role}
                                                        aria-label={`Rola użytkownika ${m.name}`}
                                                        onChange={(e) => setPendingRole({ id: m.id, role: e.target.value as 'STAFF' | 'ADMIN' })}
                                                        className="h-8 cursor-pointer rounded-sm border border-border-strong bg-surface px-2.5 text-[13px] text-ink focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_rgba(26,25,23,0.08)]"
                                                    >
                                                        <option value="STAFF">{ROLE_LABEL.STAFF}</option>
                                                        <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
                                                    </select>
                                                )}
                                            </td>
                                            <td className={TD}>
                                                <LastLogin value={m.last_login_at} />
                                            </td>
                                            <td className={TD}>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    icon={<KeyRound size={14} />}
                                                    onClick={() => setResetOpenFor(resetOpenFor === m.id ? null : m.id)}
                                                >
                                                    Reset hasła
                                                </Button>
                                            </td>
                                        </tr>
                                        {resetOpenFor === m.id && (
                                            <tr className="border-b border-border last:border-b-0">
                                                <td colSpan={4} className="px-4 pb-4 sm:px-5">
                                                    <ResetPasswordPanel member={m} onClose={() => setResetOpenFor(null)} />
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Tab: Architekci ── */}
            {activeTab === 'architects' && (
                <div role="tabpanel" className="space-y-4 p-4 sm:p-6">
                    {/* Header row */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-ink-2">
                            {architects.length} {architects.length === 1 ? 'architekt' : 'architektów'} w systemie
                        </p>
                        <Button icon={<Upload size={16} />} onClick={() => setShowImport(true)}>
                            Importuj CSV
                        </Button>
                    </div>

                    {architects.length === 0 ? (
                        <EmptyState
                            icon={<Users size={22} />}
                            title="Brak zarejestrowanych architektów"
                            description="Zaimportuj plik CSV albo zarejestruj architekta na liście architektów."
                        />
                    ) : (
                        <div className="overflow-x-auto rounded-md border border-border">
                            <table className="w-full min-w-[560px] text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-surface-2">
                                        <th className={TH}>Użytkownik</th>
                                        <th className={TH}>Ostatnie logowanie</th>
                                        <th className={TH}>Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {architects.map((a) => (
                                        <tr key={a.id} className="border-b border-border last:border-b-0 hover:bg-surface-2">
                                            <td className={TD}>
                                                <UserCell name={a.name} email={a.email} />
                                            </td>
                                            <td className={TD}>
                                                <LastLogin value={a.last_login_at} />
                                            </td>
                                            <td className={TD}>
                                                <Button
                                                    href={`/dashboard/admin/architects/${a.id}`}
                                                    variant="secondary"
                                                    size="sm"
                                                    icon={<ExternalLink size={14} />}
                                                >
                                                    Profil
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab: Baza danych ── */}
            {activeTab === 'database' && (
                <div role="tabpanel" className="space-y-6 p-4 sm:p-6">
                    {/* Stats grid */}
                    <div>
                        <p className="label-caps mb-3">Liczba rekordów</p>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            {[
                                { label: 'Architekci', value: dbStats.architectsCount },
                                { label: 'Projekty', value: dbStats.projectsCount },
                                { label: 'Pozycje projektów', value: dbStats.itemsCount },
                                { label: 'Prowizje', value: dbStats.commissionsCount },
                                { label: 'Transakcje portfela', value: dbStats.transactionsCount },
                                { label: 'Wypłaty', value: dbStats.payoutsCount },
                                { label: 'Logi aktywności', value: dbStats.logsCount },
                            ].map(({ label, value }) => (
                                <KpiTile key={label} label={label} value={formatNumber(value ?? 0)} />
                            ))}
                        </div>
                    </div>

                    {/* Backup */}
                    <div className="space-y-4 rounded-md border border-border p-5">
                        <div>
                            <h3 className="font-display text-lg text-ink">Kopia zapasowa</h3>
                            <p className="mt-1 text-sm text-ink-2">
                                Pobierz pełną kopię bazy danych (SQLite: plik .sqlite / MySQL: eksport JSON).
                            </p>
                        </div>
                        <a
                            href="/api/admin/backup"
                            download
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface px-[18px] text-sm font-semibold text-ink hover:border-ink-3"
                        >
                            <Download size={16} aria-hidden="true" />
                            Pobierz backup
                        </a>
                        <p className="border-t border-border pt-4 text-[13px] text-ink-2">
                            Produkcyjna kopia zapasowa powinna być konfigurowana na poziomie hostingu (cron job + cloud storage). Ręczny backup jest uzupełnieniem, nie zastępstwem automatycznych kopii.
                        </p>
                    </div>
                </div>
            )}
        </Card>
        </>
    );
}
