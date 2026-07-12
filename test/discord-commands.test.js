import test from 'node:test';
import assert from 'node:assert/strict';
import { discordCommands } from '../lib/discord/commands.js';

test('defines the expected private-server slash commands', () => {
  assert.deepEqual(
    discordCommands.map((command) => command.name),
    [
      'help',
      'log',
      'addpoints',
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
      'removeuser',
      'addplayerflowers',
    ],
  );
});

test('marks only picker-style flower and rarity string options as autocomplete-enabled', () => {
  const serialized = JSON.stringify(discordCommands);

  assert.match(serialized, /"name":"flower","description":"Flower to log","required":true,"autocomplete":true/);
  assert.match(serialized, /"name":"rarity","description":"Flower rarity","required":false,"autocomplete":true/);

  const flowerPatternOptions = discordCommands.flatMap((command) =>
    (command.options ?? []).filter((option) => option.name === 'flower_pattern'),
  );

  assert.equal(flowerPatternOptions.length, 2);
  assert.deepEqual(
    flowerPatternOptions.map((option) => option.autocomplete),
    [undefined, undefined],
  );

  const logallCommand = discordCommands.find((command) => command.name === 'logall');
  assert.deepEqual(
    logallCommand.options.map((option) => ({ name: option.name, required: option.required, autocomplete: option.autocomplete })),
    [
      { name: 'flower_pattern', required: false, autocomplete: undefined },
      { name: 'rarity', required: false, autocomplete: true },
    ],
  );
});
