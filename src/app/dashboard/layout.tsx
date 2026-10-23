import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import ShellHeader from "@/components/ShellHeader";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/signin");
    }

    // Konto z hasłem tymczasowym nie ma dostępu do panelu, dopóki nie ustawi własnego hasła.
    // Sprawdzane server-side w layoucie, więc nie da się tego ominąć ręcznym wejściem na URL.
    const mustChangeRes = await query<any>(
        "SELECT must_change_password FROM users WHERE id = ?",
        [session.user.id]
    );
    if (Number(mustChangeRes[0]?.must_change_password || 0) === 1) {
        redirect("/auth/change-password");
    }

    return (
        <div className="flex min-h-screen flex-col bg-bg lg:flex-row">
            {/* Sidebar (desktop) i pasek górny z szufladą (mobile) */}
            <Sidebar user={session.user} />

            {/* Treść: padding 24 px (16 px na mobile), maksymalnie 1280 px */}
            <main className="min-w-0 flex-1">
                <div className="mx-auto w-full max-w-[1280px] p-4 sm:p-6">
                    <ShellHeader userRole={session.user.role} />

                    {children}
                </div>
            </main>
        </div>
    );
}
