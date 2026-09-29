import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setSetting } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { validateOrder, OrderError, getMenu } from '../server/ordering.js';
import { DEFAULT_SETTINGS } from '../server/seed.js';

let server;
let base;
let db;
let cookie = '';

async function req(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Cookie = cookie;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  db = openDb(':memory:');
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hashPassword('correct-horse'));
  const app = createApp({ db, sessionSecret: 'test-secret' });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

// A fixed "now": Monday 2026-10-05, 10:00 in Itasca (15:00 UTC, CDT).
const MONDAY_10AM = new Date('2026-10-05T15:00:00Z');
const settings = () => ({ ...DEFAULT_SETTINGS });

function sandwichOrder(overrides = {}) {
  const sandwich = getMenu(db, 'deli').find((p) => p.name === 'Sandwich or Wrap');
  const bread = sandwich.groups.find((g) => g.name === 'Bread').options[0];
  const extra = sandwich.groups.find((g) => g.name === 'Extra Meat').options[0];
  return {
    name: 'Jane Doe',
    phone: '254-555-0100',
    pickupDate: '2026-10-05',
    pickupTime: '11:00',
    items: [{ productId: sandwich.id, optionIds: [bread.id, extra.id], quantity: 2 }],
    ...overrides,
  };
}

test('seeded menu has deli items and a party tray', () => {
  const menu = getMenu(db);
  assert.deepEqual(menu.map((p) => p.kind), ['deli', 'deli', 'tray']);
  const tray = menu.find((p) => p.kind === 'tray');
  assert.deepEqual(tray.groups.find((g) => g.name === 'Size').options.map((o) => o.price), [45, 54, 63, 87]);
});

test('valid deli order is accepted', () => {
  const order = validateOrder(db, settings(), sandwichOrder(), MONDAY_10AM);
  assert.equal(order.lines[0].quantity, 2);
  assert.equal(order.hasUnpriced, true); // sandwich base price not set yet
  assert.equal(order.lines[0].unitPrice, null);
});

test('rejects pickup sooner than lead time, outside hours, on closed days', () => {
  const s = settings();
  assert.throws(() => validateOrder(db, s, sandwichOrder({ pickupTime: '10:05' }), MONDAY_10AM), /15 minutes/);
  assert.throws(() => validateOrder(db, s, sandwichOrder({ pickupTime: '07:30' }), MONDAY_10AM), /between/);
  // Monday closes 5:30; with 15-minute cutoff, 5:20 is too late.
  assert.throws(() => validateOrder(db, s, sandwichOrder({ pickupTime: '17:20' }), MONDAY_10AM), /between/);
  assert.throws(() => validateOrder(db, s, sandwichOrder({ pickupDate: '2026-10-11' }), MONDAY_10AM), /closed/); // Sunday
  assert.throws(
    () => validateOrder(db, { ...s, closed_dates: ['2026-10-06'] }, sandwichOrder({ pickupDate: '2026-10-06' }), MONDAY_10AM),
    /closed/
  );
  assert.throws(() => validateOrder(db, s, sandwichOrder({ pickupDate: '2026-10-20' }), MONDAY_10AM), /7 days/);
});

test('party tray requires 24 hours and enforces choice limits and prices', () => {
  const tray = getMenu(db, 'tray')[0];
  const g = Object.fromEntries(tray.groups.map((x) => [x.name, x]));
  const base = {
    name: 'Jane', phone: '(254) 555-0100', pickupDate: '2026-10-05', pickupTime: '16:00',
    items: [{ productId: tray.id, quantity: 1,
      optionIds: [g.Size.options[1].id, g.Style.options[0].id, g.Meats.options[0].id, g.Cheeses.options[0].id] }],
  };
  assert.throws(() => validateOrder(db, settings(), base, MONDAY_10AM), /24 hours/);
  const ok = validateOrder(db, settings(), { ...base, pickupDate: '2026-10-06', pickupTime: '11:00' }, MONDAY_10AM);
  assert.equal(ok.estTotal, 54);
  assert.equal(ok.hasUnpriced, false);

  const fourMeats = structuredClone(base);
  fourMeats.pickupDate = '2026-10-07';
  fourMeats.items[0].optionIds.push(...g.Meats.options.slice(1, 4).map((o) => o.id));
  assert.throws(() => validateOrder(db, settings(), fourMeats, MONDAY_10AM), /no more than 3/);

  const noSize = structuredClone(base);
  noSize.pickupDate = '2026-10-07';
  noSize.items[0].optionIds.shift();
  assert.throws(() => validateOrder(db, settings(), noSize, MONDAY_10AM), /choose a size/);
});

test('out-of-stock ingredients disappear from the menu and are rejected', () => {
  const order = sandwichOrder();
  const extraId = order.items[0].optionIds[1];
  const { ingredient_id } = db.prepare('SELECT ingredient_id FROM options WHERE id = ?').get(extraId);
  db.prepare('UPDATE ingredients SET in_stock = 0 WHERE id = ?').run(ingredient_id);
  try {
    assert.throws(() => validateOrder(db, settings(), order, MONDAY_10AM), OrderError);
  } finally {
    db.prepare('UPDATE ingredients SET in_stock = 1 WHERE id = ?').run(ingredient_id);
  }
});

test('ordering can be paused from settings', () => {
  assert.throws(
    () => validateOrder(db, { ...settings(), deli_ordering_enabled: false }, sandwichOrder(), MONDAY_10AM),
    /paused/
  );
});

test('public API: settings, menu, bakery, and order validation errors', async () => {
  const s = await req('/api/settings');
  assert.equal(s.status, 200);
  assert.equal(s.data.phone, '254-687-5052');
  assert.ok(!('_session_secret' in s.data));
  assert.equal((await req('/api/menu?kind=tray')).data.length, 1);
  const bakery = await req('/api/bakery');
  assert.ok(bakery.data.some((c) => c.name === 'Large Pies'));
  const bad = await req('/api/orders', { method: 'POST', body: { name: '', items: [] } });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /name/);
});

test('admin API requires sign-in', async () => {
  assert.equal((await req('/api/admin/orders')).status, 401);
  const wrong = await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'nope' } });
  assert.equal(wrong.status, 401);
  const ok = await req('/api/admin/login', { method: 'POST', body: { username: 'Admin', password: 'correct-horse' } });
  assert.equal(ok.status, 200);
  cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/api/admin/me', { auth: true })).data.username, 'admin');
});

test('admin writes must be JSON (CSRF guard)', async () => {
  const res = await fetch(`${base}/api/admin/settings`, {
    method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'phone=1',
  });
  assert.equal(res.status, 415);
});

test('admin can manage products, options, stock, bakery, settings, and orders', async () => {
  const a = { auth: true };
  // Set a base price so sandwiches get an estimated total.
  const products = (await req('/api/admin/products', a)).data;
  const sandwich = products.find((p) => p.name === 'Sandwich or Wrap');
  assert.equal((await req(`/api/admin/products/${sandwich.id}`, { ...a, method: 'PATCH', body: { base_price: 7.5 } })).status, 200);

  // New product with a group and option, hidden until activated.
  const { data: created } = await req('/api/admin/products', { ...a, method: 'POST', body: { kind: 'tray', name: 'Veggie Tray', base_price: 30 } });
  const { data: group } = await req(`/api/admin/products/${created.id}/groups`, { ...a, method: 'POST', body: { name: 'Dip', min_select: 1, max_select: 1 } });
  await req(`/api/admin/groups/${group.id}/options`, { ...a, method: 'POST', body: { name: 'Ranch', price: 0 } });
  assert.equal((await req('/api/menu?kind=tray')).data.length, 2);
  await req(`/api/admin/products/${created.id}`, { ...a, method: 'PATCH', body: { active: false } });
  assert.equal((await req('/api/menu?kind=tray')).data.length, 1);

  // Invalid values are rejected.
  const bad = await req(`/api/admin/products/${created.id}`, { ...a, method: 'PATCH', body: { base_price: -1 } });
  assert.equal(bad.status, 400);

  // Stock toggle hides linked options.
  const ingredients = (await req('/api/admin/ingredients', a)).data;
  const roastBeef = ingredients.find((i) => i.name === 'Roast Beef');
  await req(`/api/admin/ingredients/${roastBeef.id}`, { ...a, method: 'PATCH', body: { in_stock: false } });
  const menuNames = (await req('/api/menu')).data.flatMap((p) => p.groups.flatMap((g) => g.options.map((o) => o.name)));
  assert.ok(!menuNames.includes('Roast Beef'));
  await req(`/api/admin/ingredients/${roastBeef.id}`, { ...a, method: 'PATCH', body: { in_stock: true } });

  // Bakery item edits show publicly.
  const cats = (await req('/api/admin/bakery', a)).data;
  await req('/api/admin/bakery/items', { ...a, method: 'POST', body: { name: 'Test Pie', price: 12, category_id: cats[0].id } });
  assert.ok((await req('/api/bakery')).data[0].items.some((i) => i.name === 'Test Pie'));

  // Settings validation.
  assert.equal((await req('/api/admin/settings', { ...a, method: 'PUT', body: { hours: [null] } })).status, 400);
  const saved = await req('/api/admin/settings', { ...a, method: 'PUT', body: { announcement: 'Pies are back!' } });
  assert.equal(saved.data.announcement, 'Pies are back!');
  assert.ok(!('_session_secret' in saved.data));

  // Orders: insert one directly (public endpoint depends on the real clock) and update its status.
  const order = validateOrder(db, { ...DEFAULT_SETTINGS }, sandwichOrder(), MONDAY_10AM);
  assert.equal(order.estTotal, 19); // (7.50 + 2.00 extra meat) × 2
  const { insertOrder } = await import('../server/ordering.js');
  const id = insertOrder(db, order);
  const list = (await req('/api/admin/orders?status=new', a)).data;
  assert.ok(list.some((o) => o.id === id && o.lines[0].selections.length === 2));
  const upd = await req(`/api/admin/orders/${id}`, { ...a, method: 'PATCH', body: { status: 'ready' } });
  assert.equal(upd.data.status, 'ready');
  assert.equal((await req(`/api/admin/orders/${id}`, { ...a, method: 'PATCH', body: { status: 'bogus' } })).status, 400);
});

test('contact form stores messages for admins', async () => {
  const bad = await req('/api/contact', { method: 'POST', body: { name: 'A', email: 'nope', message: 'hi' } });
  assert.equal(bad.status, 400);
  const ok = await req('/api/contact', { method: 'POST', body: { name: 'A', email: 'a@example.com', message: 'Do you sell sorghum?' } });
  assert.equal(ok.status, 201);
  const msgs = (await req('/api/admin/messages', { auth: true })).data;
  assert.equal(msgs[0].body, 'Do you sell sorghum?');
});

test('static pages and 404', async () => {
  for (const p of ['/', '/deli', '/order', '/party-trays', '/bakery', '/grocery', '/about', '/contact', '/admin/']) {
    const r = await req(p);
    assert.equal(r.status, 200, p);
  }
  assert.equal((await req('/nope')).status, 404);
  assert.equal((await req('/api/nope')).status, 404);
});

test('settings helper persists JSON values', () => {
  setSetting(db, 'announcement', 'x');
  assert.equal(JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'announcement'").get().value), 'x');
});
