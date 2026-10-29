import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { notFound } from "next/navigation";
import { ProjectFile } from "@/components/ProjectFilesSection";
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Banner, Card, KpiTile, StatusPill, formatDate, formatNumber } from '@/components/ui';
import { getProjectZkChanges } from '@/lib/subiekt/queries';
import AdminProjectDetailClient from './AdminProjectDetailClient';

export default async function AdminProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return <Banner tone="danger" title="Brak uprawnień">Ta strona jest dostępna tylko dla administracji.</Banner>;
    }

    const isAdmin = session.user.role === 'ADMIN';
    const canChangeStatus = isAdmin || session.user.role === 'STAFF';

    // 1. Project + architect
    const projRes = await query<any>(`
        SELECT p.*, u.name as architect_name, u.id as architect_id
        FROM projects p
        LEFT JOIN users u ON p.owner_id = u.id
        WHERE p.id = ?
    `, [id]);
    if (projRes.length === 0) notFound();
    const project = projRes[0];

    // 1b. Architect (partner) data. Bank account is sent to the client only for ADMIN.
    const architectRes = await query<any>(
        "SELECT name, email, studio_name, nip, address, bank_account, is_vat_payer FROM users WHERE id = ?",
        [project.owner_id]
    );
    const architectRow = architectRes[0] ?? null;
    project.architect = architectRow
        ? {
            name: architectRow.name,
            email: architectRow.email,
            studio_name: architectRow.studio_name ?? null,
            nip: architectRow.nip ?? null,
            address: architectRow.address ?? null,
            is_vat_payer: Boolean(architectRow.is_vat_payer),
            bank_account: isAdmin ? (architectRow.bank_account ?? null) : null,
        }
        : null;

    // 1c. Latest payout request linked to this project through its commissions
    const payoutRes = await query<any>(`
        SELECT pr.*
        FROM payout_requests pr
        JOIN commissions c ON pr.id = c.payout_id
        WHERE c.project_id = ?
        ORDER BY pr.created_at DESC
        LIMIT 1
    `, [id]);
    const payoutRow = payoutRes[0] ?? null;
    project.payout = payoutRow
        ? {
            id: payoutRow.id,
            amount: Number(payoutRow.amount),
            status: payoutRow.status,
            invoice_url: payoutRow.invoice_url ?? null,
            created_at: payoutRow.created_at instanceof Date
                ? payoutRow.created_at.toISOString()
                : String(payoutRow.created_at),
        }
        : null;

    // 2. Project items
    const items = await query<any>(
        "SELECT * FROM project_items WHERE project_id = ? ORDER BY type ASC",
        [id]
    );

    // 3. Project files
    const files = await query<ProjectFile>(`
        SELECT pf.*, u.name as uploaded_by_name
        FROM project_files pf
        JOIN users u ON pf.uploaded_by = u.id
        WHERE pf.project_id = ?
        ORDER BY pf.created_at DESC
    `, [id]);

    // 4. Commissions for this project
    const commissionsRes = await query<any>(`
        SELECT c.*, pi.category, pi.amount_net as item_amount
        FROM commissions c
        JOIN project_items pi ON c.project_item_id = pi.id
        WHERE c.project_id = ?
        ORDER BY c.status DESC
    `, [id]);

    // 5. Zmiany ZK/FP z Subiekta (log synchronizacji)
    const zkChanges = await getProjectZkChanges(id);

    const sumBy = (status: string) =>
        commissionsRes
            .filter((c: any) => c.status === status)
            .reduce((s: number, c: any) => s + Number(c.amount_net), 0);

    const productItems = items.filter((i: any) => i.type === 'PRODUCT');
    const installationItems = items.filter((i: any) => i.type === 'INSTALLATION');
    const totalProduct = productItems.reduce((s: number, i: any) => s + Number(i.amount_net), 0);
    const totalInstallation = installationItems.reduce((s: number, i: any) => s + Number(i.amount_net), 0);
    const earnedComm = sumBy('EARNED');
    const pendingComm = sumBy('PENDING');
    const inPaymentComm = sumBy('IN_PAYMENT');
    const paidComm = sumBy('PAID');

    // Prowizja w płatności lub wypłacona nie wpada do „zarobionej”, więc pokazujemy ją w opisie kafelka.
    const earnedDescription =
        inPaymentComm > 0 || paidComm > 0
            ? [
                inPaymentComm > 0 ? `W wypłacie: ${formatNumber(inPaymentComm)} PLN` : null,
                paidComm > 0 ? `Wypłacona: ${formatNumber(paidComm)} PLN` : null,
            ].filter(Boolean).join(' · ')
            : earnedComm > 0
                ? 'Gotowa do wypłaty'
                : 'Naliczana po zakończeniu projektu';

    return (
        <div className="space-y-6 pb-20">

            <Link
                href="/dashboard/admin"
                className="inline-flex items-center gap-2 text-sm font-semibold text-ink-2 transition-colors hover:text-ink"
            >
                <ArrowLeft size={16} aria-hidden="true" />
                Powrót do panelu admin
            </Link>

            {/* Nagłówek projektu */}
            <Card as="section" className="p-5 sm:p-6">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="font-display text-[28px] font-normal leading-tight tracking-[-0.01em] text-ink">
                                {project.name}
                            </h2>
                            <StatusPill kind="project" status={project.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
                            {project.client_label && <span>{project.client_label}</span>}
                            {project.client_label && <span aria-hidden="true" className="text-ink-3">·</span>}
                            <Link
                                href={`/dashboard/admin/architects/${project.architect_id}`}
                                className="font-semibold text-brass-ink underline-offset-2 hover:underline"
                            >
                                {project.architect_name}
                            </Link>
                            <span aria-hidden="true" className="text-ink-3">·</span>
                            <span className="tnum">{formatDate(project.created_at)}</span>
                        </div>
                    </div>

                    <div className="shrink-0 md:text-right">
                        <div className="font-display text-[34px] font-normal leading-none tracking-[-0.01em] tnum text-ink">
                            {formatNumber(totalProduct)}
                            <small className="ml-1.5 font-sans text-sm font-normal tracking-normal text-ink-3">PLN</small>
                        </div>
                        <div className="mt-1.5 text-[13px] text-ink-2">wartość produktów</div>
                    </div>
                </div>
            </Card>

            {/* KPI */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile label="Produkty netto" value={formatNumber(totalProduct)} unit="PLN" description={`${productItems.length} poz.`} />
                <KpiTile label="Montaż netto" value={formatNumber(totalInstallation)} unit="PLN" description="Bez prowizji" />
                <KpiTile label="Prowizja zarobiona" value={formatNumber(earnedComm)} unit="PLN" description={earnedDescription} />
                <KpiTile label="Prowizja planowana" value={formatNumber(pendingComm)} unit="PLN" description="Po zakończeniu projektu" />
            </div>

            {/* Część interaktywna (komponent kliencki) */}
            <AdminProjectDetailClient
                project={project}
                items={items}
                commissions={commissionsRes}
                isAdmin={isAdmin}
                currentUserId={session.user.id}
                canChangeStatus={canChangeStatus}
                initialFiles={files}
                zkChanges={zkChanges}
            />
        </div>
    );
}
