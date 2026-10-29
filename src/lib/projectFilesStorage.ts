// Pliki projektów na dysku: private_uploads/projects/<projectId>/<stored_name>. Tabela project_files trzyma
// tylko stored_name, więc katalog wynika z project_id — przy łączeniu projektów (mergeProjectsOp) pliki
// projektów źródłowych trzeba przenieść do katalogu projektu docelowego (moveProjectFileDirs, po COMMIT).
import { join } from 'path';
import { mkdir, readdir, rename, rmdir, stat } from 'fs/promises';

const SAFE_PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Katalog plików projektu. Odrzuca id, które mogłyby wyjść poza katalog (id projektów: uuid albo p_xxxxxxxx). */
export function projectFilesDir(projectId: string, root: string = process.cwd()): string {
    if (!SAFE_PROJECT_ID.test(projectId)) throw new Error(`Nieprawidłowy identyfikator projektu: ${projectId}`);
    return join(root, 'private_uploads', 'projects', projectId);
}

export interface FileDirMove {
    /** Id projektu źródłowego (katalog do opróżnienia). */
    from: string;
    /** Id projektu docelowego. */
    to: string;
}

export interface FileDirMoveResult {
    moved: number;
    failed: Array<{ from: string; to: string; file: string | null; error: string }>;
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Przenosi pliki z katalogów projektów źródłowych do katalogu projektu docelowego (scalanie zawartości,
 * istniejący plik o tej samej nazwie nie jest nadpisywany). Brak katalogu źródłowego = nic do przeniesienia.
 * Nie rzuca: błędy zbiera w `failed` i loguje ostrzeżenie (baza jest już po COMMIT, pliki da się przenieść ręcznie).
 */
export async function moveProjectFileDirs(moves: FileDirMove[], root: string = process.cwd()): Promise<FileDirMoveResult> {
    const result: FileDirMoveResult = { moved: 0, failed: [] };
    for (const move of moves) {
        const fail = (file: string | null, error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            result.failed.push({ ...move, file, error: message });
            console.warn('[files] Nie udało się przenieść pliku projektu po połączeniu', { ...move, file, error: message });
        };
        let fromDir: string;
        let toDir: string;
        let entries: string[];
        try {
            fromDir = projectFilesDir(move.from, root);
            toDir = projectFilesDir(move.to, root);
            if (!(await exists(fromDir))) continue;
            entries = await readdir(fromDir);
            await mkdir(toDir, { recursive: true });
        } catch (error) {
            fail(null, error);
            continue;
        }
        for (const entry of entries) {
            const target = join(toDir, entry);
            try {
                if (await exists(target)) throw new Error('plik o tej nazwie już istnieje w katalogu docelowym');
                await rename(join(fromDir, entry), target);
                result.moved++;
            } catch (error) {
                fail(entry, error);
            }
        }
        try {
            await rmdir(fromDir); // tylko pusty katalog; po nieudanym przeniesieniu zostaje
        } catch {
            /* katalog niepusty — pliki z `failed` zostały na miejscu */
        }
    }
    return result;
}
