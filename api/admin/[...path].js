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

function dashboardPage(admin) {
  return layout({
    title: 'Dashboard',
    admin,
    body: `<h1>Dashboard</h1>
<section class="panel">
  <h2>Admin Tools</h2>
  <p class="muted">Choose an admin area.</p>
  <a class="button" href="/cozy-players">Manage Cozy Players</a>
  <a class="button secondary" href="/discord-users">Manage Discord Users</a>
</section>`,
  });
}

function playerOptions(players, selectedPlayerId) {
  return players
    .map((player) => `<option value="${htmlEscape(player.discord_user_id)}"${player.discord_user_id === selectedPlayerId ? ' selected' : ''}>${htmlEscape(player.game_name)}</option>`)
    .join('');
}

function flowerOptions(flowers) {
  return flowers
    .map((flower) => `<option value="${htmlEscape(flower.id)}">${htmlEscape(flower.name)} (${htmlEscape(flower.rarity)}, ${flower.quest_points} pts)</option>`)
    .join('');
}

function userManagementPage({ admin, title, path, players, flowers, selectedPlayerId, loggedFlowers, notice, allowCreate = false }) {
  const selectedPlayer = players.find((player) => player.discord_user_id === selectedPlayerId);
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
  <form method="post" action="${path}">
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
  const playerId = selectedPlayerId || players[0]?.discord_user_id;
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
  const playerId = selectedPlayerId || players[0]?.discord_user_id;
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
  if (playerType === 'cozy' && action === 'create_player') {
    return createPlayer(sql, form);
  }
  if (action === 'log_flower') {
    return logFlower(sql, form, playerType);
  }
  if (action === 'delete_flower') {
    return deleteFlower(sql, form, playerType);
  }
  if (action === 'toggle_pin') {
    return togglePin(sql, form, playerType);
  }
  if (action === 'delete_player') {
    return deletePlayer(sql, form, playerType);
  }

  return 'Unknown action.';
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
        sendHtml(res, 200, dashboardPage(admin));
        return;
      }

      if (path === '/cozy-players') {
        let notice = new URL(req.url, adminBaseUrl(req)).searchParams.get('notice');
        if (req.method === 'POST') {
          notice = await handlePlayerPost(req, sql, 'cozy');
        } else if (req.method !== 'GET') {
          send(res, 405, 'Method not allowed', { Allow: 'GET, POST' });
          return;
        }

        const selectedPlayerId = req.method === 'POST'
          ? undefined
          : new URL(req.url, adminBaseUrl(req)).searchParams.get('player_id');
        const data = await loadCozyPageData(sql, selectedPlayerId);
        sendHtml(res, 200, userManagementPage({ admin, title: 'Cozy Players', path: '/cozy-players', notice, allowCreate: true, ...data }));
        return;
      }

      if (path === '/discord-users') {
        let notice = new URL(req.url, adminBaseUrl(req)).searchParams.get('notice');
        if (req.method === 'POST') {
          notice = await handlePlayerPost(req, sql, 'discord');
        } else if (req.method !== 'GET') {
          send(res, 405, 'Method not allowed', { Allow: 'GET, POST' });
          return;
        }

        const selectedPlayerId = req.method === 'POST'
          ? undefined
          : new URL(req.url, adminBaseUrl(req)).searchParams.get('player_id');
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
