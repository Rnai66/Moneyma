import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { exportTransactionsToExcelBrowser, exportTransactionsToTextBrowser, exportTransactionsToCsvBrowser } from '../utils/dataTransfer';
import ExportCustomizerModal from '../components/ExportCustomizerModal';
import Statistics from './statistics';

const CAT_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
  '#06b6d4', '#a855f7', '#d946ef', '#0ea5e9',
];
function catColor(i) { return CAT_COLORS[i % CAT_COLORS.length]; }

function Reports({ transactions, darkMode, t }) {
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'ledger'
  const [reportType, setReportType] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().split('T')[0].substring(0, 7));
  const [selectedQuarter, setSelectedQuarter] = useState('Q1');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedCat, setExpandedCat] = useState(null);
  const [showTxTable, setShowTxTable] = useState(false);
  const [txTableSort, setTxTableSort] = useState({ field: 'date', dir: 'desc' });
  const [exportFormat, setExportFormat] = useState('excel');
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const fmt = (v) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(v);
  const fmtShort = (v) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(v);

  const tooltipStyle = darkMode
    ? { backgroundColor: '#131f3a', border: '1px solid #2a3a5f', borderRadius: '12px', color: '#f1f5f9', fontSize: '13px' }
    : { backgroundColor: '#fff', border: '1px solid #ece0e6', borderRadius: '12px', fontSize: '13px' };

  const axisStyle = { fontSize: '12px' };

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
    const qm = { Q1: ['01', '02', '03'], Q2: ['04', '05', '06'], Q3: ['07', '08', '09'], Q4: ['10', '11', '12'] };
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
    const list = Array.from(s).sort().reverse();
    return list.length ? list : [selectedMonth];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

  const availableYears = useMemo(() => {
    const s = new Set();
    transactions?.forEach(tx => { const y = String(tx?.date || '').substring(0, 4); if (y) s.add(y); });
    const list = Array.from(s).sort().reverse().map(Number);
    return list.length ? list : [new Date().getFullYear()];
  }, [transactions]);

  const sortedCats = useMemo(
    () => Object.entries(report.categories).sort((a, b) => b[1].expense - a[1].expense),
    [report.categories]
  );

  const totalExpenseCats = sortedCats.reduce((s, [, d]) => s + d.expense, 0);

  const barData = sortedCats.slice(0, 8).map(([cat, d]) => ({
    name: cat.length > 10 ? cat.slice(0, 10) + '…' : cat,
    expense: d.expense,
    income: d.income,
  }));

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

  const sortLabel = (field) => {
    const labels = {
      date: t.thDate || 'วันที่',
      type: t.thType || 'ประเภท',
      category: t.thCategory || 'หมวดหมู่',
      description: t.thDescription || 'รายการ/คำอธิบาย',
      amount: t.thAmount || 'จำนวนเงิน',
    };
    const arrow = txTableSort.field === field ? (txTableSort.dir === 'asc' ? ' \u2191\uFE0E' : ' \u2193\uFE0E') : '';
    return labels[field] + arrow;
  };

  const onSort = (field) => () =>
    setTxTableSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' }));

  const quarters = [
    { value: 'Q1', label: t.q1 }, { value: 'Q2', label: t.q2 },
    { value: 'Q3', label: t.q3 }, { value: 'Q4', label: t.q4 },
  ];

  const summaryCards = [
    { key: 'income', label: t.totalIncome, value: report.income, color: 'var(--color-success)', icon: '↑' },
    { key: 'expense', label: t.totalExpense, value: report.expense, color: 'var(--color-danger)', icon: '↓' },
    { key: 'balance', label: t.netBalance, value: report.balance, color: report.balance >= 0 ? 'var(--accent-primary)' : 'var(--color-danger)', icon: '≡' },
    { key: 'count', label: t.txCount || 'จำนวนรายการ', value: report.transactions?.length || 0, color: 'var(--color-warning)', icon: '#', isCount: true },
  ];

  const handleExport = async () => {
    try {
      setExportLoading(true);
      const txns = report.transactions;
      const periodLabel = reportType === 'monthly' ? selectedMonth : `${selectedQuarter} ${selectedYear}`;
      let r;
      if (exportFormat === 'excel') r = await exportTransactionsToExcelBrowser(txns);
      else if (exportFormat === 'csv') r = await exportTransactionsToCsvBrowser(txns);
      else r = await exportTransactionsToTextBrowser(txns, periodLabel);

      if (r?.success) alert(`✅ ${t.exportSuccess || 'ส่งออกข้อมูลสำเร็จ'} ${r.filename || ''}`);
      else if (r?.message) alert(`⚠️ ${r.message}`);
    } catch (e) {
      console.error(e);
      alert(`❌ ${t.exportFailed || 'เกิดข้อผิดพลาดในการส่งออกข้อมูล'}`);
    } finally {
      setExportLoading(false);
    }
  };

  const TypeBadge = ({ type }) => (
    <span className={`type-badge ${type}`}>
      {type === 'income' ? `↑ ${t.income || 'รายรับ'}` : `↓ ${t.expense || 'รายจ่าย'}`}
    </span>
  );

  return (
    <div className="page page--wide">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t.reportsSubtitle}</span>
          <h1>📊 {t.reportsTitle}</h1>
          <p>{t.reportsDesc}</p>
        </div>

        <div className="page-heading-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn" style={{ background: 'var(--accent-primary)', color: '#fff' }} onClick={() => setShowExportModal(true)}>
            {t.customizeStatementBtn}
          </button>
          <div className="input-group">
            <select value={exportFormat} onChange={e => setExportFormat(e.target.value)} aria-label="Export format">
              <option value="excel">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
              <option value="text">Text (.txt)</option>
            </select>
            <button className="btn" disabled={exportLoading} onClick={handleExport}>
              {exportLoading ? '⏳' : t.exportBtn}
            </button>
          </div>
        </div>
      </header>

      {/* Sub-tab switcher: Analytics vs Financial Statement */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'var(--bg-card)', padding: '6px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('overview')}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            background: activeSubTab === 'overview' ? 'var(--accent-gradient)' : 'transparent',
            color: activeSubTab === 'overview' ? '#fff' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            boxShadow: activeSubTab === 'overview' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          📈 {t.subtabAnalytics}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('ledger')}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            background: activeSubTab === 'ledger' ? 'var(--accent-gradient)' : 'transparent',
            color: activeSubTab === 'ledger' ? '#fff' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            boxShadow: activeSubTab === 'ledger' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          📑 {t.subtabFinancials}
        </button>
      </div>

      {activeSubTab === 'overview' ? (
        <Statistics transactions={transactions} darkMode={darkMode} t={t} />
      ) : (
        <>
          <ExportCustomizerModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            transactions={report.transactions || transactions}
            t={t}
          />

      {/* controls */}
      <section className="panel card--tight">
        <div className="cluster">
          <div className="segmented">
            {[{ val: 'monthly', label: t.monthly }, { val: 'quarterly', label: t.quarterly }].map(({ val, label }) => (
              <button
                key={val}
                type="button"
                className={reportType === val ? 'is-active' : ''}
                onClick={() => setReportType(val)}
              >
                {label}
              </button>
            ))}
          </div>

          {reportType === 'monthly' && (
            <div className="field" style={{ minWidth: '180px' }}>
              <label>{t.labelMonth}</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {reportType === 'quarterly' && (
            <>
              <div className="field" style={{ minWidth: '160px' }}>
                <label>{t.labelQuarter}</label>
                <select value={selectedQuarter} onChange={e => setSelectedQuarter(e.target.value)}>
                  {quarters.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ minWidth: '140px' }}>
                <label>{t.labelYear}</label>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                  {availableYears.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
      </section>

      {/* summary */}
      <section className="grid grid-auto-sm">
        {summaryCards.map(({ key, label, value, color, icon, isCount }) => (
          <article key={key} className="card card--tight" style={{ borderLeft: `4px solid ${color}` }}>
            <div className="stat-card-head">
              <span className="card-title">{label}</span>
              <span className="stat-icon" style={{ background: 'var(--bg-subtle)', color }}>{icon}</span>
            </div>
            <div className="card-value num" style={{ color, fontSize: 'var(--text-xl)' }}>
              {isCount ? value : fmtShort(value)}
            </div>
          </article>
        ))}
      </section>

      {reportType === 'quarterly' && report.monthlyData?.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <span className="section-title-bar">{t.monthlyTrend}</span>
          </div>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={report.monthlyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-text-muted)" style={axisStyle} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-muted)" style={axisStyle} tickLine={false} axisLine={false} width={64} tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={fmt} contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }} />
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} dot={false} name={t.income} />
                <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2.5} dot={false} name={t.expense} />
                <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2.5} dot={false} name={t.netBalance} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {barData.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="section-title-bar">{t.expenseVsIncome || 'รายได้เทียบรายจ่ายตามหมวดหมู่'}</span>
              <p className="panel-subtitle">Top {barData.length}</p>
            </div>
          </div>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--color-text-muted)" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-muted)" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} width={64} tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={fmt} contentStyle={tooltipStyle} cursor={{ fill: 'var(--bg-subtle)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }} />
                <Bar dataKey="expense" name={t.expense || 'รายจ่าย'} fill="#ef4444" radius={[6, 6, 0, 0]} />
                <Bar dataKey="income" name={t.income || 'รายรับ'} fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* category breakdown */}
      <section className="panel">
        <div className="panel-header">
          <span className="section-title-bar">{t.categoryBreakdown || 'รายละเอียดตามหมวดหมู่'}</span>
          <span className="mini-badge">{t.clickRowDetails || 'คลิกแถวเพื่อดูรายละเอียดเพิ่มเติม'}</span>
        </div>

        {sortedCats.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>{t.thCategory || 'หมวดหมู่'}</th>
                  <th className="is-num">{t.thIncome || 'รายรับ'}</th>
                  <th className="is-num">{t.thExpense || 'รายจ่าย'}</th>
                  <th className="is-num">{t.thNet || 'สุทธิ'}</th>
                  <th className="is-num" style={{ width: '128px' }}>{t.thPctExpense || '% สัดส่วนรายจ่าย'}</th>
                  <th className="is-num" style={{ width: '110px' }}>{t.txCount || 'จำนวนรายการ'}</th>
                </tr>
              </thead>
              <tbody>
                {sortedCats.map(([cat, d], idx) => {
                  const color = catColor(idx);
                  const pct = totalExpenseCats > 0 ? (d.expense / totalExpenseCats) * 100 : 0;
                  const isExpanded = expandedCat === cat;

                  return (
                    <React.Fragment key={cat}>
                      <tr
                        onClick={() => setExpandedCat(isExpanded ? null : cat)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className="cluster" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
                            <span className="stats-legend-dot" style={{ background: color, borderRadius: '50%' }} />
                            <span style={{ fontWeight: 650, color: 'var(--color-text-primary)' }}>{cat}</span>
                            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                          </div>
                          <div className="progress" style={{ marginTop: 'var(--space-2)', height: '5px' }}>
                            <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </td>
                        <td data-label={t.thIncome || 'รายรับ'} className="is-num num" style={{ color: 'var(--color-success)', fontWeight: 700 }}>{fmtShort(d.income)}</td>
                        <td data-label={t.thExpense || 'รายจ่าย'} className="is-num num" style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{fmtShort(d.expense)}</td>
                        <td data-label={t.thNet || 'สุทธิ'} className="is-num num" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{fmtShort(d.income - d.expense)}</td>
                        <td data-label={t.thPctExpense || '% สัดส่วนรายจ่าย'} className="is-num">
                          <span className="tag" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                            {pct.toFixed(1)}%
                          </span>
                        </td>
                        <td data-label={t.txCount || 'จำนวนรายการ'} className="is-num num" style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                          {d.txns.length} {t.items || 'รายการ'}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="is-editing">
                          <td className="stack-full" colSpan={6} style={{ padding: 0 }}>
                            <table className="subtable data-table--stack">
                              <thead>
                                <tr>
                                  <th style={{ width: '132px' }}>{t.thDate || 'วันที่'}</th>
                                  <th style={{ width: '128px' }}>{t.thType || 'ประเภท'}</th>
                                  <th>{t.thDescription || 'รายการ / คำอธิบาย'}</th>
                                  <th className="is-num" style={{ width: '160px' }}>{t.thAmount || 'จำนวนเงิน'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...d.txns].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(tx => (
                                  <tr key={tx.id}>
                                    <td className="num" style={{ color: 'var(--color-text-secondary)' }}>{tx.date}</td>
                                    <td data-label={t.thType || 'ประเภท'}><TypeBadge type={tx.type} /></td>
                                    <td data-label={t.thDescription || 'รายการ / คำอธิบาย'} className="is-truncate">{tx.description || tx.note || '—'}</td>
                                    <td
                                      data-label={t.thAmount || 'จำนวนเงิน'}
                                      className="is-num num"
                                      style={{ fontWeight: 700, color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)' }}
                                    >
                                      {tx.type === 'income' ? '+' : '−'} {fmt(Number(tx.amount) || 0)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td colSpan={3}>{t.total || 'รวมสุทธิ'} · {cat}</td>
                                  <td data-label={t.thAmount || 'จำนวนเงิน'} className="is-num num" style={{ color }}>{fmtShort(d.income - d.expense)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t.grandTotal || 'ยอดรวมทั้งสิ้น'}</td>
                  <td data-label={t.thIncome || 'รายรับ'} className="is-num num" style={{ color: 'var(--color-success)' }}>{fmtShort(report.income)}</td>
                  <td data-label={t.thExpense || 'รายจ่าย'} className="is-num num" style={{ color: 'var(--color-danger)' }}>{fmtShort(report.expense)}</td>
                  <td data-label={t.thNet || 'สุทธิ'} className="is-num num" style={{ color: report.balance >= 0 ? 'var(--accent-primary)' : 'var(--color-danger)' }}>{fmtShort(report.balance)}</td>
                  <td data-label={t.thPctExpense || '% สัดส่วนรายจ่าย'} className="is-num">100%</td>
                  <td data-label={t.txCount || 'จำนวนรายการ'} className="is-num num" style={{ color: 'var(--color-text-secondary)' }}>{report.transactions?.length} {t.items || 'รายการ'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
            <strong>{t.noDataPeriod || 'ไม่มีข้อมูลสำหรับช่วงเวลานี้'}</strong>
          </div>
        )}
      </section>

      {/* full transaction table */}
      <section className="panel">
        <div className="panel-header" style={{ marginBottom: 'var(--space-4)' }}>
          <div>
            <span className="section-title-bar">{t.allTransactionsThisPeriod || 'รายการธุรกรรมทั้งหมดในงวดนี้'}</span>
            <p className="panel-subtitle">{report.transactions?.length || 0} {t.items || 'รายการ'}</p>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowTxTable(v => !v)}>
            {showTxTable ? `▲ ${t.hideTable || 'ซ่อนตาราง'}` : `▼ ${t.showTable || 'แสดงตารางธุรกรรมทั้งหมด'}`}
          </button>
        </div>

        {showTxTable && (
          <div className="table-wrap">
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th className="is-sortable" style={{ width: '132px' }} onClick={onSort('date')}>{sortLabel('date')}</th>
                  <th className="is-sortable" style={{ width: '128px' }} onClick={onSort('type')}>{sortLabel('type')}</th>
                  <th className="is-sortable" style={{ width: '20%' }} onClick={onSort('category')}>{sortLabel('category')}</th>
                  <th className="is-sortable" onClick={onSort('description')}>{sortLabel('description')}</th>
                  <th className="is-sortable is-num" style={{ width: '160px' }} onClick={onSort('amount')}>{sortLabel('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedTxns.length === 0 ? (
                  <tr>
                    <td className="stack-full" colSpan={5}>
                      <div className="empty-state">
                        <div className="empty-state-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
                        <strong>{t.noDataPeriod || 'No data for this period'}</strong>
                      </div>
                    </td>
                  </tr>
                ) : sortedTxns.map((tx, i) => (
                  <tr key={tx.id || i}>
                    <td className="num" style={{ color: 'var(--color-text-secondary)' }}>{tx.date}</td>
                    <td data-label={t.thType || 'Type'}><TypeBadge type={tx.type} /></td>
                    <td data-label={t.thCategory || 'Category'}>
                      <div className="cluster" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
                        <span
                          className="stats-legend-dot"
                          style={{ background: catColor(sortedCats.findIndex(([c]) => c === tx.category)), borderRadius: '50%' }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.category}</span>
                      </div>
                    </td>
                    <td data-label={t.thDescription || 'Description'} className="is-truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {tx.description || tx.note || '—'}
                    </td>
                    <td
                      data-label={t.thAmount || 'Amount'}
                      className="is-num num"
                      style={{ fontWeight: 700, color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)' }}
                    >
                      {tx.type === 'income' ? '+' : '−'} {fmt(Number(tx.amount) || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {sortedTxns.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={4}>{t.total || 'Total'} {sortedTxns.length} {t.items || 'items'}</td>
                    <td data-label={t.thAmount || 'Amount'} className="is-num num" style={{ color: report.balance >= 0 ? 'var(--accent-primary)' : 'var(--color-danger)' }}>
                      {fmt(report.balance)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}

export default Reports;
