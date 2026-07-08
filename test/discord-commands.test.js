import test from 'node:test';
import assert from 'node:assert/strict';
import { discordCommands } from '../lib/discord/commands.js';

test('defines the expected private-server slash commands', () => {
  assert.deepEqual(
    discordCommands.map((command) => command.name),
    [
      'help',
      'log',
      'del',
      'logall',
      'setlevel',
      'find',
      'findpoints',
      'findrarity',
      'points',
      'info',
      'setname',
      'count',
      'pin',
      'pinned',
      'addflower',
      'pinned-flowers',
      'pinned-players',
      'addadmin',
      'removeadmin',
      'addplayerflowers',
    ],
  );
});

test('marks flower and rarity string options as autocomplete-enabled', () => {
  const serialized = JSON.stringify(discordCommands);

  assert.match(serialized, /"name":"flower","description":"Flower to log","required":true,"autocomplete":true/);
  assert.match(serialized, /"name":"flower_pattern","description":"Text to match within flower names","required":true,"autocomplete":true/);
  assert.match(serialized, /"name":"rarity","description":"Flower rarity","required":false,"autocomplete":true/);
});
