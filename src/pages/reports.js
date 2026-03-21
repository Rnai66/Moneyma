import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { exportTransactionsToExcelBrowser } from '../utils/dataTransfer';

function Reports({ transactions, darkMode, t }) {
  const [reportType, setReportType] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().split('T')[0].substring(0, 7));
  const [selectedQuarter, setSelectedQuarter] = useState('Q1');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const formatCurrency = (v) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(v);

  const tooltipStyle = darkMode
    ? { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', color: '#f1f5f9', fontSize: '13px' }
    : { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px' };

  const selectStyle = {
    padding: '8px 14px', border: '1.5px solid var(--color-border)', borderRadius: '8px',
    fontSize: '13.5px', fontFamily: 'inherit', background: 'var(--bg-input)',
    color: 'var(--color-text-primary)', outline: 'none', cursor: 'pointer',
  };

  const calcMonthly = () => {
    const [year, month] = selectedMonth.split('-');
    const txns = transactions?.filter(tx => String(tx?.date || '').startsWith(`${year}-${month}`)) || [];
    let income = 0, expense = 0; const cats = {};
    txns.forEach(tx => {
      if (tx.type === 'income') income += tx.amount; else expense += tx.amount;
      if (!cats[tx.category]) cats[tx.category] = { income: 0, expense: 0 };
      cats[tx.category][tx.type] += tx.amount;
    });
    return { income, expense, balance: income - expense, categories: cats, transactions: txns };
  };

  const calcQuarterly = () => {
    const qm = { Q1: ['01', '02', '03'], Q2: ['04', '05', '06'], Q3: ['07', '08', '09'], Q4: ['10', '11', '12'] };
    const months = qm[selectedQuarter];
    const txns = transactions?.filter(tx => {
      const date = String(tx?.date || '');
      return months.includes(date.substring(5, 7)) && date.substring(0, 4) === selectedYear.toString();
    }) || [];
    let income = 0, expense = 0; const mdMap = {}, cats = {};
    txns.forEach(tx => {
      const mk = String(tx?.date || '').substring(0, 7);
      if (!mdMap[mk]) mdMap[mk] = { month: mk, income: 0, expense: 0, balance: 0 };
      if (tx.type === 'income') { income += tx.amount; mdMap[mk].income += tx.amount; }
      else { expense += tx.amount; mdMap[mk].expense += tx.amount; }
      mdMap[mk].balance = mdMap[mk].income - mdMap[mk].expense;
      if (!cats[tx.category]) cats[tx.category] = { income: 0, expense: 0 };
      cats[tx.category][tx.type] += tx.amount;
    });
    return { income, expense, balance: income - expense, monthlyData: Object.values(mdMap).sort((a, b) => a.month.localeCompare(b.month)), categories: cats, transactions: txns };
  };

  const report = reportType === 'monthly' ? calcMonthly() : calcQuarterly();

  const availableMonths = useMemo(() => {
    const s = new Set(); transactions?.forEach(tx => {
      const month = String(tx?.date || '').substring(0, 7);
      if (month) s.add(month);
    });
    return Array.from(s).sort().reverse();
  }, [transactions]);

  const availableYears = useMemo(() => {
    const s = new Set(); transactions?.forEach(tx => {
      const year = String(tx?.date || '').substring(0, 4);
      if (year) s.add(year);
    });
    return Array.from(s).sort().reverse().map(Number);
  }, [transactions]);

  const quarters = [
    { value: 'Q1', label: t.q1 },
    { value: 'Q2', label: t.q2 },
    { value: 'Q3', label: t.q3 },
    { value: 'Q4', label: t.q4 },
  ];

  const summaryCards = [
    { label: t.totalIncome, value: report.income, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    { label: t.totalExpense, value: report.expense, color: '#ef4444', bg: 'rgba(239,68,68,0.09)' },
    { label: t.netBalance, value: report.balance, color: report.balance >= 0 ? '#6366f1' : '#ef4444', bg: 'rgba(99,102,241,0.09)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--color-text-primary)', letterSpacing: '-0.03em', margin: 0 }}>{t.reportsTitle}</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>{t.reportsSubtitle}</p>
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Segmented Control */}
          <div style={{ display: 'flex', background: 'var(--bg-card-inner)', borderRadius: '10px', padding: '4px', border: '1px solid var(--color-border)' }}>
            {[{ val: 'monthly', label: t.monthly }, { val: 'quarterly', label: t.quarterly }].map(({ val, label }) => (
              <button key={val} onClick={() => setReportType(val)} style={{
                padding: '7px 18px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontSize: '13px', fontFamily: 'inherit', fontWeight: '600', transition: 'all .2s',
                background: reportType === val ? 'var(--accent-gradient)' : 'transparent',
                color: reportType === val ? 'white' : 'var(--color-text-secondary)',
                boxShadow: reportType === val ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
              }}>
                {label}
              </button>
            ))}
          </div>

          {reportType === 'monthly' && (
            <div className="filter-group" style={{ gap: '4px' }}>
              <label>{t.labelMonth}</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={selectStyle}>
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {reportType === 'quarterly' && (
            <>
              <div className="filter-group" style={{ gap: '4px' }}>
                <label>{t.labelQuarter}</label>
                <select value={selectedQuarter} onChange={e => setSelectedQuarter(e.target.value)} style={selectStyle}>
                  {quarters.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                </select>
              </div>
              <div className="filter-group" style={{ gap: '4px' }}>
                <label>{t.labelYear}</label>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={selectStyle}>
                  {availableYears.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
            </>
          )}

          <button className="btn" onClick={async () => {
            try {
              if (window.electronAPI) {
                const r = await window.electronAPI.exportToExcel(report.transactions);
                if (r.success) alert(`✅ ${t.exportedSuccessfully || 'Exported'}: ${r.path.split('/').pop()}`);
                return;
              }

              const r = await exportTransactionsToExcelBrowser(report.transactions);
              if (r.success) alert(`✅ ${t.exportedSuccessfully || 'Exported'}: ${r.filename}`);
            } catch (e) { console.error(e); }
          }} style={{ marginLeft: 'auto' }}>
            {t.exportReport}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        {summaryCards.map(({ label, value, color, bg }) => (
          <div key={label} className="card" style={{ padding: '20px', gap: '10px', borderTop: `3px solid ${color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title">{label}</span>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '13px', color }}>●</span>
              </div>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color, letterSpacing: '-0.03em' }}>
              {formatCurrency(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Quarterly Chart */}
      {reportType === 'quarterly' && report.monthlyData?.length > 0 && (
        <div className="card" style={{ padding: '24px' }}>
          <span className="section-title-bar" style={{ marginBottom: '20px', display: 'flex' }}>{t.monthlyTrend}</span>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={report.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-text-secondary)" style={{ fontSize: '12px' }} />
              <YAxis stroke="var(--color-text-secondary)" style={{ fontSize: '12px' }} />
              <Tooltip formatter={formatCurrency} contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} dot={false} name={t.income} />
              <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2.5} dot={false} name={t.expense} />
              <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2.5} dot={false} name={t.netBalance} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category Breakdown */}
      <div className="card" style={{ padding: '24px' }}>
        <span className="section-title-bar" style={{ marginBottom: '20px', display: 'flex' }}>{t.categoryBreakdown}</span>
        {Object.keys(report.categories).length > 0 ? (
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
                {Object.entries(report.categories).map(([cat, d]) => (
                  <tr key={cat} style={{ borderBottom: '1px solid var(--color-table-row-border)', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-tr-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--color-text-primary)', fontSize: '13.5px' }}>{cat}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#10b981', fontWeight: '700', fontSize: '13.5px' }}>{formatCurrency(d.income)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#ef4444', fontWeight: '700', fontSize: '13.5px' }}>{formatCurrency(d.expense)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#6366f1', fontWeight: '700', fontSize: '13.5px' }}>{formatCurrency(d.income - d.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
            <div style={{ fontSize: '32px', opacity: 0.25, marginBottom: '10px' }}>📄</div>
            <p style={{ fontWeight: '500' }}>{t.noDataPeriod}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Reports;
