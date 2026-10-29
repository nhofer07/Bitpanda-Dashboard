// Network notifications work independently of the page's polling timer. Normal
// minute polling stays available for older servers and interrupted connections.
export function subscribeDashboardUpdates(update, { onRefreshing = () => {}, onFailed = () => {}, EventSourceClass = globalThis.EventSource } = {}) {
  if (!EventSourceClass) return () => {};
  const source = new EventSourceClass('/api/dashboard-events');
  source.addEventListener('ready', update);
  source.addEventListener('dashboard', update);
  source.addEventListener('refreshing', onRefreshing);
  source.addEventListener('refresh-failed', onFailed);
  return () => source.close();
}
