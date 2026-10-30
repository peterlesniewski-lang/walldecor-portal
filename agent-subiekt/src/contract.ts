// Kopia kontraktu paczki z portalu (src/lib/subiekt/types.ts, PLAN-SUBIEKT-2026-10-29.md 2.1).
// Kopia, a nie import: tsc z rootDir = src nie przyjmuje plików spoza katalogu agenta, a dist/ ma działać
// na PC bez kodu portalu. Zgodność pilnuje tests/contract.test.ts (paczka agenta przez walidator portalu).

export type SubiektDocType = 'ZK' | 'FS' | 'KFS' | 'FP' | 'WZ';

/** Portal przyjmuje najwyżej tyle dokumentów na stronę (więcej → 413). */
export const SUBIEKT_SYNC_MAX_DOCUMENTS = 200;

export interface SubiektPositionPayload {
    /** ob_Id z bazy GT. */
    external_id: number;
    ordinal: number;
    /** tw_Id z karty towaru lub null dla pozycji jednorazowej. */
    product_id: number | null;
    name: string;
    quantity: number;
    unit: string;
    unit_price_net: number;
    net_total: number;
    /** ob_Id korygowanej pozycji (KFS) lub null. */
    corrects_position_external_id: number | null;
}

export interface SubiektDocumentPayload {
    /** dok_Id z bazy GT — klucz idempotencji. */
    external_id: number;
    type: SubiektDocType;
    number: string;
    /** 'YYYY-MM-DD' */
    issued_at: string;
    contractor_name: string;
    contractor_nip: string | null;
    /** Agent zawsze wysyła null — portal czyta znacznik #A-… z `remarks`. */
    architect_code: string | null;
    parent_external_id: number | null;
    net_total: number;
    gross_total: number;
    is_paid: boolean;
    remarks: string | null;
    positions: SubiektPositionPayload[];
}

export interface SubiektSyncRequest {
    /** UUID uruchomienia agenta, ten sam dla wszystkich stron. */
    run_id: string;
    agent_version: string;
    page: number;
    pages: number;
    documents: SubiektDocumentPayload[];
}

export interface SubiektSyncResponse {
    run_id: string;
    accepted: number;
    unchanged: number;
    rejected: Array<{ external_id: number; reason: string }>;
    unassigned: number;
}
