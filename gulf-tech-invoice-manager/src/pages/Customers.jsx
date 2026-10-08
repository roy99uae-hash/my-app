/**
 * Customer management: searchable list, add/edit/delete, purchase history and balance.
 */
import React, { useEffect, useState } from 'react';
import { UserPlus, Pencil, Trash2, History, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchBox, Textarea, StatusBadge, NumberInput } from '../components/ui.jsx';
import { formatDate, formatMoney } from '../../shared/format.js';

const EMPTY = { name: '', mobile: '', email: '', address: '', city: '', country: 'UAE', notes: '', openingBalance: 0 };

export function CustomersPage({ openNew }) {
  const { settings, notify, confirm } = useApp();
  const currency = settings['invoice.currency'];
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState(null);
  const { data: customers, reload } = useAsync(() => api.customers.list({ search }), [search]);

  useEffect(() => {
    if (openNew) setEditing({ ...EMPTY });
  }, [openNew]);

  const remove = async (c) => {
    const ok = await confirm({ title: 'Delete customer?', message: `Delete ${c.name}? Customers with invoices cannot be deleted.`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.customers.remove(c.id);
      notify('Customer deleted.');
      reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const openHistory = async (c) => setHistory(await api.customers.history(c.id));

  return (
    <div className="page">
      <PageHeader
        title="Customers"
        subtitle="Contact details, purchase history and outstanding balances."
        actions={<Button variant="primary" icon={UserPlus} onClick={() => setEditing({ ...EMPTY })}>Add Customer</Button>}
      />
      <Card flush>
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search by name, mobile, email or city…" />
          <span className="muted small">{customers?.length ?? 0} customer(s)</span>
        </div>
        {customers && customers.length === 0 ? (
          <EmptyState icon={Search} title="No customers found">
            {search ? 'Try a different search term.' : 'Add your first customer to start invoicing.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th><th>Mobile</th><th>Email</th><th>City</th>
                  <th className="num">Invoices</th><th className="num">Total billed</th><th className="num">Balance</th><th />
                </tr>
              </thead>
              <tbody>
                {(customers || []).map((c) => (
                  <tr key={c.id}>
                    <td className="strong">{c.name}</td>
                    <td>{c.mobile}</td>
                    <td>{c.email}</td>
                    <td>{[c.city, c.country].filter(Boolean).join(', ')}</td>
                    <td className="num">{c.invoiceCount}</td>
                    <td className="num">{formatMoney(c.totalBilled, currency)}</td>
                    <td className={`num ${c.balance > 0 ? 'text-danger' : ''}`}>{formatMoney(c.balance, currency)}</td>
                    <td className="row-actions">
                      <Button size="sm" variant="ghost" icon={History} onClick={() => openHistory(c)} aria-label="Purchase history" />
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ ...c })} aria-label="Edit" />
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(c)} aria-label="Delete" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <CustomerForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {history && <HistoryModal data={history} currency={currency} onClose={() => setHistory(null)} />}
    </div>
  );
}

function CustomerForm({ initial, onClose, onSaved }) {
  const { notify, settings } = useApp();
  const [form, setForm] = useState({ country: settings['invoice.currency'] === 'AED' ? 'UAE' : '', ...initial });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    try {
      await api.customers.save({ ...form, openingBalance: Number(form.openingBalance) || 0 });
      notify('Customer saved.');
      onSaved();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={form.id ? 'Edit Customer' : 'Add Customer'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>Save Customer</Button></>}
    >
      <div className="form-grid">
        <Field label="Customer name *" full><Input value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Mobile number"><Input value={form.mobile || ''} onChange={set('mobile')} /></Field>
        <Field label="Email"><Input type="email" value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Address" full><Textarea rows={2} value={form.address || ''} onChange={set('address')} /></Field>
        <Field label="City"><Input value={form.city || ''} onChange={set('city')} /></Field>
        <Field label="Country"><Input value={form.country || ''} onChange={set('country')} /></Field>
        <Field label="Opening balance (owed before this app)" hint="Optional. Counts towards the customer balance.">
          <NumberInput value={form.openingBalance} onChange={(v) => setForm((f) => ({ ...f, openingBalance: v }))} />
        </Field>
        <Field label="Notes" full><Textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

function HistoryModal({ data, currency, onClose }) {
  const c = data.customer;
  return (
    <Modal title={`Purchase history — ${c.name}`} size="lg" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="stat-grid compact">
        <div className="mini-stat"><span>Invoices</span><strong>{c.invoiceCount}</strong></div>
        <div className="mini-stat"><span>Total billed</span><strong>{formatMoney(c.totalBilled, currency)}</strong></div>
        <div className="mini-stat"><span>Customer balance</span><strong className={c.balance > 0 ? 'text-danger' : ''}>{formatMoney(c.balance, currency)}</strong></div>
      </div>
      <h4>Invoices</h4>
      {data.invoices.length === 0 ? <p className="muted">No invoices yet.</p> : (
        <table className="table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th className="num">Total</th><th className="num">Paid</th></tr></thead>
          <tbody>
            {data.invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.number}</td><td>{formatDate(i.invoiceDate)}</td><td><StatusBadge status={i.status} /></td>
                <td className="num">{formatMoney(i.grandTotal, currency)}</td><td className="num">{formatMoney(i.amountPaid, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4>Most purchased items</h4>
      {data.topItems.length === 0 ? <p className="muted">No items yet.</p> : (
        <ul className="list">
          {data.topItems.map((t) => (
            <li key={t.name}><span className="grow">{t.name}</span><span className="muted">× {t.quantity}</span><span className="strong">{formatMoney(t.total, currency)}</span></li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
