// Format kodów architektów Subiekta (Loop 4b) — czysty moduł bez bazy, wspólny dla generatora
// (codes.ts) i mapowania uwag dokumentu (mapping.ts).

/** Kod automatyczny: `A-` + numer. */
export const AUTO_CODE_PATTERN = /^A-(\d+)$/;

/** `A-` + numer dopełniony zerami do 3 cyfr: 1 → A-001, 999 → A-999, 1000 → A-1000. */
export function formatSubiektCode(n: number): string {
    return `A-${String(n).padStart(3, '0')}`;
}
