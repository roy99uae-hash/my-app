/**
 * Packages the offline deliverables into release/:
 *
 *  1. GulfTechInvoiceManager-Browser-Offline.zip
 *       A single self-contained HTML file (all JavaScript, CSS and the SQLite engine inlined)
 *       plus a readme and the user manual. Opens by double-clicking, with no server or internet.
 *
 *  2. GulfTechInvoiceManager-Source.zip
 *       The full source tree (excluding node_modules, build output, release folders and .git).
 *
 * Run after `vite build --config vite.browser.config.mjs` (see `npm run build:browser`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist-browser');
const releaseDir = path.join(root, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const htmlName = 'GulfTechInvoiceManager-Offline.html';

// ---- 1. Inline the browser build into one file -----------------------------

function inlineBuild() {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error('dist-browser/index.html not found. Run the browser build first.');
  let html = fs.readFileSync(indexPath, 'utf8');

  const scriptRe = /<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/;
  const styleRe = /<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g;

  const scriptMatch = html.match(scriptRe);
  if (!scriptMatch) throw new Error('Module script tag not found in dist-browser/index.html');
  const js = fs.readFileSync(path.join(distDir, scriptMatch[1]), 'utf8');
  if (/\bimport\s*\(\s*['"]\.\//.test(js) || /^import .* from '\.\//m.test(js)) {
    throw new Error('Bundle still references separate chunks; it cannot be inlined.');
  }
  // A literal closing script tag inside the bundle would end the inline script early.
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  html = html.replace(scriptRe, () => `<script type="module">\n${safeJs}\n</script>`);

  // Styles go into <head> so the page is never shown unstyled.
  const styles = [];
  html = html.replace(styleRe, (_m, file) => {
    const css = fs.readFileSync(path.join(distDir, file), 'utf8');
    if (/url\(\s*['"]?\.\//.test(css)) throw new Error(`Stylesheet ${file} references external files`);
    styles.push(`<style>\n${css}\n</style>`);
    return '';
  });
  html = html.replace('</head>', () => `${styles.join('\n')}\n</head>`);

  // Nothing may point at another file or the network.
  // Check only the markup, not the code inside <script>/<style> blocks.
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const external = markup.match(/(?:src|href)="(?!data:|blob:|#)[^"]+"/g);
  if (external) throw new Error(`External references remain: ${external.join(', ')}`);
  return html;
}

// ---- 2. ZIP helpers --------------------------------------------------------

const SOURCE_EXCLUDES = new Set(['node_modules', 'dist', 'dist-browser', 'release', '.git', '.vite', 'coverage']);

function addDirectory(zip, dir, zipPath, exclude = () => false) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const inZip = zipPath ? `${zipPath}/${entry.name}` : entry.name;
    if (exclude(entry.name, full)) continue;
    if (entry.isDirectory()) addDirectory(zip, full, inZip, exclude);
    else if (entry.isFile() && !entry.name.endsWith('.log')) zip.addLocalFile(full, zipPath ? `${zipPath}/` : '');
  }
}

// ---- 3. Build the packages -------------------------------------------------

fs.mkdirSync(releaseDir, { recursive: true });

const html = inlineBuild();
const readme = `Gulf Tech Dubai Invoice Manager - Offline Browser Edition (version ${version})
=====================================================================

WHAT THIS IS
  A complete invoicing application in ONE file: ${htmlName}
  It runs in your web browser and works with no internet connection.
  No data is sent anywhere. The page's security policy blocks all network requests.

HOW TO OPEN IT
  1. Extract this ZIP to any folder (for example Documents).
  2. Double-click ${htmlName}.
  3. Use a current version of Google Chrome, Microsoft Edge or Firefox.

WHERE YOUR DATA IS KEPT
  Data is saved in the offline storage of that browser profile (IndexedDB).
  - Use the same browser and profile every time to see the same data.
  - Do NOT clear site data or browsing data for this file, or your records will be deleted.
  - Make a backup often: Backup & Restore > Export (ZIP). Keep copies on another drive.

FILES AND PDFs
  - Save PDF, Export PDF, Email/WhatsApp and Share create the PDF in your browser's
    downloads folder (the browser's download list shows it). Attach it to emails manually.
  - Print sends the invoice to your printer or to "Save as PDF".
  - Backups and CSV exports are downloads too; restore a backup with the Restore button.

DIFFERENCES FROM THE WINDOWS DESKTOP APP
  - The data encryption key is kept in the browser's storage (the desktop app protects it
    with Windows DPAPI). Keep your device and browser profile secure.
  - Folder pickers are not available: exports go to the browser's downloads folder.
  - Fingerprint unlock is not included in either edition; use the PIN lock.
  - Backups are compatible both ways with the desktop app's ZIP, JSON and SQLite backups.

See USER_MANUAL.md for how to use every feature.
`;

const browserZip = new AdmZip();
browserZip.addFile(htmlName, Buffer.from(html, 'utf8'));
browserZip.addFile('README.txt', Buffer.from(readme, 'utf8'));
browserZip.addFile('USER_MANUAL.md', fs.readFileSync(path.join(root, 'docs', 'USER_MANUAL.md')));
const browserZipPath = path.join(releaseDir, `GulfTechInvoiceManager-Browser-Offline-${version}.zip`);
browserZip.writeZip(browserZipPath);

const sourceZip = new AdmZip();
addDirectory(sourceZip, root, 'gulf-tech-invoice-manager', (name) => SOURCE_EXCLUDES.has(name) || name === '.DS_Store');
const sourceZipPath = path.join(releaseDir, `GulfTechInvoiceManager-Source-${version}.zip`);
sourceZip.writeZip(sourceZipPath);

for (const p of [browserZipPath, sourceZipPath]) {
  console.log(`${path.relative(root, p)}  ${(fs.statSync(p).size / 1024).toFixed(0)} KB`);
}
