/**
 * Browser edition backend: the same services, repositories and IPC handlers as the
 * desktop app, started against the browser's offline storage instead of Electron.
 * Contains no React code, so it can be exercised directly in tests.
 */
import './polyfills.js';
import { initVfs, flushVfs, persistenceEnabled } from './shims/fs.js';
import { createIpc, installPreloadBridge, createElectronApis } from './electronShim.js';
import { loadOrCreateKey } from '../electron/security/keyStore.js';
import { AppDatabase, loadSqlEngine } from '../electron/data/database.js';
import { createContainer } from '../electron/services/container.js';
import { registerHandlers } from '../electron/ipc/registerHandlers.js';

const USER_DATA = '/UserData';
const AUTO_BACKUP_CHECK_MS = 15 * 60 * 1000;

/**
 * Start the backend and expose `window.gulftech`.
 * @returns {Promise<{database: AppDatabase, container: object, storage: 'indexeddb'|'memory'}>}
 */
export async function startBackend() {
  await initVfs();
  const electron = createElectronApis();
  const { ipcMain, ipcRenderer } = createIpc();

  const dataDir = `${USER_DATA}/data`;
  const dbPath = `${dataDir}/gulftech-invoices.db`;
  // Browsers have no DPAPI equivalent, so the key is stored unwrapped in the
  // browser's own storage (reported to the UI as "plain" protection).
  const keyInfo = loadOrCreateKey({ dir: dataDir, safeStorage: null });
  const SQL = await loadSqlEngine('/sql-engine');
  const database = await AppDatabase.open({ SQL, filePath: dbPath, key: keyInfo.key });

  const container = createContainer({
    db: database,
    SQL,
    key: keyInfo.key,
    userDataDir: USER_DATA,
    electron: { BrowserWindow: electron.BrowserWindow, dialog: electron.dialog, shell: electron.shell },
    now: () => new Date(),
  });

  const session = { locked: container.services.security.hasPin() };
  registerHandlers({
    ipcMain,
    app: electron.app,
    shell: electron.shell,
    clipboard: electron.clipboard,
    getWindow: () => null,
    container,
    session,
    dbPath,
    keyProtection: keyInfo.protection,
  });
  installPreloadBridge(ipcRenderer);

  const autoBackup = () => {
    try {
      container.services.backup.runAutoIfDue();
    } catch (err) {
      console.error('Automatic backup failed', err);
    }
  };
  autoBackup();
  const timer = setInterval(autoBackup, AUTO_BACKUP_CHECK_MS);

  /** Write pending changes to browser storage (called when the page is hidden or closed). */
  const saveAll = async () => {
    database.flush();
    await flushVfs();
  };

  return {
    database,
    container,
    timer,
    saveAll,
    storage: persistenceEnabled() ? 'indexeddb' : 'memory',
  };
}
