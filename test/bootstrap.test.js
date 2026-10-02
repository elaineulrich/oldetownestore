import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { ensureAdmin } from '../server/bootstrap.js';
import { verifyPassword } from '../server/auth.js';

const hashFor = (db, u) => db.prepare('SELECT password_hash FROM admin_users WHERE username = ?').get(u)?.password_hash;

test('first start creates an admin with ADMIN_PASSWORD or a temporary one', () => {
  const db = openDb(':memory:');
  const r = ensureAdmin(db, { ADMIN_PASSWORD: 'first-password-1' });
  assert.equal(r.action, 'created');
  assert.ok(verifyPassword('first-password-1', hashFor(db, 'admin')));

  const db2 = openDb(':memory:');
  const r2 = ensureAdmin(db2, {});
  assert.ok(r2.tempPassword && verifyPassword(r2.tempPassword, hashFor(db2, 'admin')));
});

test('ADMIN_PASSWORD does not change an existing account, but ADMIN_RESET_PASSWORD does', () => {
  const db = openDb(':memory:');
  ensureAdmin(db, { ADMIN_PASSWORD: 'original-pass-1' });
  assert.equal(ensureAdmin(db, { ADMIN_PASSWORD: 'something-else-2' }).action, 'none');
  assert.ok(verifyPassword('original-pass-1', hashFor(db, 'admin')));

  assert.equal(ensureAdmin(db, { ADMIN_RESET_PASSWORD: 'short' }).action, 'reset_rejected');
  assert.ok(verifyPassword('original-pass-1', hashFor(db, 'admin')));

  assert.equal(ensureAdmin(db, { ADMIN_RESET_PASSWORD: 'brand-new-pass-3' }).action, 'reset');
  assert.ok(verifyPassword('brand-new-pass-3', hashFor(db, 'admin')));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n, 1);
});

test('ADMIN_RESET_PASSWORD creates the named account if it does not exist', () => {
  const db = openDb(':memory:');
  ensureAdmin(db, { ADMIN_PASSWORD: 'original-pass-1' });
  ensureAdmin(db, { ADMIN_USERNAME: 'Elaine', ADMIN_RESET_PASSWORD: 'elaines-pass-123' });
  assert.ok(verifyPassword('elaines-pass-123', hashFor(db, 'elaine')));
});
