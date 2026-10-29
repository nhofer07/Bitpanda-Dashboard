import fs from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomically } from './json-storage.js';

export function validateDrawingDocument(value) {
  if (!Number.isSafeInteger(value?.revision) || value.revision < 0 || !Array.isArray(value.drawings) || value.drawings.length > 150) throw new Error('Ungültiger Zeichenstand.');
  const ids = new Set();
  const drawings = value.drawings.map(d => {
    if (!d || typeof d.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(d.id) || ids.has(d.id) || !['line', 'horizontal', 'rectangle', 'text', 'fibonacci'].includes(d.type) || !/^#[0-9a-f]{6}$/i.test(d.color) || typeof d.text !== 'string' || d.text.length > 160 || !Array.isArray(d.points) || d.points.length !== (['text', 'horizontal'].includes(d.type) ? 1 : 2)) throw new Error('Ungültige Zeichnung.');
    ids.add(d.id);
    const points = d.points.map(p => {
      if (typeof p?.time !== 'number' || !Number.isFinite(p.time) || p.time < 0 || p.time > 7258118400 || typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price <= 0 || p.price > 1e15) throw new Error('Ungültige Kurskoordinaten.');
      return { time: p.time, price: p.price };
    });
    return { id: d.id, type: d.type, color: d.color, text: d.text, points };
  });
  if (Buffer.byteLength(JSON.stringify(drawings)) > 45000) throw new Error('Zu viele Zeichnungen oder Texte. Bitte zuerst einzelne Einträge entfernen.');
  return { revision: value.revision, drawings };
}
export function createChartDrawingStore(directory) {
  const queues = new Map();
  function file(pair) {
    if (typeof pair !== 'string' || !/^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$/.test(pair)) throw new Error('Ungültiges Handelspaar.');
    return path.join(directory, `${pair}.json`);
  }
  async function read(pair) {
    try { return validateDrawingDocument(JSON.parse(await fs.readFile(file(pair), 'utf8'))); }
    catch (e) { if (e.code === 'ENOENT') return { revision: 0, drawings: [] }; throw e; }
  }
  return {
    async read(pair) { file(pair); await queues.get(pair); return read(pair); },
    update(pair, body) {
      file(pair);
      const operation = (queues.get(pair) || Promise.resolve()).then(async () => {
        const incoming = validateDrawingDocument(body), current = await read(pair);
        if (incoming.revision !== current.revision) {
          const error = new Error('Die Zeichnungen wurden auf einem anderen Gerät geändert. Bitte den Serverstand neu laden; deine lokalen Änderungen bleiben bis dahin erhalten.'); error.status = 409; throw error;
        }
        const next = { revision: current.revision + 1, drawings: incoming.drawings };
        await writeJsonAtomically(file(pair), next); return next;
      });
      const settled = operation.catch(() => {}); queues.set(pair, settled);
      void settled.then(() => { if (queues.get(pair) === settled) queues.delete(pair); });
      return operation;
    }
  };
}
