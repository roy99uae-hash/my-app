/**
 * Invoice editor: header details, unlimited line items (catalogue search, barcode entry
 * or free-text services), discounts, shipping, payment, and live totals.
 * Totals shown here use the same calculation engine as the main process, which
 * recalculates authoritatively on save.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, ArrowLeft, ScanBarcode, CheckCheck, Eye } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApp } from '../context/AppContext.jsx';
import { Button, Card, Field, Input, NumberInput, PageHeader, Select, Textarea } from '../components/ui.jsx';
import { formatMoney, addDays } from '../../shared/format.js';
import { PAYMENT_METHODS, INVOICE_STATUS_LABELS } from '../../shared/constants.js';
import { deriveStatus } from '../../shared/calc.js';
import { validateInvoice } from '../../shared/validation.js';
import { emptyDraft, draftFromInvoice, newKey, payloadFromDraft } from '../lib/invoiceDraft.js';
import { previewTotals } from '../lib/pdfHtml.js';

export function InvoiceEditorPage({ navigate, invoiceId }) {
  const { settings, notify } = useApp();
  const currency = settings['invoice.currency'];
  const vatPercent = Number(settings['invoice.vatPercent']);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [numberPreview, setNumberPreview] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [b, c, p] = await Promise.all([api.businesses.list(), api.customers.list({}), api.products.list({})]);
        setBusinesses(b);
        setCustomers(c);
        setProducts(p);
        if (invoiceId) {
          const inv = await api.invoices.get(invoiceId);
          setDraft(draftFromInvoice(inv));
          setNumberPreview(inv.number);
        } else {
          const base = emptyDraft(settings);
          if (!base.businessId && b[0]) base.businessId = b[0].id;
          setDraft(base);
          const { number } = await api.invoices.previewNumber();
          setNumberPreview(number);
        }
      } catch (err) {
        notify(err.message, 'error');
      } finally {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [invoiceId]);

  const totals = useMemo(() => (draft ? previewTotals(toCalcDraft(draft), vatPercent) : null), [draft, vatPercent]);

  if (loading || !draft) return <div className="page muted">Loading invoice…</div>;

  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const isEdit = !!draft.id;
  const draftMode = draft.status === 'draft';
  // The pill shows the status the invoice gets when it is issued (Save Invoice).
  const status = deriveStatus({ isDraft: false, grandTotal: totals.grandTotal, amountPaid: Number(draft.amountPaid) || 0 });

  const addProduct = (p) => {
    setDraft((d) => {
      const existing = d.items.find((it) => it.productId === p.id);
      if (existing) {
        return { ...d, items: d.items.map((it) => (it.key === existing.key ? { ...it, quantity: Number(it.quantity) + 1 } : it)) };
      }
      return {
        ...d,
        items: [
          ...d.items,
          {
            key: newKey(), productId: p.id, name: p.name, sku: p.sku || '', description: '',
            quantity: 1, unitPrice: p.sellingPrice, discountPercent: 0, vatRate: p.vatRate ?? '',
          },
        ],
      };
    });
  };

  const addCustomLine = () =>
    setDraft((d) => ({
      ...d,
      items: [...d.items, { key: newKey(), productId: null, name: '', sku: '', description: '', quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: '' }],
    }));

  const updateItem = (key, field, value) =>
    setDraft((d) => ({ ...d, items: d.items.map((it) => (it.key === key ? { ...it, [field]: value } : it)) }));

  const removeItem = (key) => setDraft((d) => ({ ...d, items: d.items.filter((it) => it.key !== key) }));

  const save = async (asDraft) => {
    const payload = payloadFromDraft(draft, { isDraft: asDraft });
    const errors = validateInvoice(payload);
    if (errors.length) return notify(errors.join(' '), 'error');
    setSaving(true);
    try {
      const saved = await api.invoices.save(payload);
      notify(asDraft ? `Draft ${saved.number} saved.` : `Invoice ${saved.number} saved.`);
      navigate('invoice-view', { id: saved.id });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const markFullyPaid = () => setDraft((d) => ({ ...d, amountPaid: totals.grandTotal, paymentMethod: d.paymentMethod || 'Cash' }));

  // Changing the invoice date keeps the due date valid (never before the invoice date).
  const changeInvoiceDate = (date) =>
    setDraft((d) => ({ ...d, invoiceDate: date, dueDate: d.dueDate && d.dueDate < date ? date : d.dueDate }));

  return (
    <div className="page">
      <PageHeader
        title={isEdit ? `Edit ${draft.number}` : 'New Invoice'}
        subtitle={isEdit ? 'Changes are recalculated and stock is adjusted when the invoice is issued.' : `Number ${numberPreview} is reserved when you save.`}
        actions={<Button icon={ArrowLeft} onClick={() => navigate(isEdit ? 'invoice-view' : 'invoices', isEdit ? { id: draft.id } : {})}>Back</Button>}
      />

      <div className="editor-layout">
        <div className="editor-main">
          <Card title="Invoice details">
            <div className="form-grid">
              <Field label="Business profile *">
                <Select
                  value={draft.businessId}
                  onChange={(e) => set('businessId')(Number(e.target.value))}
                  options={[{ value: '', label: 'Select business…' }, ...businesses.map((b) => ({ value: b.id, label: b.name }))]}
                />
              </Field>
              <Field label="Customer *">
                <Select
                  value={draft.customerId}
                  onChange={(e) => set('customerId')(Number(e.target.value))}
                  options={[{ value: '', label: 'Select customer…' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </Field>
              <Field label="Invoice date">
                <Input type="date" value={draft.invoiceDate} onChange={(e) => changeInvoiceDate(e.target.value)} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={draft.dueDate || ''} min={draft.invoiceDate} onChange={(e) => set('dueDate')(e.target.value)} />
              </Field>
              <Field label="Invoice number">
                <Input value={isEdit ? draft.number : numberPreview} readOnly className="readonly" />
              </Field>
              <Field label="Payment method">
                <Select value={draft.paymentMethod || ''} onChange={(e) => set('paymentMethod')(e.target.value)} options={[{ value: '', label: '—' }, ...PAYMENT_METHODS]} />
              </Field>
            </div>
          </Card>

          <Card title="Products & services" actions={<span className="muted small"><ScanBarcode size={14} /> Scan or type a barcode and press Enter</span>}>
            <ProductPicker products={products} onPick={addProduct} />
            <div className="table-wrap">
              <table className="table items-table">
                <thead>
                  <tr>
                    <th>Item</th><th>Description</th><th className="num w-qty">Qty</th><th className="num w-price">Unit price</th>
                    <th className="num w-sm">Disc %</th><th className="num w-sm">VAT %</th><th className="num">Total</th><th />
                  </tr>
                </thead>
                <tbody>
                  {draft.items.length === 0 && (
                    <tr><td colSpan={8} className="muted center">No lines yet. Search a product above or add a custom line.</td></tr>
                  )}
                  {draft.items.map((it, idx) => {
                    const product = products.find((p) => p.id === it.productId);
                    const lineTotal = totals.lines[idx]?.lineTotal ?? 0;
                    const short = product && Number(it.quantity) > product.stockQty;
                    return (
                      <tr key={it.key}>
                        <td>
                          <Input value={it.name} onChange={(e) => updateItem(it.key, 'name', e.target.value)} placeholder="Item name" />
                          {short && <div className="field-warn">Only {product.stockQty} in stock</div>}
                        </td>
                        <td><Input value={it.description} onChange={(e) => updateItem(it.key, 'description', e.target.value)} placeholder="Optional" /></td>
                        <td><NumberInput value={it.quantity} step="1" onChange={(v) => updateItem(it.key, 'quantity', v)} /></td>
                        <td><NumberInput value={it.unitPrice} onChange={(v) => updateItem(it.key, 'unitPrice', v)} /></td>
                        <td><NumberInput value={it.discountPercent} step="0.5" onChange={(v) => updateItem(it.key, 'discountPercent', v)} /></td>
                        <td><NumberInput value={it.vatRate} step="0.5" onChange={(v) => updateItem(it.key, 'vatRate', v)} placeholder={`${vatPercent}`} /></td>
                        <td className="num strong">{formatMoney(lineTotal, currency)}</td>
                        <td><Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeItem(it.key)} aria-label="Remove line" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button icon={Plus} onClick={addCustomLine}>Add custom line</Button>
          </Card>

          <div className="grid-2">
            <Card title="Notes & terms">
              <Field label="Notes (printed on invoice)" full><Textarea rows={3} value={draft.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
              <Field label="Terms & conditions" full><Textarea rows={4} value={draft.terms} onChange={(e) => set('terms')(e.target.value)} /></Field>
            </Card>
            <Card title="Payment">
              <div className="form-grid">
                <Field label="Amount paid now">
                  <NumberInput value={draft.amountPaid} onChange={set('amountPaid')} />
                </Field>
                <div className="field">
                  <span className="field-label">&nbsp;</span>
                  <Button icon={CheckCheck} onClick={markFullyPaid}>Mark fully paid</Button>
                </div>
              </div>
              <p className="muted small">Status is calculated automatically: Paid, Partially Paid or Unpaid. Use “Save as Draft” to keep the invoice out of sales figures.</p>
            </Card>
          </div>
        </div>

        <aside className="editor-side">
          <Card title="Summary">
            <div className="totals">
              <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
              <Row label="Discount" value={`- ${formatMoney(totals.discountTotal, currency)}`} />
              <Row label="Taxable amount" value={formatMoney(totals.taxableAmount, currency)} />
              <Row label="VAT" value={formatMoney(totals.vatTotal, currency)} />
              <Row label="Shipping" value={formatMoney(totals.shippingCharge, currency)} />
              <div className="total-grand"><span>Grand total</span><strong>{formatMoney(totals.grandTotal, currency)}</strong></div>
              <Row label="Balance due" value={formatMoney(Math.max(0, totals.grandTotal - (Number(draft.amountPaid) || 0)), currency)} />
            </div>
            <div className="status-line">Status: <StatusPill status={status} /></div>
          </Card>

          <Card title="Adjustments">
            <div className="form-grid one">
              <Field label="Invoice discount">
                <div className="input-group">
                  <Select value={draft.invoiceDiscountType} onChange={(e) => set('invoiceDiscountType')(e.target.value)} options={[{ value: 'amount', label: currency }, { value: 'percent', label: '%' }]} />
                  <NumberInput value={draft.invoiceDiscountValue} onChange={set('invoiceDiscountValue')} />
                </div>
              </Field>
              <Field label={`Shipping charge (VAT ${vatPercent}%)`}>
                <NumberInput value={draft.shippingCharge} onChange={set('shippingCharge')} />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="side-actions">
              <Button variant="primary" icon={Save} onClick={() => save(false)} disabled={saving} className="btn-block">
                {saving ? 'Saving…' : draftMode ? 'Save & Issue Invoice' : 'Save Invoice'}
              </Button>
              {(draftMode || !isEdit) && (
                <Button icon={Save} onClick={() => save(true)} disabled={saving} className="btn-block">Save as Draft</Button>
              )}
              {isEdit && (
                <Button icon={Eye} variant="ghost" onClick={() => navigate('invoice-view', { id: draft.id })} className="btn-block">View / Print</Button>
              )}
            </div>
            <p className="muted small">Business: {businesses.find((b) => b.id === Number(draft.businessId))?.name || '—'}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** Product search with live suggestions and barcode entry. */
function ProductPicker({ products, onPick }) {
  const [q, setQ] = useState('');
  const { notify } = useApp();
  const term = q.trim().toLowerCase();
  const matches = term
    ? products.filter((p) => [p.name, p.sku, p.barcode, p.category].some((v) => v && String(v).toLowerCase().includes(term))).slice(0, 8)
    : [];

  const onKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const exact = products.find((p) => p.barcode === q.trim() || p.sku === q.trim());
    if (exact) {
      onPick(exact);
      setQ('');
    } else if (matches.length === 1) {
      onPick(matches[0]);
      setQ('');
    } else if (term) {
      notify('No product matches that barcode or name.', 'error');
    }
  };

  return (
    <div className="picker">
      <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search product by name, SKU, barcode or category…" aria-label="Search products" />
      {matches.length > 0 && (
        <ul className="picker-menu">
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p); setQ(''); }}>
                <span className="grow">{p.name}</span>
                <span className="muted small">{p.sku || p.barcode || ''}</span>
                <span className={`badge ${p.lowStock ? 'badge-unpaid' : 'badge-paid'}`}>{p.stockQty} {p.unit}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return <div className="total-row"><span>{label}</span><span>{value}</span></div>;
}

function StatusPill({ status }) {
  return <span className={`badge badge-${status}`}>{INVOICE_STATUS_LABELS[status]}</span>;
}

/** Map editor lines to the shape the calculation engine expects. */
function toCalcDraft(draft) {
  return {
    items: draft.items.map((it) => ({
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      discountPercent: Number(it.discountPercent) || 0,
      vatRate: it.vatRate === '' || it.vatRate === null || it.vatRate === undefined ? undefined : Number(it.vatRate),
    })),
    invoiceDiscountType: draft.invoiceDiscountType,
    invoiceDiscountValue: Number(draft.invoiceDiscountValue) || 0,
    shippingCharge: Number(draft.shippingCharge) || 0,
  };
}
