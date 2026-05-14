import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { BookOpenCheck } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { readHelpMarkdownForRole } from "@/lib/helpContent";
import MarkdownArticle from "@/components/MarkdownArticle";

export default async function HelpPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    if (session.user.role === 'ADMIN' || session.user.role === 'STAFF') {
        redirect('/dashboard/admin/help');
    }

    const { document, markdown } = await readHelpMarkdownForRole(session.user.role);

    return (
        <div className="mx-auto max-w-5xl space-y-8 pb-20">
            <div className="flex items-start gap-5 rounded-2xl border border-black/5 bg-card p-8">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand-primary/20 bg-brand-primary/10 text-brand-primary">
                    <BookOpenCheck size={26} />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-500">Centrum pomocy</p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight text-stone-950">{document.title}</h2>
                    <p className="mt-2 text-sm font-medium leading-6 text-stone-600">
                        Instrukcja opisuje aktualny proces obsługi projektów, portfela, cashbacku i wypłat w portalu.
                    </p>
                </div>
            </div>

            <div className="rounded-2xl border border-black/5 bg-card p-8 md:p-10">
                <MarkdownArticle markdown={markdown} />
            </div>
        </div>
    );
}
