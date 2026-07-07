const baseUrl = process.env.LOOP0_BASE_URL || 'http://127.0.0.1:3107';
const email = process.env.LOOP0_ADMIN_EMAIL || 'admin@e2e.walldecor.test';
const password = process.env.DEV_ADMIN_PASSWORD || 'Admin12345';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function getSetCookies(headers) {
    if (typeof headers.getSetCookie === 'function') {
        return headers.getSetCookie();
    }
    const header = headers.get('set-cookie');
    return header ? [header] : [];
}

function addCookies(cookieJar, setCookies) {
    for (const cookie of setCookies) {
        const pair = cookie.split(';')[0];
        const separatorIndex = pair.indexOf('=');
        if (separatorIndex === -1) continue;
        cookieJar.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
    }
}

function cookieHeader(cookieJar) {
    return Array.from(cookieJar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

const cookies = new Map();

const signInPage = await fetch(`${baseUrl}/auth/signin`, { redirect: 'manual' });
assert(signInPage.status === 200, `/auth/signin returned ${signInPage.status}`);
const signInHtml = await signInPage.text();
assert(signInHtml.includes('Panel Architekta'), '/auth/signin did not render the sign-in page.');
console.log(`[loop0-http] /auth/signin ${signInPage.status}`);

const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
addCookies(cookies, getSetCookies(csrfResponse.headers));
assert(csrfResponse.status === 200, `/api/auth/csrf returned ${csrfResponse.status}`);
const csrf = await csrfResponse.json();
assert(typeof csrf.csrfToken === 'string' && csrf.csrfToken.length > 20, 'Missing CSRF token.');

const loginBody = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/dashboard/admin`,
    json: 'true',
});

const loginResponse = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieHeader(cookies),
    },
    body: loginBody,
    redirect: 'manual',
});
addCookies(cookies, getSetCookies(loginResponse.headers));
assert(
    loginResponse.status === 200 || loginResponse.status === 302,
    `/api/auth/callback/credentials returned ${loginResponse.status}`
);
console.log(`[loop0-http] credentials login ${loginResponse.status}`);

const dashboardResponse = await fetch(`${baseUrl}/dashboard/admin`, {
    headers: { Cookie: cookieHeader(cookies) },
    redirect: 'manual',
});
assert(dashboardResponse.status === 200, `/dashboard/admin returned ${dashboardResponse.status}`);
const dashboardHtml = await dashboardResponse.text();
assert(dashboardHtml.includes('Centrum operacyjne'), '/dashboard/admin did not render the admin dashboard.');
assert(dashboardHtml.includes('Do wypłaty'), '/dashboard/admin did not render payout KPI content.');
console.log('[loop0-http] admin dashboard OK');
