const KEY = 'bitpanda-dashboard-cashflow-sync';
const LEGACY_KEY = 'bitpanda-dashboard-cashflow-overrides';

export function createCashflowSync({ storage, request, onChange }) {
  let state;
  try { state = JSON.parse(storage.getItem(KEY) || 'null'); } catch { /* Storage is optional. */ }
  state = { overrides: state?.overrides || {}, pending: state?.pending || {} };
  // Old browser values are never automatically sent back to the server.
  if (!Object.keys(state.overrides).length) {
    try { state.overrides = JSON.parse(storage.getItem(LEGACY_KEY) || '{}'); } catch { /* Ignore invalid old preferences. */ }
  }
  let queue = Promise.resolve();
  function publish() {
    let persisted = true;
    try { storage.setItem(KEY, JSON.stringify(state)); storage.setItem(LEGACY_KEY, JSON.stringify(state.overrides)); } catch { persisted = false; }
    onChange({ ...state.overrides });
    return persisted;
  }
  function enqueue(fn) {
    const next = queue.then(fn);
    queue = next.catch(() => {});
    return next;
  }
  async function sendPending() {
    if (!Object.keys(state.pending).length) return;
    try {
      const result = await request('PUT', { changes: state.pending });
      state = { overrides: result.overrides, pending: {} };
      publish();
    } catch (error) {
      if (error.status === 409 && error.state) {
        // Keep the server version for conflicting entries; preserve other offline edits.
        const remaining = Object.fromEntries(Object.entries(state.pending).filter(([id, change]) => {
          const current = error.state.overrides[id] ?? null;
          return current === change.previous || current === change.value;
        }));
        state = { overrides: { ...error.state.overrides, ...Object.fromEntries(Object.entries(remaining).map(([id, change]) => [id, change.value])) }, pending: remaining };
        publish();
        if (Object.keys(remaining).length) await sendPending();
      }
      throw error;
    }
  }
  return {
    load: () => enqueue(async () => {
      const result = await request('GET');
      const pending = state.pending;
      state.overrides = { ...result.overrides, ...Object.fromEntries(Object.entries(pending).map(([id, change]) => [id, change.value])) };
      publish();
      await sendPending();
    }),
    update: (id, value) => enqueue(async () => {
      const previous = Object.hasOwn(state.pending, id) ? state.pending[id].previous : state.overrides[id] ?? null;
      state.pending[id] = { previous, value };
      state.overrides = { ...state.overrides, [id]: value };
      const persisted = publish();
      try { await sendPending(); }
      catch (error) { error.localSaved = persisted; throw error; }
    })
  };
}
