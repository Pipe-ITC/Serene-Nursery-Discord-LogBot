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
  assert.doesNotMatch(response.data.content, /\/addflower/);
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
  assert.match(response.data.content, /\/removeuser <user>/);
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
  assert.match(response.data.content, /2 UR flowers found/);
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
  assert.match(response.data.content, /120 UR flowers found/);
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
  assert.match(response.data.embeds[0].description, /Blue Rose/);
  assert.match(response.data.embeds[0].description, /Gold Lily/);
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
});
