'use server';

// Server actions panelu admina dla integracji Subiekt GT (PLAN-SUBIEKT-2026-10-29.md, Loop 4).
// Każda akcja: sesja + uprawnienie → operacja z src/lib/subiekt/adminOps.ts (cała logika i transakcja) →
// revalidatePath. Operacje przypisania (przypisz, utwórz projekt, ignoruj, zastosuj status) może wykonać
// ADMIN lub STAFF; operacje przeliczające prowizje między projektami (połącz, przenieś, zmiana typu pozycji)
// tylko ADMIN.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { canManageFinancialOperations, canManageOperationalProjects } from "@/lib/rbac";
import {
    assignDocumentToProjectOp,
    createProjectFromDocumentOp,
    ignoreDocumentOp,
    mergeProjectsOp,
    moveDocumentToProjectOp,
    nextStatusSteps,
    overrideItemTypeOp,
} from "@/lib/subiekt/adminOps";
import { computeSuggestedStatus } from "@/lib/subiekt/status";
import { updateProjectStatus } from "@/app/actions/projects";

const SUBIEKT_PAGE = '/dashboard/admin/integrations/subiekt';

function revalidateSubiekt(projectIds: string[]) {
    for (const id of new Set(projectIds)) {
        revalidatePath(`/dashboard/admin/projects/${id}`);
        revalidatePath(`/dashboard/projects/${id}`);
    }
    revalidatePath('/dashboard/admin');
    revalidatePath(SUBIEKT_PAGE);
    revalidatePath('/dashboard/projects');
    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard');
}

export async function assignDocumentToProject(documentId: string, projectId: string): Promise<{ success: true }> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageOperationalProjects(session.user.role)) throw new Error("Unauthorized");

    const { affectedProjectIds } = await assignDocumentToProjectOp(documentId, projectId, session.user.id);
    revalidateSubiekt(affectedProjectIds);
    return { success: true };
}

export async function createProjectFromDocument(documentId: string, ownerId: string): Promise<{ success: true; projectId: string }> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageOperationalProjects(session.user.role)) throw new Error("Unauthorized");

    const { projectId, affectedProjectIds } = await createProjectFromDocumentOp(documentId, ownerId, session.user.id);
    revalidateSubiekt(affectedProjectIds);
    return { success: true, projectId };
}

export async function ignoreDocument(documentId: string, note: string): Promise<{ success: true }> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageOperationalProjects(session.user.role)) throw new Error("Unauthorized");

    const { affectedProjectIds } = await ignoreDocumentOp(documentId, note, session.user.id);
    revalidateSubiekt(affectedProjectIds);
    return { success: true };
}

export async function mergeProjects(targetProjectId: string, sourceProjectIds: string[]): Promise<{ success: true }> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageFinancialOperations(session.user.role)) throw new Error("Unauthorized");

    const { affectedProjectIds } = await mergeProjectsOp(targetProjectId, sourceProjectIds, session.user.id);
    revalidateSubiekt(affectedProjectIds);
    return { success: true };
}

export async function moveDocumentToProject(documentId: string, targetProjectId: string): Promise<{ success: true }> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageFinancialOperations(session.user.role)) throw new Error("Unauthorized");

    const { affectedProjectIds } = await moveDocumentToProjectOp(documentId, targetProjectId, session.user.id);
    revalidateSubiekt(affectedProjectIds);
    return { success: true };
}

/** Pozycja dostaje nowe id (usunięcie + dodanie przez rdzeń prowizji) — zwracane jako `itemId`. */
export async function overrideItemType(itemId: string, type: 'PRODUCT' | 'INSTALLATION'): Promise<{ success: true; itemId: string }> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageFinancialOperations(session.user.role)) throw new Error("Unauthorized");

    const result = await overrideItemTypeOp(itemId, type, session.user.id);
    if (!result.unchanged) revalidateSubiekt([result.projectId]);
    return { success: true, itemId: result.itemId };
}

/**
 * Stosuje sugerowany status przez istniejące updateProjectStatus (walidacja przejść, PENDING, finalizacja
 * prowizji i cashbacku), krok po kroku: ZGŁOSZONY → PRZYJĘTY → W_REALIZACJI → ZAKOŃCZONY. Kroki nie są jedną
 * transakcją — błąd w trakcie zostawia projekt na ostatnim udanym kroku (każdy krok jest poprawnym stanem).
 */
export async function applySuggestedStatus(projectId: string): Promise<{ success: true; unchanged?: true }> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageOperationalProjects(session.user.role)) throw new Error("Unauthorized");

    const [project] = await query<{ status: string }>("SELECT status FROM projects WHERE id = ?", [projectId]);
    if (!project) throw new Error("Projekt nie istnieje.");
    const suggested = await computeSuggestedStatus(projectId);
    if (!suggested || suggested === project.status) return { success: true, unchanged: true };

    for (const step of nextStatusSteps(project.status, suggested)) {
        await updateProjectStatus(projectId, step);
    }
    revalidateSubiekt([projectId]);
    return { success: true };
}
