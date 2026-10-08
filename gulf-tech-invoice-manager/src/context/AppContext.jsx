/**
 * Global application state: settings, theme, lock state, session timeout,
 * toast notifications and the confirm dialog.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [info, setInfo] = useState(null);
  const [settings, setSettings] = useState(null);
  const [security, setSecurity] = useState({ hasPin: false, locked: false });
  const [toasts, setToasts] = useState([]);
  const [ready, setReady] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const idleTimer = useRef(null);

  const notify = useCallback((message, type = 'success', extra = null) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id, message, type, extra }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), extra ? 8000 : 4000);
  }, []);

  const confirm = useCallback(
    ({ title = 'Please confirm', message, confirmText = 'Confirm', danger = false }) =>
      new Promise((resolve) => setConfirmState({ title, message, confirmText, danger, resolve })),
    [],
  );

  const closeConfirm = (result) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  const refreshSettings = useCallback(async () => {
    const s = await api.settings.get();
    setSettings(s);
    return s;
  }, []);

  const refreshSecurity = useCallback(async () => {
    const s = await api.security.status();
    setSecurity({ hasPin: s.hasPin, locked: s.locked });
    return s;
  }, []);

  /** Update settings and keep local state in sync. */
  const updateSettings = useCallback(async (partial) => {
    const s = await api.settings.update(partial);
    setSettings(s);
    return s;
  }, []);

  useEffect(() => {
    // Pages must not request data until we know whether the PIN lock is active.
    (async () => {
      // Each load is independent so one failing call cannot leave the app on the spinner.
      const results = await Promise.allSettled([
        api.info().then(setInfo),
        refreshSettings(),
        refreshSecurity(),
      ]);
      const failed = results.find((r) => r.status === 'rejected');
      if (failed) notify(failed.reason?.message || 'Startup failed', 'error');
      setReady(true);
    })();
  }, [refreshSettings, refreshSecurity, notify]);

  // Theme: apply the saved preference to the document root.
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.['ui.theme'] || 'light';
  }, [settings?.['ui.theme']]);

  // Session timeout: lock after inactivity when a PIN is configured.
  const timeoutMinutes = Number(settings?.['security.sessionTimeoutMinutes']) || 0;
  useEffect(() => {
    if (!security.hasPin || security.locked || timeoutMinutes <= 0) return undefined;
    const reset = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(async () => {
        await api.security.lock();
        setSecurity((s) => ({ ...s, locked: true }));
      }, timeoutMinutes * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [security.hasPin, security.locked, timeoutMinutes]);

  const value = {
    ready,
    info,
    settings,
    security,
    setSecurity,
    refreshSettings,
    refreshSecurity,
    updateSettings,
    notify,
    confirm,
    toasts,
    dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      {confirmState && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal modal-sm">
            <h3>{confirmState.title}</h3>
            <p className="pre-wrap">{confirmState.message}</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => closeConfirm(false)}>Cancel</button>
              <button
                className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
