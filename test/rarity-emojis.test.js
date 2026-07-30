import test from 'node:test';
import assert from 'node:assert/strict';
import { rarityEmoji } from '../lib/discord/rarity-emojis.js';

test('rarity emojis use development defaults when environment values are absent', () => {
  delete process.env.EMOJI_R;

  assert.equal(rarityEmoji('R'), '<:R:1524529635256307852>');
});

test('rarity emojis can be overridden by environment', () => {
  process.env.EMOJI_R = '1532473796827549798';

  try {
    assert.equal(rarityEmoji('R'), '<:R:1532473796827549798>');
  } finally {
    delete process.env.EMOJI_R;
  }
});
