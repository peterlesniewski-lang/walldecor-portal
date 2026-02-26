import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEmailTemplates } from "@/app/actions/emailTemplates";
import EmailsClient from "./EmailsClient";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata = {
    title: 'Szablony Email | WallDecor Admin',
};

export default async function EmailSettingsPage() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') redirect('/dashboard/admin');

    const templates = await getEmailTemplates();

    return (
        <div className="space-y-6 pb-20">
            {/* Breadcrumbs / Back */}
            <div>
                <Link
                    href="/dashboard/admin/settings"
                    className="flex items-center gap-1.5 text-[10px] font-black text-stone-400 uppercase tracking-widest hover:text-orange-600 transition-colors mb-4 group"
                >
                    <ChevronLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                    Powrót do ustawień
                </Link>
                <h1 className="text-2xl font-black text-stone-900 tracking-tight">Powiadomienia Email</h1>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                    Zarządzanie automatycznymi wiadomościami systemowymi
                </p>
            </div>

            <EmailsClient initialTemplates={templates} />
        </div>
    );
}
