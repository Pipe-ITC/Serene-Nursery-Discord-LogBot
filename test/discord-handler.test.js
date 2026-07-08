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
    data: { name: 'list' },
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
