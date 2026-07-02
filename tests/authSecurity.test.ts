import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('password reset consumes the token and updates the password atomically', async () => {
    const source = await readFile(new URL('../src/app/api/auth/reset-password/route.ts', import.meta.url), 'utf8');

    assert.match(source, /import \{ withTransaction \} from '@\/lib\/db';/);
    assert.match(source, /await withTransaction\(async \(queryFn\) =>/);
    assert.match(source, /FROM password_reset_tokens t[\s\S]*WHERE t\.token = \?[\s\S]*FOR UPDATE/);
    assert.match(source, /UPDATE users SET password = \?, must_change_password = 0, password_changed_at = CURRENT_TIMESTAMP, last_login_at = CURRENT_TIMESTAMP WHERE id = \?/);
    assert.match(source, /UPDATE password_reset_tokens SET used = 1 WHERE id = \?/);
});
