// Testy źródłowe akcji panelu Subiekt (PLAN-SUBIEKT-2026-10-29.md, Loop 4, Krok 1). Akcje wymagają sesji
// next-auth, więc sprawdzamy kod: sesja + właściwe uprawnienie przed operacją, logika w adminOps.ts,
// brak drugiej implementacji prowizji.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const actions = await readFile(new URL('../src/app/actions/subiekt.ts', import.meta.url), 'utf8');
const adminOps = await readFile(new URL('../src/lib/subiekt/adminOps.ts', import.meta.url), 'utf8');

/** Treść funkcji od jej deklaracji do następnego `export ` (lub końca pliku). */
function functionBody(source: string, name: string): string {
    const start = source.search(new RegExp(`export (async )?function ${name}\\(`));
    assert.notEqual(start, -1, `brak ${name}`);
    const next = source.indexOf('\nexport ', start + 1);
    return source.slice(start, next === -1 ? undefined : next);
}

const OPERATIONAL = ['assignDocumentToProject', 'createProjectFromDocument', 'ignoreDocument', 'applySuggestedStatus'];
const FINANCIAL = ['mergeProjects', 'moveDocumentToProject', 'overrideItemType'];

test("actions file is a 'use server' module", () => {
    assert.ok(actions.startsWith("'use server';"));
});

for (const name of OPERATIONAL) {
    test(`${name}: session + canManageOperationalProjects before any operation`, () => {
        const body = functionBody(actions, name);
        const session = body.indexOf('getServerSession(authOptions)');
        const guard = body.indexOf('!canManageOperationalProjects(session.user.role)) throw new Error("Unauthorized")');
        assert.ok(session !== -1 && guard !== -1, `${name}: brak sesji lub sprawdzenia roli`);
        assert.ok(session < guard);
        assert.ok(!body.includes('canManageFinancialOperations'));
        const firstCall = body.search(/await (\w+Op|query|computeSuggestedStatus|updateProjectStatus)\(/);
        assert.ok(firstCall > guard, `${name}: operacja przed sprawdzeniem uprawnień`);
    });
}

for (const name of FINANCIAL) {
    test(`${name}: session + canManageFinancialOperations (ADMIN only) before the operation`, () => {
        const body = functionBody(actions, name);
        const guard = body.indexOf('!canManageFinancialOperations(session.user.role)) throw new Error("Unauthorized")');
        assert.ok(body.indexOf('getServerSession(authOptions)') !== -1 && guard !== -1, `${name}: brak sesji lub sprawdzenia roli`);
        assert.ok(!body.includes('canManageOperationalProjects'));
        assert.ok(body.search(/await \w+Op\(/) > guard);
    });
}

test('every exported action is covered by a permission test', () => {
    const exported = [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]).sort();
    assert.deepEqual(exported, [...OPERATIONAL, ...FINANCIAL].sort());
});

test('mergeProjectsOp runs in withTransaction and deletes the source projects', () => {
    const body = functionBody(adminOps, 'mergeProjectsOp');
    assert.ok(body.includes('withTransaction('));
    assert.ok(body.includes('DELETE FROM projects WHERE id IN'));
    for (const table of ['subiekt_documents', 'project_items', 'commissions', 'project_files']) assert.ok(body.includes(`'${table}'`), table);
});

test('no second commission implementation: overrideItemType and adminOps go through the core', () => {
    assert.ok(!functionBody(actions, 'overrideItemType').includes('INSERT INTO commissions'));
    assert.ok(!functionBody(adminOps, 'overrideItemTypeOp').includes('INSERT INTO commissions'));
    assert.ok(!actions.includes('INSERT INTO commissions'));
    assert.ok(!adminOps.includes('INSERT INTO commissions'));
    assert.ok(functionBody(adminOps, 'overrideItemTypeOp').includes('deleteItemCore(') && functionBody(adminOps, 'overrideItemTypeOp').includes('addItemCore('));
});

test('applySuggestedStatus applies steps through the existing updateProjectStatus', () => {
    const body = functionBody(actions, 'applySuggestedStatus');
    assert.ok(body.includes('computeSuggestedStatus(projectId)'));
    assert.match(body, /for \(const step of nextStatusSteps\(project\.status, suggested\)\)\s*\{\s*await updateProjectStatus\(projectId, step\);/);
    assert.ok(!body.includes('UPDATE projects'));
});
