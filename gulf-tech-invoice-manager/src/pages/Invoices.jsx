/**
 * Invoice list with search, status / date filters and CSV export.
 */
import React, { useState } from 'react';
import { FilePlus2, Eye, Pencil, Trash2, Download } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { Button, Card, EmptyState, Input, PageHeader, SearchBox, Select, StatusBadge } from '../components/ui.jsx';
import { formatDate, formatMoney } from '../../shared/format.js';
import { INVOICE_STATUS_LABELS } from '../../shared/constants.js';
import { toCsv } from '../lib/csv.js';

export function InvoicesPage({ navigate }) {
  const { settings, notify, confirm } = useApp();
  const currency = settings['invoice.currency'];
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '' });
  const { data: invoices, reload } = useAsync(() => api.invoices.list(cleanFilters(filters)), [filters.search, filters.status, filters.from, filters.to]);
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

  const remove = async (inv) => {
    const ok = await confirm({
      title: 'Delete invoice?',
      message: `Invoice ${inv.number} will be deleted. Stock deducted by this invoice will be restored.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.invoices.remove(inv.id);
      notify('Invoice deleted.');
      reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const exportCsv = async () => {
    const rows = [
      ['Invoice No', 'Date', 'Due Date', 'Customer', 'Business', 'Status', 'Payment Method', 'Subtotal', 'Discount', 'VAT', 'Grand Total', 'Amount Paid', 'Balance'],
      ...(invoices || []).map((i) => [i.number, i.invoiceDate, i.dueDate || '', i.customerName, i.businessName, INVOICE_STATUS_LABELS[i.status], i.paymentMethod || '', i.subtotal, i.discountTotal, i.vatTotal, i.grandTotal, i.amountPaid, i.balanceDue]),
    ];
    try {
      const res = await api.files.saveText('invoices.csv', toCsv(rows), [{ name: 'CSV', extensions: ['csv'] }]);
      if (res && !res.cancelled) notify(`Exported to ${res.path}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Invoices"
        subtitle="All invoices and drafts. Click a row to preview, print or share."
        actions={
          <>
            <Button icon={Download} onClick={exportCsv} disabled={!invoices?.length}>Export CSV</Button>
            <Button variant="primary" icon={FilePlus2} onClick={() => navigate('invoice-new')}>New Invoice</Button>
          </>
        }
      />
      <Card flush>
        <div className="toolbar wrap">
          <SearchBox value={filters.search} onChange={set('search')} placeholder="Search invoice no., customer or notes…" />
          <Select
            value={filters.status}
            onChange={(e) => set('status')(e.target.value)}
            options={[{ value: '', label: 'All statuses' }, ...Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => ({ value, label }))]}
          />
          <Input type="date" value={filters.from} onChange={(e) => set('from')(e.target.value)} aria-label="From date" />
          <Input type="date" value={filters.to} onChange={(e) => set('to')(e.target.value)} aria-label="To date" />
          <span className="muted small">{invoices?.length ?? 0} result(s)</span>
        </div>
        {invoices && invoices.length === 0 ? (
          <EmptyState title="No invoices match">Try different filters or create a new invoice.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Invoice No.</th><th>Date</th><th>Due</th><th>Customer</th><th>Business</th><th>Status</th><th className="num">Total</th><th className="num">Balance</th><th /></tr>
              </thead>
              <tbody>
                {(invoices || []).map((inv) => (
                  <tr key={inv.id} className="clickable" onClick={() => navigate('invoice-view', { id: inv.id })}>
                    <td className="strong">{inv.number}</td>
                    <td>{formatDate(inv.invoiceDate)}</td>
                    <td>{formatDate(inv.dueDate)}</td>
                    <td>{inv.customerName}</td>
                    <td>{inv.businessName}</td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td className="num">{formatMoney(inv.grandTotal, currency)}</td>
                    <td className="num">{inv.status === 'draft' ? '—' : formatMoney(inv.balanceDue, currency)}</td>
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" icon={Eye} onClick={() => navigate('invoice-view', { id: inv.id })} aria-label="View" />
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => navigate('invoice-edit', { id: inv.id })} aria-label="Edit" />
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(inv)} aria-label="Delete" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function cleanFilters(f) {
  const out = {};
  Object.entries(f).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) out[k] = v;
  });
  return out;
}

