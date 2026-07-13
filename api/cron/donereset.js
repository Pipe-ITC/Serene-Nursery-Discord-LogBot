import { getSql } from '../../lib/db/client.js';
import { resetWeeklyDoneUsers } from '../../lib/weekly-done.js';

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function createDoneResetCron({ sqlFactory = getSql } = {}) {
  return async function doneResetCron(req, res) {
    try {
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      const cronSecret = process.env.CRON_SECRET;
      const authorization = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
      if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      const result = await resetWeeklyDoneUsers(sqlFactory());
      sendJson(res, 200, { ok: true, cleared: result.count });
    } catch (error) {
      console.error('Weekly done reset cron failed', error);
      sendJson(res, 500, { error: 'Weekly done reset cron failed' });
    }
  };
}

export default createDoneResetCron();
