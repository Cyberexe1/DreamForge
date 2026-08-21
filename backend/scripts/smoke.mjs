import { randomBytes, randomUUID } from 'node:crypto';

/**
 * End-to-end smoke test against real DynamoDB.
 *
 * Boots the real Express app in-process, runs a full account lifecycle, then
 * deletes the account it created. Uses a random email each run so it never
 * collides with real data.
 *
 * Usage:  node scripts/smoke.mjs
 * Env:    AWS_PROFILE, AWS_REGION, USERS_TABLE
 */

// The app validates config at import time, so seed anything missing first.
process.env.AWS_REGION ??= 'us-east-1';
process.env.USERS_TABLE ??= 'dreamforge-users';
process.env.JWT_SECRET ??= `smoke-${randomBytes(32).toString('base64url')}`;
process.env.BCRYPT_COST ??= '10'; // keep the run quick
process.env.NODE_ENV = 'development';

const { createApp } = await import('../src/app.js');
const { deleteUser } = await import('../src/repositories/users.js');

const email = `smoke-${randomUUID().slice(0, 8)}@dreamforge.test`;
const password = 'a-sufficiently-long-test-password';
const capsuleDate = '2026-08-21';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const server = createApp().listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

try {
  console.log(`table:   ${process.env.USERS_TABLE}`);
  console.log(`profile: ${process.env.AWS_PROFILE ?? 'default'}`);
  console.log(`account: ${email}\n`);

  console.log('health');
  const health = await call('/api/health');
  check('GET /api/health returns ok', health.status === 200 && health.json?.ok === true);

  console.log('\nsignup');
  const signup = await call('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Smoke Test', email, password },
  });
  check('creates the account', signup.status === 201, `status ${signup.status}`);
  check('returns a token', typeof signup.json?.token === 'string');
  check('returns the profile', signup.json?.user?.email === email);
  check(
    'never returns the password hash',
    signup.json ? !JSON.stringify(signup.json).includes('passwordHash') : false,
  );

  console.log('\nvalidation');
  const weak = await call('/api/auth/signup', {
    method: 'POST',
    body: { name: 'X', email: 'not-an-email', password: 'short' },
  });
  check('rejects bad input with 400', weak.status === 400, `status ${weak.status}`);
  check(
    'reports errors per field',
    Boolean(weak.json?.fields?.email && weak.json?.fields?.password && weak.json?.fields?.name),
  );

  const dupe = await call('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Smoke Test', email, password },
  });
  check('rejects a duplicate email with 409', dupe.status === 409, `status ${dupe.status}`);

  console.log('\nlogin');
  const wrong = await call('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'definitely-the-wrong-password' },
  });
  check('rejects the wrong password with 401', wrong.status === 401, `status ${wrong.status}`);

  const unknown = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'nobody-here@dreamforge.test', password },
  });
  check(
    'gives an identical message for an unknown account',
    unknown.status === 401 && unknown.json?.message === wrong.json?.message,
  );

  const login = await call('/api/auth/login', { method: 'POST', body: { email, password } });
  check('accepts the correct password', login.status === 200, `status ${login.status}`);
  const token = login.json?.token;
  check('records the login', (login.json?.user?.loginCount ?? 0) >= 1);

  console.log('\nauthorisation');
  const noToken = await call('/api/me');
  check('rejects a missing token with 401', noToken.status === 401);

  const badToken = await call('/api/me', { token: 'not.a.real.token' });
  check('rejects a forged token with 401', badToken.status === 401);

  const me = await call('/api/me', { token });
  check('returns the profile for a valid token', me.status === 200 && me.json?.user?.email === email);

  console.log('\nprofile update');
  const renamed = await call('/api/me', {
    method: 'PATCH',
    body: { name: 'Renamed Tester' },
    token,
  });
  check('updates the display name', renamed.json?.user?.name === 'Renamed Tester');

  console.log('\nsaved capsules');
  const saved = await call(`/api/me/saved/${capsuleDate}`, { method: 'PUT', token });
  check('saves a capsule', saved.json?.user?.savedDates?.includes(capsuleDate) === true);

  const savedTwice = await call(`/api/me/saved/${capsuleDate}`, { method: 'PUT', token });
  check(
    'saving twice does not duplicate',
    savedTwice.json?.user?.savedDates?.filter((d) => d === capsuleDate).length === 1,
  );

  const badDate = await call('/api/me/saved/not-a-date', { method: 'PUT', token });
  check('rejects a malformed date with 400', badDate.status === 400, `status ${badDate.status}`);

  const unsaved = await call(`/api/me/saved/${capsuleDate}`, { method: 'DELETE', token });
  check('removes a saved capsule', unsaved.json?.user?.savedDates?.includes(capsuleDate) === false);
} finally {
  // Always clean up, even if an assertion above threw.
  try {
    await deleteUser(email);
    console.log(`\ncleaned up ${email}`);
  } catch (err) {
    console.warn(`\ncould not delete ${email}: ${err?.name}`);
  }
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
