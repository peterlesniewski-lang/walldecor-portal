import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 90_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    workers: 1,
    reporter: [
        ['list'],
        ['json', { outputFile: 'test-results/playwright-results.json' }],
    ],
    use: {
        baseURL: 'http://127.0.0.1:3110',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run dev:init && npm run dev -- --hostname 127.0.0.1 --port 3110',
        url: 'http://127.0.0.1:3110/auth/signin',
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            DB_TYPE: 'sqlite',
            DB_PATH: './e2e.sqlite',
            DEV_ADMIN_PASSWORD: 'Admin12345',
            NEXTAUTH_URL: 'http://127.0.0.1:3110',
            NEXTAUTH_SECRET: 'loop2-e2e-secret',
            DEMO_MODE: 'false',
        },
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
