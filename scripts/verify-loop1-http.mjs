const baseUrl = process.env.LOOP1_BASE_URL || 'http://127.0.0.1:3108';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const response = await fetch(`${baseUrl}/auth/change-password`, { redirect: 'manual' });
const location = response.headers.get('location') || '';

assert(
    response.status === 307 || response.status === 308 || response.status === 302,
    `/auth/change-password returned ${response.status}, expected redirect.`
);
assert(
    location.includes('/auth/signin'),
    `/auth/change-password redirected to ${location || '(missing location)'}, expected /auth/signin.`
);

console.log(`[loop1-http] /auth/change-password ${response.status} -> ${location}`);
