# Build and Developer Guide

## Prerequisites

- Windows 10/11 (64-bit) to build the Windows installer
- Node.js 22 LTS (or newer LTS) and npm 10+
- Internet access **during the build only** (npm downloads packages, including the Electron binary)
- Git (optional)

The application itself is offline. Only the build step needs network access.

## Quick start

```powershell
cd gulf-tech-invoice-manager
npm ci                 # install exact versions from package-lock.json
npm run start          # build the UI and launch the desktop app
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Rebuild the UI on change (run `npm start` in a second terminal to launch) |
| `npm run build:renderer` | Build the React UI into `dist/` |
| `npm start` | Build the UI and launch Electron |
| `npm test` | Unit and integration tests (calculations, numbering, validation, crypto, key store, database, backup, templates, reports, IPC) |
| `npm run test:ui` | Headless UI smoke test: renders every page against a fake bridge |
| `npm run test:all` | Both test suites |
| `npm run build:win` | Tests, UI build, then the NSIS installer in `release/` |
| `npm run build:win:portable` | Tests, UI build, then the portable executable in `release/` |
| `npm run pack` | Unpacked app folder in `release/win-unpacked/` for quick checks |

## Output

After `npm run build:win` the `release/` folder contains:

- `GulfTechInvoiceManager-Setup-1.0.0.exe` – the installer (NSIS, x64, per-user by default)
- `GulfTechInvoiceManager-Setup-1.0.0.exe.blockmap` – for differential updates
- `win-unpacked/` – the program folder

## Project layout

```
build/                 icon.ico, icon.png (electron-builder resources)
docs/                  README, installation guide, user manual, this guide
electron/              main process, preload bridge, IPC, services, data, security
shared/                domain logic shared by UI and tests (money, calc, numbering, templates)
src/                   React renderer (pages, components, context, styles)
tests/                 node:test suites and tests/ui headless UI smoke test
LICENSE.txt            End user licence (shown in the installer)
```

## Architecture notes

- **Database:** SQLite via `sql.js` (WebAssembly). The file is written atomically
  (temp file then rename) and encrypted with AES-256-GCM. The 32-byte data key is
  wrapped with Electron `safeStorage` (Windows DPAPI) in `keystore.json`.
- **Repositories:** `electron/data/repositories/` contain the only SQL. Services contain the
  business rules and depend on repositories, not on SQL.
- **IPC:** every channel is registered in `electron/ipc/registerHandlers.js` and listed in
  `channels.js`. Requests are accepted only from the app's own `app://` origin, and data
  channels are refused while the app is locked.
- **PDF:** invoices are rendered from HTML (`shared/invoiceTemplates.js`, `src/lib/pdfHtml.js`).
  The same HTML is used for preview, print and PDF. PDFs are produced by a hidden Electron window.
- **Adding a module:** add a repository, a service, IPC channels and a page. Keep the
  invoice totals and numbering in `shared/`.

## Versioning and dependencies

Dependencies are pinned to exact versions in `package.json`. The lockfile is committed so
builds are reproducible. Update deliberately: run `npm outdated`, change one dependency at a
time, and run `npm run test:all` plus a manual check of printing and backup/restore.

## Code signing (optional, recommended for distribution)

The build is unsigned by default (`win.signAndEditExecutable: false`), so Windows SmartScreen
will warn users. To sign:

1. Obtain a code-signing certificate (EV or OV) and export it as a `.pfx`.
2. Set `CSC_LINK` (path or base64 of the `.pfx`) and `CSC_KEY_PASSWORD` as environment variables.
3. Set `"signAndEditExecutable": true` under `build.win` in `package.json`.
4. Run `npm run build:win`.

Never commit certificates or passwords to the repository.

## Troubleshooting the build

- **Electron binary download fails:** check network access to `github.com` and retry with
  `npm ci`. Behind a proxy, set `HTTPS_PROXY`.
- **Missing `build/icon.ico`:** regenerate it from `build/icon.png` (any ICO tool or ImageMagick:
  `magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`).
