import { randomBytes } from 'node:crypto';
import { openDb, getSettings, setSetting } from './db.js';
import { createApp } from './app.js';
import { ensureAdmin } from './bootstrap.js';
import { createMailer } from './mailer.js';

const PORT = Number(process.env.PORT) || 3000;
// On Railway, keep the database on the attached volume so it survives redeploys.
const DB_PATH =
  process.env.DB_PATH ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/store.db` : 'data/store.db');

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

const admin = ensureAdmin(db);
if (admin.action === 'created') {
  console.log(`\nCreated admin account "${admin.username}".`);
  if (admin.tempPassword) console.log(`Temporary password: ${admin.tempPassword}\nChange it after signing in.\n`);
} else if (admin.action === 'reset') {
  console.log(`\nAdmin password for "${admin.username}" was set from ADMIN_RESET_PASSWORD.`);
  console.log('Sign in, then remove ADMIN_RESET_PASSWORD so it is not applied again on the next restart.\n');
} else if (admin.action === 'reset_rejected') {
  console.log('\nADMIN_RESET_PASSWORD was ignored: it must be at least 10 characters.\n');
}

const mailer = createMailer();
if (!mailer) console.log('Email alerts are off (set RESEND_API_KEY and EMAIL_FROM to enable them).');
const app = createApp({
  db,
  sessionSecret,
  secureCookies: process.env.NODE_ENV === 'production',
  mailer,
  siteUrl: process.env.SITE_URL || '',
});
app.listen(PORT, () => console.log(`Olde Towne Country Store running at http://localhost:${PORT}`));
