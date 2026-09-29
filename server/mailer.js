import nodemailer from 'nodemailer';
import { fmtTime } from './ordering.js';

/**
 * Build a mailer from SMTP_* environment variables. Returns null when email
 * isn't configured, so the rest of the app can treat alerts as optional.
 */
export function createMailer(env = process.env) {
  if (!env.SMTP_HOST) return null;
  const port = Number(env.SMTP_PORT) || 587;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  const from = env.SMTP_FROM || env.SMTP_USER;
  return {
    configured: true,
    send: (msg) => transport.sendMail({ from, ...msg }),
  };
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `$${Number(n).toFixed(2)}`;
const fmtDate = (d) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** Subject, plain-text, and HTML bodies for a new-order alert. */
export function orderAlertEmail(orderId, order, { storeName, siteUrl } = {}) {
  const when = `${fmtDate(order.pickupDate)} at ${fmtTime(order.pickupTime)}`;
  const kinds = new Set(order.lines.map((l) => l.kind));
  const label = kinds.has('tray') ? (kinds.has('deli') ? 'Deli + tray order' : 'Party tray order') : 'Deli order';
  const total = order.hasUnpriced && !order.estTotal
    ? 'Priced at counter'
    : `${money(order.estTotal)}${order.hasUnpriced ? ' + items priced at counter' : ''} (before tax)`;
  const adminUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/admin/#orders` : '';
  const { customer } = order;

  const text = [
    `New ${label.toLowerCase()} #${orderId}${storeName ? ` — ${storeName}` : ''}`,
    '',
    `Pickup: ${when}`,
    `Customer: ${customer.name}`,
    `Phone: ${customer.phone}`,
    customer.email && `Email: ${customer.email}`,
    '',
    ...order.lines.flatMap((l) => [
      `${l.quantity} x ${l.productName}${l.unitPrice != null ? ` — ${money(l.unitPrice * l.quantity)}` : ''}`,
      ...l.selections.map((s) => `   ${s.group}: ${s.options.map((o) => o.name).join(', ')}`),
      l.instructions && `   Instructions: ${l.instructions}`,
    ]),
    '',
    customer.notes && `Customer notes: ${customer.notes}`,
    `Estimated total: ${total}`,
    adminUrl && `\nManage orders: ${adminUrl}`,
  ].filter((line) => line !== '' && line != null && line !== false).join('\n');

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#2b211b;max-width:600px">
    <h2 style="color:#8e1b1b;margin:0 0 8px">New ${esc(label.toLowerCase())} #${orderId}</h2>
    <p style="font-size:17px;margin:0 0 16px"><strong>Pickup: ${esc(when)}</strong></p>
    <p style="margin:0 0 16px">${esc(customer.name)}<br>
      <a href="tel:${esc(customer.phone.replace(/\D/g, ''))}">${esc(customer.phone)}</a>
      ${customer.email ? `<br><a href="mailto:${esc(customer.email)}">${esc(customer.email)}</a>` : ''}</p>
    <table style="border-collapse:collapse;width:100%">${order.lines.map((l) => `
      <tr><td style="padding:8px 0;border-top:1px solid #e4d9c6">
        <strong>${l.quantity} × ${esc(l.productName)}</strong>${l.unitPrice != null ? ` — ${money(l.unitPrice * l.quantity)}` : ''}
        <div style="color:#6b5d52;font-size:14px">${l.selections.map((s) => `${esc(s.group)}: ${s.options.map((o) => esc(o.name)).join(', ')}`).join('<br>')}</div>
        ${l.instructions ? `<div><em>Instructions: ${esc(l.instructions)}</em></div>` : ''}
      </td></tr>`).join('')}
    </table>
    ${customer.notes ? `<p><strong>Customer notes:</strong> ${esc(customer.notes)}</p>` : ''}
    <p><strong>Estimated total:</strong> ${esc(total)}</p>
    ${adminUrl ? `<p><a href="${esc(adminUrl)}" style="background:#8e1b1b;color:#fff;padding:10px 18px;border-radius:20px;text-decoration:none;display:inline-block">Open orders</a></p>` : ''}
  </div>`;

  return { subject: `New order #${orderId} — pickup ${when} — ${customer.name}`, text, html };
}
