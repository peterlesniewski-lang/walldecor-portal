'use client';

import React, { useEffect, useState } from 'react';
import {
    Activity,
    FileText,
    CreditCard,
    UserPlus,
    ArrowRightLeft,
    Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';

interface ActivityItem {
    id: string;
    event_type: string;
    description: string;
    user_name: string;
    created_at: string;
    metadata: string;
}

export default function AdminActivityFeed() {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/activity')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setActivities(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'PROJECT_STATUS_CHANGE': return <FileText size={16} className="text-blue-600" />;
            case 'PAYOUT_REQUEST': return <CreditCard size={16} className="text-amber-600" />;
            case 'CASHBACK_EARNED': return <ArrowRightLeft size={16} className="text-emerald-600" />;
            case 'TIER_CHANGE': return <UserPlus size={16} className="text-indigo-600" />;
            default: return <Activity size={16} className="text-stone-400" />;
        }
    };

    if (loading) return <div className="text-stone-500 text-[10px] animate-pulse">Ładowanie aktywności...</div>;

    return (
        <div className="stat-card bg-card p-8 border border-black/5 h-full flex flex-col">
            <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                <Activity size={16} className="text-brand-primary" />
                Ostatnia Aktywność
            </h3>

            <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {activities.length > 0 ? activities.map((item) => (
                    <div key={item.id} className="flex gap-4 group">
                        <div className="mt-1">
                            <div className="w-8 h-8 rounded-xl bg-black/5 border border-black/5 flex items-center justify-center group-hover:border-black/10 transition-colors">
                                {getIcon(item.event_type)}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-stone-700 leading-relaxed">
                                {item.description}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                                    {item.user_name || 'System'}
                                </span>
                                <span className="text-stone-600">•</span>
                                <span className="text-[10px] text-stone-500 flex items-center gap-1.5">
                                    <Clock size={12} />
                                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: pl })}
                                </span>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="h-full flex flex-col items-center justify-center py-12">
                        <Activity size={32} className="text-slate-800 mb-4" />
                        <p className="text-[10px] text-stone-600 font-bold uppercase tracking-widest text-center">
                            Brak zarejestrowanych zdarzeń
                        </p>
                    </div>
                )}
            </div>

            <div className="mt-8 pt-6 border-t border-black/5 flex items-center justify-between">
                <button className="text-[10px] font-black text-stone-500 uppercase tracking-widest hover:text-brand-primary transition-colors flex items-center gap-2">
                    Pełny log zdarzeń
                </button>
            </div>
        </div>
    );
}
