import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('schedules weekly done reset for Monday 10:00 UTC', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));

  assert.deepEqual(config.crons, [
    {
      path: '/api/cron/donereset',
      schedule: '0 10 * * 1',
    },
  ]);
});
