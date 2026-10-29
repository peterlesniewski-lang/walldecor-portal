// Kontrakt paczki od agenta Subiekt GT → portal (PLAN-SUBIEKT-2026-10-29.md, 2.1).

export type SubiektDocType = 'ZK' | 'FS' | 'KFS' | 'FP' | 'WZ';

/** Agent dzieli paczkę po tyle dokumentów; więcej → 413 / TOO_MANY_DOCUMENTS. */
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
    /** Numer pełny z GT, np. "FS 123/10/2026". Tylko do wyświetlania. */
    number: string;
    issued_at: string; // 'YYYY-MM-DD'
    /** Kontrahent z dokumentu. */
    contractor_name: string;
    contractor_nip: string | null;
    /** Wartość pola własnego „Architekt” (lub znacznika z uwag). null dla dokumentów pochodnych w łańcuchu. */
    architect_code: string | null;
    /** dok_Id dokumentu, z którego ten powstał (FS z ZK, FS z WZ, WZ z ZK, KFS z FS). null dla ZK/FP. */
    parent_external_id: number | null;
    net_total: number;
    gross_total: number;
    is_paid: boolean;
    /** Treść pola „Uwagi” — do wykrycia znacznika #A-xxx gdy brak pola własnego. */
    remarks: string | null;
    positions: SubiektPositionPayload[];
}

export interface SubiektSyncRequest {
    /** Identyfikator uruchomienia agenta (UUID). Ten sam dla wszystkich stron paczki. */
    run_id: string;
    agent_version: string;
    /** Numer strony i liczba stron — agent dzieli paczkę po 200 dokumentów. */
    page: number;
    pages: number;
    documents: SubiektDocumentPayload[];
}

export interface SubiektSyncResponse {
    run_id: string;
    accepted: number;
    unchanged: number;
    rejected: Array<{ external_id: number; reason: string }>;
    /** Dokumenty, które portal przyjął, ale nie umiał przypisać do projektu (trafiły do skrzynki). */
    unassigned: number;
}
