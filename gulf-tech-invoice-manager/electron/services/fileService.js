/**
 * File-system helpers: image picking (logos, product photos, signatures),
 * text exports (CSV) and filename sanitisation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MAX_IMAGE_BYTES } from '../../shared/constants.js';

const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export class FileService {
  /**
   * @param {{dialog: *}} deps Electron dialog module
   */
  constructor({ dialog }) {
    this.dialog = dialog;
  }

  /**
   * Let the user pick an image and return it as a data URL.
   * @returns {Promise<{name: string, dataUrl: string} | null>}
   */
  async pickImage(parent) {
    const result = await this.dialog.showOpenDialog(parent, {
      title: 'Choose an image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return readImageAsDataUrl(result.filePaths[0]);
  }

  /**
   * Ask for a destination and save text (e.g. CSV exports).
   * @returns {Promise<string|null>}
   */
  async saveText(parent, { defaultName, content, filters }) {
    const result = await this.dialog.showSaveDialog(parent, {
      defaultPath: sanitizeFileName(defaultName),
      filters: filters || [{ name: 'All files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, content, 'utf8');
    return result.filePath;
  }

  /** Ask the user to choose a folder. */
  async chooseFolder(parent, title) {
    const result = await this.dialog.showOpenDialog(parent, { title, properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0] || null;
  }

  /** Open a file picker for backup files (ZIP, JSON, SQLite). */
  async pickBackupFile(parent) {
    const result = await this.dialog.showOpenDialog(parent, {
      title: 'Choose a backup file to restore',
      properties: ['openFile'],
      filters: [
        { name: 'Backups', extensions: ['zip', 'json', 'sqlite', 'db', 'gtbak', 'enc'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  }

  /** Save-dialog for a backup file. */
  async chooseBackupDestination(parent, defaultName) {
    const result = await this.dialog.showSaveDialog(parent, {
      title: 'Save backup',
      defaultPath: sanitizeFileName(defaultName),
      filters: [
        { name: 'ZIP backup', extensions: ['zip'] },
        { name: 'JSON backup', extensions: ['json'] },
        { name: 'SQLite database', extensions: ['sqlite', 'db'] },
        { name: 'Encrypted backup', extensions: ['enc'] },
      ],
    });
    return result.canceled ? null : result.filePath || null;
  }
}

/**
 * Read an image from disk, enforcing the extension whitelist and size limit.
 * @param {string} file
 * @returns {{name: string, dataUrl: string}}
 */
export function readImageAsDataUrl(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = IMAGE_MIME[ext];
  if (!mime) throw new Error('Unsupported image type. Use PNG, JPG or WebP.');
  const stat = fs.statSync(file);
  if (stat.size > MAX_IMAGE_BYTES) throw new Error('Image is larger than 2 MB. Please use a smaller file.');
  const data = fs.readFileSync(file);
  return { name: path.basename(file), dataUrl: `data:${mime};base64,${data.toString('base64')}` };
}

/** Make a string safe to use as a file name on Windows. */
export function sanitizeFileName(name) {
  const cleaned = String(name || 'document')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return cleaned.slice(0, 120) || 'document';
}
