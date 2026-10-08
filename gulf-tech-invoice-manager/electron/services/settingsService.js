/**
 * Settings service: validates and persists user preferences.
 */
import { CURRENCIES, PAGE_SIZES, TEMPLATES, DEFAULT_SETTINGS } from '../../shared/constants.js';
import { validateNumberFormat } from '../../shared/numbering.js';

export class SettingsService {
  /** @param {{settings: import('../data/repositories/settingsRepository.js').SettingsRepository}} deps */
  constructor({ settings }) {
    this.repo = settings;
  }

  getAll() {
    return this.repo.getAll();
  }

  /** @param {Object} partial */
  update(partial) {
    const clean = {};
    for (const [key, value] of Object.entries(partial || {})) {
      if (!(key in DEFAULT_SETTINGS)) throw new Error(`Unknown setting: ${key}`);
      clean[key] = sanitize(key, value);
    }
    return this.repo.setMany(clean);
  }
}

/** Validate and normalise a single setting value. Throws on invalid input. */
export function sanitize(key, value) {
  switch (key) {
    case 'invoice.vatPercent': {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('VAT percentage must be between 0 and 100.');
      return n;
    }
    case 'invoice.currency':
      if (!CURRENCIES.some((c) => c.code === value)) throw new Error('Unsupported currency.');
      return value;
    case 'invoice.prefix': {
      const v = String(value || '').trim().toUpperCase();
      if (!/^[A-Z0-9-]{1,10}$/.test(v)) throw new Error('Prefix must be 1-10 letters, digits or hyphens.');
      return v;
    }
    case 'invoice.numberFormat': {
      const err = validateNumberFormat(value);
      if (err) throw new Error(err);
      return value;
    }
    case 'invoice.dueDays': {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 0 || n > 365) throw new Error('Due days must be between 0 and 365.');
      return n;
    }
    case 'pdf.template':
      if (!TEMPLATES.some((t) => t.id === value)) throw new Error('Unknown template.');
      return value;
    case 'pdf.pageSize':
      if (!PAGE_SIZES.includes(value)) throw new Error('Unsupported page size.');
      return value;
    case 'pdf.accentColor':
      if (!/^#[0-9a-fA-F]{6}$/.test(String(value))) throw new Error('Accent colour must be a hex colour like #1d4ed8.');
      return value;
    case 'backup.intervalHours': {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 1 || n > 720) throw new Error('Backup interval must be 1-720 hours.');
      return n;
    }
    case 'backup.retention': {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 1 || n > 500) throw new Error('Keep between 1 and 500 automatic backups.');
      return n;
    }
    case 'security.sessionTimeoutMinutes': {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 0 || n > 480) throw new Error('Session timeout must be 0-480 minutes (0 = off).');
      return n;
    }
    case 'ui.theme':
      if (!['light', 'dark'].includes(value)) throw new Error('Theme must be light or dark.');
      return value;
    case 'company.defaultBusinessId':
      return value === null || value === '' ? null : Number(value);
    case 'backup.autoEnabled':
    case 'pdf.showQr':
    case 'pdf.showSignatures':
      return !!value;
    default:
      return typeof value === 'string' ? value.trim() : value;
  }
}
