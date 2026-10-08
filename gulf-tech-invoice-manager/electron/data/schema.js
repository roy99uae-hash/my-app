/**
 * Database schema and migrations.
 *
 * The schema version is stored in SQLite's `user_version` pragma. Each entry in
 * MIGRATIONS is applied exactly once, in order, so future modules (POS, purchase
 * orders, expenses, users, ...) can be added as new migrations without touching
 * existing data.
 */

export const LATEST_SCHEMA_VERSION = 1;

/** @type {Array<{version: number, description: string, sql: string}>} */
export const MIGRATIONS = [
  {
    version: 1,
    description: 'Initial schema: businesses, customers, products, invoices, settings, counters',
    sql: `
      CREATE TABLE IF NOT EXISTS businesses (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        name              TEXT    NOT NULL,
        logo_data         TEXT,
        address           TEXT,
        phone             TEXT,
        whatsapp          TEXT,
        email             TEXT,
        website           TEXT,
        vat_number        TEXT,
        trade_license     TEXT,
        notes             TEXT,
        signature_data    TEXT,
        signature_mode    TEXT    NOT NULL DEFAULT 'none',
        signatory_name    TEXT,
        signatory_position TEXT,
        created_at        TEXT    NOT NULL,
        updated_at        TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        mobile          TEXT,
        email           TEXT,
        address         TEXT,
        city            TEXT,
        country         TEXT,
        notes           TEXT,
        opening_balance REAL    NOT NULL DEFAULT 0,
        created_at      TEXT    NOT NULL,
        updated_at      TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

      CREATE TABLE IF NOT EXISTS products (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        sku           TEXT,
        barcode       TEXT,
        category      TEXT,
        unit          TEXT    NOT NULL DEFAULT 'pcs',
        cost_price    REAL    NOT NULL DEFAULT 0,
        selling_price REAL    NOT NULL DEFAULT 0,
        stock_qty     REAL    NOT NULL DEFAULT 0,
        reorder_level REAL    NOT NULL DEFAULT 0,
        vat_rate      REAL,
        image_data    TEXT,
        notes         TEXT,
        created_at    TEXT    NOT NULL,
        updated_at    TEXT    NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_products_sku ON products(sku) WHERE sku IS NOT NULL AND sku <> '';
      CREATE UNIQUE INDEX IF NOT EXISTS ux_products_barcode ON products(barcode) WHERE barcode IS NOT NULL AND barcode <> '';
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

      CREATE TABLE IF NOT EXISTS invoices (
        id                       INTEGER PRIMARY KEY AUTOINCREMENT,
        number                   TEXT    NOT NULL UNIQUE,
        business_id              INTEGER REFERENCES businesses(id),
        customer_id              INTEGER REFERENCES customers(id),
        invoice_date             TEXT    NOT NULL,
        due_date                 TEXT,
        status                   TEXT    NOT NULL,
        payment_method           TEXT,
        amount_paid              REAL    NOT NULL DEFAULT 0,
        currency                 TEXT    NOT NULL DEFAULT 'AED',
        default_vat_rate         REAL    NOT NULL DEFAULT 5,
        invoice_discount_type    TEXT    NOT NULL DEFAULT 'amount',
        invoice_discount_value   REAL    NOT NULL DEFAULT 0,
        shipping_charge          REAL    NOT NULL DEFAULT 0,
        subtotal                 REAL    NOT NULL DEFAULT 0,
        discount_total           REAL    NOT NULL DEFAULT 0,
        taxable_amount           REAL    NOT NULL DEFAULT 0,
        vat_total                REAL    NOT NULL DEFAULT 0,
        grand_total              REAL    NOT NULL DEFAULT 0,
        notes                    TEXT,
        terms                    TEXT,
        template                 TEXT    NOT NULL DEFAULT 'modern',
        business_snapshot        TEXT,
        customer_snapshot        TEXT,
        stock_applied            INTEGER NOT NULL DEFAULT 0,
        created_at               TEXT    NOT NULL,
        updated_at               TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
      CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

      CREATE TABLE IF NOT EXISTS invoice_items (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id       INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
        position         INTEGER NOT NULL DEFAULT 0,
        name             TEXT    NOT NULL,
        sku              TEXT,
        description      TEXT,
        quantity         REAL    NOT NULL,
        unit_price       REAL    NOT NULL,
        discount_percent REAL    NOT NULL DEFAULT 0,
        vat_rate         REAL    NOT NULL DEFAULT 0,
        gross_amount     REAL    NOT NULL DEFAULT 0,
        line_discount    REAL    NOT NULL DEFAULT 0,
        taxable_amount   REAL    NOT NULL DEFAULT 0,
        vat_amount       REAL    NOT NULL DEFAULT 0,
        line_total       REAL    NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_items_invoice ON invoice_items(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_items_product ON invoice_items(product_id);

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS counters (
        key   TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
    `,
  },
];
