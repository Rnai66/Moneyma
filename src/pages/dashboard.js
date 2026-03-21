import React from 'react';

const CARD_COLORS = {
  income: { border: '#10b981', bg: 'rgba(16,185,129,0.08)', icon: '↑' },
  expense: { border: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: '↓' },
  balance: { border: '#6366f1', bg: 'rgba(99,102,241,0.08)', icon: '⬡' },
};

function Dashboard({ summary, transactions, t }) {
  const formatCurrency = (value) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(value);

  const totalIncome = summary?.totalIncome || 0;
  const totalExpense = summary?.totalExpense || 0;
  const balance = summary?.balance || 0;
  const trend = totalIncome > 0 ? ((balance / totalIncome) * 100) : 0;
  const activityBars = [38, 56, 34, 82, 48, 100, 67, 44];

  const cards = [
    { type: 'income', label: t.totalIncome, value: totalIncome, note: t.period },
    { type: 'expense', label: t.totalExpense, value: totalExpense, note: t.period },
    { type: 'balance', label: t.netBalance, value: balance, note: trend >= 0 ? `+${trend.toFixed(1)}%` : `${trend.toFixed(1)}%` },
  ];

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t.dashboardSubtitle}</span>
          <h1>{t.dashboardTitle}</h1>
          <p>{t.dashboardSubtitle}</p>
        </div>
        <div className="page-chip">{t.period}</div>
      </div>

      <section className="balance-hero">
        <div className="balance-hero-copy">
          <span className="balance-label">{t.netBalance}</span>
          <div className="balance-amount">
            <span className="balance-currency">฿</span>
            <strong>{new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(balance)}</strong>
          </div>
          <div className="balance-trend">{trend >= 0 ? '↗' : '↘'} {Math.abs(trend).toFixed(1)}% {t.period}</div>
        </div>
        <div className="balance-hero-orb" />
      </section>

      <div className="dashboard dashboard-grid">
        {cards.map(({ type, label, value, note }) => {
          const c = CARD_COLORS[type];
          return (
            <div key={type} className={`card stat-card ${type}`} style={{ gap: '16px', cursor: 'default' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="card-title">{label}</span>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '10px',
                  background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', fontWeight: '800', color: c.border, flexShrink: 0,
                }}>
                  {c.icon}
                </div>
              </div>
              <div className="card-value" style={{
                color: type === 'income' ? 'var(--color-success)' :
                  type === 'expense' ? 'var(--color-danger)' :
                    (value >= 0 ? 'var(--accent-primary)' : 'var(--color-danger)'),
              }}>
                {formatCurrency(value)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{note}</div>
            </div>
          );
        })}
      </div>

      <section className="dashboard-split">
        <div className="recent-transactions performance-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ margin: 0 }}>{t.statisticsTitle}</h2>
              <p className="panel-subtitle">{t.monthlyTrend}</p>
            </div>
            <span className="mini-badge">{t.period}</span>
          </div>

          <div className="activity-chart">
            {activityBars.map((height, index) => (
              <div key={height + index} className={`activity-bar ${index === 5 ? 'active' : ''}`} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>

        <div className="recent-transactions">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0 }}>{t.recentTransactions}</h2>
            <p className="panel-subtitle">{t.lastEntries.replace('{n}', transactions?.length || 0)}</p>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
            {t.lastEntries.replace('{n}', transactions?.length || 0)}
          </span>
        </div>

        {transactions && transactions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {transactions.map((tx) => (
              <div key={tx.id} className="transaction-item">
                <div className="transaction-info">
                  <div className="transaction-avatar" style={{
                    background: tx.type === 'income'
                      ? 'linear-gradient(135deg, #10b981, #059669)'
                      : 'linear-gradient(135deg, #ef4444, #dc2626)',
                  }}>
                    {(tx.category || '?').charAt(0)}
                  </div>
                  <div className="transaction-details">
                    <span className="transaction-category">{tx.category}</span>
                    <span className="transaction-date">{tx.date}{tx.description ? ` · ${tx.description}` : ''}</span>
                  </div>
                </div>
                <span className={`transaction-amount ${tx.type}`}>
                  {tx.type === 'income' ? '+' : '−'}&nbsp;{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center', padding: '48px 20px', color: 'var(--color-text-secondary)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          }}>
            <div style={{ fontSize: '40px', opacity: 0.3 }}>📋</div>
            <p style={{ fontWeight: '500', color: 'var(--color-text-primary)' }}>{t.noTransactionsYet}</p>
            <p style={{ fontSize: '13px' }}>{t.addFirstTransaction}</p>
          </div>
        )}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
