/**
 * PIN lock screen shown at startup and after the session timeout.
 */
import React, { useState } from 'react';
import { Lock, Delete } from 'lucide-react';
import { api } from '../lib/api.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

export function LockScreen({ onUnlocked }) {
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const press = (k) => {
    if (busy) return;
    if (k === 'C') return setPin('');
    if (k === '⌫') return setPin((p) => p.slice(0, -1));
    if (pin.length < 8) setPin((p) => p + k);
  };

  const submit = async () => {
    if (pin.length < 4) return setMessage('Enter at least 4 digits.');
    setBusy(true);
    try {
      const res = await api.security.unlock(pin);
      if (res.ok) {
        setPin('');
        setMessage('');
        onUnlocked();
      } else {
        setMessage(res.message || 'Incorrect PIN.');
        setPin('');
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="brand-mark lg">GT</div>
        <h1>Gulf Tech Dubai Invoice Manager</h1>
        <p className="muted">
          <Lock size={14} aria-hidden="true" /> Enter your PIN to unlock
        </p>
        <div className="pin-dots" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span key={i} className={i < pin.length ? 'filled' : ''} />
          ))}
        </div>
        <div className="message-line" role="alert">{message}</div>
        <div className="keypad">
          {KEYS.map((k) => (
            <button key={k} className="key" onClick={() => press(k)} disabled={busy} aria-label={k === '⌫' ? 'Backspace' : k}>
              {k === '⌫' ? <Delete size={20} /> : k}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy || pin.length < 4}>
          Unlock
        </button>
      </div>
    </div>
  );
}
