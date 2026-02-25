'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatPLN } from '@/lib/utils';

interface DrilldownItem {
    name: string;
    balance: number;
}

export default function PayoutForecastDrilldown({ items, label }: { items: DrilldownItem[], label: string }) {
    const [isOpen, setIsOpen] = useState(false);

    if (items.length === 0) return null;

    return (
        <div className="mt-2">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-[9px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1 hover:text-stone-900 transition-colors ml-auto"
            >
                {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {isOpen ? 'Ukryj listę' : 'Pokaż listę'}
            </button>

            {isOpen && (
                <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto pr-2 scrollbar-none">
                    {items.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-[9px] font-bold text-stone-400 bg-black/5 px-2.5 py-1.5 rounded-lg border border-black/5">
                            <span className="truncate max-w-[110px]">{item.name}</span>
                            <span className="text-stone-900 shrink-0 font-black">{formatPLN(item.balance)} PLN</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
