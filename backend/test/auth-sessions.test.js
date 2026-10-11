import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openAuthSessions } from '../auth-sessions.js';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-auth-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'auth-sessions.json');
}
test('session survives restart; disk contains only token hashes and is private', async t => {
  const file = await fixture(t);
  const options = { file, account: () => 'account-one' };
  const first = await openAuthSessions(options);
  const token = await first.create();
  assert.equal(first.authenticated(token), true);
  const second = await openAuthSessions(options);
  assert.equal(second.authenticated(token), true);
  assert.equal(second.authenticated('invalid'), false);
  assert.equal(second.authenticated('x'.repeat(43)), false);
  const disk = await fs.readFile(file, 'utf8');
  assert.equal(disk.includes(token), false);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});
test('logout remains revoked after restart', async t => {
  const options = { file: await fixture(t), account: () => 'account-one' };
  const first = await openAuthSessions(options);
  const token = await first.create();
  await first.revoke(token);
  assert.equal((await openAuthSessions(options)).authenticated(token), false);
});
test('expired sessions fail; active sessions renew across restarts', async t => {
  let time = 1_700_000_000_000;
  const options = { file: await fixture(t), account: () => 'account-one', now: () => time };
  const first = await openAuthSessions(options);
  const token = await first.create();
  time += 29 * 86400000;
  assert.equal(first.authenticated(token), true);
  await first.flush();
  time += 2 * 86400000;
  assert.equal((await openAuthSessions(options)).authenticated(token), true);
  time += 31 * 86400000;
  assert.equal((await openAuthSessions(options)).authenticated(token), false);
});
test('credential changes invalidate sessions live and on restart', async t => {
  let account = 'account-one';
  const options = { file: await fixture(t), account: () => account };
  const first = await openAuthSessions(options);
  const token = await first.create();
  account = 'account-two';
  assert.equal(first.authenticated(token), false);
  assert.equal((await openAuthSessions(options)).authenticated(token), false);
  const next = await first.create();
  assert.equal((await openAuthSessions(options)).authenticated(next), true);
});
test('corrupted session file fails closed and a fresh login repairs it', async t => {
  const file = await fixture(t);
  await fs.writeFile(file, '{');
  let errors = 0;
  const options = { file, account: () => 'account-one', onError: () => errors++ };
  const store = await openAuthSessions(options);
  assert.equal(errors, 1);
  assert.equal(store.authenticated('x'.repeat(43)), false);
  const token = await store.create();
  assert.equal((await openAuthSessions(options)).authenticated(token), true);
});
test('failed persistence does not issue a usable session', async t => {
  const file = await fixture(t);
  await fs.mkdir(file);
  const store = await openAuthSessions({ file, account: () => 'account-one' });
  await assert.rejects(store.create());
});
