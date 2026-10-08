/**
 * Browser implementations of the Electron APIs used by the backend:
 * dialogs (file picker / download), shell, clipboard, app paths, the hidden
 * print window, and the IPC channel that connects the preload API to handlers.
 */
import pkg from '../package.json';
import preloadSource from '../electron/preload.cjs?raw';
import fs, { getExportedBytes, EXPORT_ROOT } from './shims/fs.js';
import { Buffer } from 'buffer';
import path from 'path-browserify';

/** Internal origin used for IPC trust checks: the page itself is the only caller. */
const TRUSTED_ORIGIN = 'app://local/index.html';

/** Channel registry: registerHandlers() registers into it, the preload API calls it. */
export function createIpc() {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
  };
  const ipcRenderer = {
    invoke(channel, arg) {
      const fn = handlers.get(channel);
      if (!fn) return Promise.resolve({ ok: false, error: `Unknown channel ${channel}`, code: 'ERROR' });
      return Promise.resolve().then(() => fn({ senderFrame: { url: TRUSTED_ORIGIN } }, arg));
    },
  };
  return { ipcMain, ipcRenderer };
}

/**
 * Evaluate the shared preload script (electron/preload.cjs) against the browser
 * IPC bridge and expose the resulting API as `window.gulftech`, exactly as the
 * desktop app does. This keeps one definition of the API for both editions.
 */
export function installPreloadBridge(ipcRenderer) {
  const electronStub = {
    contextBridge: {
      exposeInMainWorld(name, api) {
        globalThis.window[name] = api;
      },
    },
    ipcRenderer,
  };
  const moduleStub = { exports: {} };
  const requireStub = (id) => {
    if (id === 'electron') return electronStub;
    throw new Error(`Preload module "${id}" is not available in the browser edition`);
  };
  // eslint-disable-next-line no-new-func -- evaluates the bundled, reviewed preload source
  new Function('require', 'module', 'exports', preloadSource)(requireStub, moduleStub, moduleStub.exports);
  return globalThis.window.gulftech;
}

// ---- Dialogs ---------------------------------------------------------------

/** Ask the user for one file through the browser's file picker. */
function pickFile(filters = []) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    const exts = filters.flatMap((f) => f.extensions || []).filter((e) => e !== '*');
    if (exts.length) input.accept = exts.map((e) => `.${e}`).join(',');
    input.onchange = () => resolve(input.files?.[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

const dialog = {
  async showOpenDialog(_parent, options = {}) {
    if ((options.properties || []).includes('openDirectory')) {
      // Browsers do not expose folder paths; folder settings keep their defaults.
      return { canceled: true, filePaths: [] };
    }
    const file = await pickFile(options.filters);
    if (!file) return { canceled: true, filePaths: [] };
    // Only the most recent upload is kept in the virtual file system.
    if (fs.existsSync('/Uploads')) {
      for (const old of fs.readdirSync('/Uploads')) fs.rmSync(`/Uploads/${old}`, { force: true });
    }
    const target = `/Uploads/${Date.now()}-${file.name.replace(/[^\w.\- ]/g, '_')}`;
    fs.writeFileSync(target, new Uint8Array(await file.arrayBuffer()));
    return { canceled: false, filePaths: [target] };
  },
  async showSaveDialog(_parent, options = {}) {
    // The file is delivered as a browser download when the backend writes it.
    const name = path.basename(options.defaultPath || 'document');
    return { canceled: false, filePath: `${EXPORT_ROOT}/${name}` };
  },
  showErrorBox(title, message) {
    window.alert(`${title}\n\n${message}`);
  },
};

// ---- Shell & clipboard -----------------------------------------------------

const shell = {
  /** Opens mailto: and wa.me links in a new tab, never navigating the app away. */
  async openExternal(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  },
  // Browsers cannot reveal folders; downloads appear in the browser's download list.
  showItemInFolder() {},
  async openPath(p) {
    const bytes = getExportedBytes(p);
    if (!bytes) return 'Open the file from your browser downloads list.';
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return '';
  },
};

const clipboard = {
  writeText(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
  },
};

const app = {
  getVersion: () => pkg.version,
  getPath(name) {
    if (name === 'userData') return '/UserData';
    if (name === 'documents' || name === 'downloads') return EXPORT_ROOT;
    throw new Error(`Unsupported path "${name}" in the browser edition`);
  },
  isPackaged: true,
};

// ---- Print window -----------------------------------------------------------

const PAGE_WIDTH_PX = 794; // A4 width at 96 dpi; the invoice layout is designed for this width.

/** Render the iframe's document to a PDF using html2pdf (html2canvas + jsPDF), fully in the browser. */
async function iframeToPdf(iframe, { pageSize = 'A4' } = {}) {
  const { default: html2pdf } = await import('html2pdf.js');
  const arrayBuffer = await html2pdf()
    .set({
      margin: 0,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: PAGE_WIDTH_PX },
      jsPDF: { unit: 'mm', format: String(pageSize).toLowerCase(), orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    })
    .from(iframe.contentDocument.body)
    .toPdf()
    .get('pdf')
    .then((pdf) => pdf.output('arraybuffer'));
  return Buffer.from(arrayBuffer);
}

/**
 * Stand-in for Electron's hidden BrowserWindow: loads HTML into an off-screen
 * iframe, then offers `printToPDF` and `print` on its webContents.
 */
class BrowserWindow {
  constructor() {
    this.iframe = null;
    this.destroyed = false;
    const self = this;
    this.webContents = {
      printToPDF: (options) => iframeToPdf(self.iframe, options),
      print(_options, callback) {
        try {
          self.iframe.contentWindow.focus();
          self.iframe.contentWindow.print();
          callback?.(true);
        } catch (err) {
          callback?.(false, err.message);
        }
      },
    };
  }

  loadFile(file) {
    const html = fs.readFileSync(file, 'utf8');
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = `position:fixed;top:0;left:-${PAGE_WIDTH_PX + 200}px;width:${PAGE_WIDTH_PX}px;height:1123px;border:0;opacity:0;pointer-events:none;`;
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('The invoice could not be rendered.'));
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
      this.iframe = iframe;
    });
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    this.destroyed = true;
    this.iframe?.remove();
  }
}

export function createElectronApis() {
  return { app, dialog, shell, clipboard, BrowserWindow };
}
