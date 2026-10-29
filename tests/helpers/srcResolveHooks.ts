// Hook rozwiązywania modułów dla testów integracyjnych uruchamianych przez `node --test`.
// Kod w src/ importuje przez alias `@/…` i ścieżki względne bez rozszerzenia (jak w Next.js / tsconfig
// "moduleResolution": "bundler"); Node bez bundlera tego nie rozwiąże, więc mapujemy je na pliki .ts.
import * as nodeModule from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
const CANDIDATE_SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function findSourceFile(basePath: string): string | null {
    if (existsSync(basePath) && statSync(basePath).isFile()) return basePath;
    for (const suffix of CANDIDATE_SUFFIXES) {
        const candidate = basePath + suffix;
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

// registerHooks (Node ≥ 22.15) nie ma typów w zainstalowanym @types/node 20 — minimalny opis lokalnie.
type ResolveContext = { parentURL?: string };
type NextResolve = (specifier: string, context: ResolveContext) => unknown;
const { registerHooks } = nodeModule as unknown as {
    registerHooks(hooks: { resolve(specifier: string, context: ResolveContext, nextResolve: NextResolve): unknown }): void;
};

registerHooks({
    resolve(specifier, context, nextResolve) {
        let basePath: string | null = null;

        if (specifier.startsWith('@/')) {
            basePath = resolve(srcRoot, specifier.slice(2));
        } else if (
            (specifier.startsWith('./') || specifier.startsWith('../')) &&
            context.parentURL?.startsWith('file:') &&
            fileURLToPath(context.parentURL).startsWith(srcRoot)
        ) {
            basePath = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
        }

        if (basePath) {
            const file = findSourceFile(basePath);
            if (file) return nextResolve(pathToFileURL(file).href, context);
        }
        return nextResolve(specifier, context);
    },
});
