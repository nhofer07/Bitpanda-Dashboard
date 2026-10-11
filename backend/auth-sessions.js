import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const TTL = 30 * 24 * 60 * 60 * 1000;
const RENEW_INTERVAL = 15 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');

// Persist hashes of bearer tokens, never passwords or usable session cookies.
// Bind sessions to the configured account so changing credentials revokes them.
export async function openAuthSessions({ file, account, now = Date.now, onError = () => {} }) {
  let accountId = account();
  const sessions = new Map();
  let pending = Promise.resolve();
  try {
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    if (saved.version === 1 && saved.account === accountId) {
      for (const item of saved.sessions || []) {
        if (/^[a-f0-9]{64}$/.test(item.tokenHash) && Number.isFinite(item.expiresAt) && item.expiresAt > now()) {
          sessions.set(item.tokenHash, { expiresAt: item.expiresAt, renewedAt: now() });
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') onError(error);
  }
  function syncAccount() {
    const current = account();
    if (current !== accountId) { accountId = current; sessions.clear(); }
  }
  function persist() {
    pending = pending.catch(() => {}).then(async () => {
      const records = [...sessions].filter(([, value]) => value.expiresAt > now()).map(([tokenHash, value]) => ({ tokenHash, expiresAt: value.expiresAt }));
      const body = JSON.stringify({ version: 1, account: accountId, sessions: records });
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.tmp-${process.pid}`;
      await fs.writeFile(temporary, body, { mode: 0o600 });
      await fs.rename(temporary, file);
    });
    return pending;
  }
  return {
    async create() {
      syncAccount();
      const token = randomBytes(32).toString('base64url');
      const hash = digest(token);
      sessions.set(hash, { expiresAt: now() + TTL, renewedAt: now() });
      try { await persist(); } catch (error) { sessions.delete(hash); throw error; }
      return token;
    },
    authenticated(token) {
      syncAccount();
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
      const session = sessions.get(digest(token));
      if (!session || session.expiresAt <= now()) return false;
      if (now() - session.renewedAt >= RENEW_INTERVAL) {
        session.expiresAt = now() + TTL;
        session.renewedAt = now();
        void persist().catch(onError);
      }
      return true;
    },
    async revoke(token) {
      syncAccount();
      if (typeof token === 'string') sessions.delete(digest(token));
      await persist();
    },
    async flush() { await pending; }
  };
}
