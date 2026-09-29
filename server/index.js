import { randomBytes } from 'node:crypto';
import { openDb, getSettings, setSetting } from './db.js';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || 'data/store.db';

const db = openDb(DB_PATH);

// Session signing secret: use SESSION_SECRET if provided, otherwise generate one
// and keep it in the database so sessions survive restarts.
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = getSettings(db)._session_secret;
  if (!sessionSecret) {
    sessionSecret = randomBytes(32).toString('hex');
    setSetting(db, '_session_secret', sessionSecret);
  }
}

// First run: create the initial admin account.
if (db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n === 0) {
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password));
  console.log(`\nCreated admin account "${username}".`);
  if (!process.env.ADMIN_PASSWORD) console.log(`Temporary password: ${password}\nChange it after signing in.\n`);
}

const app = createApp({ db, sessionSecret, secureCookies: process.env.NODE_ENV === 'production' });
app.listen(PORT, () => console.log(`Olde Towne Country Store running at http://localhost:${PORT}`));
