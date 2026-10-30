// Atrapa `next-auth` dla testów server actions: getServerSession zwraca sesję ustawioną w teście
// (tests/helpers/nextServerStubs.ts → setTestSession). Ładowana wyłącznie przez hook z testów.
export async function getServerSession(): Promise<unknown> {
    return (globalThis as any).__testSession ?? null;
}
export default {};
