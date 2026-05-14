import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArchitectRegisteredPlaceholders } from '../src/lib/emailPlaceholders.ts';

test('builds all placeholders required by the architect welcome template', () => {
    const placeholders = buildArchitectRegisteredPlaceholders({
        userName: 'Anna Architekt',
        email: 'anna@example.com',
        password: 'TempPass123',
        portalUrl: 'https://portal.example.com',
    });

    assert.deepEqual(placeholders, {
        user_name: 'Anna Architekt',
        email: 'anna@example.com',
        password: 'TempPass123',
        portal_url: 'https://portal.example.com',
    });
});
