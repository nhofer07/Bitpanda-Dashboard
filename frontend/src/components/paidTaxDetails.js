export function paidTaxRecords(events = [], year, category = 'sales') {
  const records = new Map();
  for (const event of events) {
    if (event.year !== year || event.category !== category) continue;
    const key = event.groupId || event.id;
    if (!records.has(key)) records.set(key, { id: key, asset: event.asset, reason: event.reason, date: event.date, withheld: 0, refunded: 0, paid: 0, events: [] });
    const record = records.get(key);
    const cents = Math.round(Number(event.amount) * 100);
    record.paid += cents;
    if (cents < 0) record.refunded -= cents;
    else record.withheld += cents;
    record.events.push(event);
    if (event.date > record.date) record.date = event.date;
  }
  return [...records.values()].map(record => ({ ...record, paid: record.paid / 100, withheld: record.withheld / 100, refunded: record.refunded / 100, events: record.events.sort((a, b) => a.date.localeCompare(b.date)) })).sort((a, b) => b.date.localeCompare(a.date));
}
