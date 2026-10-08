/**
 * Printing and PDF service.
 *
 * Invoices arrive as complete HTML documents (see shared/invoiceTemplates.js).
 * They are rendered in a hidden Chromium window, then either sent to the
 * Windows print dialog or converted to PDF with `webContents.printToPDF`.
 * Everything happens locally; no network access is needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeFileName } from './fileService.js';

export class PrintService {
  /**
   * @param {Object} deps
   * @param {*} deps.BrowserWindow  Electron BrowserWindow class
   * @param {*} deps.dialog         Electron dialog module
   * @param {*} deps.shell          Electron shell module
   * @param {string} deps.tempDir   Writable temp folder for intermediate HTML files
   */
  constructor({ BrowserWindow, dialog, shell, tempDir }) {
    Object.assign(this, { BrowserWindow, dialog, shell, tempDir });
  }

  /**
   * Load HTML in a hidden window and run `task` with its webContents.
   * @template T
   * @param {string} html
   * @param {(wc: *) => Promise<T>} task
   * @returns {Promise<T>}
   */
  async withRenderedPage(html, task) {
    fs.mkdirSync(this.tempDir, { recursive: true });
    const file = path.join(this.tempDir, `invoice-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(file, html, 'utf8');
    const win = new this.BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
    });
    try {
      await win.loadFile(file);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return await task(win.webContents);
    } finally {
      if (!win.isDestroyed()) win.destroy();
      fs.rmSync(file, { force: true });
    }
  }

  /**
   * Render HTML to a PDF buffer.
   * @param {string} html
   * @param {'A4'|'A5'} pageSize
   * @returns {Promise<Buffer>}
   */
  async renderPdf(html, pageSize = 'A4') {
    return this.withRenderedPage(html, (wc) =>
      wc.printToPDF({
        pageSize,
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: 'default' },
      }),
    );
  }

  /**
   * Open the system print dialog for the invoice.
   * @returns {Promise<{printed: boolean, reason?: string}>}
   */
  async print(html, pageSize = 'A4') {
    return this.withRenderedPage(
      html,
      (wc) =>
        new Promise((resolve) => {
          wc.print({ silent: false, printBackground: true, pageSize }, (success, reason) =>
            resolve({ printed: !!success, reason: success ? undefined : reason }),
          );
        }),
    );
  }

  /**
   * Save an invoice PDF into a folder without prompting (used by Save / Email / WhatsApp).
   * @returns {Promise<string>} absolute path of the written PDF
   */
  async saveToFolder(html, pageSize, folder, fileBase) {
    const buf = await this.renderPdf(html, pageSize);
    fs.mkdirSync(folder, { recursive: true });
    const file = uniquePath(path.join(folder, `${sanitizeFileName(fileBase)}.pdf`));
    fs.writeFileSync(file, buf);
    return file;
  }

  /**
   * Export a PDF through a Save dialog chosen by the user.
   * @returns {Promise<string|null>} chosen path, or null when cancelled
   */
  async exportWithDialog(parent, html, pageSize, fileBase) {
    const result = await this.dialog.showSaveDialog(parent, {
      title: 'Export invoice as PDF',
      defaultPath: `${sanitizeFileName(fileBase)}.pdf`,
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const buf = await this.renderPdf(html, pageSize);
    fs.writeFileSync(result.filePath, buf);
    return result.filePath;
  }
}

/** Append (1), (2)... to a path until it does not exist. */
export function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  let i = 1;
  while (fs.existsSync(path.join(dir, `${name} (${i})${ext}`))) i++;
  return path.join(dir, `${name} (${i})${ext}`);
}
