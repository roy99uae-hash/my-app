/**
 * Electron main process: application lifecycle, window management, database
 * startup and the scheduled automatic backup.
 *
 * The UI is served from the bundled `dist/` folder through a privileged `app://`
 * scheme (rather than file://), which keeps ES module loading and CSP simple and
 * secure. No remote content is ever loaded.
 */
import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, net, protocol, safeStorage, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadOrCreateKey } from './security/keyStore.js';
import { AppDatabase, loadSqlEngine } from './data/database.js';
import { createContainer } from './services/container.js';
import { registerHandlers } from './ipc/registerHandlers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.join(here, '..', 'dist');
const APP_SCHEME = 'app';
const AUTO_BACKUP_CHECK_MS = 15 * 60 * 1000;

let mainWindow = null;
let container = null;
let database = null;
let logFile = null;

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Only one copy of the application may run at a time (protects the database file).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(bootstrap).catch(fatal);
}

async function bootstrap() {
  const userData = app.getPath('userData');
  logFile = path.join(userData, 'logs', 'app.log');
  process.on('uncaughtException', (err) => log(`uncaught: ${err.stack || err}`));
  process.on('unhandledRejection', (err) => log(`unhandled: ${err?.stack || err}`));

  registerAppProtocol();
  Menu.setApplicationMenu(null);

  const dataDir = path.join(userData, 'data');
  const dbPath = path.join(dataDir, 'gulftech-invoices.db');
  const keyInfo = loadOrCreateKey({ dir: dataDir, safeStorage });
  const SQL = await loadSqlEngine(resolveSqlWasmDir());
  database = await AppDatabase.open({ SQL, filePath: dbPath, key: keyInfo.key });

  container = createContainer({
    db: database,
    SQL,
    key: keyInfo.key,
    userDataDir: userData,
    electron: { BrowserWindow, dialog, shell },
    now: () => new Date(),
  });

  const session = { locked: container.services.security.hasPin() };
  registerHandlers({
    ipcMain,
    app,
    shell,
    clipboard,
    getWindow: () => mainWindow,
    container,
    session,
    dbPath,
    keyProtection: keyInfo.protection,
  });

  createMainWindow();
  runAutoBackupSafely();
  setInterval(runAutoBackupSafely, AUTO_BACKUP_CHECK_MS).unref();
  log(`started; db=${dbPath}; key=${keyInfo.protection}; locked=${session.locked}`);
}

/** Serve bundled UI files from dist/ with path traversal protection. */
function registerAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(rendererDir, rel));
    if (!file.startsWith(rendererDir)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'Gulf Tech Dubai Invoice Manager',
    backgroundColor: '#f1f5f9',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://`)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(`${APP_SCHEME}://local/index.html`);
}

/** Automatic backups must never crash the app; failures are logged. */
function runAutoBackupSafely() {
  try {
    const file = container?.services.backup.runAutoIfDue();
    if (file) log(`auto backup written: ${file}`);
  } catch (err) {
    log(`auto backup failed: ${err.stack || err}`);
  }
}

/** The sql.js WebAssembly file must be readable from disk when packaged inside asar. */
function resolveSqlWasmDir() {
  const req = createRequire(import.meta.url);
  let dir = path.dirname(req.resolve('sql.js/dist/sql-wasm.js'));
  if (app.isPackaged) dir = dir.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`).replace(/app\.asar$/, 'app.asar.unpacked');
  return dir;
}

function log(message) {
  try {
    if (!logFile) return;
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* logging must never throw */
  }
}

function fatal(err) {
  log(`fatal: ${err.stack || err}`);
  dialog.showErrorBox(
    'Gulf Tech Dubai Invoice Manager could not start',
    `${err.message}\n\nDetails were written to the application log.`,
  );
  app.quit();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    database?.close();
  } catch (err) {
    log(`close failed: ${err.message}`);
  }
});
