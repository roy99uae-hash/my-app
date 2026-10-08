/**
 * Dependency container: constructs repositories and services once, in order.
 * Keeping wiring in one place makes the dependency graph easy to audit and
 * lets tests build the same graph against an in-memory database.
 */
import path from 'node:path';
import { BusinessRepository } from '../data/repositories/businessRepository.js';
import { CustomerRepository } from '../data/repositories/customerRepository.js';
import { ProductRepository } from '../data/repositories/productRepository.js';
import { InvoiceRepository } from '../data/repositories/invoiceRepository.js';
import { SettingsRepository } from '../data/repositories/settingsRepository.js';
import { CounterRepository } from '../data/repositories/counterRepository.js';
import { ReportRepository } from '../data/repositories/reportRepository.js';
import { InvoiceService } from './invoiceService.js';
import { ReportService } from './reportService.js';
import { SettingsService } from './settingsService.js';
import { SecurityService } from './securityService.js';
import { BackupService } from './backupService.js';
import { MasterDataService } from './masterDataService.js';
import { PrintService } from './printService.js';
import { FileService } from './fileService.js';

/**
 * @param {Object} opts
 * @param {import('../data/database.js').AppDatabase} opts.db
 * @param {*} opts.SQL
 * @param {Buffer} opts.key
 * @param {string} opts.userDataDir
 * @param {{BrowserWindow: *, dialog: *, shell: *}} opts.electron  Electron modules (or test doubles)
 */
export function createContainer({ db, SQL, key, userDataDir, electron, now }) {
  const repos = {
    businesses: new BusinessRepository(db),
    customers: new CustomerRepository(db),
    products: new ProductRepository(db),
    invoices: new InvoiceRepository(db),
    settings: new SettingsRepository(db),
    counters: new CounterRepository(db),
    reports: new ReportRepository(db),
  };

  const services = {
    masterData: new MasterDataService({ ...repos, db }),
    invoices: new InvoiceService({ db, ...repos, businesses: repos.businesses, customers: repos.customers }),
    reports: new ReportService({ reports: repos.reports, invoices: repos.invoices, products: repos.products }),
    settings: new SettingsService({ settings: repos.settings }),
    security: new SecurityService({ settings: repos.settings }),
    backup: new BackupService({
      db,
      settings: repos.settings,
      SQL,
      key,
      defaultBackupDir: path.join(userDataDir, 'backups'),
      now,
    }),
    print: new PrintService({
      BrowserWindow: electron.BrowserWindow,
      dialog: electron.dialog,
      shell: electron.shell,
      tempDir: path.join(userDataDir, 'tmp'),
    }),
    files: new FileService({ dialog: electron.dialog }),
  };
  return { repos, services };
}
