import test from 'node:test';
import assert from 'node:assert/strict';
import { getHelpDocumentForRole } from '../src/lib/helpContent.ts';

test('maps each portal role to its help markdown document', () => {
    assert.equal(getHelpDocumentForRole('ARCHI').fileName, 'archi.md');
    assert.equal(getHelpDocumentForRole('STAFF').fileName, 'staff.md');
    assert.equal(getHelpDocumentForRole('ADMIN').fileName, 'admin.md');
});

test('falls back to architect help for unknown roles', () => {
    const doc = getHelpDocumentForRole('../../admin');

    assert.equal(doc.role, 'ARCHI');
    assert.equal(doc.fileName, 'archi.md');
    assert.equal(doc.relativePath, 'docs/help/archi.md');
});
