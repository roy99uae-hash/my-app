/**
 * Dashboard: headline sales figures, last-7-days chart, recent invoices,
 * low-stock warnings and quick actions.
 */
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  Banknote, CalendarDays, CalendarRange, Users, Package, Wallet, FilePlus2, UserPlus, PackagePlus,
  BarChart3, DatabaseBackup, Settings, AlertTriangle,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { Card, PageHeader, StatCard, Button, StatusBadge, EmptyState } from '../components/ui.jsx';
import { formatMoney, formatDate, todayIso } from '../../shared/format.js';

export function DashboardPage({ navigate }) {
  const { settings } = useApp();
  const currency = settings['invoice.currency'];
  const { data, loading } = useAsync(async () => {
    const [dash, week] = await Promise.all([api.dashboard.get(), api.reports.get('weekly', todayIso())]);
    return { dash, week };
  }, []);

  const d = data?.dash;
  const money = (v) => formatMoney(v, currency);

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your sales, customers and stock. Everything runs locally on this computer."
        actions={<Button variant="primary" icon={FilePlus2} onClick={() => navigate('invoice-new')}>Create Invoice</Button>}
      />

      {loading && !d && <div className="muted">Loading…</div>}
      {d && (
        <>
          <div className="stat-grid">
            <StatCard label="Total Sales" value={money(d.totalSales)} hint={`${d.totalInvoices} invoices`} icon={Banknote} />
            <StatCard label="Today's Sales" value={money(d.todaySales)} icon={CalendarDays} tone="green" />
            <StatCard label="Monthly Sales" value={money(d.monthSales)} icon={CalendarRange} tone="indigo" />
            <StatCard label="Outstanding" value={money(d.outstanding)} hint="Unpaid balances" icon={Wallet} tone="amber" />
            <StatCard label="Total Customers" value={d.totalCustomers} icon={Users} tone="slate" />
            <StatCard
              label="Total Products"
              value={d.totalProducts}
              hint={d.lowStockCount ? `${d.lowStockCount} low stock` : 'Stock healthy'}
              icon={Package}
              tone={d.lowStockCount ? 'red' : 'blue'}
            />
          </div>

          <div className="grid-2 dash-grid">
            <Card title="Quick Actions" className="quick-card">
              <div className="quick-grid">
                <QuickAction icon={FilePlus2} label="Create Invoice" onClick={() => navigate('invoice-new')} />
                <QuickAction icon={UserPlus} label="Add Customer" onClick={() => navigate('customers', { openNew: true })} />
                <QuickAction icon={PackagePlus} label="Add Product" onClick={() => navigate('products', { openNew: true })} />
                <QuickAction icon={BarChart3} label="Reports" onClick={() => navigate('reports')} />
                <QuickAction icon={DatabaseBackup} label="Backup" onClick={() => navigate('backup')} />
                <QuickAction icon={Settings} label="Settings" onClick={() => navigate('settings')} />
              </div>
            </Card>

            <Card title="Sales — last 7 days">
              {data?.week && (
                <div className="chart-box short">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.week.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                      <XAxis dataKey="label" stroke="var(--muted)" />
                      <YAxis stroke="var(--muted)" width={70} tickFormatter={(v) => Number(v).toLocaleString()} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="revenue" name="Revenue" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="grid-2 dash-grid">
            <Card
              title="Recent Invoices"
              actions={<Button size="sm" variant="ghost" onClick={() => navigate('invoices')}>View all</Button>}
              flush
            >
              {d.recentInvoices.length === 0 ? (
                <EmptyState title="No invoices yet">Create your first invoice to see it here.</EmptyState>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Invoice</th><th>Customer</th><th>Date</th><th className="num">Total</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {d.recentInvoices.map((inv) => (
                      <tr key={inv.id} className="clickable" onClick={() => navigate('invoice-view', { id: inv.id })}>
                        <td className="strong">{inv.number}</td>
                        <td>{inv.customerName}</td>
                        <td>{formatDate(inv.invoiceDate)}</td>
                        <td className="num">{money(inv.grandTotal)}</td>
                        <td><StatusBadge status={inv.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Low Stock Warnings" actions={<Button size="sm" variant="ghost" onClick={() => navigate('products')}>Manage</Button>} flush>
              {d.lowStockProducts.length === 0 ? (
                <EmptyState title="All good">No products are at or below their reorder level.</EmptyState>
              ) : (
                <ul className="list">
                  {d.lowStockProducts.map((p) => (
                    <li key={p.id}>
                      <AlertTriangle size={16} className="warn-icon" aria-hidden="true" />
                      <span className="grow">{p.name}</span>
                      <span className="badge badge-unpaid">{p.stockQty} left · reorder {p.reorderLevel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button className="quick-action" onClick={onClick}>
      <Icon size={22} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
