import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));

// Tymczasowa lista wyjątków (ścieżki względem root repo) — pliki, w których natywne
// alert()/confirm() jeszcze nie zostały zamienione na inline UI. Docelowo pusta.
const KNOWN_EXCEPTIONS: string[] = [];

const DIALOG_CALL = /\b(window\.)?(alert|confirm)\(/;

async function collectTsx(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await collectTsx(full));
        else if (entry.name.endsWith('.tsx')) files.push(full);
    }
    return files;
}

test('no src/**/*.tsx file uses native alert() or confirm()', async () => {
    const files = await collectTsx(SRC_DIR);
    assert.ok(files.length > 0);

    const offenders: string[] = [];
    for (const file of files) {
        const rel = relative(ROOT_DIR, file);
        if (KNOWN_EXCEPTIONS.includes(rel)) continue;
        const source = await readFile(file, 'utf8');
        source.split('\n').forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
            if (DIALOG_CALL.test(line)) offenders.push(`${rel}:${i + 1}: ${trimmed}`);
        });
    }

    assert.deepEqual(offenders, [], `Native dialogs found:\n${offenders.join('\n')}`);
});
