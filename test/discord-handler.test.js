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
  assert.match(response.data.content, /Red Rose/);
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
  assert.match(response.data.content, /Pink Rose/);
  assert.match(response.data.content, /Starlight Lily/);
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
  assert.match(response.data.content, /FANFARE/);
  assert.match(response.data.content, /level 42/);
  assert.match(response.data.content, /7 assignment-level flowers/);
});
