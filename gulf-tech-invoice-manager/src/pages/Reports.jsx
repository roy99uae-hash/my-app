/**
 * Reports: daily, weekly, monthly and yearly sales with charts, best sellers,
 * top customers and CSV export.
 */
import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from 'recharts';
import { Download, TrendingUp, FileText, Receipt, Wallet, AlertCircle, Percent } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { Button, Card, PageHeader, StatCard, Input, EmptyState } from '../components/ui.jsx';
import { formatMoney, todayIso } from '../../shared/format.js';
import { toCsv } from '../lib/csv.js';

const PERIOD_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const COLORS = ['#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#0f172a', '#64748b'];

export function ReportsPage() {
  const { settings, notify } = useApp();
  const currency = settings['invoice.currency'];
  const [period, setPeriod] = useState('monthly');
  const [anchor, setAnchor] = useState(todayIso());
  const { data: r, loading } = useAsync(() => api.reports.get(period, anchor), [period, anchor]);

  const money = (v) => formatMoney(v, currency);
  const s = r?.summary;

  const exportCsv = async () => {
    const rows = [
      [`${PERIOD_LABELS[period]} sales report`, `${r.from} to ${r.to}`],
      [],
      ['Total revenue', s.totalRevenue],
      ['Total invoices', s.totalInvoices],
      ['Average invoice value', s.averageInvoiceValue],
      ['Collected', s.collected],
      ['Outstanding', s.outstanding],
      ['VAT collected', s.vat],
      [],
      ['Period', 'Revenue', 'Invoices'],
      ...r.series.map((b) => [b.label, b.revenue, b.count]),
      [],
      ['Best selling products', 'Quantity', 'Revenue'],
      ...r.bestProducts.map((p) => [p.name, p.quantity, p.revenue]),
      [],
      ['Top customers', 'Invoices', 'Revenue'],
      ...r.topCustomers.map((c) => [c.name, c.invoices, c.revenue]),
    ];
    try {
      const res = await api.files.saveText(`sales-${period}-${anchor}.csv`, toCsv(rows), [{ name: 'CSV', extensions: ['csv'] }]);
      if (res && !res.cancelled) notify(`Report exported to ${res.path}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle="Sales performance by day, week, month or year. Draft invoices are excluded."
        actions={<Button icon={Download} onClick={exportCsv} disabled={!r}>Export CSV</Button>}
      />

      <Card>
        <div className="toolbar wrap">
          <div className="segmented" role="tablist">
            {Object.entries(PERIOD_LABELS).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={period === id} className={period === id ? 'active' : ''} onClick={() => setPeriod(id)}>
                {label}
              </button>
            ))}
          </div>
          <Input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} aria-label="Report date" />
          {r && <span className="muted">Period: {r.from} → {r.to}</span>}
        </div>
      </Card>

      {loading && !r && <div className="muted">Loading report…</div>}
      {r && (
        <>
          <div className="stat-grid">
            <StatCard label="Total Revenue" value={money(s.totalRevenue)} icon={TrendingUp} />
            <StatCard label="Total Invoices" value={s.totalInvoices} icon={FileText} tone="slate" />
            <StatCard label="Average Invoice" value={money(s.averageInvoiceValue)} icon={Receipt} tone="indigo" />
            <StatCard label="Collected" value={money(s.collected)} icon={Wallet} tone="green" />
            <StatCard label="Outstanding" value={money(s.outstanding)} icon={AlertCircle} tone="amber" />
            <StatCard label="VAT Collected" value={money(s.vat)} icon={Percent} tone="blue" />
          </div>

          <div className="grid-2">
            <Card title={`${PERIOD_LABELS[period]} revenue`}>
              {s.totalInvoices === 0 ? (
                <EmptyState title="No sales in this period" />
              ) : (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={r.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                      <XAxis dataKey="label" stroke="var(--muted)" interval={period === 'monthly' ? 1 : 0} />
                      <YAxis stroke="var(--muted)" width={80} tickFormatter={(v) => Number(v).toLocaleString()} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="revenue" name="Revenue" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card title="Payment methods (collected)">
              {r.paymentMethods.length === 0 ? (
                <EmptyState title="No payments recorded" />
              ) : (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={r.paymentMethods} dataKey="amount" nameKey="method" innerRadius={55} outerRadius={95} paddingAngle={2}>
                        {r.paymentMethods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Best selling products" flush>
              {r.bestProducts.length === 0 ? <EmptyState title="No product sales in this period" /> : (
                <>
                  <div className="chart-box short">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={r.bestProducts} layout="vertical" margin={{ left: 20 }}>
                        <XAxis type="number" stroke="var(--muted)" />
                        <YAxis type="category" dataKey="name" width={130} stroke="var(--muted)" />
                        <Tooltip formatter={(v) => money(v)} />
                        <Bar dataKey="revenue" name="Revenue" fill="var(--accent)" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="table">
                    <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Revenue</th></tr></thead>
                    <tbody>
                      {r.bestProducts.map((p) => (
                        <tr key={p.name}><td>{p.name}</td><td className="num">{p.quantity}</td><td className="num">{money(p.revenue)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </Card>
            <Card title="Top customers" flush>
              {r.topCustomers.length === 0 ? <EmptyState title="No customer sales in this period" /> : (
                <table className="table">
                  <thead><tr><th>Customer</th><th className="num">Invoices</th><th className="num">Revenue</th></tr></thead>
                  <tbody>
                    {r.topCustomers.map((c) => (
                      <tr key={c.name}><td>{c.name}</td><td className="num">{c.invoices}</td><td className="num">{money(c.revenue)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
