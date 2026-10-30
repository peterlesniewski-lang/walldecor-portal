'use client';

import ProjectFilesSection, { ProjectFile } from '@/components/ProjectFilesSection';
import SubiektChangesCard from '@/components/SubiektChangesCard';
import type { ProjectDocChain, ProjectReconciliation, ProjectZkChange } from '@/lib/subiekt/queries';
import CommissionsCard from './CommissionsCard';
import ItemsCard from './ItemsCard';
import MergeProjectsCard from './MergeProjectsCard';
import PartnerCard from './PartnerCard';
import PayoutCard from './PayoutCard';
import ProjectStatusCard from './ProjectStatusCard';
import ReconciliationCard from './ReconciliationCard';
import SubiektDocumentsCard from './SubiektDocumentsCard';
import type { Commission, Project, ProjectItem } from './types';

interface Props {
    project: Project;
    items: ProjectItem[];
    commissions: Commission[];
    isAdmin: boolean;
    currentUserId: string;
    canChangeStatus: boolean;
    initialFiles: ProjectFile[];
    zkChanges: ProjectZkChange[];
    subiekt: {
        chains: ProjectDocChain[];
        summary: { zkTotal: number; fsTotal: number; remainingToInvoice: number };
        /** getMergeCandidates — cele „Przenieś do…” i źródła „Połącz projekty”. */
        mergeCandidates: Array<{ id: string; name: string; status: string; itemsTotal: number }>;
        /** getProjectReconciliations — OPEN: karta uzgodnienia nad pozycjami; RESOLVED: linia w dokumentach Subiekt. */
        reconciliations: ProjectReconciliation[];
    };
    /** canManageFinancialOperations (połącz, przenieś łańcuch, zmień typ pozycji). */
    canManageFinancial: boolean;
}

export default function AdminProjectDetailClient({
    project,
    items,
    commissions,
    isAdmin,
    currentUserId,
    canChangeStatus,
    initialFiles,
    zkChanges,
    subiekt,
    canManageFinancial,
}: Props) {
    const isFinalized = project.status === 'ZAKOŃCZONY';

    // Na ekranie jest jeden przycisk primary: akcja na wniosku o wypłatę ma pierwszeństwo przed zmianą statusu projektu.
    const payoutActionable = Boolean(
        isAdmin && project.payout && project.payout.status !== 'PAID' && project.payout.status !== 'REJECTED',
    );

    return (
        <div className="space-y-6">
            {project.architect && (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                    <PartnerCard architect={project.architect} isAdmin={isAdmin} />
                    <PayoutCard
                        payout={project.payout}
                        isAdmin={isAdmin}
                        hasBankAccount={Boolean(project.architect.bank_account)}
                    />
                </div>
            )}

            <ProjectStatusCard project={project} canChangeStatus={canChangeStatus} allowPrimary={!payoutActionable} />

            {/* Uzgodnienie faktur z zamówieniem (Loop 5b): ADMIN i STAFF, tylko otwarte, nad pozycjami. */}
            {canChangeStatus && subiekt.reconciliations
                .filter((r) => r.status === 'OPEN')
                .map((r) => <ReconciliationCard key={r.rootExternalId} projectId={project.id} reconciliation={r} />)}

            <ItemsCard
                projectId={project.id}
                items={items}
                isAdmin={isAdmin}
                isFinalized={isFinalized}
                canOverrideType={canManageFinancial && project.status !== 'NIEZREALIZOWANY'}
            />

            <SubiektDocumentsCard
                chains={subiekt.chains}
                summary={subiekt.summary}
                moveTargets={subiekt.mergeCandidates}
                resolved={subiekt.reconciliations.filter((r) => r.status === 'RESOLVED')}
                canMoveDocuments={canManageFinancial}
            />

            <SubiektChangesCard changes={zkChanges} />

            {canManageFinancial && <MergeProjectsCard projectId={project.id} candidates={subiekt.mergeCandidates} />}

            {commissions.length > 0 && <CommissionsCard commissions={commissions} />}

            <ProjectFilesSection
                projectId={project.id}
                currentUserId={currentUserId}
                initialFiles={initialFiles}
                isAdmin={isAdmin}
            />
        </div>
    );
}
