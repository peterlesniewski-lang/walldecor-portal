'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ClipboardPaste, Upload, Send, RotateCcw, Link2, Check, XCircle, MailPlus, Search, Inbox,
} from 'lucide-react';
import {
    checkInvitationEmails, createInvitations, sendInvitations, resendInvitation, revokeInvitation, getInvitationLink,
    type CreateInvitationsResult,
} from '@/app/actions/invitations';
import {
    INVITATION_DISPLAY_LABEL, INVITATION_SEND_BATCH, INVITATION_TTL_DAYS, chunk, deriveInvitationStatus,
    parseInvitationList, type InvitationDisplayStatus, type ParsedInvitationLine,
} from '@/lib/invitations';
import {
    Banner, Button, Card, CardBody, CardHeader, EmptyState, InlineConfirm, KpiTile, StatusPill, cx, formatDate, formatNumber,
} from '@/components/ui';
import type { Tone } from '@/components/ui';

export interface InvitationListItem {
    id: string;
    email: string;
    name: string | null;
    studio_name: string | null;
    status: string;
    sent_at: string | null;
    send_count: number;
    last_error: string | null;
    expires_at: string | null;
    accepted_at: string | null;
    created_at: string | null;
    is_expired: boolean;
    invited_by_name: string | null;
}

// ─── Style (design system: pola 40 px, hairline, fokus ink) ────────────────

const FIELD_LABEL = 'text-[13px] font-semibold text-ink-2';
const FIELD_INPUT =
    'w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 ' +
    'focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_rgba(26,25,23,0.08)]';
const TH = 'label-caps px-4 py-3 text-left sm:px-5';
const TD = 'px-4 py-3.5 align-middle sm:px-5';

const STATUS_TONE: Record<InvitationDisplayStatus, Tone> = {
    UNSENT: 'warning',
    SENT: 'info',
    EXPIRED: 'neutral',
    ACCEPTED: 'success',
    REVOKED: 'danger',
};

type Filter = 'ALL' | InvitationDisplayStatus;

function errMsg(e: unknown, fallback: string): string {
    return e instanceof Error && e.message ? e.message : fallback;
}

const SAMPLE_PLACEHOLDER =
    'jan.kowalski@pracownia.pl, Jan Kowalski, Pracownia Kowalski\n' +
    'anna@studio.pl; Anna Nowak\n' +
    'Marek Wiśniewski <marek@wisniewski.pl>\n' +
    'tomasz@example.com';

// ─── Postęp wysyłki partiami ──────────────────────────────────────────────

interface SendProgress {
    total: number;
    done: number;
    sent: number;
    failed: number;
    running: boolean;
    errors: { email: string; error: string }[];
}

const EMPTY_PROGRESS: SendProgress = { total: 0, done: 0, sent: 0, failed: 0, running: false, errors: [] };

function ProgressBar({ progress }: { progress: SendProgress }) {
    const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
    return (
        <div className="space-y-2" role="status" aria-live="polite">
            <div className="flex items-center justify-between text-[13px] text-ink-2">
                <span>{progress.running ? 'Wysyłanie zaproszeń' : 'Wysyłka zakończona'}</span>
                <span className="tnum">{formatNumber(progress.done)} z {formatNumber(progress.total)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-pill bg-ink/[0.08]">
                <div className="h-full rounded-pill bg-brass transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                <span className="text-success">Wysłane: <strong className="tnum">{formatNumber(progress.sent)}</strong></span>
                {progress.failed > 0 && <span className="text-danger">Nieudane: <strong className="tnum">{formatNumber(progress.failed)}</strong></span>}
            </div>
        </div>
    );
}

// ─── Preview lini z wklejonej listy ───────────────────────────────────────

type PreviewStatus = 'ok' | 'exists' | 'invited' | 'error';

interface PreviewRow extends ParsedInvitationLine {
    preview: PreviewStatus;
    note: string | null;
}

const PREVIEW_LABEL: Record<PreviewStatus, { label: string; tone: Tone }> = {
    ok: { label: 'Do zaproszenia', tone: 'success' },
    exists: { label: 'Ma już konto', tone: 'neutral' },
    invited: { label: 'Już zaproszony', tone: 'info' },
    error: { label: 'Błąd', tone: 'danger' },
};

// ─── Komponent główny ─────────────────────────────────────────────────────

export default function InvitationsClient({ invitations }: { invitations: InvitationListItem[] }) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Panel „Nowe zaproszenia”
    const [composeOpen, setComposeOpen] = useState(invitations.length === 0);
    const [text, setText] = useState('');
    const [preview, setPreview] = useState<PreviewRow[] | null>(null);
    const [checking, setChecking] = useState(false);
    const [sendNow, setSendNow] = useState(true);
    const [creating, setCreating] = useState(false);
    const [composeError, setComposeError] = useState<string | null>(null);
    const [createResult, setCreateResult] = useState<CreateInvitationsResult | null>(null);

    // Wysyłka partiami (wspólna dla panelu i listy)
    const [progress, setProgress] = useState<SendProgress>(EMPTY_PROGRESS);

    // Lista
    const [filter, setFilter] = useState<Filter>('ALL');
    const [search, setSearch] = useState('');
    const [rowBusy, setRowBusy] = useState<string | null>(null);
    const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [listFeedback, setListFeedback] = useState<{ tone: 'success' | 'danger'; msg: string } | null>(null);

    const withStatus = useMemo(
        () => invitations.map((inv) => ({ ...inv, display: deriveInvitationStatus(inv) })),
        [invitations]
    );

    const counts = useMemo(() => {
        const c: Record<InvitationDisplayStatus, number> = { UNSENT: 0, SENT: 0, EXPIRED: 0, ACCEPTED: 0, REVOKED: 0 };
        withStatus.forEach((i) => { c[i.display]++; });
        return c;
    }, [withStatus]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return withStatus.filter((i) => {
            if (filter !== 'ALL' && i.display !== filter) return false;
            if (!q) return true;
            return i.email.includes(q) || (i.name || '').toLowerCase().includes(q) || (i.studio_name || '').toLowerCase().includes(q);
        });
    }, [withStatus, filter, search]);

    // ── Wysyłka partiami: kolejne wywołania server action z postępem ──
    const runSend = async (ids: string[]) => {
        if (ids.length === 0) return;
        setProgress({ total: ids.length, done: 0, sent: 0, failed: 0, running: true, errors: [] });
        let sent = 0, failed = 0, done = 0;
        const errors: { email: string; error: string }[] = [];
        for (const part of chunk(ids, INVITATION_SEND_BATCH)) {
            try {
                const res = await sendInvitations(part);
                sent += res.sent;
                failed += res.failed;
                res.rows.filter(r => !r.ok).forEach(r => errors.push({ email: r.email, error: r.error || 'Błąd wysyłki' }));
            } catch (e: unknown) {
                failed += part.length;
                errors.push({ email: `${part.length} adresów`, error: errMsg(e, 'Błąd wysyłki') });
            }
            done += part.length;
            setProgress({ total: ids.length, done, sent, failed, running: true, errors: [...errors] });
        }
        setProgress({ total: ids.length, done, sent, failed, running: false, errors });
        router.refresh();
    };

    // ── Panel: sprawdzenie listy ──
    const handleCheck = async () => {
        setComposeError(null);
        setCreateResult(null);
        const parsed = parseInvitationList(text);
        if (parsed.length === 0) {
            setComposeError('Wklej przynajmniej jeden adres email.');
            setPreview(null);
            return;
        }
        setChecking(true);
        try {
            const check = await checkInvitationEmails(parsed.filter(p => !p.error).map(p => p.email));
            const existing = new Set(check.existingUsers);
            const invited = new Set(check.pendingInvites);
            setPreview(parsed.map((p) => {
                if (p.error) return { ...p, preview: 'error', note: p.error };
                if (existing.has(p.email)) return { ...p, preview: 'exists', note: 'Konto z tym adresem już istnieje' };
                if (invited.has(p.email)) return { ...p, preview: 'invited', note: 'Aktywne zaproszenie czeka na odpowiedź' };
                return { ...p, preview: 'ok', note: null };
            }));
        } catch (e: unknown) {
            setComposeError(errMsg(e, 'Nie udało się sprawdzić listy.'));
        } finally {
            setChecking(false);
        }
    };

    const readyRows = preview?.filter(p => p.preview === 'ok') ?? [];

    // ── Panel: utworzenie (i opcjonalnie wysyłka) ──
    const handleCreate = async () => {
        if (readyRows.length === 0) return;
        setCreating(true);
        setComposeError(null);
        try {
            const res = await createInvitations(readyRows.map(r => ({ email: r.email, name: r.name, studio_name: r.studio_name })));
            setCreateResult(res);
            setPreview(null);
            setText('');
            if (sendNow && res.ids.length > 0) {
                await runSend(res.ids);
            } else {
                router.refresh();
            }
        } catch (e: unknown) {
            setComposeError(errMsg(e, 'Nie udało się utworzyć zaproszeń.'));
        } finally {
            setCreating(false);
        }
    };

    const loadFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = String(e.target?.result || '');
            setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${content}` : content));
            setPreview(null);
        };
        reader.readAsText(file, 'utf-8');
    };

    // ── Lista: akcje wierszy ──
    const handleResend = async (id: string) => {
        setRowBusy(id);
        setListFeedback(null);
        try {
            const res = await resendInvitation(id);
            if (res.sent === 1) setListFeedback({ tone: 'success', msg: 'Zaproszenie wysłane ponownie.' });
            else setListFeedback({ tone: 'danger', msg: res.rows[0]?.error || 'Nie udało się wysłać zaproszenia. Sprawdź konfigurację SMTP i szablon ARCHITECT_INVITED.' });
            router.refresh();
        } catch (e: unknown) {
            setListFeedback({ tone: 'danger', msg: errMsg(e, 'Nie udało się wysłać zaproszenia.') });
        } finally {
            setRowBusy(null);
        }
    };

    const handleRevoke = async (id: string) => {
        setRowBusy(id);
        setListFeedback(null);
        try {
            await revokeInvitation(id);
            setConfirmRevoke(null);
            router.refresh();
        } catch (e: unknown) {
            setConfirmRevoke(null);
            setListFeedback({ tone: 'danger', msg: errMsg(e, 'Nie udało się anulować zaproszenia.') });
        } finally {
            setRowBusy(null);
        }
    };

    const handleCopyLink = async (id: string) => {
        setListFeedback(null);
        try {
            const { link } = await getInvitationLink(id);
            await navigator.clipboard.writeText(link);
            setCopiedId(id);
            setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
        } catch (e: unknown) {
            setListFeedback({ tone: 'danger', msg: errMsg(e, 'Nie udało się skopiować linku.') });
        }
    };

    const unsentIds = withStatus.filter(i => i.display === 'UNSENT').map(i => i.id);
    const expiredIds = withStatus.filter(i => i.display === 'EXPIRED').map(i => i.id);

    const filters: { id: Filter; label: string; count: number }[] = [
        { id: 'ALL', label: 'Wszystkie', count: withStatus.length },
        { id: 'UNSENT', label: INVITATION_DISPLAY_LABEL.UNSENT, count: counts.UNSENT },
        { id: 'SENT', label: INVITATION_DISPLAY_LABEL.SENT, count: counts.SENT },
        { id: 'EXPIRED', label: INVITATION_DISPLAY_LABEL.EXPIRED, count: counts.EXPIRED },
        { id: 'ACCEPTED', label: INVITATION_DISPLAY_LABEL.ACCEPTED, count: counts.ACCEPTED },
        { id: 'REVOKED', label: INVITATION_DISPLAY_LABEL.REVOKED, count: counts.REVOKED },
    ];

    return (
        <div className="space-y-6 pb-16">
            {/* KPI: jeden wyróżniony (niewysłane wymagają działania) */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <KpiTile
                    label="Niewysłane"
                    value={formatNumber(counts.UNSENT)}
                    description={counts.UNSENT > 0 ? 'Czekają na wysyłkę maila' : 'Wszystkie zaproszenia wysłane'}
                    highlight={counts.UNSENT > 0}
                />
                <KpiTile label="Oczekują" value={formatNumber(counts.SENT)} description="Mail wysłany, konto jeszcze nieaktywne" />
                <KpiTile label="Zaakceptowane" value={formatNumber(counts.ACCEPTED)} description="Konta założone z zaproszenia" />
                <KpiTile label="Wygasłe" value={formatNumber(counts.EXPIRED)} description={`Link ważny ${INVITATION_TTL_DAYS} dni; można wysłać ponownie`} />
            </div>

            {/* Panel: nowe zaproszenia */}
            <Card as="section">
                <CardHeader
                    title="Nowe zaproszenia"
                    action={
                        <Button
                            variant={composeOpen ? 'secondary' : 'primary'}
                            size="sm"
                            icon={<MailPlus size={16} aria-hidden="true" />}
                            onClick={() => setComposeOpen((o) => !o)}
                        >
                            {composeOpen ? 'Zwiń' : 'Zaproś architektów'}
                        </Button>
                    }
                />
                {composeOpen && (
                    <CardBody className="space-y-5">
                        {/* Krok 1: lista */}
                        {!preview && !createResult && (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-end justify-between gap-3">
                                    <label htmlFor="invite-list" className={FIELD_LABEL}>
                                        Lista osób — jedna osoba w linii
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".csv,.txt,text/csv,text/plain"
                                            className="hidden"
                                            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }}
                                        />
                                        <Button variant="secondary" size="sm" icon={<Upload size={14} aria-hidden="true" />} onClick={() => fileInputRef.current?.click()}>
                                            Wczytaj plik CSV
                                        </Button>
                                    </div>
                                </div>
                                <textarea
                                    id="invite-list"
                                    rows={8}
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder={SAMPLE_PLACEHOLDER}
                                    spellCheck={false}
                                    className={cx(FIELD_INPUT, 'py-2.5 font-mono text-[13px] leading-relaxed')}
                                />
                                <p className="text-[13px] text-ink-2">
                                    Kolumny: <strong>email</strong>, imię i nazwisko, pracownia (dwie ostatnie opcjonalne). Rozdzielaj przecinkiem,
                                    średnikiem albo wklej kolumny z Excela lub Google Sheets. Adresy z kontem w systemie i aktywnym zaproszeniem zostaną pominięte.
                                </p>
                                {composeError && <Banner tone="danger">{composeError}</Banner>}
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button loading={checking} disabled={!text.trim()} icon={<ClipboardPaste size={16} aria-hidden="true" />} onClick={handleCheck}>
                                        Sprawdź listę
                                    </Button>
                                    {text && (
                                        <Button variant="ghost" onClick={() => { setText(''); setComposeError(null); }}>Wyczyść</Button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Krok 2: podgląd */}
                        {preview && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                                    <StatusPill tone="success">{readyRows.length} do zaproszenia</StatusPill>
                                    {preview.some(p => p.preview === 'exists') && (
                                        <StatusPill tone="neutral">{preview.filter(p => p.preview === 'exists').length} ma konto</StatusPill>
                                    )}
                                    {preview.some(p => p.preview === 'invited') && (
                                        <StatusPill tone="info">{preview.filter(p => p.preview === 'invited').length} już zaproszonych</StatusPill>
                                    )}
                                    {preview.some(p => p.preview === 'error') && (
                                        <StatusPill tone="danger">{preview.filter(p => p.preview === 'error').length} z błędem</StatusPill>
                                    )}
                                </div>

                                <div className="max-h-[360px] overflow-auto rounded-md border border-border">
                                    <table className="w-full min-w-[640px] text-sm">
                                        <thead className="sticky top-0 bg-surface-2">
                                            <tr className="border-b border-border">
                                                <th className={TH}>#</th>
                                                <th className={TH}>Email</th>
                                                <th className={TH}>Imię i nazwisko</th>
                                                <th className={TH}>Pracownia</th>
                                                <th className={TH}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.map((p) => (
                                                <tr key={p.line} className={cx('border-b border-border last:border-b-0', p.preview !== 'ok' && 'text-ink-2')}>
                                                    <td className={cx(TD, 'tnum text-ink-3')}>{p.line}</td>
                                                    <td className={cx(TD, 'font-mono text-[13px]')}>{p.email || <span className="text-ink-3">{p.raw}</span>}</td>
                                                    <td className={TD}>{p.name || <span className="text-ink-3">—</span>}</td>
                                                    <td className={TD}>{p.studio_name || <span className="text-ink-3">—</span>}</td>
                                                    <td className={TD}>
                                                        <div className="flex flex-col gap-1">
                                                            <StatusPill tone={PREVIEW_LABEL[p.preview].tone}>{PREVIEW_LABEL[p.preview].label}</StatusPill>
                                                            {p.note && <span className="text-xs text-ink-2">{p.note}</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {composeError && <Banner tone="danger">{composeError}</Banner>}

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <label htmlFor="invite-send-now" className="flex items-center gap-2 text-sm text-ink">
                                        <input
                                            id="invite-send-now"
                                            type="checkbox"
                                            checked={sendNow}
                                            onChange={(e) => setSendNow(e.target.checked)}
                                            className="h-4 w-4 accent-ink"
                                        />
                                        Wyślij maile od razu po utworzeniu
                                    </label>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Button variant="ghost" onClick={() => { setPreview(null); setComposeError(null); }}>Wróć do edycji</Button>
                                        <Button loading={creating} disabled={readyRows.length === 0} icon={<Send size={16} aria-hidden="true" />} onClick={handleCreate}>
                                            {sendNow ? `Utwórz i wyślij (${readyRows.length})` : `Utwórz zaproszenia (${readyRows.length})`}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Krok 3: wynik */}
                        {createResult && (
                            <div className="space-y-4">
                                <Banner tone={createResult.created + createResult.renewed > 0 ? 'success' : 'warning'} title={
                                    createResult.created + createResult.renewed > 0
                                        ? `Utworzono ${createResult.created + createResult.renewed} zaproszeń`
                                        : 'Nie utworzono żadnego zaproszenia'
                                }>
                                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                                        {createResult.renewed > 0 && <span>Odnowione wygasłe: {createResult.renewed}</span>}
                                        {createResult.skippedExisting > 0 && <span>Pominięte (ma konto): {createResult.skippedExisting}</span>}
                                        {createResult.skippedInvited > 0 && <span>Pominięte (już zaproszone): {createResult.skippedInvited}</span>}
                                        {createResult.invalid > 0 && <span>Nieprawidłowe: {createResult.invalid}</span>}
                                    </span>
                                </Banner>
                                {progress.total > 0 && <ProgressBar progress={progress} />}
                                {!progress.running && progress.errors.length > 0 && (
                                    <Banner tone="danger" title="Nie udało się wysłać części zaproszeń">
                                        <ul className="list-disc space-y-0.5 pl-4">
                                            {progress.errors.slice(0, 10).map((e, i) => (
                                                <li key={i}><span className="font-mono text-xs">{e.email}</span>: {e.error}</li>
                                            ))}
                                            {progress.errors.length > 10 && <li>…i {progress.errors.length - 10} więcej. Użyj „Wyślij ponownie” przy wierszu.</li>}
                                        </ul>
                                    </Banner>
                                )}
                                {!progress.running && (
                                    <div className="flex flex-wrap gap-3">
                                        <Button variant="secondary" onClick={() => { setCreateResult(null); setProgress(EMPTY_PROGRESS); }}>
                                            Dodaj kolejne
                                        </Button>
                                        <Button variant="ghost" onClick={() => { setCreateResult(null); setProgress(EMPTY_PROGRESS); setComposeOpen(false); }}>
                                            Zamknij
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardBody>
                )}
            </Card>

            {/* Lista zaproszeń */}
            <Card as="section" className="overflow-hidden">
                <CardHeader
                    title="Zaproszenia"
                    action={
                        <div className="flex flex-wrap items-center gap-2">
                            {unsentIds.length > 0 && (
                                <Button size="sm" loading={progress.running} icon={<Send size={14} aria-hidden="true" />} onClick={() => runSend(unsentIds)}>
                                    Wyślij niewysłane ({unsentIds.length})
                                </Button>
                            )}
                            {expiredIds.length > 0 && (
                                <Button size="sm" variant="secondary" loading={progress.running} icon={<RotateCcw size={14} aria-hidden="true" />} onClick={() => runSend(expiredIds)}>
                                    Odnów wygasłe ({expiredIds.length})
                                </Button>
                            )}
                        </div>
                    }
                />
                <CardBody flush>
                    <div className="space-y-4 p-4 sm:p-5">
                        {progress.total > 0 && !createResult && <ProgressBar progress={progress} />}
                        {listFeedback && <Banner tone={listFeedback.tone}>{listFeedback.msg}</Banner>}

                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <nav aria-label="Filtr statusu zaproszenia" className="inline-flex max-w-full flex-wrap gap-1 rounded-sm border border-border bg-surface p-1">
                                {filters.map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        aria-pressed={filter === f.id}
                                        onClick={() => setFilter(f.id)}
                                        className={cx(
                                            'inline-flex h-8 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-semibold transition-colors',
                                            filter === f.id ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-ink/5 hover:text-ink',
                                        )}
                                    >
                                        {f.label}
                                        <span className={cx('tnum text-xs', filter === f.id ? 'text-surface/70' : 'text-ink-3')}>{f.count}</span>
                                    </button>
                                ))}
                            </nav>
                            <div className="relative w-full md:w-[280px]">
                                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={16} aria-hidden="true" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    aria-label="Szukaj zaproszenia"
                                    placeholder="Szukaj po emailu lub nazwisku"
                                    className={cx(FIELD_INPUT, 'h-10 pl-9 text-sm')}
                                />
                            </div>
                        </div>
                    </div>

                    {visible.length === 0 ? (
                        <div className="p-5 pt-0">
                            <EmptyState
                                icon={<Inbox size={22} aria-hidden="true" />}
                                title={withStatus.length === 0 ? 'Brak zaproszeń' : 'Nic nie pasuje do filtra'}
                                description={withStatus.length === 0
                                    ? 'Wklej listę adresów w panelu powyżej. Każda osoba dostanie link, pod którym sama ustawi hasło.'
                                    : 'Zmień filtr statusu albo wyszukiwanie.'}
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto border-t border-border">
                            <table className="w-full min-w-[860px] text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-surface-2">
                                        <th className={TH}>Osoba</th>
                                        <th className={TH}>Pracownia</th>
                                        <th className={TH}>Status</th>
                                        <th className={TH}>Wysłano</th>
                                        <th className={TH}>Ważne do</th>
                                        <th className={cx(TH, 'text-right')}>Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((inv) => {
                                        const busy = rowBusy === inv.id;
                                        const active = inv.display === 'UNSENT' || inv.display === 'SENT' || inv.display === 'EXPIRED';
                                        return (
                                            <tr key={inv.id} className={cx('border-b border-border last:border-b-0 hover:bg-surface-2', busy && 'opacity-60')}>
                                                <td className={TD}>
                                                    <p className="font-semibold text-ink">{inv.name || <span className="font-normal text-ink-3">Bez nazwiska</span>}</p>
                                                    <p className="mt-0.5 font-mono text-[13px] text-ink-2">{inv.email}</p>
                                                </td>
                                                <td className={cx(TD, 'text-ink-2')}>{inv.studio_name || '—'}</td>
                                                <td className={TD}>
                                                    <div className="flex flex-col items-start gap-1">
                                                        <StatusPill tone={STATUS_TONE[inv.display]}>{INVITATION_DISPLAY_LABEL[inv.display]}</StatusPill>
                                                        {inv.display === 'ACCEPTED' && inv.accepted_at && (
                                                            <span className="tnum text-xs text-ink-2">{formatDate(inv.accepted_at)}</span>
                                                        )}
                                                        {inv.last_error && inv.display !== 'ACCEPTED' && (
                                                            <span className="text-xs text-danger" title={inv.last_error}>Błąd wysyłki</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className={cx(TD, 'tnum text-ink-2')}>
                                                    {inv.sent_at ? (
                                                        <>
                                                            {formatDate(inv.sent_at)}
                                                            {inv.send_count > 1 && <span className="ml-1 text-xs text-ink-3">×{inv.send_count}</span>}
                                                        </>
                                                    ) : '—'}
                                                </td>
                                                <td className={cx(TD, 'tnum text-ink-2')}>{active ? formatDate(inv.expires_at) : '—'}</td>
                                                <td className={cx(TD, 'text-right')}>
                                                    {!active ? (
                                                        <span className="text-xs text-ink-3">—</span>
                                                    ) : confirmRevoke === inv.id ? (
                                                        <InlineConfirm
                                                            question={`Anulować zaproszenie dla ${inv.email}?`}
                                                            confirmLabel="Anuluj zaproszenie"
                                                            cancelLabel="Zostaw"
                                                            danger
                                                            loading={busy}
                                                            onConfirm={() => handleRevoke(inv.id)}
                                                            onCancel={() => setConfirmRevoke(null)}
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                loading={busy}
                                                                icon={inv.display === 'UNSENT' ? <Send size={14} aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}
                                                                onClick={() => handleResend(inv.id)}
                                                            >
                                                                {inv.display === 'UNSENT' ? 'Wyślij' : 'Wyślij ponownie'}
                                                            </Button>
                                                            {inv.display !== 'EXPIRED' && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    aria-label="Kopiuj link aktywacyjny"
                                                                    title="Kopiuj link aktywacyjny"
                                                                    className="w-8 px-0!"
                                                                    icon={copiedId === inv.id ? <Check size={14} className="text-success" aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
                                                                    onClick={() => handleCopyLink(inv.id)}
                                                                />
                                                            )}
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                aria-label="Anuluj zaproszenie"
                                                                title="Anuluj zaproszenie"
                                                                className="w-8 px-0! text-danger"
                                                                icon={<XCircle size={14} aria-hidden="true" />}
                                                                onClick={() => setConfirmRevoke(inv.id)}
                                                            />
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
