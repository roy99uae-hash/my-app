/**
 * Application shell: sidebar navigation and the main content area.
 */
import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  Package,
  FileText,
  BarChart3,
  DatabaseBackup,
  Settings as SettingsIcon,
  Lock,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'businesses', label: 'Businesses', icon: Building2 },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'backup', label: 'Backup & Restore', icon: DatabaseBackup },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Layout({ route, onNavigate, children }) {
  const { info, security, setSecurity } = useApp();
  const lockNow = async () => {
    await api.security.lock();
    setSecurity((s) => ({ ...s, locked: true }));
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">GT</div>
          <div>
            <div className="brand-name">Gulf Tech</div>
            <div className="brand-sub">Dubai Invoice Manager</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = route.name === item.id || (item.id === 'invoices' && route.name.startsWith('invoice'));
            return (
              <button
                key={item.id}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="offline-pill">
            <WifiOff size={14} aria-hidden="true" /> Offline · local data only
          </div>
          {security.hasPin && (
            <button className="nav-item" onClick={lockNow}>
              <Lock size={18} aria-hidden="true" />
              <span>Lock now</span>
            </button>
          )}
          <div className="version">v{info?.version || '1.0.0'}</div>
        </div>
      </aside>
      <main className="content" id="main-content">
        {children}
      </main>
    </div>
  );
}
