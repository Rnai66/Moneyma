import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { exportTransactionsToExcelBrowser, exportTransactionsToTextBrowser, exportTransactionsToCsvBrowser } from '../utils/dataTransfer';

// ── Category color palette ──────────────────────────────────────────────────
const CAT_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',
  '#06b6d4','#a855f7','#d946ef','#0ea5e9',
];
function catColor(i) { return CAT_COLORS[i % CAT_COLORS.length]; }

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ height: '6px', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
    </div>
  );
}

function Reports({ transactions, darkMode, t }) {
  const [reportType, setReportType] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().split('T')[0].substring(0, 7));
  const [selectedQuarter, setSelectedQuarter] = useState('Q1');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedCat, setExpandedCat] = useState(null);
  const [showTxTable, setShowTxTable] = useState(false);
  const [txTableSort, setTxTableSort] = useState({ field: 'date', dir: 'desc' });
  const [exportFormat, setExportFormat] = useState('excel');
  const [exportLoading, setExportLoading] = useState(false);

  const fmt = (v) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(v);
  const fmtShort = (v) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(v);

  const tooltipStyle = darkMode
    ? { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', color: '#f1f5f9', fontSize: '13px' }
    : { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px' };

  const selectStyle = {
    padding: '8px 14px', border: '1.5px solid var(--color-border)', borderRadius: '8px',
    fontSize: '13.5px', fontFamily: 'inherit', background: 'var(--bg-input)',
    color: 'var(--color-text-primary)', outline: 'none', cursor: 'pointer',
  };

  // ── Data calculation ────────────────────────────────────────────────────────
  const calcMonthly = () => {
    const [year, month] = selectedMonth.split('-');
    const txns = transactions?.filter(tx => String(tx?.date || '').startsWith(`${year}-${month}`)) || [];
    let income = 0, expense = 0;
    const cats = {};
    txns.forEach(tx => {
      if (tx.type === 'income') income += Number(tx.amount) || 0;
      else expense += Number(tx.amount) || 0;
      if (!cats[tx.category]) cats[tx.category] = { income: 0, expense: 0, txns: [] };
      cats[tx.category][tx.type] += Number(tx.amount) || 0;
      cats[tx.category].txns.push(tx);
    });
    return { income, expense, balance: income - expense, categories: cats, transactions: txns, monthlyData: null };
  };

  const calcQuarterly = () => {
    const qm = { Q1: ['01','02','03'], Q2: ['04','05','06'], Q3: ['07','08','09'], Q4: ['10','11','12'] };
    const months = qm[selectedQuarter];
    const txns = transactions?.filter(tx => {
      const d = String(tx?.date || '');
      return months.includes(d.substring(5, 7)) && d.substring(0, 4) === selectedYear.toString();
    }) || [];
    let income = 0, expense = 0;
    const mdMap = {}, cats = {};
    txns.forEach(tx => {
      const mk = String(tx?.date || '').substring(0, 7);
      if (!mdMap[mk]) mdMap[mk] = { month: mk, income: 0, expense: 0, balance: 0 };
      if (tx.type === 'income') { income += Number(tx.amount) || 0; mdMap[mk].income += Number(tx.amount) || 0; }
      else { expense += Number(tx.amount) || 0; mdMap[mk].expense += Number(tx.amount) || 0; }
      mdMap[mk].balance = mdMap[mk].income - mdMap[mk].expense;
      if (!cats[tx.category]) cats[tx.category] = { income: 0, expense: 0, txns: [] };
      cats[tx.category][tx.type] += Number(tx.amount) || 0;
      cats[tx.category].txns.push(tx);
    });
    return {
      income, expense, balance: income - expense,
      monthlyData: Object.values(mdMap).sort((a, b) => a.month.localeCompare(b.month)),
      categories: cats, transactions: txns,
    };
  };

  const report = useMemo(
    () => reportType === 'monthly' ? calcMonthly() : calcQuarterly(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportType, selectedMonth, selectedQuarter, selectedYear, transactions]
  );

  const availableMonths = useMemo(() => {
    const s = new Set();
    transactions?.forEach(tx => { const m = String(tx?.date || '').substring(0, 7); if (m) s.add(m); });
    return Array.from(s).sort().reverse();
  }, [transactions]);

  const availableYears = useMemo(() => {
    const s = new Set();
    transactions?.forEach(tx => { const y = String(tx?.date || '').substring(0, 4); if (y) s.add(y); });
    return Array.from(s).sort().reverse().map(Number);
  }, [transactions]);

  // sorted categories by expense desc
  const sortedCats = useMemo(() =>
    Object.entries(report.categories).sort((a, b) => b[1].expense - a[1].expense),
    [report.categories]
  );

  const totalExpenseCats = sortedCats.reduce((s, [, d]) => s + d.expense, 0);

  // bar chart data (top 8 by expense)
  const barData = sortedCats.slice(0, 8).map(([cat, d]) => ({
    name: cat.length > 10 ? cat.slice(0, 10) + '…' : cat,
    expense: d.expense,
    income: d.income,
  }));

  // sorted transaction table
  const sortedTxns = useMemo(() => {
    const arr = [...(report.transactions || [])];
    const { field, dir } = txTableSort;
    arr.sort((a, b) => {
      const av = a[field] ?? ''; const bv = b[field] ?? '';
      if (typeof av === 'number') return dir === 'asc' ? av - bv : bv - av;
      return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [report.transactions, txTableSort]);

  const thSort = (field) => ({
    onClick: () => setTxTableSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' })),
    style: { cursor: 'pointer', userSelect: 'none' },
    children: (
      <>
        {field === 'date' ? (t.thDate || 'Date') : field === 'type' ? (t.thType || 'Type') : field === 'category' ? (t.thCategory || 'Category') : field === 'description' ? (t.thDescription || 'Description') : (t.thAmount || 'Amount')}
        {txTableSort.field === field ? (txTableSort.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </>
    ),
  });

  const quarters = [
    { value: 'Q1', label: t.q1 }, { value: 'Q2', label: t.q2 },
    { value: 'Q3', label: t.q3 }, { value: 'Q4', label: t.q4 },
  ];

  const summaryCards = [
    { label: t.totalIncome, value: report.income, color: '#10b981', icon: '↑' },
    { label: t.totalExpense, value: report.expense, color: '#ef4444', icon: '↓' },
    { label: t.netBalance, value: report.balance, color: report.balance >= 0 ? '#6366f1' : '#ef4444', icon: '≡' },
    { label: t.txCount || 'Transaction count', value: report.transactions?.length || 0, color: '#f59e0b', icon: '#', isCount: true },
  ];

  const thStyle = {
    padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '11.5px',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)', borderBottom: '2px solid var(--color-border)',
    background: 'var(--bg-card-inner)', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--color-text-primary)', letterSpacing: '-0.03em', margin: 0 }}>{t.reportsTitle}</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>{t.reportsSubtitle}</p>
        </div>
        {/* ── Export dropdown ── */}
        <div style={{ display: 'flex', gap: '0', border: '1.5px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden' }}>
          <select
            value={exportFormat}
            onChange={e => setExportFormat(e.target.value)}
            style={{
              padding: '9px 12px', border: 'none', borderRight: '1.5px solid var(--color-border)',
              background: 'var(--bg-input)', color: 'var(--color-text-primary)',
              fontFamily: 'inherit', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              outline: 'none', appearance: 'none', WebkitAppearance: 'none',
            }}
          >
            <option value="excel">📊 Excel (.xlsx)</option>
            <option value="csv">📄 CSV (.csv)</option>
            <option value="text">🗒️ Text (.txt)</option>
          </select>
          <button
            disabled={exportLoading}
            style={{
              padding: '9px 16px', border: 'none', cursor: exportLoading ? 'not-allowed' : 'pointer',
              background: 'var(--color-accent, #6366f1)', color: '#fff',
              fontFamily: 'inherit', fontSize: '13px', fontWeight: '700',
              opacity: exportLoading ? 0.6 : 1, transition: 'opacity 0.15s',
            }}
            onClick={async () => {
              try {
                setExportLoading(true);
                const txns = report.transactions;
                const periodLabel = reportType === 'monthly' ? selectedMonth : `${selectedQuarter} ${selectedYear}`;
                let r;
                if (exportFormat === 'excel') {
                  if (window.electronAPI) {
                    r = await window.electronAPI.exportToExcel(txns);
                    if (r.success) alert(`✅ Exported: ${r.path.split('/').pop()}`);
                    return;
                  }
                  r = await exportTransactionsToExcelBrowser(txns);
                } else if (exportFormat === 'csv') {
                  r = await exportTransactionsToCsvBrowser(txns);
                } else {
                  r = await exportTransactionsToTextBrowser(txns, periodLabel);
                }
                if (r?.success) alert(`✅ ${t.exportSuccess || 'Exported'} ${r.filename || ''} `);
                else if (r?.message) alert(`⚠️ ${r.message}`);
              } catch (e) {
                console.error(e);
                alert(`❌ ${t.exportFailed || 'Export failed'}`);
              } finally {
                setExportLoading(false);
              }
            }}
          >
            {exportLoading ? '⏳...' : '↓ Export'}
          </button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-card-inner)', borderRadius: '10px', padding: '4px', border: '1px solid var(--color-border)' }}>
            {[{ val: 'monthly', label: t.monthly }, { val: 'quarterly', label: t.quarterly }].map(({ val, label }) => (
              <button key={val} onClick={() => setReportType(val)} style={{
                padding: '7px 18px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontSize: '13px', fontFamily: 'inherit', fontWeight: '600', transition: 'all .2s',
                background: reportType === val ? 'var(--accent-gradient)' : 'transparent',
                color: reportType === val ? 'white' : 'var(--color-text-secondary)',
                boxShadow: reportType === val ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
              }}>{label}</button>
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
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
        {summaryCards.map(({ label, value, color, icon, isCount }) => (
          <div key={label} className="card" style={{ padding: '18px 20px', borderLeft: `4px solid ${color}` }}>
            <div style={{ fontSize: '22px', marginBottom: '4px' }}>{icon}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: '500', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color, letterSpacing: '-0.02em' }}>
              {isCount ? value : fmtShort(value)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Quarterly Trend Chart ── */}
      {reportType === 'quarterly' && report.monthlyData?.length > 0 && (
        <div className="card" style={{ padding: '24px' }}>
          <span className="section-title-bar" style={{ marginBottom: '20px', display: 'flex' }}>{t.monthlyTrend}</span>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={report.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-text-secondary)" style={{ fontSize: '12px' }} />
              <YAxis stroke="var(--color-text-secondary)" style={{ fontSize: '12px' }} tickFormatter={v => `฿${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={fmt} contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} dot={false} name={t.income} />
              <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2.5} dot={false} name={t.expense} />
              <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2.5} dot={false} name={t.netBalance} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Category Bar Chart ── */}
      {barData.length > 0 && (
        <div className="card" style={{ padding: '24px' }}>
          <span className="section-title-bar" style={{ marginBottom: '20px', display: 'flex' }}>📊 {t.expenseVsIncome || 'Expense vs Income by Category'} (Top {barData.length})</span>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-text-secondary)" style={{ fontSize: '11px' }} />
              <YAxis stroke="var(--color-text-secondary)" style={{ fontSize: '11px' }} tickFormatter={v => `฿${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={fmt} contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="expense" name={t.expense || 'Expense'} fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="income" name={t.income || 'Income'} fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Category Breakdown with Progress + Expandable ── */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <span className="section-title-bar">{t.categoryBreakdown}</span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{t.clickRowDetails || 'Click row for details'}</span>
        </div>

        {sortedCats.length > 0 ? (
          <>
            {/* Summary Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[t.thCategory || 'Category', t.thIncome || 'Income', t.thExpense || 'Expense', t.thNet || 'Net', t.thPctExpense || '% of Expense', t.txCount || 'Count'].map((h, i) => (
                      <th key={h || i} style={{ ...thStyle, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCats.map(([cat, d], idx) => {
                    const color = catColor(idx);
                    const pct = totalExpenseCats > 0 ? (d.expense / totalExpenseCats) * 100 : 0;
                    const isExpanded = expandedCat === cat;
                    return (
                      <React.Fragment key={cat}>
                        {/* Category summary row */}
                        <tr
                          onClick={() => setExpandedCat(isExpanded ? null : cat)}
                          style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--color-border)', cursor: 'pointer', transition: 'background .15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-tr-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '12px 12px', fontWeight: '600', color: 'var(--color-text-primary)', minWidth: '140px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                              <span>{cat}</span>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginLeft: '2px' }}>
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            </div>
                            <ProgressBar value={d.expense} max={totalExpenseCats} color={color} />
                          </td>
                          <td style={{ padding: '12px 12px', textAlign: 'right', color: '#10b981', fontWeight: '700', whiteSpace: 'nowrap' }}>{fmtShort(d.income)}</td>
                          <td style={{ padding: '12px 12px', textAlign: 'right', color: '#ef4444', fontWeight: '700', whiteSpace: 'nowrap' }}>{fmtShort(d.expense)}</td>
                          <td style={{ padding: '12px 12px', textAlign: 'right', color: '#6366f1', fontWeight: '700', whiteSpace: 'nowrap' }}>{fmtShort(d.income - d.expense)}</td>
                          <td style={{ padding: '12px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span style={{
                              background: color + '22', color, fontWeight: '700', fontSize: '12px',
                              padding: '2px 8px', borderRadius: '20px', border: `1px solid ${color}44`,
                            }}>
                              {pct.toFixed(1)}%
                            </span>
                          </td>
                          <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--color-text-secondary)', fontWeight: '600' }}>
                            {d.txns.length} {t.items || 'items'}
                          </td>
                        </tr>

                        {/* Expanded: transaction detail rows */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} style={{ padding: '0', borderBottom: '1px solid var(--color-border)' }}>
                              <div style={{ background: 'var(--bg-card-inner)', padding: '0 8px 8px 8px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr>
                                      {[t.thDate || 'Date', t.thType || 'Type', t.thDescription || 'Description', t.thAmount || 'Amount'].map((h, i) => (
                                        <th key={h || i} style={{ ...thStyle, fontSize: '11px', background: 'transparent', paddingTop: '8px' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...d.txns].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(tx => (
                                      <tr key={tx.id}
                                        style={{ borderBottom: '1px solid var(--color-border)', fontSize: '12.5px' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-tr-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                      >
                                        <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{tx.date}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                          <span style={{
                                            fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '12px',
                                            background: tx.type === 'income' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
                                            color: tx.type === 'income' ? '#10b981' : '#ef4444',
                                          }}>
                                            {tx.type === 'income' ? ('↑ ' + (t.income || 'Income')) : ('↓ ' + (t.expense || 'Expense'))}
                                          </span>
                                        </td>
                                        <td style={{ padding: '8px 12px', color: 'var(--color-text-primary)' }}>{tx.description || tx.note || '—'}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700', color: tx.type === 'income' ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>
                                          {tx.type === 'income' ? '+' : '−'} {fmt(Number(tx.amount) || 0)}
                                        </td>
                                      </tr>
                                    ))}
                                    {/* Category subtotal */}
                                    <tr style={{ background: 'var(--bg-card-inner)', fontWeight: '700', borderTop: '2px solid var(--color-border)' }}>
                                      <td colSpan={3} style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{t.total || 'Total'} {cat}</td>
                                      <td style={{ padding: '8px 12px', textAlign: 'right', color, whiteSpace: 'nowrap' }}>
                                        {fmtShort(d.income - d.expense)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Grand total row */}
                  <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--bg-card-inner)', fontWeight: '800' }}>
                    <td style={{ padding: '12px 12px', color: 'var(--color-text-primary)' }}>{t.grandTotal || 'Grand Total'}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: '#10b981', whiteSpace: 'nowrap' }}>{fmtShort(report.income)}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: '#ef4444', whiteSpace: 'nowrap' }}>{fmtShort(report.expense)}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: report.balance >= 0 ? '#6366f1' : '#ef4444', whiteSpace: 'nowrap' }}>{fmtShort(report.balance)}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right' }}>100%</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{report.transactions?.length} {t.items || 'items'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
            <div style={{ fontSize: '32px', opacity: 0.25, marginBottom: '10px' }}>📄</div>
            <p style={{ fontWeight: '500' }}>{t.noDataPeriod}</p>
          </div>
        )}
      </div>

      {/* ── Full Transaction Detail Table ── */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <span className="section-title-bar">📋 {t.allTransactionsThisPeriod || 'All transactions in this period'} ({report.transactions?.length || 0} {t.items || 'items'})</span>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '13px', padding: '6px 14px' }}
            onClick={() => setShowTxTable(v => !v)}
          >
            {showTxTable ? ('▲ ' + (t.hideTable || 'Hide Table')) : ('▼ ' + (t.showTable || 'Show Table'))}
          </button>
        </div>

        {showTxTable && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }} {...thSort('date')} />
                  <th style={{ ...thStyle, textAlign: 'left' }} {...thSort('type')} />
                  <th style={{ ...thStyle, textAlign: 'left' }} {...thSort('category')} />
                  <th style={{ ...thStyle, textAlign: 'left' }} {...thSort('description')} />
                  <th style={{ ...thStyle, textAlign: 'right' }} {...thSort('amount')} />
                </tr>
              </thead>
              <tbody>
                {sortedTxns.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>{t.noDataPeriod || 'No data for this period'}</td></tr>
                ) : sortedTxns.map((tx, i) => (
                  <tr key={tx.id || i}
                    style={{ borderBottom: '1px solid var(--color-border)', transition: 'background .12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-tr-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{tx.date}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px',
                        background: tx.type === 'income' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
                        color: tx.type === 'income' ? '#10b981' : '#ef4444',
                      }}>
                        {tx.type === 'income' ? ('↑ ' + (t.income || 'Income')) : ('↓ ' + (t.expense || 'Expense'))}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: catColor(sortedCats.findIndex(([c]) => c === tx.category)), flexShrink: 0 }} />
                        {tx.category}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.description || tx.note || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', whiteSpace: 'nowrap', color: tx.type === 'income' ? '#10b981' : '#ef4444' }}>
                      {tx.type === 'income' ? '+' : '−'} {fmt(Number(tx.amount) || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {sortedTxns.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--bg-card-inner)', fontWeight: '800' }}>
                    <td colSpan={4} style={{ padding: '10px 12px', color: 'var(--color-text-secondary)' }}>{t.total || 'Total'} {sortedTxns.length} {t.items || 'items'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: report.balance >= 0 ? '#6366f1' : '#ef4444', whiteSpace: 'nowrap' }}>
                      {fmt(report.balance)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Reports;
