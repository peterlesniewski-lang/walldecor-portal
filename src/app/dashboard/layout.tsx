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

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar */}
            <Sidebar user={session.user} />

            {/* Main Content */}
            <main className="flex-1 p-10 overflow-y-auto">
                <header className="flex justify-between items-center mb-12">
                    <div>
                        <h1 className="text-3xl font-black text-foreground tracking-tight">
                            Witaj ponownie, <span className="gold-text">{session.user.name}</span> 👋
                        </h1>
                        <p className="text-stone-400 mt-1 font-medium italic">Premium Portal dla Architektów i Projektantów</p>
                    </div>
                    <HeaderActions userRole={session.user.role} />
                </header>

                {children}
            </main>
        </div>
    );
}
