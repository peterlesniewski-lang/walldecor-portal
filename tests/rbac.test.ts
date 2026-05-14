import test from 'node:test';
import assert from 'node:assert/strict';
import {
    canManageFinancialOperations,
    canManageOperationalProjects,
    canRegisterArchitects,
    canUpdateSystemSettings,
} from '../src/lib/rbac.ts';

test('allows staff to register architects and manage project operations', () => {
    assert.equal(canRegisterArchitects('STAFF'), true);
    assert.equal(canManageOperationalProjects('STAFF'), true);
});

test('keeps staff out of financial and system configuration operations', () => {
    assert.equal(canManageFinancialOperations('STAFF'), false);
    assert.equal(canUpdateSystemSettings('STAFF'), false);
});

test('allows admins to perform all management operations', () => {
    assert.equal(canRegisterArchitects('ADMIN'), true);
    assert.equal(canManageOperationalProjects('ADMIN'), true);
    assert.equal(canManageFinancialOperations('ADMIN'), true);
    assert.equal(canUpdateSystemSettings('ADMIN'), true);
});
