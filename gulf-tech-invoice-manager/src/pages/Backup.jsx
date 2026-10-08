/**
 * Backup & restore: manual exports (ZIP / JSON / SQLite, optional password),
 * restore from any of those formats (with a safety backup), and automatic backup status.
 */
import React, { useState } from 'react';
import { DatabaseBackup, Upload, ShieldCheck, HardDrive, Clock, FolderOpen } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { Button, Card, Field, Input, Modal, PageHeader, Select } from '../components/ui.jsx';
import { formatDate } from '../../shared/format.js';

const FORMATS = [
  { value: 'zip', label: 'ZIP (complete: database + JSON copy)' },
  { value: 'json', label: 'JSON (readable, portable)' },
  { value: 'sqlite', label: 'SQLite (raw database file)' },
];

export function BackupPage() {
  const { settings, notify, confirm, refreshSettings, refreshSecurity } = useApp();
  const [format, setFormat] = useState('zip');
  const [encrypt, setEncrypt] = useState(true);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restorePassword, setRestorePassword] = useState(null);
  const { data: list, reload } = useAsync(() => api.backup.list(), []);

  const createBackup = async () => {
    if (encrypt) {
      if (password.length < 6) return notify('Use a backup password of at least 6 characters.', 'error');
      if (password !== password2) return notify('The two passwords do not match.', 'error');
    }
    setBusy(true);
    try {
      const res = await api.backup.export(format, encrypt ? password : undefined);
      if (res.cancelled) return;
      notify(`Backup saved to ${res.path}`);
      reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const chooseRestore = async () => {
    const picked = await api.backup.pickFile();
    if (picked.cancelled) return;
    setRestoreFile(picked.path);
    setRestorePassword(null);
  };

  const performRestore = async (pw) => {
    const ok = await confirm({
      title: 'Restore backup?',
      message: 'All current data will be replaced by the backup. A safety backup of the current data is created first in the backup folder.',
      confirmText: 'Restore',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.backup.restore(restoreFile, pw);
      if (res.needsPassword) {
        setRestorePassword('');
        return;
      }
      setRestoreFile(null);
      setRestorePassword(null);
      await refreshSettings();
      await refreshSecurity();
      notify(
        `Restored: ${res.tables.customers} customers, ${res.tables.products} products, ${res.tables.invoices} invoices. Safety backup: ${res.safetyBackup}`,
        'success',
      );
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Backup & Restore" subtitle="Keep copies of your entire database. Store them on a USB drive or another disk." />

      <div className="grid-2">
        <Card title="Create a backup">
          <div className="form-grid one">
            <Field label="Format">
              <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
            </Field>
            <label className="checkbox">
              <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} /> Protect with a password (recommended)
            </label>
            {encrypt && (
              <>
                <Field label="Backup password" hint="You will need this password to restore. It cannot be recovered.">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </Field>
                <Field label="Confirm password">
                  <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
                </Field>
              </>
            )}
          </div>
          <Button variant="primary" icon={DatabaseBackup} onClick={createBackup} disabled={busy}>
            {busy ? 'Working…' : 'Export backup'}
          </Button>
          <p className="muted small">Password-protected backups use AES-256 encryption and can be restored on any computer.</p>
        </Card>

        <Card title="Restore from a backup">
          <p>Restore a ZIP, JSON or SQLite backup created by this application. Restoring replaces all current data.</p>
          <Button icon={Upload} onClick={chooseRestore} disabled={busy}>Choose backup file…</Button>
          {restoreFile && (
            <div className="restore-box">
              <div className="small">Selected: <code>{restoreFile}</code></div>
              <Button variant="danger" onClick={() => performRestore(undefined)} disabled={busy}>Restore this file</Button>
            </div>
          )}
          <p className="muted small">The PIN lock configured on this computer is kept after a restore.</p>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Automatic backup">
          <div className="kv">
            <div><span><ShieldCheck size={14} /> Automatic backup</span><strong>{settings['backup.autoEnabled'] ? 'On' : 'Off'}</strong></div>
            <div><span><Clock size={14} /> Every</span><strong>{settings['backup.intervalHours']} hour(s)</strong></div>
            <div><span>Keep last</span><strong>{settings['backup.retention']} backups</strong></div>
            <div><span>Last run</span><strong>{settings['backup.lastAuto'] ? formatDate(settings['backup.lastAuto'].slice(0, 10)) : 'Never'}</strong></div>
          </div>
          <p className="muted small">Automatic backups are encrypted with this computer's protected key and can only be restored on this computer. Configure them in Settings.</p>
          <Button icon={HardDrive} onClick={async () => { try { const r = await api.backup.runNow(); notify(r.path ? `Backup created: ${r.path}` : 'Nothing to back up.'); reload(); } catch (e) { notify(e.message, 'error'); } }}>
            Run automatic backup now
          </Button>
        </Card>

        <Card title="Backup folder" actions={<Button size="sm" variant="ghost" icon={FolderOpen} onClick={async () => { const r = await api.backup.chooseFolder().catch((e) => notify(e.message, 'error')); if (r && !r.cancelled) { notify(`Backup folder set to ${r.folder}`); reload(); } }}>Change</Button>} flush>
          {list && <div className="muted small path-line">{list.folder}</div>}
          {list && list.files.length === 0 && <p className="muted pad">No backups yet.</p>}
          {list && list.files.length > 0 && (
            <table className="table">
              <thead><tr><th>File</th><th>Created</th><th className="num">Size</th></tr></thead>
              <tbody>
                {list.files.slice(0, 15).map((f) => (
                  <tr key={f.path}>
                    <td className="small">{f.name}</td>
                    <td className="small">{new Date(f.modified).toLocaleString()}</td>
                    <td className="num small">{Math.round(f.size / 1024)} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {restoreFile && restorePassword !== null && (
        <Modal title="Backup password required" onClose={() => setRestorePassword(null)} footer={
          <>
            <Button onClick={() => setRestorePassword(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => performRestore(restorePassword)} disabled={!restorePassword}>Restore</Button>
          </>
        }>
          <p>This backup is password protected. Enter the password used when it was created.</p>
          <Field label="Password"><Input type="password" autoFocus value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  );
}
