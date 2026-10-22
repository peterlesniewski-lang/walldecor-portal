'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import {
    Banner,
    Button,
    Card,
    CardBody,
    CardHeader,
    EmptyState,
    InlineConfirm,
    StatusPill,
    formatDate,
    formatNumber,
    formatPLN,
} from '@/components/ui';
import { updatePayoutStatus } from '@/app/actions/projects';
import { ErrorBanner } from './ErrorBanner';
import type { Project } from './types';

type Payout = NonNullable<Project['payout']>;

function PayoutActions({
    payout,
    isAdmin,
    hasBankAccount,
}: {
    payout: Payout;
    isAdmin: boolean;
    hasBankAccount: boolean;
}) {
    const router = useRouter();
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [confirmingReject, setConfirmingReject] = useState(false);
    const [confirmingPaid, setConfirmingPaid] = useState(false);

    const updateStatus = async (status: string) => {
        setLoading(status);
        setError('');
        try {
            await updatePayoutStatus(payout.id, status);
            setConfirmingReject(false);
            setConfirmingPaid(false);
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Nie udało się zmienić statusu wypłaty.');
            setConfirmingReject(false);
            setConfirmingPaid(false);
        } finally {
            setLoading(null);
        }
    };

    if (payout.status === 'PAID') {
        return (
            <Banner tone="success" title="Rozliczenie zakończone">
                Wniosek został opłacony.
            </Banner>
        );
    }

    if (payout.status === 'REJECTED') {
        return (
            <Banner tone="danger" title="Wniosek odrzucony">
                Prowizja wróciła do dostępnych.
            </Banner>
        );
    }

    if (!isAdmin) {
        return (
            <Banner tone="info" title="Podgląd tylko do odczytu">
                Status płatności może zmienić wyłącznie administrator.
            </Banner>
        );
    }

    const inPayment = payout.status === 'IN_PAYMENT';
    const busy = loading !== null;

    return (
        <div className="space-y-3">
            {payout.status === 'HOLD' && (
                <Banner tone="warning" title="Wypłata wstrzymana">
                    Wyjaśnij dane lub fakturę, a potem przekaż wniosek do płatności.
                </Banner>
            )}
            {!hasBankAccount && (
                <Banner tone="warning" title="Brak numeru konta partnera">
                    Uzupełnij dane partnera, zanim przekażesz wypłatę do płatności.
                </Banner>
            )}
            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

            {confirmingReject ? (
                <InlineConfirm
                    question="Odrzucić wniosek? Prowizja wróci do dostępnych."
                    confirmLabel="Odrzuć wniosek"
                    cancelLabel="Zostaw"
                    danger
                    loading={loading === 'REJECTED'}
                    onConfirm={() => updateStatus('REJECTED')}
                    onCancel={() => setConfirmingReject(false)}
                />
            ) : confirmingPaid ? (
                <InlineConfirm
                    question={<span className="tnum">Oznaczyć {formatPLN(payout.amount)} jako wypłacone?</span>}
                    confirmLabel="Oznacz jako wypłacone"
                    cancelLabel="Anuluj"
                    loading={loading === 'PAID'}
                    onConfirm={() => updateStatus('PAID')}
                    onCancel={() => setConfirmingPaid(false)}
                />
            ) : (
                <div className="flex flex-wrap gap-3">
                    {!inPayment && (
                        <Button loading={loading === 'IN_PAYMENT'} disabled={busy} onClick={() => updateStatus('IN_PAYMENT')}>
                            Przekaż do płatności
                        </Button>
                    )}
                    <Button
                        variant={inPayment ? 'primary' : 'secondary'}
                        disabled={busy}
                        onClick={() => setConfirmingPaid(true)}
                    >
                        Oznacz jako opłacone
                    </Button>
                    <Button variant="danger" disabled={busy} onClick={() => setConfirmingReject(true)}>
                        Odrzuć wniosek
                    </Button>
                </div>
            )}
        </div>
    );
}

/** Rozliczenie prowizji: najnowszy wniosek o wypłatę powiązany z projektem. */
export default function PayoutCard({
    payout,
    isAdmin,
    hasBankAccount,
}: {
    payout: Project['payout'];
    isAdmin: boolean;
    hasBankAccount: boolean;
}) {
    return (
        <Card as="section">
            <CardHeader
                title="Rozliczenie prowizji"
                action={payout?.status ? <StatusPill kind="payout" status={payout.status} /> : undefined}
            />
            <CardBody className="space-y-5">
                {!payout ? (
                    <EmptyState
                        title="Brak wniosku o wypłatę"
                        description="Partner nie zgłosił jeszcze wypłaty prowizji dla tego projektu."
                    />
                ) : (
                    <>
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <div className="label-caps mb-2">Kwota wniosku</div>
                                <div className="font-display text-[34px] font-normal leading-none tracking-[-0.01em] tnum text-ink">
                                    {formatNumber(payout.amount)}
                                    <small className="ml-1.5 font-sans text-sm font-normal tracking-normal text-ink-3">PLN</small>
                                </div>
                            </div>
                            {payout.invoice_url ? (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    href={payout.invoice_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    icon={<FileText size={16} aria-hidden="true" />}
                                >
                                    Pobierz fakturę
                                </Button>
                            ) : (
                                <span className="text-[13px] text-ink-3">Faktura nie została dołączona</span>
                            )}
                        </div>

                        <dl className="grid gap-x-6 gap-y-1 rounded-sm border border-border bg-surface-2 px-3.5 py-3 font-mono text-xs text-ink-2 sm:grid-cols-[auto_1fr]">
                            <dt className="text-ink-3">Numer wniosku</dt>
                            <dd className="break-all text-ink-2">{payout.id}</dd>
                            <dt className="text-ink-3">Data wniosku</dt>
                            <dd className="tnum text-ink-2">{formatDate(payout.created_at)}</dd>
                        </dl>

                        <div className="border-t border-border pt-5">
                            <PayoutActions payout={payout} isAdmin={isAdmin} hasBankAccount={hasBankAccount} />
                        </div>
                    </>
                )}
            </CardBody>
        </Card>
    );
}
