/**
 * Application-wide constants shared between main process and renderer.
 */

/** Supported invoice currencies. */
export const CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
];

/** Payment methods offered on invoices. */
export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

/** Invoice status values. `draft` never affects stock or reports. */
export const INVOICE_STATUS = {
  DRAFT: 'draft',
  PAID: 'paid',
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
};

export const INVOICE_STATUS_LABELS = {
  draft: 'Draft',
  paid: 'Paid',
  unpaid: 'Unpaid',
  partial: 'Partially Paid',
};

/** Signature modes for the authorised signatory block on invoices. */
export const SIGNATURE_MODES = {
  none: 'No signature',
  digital: 'Digital signature image',
  handwritten: 'Handwritten signature image',
  printed: 'Printed (typed) name',
};

/** The five invoice templates available in the PDF/print pipeline. */
export const TEMPLATES = [
  { id: 'modern', name: 'Modern', description: 'Blue gradient header with bold accents' },
  { id: 'professional', name: 'Professional', description: 'Classic bordered layout for formal billing' },
  { id: 'retail', name: 'Retail', description: 'Compact receipt-style layout with big totals' },
  { id: 'corporate', name: 'Corporate', description: 'Dark navy corporate header and side panel' },
  { id: 'minimal', name: 'Minimal', description: 'Clean, borderless, lots of white space' },
];

export const PAGE_SIZES = ['A4', 'A5'];

export const REPORT_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];

/**
 * Default values for every persisted setting. Keys are dotted, mirroring the
 * settings table. Secrets (such as the PIN hash) are NOT listed here and are
 * never returned to the renderer.
 */
export const DEFAULT_SETTINGS = {
  'company.defaultBusinessId': null,
  'invoice.vatPercent': 5,
  'invoice.currency': 'AED',
  'invoice.prefix': 'INV',
  'invoice.numberFormat': '{PREFIX}-{YYYY}-{SEQ:6}',
  'invoice.dueDays': 30,
  'invoice.defaultNotes': 'Thank you for your business.',
  'invoice.defaultTerms':
    '1. Payment is due by the due date shown above.\n2. Goods remain the property of the seller until paid in full.\n3. Please quote the invoice number with your payment.',
  'pdf.template': 'modern',
  'pdf.pageSize': 'A4',
  'pdf.showQr': true,
  'pdf.showSignatures': true,
  'pdf.footerText': '',
  'pdf.outputFolder': '',
  'pdf.accentColor': '#1d4ed8',
  'backup.autoEnabled': false,
  'backup.intervalHours': 24,
  'backup.retention': 10,
  'backup.folder': '',
  'backup.lastAuto': '',
  'ui.theme': 'light',
  'security.sessionTimeoutMinutes': 15,
};

/** Keys that must never be exposed to or written by the renderer directly. */
export const SECRET_SETTING_KEYS = ['security.pinHash'];

/** Maximum upload size for logos, product images and signatures (bytes). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Product units shown on the product form. */
export const UNITS = ['pcs', 'box', 'kg', 'g', 'litre', 'meter', 'set', 'service'];
