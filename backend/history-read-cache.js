import { createHash } from 'node:crypto';
// Recheck the newest page on every refresh. Reuse older pages only when that
// page is byte-for-byte unchanged, with a full audit at least every five minutes.
export function createHistoryReadCache({ now = Date.now, auditMs = 300_000 } = {}) {
  const saved = new Map();
  return {
    clear() { saved.clear(); },
    inspect(key, page) {
      const signature = createHash('sha256').update(JSON.stringify(page)).digest('hex');
      const old = saved.get(key);
      return { signature, hit: Boolean(old && old.signature === signature && now() - old.at < auditMs), value: old?.value };
    },
    store(key, signature, value) { saved.set(key, { signature, value, at: now() }); },
    oldestFullReadAt() { return saved.size ? new Date(Math.min(...[...saved.values()].map(entry => entry.at))).toISOString() : null; }
  };
}
