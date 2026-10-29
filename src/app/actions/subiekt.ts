'use server';

// Server actions panelu admina dla integracji Subiekt GT (PLAN-SUBIEKT-2026-10-29.md, Loop 4).
// Każda akcja: sesja + uprawnienie → operacja z src/lib/subiekt/adminOps.ts (cała logika i transakcja) →
// revalidatePath. Błędy domenowe (komunikaty po polsku z operacji) wracają jako { ok: false, error }, bo build
// produkcyjny Next.js zamienia treść wyjątku rzuconego z server action na ogólny tekst z digestem. Rzucany
// zostaje tylko brak sesji / uprawnień ("Unauthorized"). Operacje przypisania (przypisz, utwórz projekt, ignoruj, zastosuj status) może wykonać
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
import { moveProjectFileDirs, type FileDirMoveResult } from "@/lib/projectFilesStorage";
import { logActivity } from "@/lib/services";
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

/** Wynik akcji panelu Subiekt: sukces z danymi albo komunikat błędu domenowego do pokazania adminowi. */
export type SubiektActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const FALLBACK_ERROR = 'Operacja nie powiodła się. Odśwież stronę i spróbuj ponownie.';

/** Wykonuje operację; wyjątek (walidacja, stan dokumentu/projektu) zamienia na { ok: false, error }. */
async function attempt<T extends object>(operation: () => Promise<T>): Promise<SubiektActionResult<T>> {
    try {
        return { ok: true, ...(await operation()) };
    } catch (error) {
        console.error('[subiekt] Operacja panelu admina odrzucona', error);
        return { ok: false, error: error instanceof Error && error.message ? error.message : FALLBACK_ERROR };
    }
}

/** Błędy przenoszenia plików pogrupowane po parze projektów (jeden wpis w logu na parę). */
function groupFileMoveFailures(failed: FileDirMoveResult['failed']): Map<string, FileDirMoveResult['failed']> {
    const groups = new Map<string, FileDirMoveResult['failed']>();
    for (const failure of failed) {
        const key = `${failure.from}\u0000${failure.to}`;
        groups.set(key, [...(groups.get(key) ?? []), failure]);
    }
    return groups;
}

export async function assignDocumentToProject(documentId: string, projectId: string): Promise<SubiektActionResult> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageOperationalProjects(session.user.role)) throw new Error("Unauthorized");

    return attempt(async () => {
        const { affectedProjectIds } = await assignDocumentToProjectOp(documentId, projectId, session.user.id);
        revalidateSubiekt(affectedProjectIds);
        return {};
    });
}

export async function createProjectFromDocument(documentId: string, ownerId: string): Promise<SubiektActionResult<{ projectId: string }>> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageOperationalProjects(session.user.role)) throw new Error("Unauthorized");

    return attempt(async () => {
        const { projectId, affectedProjectIds } = await createProjectFromDocumentOp(documentId, ownerId, session.user.id);
        revalidateSubiekt(affectedProjectIds);
        return { projectId };
    });
}

export async function ignoreDocument(documentId: string, note: string): Promise<SubiektActionResult> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageOperationalProjects(session.user.role)) throw new Error("Unauthorized");

    return attempt(async () => {
        const { affectedProjectIds } = await ignoreDocumentOp(documentId, note, session.user.id);
        revalidateSubiekt(affectedProjectIds);
        return {};
    });
}

export async function mergeProjects(targetProjectId: string, sourceProjectIds: string[]): Promise<SubiektActionResult> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageFinancialOperations(session.user.role)) throw new Error("Unauthorized");

    return attempt(async () => {
        const { affectedProjectIds, movedFileDirs } = await mergeProjectsOp(targetProjectId, sourceProjectIds, session.user.id);
        // Po COMMIT: pliki projektów źródłowych do katalogu docelowego (błąd = wpis w logu aktywności, baza już spójna).
        const filesResult = await moveProjectFileDirs(movedFileDirs);
        for (const [key, failures] of groupFileMoveFailures(filesResult.failed)) {
            const [from, to] = key.split('\u0000');
            // Połączenie jest już zapisane — błąd samego wpisu do logu nie może zgłosić adminowi porażki.
            await logActivity(
                session.user.id,
                'SUBIEKT_FILES_MOVE_FAILED',
                `Nie udało się przenieść plików projektu ${from} → ${to}`,
                { from, to, failures: failures.map((f) => ({ file: f.file, error: f.error })) },
                targetProjectId
            ).catch((error) => console.error('[subiekt] Nie udało się zapisać SUBIEKT_FILES_MOVE_FAILED', error));
        }
        revalidateSubiekt(affectedProjectIds);
        return {};
    });
}

export async function moveDocumentToProject(documentId: string, targetProjectId: string): Promise<SubiektActionResult> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageFinancialOperations(session.user.role)) throw new Error("Unauthorized");

    return attempt(async () => {
        const { affectedProjectIds } = await moveDocumentToProjectOp(documentId, targetProjectId, session.user.id);
        revalidateSubiekt(affectedProjectIds);
        return {};
    });
}

/** Pozycja dostaje nowe id (usunięcie + dodanie przez rdzeń prowizji) — zwracane jako `itemId`. */
export async function overrideItemType(itemId: string, type: 'PRODUCT' | 'INSTALLATION'): Promise<SubiektActionResult<{ itemId: string }>> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageFinancialOperations(session.user.role)) throw new Error("Unauthorized");

    return attempt(async () => {
        const result = await overrideItemTypeOp(itemId, type, session.user.id);
        if (!result.unchanged) revalidateSubiekt([result.projectId]);
        return { itemId: result.itemId };
    });
}

/**
 * Stosuje sugerowany status przez istniejące updateProjectStatus (walidacja przejść, PENDING, finalizacja
 * prowizji i cashbacku), krok po kroku: ZGŁOSZONY → PRZYJĘTY → W_REALIZACJI → ZAKOŃCZONY. Kroki nie są jedną
 * transakcją — błąd w trakcie zostawia projekt na ostatnim udanym kroku (każdy krok jest poprawnym stanem),
 * dlatego widoki odświeżamy także po błędzie.
 */
export async function applySuggestedStatus(projectId: string): Promise<SubiektActionResult<{ unchanged?: true }>> {
    const session = await getServerSession(authOptions);
    if (!session || !canManageOperationalProjects(session.user.role)) throw new Error("Unauthorized");

    return attempt(async () => {
        const [project] = await query<{ status: string }>("SELECT status FROM projects WHERE id = ?", [projectId]);
        if (!project) throw new Error("Projekt nie istnieje.");
        const suggested = await computeSuggestedStatus(projectId);
        if (!suggested || suggested === project.status) return { unchanged: true as const };

        try {
            for (const step of nextStatusSteps(project.status, suggested)) {
                await updateProjectStatus(projectId, step);
            }
        } finally {
            revalidateSubiekt([projectId]);
        }
        return {};
    });
}
