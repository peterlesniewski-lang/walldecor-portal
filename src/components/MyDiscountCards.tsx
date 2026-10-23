'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Card, CardBody, CardHeader, Button, StatusPill, formatPLN, formatDate } from '@/components/ui';

interface MyDiscountCardsProps {
    redemptions: any[];
}

export default function MyDiscountCards({ redemptions }: MyDiscountCardsProps) {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = async (id: string, code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedId(id);
            setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
        } catch {
            // Schowek niedostępny — kod jest widoczny obok przycisku, można skopiować ręcznie
        }
    };

    if (!redemptions || redemptions.length === 0) return null;

    return (
        <Card as="section" aria-label="Moje karty rabatowe">
            <CardHeader title="Moje karty rabatowe" />
            <CardBody flush>
                <ul className="divide-y divide-border">
                    {redemptions.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <span className="text-sm font-semibold text-ink">
                                        {r.status === 'PENDING' ? 'Wniosek w trakcie weryfikacji' : `Karta rabatowa: ${formatPLN(r.amount)}`}
                                    </span>
                                    <StatusPill kind="cashback" status={r.status} />
                                </div>
                                <p className="tnum mt-0.5 text-xs text-ink-3">Wniosek z dnia: {formatDate(r.created_at)}</p>
                            </div>

                            {r.status === 'COMPLETED' && (
                                <div className="flex items-center gap-2">
                                    <code className="rounded-sm border border-border bg-surface-2 px-3 py-1.5 font-mono text-sm font-medium text-ink">
                                        {r.code}
                                    </code>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        icon={copiedId === r.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                                        onClick={() => handleCopy(r.id, r.code)}
                                        title="Kopiuj kod"
                                    >
                                        {copiedId === r.id ? <span role="status">Skopiowano</span> : 'Kopiuj'}
                                    </Button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </CardBody>
        </Card>
    );
}
