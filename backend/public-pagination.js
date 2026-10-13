// Operations currently return some timestamp cursors without milliseconds.
// Passing those cursors back can restart the first page. Recover using the
// documented `to` filter, retaining the boundary and deduplicating operations.
function cursorBoundary(cursor) {
  const timestamp = Buffer.from(cursor, "base64").toString("utf8");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(timestamp)) return null;
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? new Date(milliseconds + 1).toISOString() : null;
}

export async function fetchPublicPages(request, endpoint, params = {}, maxItems = 500) {
  const result = [];
  const seenOperations = new Set();
  let cursor = "";
  let to = params.to;
  let seenCursors = new Set();
  const recoveredBounds = new Set();
  while (result.length < maxItems) {
    const payload = await request(endpoint, { params: { ...params, ...(to ? { to } : {}), page_size: Math.min(100, maxItems), cursor } });
    if (!Array.isArray(payload?.data)) throw new Error("Bitpanda Public API lieferte keine gültige Buchungsseite.");
    const nextCursor = payload.has_next_page ? payload.next_cursor : "";
    if (payload.has_next_page && !nextCursor) throw new Error("Bitpanda Public API lieferte keinen nächsten Seitenzeiger.");
    if (nextCursor && seenCursors.has(nextCursor)) {
      const boundary = endpoint === "/operations" && cursor ? cursorBoundary(cursor) : null;
      if (!boundary || recoveredBounds.has(boundary) || (to && Date.parse(boundary) >= Date.parse(to))) {
        throw new Error("Bitpanda Public API lieferte einen wiederholten Seitenzeiger.");
      }
      recoveredBounds.add(boundary);
      to = boundary;
      cursor = "";
      seenCursors = new Set();
      continue; // Ignore the repeated page; it is not the next history page.
    }
    let added = 0;
    for (const item of payload.data) {
      if (endpoint === "/operations") {
        if (!item.operation_id) throw new Error("Bitpanda-Buchung ohne Kennung kann nicht eindeutig geladen werden.");
        if (seenOperations.has(item.operation_id)) continue;
        seenOperations.add(item.operation_id);
      }
      result.push(item);
      added++;
    }
    if (!nextCursor) break;
    if (!added) throw new Error("Bitpanda Public API lieferte keine weiteren Buchungen trotz nächster Seite.");
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return result.slice(0, maxItems);
}
