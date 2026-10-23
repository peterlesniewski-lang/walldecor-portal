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
        <div className="space-y-6 pb-16">
            {/* Breadcrumbs / Back */}
            <div>
                <Link
                    href="/dashboard/admin/settings"
                    className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brass-ink hover:underline"
                >
                    <ChevronLeft size={14} aria-hidden="true" />
                    Powrót do ustawień
                </Link>
                <h2 className="font-display text-[28px] font-normal leading-tight tracking-[-0.01em] text-ink">Powiadomienia email</h2>
                <p className="mt-1 text-sm text-ink-2">
                    Zarządzanie automatycznymi wiadomościami systemowymi
                </p>
            </div>

            <EmailsClient initialTemplates={templates} />
        </div>
    );
}
