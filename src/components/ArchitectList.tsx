'use client';

import React, { useState } from 'react';
import { ArrowUpRight, Pencil, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteArchitect } from '@/app/actions/architects';
import EditArchitectModal from './EditArchitectModal';
import ArchitectRegistrationModal from './ArchitectRegistrationModal';
import { Banner, Button, InlineConfirm, StatusPill, formatNumber, formatPLN } from '@/components/ui';
import type { Tone } from '@/components/ui';

interface ArchitectListItem {
    id: string;
    name: string;
    email?: string | null;
    studio_name?: string | null;
    subiekt_code?: string | null;
    projects_count: number;
    turnover?: number | string;
    balance: number | string;
    pending_redemptions: number;
    has_business_history?: number | boolean;
    tier_status?: string;
    tier_label?: string;
}

interface ArchitectListProps {
    architects: ArchitectListItem[];
    isAdmin: boolean;
}

const DELETE_BLOCKED = 'Nie można usunąć konta z historią projektów lub rozliczeń';

const TIER_TONE: Record<string, Tone> = {
    PARTNER: 'accent',
    PARTNER_PLUS: 'info',
    PARTNER_PREMIUM: 'success',
};

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name }: { name: string }) {
    return (
        <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brass-soft text-[13px] font-semibold text-brass-ink"
        >
            {initials(name)}
        </span>
    );
}

/** Przycisk rejestracji partnera (drugorzędny), otwiera ten sam modal co przycisk w nagłówku powłoki. */
export function RegisterArchitectButton({ canRegisterArchitects }: { canRegisterArchitects: boolean }) {
    const [isOpen, setIsOpen] = useState(false);
    if (!canRegisterArchitects) return null;

    return (
        <>
            <Button variant="secondary" size="sm" icon={<UserPlus size={16} aria-hidden="true" />} onClick={() => setIsOpen(true)}>
                Zarejestruj architekta
            </Button>
            <ArchitectRegistrationModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
}

export default function ArchitectList({ architects, isAdmin }: ArchitectListProps) {
    const router = useRouter();
    const [editId, setEditId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async (archi: ArchitectListItem) => {
        if (archi.has_business_history) return;

        setError(null);
        setDeletingId(archi.id);
        try {
            await deleteArchitect(archi.id);
            setConfirmingId(null);
            router.refresh();
        } catch (err: unknown) {
            setConfirmingId(null);
            setError(err instanceof Error ? err.message : 'Nie udało się usunąć konta architekta');
        } finally {
            setDeletingId(null);
        }
    };

    const renderActions = (archi: ArchitectListItem) => (
        <div className="flex items-center justify-end gap-1">
            {isAdmin && (
                <>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-8 px-0!"
                        aria-label={`Edytuj dane: ${archi.name}`}
                        title="Edytuj dane"
                        icon={<Pencil size={16} aria-hidden="true" />}
                        onClick={() => setEditId(archi.id)}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-8 px-0! text-danger! hover:bg-danger-soft!"
                        aria-label={archi.has_business_history ? DELETE_BLOCKED : `Usuń konto architekta: ${archi.name}`}
                        title={archi.has_business_history ? DELETE_BLOCKED : 'Usuń konto architekta'}
                        icon={<Trash2 size={16} aria-hidden="true" />}
                        loading={deletingId === archi.id}
                        disabled={Boolean(archi.has_business_history)}
                        onClick={() => { setError(null); setConfirmingId(archi.id); }}
                    />
                </>
            )}
            <Button
                href={`/dashboard/admin/architects/${archi.id}`}
                variant="ghost"
                size="sm"
                className="w-8 px-0!"
                aria-label={`Profil architekta: ${archi.name}`}
                title="Profil architekta"
                icon={<ArrowUpRight size={16} aria-hidden="true" />}
            />
        </div>
    );

    const renderConfirm = (archi: ArchitectListItem) => (
        <InlineConfirm
            question={`Usunąć konto ${archi.name}? Tej operacji nie można cofnąć.`}
            confirmLabel="Usuń konto"
            cancelLabel="Zostaw"
            danger
            loading={deletingId === archi.id}
            onConfirm={() => handleDelete(archi)}
            onCancel={() => setConfirmingId(null)}
        />
    );

    const tierPill = (archi: ArchitectListItem) =>
        archi.tier_label ? (
            <StatusPill tone={TIER_TONE[archi.tier_status ?? ''] ?? 'neutral'}>{archi.tier_label}</StatusPill>
        ) : null;

    const requestPill = (archi: ArchitectListItem) =>
        archi.pending_redemptions > 0 ? (
            <StatusPill tone="warning">Wniosek o kartę</StatusPill>
        ) : null;

    return (
        <div>
            {error && (
                <div className="p-5 pb-0">
                    <Banner tone="danger" title="Nie udało się usunąć konta">{error}</Banner>
                </div>
            )}

            {/* Desktop: tabela */}
            <div className="relative hidden overflow-x-auto md:block">
                <table className="w-full min-w-[940px] text-left text-sm">
                    <thead>
                        <tr className="border-b border-border">
                            <th scope="col" className="label-caps px-5 py-3">Architekt</th>
                            <th scope="col" className="label-caps px-3 py-3">Kod</th>
                            <th scope="col" className="label-caps px-3 py-3">Email</th>
                            <th scope="col" className="label-caps px-3 py-3">Status</th>
                            <th scope="col" className="label-caps px-3 py-3 text-right">Projekty</th>
                            <th scope="col" className="label-caps px-3 py-3 text-right">Obrót</th>
                            <th scope="col" className="label-caps px-3 py-3 text-right">Portfel</th>
                            <th scope="col" className="px-5 py-3"><span className="sr-only">Akcje</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {architects.map((archi) => (
                            <React.Fragment key={archi.id}>
                                <tr className="transition-colors hover:bg-surface-2">
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <Avatar name={archi.name} />
                                            <div className="min-w-0">
                                                <Link
                                                    href={`/dashboard/admin/architects/${archi.id}`}
                                                    className="block truncate font-semibold text-ink hover:underline hover:underline-offset-4"
                                                >
                                                    {archi.name}
                                                </Link>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {archi.studio_name && <span className="truncate text-[13px] text-ink-2">{archi.studio_name}</span>}
                                                    {requestPill(archi)}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="tnum whitespace-nowrap px-3 py-3 text-[13px] text-ink">{archi.subiekt_code || '—'}</td>
                                    <td className="max-w-[240px] truncate px-3 py-3 text-ink-2">{archi.email || '—'}</td>
                                    <td className="px-3 py-3">{tierPill(archi)}</td>
                                    <td className="tnum px-3 py-3 text-right text-ink">{formatNumber(archi.projects_count)}</td>
                                    <td className="tnum whitespace-nowrap px-3 py-3 text-right text-ink">{formatPLN(archi.turnover ?? 0)}</td>
                                    <td className="tnum whitespace-nowrap px-3 py-3 text-right font-semibold text-ink">{formatPLN(archi.balance)}</td>
                                    <td className="px-5 py-3">{renderActions(archi)}</td>
                                </tr>
                                {confirmingId === archi.id && (
                                    <tr className="bg-surface-2">
                                        <td colSpan={8} className="px-5 py-3">{renderConfirm(archi)}</td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile: karty */}
            <ul className="divide-y divide-border md:hidden">
                {architects.map((archi) => (
                    <li key={archi.id} className="space-y-3 p-4">
                        <div className="flex items-start gap-3">
                            <Avatar name={archi.name} />
                            <div className="min-w-0 flex-1">
                                <Link
                                    href={`/dashboard/admin/architects/${archi.id}`}
                                    className="block font-semibold text-ink"
                                >
                                    {archi.name}
                                </Link>
                                {archi.studio_name && <div className="text-[13px] text-ink-2">{archi.studio_name}</div>}
                                {archi.email && <div className="break-all text-[13px] text-ink-2">{archi.email}</div>}
                                <div className="tnum text-[13px] text-ink-2">Kod: {archi.subiekt_code || '—'}</div>
                            </div>
                            {tierPill(archi)}
                        </div>
                        {archi.pending_redemptions > 0 && <div>{requestPill(archi)}</div>}
                        <dl className="grid grid-cols-3 gap-3">
                            <div>
                                <dt className="label-caps">Projekty</dt>
                                <dd className="tnum mt-1 text-sm text-ink">{formatNumber(archi.projects_count)}</dd>
                            </div>
                            <div>
                                <dt className="label-caps">Obrót</dt>
                                <dd className="tnum mt-1 text-sm text-ink">{formatPLN(archi.turnover ?? 0)}</dd>
                            </div>
                            <div>
                                <dt className="label-caps">Portfel</dt>
                                <dd className="tnum mt-1 text-sm font-semibold text-ink">{formatPLN(archi.balance)}</dd>
                            </div>
                        </dl>
                        {confirmingId === archi.id ? renderConfirm(archi) : renderActions(archi)}
                    </li>
                ))}
            </ul>

            <EditArchitectModal
                isOpen={!!editId}
                onClose={() => { setEditId(null); router.refresh(); }}
                architectId={editId}
            />
        </div>
    );
}
