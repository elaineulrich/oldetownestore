import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setSetting } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { getMenu } from '../server/ordering.js';
import { orderAlertEmail, createMailer } from '../server/mailer.js';

const sent = [];
let failNext = false;
const fakeMailer = {
  configured: true,
  async send(msg) {
    if (failNext) {
      failNext = false;
      throw new Error('Resend down');
    }
    sent.push(msg);
  },
};

let server;
let base;
let db;
let cookie;
// Monday 2026-10-05, 10:00 in Itasca.
const clock = () => new Date('2026-10-05T15:00:00Z');

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

function orderBody(extra = {}) {
  const sandwich = getMenu(db, 'deli')[0];
  return {
    name: 'Jane Doe', phone: '254-555-0100', email: 'jane@example.com', notes: 'Extra napkins <please>',
    pickupDate: '2026-10-05', pickupTime: '11:30',
    items: [{ productId: sandwich.id, optionIds: [sandwich.groups[0].options[0].id], quantity: 1, instructions: 'Cut in half' }],
    ...extra,
  };
}

const waitForMail = async (n) => {
  for (let i = 0; i < 50 && sent.length < n; i++) await new Promise((r) => setTimeout(r, 10));
};

before(async () => {
  db = openDb(':memory:');
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hashPassword('correct-horse'));
  const app = createApp({ db, sessionSecret: 's', mailer: fakeMailer, siteUrl: 'https://store.example', clock });
  await new Promise((r) => {
    server = app.listen(0, r);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await post('/api/admin/login', { username: 'admin', password: 'correct-horse' });
  cookie = res.headers.get('set-cookie').split(';')[0];
});
after(() => server.close());

test('no alert is sent when no recipients are configured', async () => {
  const res = await post('/api/orders', orderBody());
  assert.equal(res.status, 201);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(sent.length, 0);
});

test('admin sets alert recipients; invalid addresses are rejected', async () => {
  const put = (v) => fetch(`${base}/api/admin/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ order_alert_emails: v }),
  });
  assert.equal((await put('orders@store.example, not-an-email')).status, 400);
  const ok = await put('Orders@Store.example; owner@store.example');
  assert.deepEqual((await ok.json()).order_alert_emails, ['orders@store.example', 'owner@store.example']);
});

test('new order emails the store with order details', async () => {
  const res = await post('/api/orders', orderBody());
  const { id } = await res.json();
  await waitForMail(1);
  const msg = sent.at(-1);
  assert.deepEqual(msg.to, ['orders@store.example', 'owner@store.example']);
  assert.equal(msg.replyTo, 'jane@example.com');
  assert.match(msg.subject, new RegExp(`#${id}.*Monday, October 5 at 11:30 AM.*Jane Doe`));
  assert.match(msg.text, /Cut in half/);
  assert.match(msg.text, /https:\/\/store\.example\/admin\/#orders/);
  assert.match(msg.html, /Extra napkins &lt;please&gt;/); // customer text is escaped
});

test('a mail failure does not block the order', async () => {
  failNext = true;
  const res = await post('/api/orders', orderBody({ pickupTime: '12:00' }));
  assert.equal(res.status, 201);
});

test('pickup times outside the allowed window are still rejected', async () => {
  const res = await post('/api/orders', orderBody({ pickupTime: '10:05' }));
  assert.equal(res.status, 400);
});

test('admin can send a test email', async () => {
  const before = sent.length;
  const res = await post('/api/admin/email-test', {}, { Cookie: cookie });
  assert.equal(res.status, 200);
  assert.equal(sent.length, before + 1);
  assert.match(sent.at(-1).subject, /Test/);
});

test('alert email labels tray orders and unpriced totals', () => {
  const email = orderAlertEmail(7, {
    customer: { name: 'Bo', phone: '2545550100', email: '', notes: '' },
    pickupDate: '2026-10-06', pickupTime: '14:00', estTotal: 0, hasUnpriced: true,
    lines: [{ kind: 'tray', productName: 'Deli Tray', quantity: 1, selections: [], instructions: '', unitPrice: null }],
  });
  assert.match(email.text, /New party tray order #7/);
  assert.match(email.text, /Priced at counter/);
});

test('Resend mailer is off without a key and sender', () => {
  assert.equal(createMailer({}), null);
  assert.equal(createMailer({ RESEND_API_KEY: 're_x' }), null);
});

test('Resend mailer posts the right request and surfaces API errors', async () => {
  const calls = [];
  let reply = { ok: true, status: 200, json: async () => ({ id: 'email_1' }) };
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return reply;
  };
  const mailer = createMailer({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'Orders <orders@store.example>' }, fakeFetch);
  await mailer.send({ to: ['a@store.example'], replyTo: 'jane@example.com', subject: 'Hi', text: 't', html: '<p>h</p>' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    from: 'Orders <orders@store.example>', to: ['a@store.example'], subject: 'Hi', text: 't', html: '<p>h</p>',
    reply_to: 'jane@example.com',
  });

  reply = { ok: false, status: 403, json: async () => ({ message: 'The domain is not verified.' }) };
  await assert.rejects(mailer.send({ to: 'a@store.example', subject: 'x', text: 'y' }), /not verified/);
});
