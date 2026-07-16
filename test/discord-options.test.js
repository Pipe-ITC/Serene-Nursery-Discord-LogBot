import test from 'node:test';
import assert from 'node:assert/strict';
import { displayNameForUser } from '../lib/discord/options.js';

test('formats cozy-only players without Discord mentions', () => {
  assert.equal(displayNameForUser('cozy:player-1', { game_name: 'Frosty' }), 'Frosty (Cozy Player)');
});

test('formats Discord players with their mention', () => {
  assert.equal(displayNameForUser('1234', { game_name: 'Rose Keeper' }), 'Rose Keeper (<@1234>)');
});
