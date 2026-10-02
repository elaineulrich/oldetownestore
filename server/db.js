import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { seed } from './seed.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Shared ingredient library (meats, cheeses, breads...). Marking an ingredient
-- out of stock hides it from every product option that uses it.
CREATE TABLE IF NOT EXISTS ingredients (
  id       INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  name     TEXT NOT NULL,
  in_stock INTEGER NOT NULL DEFAULT 1,
  sort     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (category, name)
);

-- Orderable items. kind = 'deli' (sandwiches, subs, wraps) or 'tray' (party trays).
CREATE TABLE IF NOT EXISTS products (
  id                 INTEGER PRIMARY KEY,
  kind               TEXT NOT NULL CHECK (kind IN ('deli', 'tray')),
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  base_price         REAL,             -- NULL means "priced at pickup"
  lead_minutes       INTEGER NOT NULL DEFAULT 15,
  max_advance_days   INTEGER NOT NULL DEFAULT 7,
  active             INTEGER NOT NULL DEFAULT 1,
  sort               INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS option_groups (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  help        TEXT NOT NULL DEFAULT '',
  min_select  INTEGER NOT NULL DEFAULT 0,
  max_select  INTEGER NOT NULL DEFAULT 1,  -- 0 = unlimited
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS options (
  id             INTEGER PRIMARY KEY,
  group_id       INTEGER NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  price          REAL NOT NULL DEFAULT 0,
  ingredient_id  INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  customer_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT NOT NULL DEFAULT '',
  pickup_date    TEXT NOT NULL,
  pickup_time    TEXT NOT NULL,
  notes          TEXT NOT NULL DEFAULT '',
  est_total      REAL,
  has_unpriced   INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'preparing', 'ready', 'picked_up', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS order_lines (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER,
  product_name  TEXT NOT NULL,
  kind          TEXT NOT NULL,
  quantity      INTEGER NOT NULL,
  selections    TEXT NOT NULL,      -- JSON: [{group, options:[{name, price}]}]
  instructions  TEXT NOT NULL DEFAULT '',
  unit_price    REAL
);

CREATE TABLE IF NOT EXISTS bakery_categories (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  note  TEXT NOT NULL DEFAULT '',
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bakery_items (
  id           INTEGER PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES bakery_categories(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  price        REAL,
  active       INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0
);

-- Customer reviews the store chooses to feature (e.g. copied from Google).
CREATE TABLE IF NOT EXISTS reviews (
  id           INTEGER PRIMARY KEY,
  author       TEXT NOT NULL,
  rating       INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  body         TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'Google',
  review_date  TEXT NOT NULL DEFAULT '',
  active       INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0
);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM products').get();
  if (n === 0) seed(db);
  return db;
}

/** Run fn inside a transaction, rolling back on error. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSettings(db) {
  const out = {};
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) {
    out[key] = JSON.parse(value);
  }
  return out;
}

export function setSetting(db, key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(value));
}
