/**
 * IPC layer: maps renderer requests to services.
 *
 * Every response has the shape { ok, data } or { ok: false, error, code }.
 * Channels other than OPEN_CHANNELS are refused while the session is locked,
 * so the PIN is enforced in the main process and not only in the UI.
 */
import { OPEN_CHANNELS } from './channels.js';
import { CURRENCIES, DEFAULT_SETTINGS } from '../../shared/constants.js';
import { formatInvoiceNumber, counterKeyFor } from '../../shared/numbering.js';
import { sanitizeFileName } from '../services/fileService.js';
import { toIsoDate } from '../../shared/format.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {Object} deps
 * @param {*} deps.ipcMain
 * @param {*} deps.app            Electron app (for version/paths)
 * @param {*} deps.shell          Electron shell
 * @param {*} deps.clipboard      Electron clipboard
 * @param {() => *} deps.getWindow  Returns the main BrowserWindow
 * @param {*} deps.container      Output of createContainer()
 * @param {{locked: boolean}} deps.session  Mutable session state
 * @param {string} deps.dbPath
 * @param {string} deps.keyProtection
 */
export function registerHandlers(deps) {
  const { ipcMain, app, shell, clipboard, getWindow, container, session, dbPath, keyProtection } = deps;
  const { services, repos } = container;
  const parent = () => getWindow();
  /** Files produced by this session (PDFs). Share actions are limited to these paths. */
  const generated = new Set();
  const requireGenerated = (file) => {
    if (!generated.has(file)) throw new Error('Only invoice PDFs created in this session can be shared from here.');
    if (!fs.existsSync(file)) throw new Error('The file no longer exists.');
    return file;
  };
  const defaultInvoiceFolder = () => path.join(app.getPath('documents'), 'Gulf Tech Invoices');

  const handlers = {
    // ---- App & settings --------------------------------------------------
    'app:info': () => ({
      name: 'Gulf Tech Dubai Invoice Manager',
      version: app.getVersion(),
      currencies: CURRENCIES,
      defaults: DEFAULT_SETTINGS,
      dbPath,
      keyProtection,
      platform: process.platform,
      offline: true,
    }),
    'app:settings:get': () => services.settings.getAll(),
    'app:settings:update': (partial) => services.settings.update(partial),

    // ---- Security ----------------------------------------------------------
    'security:status': () => ({ ...services.security.status(), locked: session.locked }),
    'security:unlock': ({ pin }) => {
      const res = services.security.unlock(pin);
      if (res.ok) session.locked = false;
      return { ...res, locked: session.locked };
    },
    'security:lock': () => {
      if (services.security.hasPin()) session.locked = true;
      return { locked: session.locked };
    },
    'security:setPin': ({ currentPin, newPin }) => services.security.setPin({ currentPin, newPin }),
    'security:removePin': ({ currentPin }) => {
      const status = services.security.removePin({ currentPin });
      session.locked = false;
      return status;
    },

    // ---- Businesses ---------------------------------------------------------
    'business:list': () => services.masterData.listBusinesses(),
    'business:get': ({ id }) => services.masterData.getBusiness(id),
    'business:save': (data) => services.masterData.saveBusiness(data),
    'business:delete': ({ id }) => services.masterData.deleteBusiness(id),

    // ---- Customers ----------------------------------------------------------
    'customer:list': (filters) => services.masterData.listCustomers(filters),
    'customer:get': ({ id }) => services.masterData.getCustomer(id),
    'customer:save': (data) => services.masterData.saveCustomer(data),
    'customer:delete': ({ id }) => services.masterData.deleteCustomer(id),
    'customer:history': ({ id }) => services.masterData.customerHistory(id),

    // ---- Products -----------------------------------------------------------
    'product:list': (filters) => services.masterData.listProducts(filters),
    'product:get': ({ id }) => services.masterData.getProduct(id),
    'product:byCode': ({ code }) => services.masterData.findProductByCode(code),
    'product:save': (data) => services.masterData.saveProduct(data),
    'product:delete': ({ id }) => services.masterData.deleteProduct(id),
    'product:categories': () => services.masterData.productCategories(),

    // ---- Invoices -----------------------------------------------------------
    'invoice:list': (filters) => services.invoices.list(filters),
    'invoice:get': ({ id }) => services.invoices.get(id),
    'invoice:save': (payload) => services.invoices.save(payload),
    'invoice:delete': ({ id }) => services.invoices.remove(id),
    'invoice:previewNumber': () => ({ number: services.invoices.previewNumber(new Date()) }),
    'invoice:numberFor': ({ date }) => {
      const s = services.settings.getAll();
      const d = date || toIsoDate(new Date());
      const key = counterKeyFor({ pattern: s['invoice.numberFormat'], prefix: s['invoice.prefix'], date: d });
      return {
        number: formatInvoiceNumber({
          pattern: s['invoice.numberFormat'],
          prefix: s['invoice.prefix'],
          date: d,
          seq: repos.counters.peek(key),
        }),
      };
    },

    // ---- Dashboard & reports -----------------------------------------------
    'dashboard:get': () => services.reports.dashboard(new Date()),
    'report:get': ({ period, anchor }) => services.reports.report(period, anchor),

    // ---- Backup & restore ----------------------------------------------------
    'backup:list': () => ({ folder: services.backup.backupDir(), files: services.backup.listBackups() }),
    'backup:export': async ({ format, password }) => {
      const base = `GulfTech-Backup-${new Date().toISOString().slice(0, 10)}`;
      const ext = format === 'sqlite' ? 'sqlite' : format;
      const dest = await services.files.chooseBackupDestination(parent(), `${base}.${ext}${password ? '.enc' : ''}`);
      if (!dest) return { cancelled: true };
      fs.writeFileSync(dest, services.backup.exportBuffer(format, { password: password || undefined }));
      return { cancelled: false, path: dest };
    },
    'backup:pickFile': async () => {
      const file = await services.files.pickBackupFile(parent());
      return file ? { path: file } : { cancelled: true };
    },
    'backup:restore': ({ path: file, password }) => {
      const buf = fs.readFileSync(file);
      try {
        const res = services.backup.restore(buf, { password: password || undefined });
        session.locked = services.security.hasPin();
        return { restored: true, ...res };
      } catch (err) {
        if (err.code === 'NEED_PASSWORD') return { restored: false, needsPassword: true, error: err.message };
        throw err;
      }
    },
    'backup:runNow': () => {
      const file = services.backup.runAutoIfDue({ force: true });
      return { path: file };
    },
    'backup:chooseFolder': async () => {
      const folder = await services.files.chooseFolder(parent(), 'Choose automatic backup folder');
      if (!folder) return { cancelled: true };
      services.settings.update({ 'backup.folder': folder });
      return { cancelled: false, folder };
    },

    // ---- PDF / print / share -------------------------------------------------
    'pdf:print': ({ html, pageSize }) => services.print.print(html, pageSize),
    'pdf:export': async ({ html, pageSize, fileBase }) => {
      const file = await services.print.exportWithDialog(parent(), html, pageSize, fileBase);
      if (file) generated.add(file);
      return file ? { path: file } : { cancelled: true };
    },
    'pdf:save': async ({ html, pageSize, fileBase }) => {
      const s = services.settings.getAll();
      const folder = s['pdf.outputFolder'] || defaultInvoiceFolder();
      const file = await services.print.saveToFolder(html, pageSize, folder, fileBase);
      generated.add(file);
      return { path: file, folder };
    },
    'pdf:chooseFolder': async () => {
      const folder = await services.files.chooseFolder(parent(), 'Choose the folder for saved invoice PDFs');
      if (!folder) return { cancelled: true };
      services.settings.update({ 'pdf.outputFolder': folder });
      return { cancelled: false, folder };
    },
    'share:reveal': ({ path: file }) => {
      shell.showItemInFolder(requireGenerated(file));
      return { ok: true };
    },
    'share:open': async ({ path: file }) => {
      const err = await shell.openPath(requireGenerated(file));
      if (err) throw new Error(err);
      return { ok: true };
    },
    'share:email': async ({ to, subject, body }) => {
      await shell.openExternal(buildMailto({ to, subject, body }));
      return { ok: true };
    },
    'share:whatsapp': async ({ number, message }) => {
      await shell.openExternal(buildWhatsAppUrl(number, message));
      return { ok: true };
    },
    'share:copyPath': ({ path: file }) => {
      clipboard.writeText(requireGenerated(file));
      return { ok: true };
    },

    // ---- Files -----------------------------------------------------------------
    'file:pickImage': async () => {
      const picked = await services.files.pickImage(parent());
      return picked;
    },
    'file:saveText': async ({ defaultName, content, filters }) => {
      const p = await services.files.saveText(parent(), { defaultName: sanitizeFileName(defaultName), content, filters });
      return p ? { path: p } : { cancelled: true };
    },
  };

  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (event, arg) => {
      try {
        assertTrustedSender(event);
        if (session.locked && !OPEN_CHANNELS.has(channel)) {
          const err = new Error('The application is locked. Enter your PIN to continue.');
          err.code = 'LOCKED';
          throw err;
        }
        const data = await fn(arg);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err.message || String(err), code: err.code || 'ERROR' };
      }
    });
  }
  return Object.keys(handlers);
}

/** Only the application's own pages may call IPC. */
export function assertTrustedSender(event) {
  const url = event?.senderFrame?.url || '';
  if (!url.startsWith('app://')) throw new Error('Untrusted sender.');
}

/** Build a mailto: URL (attachments are not supported by mailto, the PDF is revealed for drag-and-drop). */
export function buildMailto({ to = '', subject = '', body = '' }) {
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${encodeURIComponent(to)}?${q}`;
}

/**
 * wa.me link. The number is normalised to digits only (international format, e.g. 971501234567).
 */
export function buildWhatsAppUrl(number, message = '') {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) throw new Error('Enter a WhatsApp number first.');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
