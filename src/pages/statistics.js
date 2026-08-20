import React from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#ef4444', '#84cc16', '#22c55e', '#d946ef'];

function Statistics({ transactions, darkMode, t }) {
  const fmt = (v) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(v);

  const tooltip = darkMode
    ? { backgroundColor: '#131f3a', border: '1px solid #2a3a5f', borderRadius: '12px', color: '#f1f5f9', fontSize: '13px' }
    : { backgroundColor: '#fff', border: '1px solid #ece0e6', borderRadius: '12px', fontSize: '13px' };

  const axisStyle = { fontSize: '12px' };

  const monthlyData = (() => {
    const m = {};
    transactions?.forEach(tx => {
      const rawDate = String(tx?.date || '');
      if (!rawDate) return;
      const d = new Date(rawDate);
      if (Number.isNaN(d.getTime())) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!m[k]) m[k] = { month: k, income: 0, expense: 0, balance: 0 };
      if (tx.type === 'income') m[k].income += tx.amount; else m[k].expense += tx.amount;
      m[k].balance = m[k].income - m[k].expense;
    });
    return Object.values(m).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  })();

  let totalIncome = 0, totalExpense = 0;
  transactions?.forEach(tx => { if (tx.type === 'income') totalIncome += tx.amount; else totalExpense += tx.amount; });

  const totalByType = [
    { name: t.income, value: totalIncome, fill: '#10b981' },
    { name: t.expense, value: totalExpense, fill: '#ef4444' },
  ];

  const categoryBreakdown = (type) => {
    const c = {};
    transactions?.forEach(tx => { if (tx.type === type) { c[tx.category] = (c[tx.category] || 0) + tx.amount; } });
    return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const expByCat = categoryBreakdown('expense');
  const incByCat = categoryBreakdown('income');

  const stats = (() => {
    const c = {};
    transactions?.forEach(tx => {
      if (!c[tx.category]) c[tx.category] = { income: 0, expense: 0 };
      c[tx.category][tx.type] += tx.amount;
    });
    return c;
  })();

  const hasAnyData = (transactions?.length || 0) > 0;

  const ChartCard = ({ title, subtitle, children }) => (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="section-title-bar">{title}</span>
          {subtitle && <p className="panel-subtitle">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );

  const EmptyState = ({ icon = '📊', label }) => (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <strong>{label || t.noData}</strong>
    </div>
  );

  const CategoryPieCard = ({ title, data }) => {
    const sum = data.reduce((acc, row) => acc + row.value, 0);

    return (
      <ChartCard title={title}>
        <div className="stats-pie-layout">
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  outerRadius={88}
                  innerRadius={52}
                  paddingAngle={2}
                  dataKey="value"
                  label={false}
                  labelLine={false}
                  stroke="none"
                >
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={fmt} contentStyle={tooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="stats-legend">
            {data.map((item, index) => {
              const percent = sum > 0 ? ((item.value / sum) * 100).toFixed(0) : 0;
              return (
                <div key={`${title}-${item.name}`} className="stats-legend-row">
                  <span
                    className="stats-legend-dot"
                    style={{ background: COLORS[index % COLORS.length] }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="stats-category-label" style={{ color: 'var(--color-text-primary)', fontWeight: 650 }}>
                      {item.name}
                    </div>
                    <div className="num" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                      {fmt(item.value)}
                    </div>
                  </div>
                  <strong className="num" style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                    {percent}%
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      </ChartCard>
    );
  };

  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t.statisticsSubtitle}</span>
          <h1>{t.statisticsTitle}</h1>
          <p>{t.statisticsSubtitle}</p>
        </div>
        <div className="page-heading-actions">
          <span className="page-chip">{t.period}</span>
        </div>
      </header>

      {!hasAnyData && (
        <section className="panel">
          <EmptyState label={t.noData} />
        </section>
      )}

      {monthlyData.length > 0 && (
        <ChartCard title={t.monthlyTrend}>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-text-muted)" style={axisStyle} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-muted)" style={axisStyle} tickLine={false} axisLine={false} width={72} />
                <Tooltip formatter={fmt} contentStyle={tooltip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }} />
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} dot={false} name={t.income} />
                <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2.5} dot={false} name={t.expense} />
                <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2.5} dot={false} name={t.netBalance} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}

      {hasAnyData && (
        <ChartCard title={t.incomeVsExpense}>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={totalByType} barSize={64} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--color-text-muted)" style={axisStyle} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-muted)" style={axisStyle} tickLine={false} axisLine={false} width={72} />
                <Tooltip formatter={fmt} contentStyle={tooltip} cursor={{ fill: 'var(--bg-subtle)' }} />
                <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                  {totalByType.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}

      {(expByCat.length > 0 || incByCat.length > 0) && (
        <div className="grid grid-auto-lg">
          {expByCat.length > 0 && <CategoryPieCard title={t.expensesByCategory} data={expByCat} />}
          {incByCat.length > 0 && <CategoryPieCard title={t.incomeByCategory} data={incByCat} />}
        </div>
      )}

      <section className="panel">
        <div className="panel-header">
          <span className="section-title-bar">{t.summaryByCategory}</span>
        </div>

        {Object.keys(stats).length > 0 ? (
          <div className="table-wrap">
            {/* data-label ใช้โดย CSS ตอนจอแคบ เพื่อพลิกตารางเป็นการ์ดที่มีป้ายกำกับในตัว */}
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>{t.thCategory}</th>
                  <th className="is-num" style={{ color: 'var(--color-success)' }}>{t.thIncome}</th>
                  <th className="is-num" style={{ color: 'var(--color-danger)' }}>{t.thExpense}</th>
                  <th className="is-num" style={{ color: 'var(--accent-primary)' }}>{t.thNet}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats).map(([cat, d]) => (
                  <tr key={cat}>
                    <td style={{ fontWeight: 650, color: 'var(--color-text-primary)' }}>{cat}</td>
                    <td data-label={t.thIncome} className="is-num num" style={{ color: 'var(--color-success)', fontWeight: 700 }}>{fmt(d.income)}</td>
                    <td data-label={t.thExpense} className="is-num num" style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{fmt(d.expense)}</td>
                    <td data-label={t.thNet} className="is-num num" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{fmt(d.income - d.expense)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 800 }}>{t.thNet}</td>
                  <td data-label={t.thIncome} className="is-num num" style={{ color: 'var(--color-success)' }}>{fmt(totalIncome)}</td>
                  <td data-label={t.thExpense} className="is-num num" style={{ color: 'var(--color-danger)' }}>{fmt(totalExpense)}</td>
                  <td data-label={t.thNet} className="is-num num" style={{ color: 'var(--accent-primary)' }}>{fmt(totalIncome - totalExpense)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <EmptyState />}
      </section>
    </div>
  );
}

export default Statistics;
