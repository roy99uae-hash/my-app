/**
 * Root component: providers, lock gate and a lightweight state-based router.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.jsx';
import { Layout } from './components/Layout.jsx';
import { LockScreen } from './components/LockScreen.jsx';
import { ToastStack } from './components/ui.jsx';
import { DashboardPage } from './pages/Dashboard.jsx';
import { BusinessesPage } from './pages/Businesses.jsx';
import { CustomersPage } from './pages/Customers.jsx';
import { ProductsPage } from './pages/Products.jsx';
import { InvoicesPage } from './pages/Invoices.jsx';
import { InvoiceEditorPage } from './pages/InvoiceEditor.jsx';
import { InvoiceViewPage } from './pages/InvoiceView.jsx';
import { ReportsPage } from './pages/Reports.jsx';
import { BackupPage } from './pages/Backup.jsx';
import { SettingsPage } from './pages/Settings.jsx';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { ready, security, setSecurity, toasts, dismissToast, settings } = useApp();
  const [route, setRoute] = useState({ name: 'dashboard', params: {} });

  const navigate = useCallback((name, params = {}) => setRoute({ name, params }), []);

  const page = useMemo(() => renderRoute(route, navigate), [route, navigate]);

  if (!ready || !settings) {
    return <div className="boot"><div className="spinner" aria-label="Loading" /></div>;
  }
  if (security.locked) {
    return (
      <>
        <LockScreen onUnlocked={() => setSecurity((s) => ({ ...s, locked: false }))} />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }
  return (
    <>
      <Layout route={route} onNavigate={(name) => navigate(name)}>
        {page}
      </Layout>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

function renderRoute(route, navigate) {
  switch (route.name) {
    case 'dashboard':
      return <DashboardPage navigate={navigate} />;
    case 'businesses':
      return <BusinessesPage />;
    case 'customers':
      return <CustomersPage openNew={!!route.params.openNew} />;
    case 'products':
      return <ProductsPage openNew={!!route.params.openNew} />;
    case 'invoices':
      return <InvoicesPage navigate={navigate} />;
    case 'invoice-new':
      return <InvoiceEditorPage navigate={navigate} invoiceId={null} initial={route.params} />;
    case 'invoice-edit':
      return <InvoiceEditorPage navigate={navigate} invoiceId={route.params.id} />;
    case 'invoice-view':
      return <InvoiceViewPage navigate={navigate} invoiceId={route.params.id} />;
    case 'reports':
      return <ReportsPage />;
    case 'backup':
      return <BackupPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <DashboardPage navigate={navigate} />;
  }
}
