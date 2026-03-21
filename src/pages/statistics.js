import React from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#ef4444', '#84cc16', '#22c55e', '#d946ef'];

function Statistics({ transactions, darkMode, t }) {
  const fmt = (v) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(v);

  const tooltip = darkMode
    ? { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', color: '#f1f5f9', fontSize: '13px' }
    : { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px' };

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

  const ChartCard = ({ title, children }) => (
    <div className="card" style={{ padding: '24px' }}>
      <span className="section-title-bar" style={{ marginBottom: '20px', display: 'flex' }}>{title}</span>
      {children}
    </div>
  );

  const CategoryPieCard = ({ title, data }) => (
    <ChartCard title={title}>
      <div className="stats-pie-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)', gap: '18px', alignItems: 'center' }}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={88}
              innerRadius={44}
              dataKey="value"
              label={false}
              labelLine={false}
            >
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={fmt} contentStyle={tooltip} />
          </PieChart>
        </ResponsiveContainer>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
          {data.map((item, index) => {
            const percent = totalIncome + totalExpense > 0
              ? ((item.value / data.reduce((sum, row) => sum + row.value, 0)) * 100).toFixed(0)
              : 0;

            return (
              <div key={`${title}-${item.name}`} style={{
                display: 'grid',
                gridTemplateColumns: '12px minmax(0, 1fr) auto',
                gap: '10px',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'var(--bg-card-inner)',
                border: '1px solid var(--color-border)',
              }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '999px', background: COLORS[index % COLORS.length] }} />
                <div style={{ minWidth: 0 }}>
                  <div className="stats-category-label" style={{
                    color: 'var(--color-text-primary)',
                    fontSize: '14px',
                    fontWeight: '700',
                    whiteSpace: 'normal',
                    wordBreak: 'normal',
                    overflowWrap: 'break-word',
                    lineHeight: 1.45,
                  }}>
                    {item.name}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                    {fmt(item.value)}
                  </div>
                </div>
                <strong style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>{percent}%</strong>
              </div>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );

  const EmptyState = () => (
    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
      <div style={{ fontSize: '32px', opacity: 0.25, marginBottom: '10px' }}>📊</div>
      <p style={{ fontWeight: '500' }}>{t.noData}</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--color-text-primary)', letterSpacing: '-0.03em', margin: 0 }}>{t.statisticsTitle}</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>{t.statisticsSubtitle}</p>
      </div>

      {monthlyData.length > 0 && (
        <ChartCard title={t.monthlyTrend}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-text-secondary)" style={{ fontSize: '12px' }} />
              <YAxis stroke="var(--color-text-secondary)" style={{ fontSize: '12px' }} />
              <Tooltip formatter={fmt} contentStyle={tooltip} />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} dot={false} name={t.income} />
              <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2.5} dot={false} name={t.expense} />
              <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2.5} dot={false} name={t.netBalance} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard title={t.incomeVsExpense}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={totalByType} barSize={56}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="name" stroke="var(--color-text-secondary)" style={{ fontSize: '12px' }} />
            <YAxis stroke="var(--color-text-secondary)" style={{ fontSize: '12px' }} />
            <Tooltip formatter={fmt} contentStyle={tooltip} />
            <Bar dataKey="value" radius={[10, 10, 0, 0]}>
              {totalByType.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {expByCat.length > 0 && (
          <CategoryPieCard title={t.expensesByCategory} data={expByCat} />
        )}
        {incByCat.length > 0 && (
          <CategoryPieCard title={t.incomeByCategory} data={incByCat} />
        )}
      </div>

      <div className="card" style={{ padding: '24px' }}>
        <span className="section-title-bar" style={{ marginBottom: '20px', display: 'flex' }}>{t.summaryByCategory}</span>
        {Object.keys(stats).length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-table-header)', borderBottom: '1px solid var(--color-border)' }}>
                  {[t.thCategory, t.thIncome, t.thExpense, t.thNet].map((h, i) => (
                    <th key={h} style={{
                      padding: '11px 14px', textAlign: i === 0 ? 'left' : 'right', fontWeight: '600', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: i === 0 ? 'var(--color-text-secondary)' : i === 1 ? '#10b981' : i === 2 ? '#ef4444' : '#6366f1'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats).map(([cat, d]) => (
                  <tr key={cat} style={{ borderBottom: '1px solid var(--color-table-row-border)', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-tr-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--color-text-primary)', fontSize: '13.5px' }}>{cat}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#10b981', fontWeight: '700', fontSize: '13.5px' }}>{fmt(d.income)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#ef4444', fontWeight: '700', fontSize: '13.5px' }}>{fmt(d.expense)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#6366f1', fontWeight: '700', fontSize: '13.5px' }}>{fmt(d.income - d.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState />}
      </div>
    </div>
  );
}

export default Statistics;
