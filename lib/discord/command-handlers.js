import { getSql } from '../db/client.js';
import { normalizeSearchText } from '../flowers/search.js';
import { ButtonStyle, ComponentType } from './constants.js';
import { displayNameForUser, optionValue, userIdFromInteraction } from './options.js';
import { ephemeralData, ephemeralMessage, message, updateMessage } from './responses.js';

const MAX_SELECT_OPTIONS = 25;
const MAX_CONTENT_LENGTH = 1900;
const MAX_EMBED_DESCRIPTION_LENGTH = 4000;
const PUBLIC_ASSET_BASE_URL = 'https://bot.serenenursery.pipeitc.dev';
const LEVELLED_UP_IMAGE_PATH = '/Levelled-Up_Embed.png';
const RARITY_ORDER = ['N', 'R', 'SR', 'SSR', 'UR'];
const PLAYER_HELP_LINES = [
  '/help - Show this command list.',
  '/log <flower> [extra_points] - Log a flower you own.',
  '/del <flower> - Remove one logged flower and its pin.',
  '/logall <flower_pattern> - Pick matching flowers to log.',
  '/setlevel <level> - Log assignment-level flowers up to that level.',
  '/find <flower> - Show who has logged or pinned a flower.',
  '/findpoints <points> - List flowers with those fixed quest points.',
  '/findrarity <rarity> - List flowers with that rarity.',
  '/points <flower> - Show a flower\'s fixed quest points.',
  '/info <flower> - Show your status and server stats for a flower.',
  '/setname <name> - Set your Cozy Florist game name.',
  '/count [rarity] - Show your logged flower progress.',
  '/pin <flower> - Toggle a pin for a flower you have logged.',
  '/pinned [user] - Show your pinned flowers or another player\'s pins.',
];
const ADMIN_HELP_LINES = [
  '/addflower - Add a new flower to the database.',
  '/pinned-flowers [rarity] - Show flowers pinned by players.',
  '/pinned-players - Show players with pinned flowers.',
  '/addadmin <user> - Promote an app admin, with approval if required.',
  '/removeadmin <user> - Remove an app admin, with approval if required.',
  '/addplayerflowers <user> <flower_pattern> - Pick matching flowers to log for a player.',
];
const COMMANDS_REQUIRING_GAME_NAME = new Set([
  'log',
  'del',
  'logall',
  'setlevel',
  'find',
  'findpoints',
  'findrarity',
  'points',
  'info',
  'count',
  'pin',
  'pinned',
]);

function truncate(content) {
  if (content.length <= MAX_CONTENT_LENGTH) {
    return content;
  }

  return `${content.slice(0, MAX_CONTENT_LENGTH - 24)}\n...and more results.`;
}

function flowerLabel(flower) {
  return `${flower.name} (${flower.rarity}, ${flower.quest_points} pts)`;
}

function rarityLabel(rarity) {
  return rarity ?? 'all rarities';
}

function chunkLines(lines, maxLength) {
  const chunks = [];
  let chunk = '';

  for (const line of lines) {
    const next = chunk ? `${chunk}\n${line}` : line;
    if (next.length > maxLength && chunk) {
      chunks.push(chunk);
      chunk = line;
    } else {
      chunk = next;
    }
  }

  if (chunk) {
    chunks.push(chunk);
  }

  return chunks;
}

function publicAssetUrl(path) {
  return new URL(path, process.env.PUBLIC_ASSET_BASE_URL ?? PUBLIC_ASSET_BASE_URL).toString();
}

function publicLineListMessage(content, lines, title) {
  if (lines.length === 0) {
    return message(content);
  }

  return message(content, {
    embeds: chunkLines(lines, MAX_EMBED_DESCRIPTION_LENGTH).map((description, index) => ({
      title: index === 0 ? title : `${title} continued`,
      description,
    })),
  });
}

function totalPoints(flower) {
  return Number(flower.quest_points) + Number(flower.extra_points ?? 0);
}

function assertUser(interaction) {
  const discordUserId = userIdFromInteraction(interaction);
  if (!discordUserId) {
    throw new Error('Discord user ID was not present on the interaction.');
  }

  return discordUserId;
}

function optionString(interaction, name) {
  const value = optionValue(interaction?.data?.options, name);
  return value === undefined ? undefined : String(value);
}

function optionInteger(interaction, name) {
  const value = optionValue(interaction?.data?.options, name);
  return value === undefined ? undefined : Number(value);
}

async function ensureUser(sql, discordUserId) {
  await sql`
    insert into app_users (discord_user_id)
    values (${discordUserId})
    on conflict (discord_user_id) do nothing
  `;
}

async function getGameName(sql, discordUserId) {
  const [user] = await sql`
    select game_name
    from app_users
    where discord_user_id = ${discordUserId}
  `;

  const gameName = user?.game_name?.trim();
  return gameName || undefined;
}

async function requireGameName(sql, discordUserId, subject = 'You') {
  if (await getGameName(sql, discordUserId)) {
    return undefined;
  }

  const prefix = subject === 'You' ? 'You need' : `${subject} needs`;
  return ephemeralMessage(`${prefix} to run /setname before flowers can be logged or searched. Then run this command again.`);
}

async function findFlowerByInput(sql, value) {
  if (!value) {
    return undefined;
  }

  const [byId] = await sql`
    select id, name, rarity, quest_points, assignment_level, image_url
    from flowers
    where id::text = ${value}
    limit 1
  `;
  if (byId) {
    return byId;
  }

  const normalized = normalizeSearchText(value);
  if (!normalized) {
    return undefined;
  }

  const [flower] = await sql`
    select id, name, rarity, quest_points, assignment_level, image_url
    from flowers
    where normalized_name = ${normalized}
       or normalized_name like ${`${normalized}%`}
       or normalized_name like ${`% ${normalized}%`}
       or normalized_name like ${`%${normalized}%`}
    order by
      case
        when normalized_name = ${normalized} then 0
        when normalized_name like ${`${normalized}%`} then 1
        when normalized_name like ${`% ${normalized}%`} then 2
        else 3
      end,
      name
    limit 1
  `;

  return flower;
}

async function matchingFlowers(sql, value, limit = MAX_SELECT_OPTIONS) {
  const [byId] = await sql`
    select id, name, rarity, quest_points
    from flowers
    where id::text = ${String(value ?? '')}
    limit 1
  `;
  if (byId) {
    return [byId];
  }

  const normalized = normalizeSearchText(value);
  if (!normalized) {
    return [];
  }

  return sql`
    select id, name, rarity, quest_points
    from flowers
    where normalized_name like ${`%${normalized}%`}
    order by name
    limit ${limit}
  `;
}

async function assertAdmin(sql, discordUserId) {
  await ensureBootstrapAdmin(sql, discordUserId);

  const [admin] = await sql`
    select is_admin
    from app_users
    where discord_user_id = ${discordUserId}
  `;

  return Boolean(admin?.is_admin);
}

function bootstrapAdminId() {
  return (
    process.env.APP_BOOTSTRAP_ADMIN_ID ??
    process.env.DISCORD_BOOTSTRAP_ADMIN_ID ??
    process.env.INITIAL_ADMIN_DISCORD_ID
  );
}

async function ensureBootstrapAdmin(sql, discordUserId) {
  const configuredAdminId = bootstrapAdminId();
  if (!configuredAdminId || configuredAdminId !== discordUserId) {
    return;
  }

  await sql`
    insert into app_users (discord_user_id, is_admin)
    values (${discordUserId}, true)
    on conflict (discord_user_id) do update set is_admin = true
  `;
}

function selectMenu(customId, flowers, placeholder) {
  return [
    {
      type: ComponentType.ACTION_ROW,
      components: [
        {
          type: ComponentType.STRING_SELECT,
          custom_id: customId,
          placeholder,
          min_values: 1,
          max_values: Math.min(flowers.length, MAX_SELECT_OPTIONS),
          options: flowers.map((flower) => ({
            label: flower.name.slice(0, 100),
            description: `${flower.rarity}, ${flower.quest_points} quest points`.slice(0, 100),
            value: flower.id,
          })),
        },
      ],
    },
  ];
}

function approvalButtons(requestId) {
  return [
    {
      type: ComponentType.ACTION_ROW,
      components: [
        {
          type: ComponentType.BUTTON,
          style: ButtonStyle.SUCCESS,
          custom_id: `admin-approve:${requestId}`,
          label: 'Approve',
        },
        {
          type: ComponentType.BUTTON,
          style: ButtonStyle.DANGER,
          custom_id: `admin-reject:${requestId}`,
          label: 'Reject',
        },
      ],
    },
  ];
}

async function sendDiscordDirectMessage(discordUserId, content, fetchImpl = globalThis.fetch) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !fetchImpl) {
    return false;
  }

  const headers = {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  };
  const channelResponse = await fetchImpl('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelResponse.ok) {
    return false;
  }

  const channel = await channelResponse.json();
  if (!channel?.id) {
    return false;
  }

  const messageResponse = await fetchImpl(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  });

  return messageResponse.ok;
}

async function notifyUser(dmSender, discordUserId, content) {
  try {
    await dmSender(discordUserId, content);
  } catch (error) {
    console.warn('Discord DM notification failed', error);
  }
}

async function notifyOtherAdmins(sql, dmSender, requesterId, content) {
  const admins = await sql`
    select discord_user_id
    from app_users
    where is_admin = true
      and discord_user_id <> ${requesterId}
  `;

  await Promise.all(admins.map((admin) => notifyUser(dmSender, admin.discord_user_id, content)));
}

async function upsertLogs(sql, discordUserId, flowerIds, extraPoints = 0) {
  if (flowerIds.length === 0) {
    return 0;
  }

  await ensureUser(sql, discordUserId);

  const result = await sql`
    insert into flower_logs (discord_user_id, flower_id, extra_points, logged_at)
    select ${discordUserId}, id, ${extraPoints}, now()
    from flowers
    where id in ${sql(flowerIds)}
    on conflict (discord_user_id, flower_id) do update set
      extra_points = excluded.extra_points,
      logged_at = excluded.logged_at
    returning id
  `;

  return result.count;
}

async function handleList(interaction, sql) {
  const discordUserId = assertUser(interaction);
  const flower = await findFlowerByInput(sql, optionString(interaction, 'flower'));
  const extraPoints = optionInteger(interaction, 'extra_points') ?? 0;

  if (!flower) {
    return ephemeralMessage('I could not find that flower.');
  }

  if (!Number.isInteger(extraPoints) || extraPoints < 0) {
    return ephemeralMessage('Extra points must be 0 or higher.');
  }

  await upsertLogs(sql, discordUserId, [flower.id], extraPoints);
  const extra = extraPoints > 0 ? ` with +${extraPoints} extra points` : '';
  return ephemeralMessage(`Logged ${flowerLabel(flower)}${extra}. Total for you: ${flower.quest_points + extraPoints}.`);
}

async function handleHelp(interaction, sql) {
  const discordUserId = assertUser(interaction);
  const isAdmin = await assertAdmin(sql, discordUserId);
  const sections = [
    'Serene Nursery commands',
    '',
    'Player commands:',
    PLAYER_HELP_LINES.map((line) => `- ${line}`).join('\n'),
  ];

  if (isAdmin) {
    sections.push('', 'Admin commands:', ADMIN_HELP_LINES.map((line) => `- ${line}`).join('\n'));
  }

  return ephemeralMessage(sections.join('\n'));
}

async function handleRemove(interaction, sql) {
  const discordUserId = assertUser(interaction);
  const flower = await findFlowerByInput(sql, optionString(interaction, 'flower'));

  if (!flower) {
    return ephemeralMessage('I could not find that flower.');
  }

  const result = await sql`
    delete from flower_logs
    where discord_user_id = ${discordUserId}
      and flower_id = ${flower.id}
  `;

  return ephemeralMessage(
    result.count > 0
      ? `Removed ${flower.name}. Any pin for it was removed as well.`
      : `You had not logged ${flower.name}.`,
  );
}

async function handleListAll(interaction, sql) {
  const discordUserId = assertUser(interaction);
  const pattern = optionString(interaction, 'flower_pattern');
  const flowers = await matchingFlowers(sql, pattern);

  if (flowers.length === 0) {
    return ephemeralMessage(`No flowers matched "${pattern}".`);
  }

  return ephemeralData({
    content: `Select the flowers to log from ${flowers.length} match${flowers.length === 1 ? '' : 'es'} for "${pattern}".`,
    components: selectMenu(`listall:${discordUserId}:${discordUserId}`, flowers, 'Choose flowers to log'),
  });
}

async function handleSetLevel(interaction, sql) {
  const discordUserId = assertUser(interaction);
  const level = optionInteger(interaction, 'level');

  if (!Number.isInteger(level) || level < 0) {
    return message('Level must be 0 or higher.');
  }

  await ensureUser(sql, discordUserId);
  const result = await sql`
    insert into flower_logs (discord_user_id, flower_id, extra_points, logged_at)
    select ${discordUserId}, id, 0, now()
    from flowers
    where assignment_level is not null
      and assignment_level <= ${level}
    on conflict (discord_user_id, flower_id) do update set
      logged_at = excluded.logged_at
    returning id
  `;

  return message(
    [
      '*** FANFARE! ***',
      '',
      `Everyone, congratulate <@${discordUserId}> for reaching level ${level}!`,
      `${result.count} assignment-level flower${result.count === 1 ? '' : 's'} logged in one glorious burst.`,
      '',
      'Trumpets up. Petals everywhere. Absolutely magnificent.',
    ].join('\n'),
    {
      embeds: [
        {
          image: {
            url: publicAssetUrl(LEVELLED_UP_IMAGE_PATH),
          },
        },
      ],
    },
  );
}

async function handleFind(interaction, sql) {
  const flower = await findFlowerByInput(sql, optionString(interaction, 'flower'));

  if (!flower) {
    return message('I could not find that flower.');
  }

  const owners = await sql`
    select l.extra_points, u.discord_user_id, u.game_name
    from flower_logs l
    join app_users u on u.discord_user_id = l.discord_user_id
    where l.flower_id = ${flower.id}
    order by coalesce(nullif(u.game_name, ''), u.discord_user_id)
  `;
  const pinners = await sql`
    select u.discord_user_id, u.game_name
    from flower_pins p
    join app_users u on u.discord_user_id = p.discord_user_id
    where p.flower_id = ${flower.id}
    order by coalesce(nullif(u.game_name, ''), u.discord_user_id)
  `;

  const ownerLines = owners.map((owner) => {
    const bonus = owner.extra_points > 0 ? ` (extra +${owner.extra_points})` : '';
    return `- ${displayNameForUser(owner.discord_user_id, owner)}${bonus}`;
  });
  const pinLines = pinners.map((user) => `- ${displayNameForUser(user.discord_user_id, user)}`);

  return message(
    truncate(
      [
        `${flower.rarity} ${flower.name}`,
        `Quest points: ${flower.quest_points}`,
        '',
        `Logged by (${owners.length}):`,
        ownerLines.length ? ownerLines.join('\n') : 'No one has logged this flower yet.',
        '',
        `Pinned by (${pinners.length}):`,
        pinLines.length ? pinLines.join('\n') : 'No one has pinned this flower yet.',
      ].join('\n'),
    ),
  );
}

async function handleFindPoints(interaction, sql) {
  const points = optionInteger(interaction, 'points');
  if (!Number.isInteger(points) || points < 0) {
    return message('Points must be 0 or higher.');
  }

  const flowers = await sql`
    select name, rarity, quest_points
    from flowers
    where quest_points = ${points}
    order by name
  `;

  const lines = flowers.map((flower) => `- ${flower.name} (${flower.rarity})`);
  return publicLineListMessage(
    `${flowers.length} flower${flowers.length === 1 ? '' : 's'} have ${points} quest points.`,
    lines,
    `${points} point flowers`,
  );
}

async function handleFindRarity(interaction, sql) {
  const rarity = optionString(interaction, 'rarity');

  if (!RARITY_ORDER.includes(rarity)) {
    return message('Please choose a valid rarity.');
  }

  const flowers = await sql`
    select name, rarity, quest_points
    from flowers
    where rarity = ${rarity}
    order by name
  `;

  const lines = flowers.map((flower) => `- ${flower.name} (${flower.quest_points} pts)`);
  const content = `${flowers.length} ${rarity} flower${flowers.length === 1 ? '' : 's'} found.`;

  if (lines.length === 0) {
    return message(content);
  }

  return publicLineListMessage(content, lines, `${rarity} flowers`);
}

async function handlePoints(interaction, sql) {
  const flower = await findFlowerByInput(sql, optionString(interaction, 'flower'));
  return flower
    ? message(`${flower.name} has ${flower.quest_points} quest points.`)
    : message('I could not find that flower.');
}

async function handleInfo(interaction, sql) {
  const discordUserId = assertUser(interaction);
  const flower = await findFlowerByInput(sql, optionString(interaction, 'flower'));

  if (!flower) {
    return message('I could not find that flower.');
  }

  const [stats] = await sql`
    select
      exists (
        select 1 from flower_logs
        where discord_user_id = ${discordUserId}
          and flower_id = ${flower.id}
      ) as logged_by_you,
      (select count(*)::int from flower_logs where flower_id = ${flower.id}) as logged_count,
      (select count(*)::int from flower_pins where flower_id = ${flower.id}) as pinned_count
  `;
  const [firstLogger] = await sql`
    select u.discord_user_id, u.game_name
    from flower_logs l
    join app_users u on u.discord_user_id = l.discord_user_id
    where l.flower_id = ${flower.id}
    order by l.logged_at asc
    limit 1
  `;

  return message(
    [
      flowerLabel(flower),
      `Logged by you: ${stats.logged_by_you ? 'true' : 'false'}`,
      `People logged: ${stats.logged_count}`,
      `People pinned: ${stats.pinned_count}`,
      `First logger: ${firstLogger ? displayNameForUser(firstLogger.discord_user_id, firstLogger) : 'None'}`,
    ].join('\n'),
  );
}

async function handleSetName(interaction, sql) {
  const discordUserId = assertUser(interaction);
  const name = optionString(interaction, 'name')?.trim();

  if (!name) {
    return ephemeralMessage('Please provide a game name.');
  }

  await sql`
    insert into app_users (discord_user_id, game_name)
    values (${discordUserId}, ${name})
    on conflict (discord_user_id) do update set game_name = excluded.game_name
  `;

  return ephemeralMessage(`Your game name is now ${name}.`);
}

async function handleCount(interaction, sql) {
  const discordUserId = assertUser(interaction);
  const rarity = optionString(interaction, 'rarity');

  if (rarity) {
    const [row] = await sql`
      select
        (select count(*)::int from flower_logs l join flowers f on f.id = l.flower_id where l.discord_user_id = ${discordUserId} and f.rarity = ${rarity}) as logged,
        (select count(*)::int from flowers where rarity = ${rarity}) as total
    `;
    return ephemeralMessage(`You have logged ${row.logged}/${row.total} ${rarityLabel(rarity)} flowers.`);
  }

  const rows = await sql`
    select f.rarity, count(l.flower_id)::int as logged, count(f.id)::int as total
    from flowers f
    left join flower_logs l on l.flower_id = f.id and l.discord_user_id = ${discordUserId}
    group by f.rarity
  `;
  const byRarity = new Map(rows.map((row) => [row.rarity, row]));
  const logged = rows.reduce((sum, row) => sum + row.logged, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const lines = RARITY_ORDER.map((code) => {
    const row = byRarity.get(code) ?? { logged: 0, total: 0 };
    return `- ${code}: ${row.logged}/${row.total}`;
  });

  return ephemeralMessage([`You have logged ${logged}/${total} flowers.`, ...lines].join('\n'));
}

async function handlePin(interaction, sql) {
  const discordUserId = assertUser(interaction);
  const flower = await findFlowerByInput(sql, optionString(interaction, 'flower'));

  if (!flower) {
    return message('I could not find that flower.');
  }

  const [logged] = await sql`
    select 1
    from flower_logs
    where discord_user_id = ${discordUserId}
      and flower_id = ${flower.id}
    limit 1
  `;

  if (!logged) {
    return message(`You need to log ${flower.name} before you can pin it.`);
  }

  const removed = await sql`
    delete from flower_pins
    where discord_user_id = ${discordUserId}
      and flower_id = ${flower.id}
  `;

  if (removed.count > 0) {
    return message(`Unpinned ${flower.name}.`);
  }

  await sql`
    insert into flower_pins (discord_user_id, flower_id)
    values (${discordUserId}, ${flower.id})
  `;

  return message(`Pinned ${flower.name}.`);
}

async function handlePinned(interaction, sql) {
  const requesterId = assertUser(interaction);
  const targetUserId = optionString(interaction, 'user') ?? requesterId;
  const rows = await sql`
    select f.name, f.rarity, f.quest_points
    from flower_pins p
    join flowers f on f.id = p.flower_id
    where p.discord_user_id = ${targetUserId}
    order by f.name
  `;
  const heading = targetUserId === requesterId ? 'Your pinned flowers' : `<@${targetUserId}> pinned flowers`;
  const lines = rows.map((flower) => `- ${flowerLabel(flower)}`);

  return publicLineListMessage(`${heading} (${rows.length}):`, lines.length ? lines : ['No pinned flowers.'], heading);
}

async function handleAddFlower(interaction, sql) {
  const discordUserId = assertUser(interaction);
  if (!(await assertAdmin(sql, discordUserId))) {
    return ephemeralMessage('Only app admins can use this command.');
  }

  const name = optionString(interaction, 'name')?.trim();
  const rarity = optionString(interaction, 'rarity');
  const questPoints = optionInteger(interaction, 'quest_points');
  const assignmentLevel = optionInteger(interaction, 'assignment_level');
  const imageUrl = optionString(interaction, 'image_url')?.trim() || null;
  const normalizedName = normalizeSearchText(name);

  if (!name || !normalizedName || !RARITY_ORDER.includes(rarity) || !Number.isInteger(questPoints) || questPoints < 0) {
    return ephemeralMessage('Please provide a valid flower name, rarity, and quest points.');
  }

  const [insertedFlower] = await sql`
    insert into flowers (name, normalized_name, rarity, quest_points, assignment_level, image_url)
    values (${name}, ${normalizedName}, ${rarity}, ${questPoints}, ${assignmentLevel ?? null}, ${imageUrl})
    on conflict (normalized_name) do nothing
    returning id
  `;

  if (!insertedFlower) {
    return ephemeralMessage(`${name} already exists and has not been added.`);
  }

  return message(`New flower added: ${name} (${rarity}, ${questPoints} pts). It is now available to log.`);
}

async function handlePinnedFlowers(interaction, sql) {
  const discordUserId = assertUser(interaction);
  if (!(await assertAdmin(sql, discordUserId))) {
    return ephemeralMessage('Only app admins can use this command.');
  }

  const rarity = optionString(interaction, 'rarity');
  const rows = rarity
    ? await sql`
        select f.name, f.rarity, f.quest_points, count(p.id)::int as pins
        from flower_pins p
        join flowers f on f.id = p.flower_id
        where f.rarity = ${rarity}
        group by f.id
        order by pins desc, f.name
      `
    : await sql`
        select f.name, f.rarity, f.quest_points, count(p.id)::int as pins
        from flower_pins p
        join flowers f on f.id = p.flower_id
        group by f.id
        order by pins desc, f.name
      `;
  const lines = rows.map((row) => `- ${flowerLabel(row)}: ${row.pins} pin${row.pins === 1 ? '' : 's'}`);

  return ephemeralMessage(truncate([`Pinned flowers (${rarityLabel(rarity)}):`, lines.join('\n') || 'No pinned flowers.'].join('\n')));
}

async function handlePinnedPlayers(interaction, sql) {
  const discordUserId = assertUser(interaction);
  if (!(await assertAdmin(sql, discordUserId))) {
    return ephemeralMessage('Only app admins can use this command.');
  }

  const rows = await sql`
    select u.discord_user_id, u.game_name, count(p.id)::int as pins
    from flower_pins p
    join app_users u on u.discord_user_id = p.discord_user_id
    group by u.discord_user_id, u.game_name
    order by pins desc, coalesce(nullif(u.game_name, ''), u.discord_user_id)
  `;
  const lines = rows.map((row) => `- ${displayNameForUser(row.discord_user_id, row)}: ${row.pins}`);

  return ephemeralMessage(truncate([`Players with pinned flowers (${rows.length}):`, lines.join('\n') || 'No pinned players.'].join('\n')));
}

async function createAdminRequest(interaction, sql, action, dmSender) {
  const requesterId = assertUser(interaction);
  const targetId = optionString(interaction, 'user');

  if (!(await assertAdmin(sql, requesterId))) {
    return ephemeralMessage('Only app admins can use this command.');
  }

  if (!targetId) {
    return ephemeralMessage('Please choose a Discord user.');
  }

  if (targetId === requesterId) {
    return ephemeralMessage(action === 'remove_admin' ? 'You cannot remove yourself as admin.' : 'You are already the requesting admin.');
  }

  await ensureUser(sql, targetId);
  const [adminCount] = await sql`select count(*)::int as count from app_users where is_admin = true`;

  if (action === 'remove_admin' && adminCount.count <= 1) {
    return ephemeralMessage('You cannot remove the only app admin.');
  }

  if (action === 'add_admin' && adminCount.count <= 1) {
    await sql`update app_users set is_admin = true where discord_user_id = ${targetId}`;
    await notifyUser(dmSender, targetId, 'You have been promoted to Serene Nursery app admin.');
    return ephemeralMessage(`Promoted <@${targetId}> to app admin.`);
  }

  const [request] = await sql`
    insert into admin_approval_requests (action, requested_by_discord_user_id, target_discord_user_id)
    values (${action}, ${requesterId}, ${targetId})
    on conflict (action, target_discord_user_id) where status = 'pending'
    do update set requested_by_discord_user_id = excluded.requested_by_discord_user_id, created_at = now()
    returning id
  `;

  const verb = action === 'add_admin' ? 'promote' : 'remove';
  await notifyOtherAdmins(
    sql,
    dmSender,
    requesterId,
    `<@${requesterId}> requested to ${verb} <@${targetId}> as a Serene Nursery app admin. Please review the approval request in Discord.`,
  );

  return message(`<@${requesterId}> requested to ${verb} <@${targetId}> as an app admin. Another app admin must approve.`, {
    components: approvalButtons(request.id),
  });
}

async function handleAddPlayerFlowers(interaction, sql) {
  const requesterId = assertUser(interaction);
  if (!(await assertAdmin(sql, requesterId))) {
    return ephemeralMessage('Only app admins can use this command.');
  }

  const targetUserId = optionString(interaction, 'user');
  const pattern = optionString(interaction, 'flower_pattern');

  if (!targetUserId) {
    return ephemeralMessage('Please choose a Discord user.');
  }

  const missingNameResponse = await requireGameName(sql, targetUserId, `<@${targetUserId}>`);
  if (missingNameResponse) {
    return missingNameResponse;
  }

  const flowers = await matchingFlowers(sql, pattern);

  if (flowers.length === 0) {
    return ephemeralMessage(`No flowers matched "${pattern}".`);
  }

  return ephemeralData({
    content: `Select flowers to add to <@${targetUserId}> from ${flowers.length} match${flowers.length === 1 ? '' : 'es'} for "${pattern}".`,
    components: selectMenu(`listall:${requesterId}:${targetUserId}`, flowers, 'Choose flowers to add'),
  });
}

async function handleListAllComponent(interaction, sql, requesterId, targetUserId) {
  const actorId = assertUser(interaction);
  if (actorId !== requesterId) {
    return ephemeralMessage('Only the user who opened this picker can use it.');
  }

  if (targetUserId !== actorId && !(await assertAdmin(sql, actorId))) {
    return ephemeralMessage('Only app admins can add flowers for another player.');
  }

  const missingNameResponse = await requireGameName(sql, targetUserId, `<@${targetUserId}>`);
  if (missingNameResponse) {
    return missingNameResponse;
  }

  const flowerIds = interaction?.data?.values ?? [];
  const count = await upsertLogs(sql, targetUserId, flowerIds, 0);
  return updateMessage({
    content: `Logged ${count} flower${count === 1 ? '' : 's'} for <@${targetUserId}>.`,
    components: [],
  });
}

async function handleAdminApprovalComponent(interaction, sql, action, requestId, dmSender) {
  const actorId = assertUser(interaction);
  if (!(await assertAdmin(sql, actorId))) {
    return ephemeralMessage('Only app admins can respond to this request.');
  }

  const [request] = await sql`
    select id, action, requested_by_discord_user_id, target_discord_user_id, status
    from admin_approval_requests
    where id::text = ${requestId}
  `;

  if (!request || request.status !== 'pending') {
    return updateMessage({ content: 'This admin request is no longer pending.', components: [] });
  }

  if (request.requested_by_discord_user_id === actorId) {
    return ephemeralMessage('Another app admin must approve or reject this request.');
  }

  if (action === 'reject') {
    await sql`
      update admin_approval_requests
      set status = 'rejected', approved_by_discord_user_id = ${actorId}, resolved_at = now()
      where id = ${request.id}
    `;
    return updateMessage({ content: `<@${actorId}> rejected the admin request for <@${request.target_discord_user_id}>.`, components: [] });
  }

  const makeAdmin = request.action === 'add_admin';
  await sql.begin(async (transaction) => {
    await transaction`
      update app_users
      set is_admin = ${makeAdmin}
      where discord_user_id = ${request.target_discord_user_id}
    `;
    await transaction`
      update admin_approval_requests
      set status = 'approved', approved_by_discord_user_id = ${actorId}, resolved_at = now()
      where id = ${request.id}
    `;
  });

  const result = makeAdmin ? 'promoted to app admin' : 'removed from app admins';
  await notifyUser(
    dmSender,
    request.target_discord_user_id,
    makeAdmin
      ? 'You have been promoted to Serene Nursery app admin.'
      : 'You have been removed from Serene Nursery app admins.',
  );

  return updateMessage({ content: `<@${request.target_discord_user_id}> was ${result} by <@${actorId}>.`, components: [] });
}

export async function handleApplicationCommand(interaction, dependencies = {}) {
  const name = interaction?.data?.name;

  if (
    ![
      'log',
      'help',
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
      'addplayerflowers',
    ].includes(name)
  ) {
    return ephemeralMessage(`Command /${name ?? 'unknown'} is not implemented yet.`);
  }

  const sql = dependencies.sql ?? getSql();
  const dmSender = dependencies.dmSender ?? sendDiscordDirectMessage;

  if (COMMANDS_REQUIRING_GAME_NAME.has(name)) {
    const missingNameResponse = await requireGameName(sql, assertUser(interaction));
    if (missingNameResponse) {
      return missingNameResponse;
    }
  }

  switch (name) {
    case 'help':
      return handleHelp(interaction, sql);
    case 'log':
      return handleList(interaction, sql);
    case 'del':
      return handleRemove(interaction, sql);
    case 'logall':
      return handleListAll(interaction, sql);
    case 'setlevel':
      return handleSetLevel(interaction, sql);
    case 'find':
      return handleFind(interaction, sql);
    case 'findpoints':
      return handleFindPoints(interaction, sql);
    case 'findrarity':
      return handleFindRarity(interaction, sql);
    case 'points':
      return handlePoints(interaction, sql);
    case 'info':
      return handleInfo(interaction, sql);
    case 'setname':
      return handleSetName(interaction, sql);
    case 'count':
      return handleCount(interaction, sql);
    case 'pin':
      return handlePin(interaction, sql);
    case 'pinned':
      return handlePinned(interaction, sql);
    case 'addflower':
      return handleAddFlower(interaction, sql);
    case 'pinned-flowers':
      return handlePinnedFlowers(interaction, sql);
    case 'pinned-players':
      return handlePinnedPlayers(interaction, sql);
    case 'addadmin':
      return createAdminRequest(interaction, sql, 'add_admin', dmSender);
    case 'removeadmin':
      return createAdminRequest(interaction, sql, 'remove_admin', dmSender);
    case 'addplayerflowers':
      return handleAddPlayerFlowers(interaction, sql);
  }
}

export async function handleMessageComponent(interaction, dependencies = {}) {
  const sql = dependencies.sql ?? getSql();
  const dmSender = dependencies.dmSender ?? sendDiscordDirectMessage;
  const customId = interaction?.data?.custom_id ?? '';
  const [kind, first, second] = customId.split(':');

  if (kind === 'listall') {
    return handleListAllComponent(interaction, sql, first, second);
  }

  if (kind === 'admin-approve') {
    return handleAdminApprovalComponent(interaction, sql, 'approve', first, dmSender);
  }

  if (kind === 'admin-reject') {
    return handleAdminApprovalComponent(interaction, sql, 'reject', first, dmSender);
  }

  return ephemeralMessage(`Component ${customId || 'unknown'} is not implemented yet.`);
}
