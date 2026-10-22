import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { redirect } from "next/navigation";
import SettingsTeamClient from "./SettingsTeamClient";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui";


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
        <div className="space-y-6 pb-16">

            {/* Tytuł „Ustawienia” i opis są w nagłówku powłoki */}
            <div className="flex justify-end">
                <Button href="/dashboard/admin/settings/emails" variant="secondary" icon={<Mail size={16} />}>
                    Szablony email
                </Button>
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
