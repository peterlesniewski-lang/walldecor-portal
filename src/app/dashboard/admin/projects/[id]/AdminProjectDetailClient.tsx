'use client';

import ProjectFilesSection, { ProjectFile } from '@/components/ProjectFilesSection';
import SubiektChangesCard, { type SubiektChange } from '@/components/SubiektChangesCard';
import CommissionsCard from './CommissionsCard';
import ItemsCard from './ItemsCard';
import PartnerCard from './PartnerCard';
import PayoutCard from './PayoutCard';
import ProjectStatusCard from './ProjectStatusCard';
import type { Commission, Project, ProjectItem } from './types';

interface Props {
    project: Project;
    items: ProjectItem[];
    commissions: Commission[];
    isAdmin: boolean;
    currentUserId: string;
    canChangeStatus: boolean;
    initialFiles: ProjectFile[];
    zkChanges: SubiektChange[];
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

            <ItemsCard projectId={project.id} items={items} isAdmin={isAdmin} isFinalized={isFinalized} />

            <SubiektChangesCard changes={zkChanges} />

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
