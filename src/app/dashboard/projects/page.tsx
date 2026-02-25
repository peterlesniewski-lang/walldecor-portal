import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArchitectProjects } from "@/lib/services";
import ProjectListClient from "@/components/ProjectListClient";
import {
    FolderKanban
} from 'lucide-react';

export default async function ProjectsPage() {
    const session = await getServerSession(authOptions);
    if (!session) return null;

    const projects = await getArchitectProjects(session.user.id, session.user.role);

    return <ProjectListClient initialProjects={projects} userId={session.user.id} userRole={session.user.role} />;
}
