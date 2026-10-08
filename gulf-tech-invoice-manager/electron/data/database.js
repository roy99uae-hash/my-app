/**
 * AppDatabase: an embedded SQLite database (sql.js / WebAssembly build of SQLite)
 * that lives entirely in memory while the app runs and is persisted to a single
 * file on the local disk.
 *
 * Persistence:
 *  - Writes are debounced and performed atomically (temp file + rename).
 *  - When an encryption key is supplied the file on disk is AES-256-GCM encrypted,
 *    so the database is unreadable without the key that Windows protects with DPAPI.
 *
 * No network access is performed at any point.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { decryptWithKey, encryptWithKey, isEncryptedDatabase } from '../security/crypto.js';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './schema.js';

const require = createRequire(import.meta.url);

/**
 * Load the SQLite engine. `wasmDir` must contain sql-wasm.wasm (the sql.js dist folder).
 * @param {string} [wasmDir]
 */
export async function loadSqlEngine(wasmDir) {
  const initSqlJs = require('sql.js');
  const dir = wasmDir || path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
  return initSqlJs({ locateFile: (file) => path.join(dir, file) });
}

export class AppDatabase {
  /**
   * @param {Object} opts
   * @param {*} opts.SQL          Engine returned by loadSqlEngine()
   * @param {string|null} [opts.filePath] Where to persist; null for in-memory only (tests)
   * @param {Buffer|null} [opts.key]      32-byte key for encryption at rest
   * @param {number} [opts.saveDelayMs]   Debounce delay for writes
   */
  constructor({ SQL, filePath = null, key = null, saveDelayMs = 300 }) {
    this.SQL = SQL;
    this.filePath = filePath;
    this.key = key;
    this.saveDelayMs = saveDelayMs;
    this.db = null;
    this.saveTimer = null;
    this.dirty = false;
  }

  /**
   * Open (or create) the database at filePath, decrypting it when necessary.
   * @returns {Promise<AppDatabase>}
   */
  static async open(opts) {
    const instance = new AppDatabase(opts);
    let bytes = null;
    if (instance.filePath && fs.existsSync(instance.filePath)) {
      const raw = fs.readFileSync(instance.filePath);
      bytes = isEncryptedDatabase(raw) ? decryptWithKey(raw, instance.requireKey()) : raw;
    }
    instance.attach(bytes);
    instance.migrate();
    if (!bytes) instance.markDirty();
    return instance;
  }

  requireKey() {
    if (!this.key) throw new Error('This database is encrypted but no key is available.');
    return this.key;
  }

  /** Attach a database from raw SQLite bytes (or a fresh database when null). */
  attach(bytes) {
    if (this.db) this.db.close();
    this.db = bytes ? new this.SQL.Database(bytes) : new this.SQL.Database();
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  /** Apply pending migrations in order. Each runs in its own transaction. */
  migrate() {
    const current = this.userVersion();
    if (current > LATEST_SCHEMA_VERSION) {
      throw new Error(
        `This database was created by a newer version of the application (schema ${current}). Please update the app.`,
      );
    }
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      this.db.exec('BEGIN;');
      try {
        this.db.exec(migration.sql);
        this.db.exec(`PRAGMA user_version = ${migration.version};`);
        this.db.exec('COMMIT;');
      } catch (err) {
        this.db.exec('ROLLBACK;');
        throw err;
      }
      this.markDirty();
    }
  }

  userVersion() {
    const row = this.get('PRAGMA user_version;');
    return row ? Number(Object.values(row)[0]) : 0;
  }

  /** Run a SELECT and return all rows as plain objects. */
  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  /** Run a SELECT and return the first row or undefined. */
  get(sql, params = []) {
    return this.all(sql, params)[0];
  }

  /**
   * Run a write statement. Schedules a debounced save.
   * @returns {{changes: number, lastInsertRowid: number}}
   */
  run(sql, params = []) {
    this.db.run(sql, params);
    const changes = this.db.getRowsModified();
    const last = this.get('SELECT last_insert_rowid() AS id');
    this.markDirty();
    return { changes, lastInsertRowid: Number(last?.id ?? 0) };
  }

  /**
   * Execute a function inside a transaction. Rolls back on any thrown error.
   * Nested calls reuse the outer transaction.
   */
  transaction(fn) {
    if (this.inTransaction) return fn(this);
    this.db.exec('BEGIN;');
    this.inTransaction = true;
    try {
      const result = fn(this);
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  /** Return the database as plain SQLite bytes (used for SQLite backups). */
  exportBytes() {
    return Buffer.from(this.db.export());
  }

  /**
   * Replace the entire database with the supplied SQLite bytes.
   * The caller is responsible for validating the bytes first.
   */
  replaceWith(bytes) {
    this.attach(bytes);
    this.migrate();
    this.markDirty();
    this.flush();
  }

  markDirty() {
    this.dirty = true;
    if (!this.filePath) return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, this.saveDelayMs);
    this.saveTimer.unref?.();
  }

  /**
   * Persist the database now (atomic write). No-op when in-memory or clean.
   */
  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.filePath || !this.dirty || !this.db) return;
    const plain = this.exportBytes();
    const data = this.key ? encryptWithKey(plain, this.key) : plain;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    this.dirty = false;
  }

  /** Flush and release resources. */
  close() {
    this.flush();
    this.db?.close();
    this.db = null;
  }
}
