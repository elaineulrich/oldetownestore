import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

const COOKIE = 'otcs_admin';
const SESSION_HOURS = 12;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unsign(token, secret) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function createAuth({ db, secret, secureCookies }) {
  const findUser = db.prepare('SELECT id, username, password_hash FROM admin_users WHERE username = ?');
  const userById = db.prepare('SELECT id, username FROM admin_users WHERE id = ?');

  function setSession(res, user) {
    const token = sign({ uid: user.id, exp: Date.now() + SESSION_HOURS * 3600e3 }, secret);
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookies,
      maxAge: SESSION_HOURS * 3600e3,
      path: '/',
    });
  }

  return {
    login(req, res) {
      const { username, password } = req.body || {};
      const user = findUser.get(String(username || '').trim().toLowerCase());
      if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }
      setSession(res, user);
      res.json({ username: user.username });
    },

    logout(_req, res) {
      res.clearCookie(COOKIE, { path: '/' });
      res.json({ ok: true });
    },

    /** Middleware: require a valid admin session. */
    require(req, res, next) {
      const payload = unsign(readCookie(req, COOKIE), secret);
      const user = payload && userById.get(payload.uid);
      if (!user) return res.status(401).json({ error: 'Please sign in.' });
      // Cross-site form posts can't set a JSON content type, so requiring it on
      // writes (together with SameSite=strict) blocks CSRF.
      if (req.method !== 'GET' && !req.is('application/json')) {
        return res.status(415).json({ error: 'Expected JSON.' });
      }
      req.admin = user;
      next();
    },
  };
}
