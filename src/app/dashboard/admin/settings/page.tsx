import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { redirect } from "next/navigation";
import SettingsTeamClient from "./SettingsTeamClient";
import Link from "next/link";
import { Mail } from "lucide-react";


export const metadata = {
    title: 'Ustawienia | WallDecor Admin',
};

export default async function SettingsPage() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') redirect('/dashboard/admin');

    const [teamMembers, architects, dbStats] = await Promise.all([
        query<any>(`
            SELECT id, name, email, role, last_login_at, created_at
            FROM users
            WHERE role IN ('ADMIN', 'STAFF')
            ORDER BY role ASC, name ASC
        `),
        query<any>(`
            SELECT id, name, email, last_login_at, created_at
            FROM users
            WHERE role = 'ARCHI'
            ORDER BY name ASC
        `),
        query<any>(`
            SELECT
                (SELECT COUNT(*) FROM users WHERE role = 'ARCHI') as architectsCount,
                (SELECT COUNT(*) FROM projects) as projectsCount,
                (SELECT COUNT(*) FROM project_items) as itemsCount,
                (SELECT COUNT(*) FROM commissions) as commissionsCount,
                (SELECT COUNT(*) FROM wallet_transactions) as transactionsCount,
                (SELECT COUNT(*) FROM payout_requests) as payoutsCount,
                (SELECT COUNT(*) FROM activity_logs) as logsCount
        `),
    ]);

    return (
        <div className="space-y-10 pb-20">

            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-black text-stone-900 tracking-tight">Ustawienia</h1>
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                        Zarządzanie dostępem i użytkownikami systemu
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link
                        href="/dashboard/admin/settings/emails"
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-stone-600 hover:text-orange-600 transition-colors shadow-sm flex items-center gap-2"
                    >
                        <Mail size={14} />
                        Szablony Email
                    </Link>
                </div>
            </div>


            <SettingsTeamClient
                teamMembers={teamMembers}
                architects={architects}
                currentUserId={(session.user as any).id}
                dbStats={dbStats[0] || {}}
            />

        </div>
    );
}
