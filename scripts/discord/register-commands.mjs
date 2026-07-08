import { discordCommands } from '../../lib/discord/commands.js';
import { loadLocalEnv } from '../db/env.mjs';

loadLocalEnv();

const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!applicationId) {
  throw new Error('DISCORD_APPLICATION_ID is required.');
}

if (!botToken) {
  throw new Error('DISCORD_BOT_TOKEN is required.');
}

if (!guildId) {
  throw new Error('DISCORD_GUILD_ID is required for private-server command registration.');
}

const url = `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`;
const response = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(discordCommands),
});

const body = await response.json().catch(() => undefined);

if (!response.ok) {
  console.error(JSON.stringify(body, null, 2));
  throw new Error(`Discord command registration failed with status ${response.status}.`);
}

console.log(
  JSON.stringify(
    {
      registered: body.length,
      commands: body.map((command) => command.name),
    },
    null,
    2,
  ),
);
