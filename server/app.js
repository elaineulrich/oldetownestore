import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getSettings, setSetting, tx } from './db.js';
import { createAuth, hashPassword, verifyPassword } from './auth.js';
import { getMenu, validateOrder, insertOrder, OrderError, storeNow } from './ordering.js';
import { DEFAULT_SETTINGS } from './seed.js';
import { orderAlertEmail } from './mailer.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const PUBLIC_SETTING_KEYS = [
  'store_name', 'tagline', 'address', 'phone', 'email', 'facebook_url', 'newsletter_url', 'timezone',
  'hours', 'closed_dates', 'deli_ordering_enabled', 'tray_ordering_enabled', 'close_cutoff_minutes', 'announcement',
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Field whitelists for admin updates: name -> coercion function.
const str = (max) => (v) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new HttpError(400, `Text is too long (max ${max} characters).`);
  return s;
};
const reqStr = (max) => (v) => {
  const s = str(max)(v);
  if (!s) throw new HttpError(400, 'A name is required.');
  return s;
};
const bool = (v) => (v ? 1 : 0);
const int = (min, max) => (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Enter a whole number from ${min} to ${max}.`);
  return n;
};
const money = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, 'Enter a valid price.');
  return Math.round(n * 100) / 100;
};
const moneyOrNull = (v) => (v === null || v === '' || v === undefined ? null : money(v));
const nullableId = (v) => (v === null || v === '' || v === undefined ? null : int(1, Number.MAX_SAFE_INTEGER)(v));

const FIELDS = {
  products: {
    kind: (v) => {
      if (!['deli', 'tray'].includes(v)) throw new HttpError(400, 'Kind must be deli or tray.');
      return v;
    },
    name: reqStr(100), description: str(500), base_price: moneyOrNull,
    lead_minutes: int(0, 60 * 24 * 30), max_advance_days: int(0, 365), active: bool,
  },
  option_groups: { name: reqStr(100), help: str(300), min_select: int(0, 100), max_select: int(0, 100) },
  options: { name: reqStr(100), price: money, ingredient_id: nullableId, active: bool },
  ingredients: { category: reqStr(50), name: reqStr(100), in_stock: bool },
  bakery_categories: { name: reqStr(100), note: str(300) },
  bakery_items: { name: reqStr(150), price: moneyOrNull, active: bool, category_id: int(1, Number.MAX_SAFE_INTEGER) },
};

function pick(table, body, { requireAll = [] } = {}) {
  const out = {};
  for (const [key, coerce] of Object.entries(FIELDS[table])) {
    if (body && key in body) out[key] = coerce(body[key]);
  }
  for (const key of requireAll) if (!(key in out)) out[key] = FIELDS[table][key](undefined);
  return out;
}

function update(db, table, id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) throw new HttpError(400, 'Nothing to update.');
  const res = db
    .prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
  if (res.changes === 0) throw new HttpError(404, 'Not found.');
}

function insert(db, table, fields) {
  const keys = Object.keys(fields);
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => fields[k]));
  return Number(lastInsertRowid);
}

function remove(db, table, id) {
  if (db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes === 0) throw new HttpError(404, 'Not found.');
}

function nextSort(db, table, where = '', params = []) {
  return db.prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM ${table} ${where}`).get(...params).s;
}

function validateSettings(body) {
  const out = {};
  const text = { store_name: 100, tagline: 200, address: 200, phone: 30, email: 200, facebook_url: 300,
    newsletter_url: 500, announcement: 500 };
  for (const [k, max] of Object.entries(text)) if (k in body) out[k] = str(max)(body[k]);
  for (const k of ['deli_ordering_enabled', 'tray_ordering_enabled']) if (k in body) out[k] = Boolean(body[k]);
  if ('order_alert_emails' in body) {
    const list = Array.isArray(body.order_alert_emails)
      ? body.order_alert_emails
      : String(body.order_alert_emails ?? '').split(/[\s,;]+/);
    const emails = [...new Set(list.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
    const bad = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad) throw new HttpError(400, `"${bad}" isn't a valid email address.`);
    if (emails.length > 10) throw new HttpError(400, 'Up to 10 alert addresses.');
    out.order_alert_emails = emails;
  }
  if ('close_cutoff_minutes' in body) out.close_cutoff_minutes = int(0, 240)(body.close_cutoff_minutes);
  if ('timezone' in body) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: body.timezone });
    } catch {
      throw new HttpError(400, 'Unknown time zone.');
    }
    out.timezone = String(body.timezone);
  }
  if ('hours' in body) {
    if (!Array.isArray(body.hours) || body.hours.length !== 7) throw new HttpError(400, 'Hours must list all 7 days.');
    out.hours = body.hours.map((d) => {
      if (!d) return null;
      const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
      if (!ok(d.open) || !ok(d.close) || d.open >= d.close) throw new HttpError(400, 'Each open day needs an opening time before its closing time.');
      return { open: d.open, close: d.close };
    });
  }
  if ('closed_dates' in body) {
    if (!Array.isArray(body.closed_dates)) throw new HttpError(400, 'Closed dates must be a list.');
    out.closed_dates = [...new Set(body.closed_dates.map(String))].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  }
  return out;
}

function loadOrder(db, id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  order.lines = db
    .prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id')
    .all(id)
    .map((l) => ({ ...l, selections: JSON.parse(l.selections) }));
  return order;
}

export function createApp({ db, sessionSecret, secureCookies = false, mailer = null, siteUrl = '', clock = () => new Date() }) {
  const app = express();
  const auth = createAuth({ db, secret: sessionSecret, secureCookies });
  // Keys starting with "_" are internal (e.g. the session secret) and never sent to clients.
  const settings = () => Object.fromEntries(
    Object.entries({ ...DEFAULT_SETTINGS, ...getSettings(db) }).filter(([k]) => !k.startsWith('_'))
  );
  const id = (req) => int(1, Number.MAX_SAFE_INTEGER)(req.params.id);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    next();
  });

  // Email the store about a new order. Runs in the background: a mail problem
  // must never stop the customer's order from going through.
  function sendOrderAlert(orderId, order) {
    const s = settings();
    const to = s.order_alert_emails || [];
    if (!mailer || to.length === 0) return;
    const msg = orderAlertEmail(orderId, order, { storeName: s.store_name, siteUrl });
    mailer
      .send({ to, replyTo: order.customer.email || undefined, ...msg })
      .catch((err) => console.error(`Order #${orderId}: alert email failed: ${err.message}`));
  }

  // ---------- Public API ----------
  const api = express.Router();

  api.get('/settings', (_req, res) => {
    const s = settings();
    res.json({ ...Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, s[k]])), now: storeNow(s.timezone) });
  });

  api.get('/menu', (req, res) => {
    const kind = ['deli', 'tray'].includes(req.query.kind) ? req.query.kind : undefined;
    res.json(getMenu(db, kind));
  });

  api.get('/bakery', (_req, res) => {
    const items = db.prepare('SELECT id, category_id, name, price FROM bakery_items WHERE active = 1 ORDER BY sort, id').all();
    const cats = db.prepare('SELECT id, name, note FROM bakery_categories ORDER BY sort, id').all();
    res.json(cats.map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id) })).filter((c) => c.items.length));
  });

  api.post('/orders', (req, res) => {
    const order = validateOrder(db, settings(), req.body, clock());
    const orderId = tx(db, () => insertOrder(db, order));
    sendOrderAlert(orderId, order);
    res.status(201).json({ id: orderId, estTotal: order.estTotal, hasUnpriced: order.hasUnpriced,
      pickupDate: order.pickupDate, pickupTime: order.pickupTime });
  });

  api.post('/contact', (req, res) => {
    const name = str(100)(req.body?.name);
    const email = str(200)(req.body?.email);
    const phone = str(30)(req.body?.phone);
    const body = str(3000)(req.body?.message);
    if (!name || !body) throw new HttpError(400, 'Please include your name and a message.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
    db.prepare('INSERT INTO messages (name, email, phone, body) VALUES (?, ?, ?, ?)').run(name, email, phone, body);
    res.status(201).json({ ok: true });
  });

  // ---------- Admin API ----------
  const admin = express.Router();
  admin.post('/login', auth.login);
  admin.post('/logout', auth.logout);
  admin.use(auth.require);

  admin.get('/me', (req, res) => res.json({ username: req.admin.username }));

  admin.post('/password', (req, res) => {
    const { current, next } = req.body || {};
    const row = db.prepare('SELECT password_hash FROM admin_users WHERE id = ?').get(req.admin.id);
    if (!verifyPassword(String(current || ''), row.password_hash)) throw new HttpError(400, 'Current password is incorrect.');
    if (String(next || '').length < 10) throw new HttpError(400, 'New password must be at least 10 characters.');
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hashPassword(String(next)), req.admin.id);
    res.json({ ok: true });
  });

  admin.get('/users', (_req, res) => {
    res.json(db.prepare('SELECT id, username, created_at FROM admin_users ORDER BY username').all());
  });
  admin.post('/users', (req, res) => {
    const username = str(50)(req.body?.username).toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[a-z0-9._@-]{3,50}$/.test(username)) throw new HttpError(400, 'Username must be 3–50 letters, numbers, or . _ @ -');
    if (password.length < 10) throw new HttpError(400, 'Password must be at least 10 characters.');
    if (db.prepare('SELECT 1 FROM admin_users WHERE username = ?').get(username)) throw new HttpError(409, 'That username is taken.');
    const newId = insert(db, 'admin_users', { username, password_hash: hashPassword(password) });
    res.status(201).json({ id: newId, username });
  });
  admin.delete('/users/:id', (req, res) => {
    if (id(req) === req.admin.id) throw new HttpError(400, 'You can’t delete your own account.');
    remove(db, 'admin_users', id(req));
    res.json({ ok: true });
  });

  admin.get('/summary', (_req, res) => {
    const s = settings();
    const today = storeNow(s.timezone).date;
    res.json({
      newOrders: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'").get().n,
      todayPickups: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE pickup_date = ? AND status NOT IN ('cancelled')").get(today).n,
      unreadMessages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE read = 0').get().n,
      outOfStock: db.prepare('SELECT COUNT(*) AS n FROM ingredients WHERE in_stock = 0').get().n,
      today,
    });
  });

  // Orders
  admin.get('/orders', (req, res) => {
    const where = [];
    const params = [];
    if (req.query.status === 'open') where.push("status IN ('new', 'preparing', 'ready')");
    else if (req.query.status) {
      where.push('status = ?');
      params.push(String(req.query.status));
    }
    if (req.query.date) {
      where.push('pickup_date = ?');
      params.push(String(req.query.date));
    }
    const rows = db
      .prepare(
        `SELECT id FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY pickup_date, pickup_time, id LIMIT 500`
      )
      .all(...params);
    res.json(rows.map((r) => loadOrder(db, r.id)));
  });
  admin.patch('/orders/:id', (req, res) => {
    const status = String(req.body?.status || '');
    if (!['new', 'preparing', 'ready', 'picked_up', 'cancelled'].includes(status)) throw new HttpError(400, 'Unknown status.');
    update(db, 'orders', id(req), { status });
    res.json(loadOrder(db, id(req)));
  });

  // Products, option groups, options
  admin.get('/products', (_req, res) => {
    const products = db.prepare('SELECT * FROM products ORDER BY kind, sort, id').all();
    const groups = db.prepare('SELECT * FROM option_groups ORDER BY sort, id').all();
    const options = db
      .prepare(
        `SELECT o.*, i.name AS ingredient_name, i.in_stock AS ingredient_in_stock
           FROM options o LEFT JOIN ingredients i ON i.id = o.ingredient_id ORDER BY o.sort, o.id`
      )
      .all();
    res.json(products.map((p) => ({
      ...p,
      groups: groups.filter((g) => g.product_id === p.id).map((g) => ({
        ...g, options: options.filter((o) => o.group_id === g.id),
      })),
    })));
  });
  admin.post('/products', (req, res) => {
    const fields = pick('products', req.body, { requireAll: ['kind', 'name'] });
    fields.sort = nextSort(db, 'products');
    if (!('lead_minutes' in fields)) fields.lead_minutes = fields.kind === 'tray' ? 1440 : 15;
    if (!('max_advance_days' in fields)) fields.max_advance_days = fields.kind === 'tray' ? 60 : 7;
    res.status(201).json({ id: insert(db, 'products', fields) });
  });
  admin.patch('/products/:id', (req, res) => {
    update(db, 'products', id(req), pick('products', req.body));
    res.json({ ok: true });
  });
  admin.delete('/products/:id', (req, res) => {
    remove(db, 'products', id(req));
    res.json({ ok: true });
  });
  admin.post('/products/:id/duplicate', (req, res) => {
    const src = db.prepare('SELECT * FROM products WHERE id = ?').get(id(req));
    if (!src) throw new HttpError(404, 'Not found.');
    const newId = tx(db, () => {
      const { id: _i, ...p } = src;
      const pid = insert(db, 'products', { ...p, name: `${p.name} (copy)`, active: 0, sort: nextSort(db, 'products') });
      for (const g of db.prepare('SELECT * FROM option_groups WHERE product_id = ? ORDER BY sort, id').all(src.id)) {
        const { id: gidOld, product_id: _p, ...gf } = g;
        const gid = insert(db, 'option_groups', { ...gf, product_id: pid });
        for (const o of db.prepare('SELECT * FROM options WHERE group_id = ? ORDER BY sort, id').all(gidOld)) {
          const { id: _o, group_id: _g, ...of } = o;
          insert(db, 'options', { ...of, group_id: gid });
        }
      }
      return pid;
    });
    res.status(201).json({ id: newId });
  });

  admin.post('/products/:id/groups', (req, res) => {
    const pid = id(req);
    if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(pid)) throw new HttpError(404, 'Not found.');
    const fields = pick('option_groups', req.body, { requireAll: ['name'] });
    res.status(201).json({
      id: insert(db, 'option_groups', { ...fields, product_id: pid, sort: nextSort(db, 'option_groups', 'WHERE product_id = ?', [pid]) }),
    });
  });
  admin.patch('/groups/:id', (req, res) => {
    update(db, 'option_groups', id(req), pick('option_groups', req.body));
    res.json({ ok: true });
  });
  admin.delete('/groups/:id', (req, res) => {
    remove(db, 'option_groups', id(req));
    res.json({ ok: true });
  });

  admin.post('/groups/:id/options', (req, res) => {
    const gid = id(req);
    if (!db.prepare('SELECT 1 FROM option_groups WHERE id = ?').get(gid)) throw new HttpError(404, 'Not found.');
    const fields = pick('options', req.body, { requireAll: ['name'] });
    res.status(201).json({
      id: insert(db, 'options', { ...fields, group_id: gid, sort: nextSort(db, 'options', 'WHERE group_id = ?', [gid]) }),
    });
  });
  // Add many options at once from the ingredient library.
  admin.post('/groups/:id/options/from-ingredients', (req, res) => {
    const gid = id(req);
    if (!db.prepare('SELECT 1 FROM option_groups WHERE id = ?').get(gid)) throw new HttpError(404, 'Not found.');
    const ids = (Array.isArray(req.body?.ingredientIds) ? req.body.ingredientIds : []).map(Number);
    const price = money(req.body?.price ?? 0);
    const ingStmt = db.prepare('SELECT id, name FROM ingredients WHERE id = ?');
    tx(db, () => {
      let sort = nextSort(db, 'options', 'WHERE group_id = ?', [gid]);
      for (const ingId of ids) {
        const ing = ingStmt.get(ingId);
        if (ing) insert(db, 'options', { group_id: gid, name: ing.name, price, ingredient_id: ing.id, sort: sort++ });
      }
    });
    res.status(201).json({ ok: true });
  });
  admin.patch('/options/:id', (req, res) => {
    update(db, 'options', id(req), pick('options', req.body));
    res.json({ ok: true });
  });
  admin.delete('/options/:id', (req, res) => {
    remove(db, 'options', id(req));
    res.json({ ok: true });
  });

  // Reordering: body { ids: [...] } in the desired order.
  const SORTABLE = ['products', 'option_groups', 'options', 'ingredients', 'bakery_categories', 'bakery_items'];
  admin.put('/reorder/:table', (req, res) => {
    const table = req.params.table;
    if (!SORTABLE.includes(table)) throw new HttpError(404, 'Not found.');
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
    const stmt = db.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`);
    tx(db, () => ids.forEach((rowId, i) => stmt.run(i, rowId)));
    res.json({ ok: true });
  });

  // Ingredient library
  admin.get('/ingredients', (_req, res) => {
    res.json(
      db.prepare(
        `SELECT i.*, (SELECT COUNT(*) FROM options o WHERE o.ingredient_id = i.id) AS used_by
           FROM ingredients i ORDER BY category, sort, name`
      ).all()
    );
  });
  admin.post('/ingredients', (req, res) => {
    const fields = pick('ingredients', req.body, { requireAll: ['category', 'name'] });
    if (db.prepare('SELECT 1 FROM ingredients WHERE category = ? AND name = ?').get(fields.category, fields.name)) {
      throw new HttpError(409, 'That ingredient already exists.');
    }
    fields.sort = nextSort(db, 'ingredients', 'WHERE category = ?', [fields.category]);
    res.status(201).json({ id: insert(db, 'ingredients', fields) });
  });
  admin.patch('/ingredients/:id', (req, res) => {
    const fields = pick('ingredients', req.body);
    tx(db, () => {
      update(db, 'ingredients', id(req), fields);
      // Keep linked option names in sync when an ingredient is renamed.
      if (fields.name) db.prepare('UPDATE options SET name = ? WHERE ingredient_id = ?').run(fields.name, id(req));
    });
    res.json({ ok: true });
  });
  admin.delete('/ingredients/:id', (req, res) => {
    remove(db, 'ingredients', id(req));
    res.json({ ok: true });
  });

  // Bakery menu
  admin.get('/bakery', (_req, res) => {
    const items = db.prepare('SELECT * FROM bakery_items ORDER BY sort, id').all();
    res.json(
      db.prepare('SELECT * FROM bakery_categories ORDER BY sort, id').all()
        .map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id) }))
    );
  });
  admin.post('/bakery/categories', (req, res) => {
    const fields = pick('bakery_categories', req.body, { requireAll: ['name'] });
    res.status(201).json({ id: insert(db, 'bakery_categories', { ...fields, sort: nextSort(db, 'bakery_categories') }) });
  });
  admin.patch('/bakery/categories/:id', (req, res) => {
    update(db, 'bakery_categories', id(req), pick('bakery_categories', req.body));
    res.json({ ok: true });
  });
  admin.delete('/bakery/categories/:id', (req, res) => {
    remove(db, 'bakery_categories', id(req));
    res.json({ ok: true });
  });
  admin.post('/bakery/items', (req, res) => {
    const fields = pick('bakery_items', req.body, { requireAll: ['name', 'category_id'] });
    if (!db.prepare('SELECT 1 FROM bakery_categories WHERE id = ?').get(fields.category_id)) throw new HttpError(400, 'Unknown category.');
    fields.sort = nextSort(db, 'bakery_items', 'WHERE category_id = ?', [fields.category_id]);
    res.status(201).json({ id: insert(db, 'bakery_items', fields) });
  });
  admin.patch('/bakery/items/:id', (req, res) => {
    update(db, 'bakery_items', id(req), pick('bakery_items', req.body));
    res.json({ ok: true });
  });
  admin.delete('/bakery/items/:id', (req, res) => {
    remove(db, 'bakery_items', id(req));
    res.json({ ok: true });
  });

  // Settings
  admin.get('/settings', (_req, res) => res.json(settings()));
  admin.put('/settings', (req, res) => {
    const values = validateSettings(req.body || {});
    tx(db, () => Object.entries(values).forEach(([k, v]) => setSetting(db, k, v)));
    res.json(settings());
  });

  // Email alerts
  admin.get('/email-status', (_req, res) => {
    res.json({ configured: Boolean(mailer), recipients: settings().order_alert_emails || [] });
  });
  admin.post('/email-test', async (_req, res) => {
    if (!mailer) throw new HttpError(400, 'Email isn’t set up on the server yet (RESEND_API_KEY and EMAIL_FROM are missing).');
    const to = settings().order_alert_emails || [];
    if (to.length === 0) throw new HttpError(400, 'Add at least one alert address and save first.');
    try {
      await mailer.send({
        to,
        subject: 'Test: order alerts are working',
        text: 'This is a test from your store website. New online orders will be emailed to this address.',
      });
    } catch (err) {
      throw new HttpError(502, `The test email couldn’t be sent: ${err.message}`);
    }
    res.json({ ok: true, sentTo: to });
  });

  // Contact messages
  admin.get('/messages', (_req, res) => {
    res.json(db.prepare('SELECT * FROM messages ORDER BY created_at DESC, id DESC LIMIT 500').all());
  });
  admin.patch('/messages/:id', (req, res) => {
    update(db, 'messages', id(req), { read: bool(req.body?.read) });
    res.json({ ok: true });
  });
  admin.delete('/messages/:id', (req, res) => {
    remove(db, 'messages', id(req));
    res.json({ ok: true });
  });

  api.use('/admin', admin);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
  app.use((_req, res) => res.status(404).sendFile(join(PUBLIC_DIR, '404.html')));

  // Error handler
  app.use((err, _req, res, _next) => {
    if (err instanceof OrderError) return res.status(400).json({ error: err.message });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again or call the store.' });
  });

  return app;
}
