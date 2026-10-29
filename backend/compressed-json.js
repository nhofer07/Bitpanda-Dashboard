import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
const compress = promisify(gzip);
export async function sendCompressedJson(req, res, value) {
  const body = JSON.stringify(value);
  res.vary('Accept-Encoding');
  res.type('application/json');
  if (Buffer.byteLength(body) >= 1024 && req.acceptsEncodings('gzip')) {
    const packed = await compress(body, { level: 1 });
    res.set('Content-Encoding', 'gzip');
    return res.send(packed);
  }
  return res.send(body);
}
