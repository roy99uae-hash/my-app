/**
 * Browser replacement for `node:fs`.
 *
 * The backend uses synchronous file APIs. In the browser they are served by an
 * in-memory virtual file system that is persisted to IndexedDB (the browser's
 * offline storage). Writes to `/Exports/` are not stored: they are delivered to
 * the user as downloads, which is how "Save", "Export" and backup files reach
 * the user's Downloads folder.
 */
import { Buffer } from 'buffer';
import path from 'path-browserify';

export const EXPORT_ROOT = '/Exports';
const DB_NAME = 'gulftech-offline';
const STORE = 'files';
const MAX_EXPORT_CACHE = 20;

const files = new Map(); // normalised path -> { data: Uint8Array, mtime: number }
const dirs = new Set(['/']);
const exported = new Map(); // recently exported bytes, used by "Open" actions
let idb = null;
let writeQueue = Promise.resolve();

const norm = (p) => path.normalize(String(p).replace(/\\/g, '/'));
const isExport = (p) => {
  const n = norm(p);
  return n === EXPORT_ROOT || n.startsWith(`${EXPORT_ROOT}/`);
};

function notFound(p, op) {
  const err = new Error(`ENOENT: no such file or directory, ${op} '${p}'`);
  err.code = 'ENOENT';
  return err;
}

/** Copy any supported input (string, Buffer, typed array, ArrayBuffer) into a fresh Uint8Array. */
function toBytes(data) {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  return new Uint8Array(data);
}

function ensureDirs(p) {
  let d = path.dirname(norm(p));
  while (d && !dirs.has(d)) {
    dirs.add(d);
    const parent = path.dirname(d);
    if (parent === d) break;
    d = parent;
  }
}

function mimeFor(name) {
  const ext = path.extname(name).toLowerCase();
  return (
    { '.pdf': 'application/pdf', '.csv': 'text/csv', '.json': 'application/json', '.zip': 'application/zip', '.html': 'text/html' }[ext] ||
    'application/octet-stream'
  );
}

/** Deliver bytes to the user through the browser's download mechanism. */
function download(name, bytes) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeFor(name) }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---- IndexedDB persistence -------------------------------------------------

/**
 * Load previously saved files. Must be awaited before the backend starts.
 * Falls back to memory-only storage where IndexedDB is unavailable (e.g. tests).
 */
export async function initVfs() {
  if (typeof indexedDB === 'undefined') return false;
  idb = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const entries = await new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keys = store.getAllKeys();
    const values = store.getAll();
    tx.oncomplete = () => resolve(keys.result.map((k, i) => [k, values.result[i]]));
    tx.onerror = () => reject(tx.error);
  });
  for (const [key, record] of entries) {
    files.set(key, { data: new Uint8Array(record.data), mtime: record.mtime });
    ensureDirs(key);
  }
  if (navigator?.storage?.persist) navigator.storage.persist().catch(() => {});
  return true;
}

/** Whether data is saved in the browser (true) or only kept for this page session (false). */
export const persistenceEnabled = () => idb !== null;

/** Resolves once every queued write has reached IndexedDB. */
export const flushVfs = () => writeQueue;

function enqueue(op) {
  if (!idb) return;
  writeQueue = writeQueue
    .then(
      () =>
        new Promise((resolve, reject) => {
          const tx = idb.transaction(STORE, 'readwrite');
          op(tx.objectStore(STORE));
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        }),
    )
    .catch((err) => console.error('Local storage write failed', err));
}

// ---- Public, synchronous fs API ------------------------------------------

export function readFileSync(p, options) {
  const n = norm(p);
  const file = files.get(n);
  if (!file) throw notFound(n, 'open');
  const buf = Buffer.from(file.data);
  const enc = typeof options === 'string' ? options : options?.encoding;
  return enc ? buf.toString(enc) : buf;
}

export function writeFileSync(p, data) {
  const n = norm(p);
  const bytes = toBytes(data);
  if (isExport(n)) {
    exported.set(n, bytes);
    if (exported.size > MAX_EXPORT_CACHE) exported.delete(exported.keys().next().value);
    download(path.basename(n), bytes);
    return;
  }
  ensureDirs(n);
  const record = { data: bytes, mtime: Date.now() };
  files.set(n, record);
  enqueue((store) => store.put({ data: bytes, mtime: record.mtime }, n));
}

export function appendFileSync(p, data) {
  const n = norm(p);
  const existing = files.get(n)?.data ?? new Uint8Array(0);
  const extra = toBytes(data);
  const merged = new Uint8Array(existing.length + extra.length);
  merged.set(existing, 0);
  merged.set(extra, existing.length);
  writeFileSync(n, merged);
}

export function existsSync(p) {
  const n = norm(p);
  if (isExport(n)) return false;
  return files.has(n) || dirs.has(n);
}

export function mkdirSync(p) {
  const n = norm(p);
  if (isExport(n)) return;
  dirs.add(n);
  ensureDirs(n);
}

export function renameSync(from, to) {
  const a = norm(from);
  const b = norm(to);
  const file = files.get(a);
  if (!file) throw notFound(a, 'rename');
  files.delete(a);
  files.set(b, file);
  ensureDirs(b);
  enqueue((store) => {
    store.delete(a);
    store.put({ data: file.data, mtime: file.mtime }, b);
  });
}

export function statSync(p) {
  const n = norm(p);
  const file = files.get(n);
  if (file) {
    return {
      size: file.data.length,
      mtime: new Date(file.mtime),
      mtimeMs: file.mtime,
      isFile: () => true,
      isDirectory: () => false,
    };
  }
  if (dirs.has(n)) {
    return { size: 0, mtime: new Date(0), mtimeMs: 0, isFile: () => false, isDirectory: () => true };
  }
  throw notFound(n, 'stat');
}

export function readdirSync(p) {
  const n = norm(p);
  if (!dirs.has(n)) throw notFound(n, 'scandir');
  const prefix = n === '/' ? '/' : `${n}/`;
  const names = new Set();
  for (const key of [...files.keys(), ...dirs]) {
    if (key !== n && key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]);
  }
  return [...names].sort();
}

export function rmSync(p, options = {}) {
  const n = norm(p);
  if (isExport(n)) return;
  if (files.has(n)) {
    files.delete(n);
    enqueue((store) => store.delete(n));
    return;
  }
  if (dirs.has(n)) {
    const prefix = `${n}/`;
    for (const key of [...files.keys()]) {
      if (key.startsWith(prefix)) {
        files.delete(key);
        enqueue((store) => store.delete(key));
      }
    }
    dirs.delete(n);
    return;
  }
  if (!options.force) throw notFound(n, 'rm');
}

export const unlinkSync = (p) => rmSync(p);

/** Bytes of a recently exported file (used by "Open" actions), or undefined. */
export function getExportedBytes(p) {
  return exported.get(norm(p));
}

export default {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  readdirSync,
  rmSync,
  unlinkSync,
};
