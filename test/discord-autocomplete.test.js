import test from 'node:test';
import assert from 'node:assert/strict';
import { autocompleteForInteraction } from '../lib/discord/autocomplete.js';
import { focusedOption } from '../lib/discord/options.js';
import { rarityChoices } from '../lib/discord/rarities.js';

test('finds focused nested autocomplete options', () => {
  assert.deepEqual(
    focusedOption([
      {
        name: 'outer',
        options: [
          { name: 'ignored', value: 'x' },
          { name: 'flower', value: 'rose', focused: true },
        ],
      },
    ]),
    { name: 'flower', value: 'rose', focused: true },
  );
});

test('routes flower autocomplete to flower search dependency', async () => {
  const choices = await autocompleteForInteraction(
    {
      data: {
        options: [{ name: 'flower', value: 'rose', focused: true }],
      },
    },
    {
      searchFlowerChoices: async (value) => [{ name: `Result for ${value}`, value: 'flower-id' }],
    },
  );

  assert.deepEqual(choices, [{ name: 'Result for rose', value: 'flower-id' }]);
});

test('routes flower pattern autocomplete to name-valued choices', async () => {
  const calls = [];
  const choices = await autocompleteForInteraction(
    {
      data: {
        options: [{ name: 'flower_pattern', value: 'rose', focused: true }],
      },
    },
    {
      searchFlowerChoices: async (...args) => {
        calls.push(args);
        return [{ name: 'Red Rose (R, 20 pts)', value: 'Red Rose' }];
      },
    },
  );

  assert.deepEqual(calls, [['rose', 25, 'name']]);
  assert.deepEqual(choices, [{ name: 'Red Rose (R, 20 pts)', value: 'Red Rose' }]);
});

test('flower search can return flower names as autocomplete values', async () => {
  const choices = await autocompleteForInteraction(
    {
      data: {
        options: [{ name: 'flower_pattern', value: 'rose', focused: true }],
      },
    },
    {
      searchFlowerChoices: async (_value, _limit, choiceValue) => [
        {
          name: 'Red Rose (R, 20 pts)',
          value: choiceValue === 'name' ? 'Red Rose' : 'flower-id',
        },
      ],
    },
  );

  assert.deepEqual(choices, [{ name: 'Red Rose (R, 20 pts)', value: 'Red Rose' }]);
});

test('returns rarity choices for focused rarity options', async () => {
  const choices = await autocompleteForInteraction({
    data: {
      options: [{ name: 'rarity', value: 'ultra', focused: true }],
    },
  });

  assert.deepEqual(choices, [{ name: 'UR - Ultra Rare', value: 'UR' }]);
});

test('filters rarity choices by code, label, or color', () => {
  assert.deepEqual(rarityChoices('gold'), [{ name: 'SSR - SS Rare', value: 'SSR' }]);
  assert.deepEqual(rarityChoices('sr'), [
    { name: 'SR - Super Rare', value: 'SR' },
    { name: 'SSR - SS Rare', value: 'SSR' },
  ]);
});
