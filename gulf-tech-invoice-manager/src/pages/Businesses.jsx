/**
 * Multi-business management: create, edit, delete and set a default business profile.
 */
import React, { useState } from 'react';
import { Building2, Plus, Pencil, Trash2, Star, Mail, Phone, Globe } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { Button, Card, EmptyState, Field, Input, ImagePicker, Modal, PageHeader, Select, Textarea } from '../components/ui.jsx';
import { SIGNATURE_MODES } from '../../shared/constants.js';

const EMPTY = {
  name: '', logoData: null, address: '', phone: '', whatsapp: '', email: '', website: '',
  vatNumber: '', tradeLicense: '', notes: '', signatureMode: 'none', signatureData: null,
  signatoryName: '', signatoryPosition: '',
};

export function BusinessesPage() {
  const { settings, updateSettings, notify, confirm } = useApp();
  const { data: businesses, reload } = useAsync(() => api.businesses.list(), []);
  const [editing, setEditing] = useState(null);
  const defaultId = settings?.['company.defaultBusinessId'];

  const remove = async (b) => {
    const ok = await confirm({
      title: 'Delete business profile?',
      message: `"${b.name}" will be removed. Businesses that have invoices cannot be deleted.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.businesses.remove(b.id);
      notify('Business deleted.');
      reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const makeDefault = async (b) => {
    await updateSettings({ 'company.defaultBusinessId': b.id });
    notify(`${b.name} is now the default business.`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Businesses"
        subtitle="Manage unlimited business profiles. Each invoice is issued under one of them."
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({ ...EMPTY })}>Add Business</Button>}
      />
      {businesses && businesses.length === 0 && (
        <EmptyState icon={Building2} title="No business profiles yet" action={<Button variant="primary" onClick={() => setEditing({ ...EMPTY })}>Add your first business</Button>}>
          Invoices need a business profile with your company name, address and VAT/TRN number.
        </EmptyState>
      )}
      <div className="card-grid">
        {(businesses || []).map((b) => (
          <Card key={b.id} className="business-card">
            <div className="business-head">
              {b.logoData ? <img className="avatar-logo" src={b.logoData} alt="" /> : <div className="avatar-logo placeholder">{b.name.charAt(0)}</div>}
              <div className="grow">
                <div className="strong">
                  {b.name} {defaultId === b.id && <span className="badge badge-default">Default</span>}
                </div>
                <div className="muted small">{b.vatNumber ? `TRN ${b.vatNumber}` : 'No TRN set'} · {b.invoiceCount} invoice(s)</div>
              </div>
            </div>
            <div className="business-meta">
              {b.address && <div className="pre-wrap small">{b.address}</div>}
              {b.phone && <div className="small"><Phone size={13} /> {b.phone}</div>}
              {b.email && <div className="small"><Mail size={13} /> {b.email}</div>}
              {b.website && <div className="small"><Globe size={13} /> {b.website}</div>}
            </div>
            <div className="card-footer-actions">
              <Button size="sm" icon={Pencil} onClick={() => setEditing({ ...b })}>Edit</Button>
              {defaultId !== b.id && <Button size="sm" variant="ghost" icon={Star} onClick={() => makeDefault(b)}>Set default</Button>}
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => remove(b)} aria-label="Delete" />
            </div>
          </Card>
        ))}
      </div>
      {editing && (
        <BusinessForm
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

function BusinessForm({ initial, onClose, onSaved }) {
  const { notify } = useApp();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));

  const save = async () => {
    if (!form.name.trim()) return notify('Business name is required.', 'error');
    setSaving(true);
    try {
      await api.businesses.save(form);
      notify('Business saved.');
      onSaved();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={form.id ? 'Edit Business' : 'Add Business'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Business'}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Business name *" full><Input value={form.name} onChange={set('name')} /></Field>
        <div className="field field-full two-col">
          <ImagePicker label="Company logo" value={form.logoData} onChange={(v) => setForm((f) => ({ ...f, logoData: v }))} pick={api.files.pickImage} hint="PNG, JPG or WebP up to 2 MB." />
        </div>
        <Field label="Address" full><Textarea rows={2} value={form.address || ''} onChange={set('address')} /></Field>
        <Field label="Phone"><Input value={form.phone || ''} onChange={set('phone')} /></Field>
        <Field label="WhatsApp number"><Input value={form.whatsapp || ''} onChange={set('whatsapp')} placeholder="+971 50 000 0000" /></Field>
        <Field label="Email"><Input type="email" value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Website"><Input value={form.website || ''} onChange={set('website')} /></Field>
        <Field label="VAT / TRN number"><Input value={form.vatNumber || ''} onChange={set('vatNumber')} /></Field>
        <Field label="Trade licence number"><Input value={form.tradeLicense || ''} onChange={set('tradeLicense')} /></Field>
        <Field label="Signature type">
          <Select value={form.signatureMode} onChange={set('signatureMode')} options={Object.entries(SIGNATURE_MODES).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="Authorised signatory name"><Input value={form.signatoryName || ''} onChange={set('signatoryName')} /></Field>
        <Field label="Signatory position"><Input value={form.signatoryPosition || ''} onChange={set('signatoryPosition')} /></Field>
        {(form.signatureMode === 'digital' || form.signatureMode === 'handwritten') && (
          <div className="field field-full">
            <ImagePicker
              label={form.signatureMode === 'handwritten' ? 'Scanned handwritten signature' : 'Digital signature image'}
              value={form.signatureData}
              onChange={(v) => setForm((f) => ({ ...f, signatureData: v }))}
              pick={api.files.pickImage}
              shape="wide"
              hint="Use a PNG with a transparent background for best results."
            />
          </div>
        )}
        <Field label="Business notes" full><Textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}
