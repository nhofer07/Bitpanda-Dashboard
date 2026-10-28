const CLASSES = new Set(['deposit', 'expense', 'transfer', 'withdrawal', 'refund', 'ignore']);

export function normalizeCashflowState(data) {
  const overrides = Object.create(null);
  for (const [id, value] of Object.entries(data?.overrides || {})) {
    if (id && id.length <= 128 && CLASSES.has(value)) overrides[id] = value;
  }
  return { overrides, revision: Number.isSafeInteger(data?.revision) ? data.revision : 0 };
}

// Serialize read/compare/write so concurrent browser tabs cannot overwrite one another.
export function createCashflowStore({ read, write }) {
  let queue = Promise.resolve();
  return {
    read: async () => { await queue; return normalizeCashflowState(await read()); },
    update(data) {
      const operation = queue.then(async () => {
        const state = normalizeCashflowState(await read());
        const entries = Object.entries(data?.changes || {});
        if (!entries.length || entries.length > 10000) throw new Error('Bitte die Seite neu laden und die Cashflow-Zuordnung erneut speichern.');
        for (const [id, change] of entries) {
          if (!id || id.length > 128 || !CLASSES.has(change?.value) || !(change.previous === null || CLASSES.has(change.previous))) throw new Error('Ungültige Cashflow-Korrektur.');
          const current = state.overrides[id] ?? null;
          if (current !== change.previous && current !== change.value) {
            const error = new Error('Diese Zuordnung wurde auf einem anderen Gerät geändert. Der Serverstand wurde geladen; bitte deine Auswahl erneut treffen.');
            error.status = 409;
            error.state = state;
            throw error;
          }
        }
        for (const [id, change] of entries) state.overrides[id] = change.value;
        state.revision++;
        await write(state);
        return state;
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
}
