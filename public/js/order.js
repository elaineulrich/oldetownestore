// Online ordering: item builder, cart, and checkout.
// The page sets data-kind="deli" or "tray" on #order-app to choose which menu to show.
import { esc, money, fmtTime, loadSettings } from '/js/site.js';

const CART_KEY = 'otcs_cart';
const app = document.getElementById('order-app');
const kind = app.dataset.kind;

const state = { menu: [], allMenu: [], settings: null, product: null, cart: loadCart() };

function loadCart() {
  try {
    const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(c) ? c : [];
  } catch {
    return [];
  }
}
function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch {
    /* storage unavailable: cart lives for this page view only */
  }
  const badge = document.getElementById('cart-count');
  if (badge) badge.textContent = state.cart.reduce((n, l) => n + l.quantity, 0) || '';
}

const $ = (sel) => app.querySelector(sel);

function priceLabel(p) {
  return p > 0 ? `+${money(p)}` : '';
}

function groupRule(g) {
  if (g.min_select === 1 && g.max_select === 1) return 'Choose 1 (required)';
  const parts = [];
  if (g.min_select > 0) parts.push(`at least ${g.min_select}`);
  if (g.max_select > 0) parts.push(`up to ${g.max_select}`);
  return parts.length ? `Choose ${parts.join(', ')}` : 'Choose as many as you like (optional)';
}

// ---------- Builder ----------
function renderPicker() {
  const picker = $('#product-picker');
  if (state.menu.length === 0) {
    picker.innerHTML = '';
    $('#builder').innerHTML = `<p class="muted">Nothing is available to order online right now. Please call us at <a href="tel:${state.settings.phone.replace(/\D/g, '')}">${esc(state.settings.phone)}</a>.</p>`;
    return;
  }
  if (state.menu.length === 1) {
    picker.innerHTML = '';
    return;
  }
  picker.innerHTML = state.menu
    .map((p) => `<button type="button" class="product-choice" data-id="${p.id}" aria-pressed="${state.product?.id === p.id}">
        <strong>${esc(p.name)}</strong><span>${esc(p.description)}</span></button>`)
    .join('');
  picker.onclick = (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    state.product = state.menu.find((p) => p.id === Number(btn.dataset.id));
    renderPicker();
    renderBuilder();
    $('#builder').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function renderBuilder() {
  const p = state.product;
  const el = $('#builder');
  if (!p) {
    el.innerHTML = '<p class="muted">Choose an item above to get started.</p>';
    return;
  }
  el.innerHTML = `
    <form id="item-form" novalidate>
      <h2>${esc(p.name)}</h2>
      ${p.base_price != null && p.base_price > 0 ? `<p>Starts at <strong>${money(p.base_price)}</strong></p>` : ''}
      ${p.groups
        .map((g) => {
          const single = g.max_select === 1;
          return `<fieldset class="group" data-group="${g.id}">
            <legend>${esc(g.name)}</legend>
            <div class="rule">${esc(g.help ? `${g.help} ` : '')}${groupRule(g)}</div>
            <div class="opts">
              ${g.options
                .map((o) => `<label class="opt"><input type="${single ? 'radio' : 'checkbox'}" name="g${g.id}" value="${o.id}"
                  ${single && g.min_select === 0 ? 'data-toggle' : ''}>
                  <span>${esc(o.name)}</span><span class="p">${priceLabel(o.price)}</span></label>`)
                .join('')}
            </div>
          </fieldset>`;
        })
        .join('')}
      <div class="field">
        <label for="instructions">Special instructions <span class="hint">(optional)</span></label>
        <textarea id="instructions" rows="2" maxlength="500" placeholder="e.g. light mayo, cut in half"></textarea>
      </div>
      <div class="qty-row">
        <div class="field">
          <label for="qty">Quantity</label>
          <input id="qty" type="number" min="1" max="100" value="1" inputmode="numeric">
        </div>
        <button class="btn" type="submit">Add to Order<span id="item-price"></span></button>
      </div>
      <div id="item-error" class="alert error hidden" role="alert" style="margin-top:16px"></div>
    </form>`;

  const form = $('#item-form');
  // Let optional single-choice groups be un-selected by clicking the chosen option again.
  form.addEventListener('click', (e) => {
    const input = e.target.closest('input[data-toggle]');
    if (!input) return;
    if (input.dataset.was === 'on') {
      input.checked = false;
      input.dataset.was = '';
    } else {
      form.querySelectorAll(`input[name="${input.name}"]`).forEach((i) => (i.dataset.was = ''));
      input.dataset.was = 'on';
    }
    update();
  });
  form.addEventListener('change', update);
  form.addEventListener('input', update);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addToCart();
  });
  update();

  function update() {
    // Enforce max selections by disabling extra checkboxes.
    for (const g of p.groups) {
      if (g.max_select <= 1) continue;
      const boxes = [...form.querySelectorAll(`input[name="g${g.id}"]`)];
      const n = boxes.filter((b) => b.checked).length;
      boxes.forEach((b) => (b.disabled = !b.checked && n >= g.max_select));
    }
    const { unit } = currentSelection();
    const qty = Math.max(1, Number($('#qty').value) || 1);
    $('#item-price').textContent = p.base_price == null ? '' : ` · ${money(unit * qty)}`;
  }
}

function currentSelection() {
  const p = state.product;
  const form = $('#item-form');
  const ids = [...form.querySelectorAll('input:checked')].map((i) => Number(i.value));
  const chosen = p.groups.map((g) => ({ group: g, options: g.options.filter((o) => ids.includes(o.id)) }));
  const unit = (p.base_price ?? 0) + chosen.reduce((s, c) => s + c.options.reduce((a, o) => a + o.price, 0), 0);
  return { ids, chosen, unit: Math.round(unit * 100) / 100 };
}

function addToCart() {
  const p = state.product;
  const err = $('#item-error');
  const { ids, chosen, unit } = currentSelection();
  const missing = chosen.find((c) => c.options.length < c.group.min_select);
  if (missing) {
    err.textContent = `Please choose ${missing.group.min_select === 1 ? 'a' : `at least ${missing.group.min_select}`} ${missing.group.name.toLowerCase()}.`;
    err.classList.remove('hidden');
    missing.group && app.querySelector(`[data-group="${missing.group.id}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const quantity = Math.min(100, Math.max(1, Math.floor(Number($('#qty').value) || 1)));
  state.cart.push({
    productId: p.id,
    optionIds: ids,
    quantity,
    instructions: $('#instructions').value.trim(),
    name: p.name,
    kind: p.kind,
    summary: chosen.filter((c) => c.options.length).map((c) => `${c.group.name}: ${c.options.map((o) => o.name).join(', ')}`),
    unitPrice: p.base_price == null ? null : unit,
  });
  saveCart();
  renderCart();
  renderBuilder();
  const note = $('#cart-note');
  note.textContent = `Added ${quantity} × ${p.name} to your order.`;
  note.classList.remove('hidden');
  if (window.matchMedia('(max-width: 960px)').matches) $('#cart').scrollIntoView({ behavior: 'smooth' });
}

// ---------- Cart & checkout ----------
function leadMinutes() {
  return Math.max(0, ...state.cart.map((l) => state.allMenu.find((p) => p.id === l.productId)?.lead_minutes ?? 0));
}
function maxAdvance() {
  return Math.min(60, ...state.cart.map((l) => state.allMenu.find((p) => p.id === l.productId)?.max_advance_days ?? 7));
}

function renderCart() {
  const list = $('#cart-items');
  const empty = state.cart.length === 0;
  $('#checkout').classList.toggle('hidden', empty);
  if (empty) {
    list.innerHTML = '<li class="muted">Your order is empty.</li>';
    $('#cart-total').innerHTML = '';
    return;
  }
  list.innerHTML = state.cart
    .map((l, i) => `<li>
      <div class="line-head"><span>${l.quantity} × ${esc(l.name)}</span><span>${l.unitPrice == null ? '' : money(l.unitPrice * l.quantity)}</span></div>
      <div class="line-detail">${l.summary.map(esc).join('<br>')}${l.instructions ? `<br><em>“${esc(l.instructions)}”</em>` : ''}</div>
      <button type="button" class="link-btn" data-remove="${i}">Remove</button>
    </li>`)
    .join('');
  const priced = state.cart.filter((l) => l.unitPrice != null);
  const total = priced.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const unpriced = priced.length < state.cart.length;
  $('#cart-total').innerHTML = `<div class="cart-total"><span>Estimated total</span><span>${money(total)}${unpriced ? '+' : ''}</span></div>
    <p class="hint">${unpriced ? 'Some items are priced at the counter. ' : ''}Tax not included. You'll pay when you pick up.</p>`;
  renderPickupTimes();
}

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function slotsFor(date) {
  const s = state.settings;
  if ((s.closed_dates || []).includes(date)) return [];
  const h = s.hours[new Date(`${date}T00:00:00Z`).getUTCDay()];
  if (!h) return [];
  const lead = leadMinutes();
  const nowAbs = Date.parse(`${s.now.date}T00:00:00Z`) / 60e3 + toMin(s.now.time);
  const dayAbs = Date.parse(`${date}T00:00:00Z`) / 60e3;
  const last = toMin(h.close) - (Number(s.close_cutoff_minutes) || 0);
  const slots = [];
  for (let m = toMin(h.open); m <= last; m += 15) {
    if (dayAbs + m - nowAbs >= lead) slots.push(fromMin(m));
  }
  return slots;
}

function renderPickupTimes() {
  const dateSel = $('#pickup-date');
  const prev = dateSel.value;
  const days = [];
  for (let i = 0; i <= maxAdvance(); i++) {
    const d = addDays(state.settings.now.date, i);
    if (slotsFor(d).length) days.push(d);
  }
  dateSel.innerHTML = days.length
    ? days.map((d) => {
        const label = new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
        return `<option value="${d}">${d === state.settings.now.date ? `Today, ${label.split(', ')[1]}` : label}</option>`;
      }).join('')
    : '<option value="">No pickup times available</option>';
  if (days.includes(prev)) dateSel.value = prev;
  renderTimes();
}

function renderTimes() {
  const timeSel = $('#pickup-time');
  const prev = timeSel.value;
  const slots = slotsFor($('#pickup-date').value);
  timeSel.innerHTML = slots.map((t) => `<option value="${t}">${fmtTime(t)}</option>`).join('');
  if (slots.includes(prev)) timeSel.value = prev;
}

async function submitOrder(e) {
  e.preventDefault();
  const form = e.target;
  const err = $('#checkout-error');
  const btn = form.querySelector('button[type="submit"]');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Placing order…';
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.value,
        phone: form.phone.value,
        email: form.email.value,
        notes: form.notes.value,
        pickupDate: form.pickupDate.value,
        pickupTime: form.pickupTime.value,
        items: state.cart.map(({ productId, optionIds, quantity, instructions }) => ({ productId, optionIds, quantity, instructions })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    state.cart = [];
    saveCart();
    const when = new Date(`${data.pickupDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    app.innerHTML = `<div class="builder center" style="max-width:640px;margin:0 auto">
      <div style="font-size:3rem" aria-hidden="true">✅</div>
      <h2>Thank you! Your order is in.</h2>
      <p>Order <strong>#${data.id}</strong> will be ready for pickup <strong>${esc(when)} at ${fmtTime(data.pickupTime)}</strong>.</p>
      <p>${data.hasUnpriced ? 'Your total will be calculated at the counter.' : `Estimated total: <strong>${money(data.estTotal)}</strong> plus tax.`} Please pay when you pick up.</p>
      <p class="muted">Need to make a change? Call us at <a href="tel:${state.settings.phone.replace(/\D/g, '')}">${esc(state.settings.phone)}</a>.</p>
      <p><a class="btn" href="/">Back to Home</a></p>
    </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Place Order';
  }
}

async function init() {
  const [settings, allMenu] = await Promise.all([loadSettings(), fetch('/api/menu').then((r) => r.json())]);
  state.settings = settings;
  state.allMenu = allMenu;
  state.menu = allMenu.filter((p) => p.kind === kind);

  const enabled = kind === 'deli' ? settings.deli_ordering_enabled : settings.tray_ordering_enabled;
  if (!enabled) state.menu = [];

  // Drop cart lines whose product or options are no longer available.
  const before = state.cart.length;
  state.cart = state.cart.filter((l) => {
    const p = allMenu.find((m) => m.id === l.productId);
    if (!p) return false;
    const valid = new Set(p.groups.flatMap((g) => g.options.map((o) => o.id)));
    return l.optionIds.every((id) => valid.has(id));
  });
  saveCart();
  if (state.cart.length < before) {
    const note = $('#cart-note');
    note.textContent = 'Some items in your order sold out and were removed.';
    note.classList.remove('hidden');
  }

  if (state.menu.length === 1) state.product = state.menu[0];
  renderPicker();
  renderBuilder();
  renderCart();

  $('#cart-items').addEventListener('click', (e) => {
    const i = e.target.dataset.remove;
    if (i === undefined) return;
    state.cart.splice(Number(i), 1);
    saveCart();
    renderCart();
  });
  $('#pickup-date').addEventListener('change', renderTimes);
  $('#checkout').addEventListener('submit', submitOrder);
}

init().catch(() => {
  app.innerHTML = '<div class="alert error">We couldn’t load the menu. Please refresh the page or call the store.</div>';
});
