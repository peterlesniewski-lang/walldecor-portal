import { test, expect, request as requestFixture, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const ADMIN_EMAIL = 'admin@e2e.walldecor.test';
const ADMIN_PASSWORD = 'Admin12345';
const ARCHITECT_EMAIL = 'jan@e2e.walldecor.test';
const ARCHITECT_TEMP_PASSWORD = 'Temp12345';
const ARCHITECT_NEW_PASSWORD = 'E2eTest123';
const PROJECT_NAME = '[E2E] Apartament Testowy';
const DB_PATH = './e2e.sqlite';

function cleanupE2E() {
    const output = execFileSync('node', ['scripts/cleanup-e2e-data.mjs', '--json'], {
        cwd: process.cwd(),
        env: { ...process.env, DB_PATH },
        encoding: 'utf8',
    });
    return JSON.parse(output);
}

function queryDb<T = any>(sql: string, params: any[] = []): T[] {
    const db = new Database(DB_PATH, { readonly: true });
    try {
        return db.prepare(sql).all(params) as T[];
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

async function confirmStatus(page: Page, buttonName: RegExp | string) {
    await page.getByRole('button', { name: buttonName }).click();
    await page.getByRole('button', { name: /Potwierdź/ }).click();
}

test('Loop 2 full admin and architect journey with cleanup', async ({ browser, baseURL }) => {
    cleanupE2E();

    const screenshotDir = join(process.cwd(), 'test-results', 'loop2-screenshots');
    mkdirSync(screenshotDir, { recursive: true });

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const architectContext = await browser.newContext();
    const architectPage = await architectContext.newPage();

    try {
        await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
        await expect(adminPage).toHaveURL(/\/dashboard\/admin/);
        await expect(adminPage.getByRole('heading', { name: /Centrum operacyjne/ })).toBeVisible();

        await adminPage.getByTestId('open-register-architect').click();
        await adminPage.getByTestId('register-first-name').fill('Jan');
        await adminPage.getByTestId('register-last-name').fill('Testowy');
        await adminPage.getByTestId('register-email').fill(ARCHITECT_EMAIL);
        await adminPage.getByTestId('register-password').fill(ARCHITECT_TEMP_PASSWORD);
        await adminPage.getByTestId('register-studio').fill('[E2E] Studio Testowe');
        await adminPage.getByTestId('register-nip').fill('1234567890');
        await adminPage.getByTestId('register-address').fill('Testowa 1, 00-001 Warszawa');
        await adminPage.getByTestId('register-bank-account').fill('00102010260000042270201111');
        await adminPage.getByTestId('register-architect-submit').click();
        await expect(adminPage.getByText('Architekt zarejestrowany!')).toBeVisible();

        await login(architectPage, ARCHITECT_EMAIL, ARCHITECT_TEMP_PASSWORD);
        await expect(architectPage).toHaveURL(/\/auth\/change-password/);
        await architectPage.goto('/dashboard');
        await expect(architectPage).toHaveURL(/\/auth\/change-password/);
        await architectPage.getByTestId('change-password-current').fill(ARCHITECT_TEMP_PASSWORD);
        await architectPage.getByTestId('change-password-new').fill(ARCHITECT_NEW_PASSWORD);
        await architectPage.getByTestId('change-password-confirm').fill(ARCHITECT_NEW_PASSWORD);
        await architectPage.getByTestId('change-password-submit').click();
        await expect.poll(() => {
            return queryDb<{ must_change_password: number }>(
                'SELECT must_change_password FROM users WHERE email = ?',
                [ARCHITECT_EMAIL]
            )[0]?.must_change_password;
        }, { timeout: 30_000 }).toBe(0);
        await architectPage.goto('/dashboard');
        await expect(architectPage).toHaveURL(/\/dashboard/);
        await expect(architectPage.getByText('Partner').first()).toBeVisible();
        await architectPage.screenshot({ path: join(screenshotDir, 'c-password-change.png'), fullPage: true });

        await architectPage.getByTestId('open-project-modal').click();
        await architectPage.getByTestId('project-name').fill(PROJECT_NAME);
        await architectPage.getByTestId('project-client').fill('Klient E2E');
        await architectPage.getByTestId('project-item-description-0').fill('Produkty testowe do pełnej ścieżki');
        await architectPage.getByTestId('project-submit').click();
        await expect(architectPage.getByText('Gotowe!')).toBeVisible();
        await architectPage.reload();
        await expect(architectPage.getByText(PROJECT_NAME)).toBeVisible();

        await adminPage.goto('/dashboard/admin');
        const adminProjectCard = adminPage.getByRole('button', { name: /Apartament Testowy/ });
        await expect(adminProjectCard).toBeVisible();
        await adminProjectCard.click();
        await adminPage.getByRole('link', { name: /Otwórz pełny projekt/ }).click();
        await expect(adminPage).toHaveURL(/\/dashboard\/admin\/projects\//);

        await adminPage.locator('[data-testid^="edit-item-amount-"]').first().click();
        await adminPage.locator('[data-testid^="item-amount-input-"]').first().fill('12000');
        await adminPage.locator('[data-testid^="save-item-amount-"]').first().click();
        await expect(adminPage.getByText(/12\s*000/).first()).toBeVisible();

        await confirmStatus(adminPage, /Akceptuj/);
        await expect(adminPage.getByText('PRZYJĘTY').first()).toBeVisible();
        await confirmStatus(adminPage, /W Realizacji/);
        await expect(adminPage.getByText('W_REALIZACJI').first()).toBeVisible();
        await confirmStatus(adminPage, /Finalizuj/);
        await expect(adminPage.getByText('ZAKOŃCZONY').first()).toBeVisible();
        await expect(adminPage.getByText(/1\s*200/).first()).toBeVisible();

        await architectPage.goto('/dashboard');
        await expect(architectPage.getByText(/1\s*200/).first()).toBeVisible();
        await expect(architectPage.getByText(/240/).first()).toBeVisible();
        await expect(architectPage.getByText(/12\s*000/).first()).toBeVisible();
        await expect(architectPage.getByText(/18\s*000/).first()).toBeVisible();
        await architectPage.screenshot({ path: join(screenshotDir, 'f-architect-financials.png'), fullPage: true });

        const pdfPath = join(screenshotDir, 'invoice-e2e.pdf');
        writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

        await architectPage.goto('/dashboard/wallet');
        await architectPage.getByTestId('open-commission-payout').click();
        await architectPage.getByTestId('commission-payout-invoice').setInputFiles(pdfPath);
        await architectPage.getByTestId('commission-payout-submit').click();
        await expect(architectPage.getByText('Wniosek Złożony!')).toBeVisible();

        const payoutRows = queryDb<{ id: string; invoice_url: string }>(
            "SELECT id, invoice_url FROM payout_requests WHERE architect_id = (SELECT id FROM users WHERE email = ?) ORDER BY created_at DESC LIMIT 1",
            [ARCHITECT_EMAIL]
        );
        expect(payoutRows.length).toBe(1);
        expect(payoutRows[0].invoice_url).toMatch(/\/api\/invoices\/invoice_/);

        const anonymousRequest = await requestFixture.newContext({ baseURL });
        const anonymousInvoice = await anonymousRequest.get(payoutRows[0].invoice_url);
        expect([401, 403]).toContain(anonymousInvoice.status());
        await anonymousRequest.dispose();

        const adminInvoice = await adminContext.request.get(payoutRows[0].invoice_url);
        expect(adminInvoice.status()).toBe(200);
        expect(adminInvoice.headers()['content-type']).toContain('application/pdf');
        expect((await adminInvoice.body()).length).toBeGreaterThan(0);

        await adminPage.goto('/dashboard/admin');
        await expect(adminPage.getByText('Jan Testowy').first()).toBeVisible();
        await adminPage.getByTestId(`payout-queue-in-payment-${payoutRows[0].id}`).click({ force: true });
        await expect(adminPage.getByText('W Realizacji').first()).toBeVisible();
        await adminPage.getByTestId(`payout-queue-paid-${payoutRows[0].id}`).click({ force: true });
        await expect(adminPage.getByText(/Wypłacono|Zapłacona/).first()).toBeVisible();

        await architectPage.goto('/dashboard/wallet');
        await expect(architectPage.getByText('Wypłata zrealizowana')).toBeVisible();
        await architectPage.screenshot({ path: join(screenshotDir, 'h-paid-payout.png'), fullPage: true });
    } finally {
        await adminContext.close();
        await architectContext.close();
        const cleanup = cleanupE2E();
        expect(cleanup.remaining_marker_rows).toBe(0);
    }
});
