/**
 * Builds the printable HTML for an invoice in the renderer.
 * The same HTML is used for the on-screen preview, printing and PDF export.
 */
import QRCode from 'qrcode';
import { renderInvoiceHtml } from '../../shared/invoiceTemplates.js';
import { computeInvoiceTotals } from '../../shared/calc.js';
import { formatMoney } from '../../shared/format.js';

/**
 * Generate the QR code (PNG data URL) carrying invoice number, customer and total.
 * @returns {Promise<string>}
 */
export async function buildQrDataUrl({ number, customerName, total, currency }) {
  const text = `Invoice: ${number}\nCustomer: ${customerName}\nTotal: ${formatMoney(total, currency)}`;
  return QRCode.toDataURL(text, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
}

/**
 * Render a saved invoice (from the `invoice:get` response) to HTML.
 * @param {Object} invoice  Full invoice record with items
 * @param {Object} settings Settings (template, page size, QR, signatures, footer, accent)
 * @param {Object} [overrides] { template, pageSize }
 */
export async function renderSavedInvoice(invoice, settings, overrides = {}) {
  const business = { ...(invoice.businessSnapshot || {}) };
  const customer = { ...(invoice.customerSnapshot || {}) };
  const totals = {
    subtotal: invoice.subtotal,
    discountTotal: invoice.discountTotal,
    taxableAmount: invoice.taxableAmount,
    vatTotal: invoice.vatTotal,
    shippingCharge: invoice.shippingCharge,
    grandTotal: invoice.grandTotal,
  };
  const lines = invoice.items.map((it) => ({
    name: it.name,
    sku: it.sku,
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    discountPercent: it.discountPercent,
    vatRate: it.vatRate,
    vatAmount: it.vatAmount,
    lineTotal: it.lineTotal,
  }));
  const qrDataUrl = await buildQrDataUrl({
    number: invoice.number,
    customerName: customer.name || '',
    total: invoice.grandTotal,
    currency: invoice.currency,
  });
  return renderInvoiceHtml({
    invoice: { ...invoice, currency: invoice.currency },
    business,
    customer,
    lines,
    totals,
    settings: {
      template: overrides.template || settings['pdf.template'],
      pageSize: overrides.pageSize || settings['pdf.pageSize'],
      showQr: settings['pdf.showQr'],
      showSignatures: settings['pdf.showSignatures'],
      footerText: settings['pdf.footerText'],
      accentColor: settings['pdf.accentColor'],
    },
    qrDataUrl,
  });
}

/**
 * Compute line totals for an editor draft using the same engine as the main process.
 * Used only for live on-screen feedback; the main process recalculates on save.
 */
export function previewTotals(draft, defaultVat) {
  return computeInvoiceTotals({
    items: draft.items,
    invoiceDiscountType: draft.invoiceDiscountType,
    invoiceDiscountValue: draft.invoiceDiscountValue,
    shippingCharge: draft.shippingCharge,
    defaultVatRate: defaultVat,
    shippingVatRate: defaultVat,
  });
}
