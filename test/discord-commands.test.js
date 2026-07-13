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

test('limits extra point command options to cozy bonus values', () => {
  const logCommand = discordCommands.find((command) => command.name === 'log');
  const addPointsCommand = discordCommands.find((command) => command.name === 'addpoints');

  assert.deepEqual(
    logCommand.options.find((option) => option.name === 'extra_points'),
    {
      type: 4,
      name: 'extra_points',
      description: 'Optional extra points added to this flower',
      required: false,
      min_value: 1,
      max_value: 4,
    },
  );
  assert.deepEqual(
    addPointsCommand.options.find((option) => option.name === 'points'),
    {
      type: 4,
      name: 'points',
      description: 'Extra points to store for this flower',
      required: true,
      min_value: 1,
      max_value: 4,
    },
  );
});
