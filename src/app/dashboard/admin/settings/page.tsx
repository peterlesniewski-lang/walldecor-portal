import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, ShieldCheck, ExternalLink } from "lucide-react";
import SettingsTeamClient from "./SettingsTeamClient";

export const metadata = {
    title: 'Ustawienia | WallDecor Admin',
};

export default async function SettingsPage() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') redirect('/dashboard/admin');

    const teamMembers = await query<any>(`
        SELECT id, name, email, role, last_login_at, created_at
        FROM users
        WHERE role IN ('ADMIN', 'STAFF')
        ORDER BY role ASC, name ASC
    `);

    return (
        <div className="space-y-10 pb-20">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-black text-stone-900 tracking-tight">Ustawienia</h1>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                    Zarządzanie dostępem i użytkownikami systemu
                </p>
            </div>

            {/* Team section */}
            <SettingsTeamClient
                teamMembers={teamMembers}
                currentUserId={(session.user as any).id}
            />

            {/* Architects shortcut */}
            <div className="stat-card bg-card border border-black/5 p-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary border border-black/5">
                        <Users size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-black text-stone-900">Baza Architektów</p>
                        <p className="text-[10px] text-stone-500 mt-0.5">Zarządzaj kontami partnerów, tierami i uprawnieniami</p>
                    </div>
                </div>
                <Link
                    href="/dashboard/admin/architects"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black/5 hover:bg-black/10 text-stone-900 text-[10px] font-black uppercase tracking-widest transition-all"
                >
                    <ExternalLink size={13} />
                    Otwórz
                </Link>
            </div>

        </div>
    );
}
