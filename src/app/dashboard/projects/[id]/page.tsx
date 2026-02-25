import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetails, getArchitectStats } from "@/lib/services";
import ProjectDetailClient from "@/components/ProjectDetailClient";
import { notFound } from "next/navigation";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) return null;

    const project = await getProjectDetails(id);
    if (!project) notFound();

    const stats = await getArchitectStats(session.user.id);

    return <ProjectDetailClient project={project} availableCashback={stats.cashbackBalance} />;
}
