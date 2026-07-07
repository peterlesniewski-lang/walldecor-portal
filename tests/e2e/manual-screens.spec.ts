import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';

const ADMIN_EMAIL = 'admin@e2e.walldecor.test';
const ADMIN_PASSWORD = 'Admin12345';
const STAFF_EMAIL = 'staff@e2e.walldecor.test';
const STAFF_TEMP_PASSWORD = 'Staff12345';
const STAFF_NEW_PASSWORD = 'StaffNew123';
const DB_PATH = './e2e.sqlite';

function cleanupE2E() {
    execFileSync('node', ['scripts/cleanup-e2e-data.mjs', '--json'], {
        cwd: process.cwd(),
        env: { ...process.env, DB_PATH },
        encoding: 'utf8',
    });
}

function seedReadOnlyPayout() {
    const db = new Database(DB_PATH);
    try {
        db.exec(`
            INSERT INTO users (id, name, email, password, role, bank_account)
            VALUES ('arch_manual_e2e', 'Manual Architekt', 'manual-arch@e2e.walldecor.test', '$2b$10$hashhashhashhashhashha', 'ARCHI', '00102010260000042270201111');

            INSERT INTO payout_requests (id, architect_id, amount, status, type, created_at)
            VALUES ('payout_manual_e2e', 'arch_manual_e2e', 150, 'PENDING', 'COMMISSION', CURRENT_TIMESTAMP);
        `);
    } finally {
        db.close();
    }
}

async function login(page: Page, email: string, password: string) {
    await page.goto('/auth/signin');
    await page.getByTestId('signin-email').fill(email);
    await page.getByTestId('signin-password').fill(password);
    await page.getByTestId('signin-submit').click();
}

test('Loop 3 manual screens, staff first login and read-only payout queue', async ({ browser }) => {
    cleanupE2E();

    const consoleErrors: string[] = [];
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();

    for (const page of [adminPage, staffPage]) {
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('pageerror', (error) => {
            consoleErrors.push(error.message);
        });
    }

    try {
        await adminPage.goto('/regulamin');
        await expect(adminPage.getByText(/Regulamin|WallDecor/i).first()).toBeVisible();

        await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
        await expect(adminPage).toHaveURL(/\/dashboard\/admin/);
        await expect(adminPage.getByRole('heading', { name: /Centrum operacyjne/ })).toBeVisible();
        await expect(adminPage.getByText('Pipeline projektów')).toBeVisible();
        await expect(adminPage.getByText('Analityka i partnerzy')).toBeVisible();

        await adminPage.goto('/dashboard/help');
        await expect(adminPage).toHaveURL(/\/dashboard\/admin\/help/);
        await expect(adminPage.getByText(/Pomoc|ADMIN|STAFF/i).first()).toBeVisible();

        await adminPage.goto('/dashboard/admin/settings');
        await expect(adminPage.getByText('Zespół')).toBeVisible();
        await adminPage.getByTestId('settings-add-user-open').click();
        await adminPage.getByTestId('settings-new-user-name').fill('Staff E2E');
        await adminPage.getByTestId('settings-new-user-email').fill(STAFF_EMAIL);
        await adminPage.getByTestId('settings-new-user-password').fill(STAFF_TEMP_PASSWORD);
        await adminPage.getByTestId('settings-new-user-role-staff').click();
        await adminPage.getByTestId('settings-new-user-submit').click();
        await expect(adminPage.getByText('Użytkownik Staff E2E został dodany.')).toBeVisible();

        seedReadOnlyPayout();

        await login(staffPage, STAFF_EMAIL, STAFF_TEMP_PASSWORD);
        await expect(staffPage).toHaveURL(/\/auth\/change-password/);
        await staffPage.getByTestId('change-password-current').fill(STAFF_TEMP_PASSWORD);
        await staffPage.getByTestId('change-password-new').fill(STAFF_NEW_PASSWORD);
        await staffPage.getByTestId('change-password-confirm').fill(STAFF_NEW_PASSWORD);
        await staffPage.getByTestId('change-password-submit').click();
        await expect.poll(() => {
            const db = new Database(DB_PATH, { readonly: true });
            try {
                const row = db
                    .prepare('SELECT must_change_password FROM users WHERE email = ?')
                    .get(STAFF_EMAIL) as { must_change_password?: number } | undefined;
                return row?.must_change_password;
            } finally {
                db.close();
            }
        }, { timeout: 30_000 }).toBe(0);

        await staffPage.goto('/dashboard/admin');
        await expect(staffPage.getByText('Podgląd tylko do odczytu. Wypłaty może rozliczać wyłącznie ADMIN.')).toBeVisible();
        await expect(staffPage.getByRole('link', { name: 'Manual Architekt' })).toBeVisible();

        await adminPage.goto('/dashboard/admin/architects');
        await expect(adminPage.getByRole('link', { name: /^Partner$/ })).toBeVisible();
        await adminPage.getByRole('link', { name: /^Partner$/ }).click();
        await expect(adminPage).toHaveURL(/tier=partner/);
        await expect(adminPage.getByText('Manual Architekt')).toBeVisible();
        await adminPage.getByRole('link', { name: /^Partner Plus$/ }).click();
        await expect(adminPage).toHaveURL(/tier=partner_plus/);
        await expect(adminPage.getByText('Nie znaleziono architektów')).toBeVisible();
        await adminPage.getByRole('link', { name: /^Partner Premium$/ }).click();
        await expect(adminPage).toHaveURL(/tier=partner_premium/);
        await expect(adminPage.getByText('Nie znaleziono architektów')).toBeVisible();

        expect(consoleErrors).toEqual([]);
    } finally {
        await adminContext.close();
        await staffContext.close();
        cleanupE2E();
    }
});
