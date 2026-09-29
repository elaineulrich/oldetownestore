// Store admin single-page app. Views are chosen by the URL hash.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STATUSES = { new: 'New', preparing: 'Preparing', ready: 'Ready', picked_up: 'Picked up', cancelled: 'Cancelled' };
const view = document.getElementById('view');

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtDate(d) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

let toastTimer;
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), isError ? 5000 : 2000);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    showLogin();
    throw new Error('Please sign in.');
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

/** Run an API write and report success/failure with a toast. Returns true on success. */
async function save(path, method, body, okMsg = 'Saved') {
  try {
    await api(path, { method, body });
    toast(okMsg);
    refreshBadges();
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
}

// ---------- Auth ----------
function showLogin() {
  document.getElementById('shell').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
  document.getElementById('l-user').focus();
}
function showShell() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('shell').classList.remove('hidden');
  route();
}
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('login-error');
  err.classList.add('hidden');
  try {
    await api('/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    e.target.reset();
    showShell();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});
document.getElementById('logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST', body: {} }).catch(() => {});
  showLogin();
});

// ---------- Badges ----------
async function refreshBadges() {
  try {
    const s = await api('/summary');
    document.getElementById('badge-orders').textContent = s.newOrders || '';
    document.getElementById('badge-messages').textContent = s.unreadMessages || '';
    document.getElementById('badge-stock').textContent = s.outOfStock || '';
    return s;
  } catch {
    return null;
  }
}

// ---------- Router ----------
const VIEWS = {
  dashboard: renderDashboard,
  orders: renderOrders,
  menu: renderMenu,
  ingredients: renderIngredients,
  bakery: renderBakery,
  settings: renderSettings,
  messages: renderMessages,
  account: renderAccount,
};
async function route() {
  const name = location.hash.slice(1).split('?')[0] || 'dashboard';
  const fn = VIEWS[name] || renderDashboard;
  document.querySelectorAll('#side-nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${name}`));
  view.onclick = null;
  view.onchange = null;
  view.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await fn();
  } catch (err) {
    view.innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
  }
  view.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);

// ---------- Dashboard ----------
async function renderDashboard() {
  const s = await refreshBadges();
  const orders = await api(`/orders?date=${s.today}`);
  const open = orders.filter((o) => !['picked_up', 'cancelled'].includes(o.status));
  view.innerHTML = `
    <h1>Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}!</h1>
    <div class="stats">
      <a class="stat" href="#orders"><b>${s.newOrders}</b>New orders</a>
      <a class="stat" href="#orders"><b>${s.todayPickups}</b>Pickups today</a>
      <a class="stat" href="#ingredients"><b>${s.outOfStock}</b>Items marked out of stock</a>
      <a class="stat" href="#messages"><b>${s.unreadMessages}</b>Unread messages</a>
    </div>
    <div class="panel">
      <h2>Today's pickups (${fmtDate(s.today)})</h2>
      <div id="today-orders">${open.length ? '' : '<p class="muted">No open orders for today.</p>'}</div>
    </div>`;
  renderOrderCards(document.getElementById('today-orders'), open, renderDashboard);
}

// ---------- Orders ----------
async function renderOrders() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const status = params.get('status') ?? 'open';
  const date = params.get('date') || '';
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (date) q.set('date', date);
  const orders = await api(`/orders?${q}`);
  view.innerHTML = `
    <h1>Orders</h1>
    <div class="toolbar">
      <div class="field"><label for="f-status">Show</label>
        <select id="f-status">
          <option value="open">Open orders</option>
          ${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          <option value="">All orders</option>
        </select></div>
      <div class="field"><label for="f-date">Pickup date</label><input id="f-date" type="date" value="${esc(date)}"></div>
      <button class="btn small secondary" id="f-clear" type="button">Clear date</button>
      <button class="btn small" type="button" onclick="window.print()">Print list</button>
    </div>
    <p class="muted">${orders.length} order${orders.length === 1 ? '' : 's'} · sorted by pickup time</p>
    <div id="order-list"></div>`;
  document.getElementById('f-status').value = status;
  const go = () => {
    const n = new URLSearchParams();
    n.set('status', document.getElementById('f-status').value);
    const d = document.getElementById('f-date').value;
    if (d) n.set('date', d);
    location.hash = `orders?${n}`;
  };
  document.getElementById('f-status').onchange = go;
  document.getElementById('f-date').onchange = go;
  document.getElementById('f-clear').onclick = () => {
    document.getElementById('f-date').value = '';
    go();
  };
  renderOrderCards(document.getElementById('order-list'), orders, renderOrders);
}

function renderOrderCards(container, orders, rerender) {
  if (!orders.length) {
    container.innerHTML ||= '<p class="muted">No orders found.</p>';
    return;
  }
  container.innerHTML = orders
    .map((o) => `
    <article class="order-card s-${o.status}">
      <div class="order-head">
        <div>
          <h3>#${o.id} · ${esc(o.customer_name)}</h3>
          <div><a href="tel:${esc(o.phone.replace(/\D/g, ''))}">${esc(o.phone)}</a>${o.email ? ` · <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ''}</div>
        </div>
        <div style="text-align:right">
          <div><strong>Pickup: ${fmtDate(o.pickup_date)} at ${fmtTime(o.pickup_time)}</strong></div>
          <div class="muted" style="font-size:.9rem">Placed ${new Date(`${o.created_at.replace(' ', 'T')}Z`).toLocaleString()}</div>
          <span class="status-pill">${STATUSES[o.status]}</span>
        </div>
      </div>
      <ul class="order-lines">
        ${o.lines.map((l) => `<li><strong>${l.quantity} × ${esc(l.product_name)}</strong>${l.unit_price != null ? ` — ${money(l.unit_price * l.quantity)}` : ''}
          <div class="sel">${l.selections.map((s) => `${esc(s.group)}: ${s.options.map((x) => esc(x.name)).join(', ')}`).join('<br>')}</div>
          ${l.instructions ? `<div><em>Instructions: ${esc(l.instructions)}</em></div>` : ''}</li>`).join('')}
      </ul>
      ${o.notes ? `<p><strong>Customer notes:</strong> ${esc(o.notes)}</p>` : ''}
      <p><strong>Estimated total:</strong> ${o.has_unpriced && !o.est_total ? 'Priced at counter' : `${money(o.est_total)}${o.has_unpriced ? ' + items priced at counter' : ''} (before tax)`}</p>
      <div class="status-actions">
        ${Object.entries(STATUSES).filter(([k]) => k !== o.status)
          .map(([k, v]) => `<button class="icon-btn${k === 'cancelled' ? ' danger' : ''}" data-order="${o.id}" data-status="${k}">Mark ${v.toLowerCase()}</button>`).join('')}
      </div>
    </article>`)
    .join('');
  container.onclick = async (e) => {
    const b = e.target.closest('[data-status]');
    if (!b) return;
    if (b.dataset.status === 'cancelled' && !confirm(`Cancel order #${b.dataset.order}?`)) return;
    if (await save(`/orders/${b.dataset.order}`, 'PATCH', { status: b.dataset.status }, 'Order updated')) rerender();
  };
}

// ---------- Online menu (products / option groups / options) ----------
let openProducts = new Set();
async function renderMenu() {
  const [products, ingredients] = await Promise.all([api('/products'), api('/ingredients')]);
  const ingOptions = (sel) => `<option value="">— none —</option>${ingredients
    .map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.category)}: ${esc(i.name)}</option>`).join('')}`;
  const section = (kind, title, blurb) => `
    <h2 style="margin-top:28px">${title}</h2>
    <p class="muted">${blurb}</p>
    ${products.filter((p) => p.kind === kind).map(productHtml).join('') || '<p class="muted">No items yet.</p>'}`;

  function productHtml(p) {
    return `<details class="product" data-product="${p.id}" ${openProducts.has(p.id) ? 'open' : ''}>
      <summary>${esc(p.name)} ${p.active ? '' : '<span class="pill off">Hidden</span>'}
        <span class="pill">${p.base_price == null ? 'Priced at counter' : `Base ${money(p.base_price)}`}</span></summary>
      <div class="product-body">
        <div class="inline-fields">
          <div class="field"><label>Name</label><input data-pf="name" value="${esc(p.name)}"></div>
          <div class="field"><label>Base price <span class="hint">(blank = priced at counter)</span></label>
            <input data-pf="base_price" type="number" step="0.01" min="0" value="${p.base_price ?? ''}"></div>
          <div class="field"><label>Minimum notice (minutes)</label><input data-pf="lead_minutes" type="number" min="0" value="${p.lead_minutes}">
            <div class="hint">${p.lead_minutes >= 60 ? `${+(p.lead_minutes / 60).toFixed(1)} hours` : ''}</div></div>
          <div class="field"><label>Order up to (days ahead)</label><input data-pf="max_advance_days" type="number" min="0" value="${p.max_advance_days}"></div>
          <div class="field"><label>Section</label><select data-pf="kind"><option value="deli" ${p.kind === 'deli' ? 'selected' : ''}>Deli order page</option><option value="tray" ${p.kind === 'tray' ? 'selected' : ''}>Party tray page</option></select></div>
        </div>
        <div class="field"><label>Description</label><input data-pf="description" value="${esc(p.description)}"></div>
        <div class="toolbar">
          <label class="switch"><input type="checkbox" data-pf="active" ${p.active ? 'checked' : ''}> Show on website</label>
          <button class="icon-btn" data-act="move-product" data-dir="-1">↑ Move up</button>
          <button class="icon-btn" data-act="move-product" data-dir="1">↓ Move down</button>
          <button class="icon-btn" data-act="dup-product">Duplicate</button>
          <button class="icon-btn danger" data-act="del-product">Delete item</button>
        </div>
        ${p.groups.map((g) => groupHtml(g)).join('')}
        <div class="toolbar" style="margin-top:16px">
          <button class="btn small secondary" data-act="add-group">+ Add choice group</button>
        </div>
      </div>
    </details>`;
  }

  function groupHtml(g) {
    return `<div class="group-box" data-group="${g.id}">
      <header>
        <div class="field"><label>Choice group</label><input data-gf="name" value="${esc(g.name)}"></div>
        <div class="field"><label>Min picks</label><input data-gf="min_select" type="number" min="0" style="width:80px" value="${g.min_select}"></div>
        <div class="field"><label>Max picks <span class="hint">(0 = any)</span></label><input data-gf="max_select" type="number" min="0" style="width:80px" value="${g.max_select}"></div>
        <div class="field" style="flex:1;min-width:200px"><label>Help text</label><input data-gf="help" value="${esc(g.help)}" style="width:100%"></div>
        <button class="icon-btn" data-act="move-group" data-dir="-1" title="Move up">↑</button>
        <button class="icon-btn" data-act="move-group" data-dir="1" title="Move down">↓</button>
        <button class="icon-btn danger" data-act="del-group">Delete group</button>
      </header>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Option</th><th>Price add-on</th><th>Linked stock item</th><th>On menu</th><th></th></tr></thead>
        <tbody>
          ${g.options.map((o) => `<tr data-option="${o.id}">
            <td><input data-of="name" value="${esc(o.name)}"></td>
            <td><input data-of="price" type="number" step="0.01" min="0" value="${o.price}"></td>
            <td><select data-of="ingredient_id">${ingOptions(o.ingredient_id)}</select>
              ${o.ingredient_id && !o.ingredient_in_stock ? '<span class="pill off">Out of stock</span>' : ''}</td>
            <td><input type="checkbox" data-of="active" ${o.active ? 'checked' : ''} aria-label="On menu"></td>
            <td style="white-space:nowrap"><button class="icon-btn" data-act="move-option" data-dir="-1" title="Move up">↑</button>
              <button class="icon-btn" data-act="move-option" data-dir="1" title="Move down">↓</button>
              <button class="icon-btn danger" data-act="del-option" title="Delete">✕</button></td>
          </tr>`).join('')}
          <tr class="no-print"><td><input data-new="name" placeholder="New option name"></td>
            <td><input data-new="price" type="number" step="0.01" min="0" value="0"></td>
            <td><select data-new="ingredient_id">${ingOptions(null)}</select></td>
            <td></td><td><button class="icon-btn" data-act="add-option">+ Add</button></td></tr>
        </tbody>
      </table></div>
      <details style="padding:8px 12px"><summary class="hint" style="cursor:pointer">Add several from the stock list…</summary>
        <div class="toolbar" style="margin-top:8px">
          <select data-bulk-cat>${[...new Set(ingredients.map((i) => i.category))].map((c) => `<option>${esc(c)}</option>`).join('')}</select>
          <input data-bulk-price type="number" step="0.01" min="0" value="0" style="width:100px" aria-label="Price add-on">
          <button class="icon-btn" data-act="bulk-add">Add all not already in this group</button>
        </div>
      </details>
    </div>`;
  }

  view.innerHTML = `
    <h1>Online Menu</h1>
    <p class="muted">Everything customers can order online. Changes save automatically and appear on the website right away. Options linked to a stock item disappear from the website when that item is marked out of stock.</p>
    <div class="toolbar">
      <button class="btn small" data-act="add-product" data-kind="deli">+ New deli item</button>
      <button class="btn small secondary" data-act="add-product" data-kind="tray">+ New party tray</button>
    </div>
    ${section('deli', 'Deli (Order Online page)', 'Sandwiches, subs, wraps, and anything else ordered for same-day pickup.')}
    ${section('tray', 'Party Trays', 'Platters and trays that need advance notice.')}`;

  view.querySelectorAll('details[data-product]').forEach((d) =>
    d.addEventListener('toggle', () => {
      const id = Number(d.dataset.product);
      if (d.open) openProducts.add(id);
      else openProducts.delete(id);
    })
  );

  view.onchange = async (e) => {
    const el = e.target;
    const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
    const pid = el.closest('[data-product]')?.dataset.product;
    if (el.dataset.pf) {
      const ok = await save(`/products/${pid}`, 'PATCH', { [el.dataset.pf]: val });
      if (ok && ['active', 'base_price', 'kind', 'name', 'lead_minutes'].includes(el.dataset.pf)) renderMenu();
    } else if (el.dataset.gf) {
      await save(`/groups/${el.closest('[data-group]').dataset.group}`, 'PATCH', { [el.dataset.gf]: val ?? 0 });
    } else if (el.dataset.of) {
      const ok = await save(`/options/${el.closest('[data-option]').dataset.option}`, 'PATCH', { [el.dataset.of]: val });
      if (ok && el.dataset.of === 'ingredient_id') renderMenu();
    }
  };

  view.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    const act = b.dataset.act;
    const pEl = b.closest('[data-product]');
    const gEl = b.closest('[data-group]');
    const oEl = b.closest('[data-option]');
    const pid = pEl && Number(pEl.dataset.product);
    let ok = false;
    if (act === 'add-product') {
      const name = prompt(b.dataset.kind === 'tray' ? 'Name of the new party tray:' : 'Name of the new deli item:');
      if (!name) return;
      try {
        const { id } = await api('/products', { method: 'POST', body: { kind: b.dataset.kind, name, active: false } });
        openProducts.add(id);
        toast('Item created (hidden until you turn on "Show on website")');
        ok = true;
      } catch (err) {
        toast(err.message, true);
      }
    } else if (act === 'dup-product') {
      try {
        const { id } = await api(`/products/${pid}/duplicate`, { method: 'POST', body: {} });
        openProducts.add(id);
        toast('Duplicated (the copy is hidden)');
        ok = true;
      } catch (err) {
        toast(err.message, true);
      }
    } else if (act === 'del-product') {
      if (!confirm('Delete this item and all of its choices? Past orders are kept.')) return;
      ok = await save(`/products/${pid}`, 'DELETE', undefined, 'Deleted');
    } else if (act === 'add-group') {
      const name = prompt('Name of the new choice group (e.g. "Bread", "Toppings"):');
      if (!name) return;
      ok = await save(`/products/${pid}/groups`, 'POST', { name, min_select: 0, max_select: 1 }, 'Group added');
    } else if (act === 'del-group') {
      if (!confirm('Delete this choice group and its options?')) return;
      ok = await save(`/groups/${gEl.dataset.group}`, 'DELETE', undefined, 'Deleted');
    } else if (act === 'add-option') {
      const row = b.closest('tr');
      const name = row.querySelector('[data-new="name"]').value.trim();
      if (!name) return toast('Enter an option name first.', true);
      const ing = row.querySelector('[data-new="ingredient_id"]').value;
      ok = await save(`/groups/${gEl.dataset.group}/options`, 'POST', {
        name, price: Number(row.querySelector('[data-new="price"]').value) || 0, ingredient_id: ing ? Number(ing) : null,
      }, 'Option added');
    } else if (act === 'bulk-add') {
      const cat = gEl.querySelector('[data-bulk-cat]').value;
      const existing = new Set([...gEl.querySelectorAll('[data-of="ingredient_id"]')].map((s) => Number(s.value)));
      const ids = ingredients.filter((i) => i.category === cat && !existing.has(i.id)).map((i) => i.id);
      if (!ids.length) return toast('Nothing new to add from that list.');
      ok = await save(`/groups/${gEl.dataset.group}/options/from-ingredients`, 'POST',
        { ingredientIds: ids, price: Number(gEl.querySelector('[data-bulk-price]').value) || 0 }, `Added ${ids.length} options`);
    } else if (act === 'del-option') {
      ok = await save(`/options/${oEl.dataset.option}`, 'DELETE', undefined, 'Deleted');
    } else if (act.startsWith('move-')) {
      const [sel, attr, table] = {
        'move-product': ['[data-product]', 'product', 'products'],
        'move-group': ['[data-group]', 'group', 'option_groups'],
        'move-option': ['[data-option]', 'option', 'options'],
      }[act];
      const me = b.closest(sel);
      const siblings = [...me.parentElement.querySelectorAll(`:scope > ${sel}`)];
      const i = siblings.indexOf(me);
      const j = i + Number(b.dataset.dir);
      if (j < 0 || j >= siblings.length) return;
      [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
      ok = await save(`/reorder/${table}`, 'PUT', { ids: siblings.map((s) => Number(s.dataset[attr])) }, 'Order updated');
    }
    if (ok) renderMenu();
  };
}

// ---------- Ingredients / stock ----------
async function renderIngredients() {
  const items = await api('/ingredients');
  const cats = [...new Set(items.map((i) => i.category))];
  view.innerHTML = `
    <h1>Stock / 86 List</h1>
    <p class="muted">Uncheck anything you've run out of — it's hidden from online ordering everywhere it's used until you check it again.</p>
    ${cats.map((c) => `<div class="panel"><h2>${esc(c)}</h2><div class="stock-grid">
      ${items.filter((i) => i.category === c).map((i) => `<div class="stock-item ${i.in_stock ? '' : 'out'}" data-ing="${i.id}">
        <input type="checkbox" data-stock ${i.in_stock ? 'checked' : ''} aria-label="${esc(i.name)} in stock">
        <span>${esc(i.name)}</span>
        <button class="icon-btn" data-act="rename" title="Rename">✎</button>
        <button class="icon-btn danger" data-act="delete" title="Delete">✕</button>
      </div>`).join('')}
    </div></div>`).join('')}
    <div class="panel no-print">
      <h2>Add a stock item</h2>
      <form id="ing-add" class="toolbar">
        <div class="field"><label for="ing-cat">Category</label><input id="ing-cat" list="ing-cats" required placeholder="e.g. Meat"><datalist id="ing-cats">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</datalist></div>
        <div class="field"><label for="ing-name">Name</label><input id="ing-name" required></div>
        <button class="btn small" type="submit">Add</button>
      </form>
      <p class="hint">After adding, link it to menu options on the Online Menu page (or use “Add several from the stock list”).</p>
    </div>`;
  view.onchange = async (e) => {
    if (!e.target.matches('[data-stock]')) return;
    const row = e.target.closest('[data-ing]');
    if (await save(`/ingredients/${row.dataset.ing}`, 'PATCH', { in_stock: e.target.checked }, e.target.checked ? 'Back in stock' : 'Marked out of stock')) {
      row.classList.toggle('out', !e.target.checked);
    }
  };
  view.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const row = b.closest('[data-ing]');
    const item = items.find((i) => i.id === Number(row.dataset.ing));
    if (b.dataset.act === 'rename') {
      const name = prompt('New name (menu options linked to it are renamed too):', item.name);
      if (name && name !== item.name && (await save(`/ingredients/${item.id}`, 'PATCH', { name }))) renderIngredients();
    } else if (b.dataset.act === 'delete') {
      const warn = item.used_by ? ` It's linked to ${item.used_by} menu option(s); those options will stay but no longer track stock.` : '';
      if (confirm(`Delete "${item.name}"?${warn}`) && (await save(`/ingredients/${item.id}`, 'DELETE', undefined, 'Deleted'))) renderIngredients();
    }
  };
  document.getElementById('ing-add').onsubmit = async (e) => {
    e.preventDefault();
    const body = { category: document.getElementById('ing-cat').value, name: document.getElementById('ing-name').value };
    if (await save('/ingredients', 'POST', body, 'Added')) renderIngredients();
  };
}

// ---------- Bakery ----------
async function renderBakery() {
  const cats = await api('/bakery');
  view.innerHTML = `
    <h1>Bakery Menu</h1>
    <p class="muted">The price list shown on the Bakery page. Uncheck “Shown” to hide an item without deleting it.</p>
    ${cats.map((c) => `<div class="panel" data-cat="${c.id}">
      <div class="toolbar">
        <div class="field"><label>Category</label><input data-cf="name" value="${esc(c.name)}"></div>
        <div class="field" style="flex:1"><label>Note <span class="hint">(optional)</span></label><input data-cf="note" value="${esc(c.note)}" style="width:100%"></div>
        <button class="icon-btn" data-act="move-cat" data-dir="-1">↑</button>
        <button class="icon-btn" data-act="move-cat" data-dir="1">↓</button>
        <button class="icon-btn danger" data-act="del-cat">Delete category</button>
      </div>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Item</th><th>Price</th><th>Shown</th><th></th></tr></thead><tbody>
        ${c.items.map((i) => `<tr data-item="${i.id}">
          <td><input data-if="name" value="${esc(i.name)}"></td>
          <td><input data-if="price" type="number" step="0.01" min="0" value="${i.price ?? ''}"></td>
          <td><input type="checkbox" data-if="active" ${i.active ? 'checked' : ''} aria-label="Shown"></td>
          <td style="white-space:nowrap"><button class="icon-btn" data-act="move-item" data-dir="-1">↑</button>
            <button class="icon-btn" data-act="move-item" data-dir="1">↓</button>
            <button class="icon-btn danger" data-act="del-item">✕</button></td></tr>`).join('')}
        <tr class="no-print"><td><input data-new="name" placeholder="New item"></td><td><input data-new="price" type="number" step="0.01" min="0"></td><td></td>
          <td><button class="icon-btn" data-act="add-item">+ Add</button></td></tr>
      </tbody></table></div>
    </div>`).join('')}
    <button class="btn small" data-act="add-cat">+ Add category</button>`;

  view.onchange = async (e) => {
    const el = e.target;
    const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
    if (el.dataset.cf) await save(`/bakery/categories/${el.closest('[data-cat]').dataset.cat}`, 'PATCH', { [el.dataset.cf]: val });
    if (el.dataset.if) await save(`/bakery/items/${el.closest('[data-item]').dataset.item}`, 'PATCH', { [el.dataset.if]: val });
  };
  view.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const catEl = b.closest('[data-cat]');
    let ok = false;
    switch (b.dataset.act) {
      case 'add-cat': {
        const name = prompt('Category name:');
        if (name) ok = await save('/bakery/categories', 'POST', { name }, 'Category added');
        break;
      }
      case 'del-cat':
        if (confirm('Delete this category and all its items?')) ok = await save(`/bakery/categories/${catEl.dataset.cat}`, 'DELETE', undefined, 'Deleted');
        break;
      case 'add-item': {
        const row = b.closest('tr');
        const name = row.querySelector('[data-new="name"]').value.trim();
        const price = row.querySelector('[data-new="price"]').value;
        if (!name) return toast('Enter an item name first.', true);
        ok = await save('/bakery/items', 'POST', { name, price: price === '' ? null : Number(price), category_id: Number(catEl.dataset.cat) }, 'Item added');
        break;
      }
      case 'del-item':
        ok = await save(`/bakery/items/${b.closest('[data-item]').dataset.item}`, 'DELETE', undefined, 'Deleted');
        break;
      case 'move-cat':
      case 'move-item': {
        const isCat = b.dataset.act === 'move-cat';
        const me = isCat ? catEl : b.closest('[data-item]');
        const sibs = [...me.parentElement.querySelectorAll(isCat ? ':scope > [data-cat]' : ':scope > [data-item]')];
        const i = sibs.indexOf(me);
        const j = i + Number(b.dataset.dir);
        if (j < 0 || j >= sibs.length) return;
        [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
        ok = await save(`/reorder/${isCat ? 'bakery_categories' : 'bakery_items'}`, 'PUT',
          { ids: sibs.map((s) => Number(isCat ? s.dataset.cat : s.dataset.item)) }, 'Order updated');
        break;
      }
    }
    if (ok) renderBakery();
  };
}

// ---------- Store settings ----------
async function renderSettings() {
  const [s, email] = await Promise.all([api('/settings'), api('/email-status')]);
  view.innerHTML = `
    <h1>Store Settings</h1>
    <form id="settings-form">
      <div class="panel">
        <h2>Online ordering</h2>
        <p><label class="switch"><input type="checkbox" name="deli_ordering_enabled" ${s.deli_ordering_enabled ? 'checked' : ''}> Accept online deli orders</label></p>
        <p><label class="switch"><input type="checkbox" name="tray_ordering_enabled" ${s.tray_ordering_enabled ? 'checked' : ''}> Accept online party tray orders</label></p>
        <div class="field" style="max-width:360px"><label for="cutoff">Stop taking orders this many minutes before closing</label>
          <input id="cutoff" name="close_cutoff_minutes" type="number" min="0" max="240" value="${s.close_cutoff_minutes}"></div>
        <div class="field"><label for="announce">Announcement banner <span class="hint">(shown at the top of every page; leave blank to hide)</span></label>
          <input id="announce" name="announcement" maxlength="500" value="${esc(s.announcement)}" placeholder="e.g. Closed Thursday for Thanksgiving — order pies by Monday!"></div>
      </div>
      <div class="panel">
        <h2>Store hours</h2>
        <p class="hint">Customers can only choose pickup times within these hours.</p>
        <div class="hours-edit">
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const h = s.hours[d];
            return `<strong>${DAYS[d]}</strong>
              <label class="switch"><input type="checkbox" data-day-open="${d}" ${h ? 'checked' : ''}> Open</label>
              <input type="time" data-day-from="${d}" value="${h?.open || '08:00'}" ${h ? '' : 'disabled'} aria-label="${DAYS[d]} opening time">
              <input type="time" data-day-to="${d}" value="${h?.close || '17:00'}" ${h ? '' : 'disabled'} aria-label="${DAYS[d]} closing time">`;
          }).join('')}
        </div>
        <h3 style="margin-top:24px">Holiday &amp; special closures</h3>
        <p class="hint">No online orders can be picked up on these dates.</p>
        <div id="closed-list" class="tags" style="margin-bottom:12px"></div>
        <div class="toolbar"><input type="date" id="closed-add"><button type="button" class="btn small secondary" id="closed-add-btn">Add closed date</button></div>
      </div>
      <div class="panel">
        <h2>New order email alerts</h2>
        ${email.configured ? '' : '<div class="alert info">Email isn’t connected on the server yet, so alerts won’t send. Ask your web developer to add the SMTP settings.</div>'}
        <div class="field"><label for="alert-emails">Send an email for every new online order to</label>
          <textarea id="alert-emails" name="order_alert_emails" rows="2" placeholder="orders@example.com, manager@example.com">${esc((s.order_alert_emails || []).join(', '))}</textarea>
          <div class="hint">Separate addresses with commas. Leave blank to turn alerts off. Replying to an alert emails the customer when they gave an address.</div></div>
        <button type="button" class="btn small secondary" id="email-test" ${email.configured ? '' : 'disabled'}>Send test email</button>
      </div>
      <div class="panel">
        <h2>Contact information</h2>
        <div class="inline-fields">
          <div class="field"><label>Store name</label><input name="store_name" value="${esc(s.store_name)}"></div>
          <div class="field"><label>Phone</label><input name="phone" value="${esc(s.phone)}"></div>
          <div class="field"><label>Email <span class="hint">(optional)</span></label><input name="email" type="email" value="${esc(s.email)}"></div>
        </div>
        <div class="field"><label>Address</label><input name="address" value="${esc(s.address)}"></div>
        <div class="field"><label>Facebook page URL</label><input name="facebook_url" value="${esc(s.facebook_url)}"></div>
        <div class="field"><label>Newsletter sign-up URL</label><input name="newsletter_url" value="${esc(s.newsletter_url)}"></div>
      </div>
      <button class="btn" type="submit">Save settings</button>
    </form>`;

  let closed = [...(s.closed_dates || [])];
  const drawClosed = () => {
    document.getElementById('closed-list').innerHTML = closed.length
      ? closed.map((d) => `<span class="tag">${fmtDate(d)} <button type="button" class="link-btn" data-rm="${d}" aria-label="Remove">✕</button></span>`).join('')
      : '<span class="muted">None</span>';
  };
  drawClosed();
  document.getElementById('closed-list').onclick = (e) => {
    if (e.target.dataset.rm) {
      closed = closed.filter((d) => d !== e.target.dataset.rm);
      drawClosed();
    }
  };
  document.getElementById('closed-add-btn').onclick = () => {
    const v = document.getElementById('closed-add').value;
    if (v && !closed.includes(v)) closed = [...closed, v].sort();
    drawClosed();
  };
  view.querySelectorAll('[data-day-open]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const d = cb.dataset.dayOpen;
      view.querySelector(`[data-day-from="${d}"]`).disabled = !cb.checked;
      view.querySelector(`[data-day-to="${d}"]`).disabled = !cb.checked;
    })
  );
  document.getElementById('settings-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      deli_ordering_enabled: f.deli_ordering_enabled.checked,
      tray_ordering_enabled: f.tray_ordering_enabled.checked,
      close_cutoff_minutes: Number(f.close_cutoff_minutes.value),
      announcement: f.announcement.value,
      store_name: f.store_name.value,
      phone: f.phone.value,
      email: f.email.value,
      address: f.address.value,
      facebook_url: f.facebook_url.value,
      newsletter_url: f.newsletter_url.value,
      order_alert_emails: f.order_alert_emails.value,
      closed_dates: closed,
      hours: [0, 1, 2, 3, 4, 5, 6].map((d) =>
        view.querySelector(`[data-day-open="${d}"]`).checked
          ? { open: view.querySelector(`[data-day-from="${d}"]`).value, close: view.querySelector(`[data-day-to="${d}"]`).value }
          : null
      ),
    };
    await save('/settings', 'PUT', body, 'Settings saved');
  };
  document.getElementById('email-test').onclick = async () => {
    try {
      const r = await api('/email-test', { method: 'POST', body: {} });
      toast(`Test email sent to ${r.sentTo.join(', ')}`);
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ---------- Messages ----------
async function renderMessages() {
  const msgs = await api('/messages');
  view.innerHTML = `<h1>Messages</h1>
    <p class="muted">Sent from the Contact page.</p>
    ${msgs.length ? msgs.map((m) => `<div class="panel" data-msg="${m.id}" style="${m.read ? 'opacity:.7' : 'border-left:5px solid var(--gold)'}">
      <div class="order-head"><div><strong>${esc(m.name)}</strong> · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${m.phone ? ` · ${esc(m.phone)}` : ''}</div>
      <div class="muted">${new Date(`${m.created_at.replace(' ', 'T')}Z`).toLocaleString()}</div></div>
      <p style="white-space:pre-wrap">${esc(m.body)}</p>
      <div class="status-actions"><button class="icon-btn" data-act="read" data-val="${m.read ? 0 : 1}">${m.read ? 'Mark unread' : 'Mark read'}</button>
      <button class="icon-btn danger" data-act="del">Delete</button></div></div>`).join('') : '<p class="muted">No messages yet.</p>'}`;
  view.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('[data-msg]').dataset.msg;
    const ok = b.dataset.act === 'read'
      ? await save(`/messages/${id}`, 'PATCH', { read: b.dataset.val === '1' }, 'Updated')
      : confirm('Delete this message?') && (await save(`/messages/${id}`, 'DELETE', undefined, 'Deleted'));
    if (ok) renderMessages();
  };
}

// ---------- Account ----------
async function renderAccount() {
  const [me, users] = await Promise.all([api('/me'), api('/users')]);
  view.innerHTML = `<h1>Account</h1>
    <div class="panel" style="max-width:480px">
      <h2>Change your password</h2>
      <p class="muted">Signed in as <strong>${esc(me.username)}</strong></p>
      <form id="pw-form">
        <div class="field"><label for="pw-cur">Current password</label><input id="pw-cur" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="pw-new">New password <span class="hint">(10+ characters)</span></label><input id="pw-new" type="password" autocomplete="new-password" minlength="10" required></div>
        <button class="btn small" type="submit">Update password</button>
      </form>
    </div>
    <div class="panel" style="max-width:640px">
      <h2>Staff accounts</h2>
      <table class="grid"><thead><tr><th>Username</th><th>Created</th><th></th></tr></thead><tbody>
        ${users.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.created_at.slice(0, 10))}</td>
          <td>${u.username === me.username ? '<span class="pill">You</span>' : `<button class="icon-btn danger" data-del-user="${u.id}">Remove</button>`}</td></tr>`).join('')}
      </tbody></table>
      <form id="user-form" class="toolbar" style="margin-top:16px">
        <div class="field"><label for="u-name">Username</label><input id="u-name" required></div>
        <div class="field"><label for="u-pass">Temporary password</label><input id="u-pass" type="text" minlength="10" required></div>
        <button class="btn small" type="submit">Add staff account</button>
      </form>
    </div>`;
  document.getElementById('pw-form').onsubmit = async (e) => {
    e.preventDefault();
    if (await save('/password', 'POST', { current: document.getElementById('pw-cur').value, next: document.getElementById('pw-new').value }, 'Password updated')) e.target.reset();
  };
  document.getElementById('user-form').onsubmit = async (e) => {
    e.preventDefault();
    if (await save('/users', 'POST', { username: document.getElementById('u-name').value, password: document.getElementById('u-pass').value }, 'Account added')) renderAccount();
  };
  view.onclick = async (e) => {
    const id = e.target.dataset.delUser;
    if (id && confirm('Remove this staff account?') && (await save(`/users/${id}`, 'DELETE', undefined, 'Removed'))) renderAccount();
  };
}

// ---------- Boot ----------
api('/me').then(showShell).catch(() => {});
setInterval(() => {
  if (!document.getElementById('shell').classList.contains('hidden')) refreshBadges();
}, 60e3);
