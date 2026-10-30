// Hook dla testów wywołujących server actions bezpośrednio (bez serwera Next.js): `next-auth`,
// `next/cache` i `@/lib/auth` importowane z src/ trafiają na atrapy z tests/helpers/stubs/, a `next/server`
// na prawdziwy `next/server.js`.
// Rejestrować PO srcResolveHooks.ts (hooki działają od ostatnio zarejestrowanego), przed importem akcji.
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
const STUBS: Record<string, string> = {
    'next-auth': new URL('./stubs/next-auth.ts', import.meta.url).href,
    'next/cache': new URL('./stubs/next-cache.ts', import.meta.url).href,
    '@/lib/auth': new URL('./stubs/lib-auth.ts', import.meta.url).href,
};

type ResolveContext = { parentURL?: string };
type NextResolve = (specifier: string, context: ResolveContext) => unknown;
const { registerHooks } = nodeModule as unknown as {
    registerHooks(hooks: { resolve(specifier: string, context: ResolveContext, nextResolve: NextResolve): unknown }): void;
};

registerHooks({
    resolve(specifier, context, nextResolve) {
        // Next.js nie ma pola "exports" dla `next/server` — Node bez bundlera potrzebuje rozszerzenia.
        if (specifier === 'next/server') return nextResolve('next/server.js', context);
        const stub = STUBS[specifier];
        if (stub && context.parentURL?.startsWith('file:') && fileURLToPath(context.parentURL).startsWith(srcRoot)) {
            return { url: stub, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
});

export function setTestSession(user: { id: string; role: string; name?: string; email?: string } | null): void {
    (globalThis as any).__testSession = user ? { user } : null;
}
