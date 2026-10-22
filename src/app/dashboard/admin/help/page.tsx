import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { readHelpMarkdownForRole } from "@/lib/helpContent";
import MarkdownArticle from "@/components/MarkdownArticle";
import { Card, CardBody } from "@/components/ui";

export default async function AdminHelpPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");
    if (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF') redirect('/dashboard');

    const { document, markdown } = await readHelpMarkdownForRole(session.user.role);

    const roleLabel = session.user.role === 'ADMIN' ? 'Administrator' : 'Pracownik';

    return (
        <div className="mx-auto max-w-6xl space-y-6 pb-16">
            <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
                <header className="max-w-[68ch] space-y-2">
                    <p className="label-caps">{document.title}</p>
                    <p className="text-[15px] leading-relaxed text-ink-2">
                        Instrukcja jest dopasowana do Twojej roli i czyta treść bezpośrednio z dokumentacji repo.
                    </p>
                </header>

                <Card>
                    <CardBody className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-brass-soft text-brass-ink">
                            <ShieldCheck size={18} aria-hidden="true" />
                        </span>
                        <div>
                            <p className="label-caps">Aktywna rola</p>
                            <p className="font-display text-lg text-ink">{roleLabel}</p>
                            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                                Administrator widzi instrukcje finansowe i systemowe. Pracownik widzi tylko procedury operacyjne dla architektów i projektów.
                            </p>
                        </div>
                    </CardBody>
                </Card>
            </div>

            <Card as="section">
                <CardBody className="p-5 sm:p-8">
                    <MarkdownArticle markdown={markdown} hideTitle />
                </CardBody>
            </Card>
        </div>
    );
}
