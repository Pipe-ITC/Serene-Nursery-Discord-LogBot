import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../api/interactions.js';

test('disables Vercel body parsing for Discord signature verification', () => {
  assert.deepEqual(config, {
    api: {
      bodyParser: false,
    },
  });
});
