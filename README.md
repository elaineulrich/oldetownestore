# oldetownestore

Website for **Olde Towne Country Store** (Itasca, TX) with online deli ordering, party tray ordering, and an admin panel so store staff can manage menus, stock, hours, and incoming orders.

## Branches

- `main` — production
- `elaine` — working branch; merge into `main` via pull request

## Running locally

Requires **Node.js 22.13 or newer** (uses the built-in `node:sqlite`, so there are no native dependencies).

```bash
npm install
ADMIN_PASSWORD='choose-a-strong-password' npm start
# → http://localhost:3000        (website)
# → http://localhost:3000/admin  (store admin)
```

On first start the database is created at `data/store.db` and seeded with the store's current deli, party tray, and bakery menus. An admin account is created (username `admin`, or `ADMIN_USERNAME`). If `ADMIN_PASSWORD` isn't set, a temporary password is printed to the console once.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `data/store.db` | SQLite database file (back this up) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / random | First admin account (only used when no admins exist) |
| `SESSION_SECRET` | generated & stored in DB | Signs admin login cookies |
| `NODE_ENV` | — | Set to `production` behind HTTPS to mark cookies `Secure` |
| `SITE_URL` | — | Public site address, used for the "Open orders" link in alert emails |
| `RESEND_API_KEY` | — | [Resend](https://resend.com) API key; with `EMAIL_FROM`, turns on new-order email alerts |
| `EMAIL_FROM` | — | Sender, on a domain verified in Resend, e.g. `Olde Towne Orders <orders@yourdomain.com>` |

Once Resend is set up, staff choose who receives alerts under **Admin → Store Settings → New order email alerts** and can send a test email from there. Alerts are sent in the background, so a mail problem never blocks a customer's order.

Run the tests with `npm test`.

## Deploying on Railway

1. In the Railway service settings, deploy from the branch that has the code. Until the pull request is merged, that's `elaine`; after merging, `main` works too.
2. Add a **Volume** to the service (mount path e.g. `/data`). The app stores its database there automatically via `RAILWAY_VOLUME_MOUNT_PATH`, so orders and menu edits survive redeploys.
3. Set variables: `ADMIN_PASSWORD`, `NODE_ENV=production`, `SITE_URL`, `RESEND_API_KEY`, and `EMAIL_FROM` for email alerts.
4. Railway detects Node from `package.json` and runs `npm start`; the app listens on Railway's `PORT`.

## What's included

**Public site** — Home, Deli, Bakery, Grocery, Party Trays, About, Contact, and Order Online. Store hours, phone, address, announcement banner, and the bakery price list all come from the admin panel.

**Online ordering** — customers build sandwiches, subs, wraps, and trays from the live menu, add several items to one order, and pick a pickup date/time. The ordering rules are shown next to the pickup fields, and the date/time lists only offer times that meet them; the server re-checks every order. They cover what the old forms couldn't: pickup must be within store hours (minus a closing cutoff), respect each item's minimum notice (15 min for deli, 24 h for trays), not fall on closed days/holidays, and only use in-stock options. No payment is taken online.

**Admin (`/admin`)**
- **Dashboard** — new orders, today's pickups, out-of-stock count, unread messages
- **Orders** — filter by status/date, update status (new → preparing → ready → picked up / cancelled), print
- **Online Menu** — add/edit/hide/duplicate/reorder items, choice groups (min/max picks), options and add-on prices
- **Stock / 86 List** — one checkbox hides an ingredient everywhere it's used on the online menu
- **Bakery Menu** — categories, items, and prices shown on the Bakery page
- **Store Settings** — hours, holiday closures, pause deli or tray ordering, announcement banner, contact info
- **Messages** — Contact form submissions
- **Account** — change password, add/remove staff logins

## Project layout

```
server/   Express app, SQLite schema + seed data, auth, order validation
public/   Static site (HTML/CSS/vanilla JS); public/admin is the admin app
test/     node:test suite
```

## Photos

Pages show striped placeholders where photos go (e.g. `/images/home-deli.jpg`). Drop the store's own photos into `public/images/` and swap the placeholder `<div>`s for `<img>` tags.
