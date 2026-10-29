// Share overlapping GETs only. Never cache a completed read or share mutations.
export function createReadDeduplicator() {
  const pending = new Map();
  return (key, read) => {
    if (pending.has(key)) return pending.get(key);
    const request = Promise.resolve().then(read);
    pending.set(key, request);
    const done = () => { if (pending.get(key) === request) pending.delete(key); };
    request.then(done, done);
    return request;
  };
}
