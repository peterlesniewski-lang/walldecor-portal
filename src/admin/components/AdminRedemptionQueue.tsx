'use client';

import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { issueDiscountCode } from '@/app/actions/cashback';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, StatusPill, cx, formatDate, formatNumber } from '@/components/ui';

interface AdminRedemptionQueueProps {
    requests: any[];
    isAdmin: boolean;
    /** true, gdy kolejka leży w karcie strony z własnym nagłówkiem (bez ramki i tytułu). */
    flush?: boolean;
}

function initials(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
}

export default function AdminRedemptionQueue({ requests, isAdmin, flush = false }: AdminRedemptionQueueProps) {
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const router = useRouter();

    const handleIssue = async (id: string) => {
        const code = codeInputs[id];
        if (!code) {
            setErrors((prev) => ({ ...prev, [id]: 'Podaj kod rabatowy.' }));
            return;
        }

        setErrors((prev) => { const { [id]: _removed, ...rest } = prev; return rest; });
        setProcessingId(id);
        try {
            await issueDiscountCode(id, code);
            router.refresh();
        } catch (error: any) {
            setErrors((prev) => ({ ...prev, [id]: error?.message || 'Nie udało się wystawić kodu.' }));
        } finally {
            setProcessingId(null);
        }
    };

    if (!requests || requests.length === 0) return null;

    const list = (
        <ul>
            {requests.map((req) => (
                <li
                    key={req.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-border px-5 py-3.5 last:border-b-0 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                >
                    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brass-soft text-xs font-bold text-brass-ink">
                        {initials(req.architect_name)}
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">{req.architect_name}</span>
                            <StatusPill kind="cashback" status={req.status || 'PENDING'} />
                        </div>
                        <div className="mt-0.5 text-[13px] text-ink-3">
                            <span className="tnum">{formatDate(req.created_at)}</span>
                            {req.id && <span className="ml-3 font-mono">{String(req.id).substring(0, 8)}</span>}
                        </div>
                    </div>

                    <div className="col-start-2 text-left md:col-start-3 md:row-start-1 md:text-right">
                        <span className="font-display text-2xl tnum text-ink">{formatNumber(req.amount)}</span>
                        <small className="ml-1 text-xs text-ink-3">PLN</small>
                    </div>

                    {isAdmin && (
                        <div className="col-span-2 md:col-span-1 md:col-start-4 md:row-start-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Kod rabatowy"
                                    aria-label={`Kod rabatowy dla ${req.architect_name}`}
                                    value={codeInputs[req.id] || ''}
                                    onChange={(e) => setCodeInputs({ ...codeInputs, [req.id]: e.target.value })}
                                    className={cx(
                                        'h-8 min-w-0 flex-1 rounded-sm border bg-surface px-3 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-ink-3 focus:border-ink focus:outline-none md:w-44 md:flex-none',
                                        errors[req.id] ? 'border-danger' : 'border-border-strong',
                                    )}
                                />
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    icon={<Send size={14} aria-hidden="true" />}
                                    loading={processingId === req.id}
                                    disabled={!codeInputs[req.id]}
                                    title="Zatwierdź i wyślij kod"
                                    onClick={() => handleIssue(req.id)}
                                >
                                    Wyślij kod
                                </Button>
                            </div>
                            {errors[req.id] && (
                                <p role="alert" className="mt-1.5 text-[13px] text-danger">{errors[req.id]}</p>
                            )}
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );

    if (flush) return list;

    return (
        <Card>
            <CardHeader
                title="Wnioski o karty rabatowe (cashback)"
                action={<StatusPill tone="warning">{requests.length}</StatusPill>}
            />
            {list}
        </Card>
    );
}
