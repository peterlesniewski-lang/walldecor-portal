import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import HeaderActions from "@/components/HeaderActions";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/signin");
    }

    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'STAFF';
    const title = isAdmin ? 'Centrum operacyjne' : 'Panel architekta';
    const subtitle = isAdmin
        ? 'Wypłaty, projekty i partnerzy w jednym widoku roboczym.'
        : 'Projekty, prowizje i cashback bez zbędnego szumu.';

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar */}
            <Sidebar user={session.user} />

            {/* Main Content */}
            <main className="flex-1 p-10 overflow-y-auto">
                <header className="flex justify-between items-center mb-12">
                    <div>
                        <h1 className="text-3xl font-black text-foreground tracking-tight">
                            {title}
                        </h1>
                        <p className="text-stone-500 mt-1 font-medium">{subtitle}</p>
                    </div>
                    <HeaderActions userRole={session.user.role} />
                </header>

                {children}
            </main>
        </div>
    );
}
