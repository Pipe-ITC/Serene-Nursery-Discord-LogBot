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

test('dashboard renders admin summary stats and activity lists', async () => {
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
  const handler = createAdminHandler({
    sqlFactory: () => async (strings, ...values) => {
      const query = strings.join(' ');
      if (query.includes('from app_users') && values.includes('admin-1')) {
        return [{ discord_user_id: 'admin-1', game_name: 'Admin Florist', is_admin: true }];
      }
      if (query.includes('as discord_players')) {
        return [{
          discord_players: 7,
          cozy_players: 3,
          active_players: 8,
          total_flowers: 120,
          unowned_flowers: 4,
          total_logs: 240,
          total_pins: 18,
          done_count: 5,
        }];
      }
      if (query.includes('from flower_pins p')) {
        return [{ name: 'Red Rose', rarity: 'R', count: 6 }];
      }
      if (query.includes('left join flower_logs l')) {
        return [{ name: 'Quiet Daisy', rarity: 'N', count: 0 }];
      }
      if (query.includes('join app_users u') && query.includes('group by u.discord_user_id')) {
        return [{ discord_user_id: 'cozy:player-1', game_name: 'Frosty', count: 40 }];
      }
      if (query.includes('from flower_logs l') && query.includes('join flowers f') && query.includes('order by count desc')) {
        return [{ name: 'Gold Lily', rarity: 'SSR', count: 12 }];
      }
      if (query.includes('order by l.logged_at desc')) {
        return [{
          discord_user_id: 'discord-user-1',
          game_name: 'Rose Keeper',
          name: 'Blue Rose',
          rarity: 'R',
          quest_points: 20,
          extra_points: 2,
          logged_at: '2026-07-16T10:00:00.000Z',
        }];
      }

      return [];
    },
  });
  const res = mockResponse();

  await handler(request({ url: '/dashboard', cookie: withAdminSession() }), res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Player Summary/);
  assert.match(res.body, /Discord players/);
  assert.match(res.body, />7</);
  assert.match(res.body, /Cozy players/);
  assert.match(res.body, />3</);
  assert.match(res.body, /Unowned flowers/);
  assert.match(res.body, />4</);
  assert.match(res.body, /Players marked done/);
  assert.match(res.body, />5</);
  assert.match(res.body, /Most Pinned Flowers/);
  assert.match(res.body, /Red Rose/);
  assert.match(res.body, /Top Collectors/);
  assert.match(res.body, /Frosty \(Cozy Player\)/);
  assert.match(res.body, /Recent Activity/);
  assert.match(res.body, /Blue Rose/);
  assert.match(res.body, /22 \(\+2\)/);
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
  assert.match(res.body, /<option value="" disabled selected>Select player<\/option>/);
  assert.match(res.body, /<option value="" disabled selected>Select flower<\/option>/);
  assert.match(res.body, /Red Rose/);
  assert.doesNotMatch(res.body, /Unpin/);
  assert.doesNotMatch(res.body, /Delete player Frosty\?/);
});

test('cozy players page shows selected player details after view', async () => {
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

  await handler(request({ url: '/cozy-players?player_id=cozy%3Aplayer-1', cookie: withAdminSession() }), res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<option value="" disabled>Select player<\/option>/);
  assert.match(res.body, /<option value="cozy:player-1" selected>Frosty<\/option>/);
  assert.match(res.body, /Unpin/);
  assert.match(res.body, /Delete player Frosty\?/);
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

test('cozy players page deletes a player and cascaded flower data', async () => {
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
  const queries = [];
  const handler = createAdminHandler({
    sqlFactory: () => async (strings, ...values) => {
      const query = strings.join(' ');
      queries.push(query);
      if (query.includes('from app_users') && values.includes('admin-1')) {
        return [{ discord_user_id: 'admin-1', game_name: 'Admin Florist', is_admin: true }];
      }
      if (query.includes("discord_user_id like 'cozy:%'") && values.includes('cozy:player-1')) {
        return [{ discord_user_id: 'cozy:player-1', game_name: 'Frosty' }];
      }
      if (query.includes('select') && query.includes('flower_logs') && query.includes('flower_pins')) {
        return [{ is_admin: false, logged_flowers: 5, pins: 2 }];
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
      body: new URLSearchParams({ action: 'delete_player', player_id: 'cozy:player-1' }).toString(),
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Removed Frosty/);
  assert.match(res.body, /5 logged flowers/);
  assert.match(res.body, /2 pins/);
  assert.ok(queries.some((query) => query.includes('delete from app_users')));
});

test('discord users page manages existing Discord users without create controls', async () => {
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
  const handler = createAdminHandler({
    sqlFactory: () => async (strings, ...values) => {
      const query = strings.join(' ');
      if (query.includes('from app_users') && values.includes('admin-1')) {
        return [{ discord_user_id: 'admin-1', game_name: 'Admin Florist', is_admin: true }];
      }
      if (query.includes("discord_user_id not like 'cozy:%'")) {
        return [
          { discord_user_id: 'discord-user-1', game_name: 'Rose Keeper' },
          { discord_user_id: 'discord-user-2', game_name: 'Lily Keeper' },
        ];
      }
      if (query.includes('from flowers')) {
        return [{ id: 'flower-1', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
      }
      if (query.includes('from flower_logs l')) {
        return [{ id: 'flower-1', name: 'Red Rose', rarity: 'R', quest_points: 20, extra_points: 0, is_pinned: false }];
      }

      return [];
    },
  });
  const res = mockResponse();

  await handler(request({ url: '/discord-users', cookie: withAdminSession() }), res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Manage Discord Users/);
  assert.match(res.body, /Rose Keeper/);
  assert.match(res.body, /Red Rose/);
  assert.match(res.body, /<option value="" disabled selected>Select player<\/option>/);
  assert.match(res.body, /<option value="" disabled selected>Select flower<\/option>/);
  assert.doesNotMatch(res.body, /Delete player Rose Keeper\?/);
  assert.doesNotMatch(res.body, /Create Player/);
});

test('discord users page logs flowers for an existing Discord user', async () => {
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
  const queries = [];
  const valuesSeen = [];
  const handler = createAdminHandler({
    sqlFactory: () => async (strings, ...values) => {
      const query = strings.join(' ');
      queries.push(query);
      valuesSeen.push(...values);
      if (query.includes('from app_users') && values.includes('admin-1')) {
        return [{ discord_user_id: 'admin-1', game_name: 'Admin Florist', is_admin: true }];
      }
      if (query.includes("discord_user_id not like 'cozy:%'") && values.includes('discord-user-1')) {
        return [{ discord_user_id: 'discord-user-1', game_name: 'Rose Keeper' }];
      }
      if (query.includes("discord_user_id not like 'cozy:%'")) {
        return [{ discord_user_id: 'discord-user-1', game_name: 'Rose Keeper' }];
      }
      if (query.includes('select id, name from flowers')) {
        return [{ id: 'flower-1', name: 'Red Rose' }];
      }
      if (query.includes('from flowers')) {
        return [{ id: 'flower-1', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
      }

      return [];
    },
  });
  const res = mockResponse();

  await handler(
    request({
      method: 'POST',
      url: '/discord-users',
      cookie: withAdminSession(),
      body: new URLSearchParams({
        action: 'log_flower',
        player_id: 'discord-user-1',
        flower_id: 'flower-1',
        extra_points: '3',
      }).toString(),
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Logged Red Rose for Rose Keeper/);
  assert.match(res.body, /<option value="discord-user-1" selected>Rose Keeper<\/option>/);
  assert.ok(queries.some((query) => query.includes('insert into flower_logs')));
  assert.ok(valuesSeen.includes('discord-user-1'));
  assert.ok(valuesSeen.includes(3));
});

test('discord users page deletes a non-admin player and cascaded flower data', async () => {
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
  const queries = [];
  const handler = createAdminHandler({
    sqlFactory: () => async (strings, ...values) => {
      const query = strings.join(' ');
      queries.push(query);
      if (query.includes('from app_users') && values.includes('admin-1')) {
        return [{ discord_user_id: 'admin-1', game_name: 'Admin Florist', is_admin: true }];
      }
      if (query.includes("discord_user_id not like 'cozy:%'") && values.includes('discord-user-1')) {
        return [{ discord_user_id: 'discord-user-1', game_name: 'Rose Keeper' }];
      }
      if (query.includes('select') && query.includes('flower_logs') && query.includes('flower_pins')) {
        return [{ is_admin: false, logged_flowers: 4, pins: 1 }];
      }
      if (query.includes("discord_user_id not like 'cozy:%'")) {
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
      url: '/discord-users',
      cookie: withAdminSession(),
      body: new URLSearchParams({ action: 'delete_player', player_id: 'discord-user-1' }).toString(),
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Removed Rose Keeper/);
  assert.match(res.body, /4 logged flowers/);
  assert.match(res.body, /1 pin/);
  assert.ok(queries.some((query) => query.includes('delete from app_users')));
});

test('discord users page blocks deleting app admins', async () => {
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
  const queries = [];
  const handler = createAdminHandler({
    sqlFactory: () => async (strings, ...values) => {
      const query = strings.join(' ');
      queries.push(query);
      if (query.includes('from app_users') && values.includes('admin-1')) {
        return [{ discord_user_id: 'admin-1', game_name: 'Admin Florist', is_admin: true }];
      }
      if (query.includes("discord_user_id not like 'cozy:%'") && values.includes('admin-2')) {
        return [{ discord_user_id: 'admin-2', game_name: 'Second Admin' }];
      }
      if (query.includes('select') && query.includes('flower_logs') && query.includes('flower_pins')) {
        return [{ is_admin: true, logged_flowers: 1, pins: 1 }];
      }
      if (query.includes("discord_user_id not like 'cozy:%'")) {
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
      url: '/discord-users',
      cookie: withAdminSession(),
      body: new URLSearchParams({ action: 'delete_player', player_id: 'admin-2' }).toString(),
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /App admins cannot be removed/);
  assert.equal(queries.some((query) => query.includes('delete from app_users')), false);
});
