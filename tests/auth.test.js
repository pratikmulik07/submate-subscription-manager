import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { createDatabase } from '../server/db/connection.js';

const STRONG_PASSPHRASE = 'correct-horse-battery-staple';

async function startServer() {
  const db = createDatabase(':memory:');
  const app = createApp({ db });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(path, { method = 'GET', body, cookie, headers } = {}) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(headers || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function json(path, options) {
    const response = await request(path, options);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') || '';
    const cookieValue = setCookie ? setCookie.split(';')[0] : null;
    return { status: response.status, body, cookie: cookieValue };
  }

  function setup(cookie) {
    return json('/api/auth/setup', {
      method: 'POST',
      cookie,
      body: { username: 'Jamie', password: STRONG_PASSPHRASE },
    });
  }

  return {
    db,
    baseUrl,
    request,
    json,
    setup,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}

test('status reports an unconfigured tracker before setup', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { status, body } = await s.json('/api/auth/status');
  assert.equal(status, 200);
  assert.equal(body.configured, false);
  assert.equal(body.authenticated, false);
  assert.equal(body.username, null);
});

test('protected routes require setup before any data is exposed', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { status, body } = await s.json('/api/subscriptions');
  assert.equal(status, 401);
  assert.equal(body.error.code, 'SETUP_REQUIRED');
});

test('setup creates the local account and issues a working session', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const created = await s.setup();
  assert.equal(created.status, 201);
  assert.equal(created.body.authenticated, true);
  assert.equal(created.body.username, 'Jamie');
  assert.ok(created.cookie && created.cookie.startsWith('submate_session='));

  const status = await s.json('/api/auth/status', { cookie: created.cookie });
  assert.equal(status.body.configured, true);
  assert.equal(status.body.authenticated, true);
  assert.equal(status.body.username, 'Jamie');

  const protectedRes = await s.json('/api/subscriptions', { cookie: created.cookie });
  assert.equal(protectedRes.status, 200);
  assert.ok(Array.isArray(protectedRes.body.subscriptions));
});

test('setup cannot run a second time once an owner exists', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  await s.setup();
  const again = await s.setup();
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'ALREADY_CONFIGURED');
});

test('setup rejects a passphrase shorter than 10 characters', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { status, body } = await s.json('/api/auth/setup', {
    method: 'POST',
    body: { username: 'Jamie', password: 'short' },
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.ok(body.error.details.fields.password);
});

test('a configured tracker requires a session and rejects the wrong passphrase', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  await s.setup();

  const anonymous = await s.json('/api/auth/status');
  assert.equal(anonymous.body.configured, true);
  assert.equal(anonymous.body.authenticated, false);

  const blocked = await s.json('/api/subscriptions');
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.error.code, 'AUTH_REQUIRED');

  const wrong = await s.json('/api/auth/login', {
    method: 'POST',
    body: { password: 'definitely-not-it' },
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');
});

test('login with the correct passphrase issues a session', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  await s.setup();

  const login = await s.json('/api/auth/login', {
    method: 'POST',
    body: { password: STRONG_PASSPHRASE },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.authenticated, true);
  assert.equal(login.body.username, 'Jamie');

  const protectedRes = await s.json('/api/subscriptions', { cookie: login.cookie });
  assert.equal(protectedRes.status, 200);
});

test('logout revokes the session cookie', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { cookie } = await s.setup();

  const logout = await s.json('/api/auth/logout', { method: 'POST', cookie });
  assert.equal(logout.status, 200);
  assert.equal(logout.body.authenticated, false);

  const afterLogout = await s.json('/api/subscriptions', { cookie });
  assert.equal(afterLogout.status, 401);
  assert.equal(afterLogout.body.error.code, 'AUTH_REQUIRED');
});
