/**
 * Business profile repository (multi-business support).
 */
import { nullIfEmpty, now } from './base.js';

/** Map a DB row to the public business shape. */
export function mapBusiness(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    logoData: row.logo_data,
    address: row.address,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    website: row.website,
    vatNumber: row.vat_number,
    tradeLicense: row.trade_license,
    notes: row.notes,
    signatureData: row.signature_data,
    signatureMode: row.signature_mode,
    signatoryName: row.signatory_name,
    signatoryPosition: row.signatory_position,
    invoiceCount: row.invoice_count ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BusinessRepository {
  /** @param {import('../database.js').AppDatabase} db */
  constructor(db) {
    this.db = db;
  }

  list() {
    return this.db
      .all(
        `SELECT b.*, (SELECT COUNT(*) FROM invoices i WHERE i.business_id = b.id) AS invoice_count
         FROM businesses b ORDER BY b.name COLLATE NOCASE`,
      )
      .map(mapBusiness);
  }

  get(id) {
    return mapBusiness(this.db.get('SELECT * FROM businesses WHERE id = ?', [id]));
  }

  create(data) {
    const t = now();
    const r = this.db.run(
      `INSERT INTO businesses (name, logo_data, address, phone, whatsapp, email, website, vat_number, trade_license,
         notes, signature_data, signature_mode, signatory_name, signatory_position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...this.values(data), t, t],
    );
    return this.get(r.lastInsertRowid);
  }

  update(id, data) {
    this.db.run(
      `UPDATE businesses SET name = ?, logo_data = ?, address = ?, phone = ?, whatsapp = ?, email = ?, website = ?,
         vat_number = ?, trade_license = ?, notes = ?, signature_data = ?, signature_mode = ?, signatory_name = ?,
         signatory_position = ?, updated_at = ?
       WHERE id = ?`,
      [...this.values(data), now(), id],
    );
    return this.get(id);
  }

  /** Number of invoices that reference this business. */
  invoiceCount(id) {
    return this.db.get('SELECT COUNT(*) AS n FROM invoices WHERE business_id = ?', [id]).n;
  }

  remove(id) {
    this.db.run('DELETE FROM businesses WHERE id = ?', [id]);
  }

  /** Column values in the order used by the INSERT/UPDATE statements. */
  values(d) {
    return [
      d.name.trim(),
      nullIfEmpty(d.logoData),
      nullIfEmpty(d.address),
      nullIfEmpty(d.phone),
      nullIfEmpty(d.whatsapp),
      nullIfEmpty(d.email),
      nullIfEmpty(d.website),
      nullIfEmpty(d.vatNumber),
      nullIfEmpty(d.tradeLicense),
      nullIfEmpty(d.notes),
      nullIfEmpty(d.signatureData),
      d.signatureMode || 'none',
      nullIfEmpty(d.signatoryName),
      nullIfEmpty(d.signatoryPosition),
    ];
  }
}
