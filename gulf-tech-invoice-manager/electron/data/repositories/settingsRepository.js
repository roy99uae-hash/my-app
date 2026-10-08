/**
 * Settings repository: key/value store with typed defaults.
 */
import { DEFAULT_SETTINGS, SECRET_SETTING_KEYS } from '../../../shared/constants.js';
import { now } from './base.js';

export class SettingsRepository {
  /** @param {import('../database.js').AppDatabase} db */
  constructor(db) {
    this.db = db;
  }

  /** Read a single setting (secrets are readable only internally). */
  get(key) {
    const row = this.db.get('SELECT value FROM settings WHERE key = ?', [key]);
    if (row) return JSON.parse(row.value);
    return DEFAULT_SETTINGS[key] ?? null;
  }

  /**
   * All non-secret settings merged over defaults.
   * @returns {Object}
   */
  getAll() {
    const result = { ...DEFAULT_SETTINGS };
    for (const row of this.db.all('SELECT key, value FROM settings')) {
      if (SECRET_SETTING_KEYS.includes(row.key)) continue;
      result[row.key] = JSON.parse(row.value);
    }
    return result;
  }

  /**
   * Write one or more settings. Keys outside the defaults are rejected to prevent
   * arbitrary writes; secret keys can only be written via setInternal().
   * @param {Object} values
   */
  setMany(values) {
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(values)) {
        if (!(key in DEFAULT_SETTINGS)) throw new Error(`Unknown setting: ${key}`);
        this.upsert(key, value);
      }
    });
    return this.getAll();
  }

  /** Internal write used for secrets such as the PIN hash. */
  setInternal(key, value) {
    this.upsert(key, value);
  }

  /** Internal delete (e.g. removing the PIN). */
  deleteInternal(key) {
    this.db.run('DELETE FROM settings WHERE key = ?', [key]);
  }

  upsert(key, value) {
    this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)],
    );
    return now();
  }
}
