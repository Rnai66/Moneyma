import React from 'react';
import PromoBanner from '../components/PromoBanner';

const CARD_ICONS = {
  income: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
  expense: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>,
  balance: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
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
    {
      type: 'balance',
      label: t.netBalance,
      value: balance,
      note: trend >= 0 ? `+${trend.toFixed(1)}%` : `${trend.toFixed(1)}%`,
    },
  ];

  const valueColor = (type, value) => {
    if (type === 'income') return 'var(--color-success)';
    if (type === 'expense') return 'var(--color-danger)';
    return value >= 0 ? 'var(--accent-primary)' : 'var(--color-danger)';
  };

  return (
    <div className="dashboard-page">
      {/* แสดงเฉพาะช่วงโปร + ผู้ใช้ free + แพลตฟอร์มที่ซื้อได้ — ตัวคอมโพเนนต์ตัดสินเอง */}
      <PromoBanner />

      <header className="page-heading">
        <div>
          <span className="eyebrow">{t.dashboardSubtitle}</span>
          <h1>{t.dashboardTitle}</h1>
          <p>{t.dashboardSubtitle}</p>
        </div>
        <div className="page-heading-actions">
          <span className="page-chip">{t.period}</span>
        </div>
      </header>

      <section className="balance-hero">
        <div className="balance-hero-copy">
          <span className="balance-label">{t.netBalance}</span>
          <div className="balance-amount">
            <span className="balance-currency">฿</span>
            <strong>
              {new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(balance)}
            </strong>
          </div>
          <div className="balance-trend">
            {trend >= 0 ? '↗' : '↘'} {Math.abs(trend).toFixed(1)}% · {t.period}
          </div>
        </div>
        <div className="balance-hero-orb" />
      </section>

      <section className="dashboard dashboard-grid">
        {cards.map(({ type, label, value, note }) => (
          <article key={type} className={`card stat-card ${type}`}>
            <div className="stat-card-head">
              <span className="card-title">{label}</span>
              <span className={`stat-icon ${type}`}>{CARD_ICONS[type]}</span>
            </div>
            <div className="card-value" style={{ color: valueColor(type, value) }}>
              {formatCurrency(value)}
            </div>
            <div className="stat-note">{note}</div>
          </article>
        ))}
      </section>

      <section className="dashboard-split">
        <div className="panel performance-card">
          <div className="panel-header">
            <div>
              <h2>{t.statisticsTitle}</h2>
              <p className="panel-subtitle">{t.monthlyTrend}</p>
            </div>
            <span className="mini-badge">{t.period}</span>
          </div>

          <div className="activity-chart">
            {activityBars.map((height, index) => (
              <div
                key={`${height}-${index}`}
                className={`activity-bar ${index === 5 ? 'active' : ''}`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>{t.recentTransactions}</h2>
              <p className="panel-subtitle">{t.lastEntries.replace('{n}', transactions?.length || 0)}</p>
            </div>
          </div>

          {transactions && transactions.length > 0 ? (
            <div className="stack-sm">
              {transactions.map((tx) => (
                <div key={tx.id} className="transaction-item">
                  <div className="transaction-info">
                    <div
                      className="transaction-avatar"
                      style={{
                        background: tx.type === 'income'
                          ? 'linear-gradient(135deg, #10b981, #059669)'
                          : 'linear-gradient(135deg, #ef4444, #dc2626)',
                      }}
                    >
                      {(tx.category || '?').charAt(0)}
                    </div>
                    <div className="transaction-details">
                      <span className="transaction-category">{tx.category}</span>
                      <span className="transaction-date">
                        {tx.date}{tx.description ? ` · ${tx.description}` : ''}
                      </span>
                    </div>
                  </div>
                  <span className={`transaction-amount ${tx.type}`}>
                    {tx.type === 'income' ? '+' : '−'}&nbsp;{formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <strong>{t.noTransactionsYet}</strong>
              <p>{t.addFirstTransaction}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
