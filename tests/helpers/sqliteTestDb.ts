// Tymczasowa baza SQLite dla testów integracyjnych. Schemat jest wycinany z scripts/seed-dev.mjs
// (blok między znacznikami `// SCHEMA-START` i `// SCHEMA-END`), więc testy i baza deweloperska mają
// jedno źródło prawdy o kolumnach. Dane demo z seed-dev nie są ładowane.
//
// Kolejność ma znaczenie: `src/lib/db.ts` czyta DB_TYPE przy imporcie, a plik bazy otwiera leniwie,
// dlatego createTestDb() trzeba wywołać PRZED dynamicznym importem czegokolwiek, co importuje db.ts.
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

function readSeedSchema(): string {
    const seed = readFileSync(fileURLToPath(new URL('../../scripts/seed-dev.mjs', import.meta.url)), 'utf8');
    const start = seed.indexOf('// SCHEMA-START');
    const end = seed.indexOf('// SCHEMA-END', start);
    if (start === -1 || end === -1) {
        throw new Error('Brak znaczników // SCHEMA-START / // SCHEMA-END w scripts/seed-dev.mjs');
    }
    const block = seed.slice(start, end);
    const sql = block.slice(block.indexOf('`') + 1, block.lastIndexOf('`'));
    if (!/CREATE TABLE/.test(sql)) {
        throw new Error('Blok schematu w scripts/seed-dev.mjs nie zawiera CREATE TABLE');
    }
    return sql;
}

export interface TestDb {
    path: string;
    /** Bezpośredni uchwyt better-sqlite3 do przygotowania danych i asercji. */
    db: any;
    cleanup(): void;
}

export function createTestDb(): TestDb {
    const dir = mkdtempSync(join(tmpdir(), 'walldecor-test-'));
    const path = join(dir, 'test.sqlite');
    const db = new Database(path);
    db.exec(readSeedSchema());

    process.env.DB_TYPE = 'sqlite';
    process.env.DB_PATH = path;

    return {
        path,
        db,
        cleanup() {
            db.close();
            rmSync(dir, { recursive: true, force: true });
        },
    };
}
