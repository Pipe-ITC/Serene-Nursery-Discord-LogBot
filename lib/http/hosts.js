const DEFAULT_ADMIN_HOST = 'admin.serenenursery.pipeitc.dev';
const DEFAULT_BOT_HOST = 'bot.serenenursery.pipeitc.dev';

export function requestHost(req) {
  const rawHost = req.headers?.['x-forwarded-host'] ?? req.headers?.host ?? '';
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  return host.split(':')[0].toLowerCase();
}

export function adminHost() {
  return (process.env.ADMIN_HOST ?? DEFAULT_ADMIN_HOST).toLowerCase();
}

export function botHost() {
  return (process.env.BOT_HOST ?? DEFAULT_BOT_HOST).toLowerCase();
}

export function isLocalHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '';
}

export function isAdminHost(req) {
  return requestHost(req) === adminHost();
}

export function isBotHost(req) {
  return requestHost(req) === botHost();
}

export function shouldBlockAdminSurface(req) {
  const host = requestHost(req);
  return !isLocalHost(host) && host !== adminHost();
}

export function shouldBlockBotSurface(req) {
  return isAdminHost(req);
}
