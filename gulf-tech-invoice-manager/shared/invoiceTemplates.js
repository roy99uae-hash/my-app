/**
 * Invoice HTML templates.
 *
 * One rendering pipeline produces a complete, self-contained HTML document. The
 * renderer previews it in an iframe and the main process prints it / converts it
 * to PDF with Chromium's print engine, so what you see is what you print.
 *
 * Five visual variants are supported: modern, professional, retail, corporate, minimal.
 * The signature block is always laid out as:
 *   LEFT  - Authorized signature (digital / handwritten image or printed name) + Name, Position, Date
 *   RIGHT - Customer / recipient area left BLANK for a manual signature after printing.
 */
import { formatDate, formatNumber } from './format.js';
import { INVOICE_STATUS_LABELS } from './constants.js';

/** Escape text for safe insertion into HTML. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape and convert newlines to <br>. */
function multiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/** Visual design tokens per template. */
const VARIANTS = {
  modern: {
    headerClass: 'hdr-band',
    tableClass: 'tbl-rounded',
    font: "'Segoe UI', Roboto, Arial, sans-serif",
    fontSize: '12px',
    radius: '10px',
  },
  professional: {
    headerClass: 'hdr-inline',
    tableClass: 'tbl-bordered',
    font: "Georgia, 'Times New Roman', serif",
    fontSize: '12px',
    radius: '0',
  },
  retail: {
    headerClass: 'hdr-center',
    tableClass: 'tbl-dashed',
    font: "'Segoe UI', Arial, sans-serif",
    fontSize: '11px',
    radius: '6px',
  },
  corporate: {
    headerClass: 'hdr-navy',
    tableClass: 'tbl-striped',
    font: "'Segoe UI', Arial, sans-serif",
    fontSize: '12px',
    radius: '2px',
  },
  minimal: {
    headerClass: 'hdr-minimal',
    tableClass: 'tbl-minimal',
    font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontSize: '12px',
    radius: '0',
  },
};

/**
 * Build the full HTML document for an invoice.
 * @param {Object} model
 * @param {Object} model.invoice   Invoice header fields (number, invoiceDate, dueDate, status, paymentMethod, amountPaid, notes, terms, currency)
 * @param {Object} model.business  Business profile snapshot
 * @param {Object} model.customer  Customer snapshot
 * @param {Array}  model.lines     Computed line items
 * @param {Object} model.totals    Computed totals
 * @param {Object} model.settings  { template, pageSize, showQr, showSignatures, footerText, accentColor }
 * @param {string} [model.qrDataUrl] PNG data URL of the QR code
 * @returns {string} HTML document
 */
export function renderInvoiceHtml(model) {
  const { invoice, business, customer, lines, totals, settings } = model;
  const templateId = VARIANTS[settings.template] ? settings.template : 'modern';
  const v = VARIANTS[templateId];
  const accent = /^#[0-9a-fA-F]{6}$/.test(settings.accentColor || '') ? settings.accentColor : '#1d4ed8';
  const currency = invoice.currency || 'AED';
  const money = (n) => formatNumber(n);
  const pageSize = settings.pageSize === 'A5' ? 'A5' : 'A4';
  const statusLabel = INVOICE_STATUS_LABELS[invoice.status] || invoice.status;
  const balance = Math.max(0, Math.round((totals.grandTotal - (invoice.amountPaid || 0)) * 100) / 100);

  const rows = lines
    .map(
      (l, i) => `
      <tr>
        <td class="c-idx">${i + 1}</td>
        <td><div class="item-name">${escapeHtml(l.name)}</div>${l.sku ? `<div class="muted">SKU: ${escapeHtml(l.sku)}</div>` : ''}</td>
        <td class="desc">${multiline(l.description || '')}</td>
        <td class="num">${money(l.quantity)}</td>
        <td class="num">${money(l.unitPrice)}</td>
        <td class="num">${money(l.vatAmount)}<div class="muted">${Number(l.vatRate) || 0}%</div></td>
        <td class="num strong">${money(l.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  const logo = business.logoData
    ? `<img class="logo" src="${business.logoData}" alt="Company logo">`
    : `<div class="logo-placeholder">${escapeHtml((business.name || 'G').charAt(0).toUpperCase())}</div>`;

  const contactLines = [
    business.address ? `<div>${multiline(business.address)}</div>` : '',
    business.phone ? `<div>Tel: ${escapeHtml(business.phone)}</div>` : '',
    business.whatsapp ? `<div>WhatsApp: ${escapeHtml(business.whatsapp)}</div>` : '',
    business.email ? `<div>Email: ${escapeHtml(business.email)}</div>` : '',
    business.website ? `<div>Web: ${escapeHtml(business.website)}</div>` : '',
    business.vatNumber ? `<div>VAT/TRN: ${escapeHtml(business.vatNumber)}</div>` : '',
    business.tradeLicense ? `<div>Trade Licence: ${escapeHtml(business.tradeLicense)}</div>` : '',
  ].join('');

  const customerLines = [
    `<div class="strong">${escapeHtml(customer.name)}</div>`,
    customer.address ? `<div>${multiline(customer.address)}</div>` : '',
    [customer.city, customer.country].filter(Boolean).length
      ? `<div>${escapeHtml([customer.city, customer.country].filter(Boolean).join(', '))}</div>`
      : '',
    customer.mobile ? `<div>Mobile: ${escapeHtml(customer.mobile)}</div>` : '',
    customer.email ? `<div>Email: ${escapeHtml(customer.email)}</div>` : '',
  ].join('');

  const signature = renderSignatureBlock({ business, invoice, showSignatures: settings.showSignatures !== false });
  const qr =
    settings.showQr !== false && model.qrDataUrl
      ? `<div class="qr"><img src="${model.qrDataUrl}" alt="Invoice QR code"><div class="muted">Scan to verify</div></div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Invoice ${escapeHtml(invoice.number)}</title>
<style>
@page { size: ${pageSize}; margin: 12mm 12mm 14mm 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #1f2937; }
body { font-family: ${v.font}; font-size: ${v.fontSize}; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 100%; padding: ${templateId === 'retail' ? '6mm' : '0'}; }
.muted { color: #6b7280; font-size: 0.92em; }
.strong { font-weight: 700; }
.num { text-align: right; white-space: nowrap; }
.c-idx { width: 4%; text-align: center; color: #6b7280; }
.item-name { font-weight: 600; }
.desc { color: #4b5563; font-size: 0.95em; }
.accent { color: ${accent}; }
.logo { max-height: 62px; max-width: 180px; object-fit: contain; }
.logo-placeholder { width: 58px; height: 58px; border-radius: 12px; background: ${accent}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; }
h1.doc-title { margin: 0; font-size: 26px; letter-spacing: 1px; text-transform: uppercase; }
.header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.header .biz-name { font-size: 17px; font-weight: 700; margin: 6px 0 2px; }
.header .biz-contact { color: #4b5563; font-size: 0.93em; }
.parties { display: flex; gap: 16px; margin-top: 16px; }
.party { flex: 1; border-radius: ${v.radius}; padding: 10px 12px; }
.party h4, .meta h4 { margin: 0 0 6px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: ${accent}; }
.meta { min-width: 210px; }
.meta table { width: 100%; border-collapse: collapse; }
.meta td { padding: 2px 0; }
.meta td:last-child { text-align: right; font-weight: 600; }
.status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: #e5e7eb; color: #374151; }
.status.paid { background: #dcfce7; color: #166534; }
.status.partial { background: #fef9c3; color: #854d0e; }
.status.unpaid { background: #fee2e2; color: #991b1b; }
.status.draft { background: #e0e7ff; color: #3730a3; }
table.items { width: 100%; border-collapse: collapse; margin-top: 16px; }
table.items th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; padding: 8px 6px; color: #fff; background: ${accent}; }
table.items th.num { text-align: right; }
table.items td { padding: 7px 6px; vertical-align: top; }
/* Table variants */
.tbl-rounded th:first-child { border-radius: 8px 0 0 8px; }
.tbl-rounded th:last-child { border-radius: 0 8px 8px 0; }
.tbl-rounded tbody tr { border-bottom: 1px solid #e5e7eb; }
.tbl-bordered th, .tbl-bordered td { border: 1px solid #9ca3af; }
.tbl-bordered th { background: #374151 !important; }
.tbl-dashed tbody tr { border-bottom: 1px dashed #9ca3af; }
.tbl-dashed th { background: #111827 !important; }
.tbl-striped tbody tr:nth-child(even) { background: #f3f4f6; }
.tbl-minimal th { background: transparent !important; color: ${accent}; border-bottom: 2px solid ${accent}; }
.tbl-minimal tbody tr { border-bottom: 1px solid #f1f5f9; }
.summary { display: flex; justify-content: flex-end; margin-top: 12px; }
.summary table { width: 300px; border-collapse: collapse; }
.summary td { padding: 4px 6px; }
.summary td:last-child { text-align: right; }
.summary .grand td { font-size: 15px; font-weight: 800; border-top: 2px solid ${accent}; padding-top: 8px; color: ${accent}; }
.summary .due td { font-weight: 700; color: #991b1b; }
.notes { display: flex; gap: 18px; margin-top: 16px; }
.notes > div { flex: 1; }
.notes h4 { margin: 0 0 4px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: ${accent}; }
.qr { width: 110px; text-align: center; }
.qr img { width: 100px; height: 100px; }
.sig-wrap { display: flex; gap: 28px; margin-top: 26px; page-break-inside: avoid; }
.sig { flex: 1; }
.sig h4 { margin: 0 0 6px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: ${accent}; }
.sig-area { height: 70px; display: flex; align-items: flex-end; justify-content: flex-start; }
.sig-area img { max-height: 66px; max-width: 220px; object-fit: contain; }
.printed-sig { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: 26px; color: #111827; }
.sig-line { border-bottom: 1px solid #111827; margin: 2px 0 8px; height: 1px; }
.sig-field { display: flex; gap: 6px; margin: 6px 0; }
.sig-field .label { width: 92px; font-weight: 600; }
.sig-field .blank { flex: 1; border-bottom: 1px dotted #6b7280; min-height: 16px; }
.footer { margin-top: 22px; border-top: 1px solid #e5e7eb; padding-top: 6px; text-align: center; color: #6b7280; font-size: 10px; }
/* Header variants */
.hdr-band { background: linear-gradient(120deg, ${accent}, #1e3a8a); color: #fff; padding: 16px 18px; border-radius: 12px; }
.hdr-band .biz-contact, .hdr-band .muted { color: #dbeafe; }
.hdr-band .logo-placeholder { background: #fff; color: ${accent}; }
.hdr-band h1.doc-title { color: #fff; }
.hdr-band .meta { background: rgba(255,255,255,.12); border-radius: 10px; padding: 10px 12px; color: #fff; }
.hdr-band .meta h4 { color: #fff; }
.hdr-inline { border-bottom: 2px solid ${accent}; padding-bottom: 12px; }
.hdr-center { flex-direction: column; align-items: center; text-align: center; }
.hdr-center .meta { width: 100%; min-width: 0; }
.hdr-navy { background: #0f2747; color: #fff; padding: 16px 18px; }
.hdr-navy .biz-contact, .hdr-navy .muted { color: #cbd5e1; }
.hdr-navy h1.doc-title { color: #fff; }
.hdr-navy .meta h4, .hdr-navy .party h4 { color: #93c5fd; }
.hdr-navy .logo-placeholder { background: #fff; color: #0f2747; }
.hdr-minimal { padding-bottom: 6px; }
.hdr-minimal h1.doc-title { font-weight: 300; letter-spacing: 4px; color: #111827; }
.hdr-minimal .party, .hdr-minimal .meta { border: none; }
.hdr-minimal .party { padding-left: 0; }
.hdr-center .parties { flex-direction: column; }
.party-tint { background: #f8fafc; }
.hdr-navy ~ .parties .party-tint { background: #f1f5f9; }
.total-box { background: ${accent}; color: #fff; padding: 8px 12px; border-radius: ${v.radius}; }
@media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="page">
  <div class="header ${v.headerClass}">
    <div class="brand" style="${templateId === 'retail' ? 'text-align:center' : ''}">
      ${logo}
      <div class="biz-name">${escapeHtml(business.name)}</div>
      <div class="biz-contact">${contactLines}</div>
    </div>
    <div class="meta">
      <h1 class="doc-title">Invoice</h1>
      <h4>Invoice details</h4>
      <table>
        <tr><td>Invoice No.</td><td>${escapeHtml(invoice.number)}</td></tr>
        <tr><td>Date</td><td>${formatDate(invoice.invoiceDate)}</td></tr>
        <tr><td>Due Date</td><td>${formatDate(invoice.dueDate) || '—'}</td></tr>
        <tr><td>Payment</td><td>${escapeHtml(invoice.paymentMethod || '—')}</td></tr>
        <tr><td>Status</td><td><span class="status ${escapeHtml(invoice.status)}">${escapeHtml(statusLabel)}</span></td></tr>
      </table>
    </div>
  </div>

  <div class="parties">
    <div class="party party-tint" style="flex:1">
      <h4>Bill To</h4>
      ${customerLines}
    </div>
  </div>

  <table class="items ${v.tableClass}">
    <thead>
      <tr>
        <th class="c-idx">#</th>
        <th>Item</th>
        <th>Description</th>
        <th class="num">Quantity</th>
        <th class="num">Unit Price</th>
        <th class="num">VAT</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="summary">
    <table>
      <tr><td>Subtotal</td><td>${money(totals.subtotal)}</td></tr>
      <tr><td>Discount</td><td>-${money(totals.discountTotal)}</td></tr>
      <tr><td>Taxable Amount</td><td>${money(totals.taxableAmount)}</td></tr>
      <tr><td>VAT</td><td>${money(totals.vatTotal)}</td></tr>
      <tr><td>Shipping</td><td>${money(totals.shippingCharge)}</td></tr>
      <tr class="grand"><td>Grand Total (${escapeHtml(currency)})</td><td>${money(totals.grandTotal)}</td></tr>
      ${invoice.amountPaid ? `<tr><td>Amount Paid</td><td>${money(invoice.amountPaid)}</td></tr>` : ''}
      ${balance > 0 ? `<tr class="due"><td>Balance Due</td><td>${money(balance)}</td></tr>` : ''}
    </table>
  </div>

  <div class="notes">
    <div>
      ${invoice.notes ? `<h4>Notes</h4><div>${multiline(invoice.notes)}</div>` : ''}
      ${invoice.terms ? `<h4 style="margin-top:12px">Terms &amp; Conditions</h4><div class="muted">${multiline(invoice.terms)}</div>` : ''}
      <div class="muted" style="margin-top:8px">Amounts in ${escapeHtml(currency)}. Unit prices are exclusive of VAT.</div>
    </div>
    ${qr}
  </div>

  ${signature}

  ${settings.footerText ? `<div class="footer">${multiline(settings.footerText)}</div>` : ''}
</div>
</body>
</html>`;
}

/**
 * Signature block: left = authorised signatory, right = blank recipient area.
 * @private
 */
function renderSignatureBlock({ business, invoice, showSignatures }) {
  if (!showSignatures) return '';
  const mode = business.signatureMode || 'none';
  let sigVisual = '';
  if ((mode === 'digital' || mode === 'handwritten') && business.signatureData) {
    sigVisual = `<img src="${business.signatureData}" alt="Authorized signature">`;
  } else if (mode === 'printed' && business.signatoryName) {
    sigVisual = `<div class="printed-sig">${escapeHtml(business.signatoryName)}</div>`;
  }
  const signedName = escapeHtml(business.signatoryName || '');
  const position = escapeHtml(business.signatoryPosition || '');
  return `
  <div class="sig-wrap">
    <div class="sig">
      <h4>Authorized Signature</h4>
      <div class="sig-area">${sigVisual}</div>
      <div class="sig-line"></div>
      <div class="sig-field"><span class="label">Name:</span><span class="blank" style="border:none;border-bottom:1px dotted #6b7280">${signedName}</span></div>
      <div class="sig-field"><span class="label">Position:</span><span class="blank" style="border:none;border-bottom:1px dotted #6b7280">${position}</span></div>
      <div class="sig-field"><span class="label">Date:</span><span class="blank" style="border:none;border-bottom:1px dotted #6b7280">${formatDate(invoice.invoiceDate)}</span></div>
    </div>
    <div class="sig">
      <h4>Customer / Recipient Signature</h4>
      <div class="sig-area"></div>
      <div class="sig-line"></div>
      <div class="sig-field"><span class="label">Name:</span><span class="blank"></span></div>
      <div class="sig-field"><span class="label">Received By:</span><span class="blank"></span></div>
      <div class="sig-field"><span class="label">Date:</span><span class="blank"></span></div>
    </div>
  </div>`;
}

