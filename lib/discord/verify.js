import { createPublicKey, verify } from 'node:crypto';

const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');

export function createEd25519PublicKey(publicKeyHex) {
  if (!/^[a-f0-9]{64}$/i.test(publicKeyHex ?? '')) {
    throw new Error('DISCORD_PUBLIC_KEY must be a 64-character hex Ed25519 public key.');
  }

  return createPublicKey({
    key: Buffer.concat([ed25519SpkiPrefix, Buffer.from(publicKeyHex, 'hex')]),
    format: 'der',
    type: 'spki',
  });
}

export function verifyDiscordSignature({ publicKey, signature, timestamp, body }) {
  if (!signature || !timestamp || !body) {
    return false;
  }

  if (!/^[a-f0-9]+$/i.test(signature) || signature.length !== 128) {
    return false;
  }

  const key = typeof publicKey === 'string' ? createEd25519PublicKey(publicKey) : publicKey;
  const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]);

  return verify(null, message, key, Buffer.from(signature, 'hex'));
}
