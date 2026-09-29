// Menu assembly and order validation shared by the public API and tests.

const DAY_MS = 86400e3;

/** Current wall-clock date/time in the store's time zone. */
export function storeNow(timezone, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Minutes since epoch for a store-local date + time (treated as UTC; only differences matter). */
const localStamp = (date, time) => Date.parse(`${date}T00:00:00Z`) / 60e3 + toMinutes(time);

/** Build the public menu: active products with their available options. */
export function getMenu(db, kind) {
  const products = db
    .prepare(
      `SELECT id, kind, name, description, base_price, lead_minutes, max_advance_days
         FROM products WHERE active = 1 ${kind ? 'AND kind = ?' : ''} ORDER BY sort, id`
    )
    .all(...(kind ? [kind] : []));
  const groupsStmt = db.prepare(
    'SELECT id, name, help, min_select, max_select FROM option_groups WHERE product_id = ? ORDER BY sort, id'
  );
  const optionsStmt = db.prepare(
    `SELECT o.id, o.name, o.price FROM options o
       LEFT JOIN ingredients i ON i.id = o.ingredient_id
      WHERE o.group_id = ? AND o.active = 1 AND COALESCE(i.in_stock, 1) = 1
      ORDER BY o.sort, o.id`
  );
  return products.map((p) => ({
    ...p,
    groups: groupsStmt.all(p.id).map((g) => ({ ...g, options: optionsStmt.all(g.id) })),
  }));
}

export class OrderError extends Error {}

function checkPickup(settings, date, time, leadMinutes, maxAdvanceDays, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new OrderError('Please choose a valid pickup date.');
  }
  if (!/^\d{2}:\d{2}$/.test(time)) throw new OrderError('Please choose a valid pickup time.');

  if ((settings.closed_dates || []).includes(date)) {
    throw new OrderError('The store is closed on that date. Please choose another day.');
  }
  const hours = settings.hours[new Date(`${date}T00:00:00Z`).getUTCDay()];
  if (!hours) throw new OrderError('The store is closed that day. Please choose another day.');

  const t = toMinutes(time);
  const cutoff = Number(settings.close_cutoff_minutes) || 0;
  if (t < toMinutes(hours.open) || t > toMinutes(hours.close) - cutoff) {
    throw new OrderError(
      `Pickup on that day must be between ${fmtTime(hours.open)} and ${fmtTime(minusMinutes(hours.close, cutoff))}.`
    );
  }

  const current = storeNow(settings.timezone, now);
  const diff = localStamp(date, time) - localStamp(current.date, current.time);
  if (diff < leadMinutes) {
    throw new OrderError(
      leadMinutes >= 60
        ? `This item needs at least ${Math.round(leadMinutes / 60)} hours' notice.`
        : `Please allow at least ${leadMinutes} minutes for your order to be made.`
    );
  }
  const daysOut = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${current.date}T00:00:00Z`)) / DAY_MS;
  if (daysOut > maxAdvanceDays) {
    throw new OrderError(`This item can be ordered up to ${maxAdvanceDays} days in advance.`);
  }
}

function minusMinutes(hhmm, m) {
  const t = toMinutes(hhmm) - m;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * Validate an order submission against the live menu and store settings.
 * Returns a normalized order ready to insert; throws OrderError with a
 * customer-friendly message on invalid input.
 */
export function validateOrder(db, settings, body, now = new Date()) {
  const customer = {
    name: clean(body?.name, 100),
    phone: clean(body?.phone, 30),
    email: clean(body?.email, 200),
    notes: clean(body?.notes, 1000),
  };
  if (!customer.name) throw new OrderError('Please enter your name.');
  if (customer.phone.replace(/\D/g, '').length < 10) throw new OrderError('Please enter a phone number we can reach you at.');
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    throw new OrderError('That email address doesn’t look right.');
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) throw new OrderError('Your order is empty.');
  if (items.length > 50) throw new OrderError('That’s a big order! Please call the store to place it.');

  const menu = new Map(getMenu(db).map((p) => [p.id, p]));
  let leadMinutes = 0;
  let maxAdvance = Infinity;
  let total = 0;
  let unpriced = false;

  const lines = items.map((item) => {
    const product = menu.get(Number(item?.productId));
    if (!product) throw new OrderError('One of the items in your order is no longer available.');
    const enabled = product.kind === 'deli' ? settings.deli_ordering_enabled : settings.tray_ordering_enabled;
    if (!enabled) {
      throw new OrderError(`Online ${product.kind === 'deli' ? 'deli' : 'party tray'} ordering is paused right now. Please call the store.`);
    }

    const quantity = Math.floor(Number(item.quantity) || 0);
    if (quantity < 1 || quantity > 100) throw new OrderError(`Please enter a quantity between 1 and 100 for ${product.name}.`);

    const chosen = new Set((Array.isArray(item.optionIds) ? item.optionIds : []).map(Number));
    let unitPrice = product.base_price ?? 0;
    const selections = product.groups.map((g) => {
      const picked = g.options.filter((o) => chosen.has(o.id));
      picked.forEach((o) => chosen.delete(o.id));
      if (picked.length < g.min_select) {
        throw new OrderError(`${product.name}: please choose ${g.min_select === 1 ? 'a' : `at least ${g.min_select}`} ${g.name.toLowerCase()}.`);
      }
      if (g.max_select > 0 && picked.length > g.max_select) {
        throw new OrderError(`${product.name}: choose no more than ${g.max_select} for ${g.name.toLowerCase()}.`);
      }
      unitPrice += picked.reduce((s, o) => s + o.price, 0);
      return { group: g.name, options: picked.map((o) => ({ name: o.name, price: o.price })) };
    }).filter((s) => s.options.length > 0);
    if (chosen.size > 0) {
      throw new OrderError(`${product.name}: one of your choices just sold out. Please review your selections.`);
    }

    leadMinutes = Math.max(leadMinutes, product.lead_minutes);
    maxAdvance = Math.min(maxAdvance, product.max_advance_days);
    if (product.base_price == null) unpriced = true;
    unitPrice = Math.round(unitPrice * 100) / 100;
    total += unitPrice * quantity;

    return {
      productId: product.id,
      productName: product.name,
      kind: product.kind,
      quantity,
      selections,
      instructions: clean(item.instructions, 500),
      unitPrice: product.base_price == null ? null : unitPrice,
    };
  });

  const pickupDate = clean(body?.pickupDate, 10);
  const pickupTime = clean(body?.pickupTime, 5);
  checkPickup(settings, pickupDate, pickupTime, leadMinutes, maxAdvance, now);

  return {
    customer, pickupDate, pickupTime, lines,
    estTotal: Math.round(total * 100) / 100,
    hasUnpriced: unpriced,
  };
}

export function insertOrder(db, order) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO orders (customer_name, phone, email, pickup_date, pickup_time, notes, est_total, has_unpriced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(order.customer.name, order.customer.phone, order.customer.email, order.pickupDate, order.pickupTime,
      order.customer.notes, order.estTotal, order.hasUnpriced ? 1 : 0);
  const line = db.prepare(
    `INSERT INTO order_lines (order_id, product_id, product_name, kind, quantity, selections, instructions, unit_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const l of order.lines) {
    line.run(lastInsertRowid, l.productId, l.productName, l.kind, l.quantity, JSON.stringify(l.selections),
      l.instructions, l.unitPrice);
  }
  return Number(lastInsertRowid);
}
