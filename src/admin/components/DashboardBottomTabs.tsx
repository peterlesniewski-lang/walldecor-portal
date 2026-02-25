'use client';

import React, { useState } from 'react';
import { Activity, FolderKanban, CreditCard } from 'lucide-react';
import AdminActivityFeed from './AdminActivityFeed';
import AdminRedemptionQueue from './AdminRedemptionQueue';
import AdminProjectPipeline from './AdminProjectPipeline';

interface Props {
    projects: any[];
    isAdmin: boolean;
    staffMembers: any[];
    redemptions: any[];
    projectCount: number;
}

type Tab = 'activity' | 'pipeline';

export default function DashboardBottomTabs({ projects, isAdmin, staffMembers, redemptions, projectCount }: Props) {
    const [active, setActive] = useState<Tab>('activity');

    const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: React.ReactNode }[] = [
        {
            id: 'activity',
            label: 'Aktywność',
            icon: <Activity size={14} />,
            badge: redemptions.length > 0
                ? <span className="ml-2 bg-amber-500/10 text-amber-600 text-[9px] font-black px-2 py-0.5 rounded-full border border-amber-500/20">{redemptions.length}</span>
                : null,
        },
        {
            id: 'pipeline',
            label: 'Pipeline projektów',
            icon: <FolderKanban size={14} />,
            badge: <span className="ml-2 bg-black/5 text-stone-400 text-[9px] font-black px-2 py-0.5 rounded-full border border-black/5">{projectCount}</span>,
        },
    ];

    return (
        <div id="project-pipeline" className="stat-card bg-card border border-black/5 p-0 overflow-hidden scroll-mt-24">
            {/* Tab bar */}
            <div className="flex items-center border-b border-black/5 px-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActive(tab.id)}
                        className={`flex items-center gap-2 px-4 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 -mb-px ${
                            active === tab.id
                                ? 'border-brand-primary text-stone-900'
                                : 'border-transparent text-stone-400 hover:text-stone-700'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                        {tab.badge}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="p-6">
                {active === 'activity' && (
                    <div className="space-y-8">
                        <AdminActivityFeed />
                        {redemptions.length > 0 && (
                            <div className="space-y-4">
                                <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                    <CreditCard size={14} className="text-amber-600" />
                                    Wnioski o cashback
                                    <span className="bg-amber-500/10 text-amber-600 text-[9px] px-2 py-0.5 rounded-full font-black border border-amber-500/20">
                                        {redemptions.length}
                                    </span>
                                </p>
                                <AdminRedemptionQueue requests={redemptions} />
                            </div>
                        )}
                    </div>
                )}

                {active === 'pipeline' && (
                    <AdminProjectPipeline
                        projects={projects}
                        isAdmin={isAdmin}
                        staffMembers={staffMembers}
                    />
                )}
            </div>
        </div>
    );
}
