/**
 * Reusable UI building blocks: buttons, form fields, modal, tables, badges,
 * stat cards and the image picker. Styling lives in styles/app.css.
 */
import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Trash2, Search } from 'lucide-react';
import { INVOICE_STATUS_LABELS } from '../../shared/constants.js';

export function Button({ variant = 'default', size, icon: Icon, children, className = '', ...props }) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size === 'sm' && 'btn-sm', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...props}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Card({ title, actions, children, className = '', flush = false }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'card-body flush' : 'card-body'}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** Labelled form field wrapper. */
export function Field({ label, hint, error, children, full = false }) {
  return (
    <label className={`field ${full ? 'field-full' : ''} ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Textarea(props) {
  return <textarea className="input textarea" rows={props.rows || 3} {...props} />;
}

export function Select({ options = [], ...props }) {
  return (
    <select className="input" {...props}>
      {options.map((o) => {
        const value = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return (
          <option key={value} value={value}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

/** Search box with a magnifier icon. */
export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="search-box">
      <Search size={16} aria-hidden="true" />
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Modal dialog. Closes on Escape or backdrop click. */
export function Modal({ title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-actions">{footer}</footer>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{INVOICE_STATUS_LABELS[status] || status}</span>;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'blue' }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-icon">{Icon && <Icon size={22} />}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && <Icon size={36} aria-hidden="true" />}
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

/**
 * Image upload field. Accepts PNG/JPG/WebP and returns a data URL via onChange.
 */
export function ImagePicker({ label, value, onChange, pick, hint, shape = 'square', disabled = false }) {
  const [busy, setBusy] = useState(false);
  const choose = async () => {
    setBusy(true);
    try {
      const picked = await pick();
      if (picked) onChange(picked.dataUrl);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="image-picker">
      <span className="field-label">{label}</span>
      <div className="image-picker-row">
        <div className={`image-preview ${shape}`}>
          {value ? <img src={value} alt="" /> : <span className="muted">No image</span>}
        </div>
        <div className="image-picker-actions">
          <Button icon={Upload} size="sm" onClick={choose} disabled={busy || disabled}>
            {busy ? 'Loading…' : value ? 'Replace' : 'Upload'}
          </Button>
          {value && (
            <Button icon={Trash2} size="sm" variant="ghost" onClick={() => onChange(null)} disabled={disabled}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

/** Currency-free number input that stores numbers (or '' while editing). */
export function NumberInput({ value, onChange, step = '0.01', min = '0', ...rest }) {
  return (
    <input
      className="input num-input"
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      onFocus={(e) => e.target.select()}
      {...rest}
    />
  );
}

/** Keeps a ref to the latest value (handy for async effects). */
export function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <div className="toast-message pre-wrap">{t.message}</div>
          {t.extra}
          <button className="icon-btn" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
