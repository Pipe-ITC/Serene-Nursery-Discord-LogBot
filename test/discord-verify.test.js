import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createEd25519PublicKey, verifyDiscordSignature } from '../lib/discord/verify.js';

function testKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });

  return {
    privateKey,
    publicKeyHex: spki.subarray(-32).toString('hex'),
  };
}

test('verifies a valid Discord-style Ed25519 signature', () => {
  const { privateKey, publicKeyHex } = testKeyPair();
  const timestamp = '1783519900';
  const body = Buffer.from(JSON.stringify({ type: 1 }));
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), body]), privateKey).toString('hex');

  assert.equal(
    verifyDiscordSignature({
      publicKey: publicKeyHex,
      signature,
      timestamp,
      body,
    }),
    true,
  );
});

test('rejects a tampered Discord-style signature body', () => {
  const { privateKey, publicKeyHex } = testKeyPair();
  const timestamp = '1783519900';
  const body = Buffer.from(JSON.stringify({ type: 1 }));
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), body]), privateKey).toString('hex');

  assert.equal(
    verifyDiscordSignature({
      publicKey: publicKeyHex,
      signature,
      timestamp,
      body: Buffer.from(JSON.stringify({ type: 2 })),
    }),
    false,
  );
});

test('validates public key format', () => {
  assert.throws(() => createEd25519PublicKey('not-a-key'), /64-character hex/);
});
