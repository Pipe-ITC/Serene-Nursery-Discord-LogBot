import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getSql } from '../../lib/db/client.js';
import { shouldBlockAdminSurface } from '../../lib/http/hosts.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const SESSION_COOKIE = 'sn_admin_session';
const STATE_COOKIE = 'sn_admin_state';

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  res.end(body);
}

function sendHtml(res, status, body, headers = {}) {
  send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
}

function redirect(res, location, headers = {}) {
  send(res, 302, '', { Location: location, ...headers });
}

function htmlEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function jsStringLiteral(value = '') {
  return JSON.stringify(String(value))
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function parseCookies(req) {
  const header = req.headers?.cookie ?? '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function cookie(name, value, { maxAge = 3600, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`, 'Secure'];
  if (httpOnly) {
    parts.push('HttpOnly');
  }

  return parts.join('; ');
}

function clearCookie(name) {
  return `${name}=; Path=/; SameSite=Lax; Max-Age=0; Secure; HttpOnly`;
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function verifySignature(value, signature, secret) {
  const expected = sign(value, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET is required.');
  }

  return secret;
}

export function createSession(discordUserId) {
  const payload = base64Url(JSON.stringify({ discordUserId, createdAt: Date.now() }));
  return `${payload}.${sign(payload, sessionSecret())}`;
}

function readSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || !token.includes('.')) {
    return undefined;
  }

  const [payload, signature] = token.split('.');
  if (!verifySignature(payload, signature, sessionSecret())) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function adminBaseUrl(req) {
  if (process.env.ADMIN_BASE_URL) {
    return process.env.ADMIN_BASE_URL.replace(/\/$/, '');
  }

  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  return `https://${Array.isArray(host) ? host[0] : host}`;
}

function discordRedirectUri(req) {
  return `${adminBaseUrl(req)}/auth/callback`;
}

function requireOAuthConfig() {
  for (const key of ['DISCORD_APPLICATION_ID', 'DISCORD_CLIENT_SECRET', 'ADMIN_SESSION_SECRET']) {
    if (!process.env[key]) {
      throw new Error(`${key} is required.`);
    }
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function formData(req) {
  return new URLSearchParams(await readBody(req));
}

async function currentAdmin(req, sql) {
  const session = readSession(req);
  if (!session?.discordUserId) {
    return undefined;
  }

  const [user] = await sql`
    select discord_user_id, game_name, is_admin
    from app_users
    where discord_user_id = ${session.discordUserId}
    limit 1
  `;

  return user?.is_admin ? user : undefined;
}

function routePath(req) {
  const pathname = new URL(req.url, 'https://admin.serenenursery.pipeitc.dev').pathname;
  return pathname.replace(/^\/api\/admin\/?/, '/') || '/dashboard';
}

function layout({ title, admin, body, notice }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)} - Serene Nursery Admin</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #15171f; color: #f3f4f6; }
    body { margin: 0; background: #15171f; }
    header { border-bottom: 1px solid #303442; background: #1f2230; }
    nav { max-width: 1120px; margin: 0 auto; padding: 16px 20px; display: flex; gap: 16px; align-items: center; justify-content: space-between; }
    nav a { color: #dbeafe; text-decoration: none; font-weight: 650; }
    nav .links { display: flex; gap: 14px; align-items: center; }
    main { max-width: 1120px; margin: 0 auto; padding: 24px 20px 48px; }
    h1 { margin: 0 0 20px; font-size: 28px; }
    h2 { margin-top: 28px; font-size: 20px; }
    .panel { border: 1px solid #303442; background: #202331; border-radius: 8px; padding: 18px; margin-bottom: 18px; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .stats { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom: 18px; }
    .stat { border: 1px solid #303442; background: #181b27; border-radius: 8px; padding: 14px; }
    .stat strong { display: block; margin-top: 6px; font-size: 26px; color: #f9fafb; }
    .split { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .list { margin: 0; padding-left: 20px; }
    .list li { margin: 8px 0; }
    label { display: grid; gap: 6px; color: #cbd5e1; font-size: 14px; }
    input, select { box-sizing: border-box; width: 100%; border: 1px solid #4b5563; background: #111827; color: #f9fafb; border-radius: 6px; padding: 10px 11px; font: inherit; }
    button, .button { border: 0; background: #ff66c4; color: #111827; padding: 10px 14px; border-radius: 6px; font: inherit; font-weight: 750; cursor: pointer; text-decoration: none; display: inline-block; }
    button.secondary, .button.secondary { background: #374151; color: #f9fafb; }
    button.danger { background: #f97373; color: #111827; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #303442; text-align: left; vertical-align: middle; }
    th { color: #cbd5e1; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .notice { border-left: 4px solid #ff66c4; background: #2a2233; padding: 12px 14px; border-radius: 6px; margin-bottom: 18px; }
    .muted { color: #9ca3af; }
  </style>
</head>
<body>
  <header>
    <nav>
      <a href="/">Serene Nursery Admin</a>
      <span class="links">
        <a href="/cozy-players">Cozy Players</a>
        <a href="/discord-users">Discord Users</a>
        ${admin ? `<span class="muted">${htmlEscape(admin.game_name || admin.discord_user_id)}</span><a href="/logout">Logout</a>` : ''}
      </span>
    </nav>
  </header>
  <main>
    ${notice ? `<div class="notice">${htmlEscape(notice)}</div>` : ''}
    ${body}
  </main>
</body>
</html>`;
}

function loginPage() {
  return layout({
    title: 'Login',
    body: `<h1>Admin Login</h1>
<section class="panel">
  <p>Sign in with Discord to access Serene Nursery admin tools.</p>
  <a class="button" href="/login">Sign in with Discord</a>
</section>`,
  });
}

function statCard(label, value) {
  return `<div class="stat"><span class="muted">${htmlEscape(label)}</span><strong>${htmlEscape(value)}</strong></div>`;
}

function dashboardFlowerLine(row) {
  return `${htmlEscape(row.name)} <span class="muted">(${htmlEscape(row.rarity)})</span> <strong>${row.count}</strong>`;
}

function dashboardUserName(user) {
  const name = user.game_name || user.discord_user_id;
  return user.discord_user_id?.startsWith('cozy:') ? `${name} (Cozy Player)` : name;
}

function dashboardList(items, formatter, emptyText) {
  if (items.length === 0) {
    return `<p class="muted">${htmlEscape(emptyText)}</p>`;
  }

  return `<ol class="list">${items.map((item) => `<li>${formatter(item)}</li>`).join('')}</ol>`;
}

function formatDashboardDate(value) {
  if (!value) {
    return 'Unknown time';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
}

function dashboardPage(admin, stats) {
  const donePercent = stats.summary.active_players > 0
    ? Math.round((stats.summary.done_count / stats.summary.active_players) * 100)
    : 0;

  return layout({
    title: 'Dashboard',
    admin,
    body: `<h1>Dashboard</h1>
<section class="panel">
  <h2>Player Summary</h2>
  <div class="stats">
    ${statCard('Discord players', stats.summary.discord_players)}
    ${statCard('Cozy players', stats.summary.cozy_players)}
    ${statCard('Active logged players', stats.summary.active_players)}
  </div>
</section>

<section class="panel">
  <h2>Flower Summary</h2>
  <div class="stats">
    ${statCard('Flowers in database', stats.summary.total_flowers)}
    ${statCard('Unowned flowers', stats.summary.unowned_flowers)}
    ${statCard('Logged flower entries', stats.summary.total_logs)}
    ${statCard('Pinned flowers', stats.summary.total_pins)}
  </div>
</section>

<section class="panel">
  <h2>Weekly Status</h2>
  <div class="stats">
    ${statCard('Players marked done', stats.summary.done_count)}
    ${statCard('Active players done', `${donePercent}%`)}
  </div>
</section>

<section class="split">
  <div class="panel">
    <h2>Most Pinned Flowers</h2>
    ${dashboardList(stats.mostPinned, dashboardFlowerLine, 'No pinned flowers yet.')}
  </div>
  <div class="panel">
    <h2>Most Owned Flowers</h2>
    ${dashboardList(stats.mostOwned, dashboardFlowerLine, 'No logged flowers yet.')}
  </div>
  <div class="panel">
    <h2>Least Owned Flowers</h2>
    ${dashboardList(stats.leastOwned, dashboardFlowerLine, 'No flowers found.')}
  </div>
  <div class="panel">
    <h2>Top Collectors</h2>
    ${dashboardList(
      stats.topCollectors,
      (row) => `${htmlEscape(dashboardUserName(row))} <strong>${row.count}</strong>`,
      'No collectors yet.',
    )}
  </div>
</section>

<section class="panel">
  <h2>Recent Activity</h2>
  ${stats.recentLogs.length ? `<table>
    <thead><tr><th>Player</th><th>Flower</th><th>Points</th><th>Logged</th></tr></thead>
    <tbody>
      ${stats.recentLogs.map((row) => `<tr>
        <td>${htmlEscape(dashboardUserName(row))}</td>
        <td>${htmlEscape(row.name)} <span class="muted">(${htmlEscape(row.rarity)})</span></td>
        <td>${Number(row.quest_points) + Number(row.extra_points ?? 0)}${Number(row.extra_points ?? 0) > 0 ? ` (+${row.extra_points})` : ''}</td>
        <td>${htmlEscape(formatDashboardDate(row.logged_at))}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<p class="muted">No recent logs yet.</p>'}
</section>

<section class="panel">
  <h2>Admin Tools</h2>
  <p class="muted">Choose an admin area.</p>
  <a class="button" href="/cozy-players">Manage Cozy Players</a>
  <a class="button secondary" href="/discord-users">Manage Discord Users</a>
</section>`,
  });
}

function playerOptions(players, selectedPlayerId) {
  const placeholder = `<option value="" disabled${selectedPlayerId ? '' : ' selected'}>Select player</option>`;
  return placeholder + players
    .map((player) => `<option value="${htmlEscape(player.discord_user_id)}"${player.discord_user_id === selectedPlayerId ? ' selected' : ''}>${htmlEscape(player.game_name)}</option>`)
    .join('');
}

function flowerOptions(flowers) {
  return '<option value="" disabled selected>Select flower</option>' + flowers
    .map((flower) => `<option value="${htmlEscape(flower.id)}">${htmlEscape(flower.name)} (${htmlEscape(flower.rarity)}, ${flower.quest_points} pts)</option>`)
    .join('');
}

function userManagementPage({ admin, title, path, players, flowers, selectedPlayerId, loggedFlowers, notice, allowCreate = false }) {
  const selectedPlayer = players.find((player) => player.discord_user_id === selectedPlayerId);
  const deleteConfirmation = selectedPlayer
    ? `Delete player ${selectedPlayer.game_name}?\n\nThis will remove their player record, logged flowers, and pins.`
    : '';
  const playerSelect = players.length
    ? `<select name="player_id" required>${playerOptions(players, selectedPlayerId)}</select>`
    : `<p class="muted">${allowCreate ? 'Create a Cozy player first.' : 'No eligible Discord users found.'}</p>`;
  const createSection = allowCreate
    ? `<section class="panel">
  <h2>Create Player</h2>
  <form method="post" action="${path}">
    <input type="hidden" name="action" value="create_player">
    <div class="grid">
      <label>Game name<input name="game_name" maxlength="80" required></label>
    </div>
    <p><button type="submit">Create Player</button></p>
  </form>
</section>`
    : '';

  return layout({
    title,
    admin,
    notice,
    body: `<h1>${htmlEscape(title)}</h1>
${createSection}

<section class="panel">
  <h2>Log Flower</h2>
  <form method="post" action="${path}">
    <input type="hidden" name="action" value="log_flower">
    <div class="grid">
      <label>Player${playerSelect}</label>
      <label>Flower<select name="flower_id" required>${flowerOptions(flowers)}</select></label>
      <label>Extra points<input name="extra_points" type="number" min="0" max="4" step="1" value="0"></label>
    </div>
    <p><button type="submit"${players.length ? '' : ' disabled'}>Log Flower</button></p>
  </form>
</section>

<section class="panel">
  <h2>Player Collection</h2>
  <form method="get" action="${path}" class="grid">
    <label>Player${playerSelect.replace('name="player_id"', 'name="player_id"')}</label>
    <p><button class="secondary" type="submit"${players.length ? '' : ' disabled'}>View Player</button></p>
  </form>
  ${selectedPlayer ? `<h2>${htmlEscape(selectedPlayer.game_name)}</h2>
  <form method="post" action="${path}" onsubmit="return confirm(${htmlEscape(jsStringLiteral(deleteConfirmation))})">
    <input type="hidden" name="action" value="delete_player">
    <input type="hidden" name="player_id" value="${htmlEscape(selectedPlayerId)}">
    <p><button class="danger" type="submit">Delete Player</button></p>
  </form>` : ''}
  ${loggedFlowers.length ? `<table>
    <thead><tr><th>Flower</th><th>Rarity</th><th>Points</th><th>Pinned</th><th>Actions</th></tr></thead>
    <tbody>
      ${loggedFlowers.map((row) => `<tr>
        <td>${htmlEscape(row.name)}</td>
        <td>${htmlEscape(row.rarity)}</td>
        <td>${Number(row.quest_points) + Number(row.extra_points ?? 0)}${Number(row.extra_points ?? 0) > 0 ? ` (+${row.extra_points})` : ''}</td>
        <td>${row.is_pinned ? 'Yes' : 'No'}</td>
        <td class="actions">
          <form method="post" action="${path}">
            <input type="hidden" name="action" value="toggle_pin">
            <input type="hidden" name="player_id" value="${htmlEscape(selectedPlayerId)}">
            <input type="hidden" name="flower_id" value="${htmlEscape(row.id)}">
            <button class="secondary" type="submit">${row.is_pinned ? 'Unpin' : 'Pin'}</button>
          </form>
          <form method="post" action="${path}">
            <input type="hidden" name="action" value="delete_flower">
            <input type="hidden" name="player_id" value="${htmlEscape(selectedPlayerId)}">
            <input type="hidden" name="flower_id" value="${htmlEscape(row.id)}">
            <button class="danger" type="submit">Delete</button>
          </form>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<p class="muted">No logged flowers for this player.</p>'}
</section>`,
  });
}

async function fetchDiscordUser({ code, req, fetchImpl = fetch }) {
  const tokenResponse = await fetchImpl(`${DISCORD_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_APPLICATION_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: discordRedirectUri(req),
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Discord token exchange failed.');
  }

  const token = await tokenResponse.json();
  const userResponse = await fetchImpl(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  if (!userResponse.ok) {
    throw new Error('Discord user lookup failed.');
  }

  return userResponse.json();
}

async function loadCozyPageData(sql, selectedPlayerId) {
  const players = await sql`
    select discord_user_id, game_name
    from app_users
    where discord_user_id like 'cozy:%'
    order by lower(game_name), game_name
  `;
  const flowers = await sql`
    select id, name, rarity, quest_points
    from flowers
    order by name
  `;
  const playerId = players.some((player) => player.discord_user_id === selectedPlayerId) ? selectedPlayerId : undefined;
  const loggedFlowers = playerId
    ? await sql`
        select f.id, f.name, f.rarity, f.quest_points, l.extra_points, (p.id is not null) as is_pinned
        from flower_logs l
        join flowers f on f.id = l.flower_id
        left join flower_pins p on p.discord_user_id = l.discord_user_id and p.flower_id = l.flower_id
        where l.discord_user_id = ${playerId}
        order by f.name
      `
    : [];

  return { players, flowers, selectedPlayerId: playerId, loggedFlowers };
}

async function loadDiscordPageData(sql, selectedPlayerId) {
  const players = await sql`
    select discord_user_id, coalesce(nullif(game_name, ''), discord_user_id) as game_name
    from app_users
    where discord_user_id not like 'cozy:%'
    order by lower(coalesce(nullif(game_name, ''), discord_user_id)), discord_user_id
  `;
  const flowers = await sql`
    select id, name, rarity, quest_points
    from flowers
    order by name
  `;
  const playerId = players.some((player) => player.discord_user_id === selectedPlayerId) ? selectedPlayerId : undefined;
  const loggedFlowers = playerId
    ? await sql`
        select f.id, f.name, f.rarity, f.quest_points, l.extra_points, (p.id is not null) as is_pinned
        from flower_logs l
        join flowers f on f.id = l.flower_id
        left join flower_pins p on p.discord_user_id = l.discord_user_id and p.flower_id = l.flower_id
        where l.discord_user_id = ${playerId}
        order by f.name
      `
    : [];

  return { players, flowers, selectedPlayerId: playerId, loggedFlowers };
}

async function loadDashboardStats(sql) {
  const [summary = {}] = await sql`
    select
      (select count(*)::int from app_users where discord_user_id not like 'cozy:%') as discord_players,
      (select count(*)::int from app_users where discord_user_id like 'cozy:%') as cozy_players,
      (select count(distinct discord_user_id)::int from flower_logs) as active_players,
      (select count(*)::int from flowers) as total_flowers,
      (
        select count(*)::int
        from flowers f
        where not exists (
          select 1
          from flower_logs l
          where l.flower_id = f.id
        )
      ) as unowned_flowers,
      (select count(*)::int from flower_logs) as total_logs,
      (select count(*)::int from flower_pins) as total_pins,
      (select count(*)::int from weekly_done_users) as done_count
  `;
  const mostPinned = await sql`
    select f.name, f.rarity, count(*)::int as count
    from flower_pins p
    join flowers f on f.id = p.flower_id
    group by f.id, f.name, f.rarity
    order by count desc, f.name
    limit 5
  `;
  const mostOwned = await sql`
    select f.name, f.rarity, count(*)::int as count
    from flower_logs l
    join flowers f on f.id = l.flower_id
    group by f.id, f.name, f.rarity
    order by count desc, f.name
    limit 5
  `;
  const leastOwned = await sql`
    select f.name, f.rarity, count(l.flower_id)::int as count
    from flowers f
    left join flower_logs l on l.flower_id = f.id
    group by f.id, f.name, f.rarity
    order by count asc, f.name
    limit 5
  `;
  const topCollectors = await sql`
    select u.discord_user_id, coalesce(nullif(u.game_name, ''), u.discord_user_id) as game_name, count(*)::int as count
    from flower_logs l
    join app_users u on u.discord_user_id = l.discord_user_id
    group by u.discord_user_id, u.game_name
    order by count desc, lower(coalesce(nullif(u.game_name, ''), u.discord_user_id))
    limit 5
  `;
  const recentLogs = await sql`
    select
      u.discord_user_id,
      coalesce(nullif(u.game_name, ''), u.discord_user_id) as game_name,
      f.name,
      f.rarity,
      f.quest_points,
      l.extra_points,
      l.logged_at
    from flower_logs l
    join app_users u on u.discord_user_id = l.discord_user_id
    join flowers f on f.id = l.flower_id
    order by l.logged_at desc
    limit 10
  `;

  return {
    summary: {
      discord_players: summary.discord_players ?? 0,
      cozy_players: summary.cozy_players ?? 0,
      active_players: summary.active_players ?? 0,
      total_flowers: summary.total_flowers ?? 0,
      unowned_flowers: summary.unowned_flowers ?? 0,
      total_logs: summary.total_logs ?? 0,
      total_pins: summary.total_pins ?? 0,
      done_count: summary.done_count ?? 0,
    },
    mostPinned,
    mostOwned,
    leastOwned,
    topCollectors,
    recentLogs,
  };
}

async function createPlayer(sql, form) {
  const gameName = form.get('game_name')?.trim();
  if (!gameName) {
    return 'Please enter a player game name.';
  }

  const [existing] = await sql`
    select discord_user_id
    from app_users
    where discord_user_id like 'cozy:%'
      and lower(game_name) = lower(${gameName})
    limit 1
  `;
  if (existing) {
    return `${gameName} already exists.`;
  }

  await sql`
    insert into app_users (discord_user_id, game_name)
    values (${`cozy:${randomUUID()}`}, ${gameName})
  `;
  return `${gameName} was created.`;
}

function validExtraPoints(value) {
  const points = Number(value || 0);
  return Number.isInteger(points) && (points === 0 || [1, 2, 3, 4].includes(points)) ? points : undefined;
}

async function assertManagedPlayer(sql, playerId, playerType) {
  if (playerType === 'cozy' && !playerId?.startsWith('cozy:')) {
    return undefined;
  }

  if (playerType === 'discord' && (!playerId || playerId.startsWith('cozy:'))) {
    return undefined;
  }

  const [player] = playerType === 'cozy'
    ? await sql`
        select discord_user_id, game_name
        from app_users
        where discord_user_id = ${playerId}
          and discord_user_id like 'cozy:%'
        limit 1
      `
    : await sql`
        select discord_user_id, coalesce(nullif(game_name, ''), discord_user_id) as game_name
        from app_users
        where discord_user_id = ${playerId}
          and discord_user_id not like 'cozy:%'
        limit 1
      `;
  return player;
}

async function logFlower(sql, form, playerType) {
  const playerId = form.get('player_id');
  const flowerId = form.get('flower_id');
  const extraPoints = validExtraPoints(form.get('extra_points'));
  if (extraPoints === undefined) {
    return 'Extra points must be 0, 1, 2, 3, or 4.';
  }

  const player = await assertManagedPlayer(sql, playerId, playerType);
  if (!player) {
    return playerType === 'cozy' ? 'Please choose a valid Cozy player.' : 'Please choose a valid Discord user.';
  }

  const [flower] = await sql`select id, name from flowers where id = ${flowerId} limit 1`;
  if (!flower) {
    return 'Please choose a valid flower.';
  }

  const [existing] = await sql`
    select 1
    from flower_logs
    where discord_user_id = ${playerId}
      and flower_id = ${flowerId}
    limit 1
  `;
  if (existing) {
    return `${player.game_name} has already logged ${flower.name}.`;
  }

  await sql`
    insert into flower_logs (discord_user_id, flower_id, extra_points, logged_at)
    values (${playerId}, ${flowerId}, ${extraPoints}, now())
  `;
  return `Logged ${flower.name} for ${player.game_name}.`;
}

async function deleteFlower(sql, form, playerType) {
  const playerId = form.get('player_id');
  const flowerId = form.get('flower_id');
  const player = await assertManagedPlayer(sql, playerId, playerType);
  if (!player) {
    return playerType === 'cozy' ? 'Please choose a valid Cozy player.' : 'Please choose a valid Discord user.';
  }

  await sql`
    delete from flower_logs
    where discord_user_id = ${playerId}
      and flower_id = ${flowerId}
  `;
  return 'Flower log removed.';
}

async function togglePin(sql, form, playerType) {
  const playerId = form.get('player_id');
  const flowerId = form.get('flower_id');
  const player = await assertManagedPlayer(sql, playerId, playerType);
  if (!player) {
    return playerType === 'cozy' ? 'Please choose a valid Cozy player.' : 'Please choose a valid Discord user.';
  }

  const [logged] = await sql`
    select 1
    from flower_logs
    where discord_user_id = ${playerId}
      and flower_id = ${flowerId}
    limit 1
  `;
  if (!logged) {
    return 'A flower must be logged before it can be pinned.';
  }

  const removed = await sql`
    delete from flower_pins
    where discord_user_id = ${playerId}
      and flower_id = ${flowerId}
  `;
  if (removed.count > 0) {
    return 'Flower unpinned.';
  }

  await sql`
    insert into flower_pins (discord_user_id, flower_id)
    values (${playerId}, ${flowerId})
  `;
  return 'Flower pinned.';
}

async function deletePlayer(sql, form, playerType) {
  const playerId = form.get('player_id');
  const player = await assertManagedPlayer(sql, playerId, playerType);
  if (!player) {
    return playerType === 'cozy' ? 'Please choose a valid Cozy player.' : 'Please choose a valid Discord user.';
  }

  const [details] = await sql`
    select
      is_admin,
      (select count(*)::int from flower_logs where discord_user_id = ${playerId}) as logged_flowers,
      (select count(*)::int from flower_pins where discord_user_id = ${playerId}) as pins
    from app_users
    where discord_user_id = ${playerId}
    limit 1
  `;

  if (details?.is_admin) {
    return 'App admins cannot be removed from the dashboard. Use /removeadmin first.';
  }

  await sql`delete from app_users where discord_user_id = ${playerId}`;

  return `Removed ${player.game_name}. Deleted ${details?.logged_flowers ?? 0} logged flower${details?.logged_flowers === 1 ? '' : 's'} and ${details?.pins ?? 0} pin${details?.pins === 1 ? '' : 's'}.`;
}

async function handlePlayerPost(req, sql, playerType) {
  const form = await formData(req);
  const action = form.get('action');
  const selectedPlayerId = form.get('player_id') || undefined;
  let notice;
  if (playerType === 'cozy' && action === 'create_player') {
    notice = await createPlayer(sql, form);
    return { notice };
  }
  if (action === 'log_flower') {
    notice = await logFlower(sql, form, playerType);
    return { notice, selectedPlayerId };
  }
  if (action === 'delete_flower') {
    notice = await deleteFlower(sql, form, playerType);
    return { notice, selectedPlayerId };
  }
  if (action === 'toggle_pin') {
    notice = await togglePin(sql, form, playerType);
    return { notice, selectedPlayerId };
  }
  if (action === 'delete_player') {
    notice = await deletePlayer(sql, form, playerType);
    return { notice };
  }

  return { notice: 'Unknown action.' };
}

export function createAdminHandler({ sqlFactory = getSql, fetchImpl = fetch } = {}) {
  return async function adminHandler(req, res) {
    try {
      if (shouldBlockAdminSurface(req)) {
        send(res, 404, JSON.stringify({ error: 'Not found' }), { 'Content-Type': 'application/json; charset=utf-8' });
        return;
      }

      const path = routePath(req);

      if (path === '/login') {
        requireOAuthConfig();
        const state = randomBytes(24).toString('base64url');
        const loginUrl = new URL(`${DISCORD_API_BASE}/oauth2/authorize`);
        loginUrl.searchParams.set('client_id', process.env.DISCORD_APPLICATION_ID);
        loginUrl.searchParams.set('redirect_uri', discordRedirectUri(req));
        loginUrl.searchParams.set('response_type', 'code');
        loginUrl.searchParams.set('scope', 'identify');
        loginUrl.searchParams.set('state', state);
        redirect(res, loginUrl.toString(), { 'Set-Cookie': cookie(STATE_COOKIE, state, { maxAge: 600 }) });
        return;
      }

      if (path === '/auth/callback') {
        requireOAuthConfig();
        const url = new URL(req.url, adminBaseUrl(req));
        const cookies = parseCookies(req);
        if (!url.searchParams.get('code') || url.searchParams.get('state') !== cookies[STATE_COOKIE]) {
          sendHtml(res, 400, 'Invalid OAuth callback.');
          return;
        }

        const discordUser = await fetchDiscordUser({ code: url.searchParams.get('code'), req, fetchImpl });
        const sql = sqlFactory();
        const [admin] = await sql`
          select discord_user_id
          from app_users
          where discord_user_id = ${discordUser.id}
            and is_admin = true
          limit 1
        `;
        if (!admin) {
          sendHtml(res, 403, 'You are not a Serene Nursery app admin.');
          return;
        }

        redirect(res, '/', {
          'Set-Cookie': [
            cookie(SESSION_COOKIE, createSession(discordUser.id), { maxAge: 60 * 60 * 24 * 7 }),
            clearCookie(STATE_COOKIE),
          ],
        });
        return;
      }

      if (path === '/logout') {
        redirect(res, '/login', { 'Set-Cookie': clearCookie(SESSION_COOKIE) });
        return;
      }

      const sql = sqlFactory();
      const admin = await currentAdmin(req, sql);
      if (!admin) {
        if (req.method === 'GET') {
          sendHtml(res, 200, loginPage());
          return;
        }
        sendHtml(res, 403, 'You are not signed in as an app admin.');
        return;
      }

      if ((path === '/' || path === '/dashboard') && req.method === 'GET') {
        sendHtml(res, 200, dashboardPage(admin, await loadDashboardStats(sql)));
        return;
      }

      if (path === '/cozy-players') {
        let notice = new URL(req.url, adminBaseUrl(req)).searchParams.get('notice');
        let selectedPlayerId = new URL(req.url, adminBaseUrl(req)).searchParams.get('player_id');
        if (req.method === 'POST') {
          const result = await handlePlayerPost(req, sql, 'cozy');
          notice = result.notice;
          selectedPlayerId = result.selectedPlayerId;
        } else if (req.method !== 'GET') {
          send(res, 405, 'Method not allowed', { Allow: 'GET, POST' });
          return;
        }

        const data = await loadCozyPageData(sql, selectedPlayerId);
        sendHtml(res, 200, userManagementPage({ admin, title: 'Cozy Players', path: '/cozy-players', notice, allowCreate: true, ...data }));
        return;
      }

      if (path === '/discord-users') {
        let notice = new URL(req.url, adminBaseUrl(req)).searchParams.get('notice');
        let selectedPlayerId = new URL(req.url, adminBaseUrl(req)).searchParams.get('player_id');
        if (req.method === 'POST') {
          const result = await handlePlayerPost(req, sql, 'discord');
          notice = result.notice;
          selectedPlayerId = result.selectedPlayerId;
        } else if (req.method !== 'GET') {
          send(res, 405, 'Method not allowed', { Allow: 'GET, POST' });
          return;
        }

        const data = await loadDiscordPageData(sql, selectedPlayerId);
        sendHtml(res, 200, userManagementPage({ admin, title: 'Manage Discord Users', path: '/discord-users', notice, allowCreate: false, ...data }));
        return;
      }

      sendHtml(res, 404, 'Not found.');
    } catch (error) {
      console.error('Admin handler failed', error);
      sendHtml(res, 500, 'Admin handler failed.');
    }
  };
}

export default createAdminHandler();
