'use client';

import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatPLN } from '@/components/ui/format';

interface DrilldownItem {
    name: string;
    balance: number;
}

/**
 * Rozwijana lista partnerów z saldem (cyfry tabelaryczne, kwoty "5 000 PLN").
 * `label` opisuje listę dla czytników ekranu.
 */
export default function PayoutForecastDrilldown({ items, label }: { items: DrilldownItem[]; label: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const listId = useId();

    if (items.length === 0) return null;

    return (
        <div className="mt-2">
            <div className="flex justify-end">
                <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    icon={isOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {isOpen ? 'Ukryj listę' : 'Pokaż listę'}
                </Button>
            </div>

            {isOpen && (
                <ul
                    id={listId}
                    aria-label={label}
                    className="mt-2 max-h-48 divide-y divide-border overflow-y-auto rounded-sm border border-border bg-surface-2"
                >
                    {items.map((item, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                            <span className="min-w-0 truncate text-ink-2">{item.name}</span>
                            <span className="tnum shrink-0 font-semibold text-ink">{formatPLN(item.balance)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
