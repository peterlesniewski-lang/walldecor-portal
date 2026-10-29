import crypto from 'crypto';
import type { SubiektDocumentPayload } from './types';

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key]);
        return sorted;
    }
    return value;
}

/**
 * Wersja kanonicznej serializacji, wpisana do hashowanego obiektu. Podbicie jej zmienia hash KAŻDEGO
 * dokumentu, więc następny sync zapisze nowy snapshot dla wszystkich — robić to tylko przy zmianie
 * tego, co uznajemy za treść dokumentu (np. nowe pole w payloadzie).
 */
export const HASH_VERSION = 1;

/**
 * Kanoniczny JSON treści dokumentu: klucze posortowane na każdym poziomie, pozycje wg external_id,
 * bez `is_paid` (zapłata nie jest zmianą treści), z wersją `v` = HASH_VERSION.
 */
export function canonicalizeDocument(doc: SubiektDocumentPayload): string {
    const content: Partial<SubiektDocumentPayload> = { ...doc };
    delete content.is_paid;
    const positions = [...doc.positions].sort((a, b) => a.external_id - b.external_id);
    return JSON.stringify(sortKeys({ v: HASH_VERSION, ...content, positions }));
}

export function hashDocument(doc: SubiektDocumentPayload): string {
    return crypto.createHash('sha256').update(canonicalizeDocument(doc)).digest('hex');
}
