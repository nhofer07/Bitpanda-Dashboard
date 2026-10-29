// Notify authenticated clients only after a new dashboard has been saved.
// Send a timestamp, never account data; clients fetch through normal auth again.
export function createDashboardEvents() {
  const clients = new Set();
  function attach(req, res, authorized) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    const client = { res, authorized, close: null };
    const close = () => { clearInterval(timer); clients.delete(client); };
    client.close = () => { close(); res.end(); };
    const timer = setInterval(() => {
      if (!authorized() || res.destroyed || !res.write(': keep-alive\n\n')) client.close();
    }, 25_000);
    timer.unref?.();
    req.on('close', close);
    res.on('close', close);
    clients.add(client);
    res.write('retry: 5000\nevent: ready\ndata: {}\n\n');
  }
  function broadcast(event, data = {}) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      if (!client.authorized() || client.res.destroyed || !client.res.write(message)) client.close();
    }
  }
  function publish(loadedAt) {
    if (Number.isFinite(Date.parse(loadedAt))) broadcast('dashboard', { loadedAt });
  }
  const refreshing = () => broadcast('refreshing');
  const failed = () => broadcast('refresh-failed');
  function clear() { for (const client of clients) client.close(); }
  return { attach, publish, refreshing, failed, clear };
}
