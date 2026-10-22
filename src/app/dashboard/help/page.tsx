import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { readHelpMarkdownForRole } from "@/lib/helpContent";
import MarkdownArticle from "@/components/MarkdownArticle";
import { Card, CardBody } from "@/components/ui";

export default async function HelpPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    if (session.user.role === 'ADMIN' || session.user.role === 'STAFF') {
        redirect('/dashboard/admin/help');
    }

    const { document, markdown } = await readHelpMarkdownForRole(session.user.role);

    return (
        <div className="mx-auto max-w-5xl space-y-6 pb-16">
            <header className="max-w-[68ch] space-y-2">
                <p className="label-caps">{document.title}</p>
                <p className="text-[15px] leading-relaxed text-ink-2">
                    Instrukcja opisuje aktualny proces obsługi projektów, portfela, cashbacku i wypłat w portalu.
                </p>
            </header>

            <Card as="section">
                <CardBody className="p-5 sm:p-8">
                    <MarkdownArticle markdown={markdown} hideTitle />
                </CardBody>
            </Card>
        </div>
    );
}
