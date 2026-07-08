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
