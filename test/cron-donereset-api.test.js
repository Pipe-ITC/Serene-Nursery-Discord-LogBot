import test from 'node:test';
import assert from 'node:assert/strict';
import doneResetCron, { createDoneResetCron } from '../api/cron/donereset.js';

function mockResponse() {
  return {
    statusCode: undefined,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

test('donereset cron rejects requests without the cron secret', async () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  const res = mockResponse();

  try {
    await doneResetCron({ method: 'GET', headers: {} }, res);
  } finally {
    process.env.CRON_SECRET = originalSecret;
  }

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), { error: 'Unauthorized' });
});

test('donereset cron is not exposed on the admin host', async () => {
  const res = mockResponse();

  await doneResetCron({ method: 'GET', headers: { host: 'admin.serenenursery.pipeitc.dev' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'Not found' });
});

test('donereset cron only allows get requests', async () => {
  const res = mockResponse();

  await doneResetCron({ method: 'POST', headers: {} }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET');
  assert.deepEqual(res.json(), { error: 'Method not allowed' });
});

test('donereset cron clears weekly done markers with a valid cron secret', async () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  const queries = [];
  const handler = createDoneResetCron({
    sqlFactory: () => async (strings) => {
      queries.push(strings.join(' '));
      return { count: 4 };
    },
  });
  const res = mockResponse();

  try {
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } }, res);
  } finally {
    process.env.CRON_SECRET = originalSecret;
  }

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true, cleared: 4 });
  assert.ok(queries.some((query) => query.includes('delete from weekly_done_users')));
});
