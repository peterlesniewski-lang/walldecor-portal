// Połączenie z MS SQL Subiekta GT (tylko odczyt). SQL Server 2014 Express, nazwana instancja przez SQL Browser.
import sql from 'mssql';
import type { DbConfig } from './config.ts';

export type Pool = sql.ConnectionPool;

export function connectionConfig(db: DbConfig): sql.config {
    return {
        server: db.server,
        ...(db.port ? { port: db.port } : {}),
        database: db.database,
        user: db.user,
        password: db.password,
        connectionTimeout: 30_000,
        requestTimeout: 120_000,
        pool: { max: 2, min: 0 },
        options: {
            ...(db.instanceName ? { instanceName: db.instanceName } : {}),
            encrypt: false,
            trustServerCertificate: true,
            readOnlyIntent: true,
            appName: 'portal-archi-agent',
        },
    };
}

export async function openPool(db: DbConfig): Promise<Pool> {
    const pool = new sql.ConnectionPool(connectionConfig(db));
    return pool.connect();
}

type SqlType = sql.ISqlType | (() => sql.ISqlType);
export type Params = Record<string, { type: SqlType; value: unknown }>;

export async function queryRows<T>(pool: Pool, text: string, params: Params = {}): Promise<T[]> {
    const request = pool.request();
    for (const [name, param] of Object.entries(params)) request.input(name, param.type, param.value);
    const result = await request.query<T>(text);
    return result.recordset;
}

export const sinceParam = (since: string): Params => ({ since: { type: sql.VarChar(10), value: since } });

/** Zapytanie z listą identyfikatorów `IN (@id0, …)` w partiach (limit SQL Server: 2100 parametrów). */
export async function queryByIds<T>(pool: Pool, template: (inList: string) => string, ids: number[], batchSize = 500): Promise<T[]> {
    const unique = [...new Set(ids)];
    const rows: T[] = [];
    for (let start = 0; start < unique.length; start += batchSize) {
        const batch = unique.slice(start, start + batchSize);
        const params: Params = {};
        batch.forEach((id, i) => { params[`id${i}`] = { type: sql.Int, value: id }; });
        rows.push(...await queryRows<T>(pool, template(batch.map((_, i) => `@id${i}`).join(', ')), params));
    }
    return rows;
}

/** Jak queryByIds, dla listy nazw (NVarChar). */
export async function queryByNames<T>(pool: Pool, template: (inList: string) => string, names: string[]): Promise<T[]> {
    const params: Params = {};
    names.forEach((name, i) => { params[`t${i}`] = { type: sql.NVarChar(128), value: name }; });
    return queryRows<T>(pool, template(names.map((_, i) => `@t${i}`).join(', ')), params);
}

export const categoryParam = (categoryId: number): Params => ({ categoryId: { type: sql.Int, value: categoryId } });
