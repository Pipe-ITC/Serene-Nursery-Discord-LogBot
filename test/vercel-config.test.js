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

test('rewrites admin dashboard paths to the admin function', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));

  assert.deepEqual(config.rewrites, [
    { source: '/', destination: '/api/admin/dashboard' },
    { source: '/login', destination: '/api/admin/login' },
    { source: '/auth/callback', destination: '/api/admin/auth/callback' },
    { source: '/logout', destination: '/api/admin/logout' },
    { source: '/cozy-players', destination: '/api/admin/cozy-players' },
    { source: '/discord-users', destination: '/api/admin/discord-users' },
  ]);
});
