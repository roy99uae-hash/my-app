/**
 * Module aliases that let the shared Electron-side backend run in a browser.
 * Used by the browser build (vite.browser.config.mjs) and by the browser test bundle.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const shim = (name) => path.join(here, 'shims', name);

export const browserAliases = [
  { find: /^(node:)?fs$/, replacement: shim('fs.js') },
  { find: /^(node:)?crypto$/, replacement: shim('crypto.js') },
  { find: /^node:module$/, replacement: shim('module.js') },
  { find: /^(node:)?path$/, replacement: 'path-browserify' },
  { find: /^(node:)?zlib$/, replacement: shim('zlib.js') },
  { find: /^(node:)?buffer$/, replacement: 'buffer' },
];
