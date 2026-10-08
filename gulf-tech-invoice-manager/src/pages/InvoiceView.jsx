/**
 * Invoice view: live template preview with template and page-size switching,
 * and the output actions — Print, Save PDF, Export PDF, Email PDF, WhatsApp PDF, Share PDF.
 *
 * Email/WhatsApp open the default mail / WhatsApp Web link with the message prefilled,
 * then reveal the saved PDF so it can be attached (Windows links cannot attach files).
 */
import React, { useEffect, useState } from 'react';
import {
  Printer, FileDown, Save, Mail, MessageCircle, Share2, Pencil, Trash2, CheckCircle2, FolderOpen, ArrowLeft, Star,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { Button, Card, Field, PageHeader, Select, StatusBadge } from '../components/ui.jsx';
import { renderSavedInvoice } from '../lib/pdfHtml.js';
import { formatMoney, formatDate } from '../../shared/format.js';
import { TEMPLATES, PAGE_SIZES } from '../../shared/constants.js';
import { draftFromInvoice } from '../lib/invoiceDraft.js';

export function InvoiceViewPage({ navigate, invoiceId }) {
  const { settings, updateSettings, notify, confirm } = useApp();
  const currency = settings['invoice.currency'];
  const [template, setTemplate] = useState(settings['pdf.template']);
  const [pageSize, setPageSize] = useState(settings['pdf.pageSize']);
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState('');
  const { data: inv, reload } = useAsync(() => api.invoices.get(invoiceId), [invoiceId]);

  useEffect(() => {
    if (!inv) return;
    let cancelled = false;
    renderSavedInvoice(inv, settings, { template, pageSize })
      .then((h) => !cancelled && setHtml(h))
      .catch((err) => notify(err.message, 'error'));
    return () => {
      cancelled = true;
    };
  }, [inv, settings, template, pageSize, notify]);

  if (!inv) return <div className="page muted">Loading invoice…</div>;

  const fileBase = `${inv.number} - ${inv.customerSnapshot?.name || inv.customerName || 'Customer'}`;
  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const print = () => run('print', async () => {
    const res = await api.pdf.print(html, pageSize);
    if (res.printed) notify('Sent to printer.');
    else if (res.reason && res.reason !== 'cancelled') notify(`Print failed: ${res.reason}`, 'error');
  });

  /** Writes the PDF to the output folder and returns its path (no UI feedback). */
  const writePdf = async () => (await api.pdf.save(html, pageSize, fileBase)).path;

  const savePdf = () => run('save', async () => {
    const path = await writePdf();
    notify(`PDF saved: ${path}`, 'success', <FolderButton path={path} />);
  });

  const exportPdf = () => run('export', async () => {
    const res = await api.pdf.export(html, pageSize, fileBase);
    if (res && !res.cancelled) notify(`PDF exported to ${res.path}`, 'success', <FolderButton path={res.path} />);
  });

  const emailPdf = () => run('email', async () => {
    const to = inv.customerSnapshot?.email || '';
    const subject = `Invoice ${inv.number} from ${inv.businessSnapshot?.name || ''}`;
    const body = `Dear ${inv.customerSnapshot?.name || 'Customer'},\n\nPlease find invoice ${inv.number} dated ${formatDate(inv.invoiceDate)} for ${formatMoney(inv.grandTotal, currency)}.\n\nThe PDF is attached.\n\nKind regards,\n${inv.businessSnapshot?.name || ''}`;
    const path = await writePdf();
    await api.share.email(to, subject, body);
    await api.share.reveal(path);
    notify('Your mail app is open. Attach the PDF that was just revealed in Explorer.');
  });

  const whatsappPdf = () => run('whatsapp', async () => {
    const number = inv.customerSnapshot?.mobile || '';
    if (!number) throw new Error('This customer has no mobile number. Add it on the customer record first.');
    const message = `Dear ${inv.customerSnapshot?.name || 'Customer'}, here is invoice ${inv.number} for ${formatMoney(inv.grandTotal, currency)}. Thank you.`;
    const path = await writePdf();
    await api.share.whatsapp(number, message);
    await api.share.reveal(path);
    notify('WhatsApp is opening. Attach the PDF that was just revealed.');
  });

  const sharePdf = () => run('share', async () => {
    const path = await writePdf();
    await api.share.copyPath(path);
    await api.share.reveal(path);
    notify('PDF location copied to the clipboard and shown in Explorer.');
  });

  const markPaid = () => run('paid', async () => {
    const draft = draftFromInvoice(inv);
    await api.invoices.save({
      id: inv.id,
      businessId: inv.businessId,
      customerId: inv.customerId,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      paymentMethod: inv.paymentMethod || 'Cash',
      amountPaid: inv.grandTotal,
      notes: inv.notes,
      terms: inv.terms,
      invoiceDiscountType: inv.invoiceDiscountType,
      invoiceDiscountValue: inv.invoiceDiscountValue,
      shippingCharge: inv.shippingCharge,
      isDraft: false,
      items: draft.items.map((it) => ({ ...it, vatRate: it.vatRate === '' ? null : it.vatRate })),
    });
    notify('Invoice marked as paid.');
    reload();
  });

  const remove = async () => {
    const ok = await confirm({ title: 'Delete invoice?', message: `Invoice ${inv.number} will be permanently deleted.`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    await api.invoices.remove(inv.id);
    notify('Invoice deleted.');
    navigate('invoices');
  };

  const setDefaultTemplate = async () => {
    await updateSettings({ 'pdf.template': template, 'pdf.pageSize': pageSize });
    notify('Template saved as default for new invoices.');
  };

  return (
    <div className="page">
      <PageHeader
        title={`Invoice ${inv.number}`}
        subtitle={`${inv.customerSnapshot?.name || ''} · ${formatDate(inv.invoiceDate)}`}
        actions={
          <>
            <Button icon={ArrowLeft} onClick={() => navigate('invoices')}>Back</Button>
            <Button icon={Pencil} onClick={() => navigate('invoice-edit', { id: inv.id })}>Edit</Button>
            <Button icon={Trash2} variant="danger" onClick={remove}>Delete</Button>
          </>
        }
      />

      <div className="view-layout">
        <aside className="view-side">
          <Card title="Invoice">
            <div className="kv">
              <div><span>Status</span><StatusBadge status={inv.status} /></div>
              <div><span>Grand total</span><strong>{formatMoney(inv.grandTotal, currency)}</strong></div>
              <div><span>Paid</span><strong>{formatMoney(inv.amountPaid, currency)}</strong></div>
              <div><span>Balance</span><strong className={inv.balanceDue > 0 ? 'text-danger' : ''}>{formatMoney(inv.balanceDue, currency)}</strong></div>
              <div><span>Payment</span><strong>{inv.paymentMethod || '—'}</strong></div>
              <div><span>Due date</span><strong>{formatDate(inv.dueDate) || '—'}</strong></div>
            </div>
            {inv.status !== 'paid' && inv.status !== 'draft' && (
              <Button icon={CheckCircle2} variant="primary" className="btn-block" onClick={markPaid} disabled={!!busy}>Mark as Paid</Button>
            )}
          </Card>

          <Card title="Template & layout">
            <div className="form-grid one">
              <Field label="Template">
                <Select value={template} onChange={(e) => setTemplate(e.target.value)} options={TEMPLATES.map((t) => ({ value: t.id, label: `${t.name} — ${t.description}` }))} />
              </Field>
              <Field label="Page size">
                <Select value={pageSize} onChange={(e) => setPageSize(e.target.value)} options={PAGE_SIZES} />
              </Field>
            </div>
            <Button icon={Star} size="sm" variant="ghost" onClick={setDefaultTemplate}>Use as default</Button>
          </Card>

          <Card title="Output">
            <div className="action-grid">
              <ActionButton icon={Printer} label="Print" busy={busy === 'print'} onClick={print} />
              <ActionButton icon={Save} label="Save PDF" busy={busy === 'save'} onClick={savePdf} />
              <ActionButton icon={FileDown} label="Export PDF" busy={busy === 'export'} onClick={exportPdf} />
              <ActionButton icon={Mail} label="Email PDF" busy={busy === 'email'} onClick={emailPdf} />
              <ActionButton icon={MessageCircle} label="WhatsApp PDF" busy={busy === 'whatsapp'} onClick={whatsappPdf} />
              <ActionButton icon={Share2} label="Share PDF" busy={busy === 'share'} onClick={sharePdf} />
            </div>
            <p className="muted small">PDFs are saved to <em>Documents › Gulf Tech Invoices</em> unless you change the folder in Settings.</p>
          </Card>
        </aside>

        <section className="preview-pane">
          {html ? (
            <iframe title={`Invoice ${inv.number} preview`} className={`preview-frame ${pageSize === 'A5' ? 'a5' : 'a4'}`} srcDoc={html} />
          ) : (
            <div className="muted">Rendering preview…</div>
          )}
        </section>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, busy }) {
  return (
    <button className="action-btn" onClick={onClick} disabled={busy}>
      <Icon size={20} aria-hidden="true" />
      <span>{busy ? 'Working…' : label}</span>
    </button>
  );
}

function FolderButton({ path }) {
  return (
    <button className="btn btn-sm btn-ghost" onClick={() => api.share.reveal(path).catch(() => {})}>
      <FolderOpen size={14} /> Show in folder
    </button>
  );
}
