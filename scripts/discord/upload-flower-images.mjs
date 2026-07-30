import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { loadLocalEnv } from '../db/env.mjs';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function usage() {
  return `
Upload local flower image files to Discord and store the Discord attachment URLs in flowers.image_url.

Required environment:
  DATABASE_URL          Postgres database to update
  DISCORD_BOT_TOKEN    Bot token used to upload files
  DISCORD_CHANNEL_ID   Channel where image attachment messages will be posted

Optional environment:
  CAPTURES_DIR         Image root directory. Defaults to ./captures
  FLOWER_IMAGE_LIMIT   Maximum number of matched flowers to process

Flags:
  --dry-run            Match files to flowers without uploading or updating rows
  --overwrite          Replace existing image_url values. Default only fills missing image_url rows
  --keep-messages      Leave Discord upload messages in place after updating the database
  --help              Show this help

Example:
  DISCORD_CHANNEL_ID=123 DATABASE_URL=postgres://... DISCORD_BOT_TOKEN=... \\
    node scripts/discord/upload-flower-images.mjs --dry-run
`.trim();
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

async function walkImages(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkImages(fullPath));
      continue;
    }

    if (imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function flowerNameFromFile(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/, '');
}

function scoreFile(filePath) {
  let score = 0;
  if (filePath.includes(`${path.sep}.`)) {
    score += 1000;
  }
  if (filePath.includes('batch-4-chunks')) {
    score += 500;
  }
  score += filePath.length;
  return score;
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }

  return 'image/png';
}

function canonicalAttachmentUrl(url) {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

async function uploadImage({ botToken, channelId, filePath, flowerName }) {
  const body = new FormData();
  const bytes = await fs.readFile(filePath);
  const blob = new Blob([bytes], { type: mimeType(filePath) });
  body.append('payload_json', JSON.stringify({
    content: `Flower image: ${flowerName}`,
    allowed_mentions: { parse: [] },
  }));
  body.append('files[0]', blob, path.basename(filePath));

  for (;;) {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      body,
    });

    if (response.status === 429) {
      const retry = await response.json().catch(() => ({}));
      const retryAfterMs = Math.ceil(Number(retry.retry_after ?? 1) * 1000);
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      continue;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Discord upload failed for ${flowerName}: ${response.status} ${JSON.stringify(payload)}`);
    }

    const messageId = payload.id;
    const attachmentUrl = payload.attachments?.[0]?.url;
    if (!messageId) {
      throw new Error(`Discord response did not include a message ID for ${flowerName}.`);
    }
    if (!attachmentUrl) {
      throw new Error(`Discord response did not include an attachment URL for ${flowerName}.`);
    }

    return { attachmentUrl, messageId };
  }
}

async function deleteMessage({ botToken, channelId, messageId }) {
  for (;;) {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });

    if (response.status === 429) {
      const retry = await response.json().catch(() => ({}));
      const retryAfterMs = Math.ceil(Number(retry.retry_after ?? 1) * 1000);
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      continue;
    }

    if (response.status === 404) {
      return;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(`Discord message delete failed for ${messageId}: ${response.status} ${JSON.stringify(payload)}`);
    }

    return;
  }
}

async function main() {
  if (hasFlag('--help')) {
    console.log(usage());
    return;
  }

  loadLocalEnv();

  const dryRun = hasFlag('--dry-run');
  const overwrite = hasFlag('--overwrite');
  const keepMessages = hasFlag('--keep-messages');
  const databaseUrl = requireEnv('DATABASE_URL');
  const botToken = dryRun ? process.env.DISCORD_BOT_TOKEN : requireEnv('DISCORD_BOT_TOKEN');
  const channelId = dryRun ? process.env.DISCORD_CHANNEL_ID : requireEnv('DISCORD_CHANNEL_ID');
  const capturesDir = path.resolve(process.env.CAPTURES_DIR ?? 'captures');
  const limit = process.env.FLOWER_IMAGE_LIMIT ? Number(process.env.FLOWER_IMAGE_LIMIT) : undefined;

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('FLOWER_IMAGE_LIMIT must be a positive integer.');
  }

  const files = await walkImages(capturesDir);
  const imageByName = new Map();

  for (const file of files) {
    const name = flowerNameFromFile(file);
    const current = imageByName.get(name);
    if (!current || scoreFile(file) < scoreFile(current)) {
      imageByName.set(name, file);
    }
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const flowers = await sql`
      select id, name, image_url
      from flowers
      order by name
    `;

    const matched = flowers
      .map((flower) => ({ ...flower, file: imageByName.get(flower.name) }))
      .filter((flower) => flower.file)
      .filter((flower) => overwrite || !flower.image_url)
      .slice(0, limit);

    const failed = [];
    const deleteFailures = [];
    let updated = 0;

    for (const [index, flower] of matched.entries()) {
      try {
        if (dryRun) {
          console.log(JSON.stringify({ status: 'matched', index: index + 1, total: matched.length, name: flower.name, file: flower.file }));
          continue;
        }

        const upload = await uploadImage({ botToken, channelId, filePath: flower.file, flowerName: flower.name });
        const url = canonicalAttachmentUrl(upload.attachmentUrl);
        await sql`
          update flowers
          set image_url = ${url}
          where id = ${flower.id}
        `;
        updated += 1;
        if (!keepMessages) {
          try {
            await deleteMessage({ botToken, channelId, messageId: upload.messageId });
          } catch (error) {
            deleteFailures.push({ name: flower.name, messageId: upload.messageId, error: error.message });
            console.error(JSON.stringify({
              status: 'delete_failed',
              name: flower.name,
              messageId: upload.messageId,
              error: error.message,
            }));
          }
        }

        console.log(JSON.stringify({
          status: 'updated',
          index: index + 1,
          total: matched.length,
          name: flower.name,
          messageDeleted: !keepMessages,
        }));
      } catch (error) {
        failed.push({ name: flower.name, error: error.message });
        console.error(JSON.stringify({ status: 'failed', name: flower.name, error: error.message }));
      }
    }

    const [remainingMissing] = await sql`
      select count(*)::int as count
      from flowers
      where image_url is null
    `;

    console.log(JSON.stringify({
      dryRun,
      overwrite,
      keepMessages,
      capturesDir,
      localImageFiles: files.length,
      uniqueLocalNames: imageByName.size,
      productionFlowers: flowers.length,
      matchedFlowersToProcess: matched.length,
      updated,
      failed: failed.length,
      deleteFailures: deleteFailures.length,
      remainingMissingImageUrls: remainingMissing.count,
      failures: failed,
      messageDeleteFailures: deleteFailures,
    }, null, 2));

    if (failed.length > 0 || deleteFailures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
