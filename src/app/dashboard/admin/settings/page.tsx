import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { redirect } from "next/navigation";
import SettingsTeamClient from "./SettingsTeamClient";

export const metadata = {
    title: 'Ustawienia | WallDecor Admin',
};

export default async function SettingsPage() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') redirect('/dashboard/admin');

    const [teamMembers, architects] = await Promise.all([
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
    ]);

    return (
        <div className="space-y-10 pb-20">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-black text-stone-900 tracking-tight">Ustawienia</h1>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                    Zarządzanie dostępem i użytkownikami systemu
                </p>
            </div>

            <SettingsTeamClient
                teamMembers={teamMembers}
                architects={architects}
                currentUserId={(session.user as any).id}
            />

        </div>
    );
}
