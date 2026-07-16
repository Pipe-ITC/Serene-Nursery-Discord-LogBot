import test from 'node:test';
import assert from 'node:assert/strict';
import interactions, { config } from '../api/interactions.js';

test('disables Vercel body parsing for Discord signature verification', () => {
  assert.deepEqual(config, {
    api: {
      bodyParser: false,
    },
  });
});

test('blocks Discord interaction endpoint on the admin host', async () => {
  const res = {
    statusCode: undefined,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    },
  };

  await interactions({ method: 'GET', headers: { host: 'admin.serenenursery.pipeitc.dev' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(JSON.parse(res.body), { error: 'Not found' });
});
