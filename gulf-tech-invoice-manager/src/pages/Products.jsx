/**
 * Product & stock management: search, categories, low-stock warnings and images.
 */
import React, { useEffect, useState } from 'react';
import { PackagePlus, Pencil, Trash2, AlertTriangle, Package } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { Button, Card, EmptyState, Field, ImagePicker, Input, Modal, NumberInput, PageHeader, SearchBox, Select, Textarea } from '../components/ui.jsx';
import { formatMoney } from '../../shared/format.js';
import { UNITS } from '../../shared/constants.js';

const EMPTY = {
  name: '', sku: '', barcode: '', category: '', unit: 'pcs', costPrice: 0, sellingPrice: 0,
  stockQty: 0, reorderLevel: 0, vatRate: null, imageData: null, notes: '',
};

export function ProductsPage({ openNew }) {
  const { settings, notify, confirm } = useApp();
  const currency = settings['invoice.currency'];
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const { data: products, reload } = useAsync(() => api.products.list({ search, lowStockOnly: lowOnly }), [search, lowOnly]);

  useEffect(() => {
    if (openNew) setEditing({ ...EMPTY });
  }, [openNew]);

  const lowCount = (products || []).filter((p) => p.lowStock).length;

  const remove = async (p) => {
    const ok = await confirm({ title: 'Delete product?', message: `Delete "${p.name}"? Past invoices keep their item details.`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    await api.products.remove(p.id);
    notify('Product deleted.');
    reload();
  };

  return (
    <div className="page">
      <PageHeader
        title="Products & Stock"
        subtitle="Prices, SKUs, barcodes and inventory levels."
        actions={<Button variant="primary" icon={PackagePlus} onClick={() => setEditing({ ...EMPTY })}>Add Product</Button>}
      />
      {lowCount > 0 && (
        <div className="alert alert-warn"><AlertTriangle size={18} /> {lowCount} product(s) are at or below their reorder level.</div>
      )}
      <Card flush>
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search by name, SKU, barcode or category…" />
          <label className="checkbox"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>
        </div>
        {products && products.length === 0 ? (
          <EmptyState icon={Package} title="No products found">Add products to use them on invoices.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th /><th>Product</th><th>SKU</th><th>Barcode</th><th>Category</th><th className="num">Cost</th><th className="num">Price</th><th className="num">Stock</th><th /></tr>
              </thead>
              <tbody>
                {(products || []).map((p) => (
                  <tr key={p.id}>
                    <td className="thumb-cell">{p.imageData ? <img src={p.imageData} alt="" className="thumb" /> : <div className="thumb placeholder"><Package size={16} /></div>}</td>
                    <td className="strong">{p.name}</td>
                    <td>{p.sku}</td>
                    <td>{p.barcode}</td>
                    <td>{p.category}</td>
                    <td className="num">{formatMoney(p.costPrice, currency)}</td>
                    <td className="num">{formatMoney(p.sellingPrice, currency)}</td>
                    <td className="num">
                      <span className={`badge ${p.lowStock ? 'badge-unpaid' : 'badge-paid'}`}>{p.stockQty} {p.unit}</span>
                    </td>
                    <td className="row-actions">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ ...p })} aria-label="Edit" />
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(p)} aria-label="Delete" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <ProductForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ProductForm({ initial, onClose, onSaved }) {
  const { notify } = useApp();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    api.products.categories().then(setCategories).catch(() => {});
  }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setNum = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.products.save({
        ...form,
        costPrice: Number(form.costPrice) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
        stockQty: Number(form.stockQty) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        vatRate: form.vatRate === '' || form.vatRate === null ? null : Number(form.vatRate),
      });
      notify('Product saved.');
      onSaved();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={form.id ? 'Edit Product' : 'Add Product'}
      size="lg"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>Save Product</Button></>}
    >
      <div className="form-grid">
        <Field label="Product name *" full><Input value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label="SKU"><Input value={form.sku || ''} onChange={set('sku')} /></Field>
        <Field label="Barcode"><Input value={form.barcode || ''} onChange={set('barcode')} placeholder="Scan or type" /></Field>
        <Field label="Category">
          <Input list="category-list" value={form.category || ''} onChange={set('category')} />
          <datalist id="category-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Unit"><Select value={form.unit || 'pcs'} onChange={set('unit')} options={UNITS} /></Field>
        <Field label="Cost price"><NumberInput value={form.costPrice} onChange={setNum('costPrice')} /></Field>
        <Field label="Selling price (excl. VAT)"><NumberInput value={form.sellingPrice} onChange={setNum('sellingPrice')} /></Field>
        <Field label="VAT % (blank = invoice default)"><NumberInput value={form.vatRate ?? ''} onChange={setNum('vatRate')} step="0.5" /></Field>
        <Field label="Stock quantity"><NumberInput value={form.stockQty} onChange={setNum('stockQty')} step="1" /></Field>
        <Field label="Reorder level" hint="Warn when stock is at or below this quantity."><NumberInput value={form.reorderLevel} onChange={setNum('reorderLevel')} step="1" /></Field>
        <div className="field field-full">
          <ImagePicker label="Product image" value={form.imageData} onChange={(v) => setForm((f) => ({ ...f, imageData: v }))} pick={api.files.pickImage} />
        </div>
        <Field label="Notes" full><Textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}
