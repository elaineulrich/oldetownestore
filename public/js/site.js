// Shared header, footer, and store info for every public page.
// Pages mark where to render with <div id="site-header"></div> and <div id="site-footer"></div>.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NAV = [
  ['/', 'Home'],
  ['/deli', 'Deli'],
  ['/bakery', 'Bakery'],
  ['/grocery', 'Grocery'],
  ['/party-trays', 'Party Trays'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const money = (n) => `$${Number(n).toFixed(2)}`;

export function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const hr = ((h + 11) % 12) + 1;
  return m ? `${hr}:${String(m).padStart(2, '0')}${suffix}` : `${hr}${suffix}`;
}

let settingsPromise;
export function loadSettings() {
  settingsPromise ??= fetch('/api/settings').then((r) => r.json());
  return settingsPromise;
}

export function hoursTable(settings) {
  const today = new Date(`${settings.now.date}T00:00:00Z`).getUTCDay();
  // Display Monday first.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<table class="hours-table">${order
    .map((d) => {
      const h = settings.hours[d];
      return `<tr class="${d === today ? 'today' : ''}"><td>${DAYS[d]}</td><td>${
        h ? `${fmtTime(h.open)} – ${fmtTime(h.close)}` : 'Closed'
      }</td></tr>`;
    })
    .join('')}</table>`;
}

export function isOpenNow(settings) {
  const { date, time } = settings.now;
  if ((settings.closed_dates || []).includes(date)) return false;
  const h = settings.hours[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return Boolean(h && time >= h.open && time < h.close);
}

export function cartCount() {
  try {
    return JSON.parse(localStorage.getItem('otcs_cart') || '[]').reduce((n, l) => n + l.quantity, 0);
  } catch {
    return 0;
  }
}

/** "Open till 5:30pm" / "Opens Wednesday at 8am" style status line. */
export function statusLine(settings) {
  const { date, time } = settings.now;
  const closed = settings.closed_dates || [];
  const dayOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
  const today = closed.includes(date) ? null : settings.hours[dayOf(date)];
  if (today && time >= today.open && time < today.close) return { open: true, text: `Open today till ${fmtTime(today.close)}` };
  if (today && time < today.open) return { open: false, text: `Opens today at ${fmtTime(today.open)}` };
  for (let i = 1; i <= 14; i++) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const h = closed.includes(iso) ? null : settings.hours[d.getUTCDay()];
    if (h) return { open: false, text: `Closed now · opens ${i === 1 ? 'tomorrow' : DAYS[d.getUTCDay()]} at ${fmtTime(h.open)}` };
  }
  return { open: false, text: 'Closed now' };
}

// Wheat-sheaf emblem used in the header, footer, and hero.
export const EMBLEM = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <circle cx="32" cy="32" r="30" stroke-width="1.5"/><circle cx="32" cy="32" r="25.5" stroke-width="1" stroke-dasharray="1.5 3.5"/>
  <path d="M32 50V20"/><path d="M32 22c-5-2-6-7-6-7s5 0 6 5M32 22c5-2 6-7 6-7s-5 0-6 5"/>
  <path d="M32 30c-5-2-7-7-7-7s5 0 7 5M32 30c5-2 7-7 7-7s-5 0-7 5"/>
  <path d="M32 38c-5-2-7-7-7-7s5 0 7 5M32 38c5-2 7-7 7-7s-5 0-7 5"/>
  <path d="M26 50h12"/></svg>`;

function renderHeader(s) {
  const el = document.getElementById('site-header');
  if (!el) return;
  const path = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  const count = cartCount();
  const status = statusLine(s);
  const tel = s.phone.replace(/\D/g, '');
  el.outerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    ${s.announcement ? `<div class="announce">${esc(s.announcement)}</div>` : ''}
    <div class="topbar">
      <div class="wrap">
        <span><span class="status-dot ${status.open ? '' : 'closed'}"></span>${esc(status.text)}</span>
        <span><a href="tel:${tel}">${esc(s.phone)}</a> &nbsp;·&nbsp; ${esc(s.address)}</span>
      </div>
    </div>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/" aria-label="${esc(s.store_name)} home">
          <span class="brand-mark" style="color:var(--gold)">${EMBLEM}</span>
          <span class="brand-text"><span class="brand-name">Olde Towne</span><span class="brand-sub">Country Store</span></span>
        </a>
        <button class="nav-toggle" aria-expanded="false" aria-controls="main-nav">Menu</button>
        <nav class="nav" id="main-nav" aria-label="Main">
          ${NAV.map(([href, label]) => `<a href="${href}" ${path === href ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
          <a class="btn small" href="/order">Order ahead<span class="cart-count" id="cart-count">${count || ''}</span></a>
        </nav>
      </div>
    </header>`;
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('main-nav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

function renderFooter(s) {
  const el = document.getElementById('site-footer');
  if (!el) return;
  const tel = s.phone.replace(/\D/g, '');
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.store_name}, ${s.address}`)}`;
  const open = isOpenNow(s);
  el.outerHTML = `
    <footer class="site-footer">
      <div class="wrap">
        <div class="cols">
          <div>
            <a class="brand" href="/">
              <span class="brand-mark" style="color:var(--gold)">${EMBLEM}</span>
              <span class="brand-text"><span class="brand-name">Olde Towne</span><span class="brand-sub">Country Store</span></span>
            </a>
            <p>A family-run deli, bakery, and bulk food store on Main Street in Itasca, Texas.</p>
            ${s.facebook_url ? `<p><a href="${esc(s.facebook_url)}" target="_blank" rel="noopener">Follow us on Facebook →</a></p>` : ''}
          </div>
          <div>
            <h3>Visit</h3>
            <ul>
              <li><a href="${map}" target="_blank" rel="noopener">${esc(s.address)}</a></li>
              <li><a href="tel:${tel}">${esc(s.phone)}</a></li>
              ${s.email ? `<li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ''}
            </ul>
          </div>
          <div>
            <h3>Hours <span class="open-badge ${open ? 'open' : 'closed'}">${open ? 'Open' : 'Closed'}</span></h3>
            ${hoursTable(s)}
          </div>
          <div>
            <h3>Explore</h3>
            <ul>
              <li><a href="/order">Order deli online</a></li>
              <li><a href="/party-trays">Party trays</a></li>
              <li><a href="/bakery">Bakery menu</a></li>
              <li><a href="/grocery">Bulk grocery</a></li>
              ${s.newsletter_url ? `<li><a href="${esc(s.newsletter_url)}" target="_blank" rel="noopener">Specials &amp; news sign-up</a></li>` : ''}
            </ul>
          </div>
        </div>
        <div class="fine">
          <span>© ${new Date().getFullYear()} ${esc(s.store_name)}. All rights reserved.</span>
          <span><a href="/contact">Contact</a> · <a href="/about">About</a> · <a href="/admin/" rel="nofollow">Admin login</a></span>
        </div>
      </div>
    </footer>`;
}

loadSettings()
  .then((s) => {
    renderHeader(s);
    renderFooter(s);
    document.querySelectorAll('[data-store-hours]').forEach((n) => (n.innerHTML = hoursTable(s)));
    document.querySelectorAll('[data-store-phone]').forEach((n) => {
      n.textContent = s.phone;
      if (n.tagName === 'A') n.href = `tel:${s.phone.replace(/\D/g, '')}`;
    });
    document.querySelectorAll('[data-store-address]').forEach((n) => (n.textContent = s.address));
    document.querySelectorAll('[data-store-status]').forEach((n) => (n.textContent = statusLine(s).text));
    document.dispatchEvent(new CustomEvent('store:settings', { detail: s }));
  })
  .catch(() => {});
