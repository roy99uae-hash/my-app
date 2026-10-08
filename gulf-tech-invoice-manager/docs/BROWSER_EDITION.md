# Offline Browser Edition

The browser edition is the same invoicing application packaged as **one HTML file**. It opens
in Chrome, Edge or Firefox by double-clicking, with no installation, no server and no internet.

## What is in the package

`GulfTechInvoiceManager-Browser-Offline-<version>.zip` contains:

| File | Purpose |
|---|---|
| `GulfTechInvoiceManager-Offline.html` | The whole application: code, styles, SQLite engine and PDF engine |
| `README.txt` | Quick start for end users |
| `USER_MANUAL.md` | Full user manual (features are the same as the desktop app) |

The source package `GulfTechInvoiceManager-Source-<version>.zip` contains the complete project,
including the code that builds this edition.

## Privacy and offline guarantees

- The page's Content Security Policy sets `connect-src 'none'`, so the page cannot make any
  network request. No data leaves the computer.
- Nothing is loaded from external servers: no fonts, scripts, images or APIs.
- Data is stored in the browser's offline storage (IndexedDB) for that browser profile.

## How it works

The browser edition runs the same backend as the desktop app (services, repositories, IPC
handlers, backup and crypto logic) with thin browser adapters in `browser/`:

| Desktop (Electron) | Browser edition |
|---|---|
| Files on disk | In-memory virtual file system persisted to IndexedDB (`browser/shims/fs.js`) |
| Windows DPAPI key protection | Key kept in browser storage; reported as "plain" protection |
| Native open/save dialogs | File picker for opening; saved files are delivered as downloads |
| Hidden window + `printToPDF` | Off-screen frame rendered to PDF in the browser (`html2pdf.js`) |
| `shell.openExternal` | Opens `mailto:` / `wa.me` links in a new tab |
| Node `crypto` (scrypt, AES-256-GCM) | Pure-JavaScript equivalents (`@noble/hashes`, `@noble/ciphers`) |
| `sql.js` (WebAssembly) | `sql.js` asm.js build (no separate file to fetch) |

The preload API (`electron/preload.cjs`) is evaluated against the browser bridge, so both
editions expose exactly the same `window.gulftech` API.

## Differences from the desktop app

- Folder pickers are not available. Saved PDFs, CSV exports and backups download to the
  browser's downloads folder. "Show in folder" is not available.
- Keep the same browser profile to see your data. Clearing site data deletes the records,
  so back up regularly.
- The encryption key is stored in the browser's storage, not protected by Windows DPAPI.
- Print uses the browser print dialog; "Save as PDF" is available in every browser.
- Email and WhatsApp open a message and the PDF must be attached manually.

## Backups between editions

Backups are interchangeable. A ZIP, JSON or password-protected backup made on Windows restores in
the browser edition, and the reverse works too. This is verified by the test suite
(`tests/browser/run.test.mjs`), which encrypts with the desktop crypto code and decrypts with the
browser crypto code, and vice versa.

## Building

```powershell
npm ci
npm run build:browser      # -> release/GulfTechInvoiceManager-Browser-Offline-<version>.zip
                           #    release/GulfTechInvoiceManager-Source-<version>.zip
```

`npm run test:browser` runs the browser edition's backend and UI tests.
