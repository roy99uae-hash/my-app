/**
 * Backup & restore service.
 *
 * Formats:
 *  - ZIP    : database.sqlite + backup.json + manifest.json (recommended, complete)
 *  - JSON   : human-readable export of every table (portable, inspectable)
 *  - SQLite : raw database file (fastest restore, exact copy)
 *
 * Protection:
 *  - Manual exports may be wrapped in a password-protected container (AES-256-GCM,
 *    scrypt-derived key) so they can be restored on any computer.
 *  - Automatic backups are wrapped with the database encryption key, so they are only
 *    restorable on this computer (the key is protected by Windows DPAPI).
 *
 * Restore always:
 *  1. writes a safety backup of the current data,
 *  2. validates the incoming file,
 *  3. keeps the PIN lock configured on this computer.
 */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { AppDatabase } from '../data/database.js';
import { LATEST_SCHEMA_VERSION } from '../data/schema.js';
import {
  decryptWithKey,
  decryptWithPassphrase,
  encryptWithKey,
  encryptWithPassphrase,
  isEncryptedDatabase,
  isPasswordBackup,
} from '../security/crypto.js';
import { SECRET_SETTING_KEYS } from '../../shared/constants.js';

export const BACKUP_JSON_FORMAT = 'gulftech-invoice-manager-json';
const DATA_TABLES = ['businesses', 'customers', 'products', 'invoices', 'invoice_items', 'settings', 'counters'];
const SQLITE_MAGIC = 'SQLite format 3\u0000';
const AUTO_PREFIX = 'auto-';
const AUTO_EXT = '.gtbak';

export class BackupService {
  /**
   * @param {Object} deps
   * @param {AppDatabase} deps.db
   * @param {*} deps.settings  SettingsRepository
   * @param {*} deps.SQL       sql.js engine (for validating / building temporary databases)
   * @param {Buffer} deps.key  Database encryption key
   * @param {string} deps.defaultBackupDir
   * @param {() => Date} [deps.now]
   */
  constructor({ db, settings, SQL, key, defaultBackupDir, now = () => new Date() }) {
    Object.assign(this, { db, settings, SQL, key, defaultBackupDir, now });
  }

  /** Folder used for automatic and safety backups. */
  backupDir() {
    const custom = this.settings.get('backup.folder');
    return custom && String(custom).trim() ? custom : this.defaultBackupDir;
  }

  /** Full JSON-serialisable snapshot of every table (secrets excluded). */
  buildJsonPayload() {
    const data = {};
    for (const table of DATA_TABLES) {
      let rows = this.db.all(`SELECT * FROM ${table}`);
      if (table === 'settings') rows = rows.filter((r) => !SECRET_SETTING_KEYS.includes(r.key));
      data[table] = rows;
    }
    return {
      format: BACKUP_JSON_FORMAT,
      formatVersion: 1,
      schemaVersion: LATEST_SCHEMA_VERSION,
      exportedAt: this.now().toISOString(),
      app: 'Gulf Tech Dubai Invoice Manager',
      data,
    };
  }

  /**
   * Produce backup bytes in the requested format.
   * @param {'zip'|'json'|'sqlite'} format
   * @param {{password?: string}} [opts]
   * @returns {Buffer}
   */
  exportBuffer(format, { password } = {}) {
    let buf;
    if (format === 'json') {
      buf = Buffer.from(JSON.stringify(this.buildJsonPayload(), null, 2), 'utf8');
    } else if (format === 'sqlite') {
      buf = this.db.exportBytes();
    } else if (format === 'zip') {
      buf = this.buildZip();
    } else {
      throw new Error(`Unsupported backup format: ${format}`);
    }
    return password ? encryptWithPassphrase(buf, password) : buf;
  }

  /** ZIP bundle containing the SQLite file, a JSON copy and a manifest. */
  buildZip() {
    const zip = new AdmZip();
    const json = Buffer.from(JSON.stringify(this.buildJsonPayload(), null, 2), 'utf8');
    zip.addFile('database.sqlite', this.db.exportBytes());
    zip.addFile('backup.json', json);
    zip.addFile(
      'manifest.json',
      Buffer.from(
        JSON.stringify(
          {
            app: 'Gulf Tech Dubai Invoice Manager',
            formatVersion: 1,
            schemaVersion: LATEST_SCHEMA_VERSION,
            createdAt: this.now().toISOString(),
            files: ['database.sqlite', 'backup.json'],
          },
          null,
          2,
        ),
        'utf8',
      ),
    );
    return zip.toBuffer();
  }

  /**
   * Unwrap and classify a backup file.
   * @param {Buffer} buf
   * @param {{password?: string, allowKeyWrapped?: boolean}} [opts]
   * @returns {{kind: 'sqlite', bytes: Buffer} | {kind: 'json', data: Object}}
   * @throws {Error} with code NEED_PASSWORD when a password is required
   */
  parse(buf, { password } = {}) {
    let data = buf;
    if (isPasswordBackup(data)) {
      if (!password) {
        const err = new Error('This backup is password protected. Enter its password to continue.');
        err.code = 'NEED_PASSWORD';
        throw err;
      }
      data = decryptWithPassphrase(data, password);
    }
    if (isEncryptedDatabase(data)) {
      data = decryptWithKey(data, this.key);
    }

    if (data.subarray(0, 2).equals(Buffer.from('PK'))) {
      const zip = new AdmZip(data);
      const dbEntry = zip.getEntry('database.sqlite');
      if (dbEntry) return { kind: 'sqlite', bytes: dbEntry.getData() };
      const jsonEntry = zip.getEntry('backup.json');
      if (jsonEntry) return { kind: 'json', data: parseJsonBackup(jsonEntry.getData().toString('utf8')) };
      throw new Error('The ZIP file does not contain a recognised backup.');
    }
    if (data.subarray(0, SQLITE_MAGIC.length).toString('latin1') === SQLITE_MAGIC) {
      return { kind: 'sqlite', bytes: data };
    }
    if (data.subarray(0, 1).toString() === '{') {
      return { kind: 'json', data: parseJsonBackup(data.toString('utf8')) };
    }
    throw new Error('Unrecognised backup file. Choose a ZIP, JSON or SQLite backup from this application.');
  }

  /**
   * Replace all data with the contents of a backup file.
   * @param {Buffer} fileBuffer
   * @param {{password?: string}} [opts]
   * @returns {{safetyBackup: string, tables: Object}}
   */
  restore(fileBuffer, { password } = {}) {
    const parsed = this.parse(fileBuffer, { password });
    const candidate = new AppDatabase({ SQL: this.SQL, filePath: null });
    if (parsed.kind === 'sqlite') {
      validateSqliteBytes(this.SQL, parsed.bytes);
      candidate.attach(parsed.bytes);
    } else {
      candidate.attach(null);
    }
    candidate.migrate();
    if (parsed.kind === 'json') importJsonRows(candidate, parsed.data);

    // Keep the PIN configured on this computer.
    const currentPin = this.db.get('SELECT value FROM settings WHERE key = ?', ['security.pinHash']);
    candidate.run('DELETE FROM settings WHERE key = ?', ['security.pinHash']);
    if (currentPin) candidate.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['security.pinHash', currentPin.value]);

    const safetyBackup = this.writeAuto('pre-restore');
    const bytes = candidate.exportBytes();
    candidate.close();
    this.db.replaceWith(bytes);

    const tables = {};
    for (const t of ['businesses', 'customers', 'products', 'invoices']) {
      tables[t] = this.db.get(`SELECT COUNT(*) AS n FROM ${t}`).n;
    }
    return { safetyBackup, tables };
  }

  /** Write an encrypted (key-protected) backup into the backup folder. */
  writeAuto(prefix = AUTO_PREFIX) {
    const dir = this.backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = formatStamp(this.now());
    const name = `${prefix.endsWith('-') ? prefix : `${prefix}-`}${stamp}${AUTO_EXT}`;
    const file = path.join(dir, name);
    fs.writeFileSync(file, encryptWithKey(this.buildZip(), this.key), { mode: 0o600 });
    return file;
  }

  /**
   * Create an automatic backup if the configured interval has elapsed.
   * @param {{force?: boolean}} [opts]
   * @returns {string|null} path of the created backup
   */
  runAutoIfDue({ force = false } = {}) {
    if (!force && !this.settings.get('backup.autoEnabled')) return null;
    const interval = Number(this.settings.get('backup.intervalHours')) || 24;
    const last = this.settings.get('backup.lastAuto');
    const due = !last || this.now().getTime() - new Date(last).getTime() >= interval * 3600_000;
    if (!force && !due) return null;
    const file = this.writeAuto(AUTO_PREFIX);
    this.settings.setInternal('backup.lastAuto', this.now().toISOString());
    this.pruneAuto();
    return file;
  }

  /** Keep only the newest `backup.retention` automatic backups. */
  pruneAuto() {
    const keep = Number(this.settings.get('backup.retention')) || 10;
    const files = this.listBackups().filter((f) => f.name.startsWith(AUTO_PREFIX));
    files.slice(keep).forEach((f) => fs.rmSync(f.path, { force: true }));
  }

  /** Backups in the backup folder, newest first. */
  listBackups() {
    const dir = this.backupDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(AUTO_EXT))
      .map((name) => {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        return { name, path: p, size: st.size, modified: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.modified < b.modified ? 1 : -1));
  }
}

/** Parse and sanity-check a JSON backup document. */
export function parseJsonBackup(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('The JSON backup is not valid JSON.');
  }
  if (doc.format !== BACKUP_JSON_FORMAT || !doc.data) {
    throw new Error('This JSON file is not a Gulf Tech Invoice Manager backup.');
  }
  if (doc.schemaVersion > LATEST_SCHEMA_VERSION) {
    throw new Error('This backup was created by a newer version of the application.');
  }
  return doc;
}

/** Ensure the bytes are a SQLite database containing the expected tables. */
export function validateSqliteBytes(SQL, bytes) {
  let probe;
  try {
    probe = new SQL.Database(bytes);
  } catch {
    throw new Error('The SQLite file could not be opened.');
  }
  try {
    const tables = probe.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.flat() || [];
    for (const required of ['businesses', 'customers', 'products', 'invoices', 'settings']) {
      if (!tables.includes(required)) throw new Error(`The SQLite file is missing the "${required}" table.`);
    }
    const v = probe.exec('PRAGMA user_version')[0]?.values[0][0] || 0;
    if (v > LATEST_SCHEMA_VERSION) throw new Error('The backup was created by a newer version of the application.');
  } finally {
    probe.close();
  }
}

/** Insert JSON-exported rows into a freshly migrated database, column-whitelisted. */
export function importJsonRows(target, doc) {
  target.transaction(() => {
    // Clear seeded data first (children before parents).
    for (const t of [...DATA_TABLES].reverse()) target.run(`DELETE FROM ${t}`);
    for (const table of DATA_TABLES) {
      const rows = doc.data[table] || [];
      if (!rows.length) continue;
      const allowed = target.all(`PRAGMA table_info(${table})`).map((c) => c.name);
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => allowed.includes(c));
        if (!cols.length) continue;
        const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
        target.run(sql, cols.map((c) => row[c]));
      }
    }
  });
}

/** Timestamp used in backup file names: 20261008-143005 */
export function formatStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
