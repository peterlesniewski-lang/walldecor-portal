import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetails } from "@/lib/services";
import ProjectDetailClient from "@/components/ProjectDetailClient";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) return null;

    const project = await getProjectDetails(id);
    if (!project) notFound();

    const files = await query<any>(`
        SELECT pf.*, u.name as uploaded_by_name
        FROM project_files pf
        JOIN users u ON pf.uploaded_by = u.id
        WHERE pf.project_id = ?
        ORDER BY pf.created_at DESC
    `, [id]);

    return (
        <ProjectDetailClient
            project={project}
            initialFiles={files}
            currentUserId={session.user.id}
        />
    );
}
