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

function renderHeader(s) {
  const el = document.getElementById('site-header');
  if (!el) return;
  const path = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  const count = cartCount();
  el.outerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    ${s.announcement ? `<div class="announce">${esc(s.announcement)}</div>` : ''}
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/">
          <span class="brand-name">Olde Towne <span>Country Store</span></span>
          <span class="brand-sub">Itasca, Texas</span>
        </a>
        <button class="nav-toggle" aria-expanded="false" aria-controls="main-nav">☰ Menu</button>
        <nav class="nav" id="main-nav" aria-label="Main">
          ${NAV.map(([href, label]) => `<a href="${href}" ${path === href ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
          <a class="btn small cart-link" href="/order">Order Online<span class="cart-count" id="cart-count">${count || ''}</span></a>
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
  el.outerHTML = `
    <footer class="site-footer">
      <div class="wrap">
        <div class="cols">
          <div>
            <h3>${esc(s.store_name)}</h3>
            <p><a href="${map}" target="_blank" rel="noopener">${esc(s.address)}</a></p>
            <p><a href="tel:${tel}">${esc(s.phone)}</a></p>
            ${s.email ? `<p><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p>` : ''}
          </div>
          <div>
            <h3>Store Hours <span class="open-badge ${isOpenNow(s) ? 'open' : 'closed'}">${isOpenNow(s) ? 'Open now' : 'Closed now'}</span></h3>
            ${hoursTable(s)}
          </div>
          <div>
            <h3>Stay in Touch</h3>
            <p>Hear about weekly specials, seasonal pies, and store news first.</p>
            <p>
              ${s.newsletter_url ? `<a class="btn small" href="${esc(s.newsletter_url)}" target="_blank" rel="noopener">Get Specials &amp; News</a>` : ''}
            </p>
            ${s.facebook_url ? `<p><a href="${esc(s.facebook_url)}" target="_blank" rel="noopener">Follow us on Facebook</a></p>` : ''}
          </div>
        </div>
        <div class="fine">
          <span>© ${new Date().getFullYear()} ${esc(s.store_name)}. All rights reserved.</span>
          <span><a href="/contact">Contact us</a></span>
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
    document.dispatchEvent(new CustomEvent('store:settings', { detail: s }));
  })
  .catch(() => {});
