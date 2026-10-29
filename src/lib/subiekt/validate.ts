import {
    SUBIEKT_SYNC_MAX_DOCUMENTS,
    type SubiektDocType,
    type SubiektDocumentPayload,
    type SubiektPositionPayload,
    type SubiektSyncRequest,
} from './types';

export type ParseResult = { ok: true; value: SubiektSyncRequest } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOC_TYPES: readonly SubiektDocType[] = ['ZK', 'FS', 'KFS', 'FP', 'WZ'];

/** Pierwszy błąd przerywa walidację; komunikat zawiera ścieżkę pola. */
class ValidationError extends Error {}

type Obj = Record<string, unknown>;

function fail(path: string, expected: string): never {
    throw new ValidationError(`${path}: expected ${expected}`);
}

function asObject(value: unknown, path: string): Obj {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'object');
    return value as Obj;
}

function positiveInt(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) fail(path, 'positive integer');
    return value;
}

function nullablePositiveInt(value: unknown, path: string): number | null {
    return value === null ? null : positiveInt(value, path);
}

function finiteNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'finite number');
    return value;
}

function boundedString(value: unknown, path: string, max: number, nonEmpty: boolean): string {
    if (typeof value !== 'string') fail(path, 'string');
    if (nonEmpty && value.length === 0) fail(path, 'non-empty string');
    if (value.length > max) fail(path, `string of at most ${max} characters`);
    return value;
}

function nullableString(value: unknown, path: string, max: number): string | null {
    return value === null ? null : boundedString(value, path, max, false);
}

function isoDate(value: unknown, path: string): string {
    if (typeof value !== 'string' || !DATE_RE.test(value)) fail(path, 'date YYYY-MM-DD');
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(path, 'valid date');
    return value;
}

function parsePosition(raw: unknown, path: string): SubiektPositionPayload {
    const p = asObject(raw, path);
    return {
        external_id: positiveInt(p.external_id, `${path}.external_id`),
        ordinal: positiveInt(p.ordinal, `${path}.ordinal`),
        product_id: nullablePositiveInt(p.product_id, `${path}.product_id`),
        name: boundedString(p.name, `${path}.name`, 255, true),
        quantity: finiteNumber(p.quantity, `${path}.quantity`),
        unit: boundedString(p.unit, `${path}.unit`, 16, false),
        unit_price_net: finiteNumber(p.unit_price_net, `${path}.unit_price_net`),
        net_total: finiteNumber(p.net_total, `${path}.net_total`),
        corrects_position_external_id: nullablePositiveInt(
            p.corrects_position_external_id,
            `${path}.corrects_position_external_id`
        ),
    };
}

function parseDocument(raw: unknown, path: string): SubiektDocumentPayload {
    const d = asObject(raw, path);

    const type = d.type;
    if (typeof type !== 'string' || !DOC_TYPES.includes(type as SubiektDocType)) {
        fail(`${path}.type`, `one of ${DOC_TYPES.join(', ')}`);
    }
    if (typeof d.is_paid !== 'boolean') fail(`${path}.is_paid`, 'boolean');
    if (!Array.isArray(d.positions)) fail(`${path}.positions`, 'array');

    return {
        external_id: positiveInt(d.external_id, `${path}.external_id`),
        type: type as SubiektDocType,
        number: boundedString(d.number, `${path}.number`, 64, true),
        issued_at: isoDate(d.issued_at, `${path}.issued_at`),
        contractor_name: boundedString(d.contractor_name, `${path}.contractor_name`, 255, true),
        contractor_nip: nullableString(d.contractor_nip, `${path}.contractor_nip`, 20),
        architect_code: nullableString(d.architect_code, `${path}.architect_code`, 64),
        parent_external_id: nullablePositiveInt(d.parent_external_id, `${path}.parent_external_id`),
        net_total: finiteNumber(d.net_total, `${path}.net_total`),
        gross_total: finiteNumber(d.gross_total, `${path}.gross_total`),
        is_paid: d.is_paid,
        remarks: d.remarks === null ? null : (typeof d.remarks === 'string' ? d.remarks : fail(`${path}.remarks`, 'string or null')),
        positions: d.positions.map((pos, i) => parsePosition(pos, `${path}.positions[${i}]`)),
    };
}

export function parseSyncRequest(json: unknown): ParseResult {
    try {
        const body = asObject(json, 'body');

        if (typeof body.run_id !== 'string' || !UUID_RE.test(body.run_id)) fail('run_id', 'UUID');
        const agentVersion = boundedString(body.agent_version, 'agent_version', 32, true);
        const page = positiveInt(body.page, 'page');
        const pages = positiveInt(body.pages, 'pages');
        if (page > pages) fail('page', 'page <= pages');
        if (!Array.isArray(body.documents)) fail('documents', 'array');
        if (body.documents.length > SUBIEKT_SYNC_MAX_DOCUMENTS) throw new ValidationError('TOO_MANY_DOCUMENTS');

        return {
            ok: true,
            value: {
                run_id: body.run_id,
                agent_version: agentVersion,
                page,
                pages,
                documents: body.documents.map((doc, i) => parseDocument(doc, `documents[${i}]`)),
            },
        };
    } catch (err) {
        if (err instanceof ValidationError) return { ok: false, error: err.message };
        throw err;
    }
}
