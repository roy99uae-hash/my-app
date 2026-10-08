# Gulf Tech Dubai Invoice Manager

An **offline** invoice and billing desktop application for Windows 10 and 11.
All data is stored locally in an encrypted SQLite database. The application
never requires or uses the internet, cloud services or online APIs.

## Features

- **Dashboard** – total, today's and monthly sales, customer and product counts,
  low-stock warnings, recent invoices and quick actions (Create Invoice, Add
  Customer, Add Product, Reports, Backup, Settings).
- **Business profiles** – unlimited profiles with logo, contact details,
  VAT/TRN, trade licence, notes and an authorised signature (typed, handwritten
  image or printed name).
- **Customers** – create, edit, delete, search, purchase history and balance.
- **Products** – SKU, barcode, category, cost and selling price, stock, reorder
  level, image and low-stock warnings. Barcode lookup works with USB scanners
  that type into the search box.
- **Invoices** – automatic numbering (e.g. `INV-2026-000001`), unlimited lines,
  automatic VAT, line and invoice discounts, shipping, five payment methods
  (Cash, Card, Bank Transfer, Cheque, Other) and four statuses (Draft, Paid,
  Unpaid, Partially Paid). Stock is reduced when an invoice leaves Draft.
- **Professional PDF** – company and customer details, item table, summary,
  notes, terms, a QR code (invoice number, customer, total) and two signature
  areas. The recipient block is left blank for manual signing.
- **Five templates** – Modern, Professional, Retail, Corporate, Minimal;
  switchable instantly.
- **Output** – save, export, print, preview, and share. Email and WhatsApp open
  a pre-filled message; attach the saved PDF manually.
- **Reports** – daily, weekly, monthly and yearly revenue, invoice count,
  average invoice value, best-selling products, top customers and charts.
  CSV export.
- **Backup & restore** – ZIP (database + JSON + manifest), JSON, or raw SQLite.
  Optional password protection, automatic scheduled backups with retention,
  and a safety backup before every restore.
- **Security** – PIN lock with throttling, encrypted database key protected by
  Windows DPAPI, session timeout that locks the app after inactivity.
- **Settings** – company defaults, VAT %, currency (AED, USD, EUR, GBP, BDT),
  invoice prefix and number format, PDF preferences, backup settings, and light
  or dark theme (saved).

## Documentation

- [Installation guide](INSTALLATION.md)
- [User manual](USER_MANUAL.md)
- [Build and developer guide](BUILD.md)
- [Offline browser edition](BROWSER_EDITION.md) – the same app as one HTML file

## Architecture

| Layer | Location | Notes |
|---|---|---|
| Desktop shell | `electron/main.js`, `electron/preload.cjs` | Electron main process; the renderer has no Node access |
| IPC | `electron/ipc/` | Channel registry and validated handlers, trusted-sender check |
| Services (use cases) | `electron/services/` | Invoices, master data, reports, backup, settings, security, print |
| Repositories | `electron/data/repositories/` | Repository pattern over SQLite (sql.js) |
| Security | `electron/security/` | Key store (DPAPI), AES-256-GCM, scrypt PIN hashing |
| Shared domain | `shared/` | Money and totals engine, numbering, validation, templates (used by UI and tests) |
| UI | `src/` | React 19 + Vite, state-based router, context for app state |
| Tests | `tests/` | Unit and integration tests (`npm test`), UI smoke test (`npm run test:ui`) |

Future modules (barcode hardware, POS, inventory, multi-user, cloud sync,
loyalty, expenses, purchase orders) plug in as new services and repositories
without changing the existing invoice logic.

## Licence

See [LICENSE.txt](../LICENSE.txt).
