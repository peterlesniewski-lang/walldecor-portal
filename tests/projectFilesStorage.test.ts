// Pliki projektów na dysku po łączeniu projektów (src/lib/projectFilesStorage.ts) — na katalogu tymczasowym.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type StorageModule = typeof import('../src/lib/projectFilesStorage');
await import(new URL('./helpers/srcResolveHooks.ts', import.meta.url).href);
const { projectFilesDir, moveProjectFileDirs }: StorageModule = await import(new URL('../src/lib/projectFilesStorage.ts', import.meta.url).href);

const root = mkdtempSync(join(tmpdir(), 'walldecor-files-'));
test.after(() => rmSync(root, { recursive: true, force: true }));

function put(projectId: string, name: string, content = name) {
    mkdirSync(projectFilesDir(projectId, root), { recursive: true });
    writeFileSync(join(projectFilesDir(projectId, root), name), content);
}

test('projectFilesDir builds private_uploads/projects/<id> and rejects unsafe ids', () => {
    assert.equal(projectFilesDir('p_ab12cd34', root), join(root, 'private_uploads', 'projects', 'p_ab12cd34'));
    assert.equal(projectFilesDir('0b8f6c1e-1d2a-4c1b-9a77-3f2d1e0c9b8a', root).endsWith('0b8f6c1e-1d2a-4c1b-9a77-3f2d1e0c9b8a'), true);
    for (const bad of ['../etc', 'a/b', '', 'p_x\0']) assert.throws(() => projectFilesDir(bad, root), /Nieprawidłowy identyfikator/);
});

test('moveProjectFileDirs merges source dirs into the target, keeps existing files, removes empty sources', async (t) => {
    t.mock.method(console, 'warn', () => {});
    put('p_src1', 'a.pdf');
    put('p_src1', 'same.pdf', 'z p_src1');
    put('p_src2', 'b.png');
    put('p_target', 'c.pdf');
    put('p_target', 'same.pdf', 'z p_target');

    const result = await moveProjectFileDirs([
        { from: 'p_src1', to: 'p_target' },
        { from: 'p_src2', to: 'p_target' },
        { from: 'p_no_dir', to: 'p_target' },
        { from: '../x', to: 'p_target' },
    ], root);

    assert.equal(result.moved, 2);
    for (const name of ['a.pdf', 'b.png', 'c.pdf']) assert.ok(existsSync(join(projectFilesDir('p_target', root), name)), name);
    assert.equal(readFileSync(join(projectFilesDir('p_target', root), 'same.pdf'), 'utf8'), 'z p_target', 'bez nadpisania');
    assert.ok(existsSync(join(projectFilesDir('p_src1', root), 'same.pdf')), 'kolizja zostaje w źródle');
    assert.equal(existsSync(projectFilesDir('p_src2', root)), false, 'pusty katalog źródła usunięty');
    assert.deepEqual(result.failed.map((f) => [f.from, f.file]), [['p_src1', 'same.pdf'], ['../x', null]]);
});
