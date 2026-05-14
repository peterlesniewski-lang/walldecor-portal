import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('project file downloads sanitize uploaded filenames before response headers', async () => {
    const source = await readFile(new URL('../src/app/api/projects/[projectId]/files/[fileId]/route.ts', import.meta.url), 'utf8');

    assert.match(source, /function sanitizeDownloadFilename/);
    assert.ok(source.includes("replace(/[\\r\\n\"]/g, '_')"));
    assert.match(source, /filename="\$\{sanitizeDownloadFilename\(fileRecord\.original_name\)\}"/);
});
