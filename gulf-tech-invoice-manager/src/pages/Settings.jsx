/**
 * Settings: company defaults, invoice numbering and VAT, PDF preferences,
 * automatic backups, theme, security (PIN and session timeout) and data location.
 */
import React, { useEffect, useState } from 'react';
import { Save, Sun, Moon, Lock, Unlock, FolderOpen, Info } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { Button, Card, Field, Input, NumberInput, PageHeader, Select, Textarea } from '../components/ui.jsx';
import { CURRENCIES, PAGE_SIZES, TEMPLATES } from '../../shared/constants.js';
import { validateNumberFormat } from '../../shared/numbering.js';
import { todayIso } from '../../shared/format.js';

export function SettingsPage() {
  const { settings, updateSettings, notify, refreshSecurity, refreshSettings, security } = useApp();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [numberPreview, setNumberPreview] = useState('');
  const { data: businesses } = useAsync(() => api.businesses.list(), []);
  const { data: info } = useAsync(() => api.info(), []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setEvt = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setBool = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));

  useEffect(() => {
    const err = validateNumberFormat(form['invoice.numberFormat']);
    if (err) return setNumberPreview(err);
    api.invoices.numberFor(todayIso()).then((r) => setNumberPreview(r.number)).catch(() => setNumberPreview(''));
  }, [form['invoice.numberFormat'], form['invoice.prefix']]);

  const save = async () => {
    setSaving(true);
    try {
      const keys = [
        'company.defaultBusinessId', 'invoice.vatPercent', 'invoice.currency', 'invoice.prefix', 'invoice.numberFormat',
        'invoice.dueDays', 'invoice.defaultNotes', 'invoice.defaultTerms', 'pdf.template', 'pdf.pageSize', 'pdf.showQr',
        'pdf.showSignatures', 'pdf.footerText', 'pdf.accentColor', 'backup.autoEnabled', 'backup.intervalHours',
        'backup.retention', 'security.sessionTimeoutMinutes',
      ];
      const partial = Object.fromEntries(keys.map((k) => [k, form[k]]));
      await updateSettings(partial);
      notify('Settings saved.');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleTheme = async (theme) => {
    await updateSettings({ 'ui.theme': theme });
    setForm((f) => ({ ...f, 'ui.theme': theme }));
  };

  const chooseOutput = async () => {
    const r = await api.pdf.chooseFolder();
    if (!r.cancelled) {
      notify(`PDF folder set to ${r.folder}`);
      await refreshSettings();
    }
  };

  const chooseBackupFolder = async () => {
    const r = await api.backup.chooseFolder();
    if (!r.cancelled) {
      notify(`Backup folder set to ${r.folder}`);
      await refreshSettings();
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        subtitle="Company defaults, invoice rules, PDF output, backups, theme and security."
        actions={<Button variant="primary" icon={Save} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>}
      />

      <div className="grid-2">
        <Card title="Company defaults">
          <div className="form-grid one">
            <Field label="Default business profile" hint="Pre-selected when you create a new invoice.">
              <Select
                value={form['company.defaultBusinessId'] ?? ''}
                onChange={(e) => set('company.defaultBusinessId')(e.target.value === '' ? null : Number(e.target.value))}
                options={[{ value: '', label: 'None' }, ...(businesses || []).map((b) => ({ value: b.id, label: b.name }))]}
              />
            </Field>
          </div>
        </Card>

        <Card title="Appearance & theme">
          <div className="theme-toggle">
            <button className={form['ui.theme'] === 'light' ? 'active' : ''} onClick={() => toggleTheme('light')}><Sun size={16} /> Light</button>
            <button className={form['ui.theme'] === 'dark' ? 'active' : ''} onClick={() => toggleTheme('dark')}><Moon size={16} /> Dark</button>
          </div>
          <p className="muted small">Your choice is saved and applied immediately.</p>
        </Card>
      </div>

      <Card title="Invoice defaults">
        <div className="form-grid">
          <Field label="VAT percentage" hint="UAE standard rate is 5%.">
            <NumberInput value={form['invoice.vatPercent']} onChange={set('invoice.vatPercent')} step="0.5" />
          </Field>
          <Field label="Currency">
            <Select value={form['invoice.currency']} onChange={setEvt('invoice.currency')} options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} />
          </Field>
          <Field label="Invoice prefix">
            <Input value={form['invoice.prefix']} onChange={setEvt('invoice.prefix')} maxLength={10} />
          </Field>
          <Field label="Invoice number format" hint={`Preview: ${numberPreview}`}>
            <Input value={form['invoice.numberFormat']} onChange={setEvt('invoice.numberFormat')} />
          </Field>
          <Field label="Default due in (days)">
            <NumberInput value={form['invoice.dueDays']} onChange={set('invoice.dueDays')} step="1" />
          </Field>
          <Field label="Default notes" full><Textarea rows={2} value={form['invoice.defaultNotes']} onChange={setEvt('invoice.defaultNotes')} /></Field>
          <Field label="Default terms & conditions" full><Textarea rows={4} value={form['invoice.defaultTerms']} onChange={setEvt('invoice.defaultTerms')} /></Field>
        </div>
        <p className="muted small">Tokens: {'{PREFIX}'}, {'{YYYY}'}, {'{YY}'}, {'{MM}'}, {'{SEQ:6}'}. The sequence restarts when the pattern contains a year or month token.</p>
      </Card>

      <div className="grid-2">
        <Card title="PDF preferences">
          <div className="form-grid">
            <Field label="Default template">
              <Select value={form['pdf.template']} onChange={setEvt('pdf.template')} options={TEMPLATES.map((t) => ({ value: t.id, label: t.name }))} />
            </Field>
            <Field label="Page size">
              <Select value={form['pdf.pageSize']} onChange={setEvt('pdf.pageSize')} options={PAGE_SIZES} />
            </Field>
            <Field label="Accent colour">
              <input type="color" className="color-input" value={form['pdf.accentColor']} onChange={setEvt('pdf.accentColor')} aria-label="Accent colour" />
            </Field>
            <Field label="Footer text"><Input value={form['pdf.footerText']} onChange={setEvt('pdf.footerText')} /></Field>
            <label className="checkbox"><input type="checkbox" checked={!!form['pdf.showQr']} onChange={setBool('pdf.showQr')} /> Show QR code</label>
            <label className="checkbox"><input type="checkbox" checked={!!form['pdf.showSignatures']} onChange={setBool('pdf.showSignatures')} /> Show signature block</label>
          </div>
          <div className="path-row">
            <span className="muted small">Save folder: <code>{settings['pdf.outputFolder'] || 'Documents › Gulf Tech Invoices'}</code></span>
            <Button size="sm" icon={FolderOpen} onClick={chooseOutput}>Change</Button>
          </div>
        </Card>

        <Card title="Automatic backup">
          <div className="form-grid one">
            <label className="checkbox"><input type="checkbox" checked={!!form['backup.autoEnabled']} onChange={setBool('backup.autoEnabled')} /> Enable automatic backups</label>
            <Field label="Backup every (hours)"><NumberInput value={form['backup.intervalHours']} onChange={set('backup.intervalHours')} step="1" /></Field>
            <Field label="Keep the latest N automatic backups"><NumberInput value={form['backup.retention']} onChange={set('backup.retention')} step="1" /></Field>
          </div>
          <div className="path-row">
            <span className="muted small">Folder: <code>{settings['backup.folder'] || 'Default (app data › backups)'}</code></span>
            <Button size="sm" icon={FolderOpen} onClick={chooseBackupFolder}>Change</Button>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Security">
          <div className="form-grid one">
            <Field label="Auto-lock after inactivity (minutes)" hint="0 disables the timeout. Applies only when a PIN is set.">
              <NumberInput value={form['security.sessionTimeoutMinutes']} onChange={set('security.sessionTimeoutMinutes')} step="1" />
            </Field>
          </div>
          <PinManager hasPin={security.hasPin} onChanged={refreshSecurity} notify={notify} />
          <p className="muted small">Fingerprint unlock requires Windows Hello support in the app build and is not included in this release; the PIN lock is the supported method.</p>
        </Card>

        <Card title="Data & about">
          <div className="kv">
            <div><span>Version</span><strong>{info?.version}</strong></div>
            <div><span>Database file</span><strong className="small path-line">{info?.dbPath}</strong></div>
            <div><span>Encryption at rest</span><strong>AES-256-GCM ({info?.keyProtection === 'dpapi' ? 'key protected by Windows' : 'key stored locally'})</strong></div>
            <div><span>Network</span><strong><Info size={14} /> Not required — works fully offline</strong></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Set, change or remove the PIN lock. */
function PinManager({ hasPin, onChanged, notify }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);

  const setPin = async () => {
    if (next !== confirmPin) return notify('The new PIN and confirmation do not match.', 'error');
    setBusy(true);
    try {
      await api.security.setPin(hasPin ? current : '', next);
      notify(hasPin ? 'PIN changed.' : 'PIN lock enabled.');
      setCurrent(''); setNext(''); setConfirmPin('');
      await onChanged();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const removePin = async () => {
    setBusy(true);
    try {
      await api.security.removePin(current);
      notify('PIN lock removed.');
      setCurrent('');
      await onChanged();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pin-manager">
      <h4>{hasPin ? <><Lock size={14} /> PIN lock is ON</> : <><Unlock size={14} /> PIN lock is OFF</>}</h4>
      <div className="form-grid">
        {hasPin && <Field label="Current PIN"><Input type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>}
        <Field label={hasPin ? 'New PIN' : 'Choose a PIN (4–8 digits)'}><Input type="password" inputMode="numeric" value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, ''))} maxLength={8} /></Field>
        <Field label="Confirm PIN"><Input type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} maxLength={8} /></Field>
      </div>
      <div className="btn-row">
        <Button variant="primary" size="sm" onClick={setPin} disabled={busy || !next || !confirmPin || (hasPin && !current)}>
          {hasPin ? 'Change PIN' : 'Enable PIN lock'}
        </Button>
        {hasPin && <Button variant="danger" size="sm" onClick={removePin} disabled={busy || !current}>Remove PIN</Button>}
      </div>
    </div>
  );
}
