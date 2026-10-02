import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';

/**
 * Make sure someone can sign in to the admin panel.
 *
 * - ADMIN_RESET_PASSWORD: sets the password for ADMIN_USERNAME (default "admin"),
 *   creating that account if needed. Use it to get back in, then remove it.
 * - Otherwise, on a fresh database, creates the first admin from ADMIN_USERNAME /
 *   ADMIN_PASSWORD, or with a random temporary password.
 *
 * Returns what happened so the caller can log it.
 */
export function ensureAdmin(db, env = process.env) {
  const username = String(env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);

  if (env.ADMIN_RESET_PASSWORD) {
    if (String(env.ADMIN_RESET_PASSWORD).length < 10) {
      return { action: 'reset_rejected', username };
    }
    const hash = hashPassword(String(env.ADMIN_RESET_PASSWORD));
    if (existing) db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, existing.id);
    else db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
    return { action: 'reset', username };
  }

  if (db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n === 0) {
    const password = env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password));
    return { action: 'created', username, tempPassword: env.ADMIN_PASSWORD ? null : password };
  }

  return { action: 'none', username };
}
