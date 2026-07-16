import { Readable } from 'node:stream';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminHandler, createSession } from '../api/admin/[...path].js';

function mockResponse() {
  return {
    statusCode: undefined,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

function request({ method = 'GET', url = '/cozy-players', host = 'admin.serenenursery.pipeitc.dev', cookie, body = '' } = {}) {
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.url = url;
  req.headers = {
    host,
    ...(cookie ? { cookie } : {}),
    ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
  };
  return req;
}

function withAdminSession(discordUserId = 'admin-1') {
  return `sn_admin_session=${encodeURIComponent(createSession(discordUserId))}`;
}

test('admin surface rejects the bot host', async () => {
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
  const handler = createAdminHandler({
    sqlFactory: () => async () => [],
  });
  const res = mockResponse();

  await handler(request({ host: 'bot.serenenursery.pipeitc.dev' }), res);

  assert.equal(res.statusCode, 404);
});

test('cozy players page requires an admin session and renders dashboard controls', async () => {
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
  const handler = createAdminHandler({
    sqlFactory: () => async (strings, ...values) => {
      const query = strings.join(' ');
      if (query.includes('from app_users') && values.includes('admin-1')) {
        return [{ discord_user_id: 'admin-1', game_name: 'Admin Florist', is_admin: true }];
      }
      if (query.includes("discord_user_id like 'cozy:%'")) {
        return [{ discord_user_id: 'cozy:player-1', game_name: 'Frosty' }];
      }
      if (query.includes('from flowers')) {
        return [{ id: 'flower-1', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
      }
      if (query.includes('from flower_logs l')) {
        return [{ id: 'flower-1', name: 'Red Rose', rarity: 'R', quest_points: 20, extra_points: 2, is_pinned: true }];
      }

      return [];
    },
  });
  const res = mockResponse();

  await handler(request({ cookie: withAdminSession() }), res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Create Player/);
  assert.match(res.body, /Frosty/);
  assert.match(res.body, /Red Rose/);
  assert.match(res.body, /Unpin/);
});

test('cozy players page creates players with a cozy uuid id', async () => {
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
  const valuesSeen = [];
  const handler = createAdminHandler({
    sqlFactory: () => async (strings, ...values) => {
      const query = strings.join(' ');
      valuesSeen.push(...values);
      if (query.includes('from app_users') && values.includes('admin-1')) {
        return [{ discord_user_id: 'admin-1', game_name: 'Admin Florist', is_admin: true }];
      }
      if (query.includes("discord_user_id like 'cozy:%'")) {
        return [];
      }
      if (query.includes('from flowers')) {
        return [];
      }

      return [];
    },
  });
  const res = mockResponse();

  await handler(
    request({
      method: 'POST',
      cookie: withAdminSession(),
      body: new URLSearchParams({ action: 'create_player', game_name: 'Frosty' }).toString(),
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Frosty was created/);
  assert.ok(valuesSeen.some((value) => typeof value === 'string' && /^cozy:[0-9a-f-]{36}$/.test(value)));
});
