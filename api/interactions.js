import { handleInteraction } from '../lib/discord/handler.js';
import { verifyDiscordSignature } from '../lib/discord/verify.js';
import { readRawBody } from '../lib/http/raw-body.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function interactions(req, res) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, service: 'discord-interactions' });
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const publicKey = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKey) {
      sendJson(res, 500, { error: 'DISCORD_PUBLIC_KEY is not configured' });
      return;
    }

    const rawBody = await readRawBody(req);
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    const isValid = verifyDiscordSignature({
      publicKey,
      signature: Array.isArray(signature) ? signature[0] : signature,
      timestamp: Array.isArray(timestamp) ? timestamp[0] : timestamp,
      body: rawBody,
    });

    if (!isValid) {
      sendJson(res, 401, { error: 'Invalid request signature' });
      return;
    }

    let interaction;
    try {
      interaction = JSON.parse(rawBody.toString('utf8'));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const response = await handleInteraction(interaction);
    sendJson(res, 200, response);
  } catch (error) {
    console.error('Interaction handler failed', error);
    sendJson(res, 500, { error: 'Interaction handler failed' });
  }
}
