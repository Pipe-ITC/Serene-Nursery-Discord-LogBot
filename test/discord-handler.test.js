import test from 'node:test';
import assert from 'node:assert/strict';
import { handleInteraction } from '../lib/discord/handler.js';
import { InteractionResponseType, InteractionType, MessageFlags } from '../lib/discord/constants.js';

test('responds to Discord ping interactions with pong', async () => {
  const response = await handleInteraction({ type: InteractionType.PING });

  assert.deepEqual(response, { type: InteractionResponseType.PONG });
});

test('returns empty autocomplete choices when no option is focused', async () => {
  const response = await handleInteraction({
    type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE,
    data: { name: 'log' },
  });

  assert.deepEqual(response, {
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices: [],
    },
  });
});

test('returns an ephemeral placeholder for unknown slash commands', async () => {
  const response = await handleInteraction({
    type: InteractionType.APPLICATION_COMMAND,
    data: { name: 'unknown-command' },
  });

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /\/unknown-command/);
});

test('hides admin commands from non-admin help output', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'user-1' } },
      data: { name: 'help' },
    },
    {
      sql: async () => [{ is_admin: false }],
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /\/log <flower>/);
  assert.match(response.data.content, /\/done/);
  assert.doesNotMatch(response.data.content, /\/addflower/);
  assert.doesNotMatch(response.data.content, /\/donereset/);
  assert.doesNotMatch(response.data.content, /admin\.serenenursery\.pipeitc\.dev/);
});

test('shows admin commands to app admins in help output', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: { name: 'help' },
    },
    {
      sql: async () => [{ is_admin: true }],
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /\/log <flower>/);
  assert.match(response.data.content, /\/addflower/);
  assert.match(response.data.content, /\/setflowerimage <flower> <image>/);
  assert.match(response.data.content, /\/removeuser <user>/);
  assert.match(response.data.content, /\/donereset/);
  assert.match(response.data.content, /https:\/\/admin\.serenenursery\.pipeitc\.dev/);
});

test('blocks flower commands until the user has set a game name', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'user-without-name' } },
      data: {
        name: 'log',
        options: [{ name: 'flower', value: 'rose-id' }],
      },
    },
    {
      sql: async (strings) => {
        queries.push(strings.join(' '));
        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /\/setname/);
  assert.match(response.data.content, /run this command again/);
  assert.equal(queries.some((query) => query.includes('from flowers')), false);
});

test('log announces first bloom when the first guild player logs a flower', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'log',
        options: [
          { name: 'flower', value: 'flower-id' },
          { name: 'extra_points', value: 1 },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }
        if (query.includes('count(*)') && query.includes('from flower_logs')) {
          return [{ count: 0 }];
        }
        if (query.includes('insert into flower_logs')) {
          const result = [{ id: 'log-id' }];
          result.count = 1;
          return result;
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.content, /^<a:flashing_stars:1526187016717471825> FIRST BLOOM! <a:flashing_stars:1526187016717471825>/);
  assert.match(response.data.content, /<@named-user> is the first player to log Red Rose\./);
  assert.match(response.data.content, /The nursery catalogue grows by one beautiful discovery\./);
  assert.match(response.data.content, /A fine moment for the garden, and a finer one for the florist\./);
  assert.equal(response.data.embeds, undefined);
  assert.ok(queries.some((query) => query.includes('insert into flower_logs')));
});

test('log returns the standard private message when the flower has already been logged by the guild', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'log',
        options: [
          { name: 'flower', value: 'flower-id' },
          { name: 'extra_points', value: 1 },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }
        if (query.includes('count(*)') && query.includes('from flower_logs')) {
          return [{ count: 1 }];
        }
        if (query.includes('insert into flower_logs')) {
          const result = [{ id: 'log-id' }];
          result.count = 1;
          return result;
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Logged Red Rose/);
  assert.match(response.data.content, /with \+1 extra points/);
  assert.match(response.data.content, /Total for you: 21/);
});

test('log warns when the flower has already been logged', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'log',
        options: [{ name: 'flower', value: 'flower-id' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }
        if (query.includes('from flower_logs') && query.includes('extra_points')) {
          return [{ extra_points: 0 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /already logged Red Rose/);
  assert.match(response.data.content, /\/addpoints/);
  assert.equal(queries.some((query) => query.includes('insert into flower_logs')), false);
});

test('log rejects supplied extra points outside the cozy bonus values', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'log',
        options: [
          { name: 'flower', value: 'flower-id' },
          { name: 'extra_points', value: 5 },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Extra points must be 1, 2, 3, or 4/);
  assert.equal(queries.some((query) => query.includes('insert into flower_logs')), false);
});

test('log still allows omitted extra points as zero', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'log',
        options: [{ name: 'flower', value: 'flower-id' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }
        if (query.includes('count(*)') && query.includes('from flower_logs')) {
          return [{ count: 1 }];
        }
        if (query.includes('insert into flower_logs')) {
          return [{ id: 'log-id' }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Logged Red Rose/);
  assert.match(response.data.content, /Total for you: 20/);
  assert.ok(queries.some((query) => query.includes('insert into flower_logs')));
});

test('logall uses flower pattern matching when the input is not an exact rarity', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'logall',
        options: [{ name: 'flower_pattern', value: 'rose' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('where normalized_name like')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /for "rose"/);
  assert.equal(response.data.components[0].components[0].options[0].label, 'Red Rose');
});

test('logall treats an exact rarity code in the pattern field as a rarity search', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'logall',
        options: [{ name: 'flower_pattern', value: 'N' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('where rarity =')) {
          return [{ id: 'flower-id', name: 'Green Rose', rarity: 'N', quest_points: 5 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /for "N rarity"/);
  assert.equal(response.data.components[0].components[0].options[0].label, 'Green Rose');
  assert.equal(queries.some((query) => query.includes('where normalized_name like')), false);
});

test('logall can search by the rarity option', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'logall',
        options: [{ name: 'rarity', value: 'SSR' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('where rarity =')) {
          return [{ id: 'flower-id', name: 'Gold Lily', rarity: 'SSR', quest_points: 80 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /for "SSR rarity"/);
  assert.equal(response.data.components[0].components[0].options[0].label, 'Gold Lily');
});

test('logall splits more than 25 flowers across multiple select menus', async () => {
  const flowers = Array.from({ length: 60 }, (_, index) => ({
    id: `flower-${index + 1}`,
    name: `Normal Flower ${String(index + 1).padStart(2, '0')}`,
    rarity: 'N',
    quest_points: index + 1,
  }));
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'logall',
        options: [{ name: 'rarity', value: 'N' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('where rarity =')) {
          return flowers;
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /60 matches/);
  assert.equal(response.data.components.length, 3);
  assert.equal(response.data.components[0].components[0].options.length, 25);
  assert.equal(response.data.components[1].components[0].options.length, 25);
  assert.equal(response.data.components[2].components[0].options.length, 10);
  assert.match(response.data.components[0].components[0].placeholder, /\(1\/3\)/);
  assert.match(response.data.components[2].components[0].placeholder, /\(3\/3\)/);
  assert.equal(response.data.components[2].components[0].options[9].label, 'Normal Flower 60');
});

test('logall rejects flower pattern and rarity together', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'logall',
        options: [
          { name: 'flower_pattern', value: 'rose' },
          { name: 'rarity', value: 'N' },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /either a flower pattern or a rarity/);
});

test('addpoints updates extra points for a previously logged flower', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'addpoints',
        options: [
          { name: 'flower', value: 'flower-id' },
          { name: 'points', value: 4 },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }
        if (query.includes('update flower_logs')) {
          return [{ id: 'log-id' }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Updated Red Rose/);
  assert.match(response.data.content, /\+4 extra points/);
  assert.match(response.data.content, /Total for you: 24/);
});

test('addpoints requires the flower to be logged first', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'addpoints',
        options: [
          { name: 'flower', value: 'flower-id' },
          { name: 'points', value: 2 },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /need to log Red Rose before/);
});

test('addpoints rejects points outside the cozy bonus values', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'addpoints',
        options: [
          { name: 'flower', value: 'flower-id' },
          { name: 'points', value: 0 },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Extra points must be 1, 2, 3, or 4/);
  assert.equal(queries.some((query) => query.includes('update flower_logs')), false);
});

test('returns public responses for public flower lookup commands', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'findpoints',
        options: [{ name: 'points', value: 20 }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }

        return [{ name: 'Red Rose', rarity: 'R', quest_points: 20 }];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.embeds[0].description, /Red Rose/);
});

test('find combines pinned and logged users in priority order', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'find',
        options: [{ name: 'flower', value: 'flower-id' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }
        if (query.includes('from flower_logs l')) {
          return [
            { discord_user_id: 'pinned-extra-user', game_name: 'Pinned Extra Florist', extra_points: 3 },
            { discord_user_id: 'logged-user', game_name: 'Logged Florist', extra_points: 1 },
            { discord_user_id: 'pinned-user', game_name: 'Pinned Florist', extra_points: 0 },
          ];
        }
        if (query.includes('from flower_pins p')) {
          return [
            { discord_user_id: 'pinned-extra-user', game_name: 'Pinned Extra Florist' },
            { discord_user_id: 'pinned-user', game_name: 'Pinned Florist' },
          ];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.content, /Players \(3\):/);
  assert.doesNotMatch(response.data.content, /Logged by/);
  assert.doesNotMatch(response.data.content, /Pinned by/);

  const pinnedExtraIndex = response.data.content.indexOf('<a:flashingexclamationemoji:1526190062105264259> Pinned Extra Florist');
  const pinnedIndex = response.data.content.indexOf('📌 Pinned Florist');
  const loggedIndex = response.data.content.indexOf('<a:flashingexclamationemoji:1526190062105264259> Logged Florist');

  assert.ok(pinnedExtraIndex >= 0);
  assert.ok(pinnedIndex > pinnedExtraIndex);
  assert.ok(loggedIndex > pinnedIndex);
  assert.match(response.data.content, /<a:flashingexclamationemoji:1526190062105264259> Pinned Extra Florist .*\+3/);
  assert.match(response.data.content, /<a:flashingexclamationemoji:1526190062105264259> Logged Florist .*\+1/);
  assert.doesNotMatch(response.data.content, /📌 Pinned Extra Florist/);
  assert.doesNotMatch(response.data.content, /✅ Logged Florist/);
  assert.equal(response.data.content.match(/Pinned Extra Florist/g).length, 1);
});

test('find shows a grey tick for done users on pinned rows', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'find',
        options: [{ name: 'flower', value: 'flower-id' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }
        if (query.includes('from flower_logs l')) {
          return [
            { discord_user_id: 'done-pinned-extra-user', game_name: 'Done Extra Florist', extra_points: 4 },
            { discord_user_id: 'done-pinned-user', game_name: 'Done Florist', extra_points: 0 },
            { discord_user_id: 'logged-extra-user', game_name: 'Logged Extra Florist', extra_points: 2 },
          ];
        }
        if (query.includes('from flower_pins p')) {
          return [
            { discord_user_id: 'done-pinned-extra-user', game_name: 'Done Extra Florist', is_done: true },
            { discord_user_id: 'done-pinned-user', game_name: 'Done Florist', is_done: true },
          ];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.content, /☑️ Done Extra Florist .*\+4/);
  assert.match(response.data.content, /☑️ Done Florist/);
  assert.match(response.data.content, /<a:flashingexclamationemoji:1526190062105264259> Logged Extra Florist .*\+2/);
  assert.doesNotMatch(response.data.content, /<a:flashingexclamationemoji:1526190062105264259> Done Extra Florist/);
  assert.doesNotMatch(response.data.content, /📌 Done Florist/);
});

test('info renders logged by you as yes or no', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'info',
        options: [{ name: 'flower', value: 'flower-id' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }
        if (query.includes('logged_by_you')) {
          return [{ logged_by_you: true, logged_count: 3, pinned_count: 1 }];
        }
        if (query.includes('from flower_logs l')) {
          return [{ discord_user_id: 'first-user', game_name: 'First Florist' }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.equal(response.data.content, '');
  assert.match(response.data.embeds[0].description, /✅ Flower is logged by you/);
  assert.match(response.data.embeds[0].description, /Logged By: \*\*3 Florists\*\*/);
  assert.doesNotMatch(response.data.embeds[0].description, /Logged by you: true/);
});

test('info displays a flower image when one is stored', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'info',
        options: [{ name: 'flower', value: 'flower-id' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20, image_url: 'https://cdn.discordapp.com/flowers/red-rose.png' }];
        }
        if (query.includes('logged_by_you')) {
          return [{ logged_by_you: false, logged_count: 3, pinned_count: 1 }];
        }
        if (query.includes('from flower_logs l')) {
          return [{ discord_user_id: 'first-user', game_name: 'First Florist' }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.equal(response.data.content, '');
  assert.match(response.data.embeds[0].description, /☑️ Flower is not logged by you/);
  assert.equal(response.data.embeds[0].title, '<:R:1524529635256307852> Red Rose');
  assert.equal(response.data.embeds[0].color, 0x4dabf7);
  assert.equal(response.data.embeds[0].thumbnail.url, 'https://cdn.discordapp.com/flowers/red-rose.png');
  assert.equal(response.data.embeds[0].image, undefined);
});

test('findrarity lists flowers for a selected rarity publicly', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'findrarity',
        options: [{ name: 'rarity', value: 'UR' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }

        return [
          { name: 'Pink Rose', rarity: 'UR', quest_points: 100 },
          { name: 'Starlight Lily', rarity: 'UR', quest_points: 120 },
        ];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.content, /2 <:UR:1524529822653612255> flowers found/);
  assert.match(response.data.embeds[0].description, /Pink Rose/);
  assert.match(response.data.embeds[0].description, /Starlight Lily/);
});

test('findrarity does not truncate long rarity lists', async () => {
  const flowers = Array.from({ length: 120 }, (_, index) => ({
    name: `Ultra Flower ${String(index + 1).padStart(3, '0')}`,
    rarity: 'UR',
    quest_points: 100 + index,
  }));
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'findrarity',
        options: [{ name: 'rarity', value: 'UR' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }

        return flowers;
      },
    },
  );

  const listedFlowers = response.data.embeds.map((embed) => embed.description).join('\n');

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.content, /120 <:UR:1524529822653612255> flowers found/);
  assert.match(listedFlowers, /Ultra Flower 001/);
  assert.match(listedFlowers, /Ultra Flower 120/);
  assert.doesNotMatch(response.data.content, /and more results/);
  assert.doesNotMatch(listedFlowers, /and more results/);
});

test('pinned uses embeds for public flower lists', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: { name: 'pinned' },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }

        return [
          { name: 'Blue Rose', rarity: 'R', quest_points: 20 },
          { name: 'Gold Lily', rarity: 'SSR', quest_points: 80 },
        ];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.content, /Your pinned flowers \(2\):/);
  assert.match(response.data.embeds[0].description, /📌 Blue Rose/);
  assert.match(response.data.embeds[0].description, /📌 Gold Lily/);
  assert.doesNotMatch(response.data.embeds[0].description, /- Blue Rose/);
});

test('pinned user output uses a display name instead of a raw Discord id', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: {
        name: 'pinned',
        options: [{ name: 'user', value: 'target-user' }],
        resolved: {
          users: {
            'target-user': {
              username: 'discord_target',
              global_name: 'Target Discord',
            },
          },
        },
      },
    },
    {
      sql: async (strings, ...values) => {
        const query = strings.join(' ');
        if (query.includes('from app_users') && values.includes('target-user')) {
          return [{ game_name: 'Target Florist' }];
        }
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }

        return [{ name: 'Blue Rose', rarity: 'R', quest_points: 20 }];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.content, /Target Florist \(Target Discord\) pinned flowers \(1\):/);
  assert.equal(response.data.embeds[0].title, 'Target Florist (Target Discord) pinned flowers');
  assert.doesNotMatch(response.data.content, /target-user/);
  assert.doesNotMatch(response.data.embeds[0].title, /target-user/);
});

test('done marks weekly quests complete privately', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'named-user' } },
      data: { name: 'done' },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('from app_users')) {
          return [{ game_name: 'Rose Keeper' }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.equal(response.data.content, '👍 You have marked all your quests as done');
  assert.ok(queries.some((query) => query.includes('insert into weekly_done_users')));
});

test('setlevel announces a public fanfare when flowers are logged', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'level-user' } },
      data: {
        name: 'setlevel',
        options: [{ name: 'level', value: 42 }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('from app_users')) {
          return [{ game_name: 'Level Legend' }];
        }

        const result = [];
        result.count = query.includes('insert into flower_logs') ? 7 : 0;
        return result;
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.equal(response.data.content, 'FANFARE!');
  assert.equal(response.data.embeds[0].image.url, 'https://bot.serenenursery.pipeitc.dev/Levelled-Up_Embed.png');
  assert.match(response.data.embeds[1].description, /level 42/);
  assert.match(response.data.embeds[1].description, /The nursery gates swing wide: 7 assignment-level flowers logged in one glorious burst\./);
  assert.match(response.data.embeds[1].description, /Trumpets up\. Petals everywhere\. Absolutely magnificent\./);
});

test('direct admin promotion sends a private Discord notification', async () => {
  const dms = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: {
        name: 'addadmin',
        options: [{ name: 'user', value: 'target-user' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }
        if (query.includes('select count(*)')) {
          return [{ count: 1 }];
        }

        return [];
      },
      dmSender: async (discordUserId, content) => {
        dms.push({ discordUserId, content });
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Promoted/);
  assert.deepEqual(dms, [
    {
      discordUserId: 'target-user',
      content: 'You have been promoted to Serene Nursery app admin.',
    },
  ]);
});

test('pending admin requests notify other app admins privately', async () => {
  const dms = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: {
        name: 'addadmin',
        options: [{ name: 'user', value: 'target-user' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }
        if (query.includes('select count(*)')) {
          return [{ count: 2 }];
        }
        if (query.includes('insert into admin_approval_requests')) {
          return [{ id: 'approval-1' }];
        }
        if (query.includes('select discord_user_id')) {
          return [{ discord_user_id: 'admin-2' }];
        }

        return [];
      },
      dmSender: async (discordUserId, content) => {
        dms.push({ discordUserId, content });
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.content, /requested to promote/);
  assert.equal(dms.length, 1);
  assert.equal(dms[0].discordUserId, 'admin-2');
  assert.match(dms[0].content, /Please review/);
});

test('addflower reports duplicates privately without adding them', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: {
        name: 'addflower',
        options: [
          { name: 'name', value: 'Red Rose' },
          { name: 'rarity', value: 'R' },
          { name: 'quest_points', value: 20 },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /already exists/);
  assert.match(response.data.content, /has not been added/);
});

test('addflower announces newly added flowers publicly', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: {
        name: 'addflower',
        options: [
          { name: 'name', value: 'Moon Orchid' },
          { name: 'rarity', value: 'SSR' },
          { name: 'quest_points', value: 90 },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }
        if (query.includes('insert into flowers')) {
          return [{ id: 'flower-id' }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, undefined);
  assert.match(response.data.content, /New flower added/);
  assert.match(response.data.content, /Moon Orchid/);
  assert.match(response.data.content, /available to log/);
});

test('setflowerimage stores an uploaded image for an existing flower', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: {
        name: 'setflowerimage',
        options: [
          { name: 'flower', value: 'flower-id' },
          { name: 'image', value: 'attachment-id' },
        ],
        resolved: {
          attachments: {
            'attachment-id': {
              url: 'https://cdn.discordapp.com/attachments/red-rose.png',
              content_type: 'image/png',
            },
          },
        },
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Updated the image for Red Rose/);
  assert.ok(queries.some((query) => query.includes('update flowers') && query.includes('set image_url')));
});

test('setflowerimage rejects non-image attachments', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: {
        name: 'setflowerimage',
        options: [
          { name: 'flower', value: 'flower-id' },
          { name: 'image', value: 'attachment-id' },
        ],
        resolved: {
          attachments: {
            'attachment-id': {
              url: 'https://cdn.discordapp.com/attachments/notes.txt',
              content_type: 'text/plain',
            },
          },
        },
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }
        if (query.includes('from flowers')) {
          return [{ id: 'flower-id', name: 'Red Rose', rarity: 'R', quest_points: 20 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Please upload an image file/);
  assert.equal(queries.some((query) => query.includes('update flowers')), false);
});

test('removeuser deletes a player record and reports cascaded flower data', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: {
        name: 'removeuser',
        options: [{ name: 'user', value: 'target-user' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }
        if (query.includes('select discord_user_id, game_name, is_admin')) {
          return [{ discord_user_id: 'target-user', game_name: 'Target Florist', is_admin: false }];
        }
        if (query.includes('select') && query.includes('flower_logs') && query.includes('flower_pins')) {
          return [{ logged_flowers: 12, pins: 3 }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Removed Target Florist/);
  assert.match(response.data.content, /12 logged flowers/);
  assert.match(response.data.content, /3 pins/);
  assert.ok(queries.some((query) => query.includes('delete from app_users')));
});

test('removeuser blocks deleting app admins', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: {
        name: 'removeuser',
        options: [{ name: 'user', value: 'target-admin' }],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }
        if (query.includes('select discord_user_id, game_name, is_admin')) {
          return [{ discord_user_id: 'target-admin', game_name: 'Admin Florist', is_admin: true }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Use \/removeadmin first/);
  assert.ok(!queries.some((query) => query.includes('delete from app_users')));
});

test('donereset clears weekly done markers for app admins', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: { name: 'donereset' },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }
        if (query.includes('delete from weekly_done_users')) {
          return { count: 3 };
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Cleared 3 weekly quest done markers/);
  assert.ok(queries.some((query) => query.includes('delete from weekly_done_users')));
});

test('donereset blocks non-admins', async () => {
  const queries = [];
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'not-admin' } },
      data: { name: 'donereset' },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        queries.push(query);
        if (query.includes('select is_admin')) {
          return [{ is_admin: false }];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Only app admins/);
  assert.equal(queries.some((query) => query.includes('delete from weekly_done_users')), false);
});

test('addplayerflowers accepts a selected flower id from autocomplete', async () => {
  const response = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      member: { user: { id: 'admin-1' } },
      data: {
        name: 'addplayerflowers',
        options: [
          { name: 'user', value: 'target-user' },
          { name: 'flower_pattern', value: 'f55b3515-6216-4dab-94ff-c8b91c093ff5' },
        ],
      },
    },
    {
      sql: async (strings) => {
        const query = strings.join(' ');
        if (query.includes('select is_admin')) {
          return [{ is_admin: true }];
        }
        if (query.includes('select game_name')) {
          return [{ game_name: 'Target Florist' }];
        }
        if (query.includes('where id::text')) {
          return [
            {
              id: 'f55b3515-6216-4dab-94ff-c8b91c093ff5',
              name: 'Red Rose',
              rarity: 'R',
              quest_points: 20,
            },
          ];
        }

        return [];
      },
    },
  );

  assert.equal(response.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(response.data.flags, MessageFlags.EPHEMERAL);
  assert.match(response.data.content, /Select flowers to add/);
  assert.equal(response.data.components[0].components[0].options[0].label, 'Red Rose');
  assert.equal(response.data.components[0].components[0].options[0].description, 'R, 20 quest points');
});
