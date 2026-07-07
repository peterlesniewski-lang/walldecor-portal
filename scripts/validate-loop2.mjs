import { existsSync, readFileSync } from 'node:fs';

const reportPath = 'test-results/playwright-results.json';
const specPath = 'tests/e2e/full-journey.spec.ts';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

assert(existsSync(reportPath), `Missing Playwright JSON report: ${reportPath}`);
assert(existsSync(specPath), `Missing E2E spec: ${specPath}`);

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const spec = readFileSync(specPath, 'utf8');
const allTests = [];

function collect(suite) {
    for (const specEntry of suite.specs || []) {
        for (const test of specEntry.tests || []) allTests.push(test);
    }
    for (const child of suite.suites || []) collect(child);
}

for (const suite of report.suites || []) collect(suite);

assert(allTests.length >= 1, 'No Playwright tests were reported.');
assert(allTests.every((test) => test.status === 'expected'), 'At least one Playwright test did not finish as expected.');
assert(!/test\.skip/.test(spec), 'E2E spec contains test.skip.');
assert(/1\s*200/.test(spec), 'E2E spec does not assert the 1 200 PLN commission.');
assert(/240/.test(spec), 'E2E spec does not assert the 240 PLN cashback.');
assert(/cleanup-e2e-data\.mjs/.test(spec), 'E2E spec does not invoke cleanup.');

console.log(`[validate-loop2] OK: ${allTests.length} Playwright test(s) reported as expected and spec assertions verified.`);
