import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import SupabaseService from '../services/SupabaseService';
import { useAuth } from '../services/AuthContext';
import ScanSlip from '../components/ScanSlip';
import ScanBill from '../components/ScanBill';
import { useSubscription } from '../SubscriptionContext/SubscriptionContext';
import UpgradeModal from '../components/UpgradeModal';
import { Capacitor } from '@capacitor/core';
import { NATIVE_BILLING_READY } from '../config/billing';
import { PLANS } from '../SubscriptionContext/SubscriptionService';

/** See App.js — no purchase CTAs on native until Play Billing is live. */
const CAN_SELL = !Capacitor.isNativePlatform() || NATIVE_BILLING_READY;

const WEB_TRANSACTIONS_KEY = 'webTransactions';
// อ่านจาก PLANS เสมอ — เคย hardcode 50 ไว้ตรงนี้ ทำให้แก้ config แล้วพฤติกรรมไม่เปลี่ยน
const FREE_MONTHLY_LIMIT = PLANS.free.limits.transactions_per_month;

function readWebTransactions() {
  try {
    return JSON.parse(localStorage.getItem(WEB_TRANSACTIONS_KEY) || '[]');
  } catch (error) {
    console.error('Error reading local transactions:', error);
    return [];
  }
}

function writeWebTransactions(items) {
  localStorage.setItem(WEB_TRANSACTIONS_KEY, JSON.stringify(items));
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function Transactions({ transactions, onRefresh, t, storageMode }) {
  const { user } = useAuth();
  const { plan } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showScanSlip, setShowScanSlip] = useState(false);
  const [showScanBill, setShowScanBill] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [viewMode, setViewMode] = useState('cards');
  const [inlineEdit, setInlineEdit] = useState(null);
  const [formData, setFormData] = useState({
    type: 'expense', amount: '', category: '', description: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [filters, setFilters] = useState({ search: '', type: '', category: '', startDate: '', endDate: '' });

  const formatCurrency = (v) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(v);

  const filteredTransactions = useMemo(() =>
    transactions?.filter(tx => {
      if (filters.search &&
        !tx.category.toLowerCase().includes(filters.search.toLowerCase()) &&
        !tx.description?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.type && tx.type !== filters.type) return false;
      if (filters.category && tx.category !== filters.category) return false;
      if (filters.startDate && tx.date < filters.startDate) return false;
      if (filters.endDate && tx.date > filters.endDate) return false;
      return true;
    }) || [], [transactions, filters]);

  const categories = useMemo(() =>
    [...new Set(transactions?.map(tx => tx.category) || [])].sort(), [transactions]);

  const totals = useMemo(() => filteredTransactions.reduce((acc, tx) => {
    if (tx.type === 'income') acc.income += tx.amount;
    else acc.expense += tx.amount;
    return acc;
  }, { income: 0, expense: 0 }), [filteredTransactions]);

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const resetForm = () => {
    setFormData({ type: 'expense', amount: '', category: '', description: '', date: new Date().toISOString().split('T')[0] });
    setEditingId(null);
    setShowForm(false);
    document.body.style.overflow = '';
  };

  const handleOpenScanSlip = () => {
    setShowScanSlip(true);
    document.body.style.overflow = 'hidden';
  };

  const handleCloseScanSlip = () => {
    setShowScanSlip(false);
    document.body.style.overflow = '';
  };

  const handleOpenScanBill = () => {
    setShowScanBill(true);
    document.body.style.overflow = 'hidden';
  };

  const handleCloseScanBill = () => {
    setShowScanBill(false);
    document.body.style.overflow = '';
  };

  const setStatus = (type, text) => {
    setMessageType(type);
    setMessage(text);
  };

  const handleEdit = (tx) => {
    setFormData({ type: tx.type, amount: tx.amount.toString(), category: tx.category, description: tx.description || '', date: tx.date });
    setEditingId(tx.id);
    setShowForm(true);
    document.body.style.overflow = 'hidden';
  };

  const handleNewTransaction = () => {
    resetForm();
    setShowForm(true);
    document.body.style.overflow = 'hidden';
  };

  const handleScanTransactions = async (newTxs) => {
    try {
      setLoading(true);
      setMessage('');

      const itemsToSave = newTxs.map(tx => {
        const amt = parseFloat(tx.amount) || 0;
        if (!Number.isFinite(amt) || amt <= 0) {
          throw new Error(t.invalidAmount || 'Invalid amount');
        }
        const desc = tx.note || tx.description || '';
        return {
          type: tx.type || 'expense',
          amount: amt,
          category: tx.category || 'Other',
          description: desc,
          date: tx.date || new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        };
      });

      if (storageMode === 'cloud' && user) {
        for (const tx of itemsToSave) {
          await SupabaseService.addTransaction(user.id, { ...tx, id: generateUUID() });
        }
      } else {
        const items = readWebTransactions();
        const txsWithId = itemsToSave.map(tx => ({ ...tx, id: generateUUID() }));
        writeWebTransactions([...txsWithId, ...items]);
      }

      await onRefresh();
      setStatus('success', t.saveSuccess || 'Transactions saved');
    } catch (err) {
      console.error(err);
      setStatus('error', `${t.saveFailed || 'Save failed'}${err?.message ? `: ${err.message}` : ''}`);
    } finally {
      setLoading(false);
      handleCloseScanSlip();
      handleCloseScanBill();
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t.confirmDelete)) {
      try {
        setLoading(true);
        setMessage('');
        if (storageMode === 'cloud' && user) {
          await SupabaseService.deleteTransaction(user.id, id);
        } else {
          writeWebTransactions(readWebTransactions().filter(tx => tx.id !== id));
        }
        await onRefresh();
        setStatus('success', t.deleteSuccess);
      } catch (e) {
        console.error(e);
        setStatus('error', `${t.deleteFailed}${e?.message ? `: ${e.message}` : ''}`);
      } finally { setLoading(false); }
    }
  };

  const handleInlineSave = async (tx) => {
    if (!inlineEdit || inlineEdit.id !== tx.id) return;
    const updatedTx = { ...tx, [inlineEdit.field]: inlineEdit.value };
    try {
      setLoading(true);
      const data = { ...updatedTx, amount: parseFloat(updatedTx.amount), updated_at: new Date().toISOString() };
      if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error(t.invalidAmount);
      if (storageMode === 'cloud' && user) {
        await SupabaseService.updateTransaction(user.id, tx.id, data);
      } else {
        writeWebTransactions(readWebTransactions().map(r => r.id === tx.id ? { ...r, ...data } : r));
      }
      setInlineEdit(null);
      await onRefresh();
      setStatus('success', t.updateSuccess);
    } catch (err) {
      setStatus('error', `${t.saveFailed}: ${err?.message || ''}`);
    } finally { setLoading(false); }
  };

  const handleInlineChange = (id, field, value) => setInlineEdit({ id, field, value });
  const handleInlineKeyDown = (e, tx) => {
    if (e.key === 'Enter') handleInlineSave(tx);
    if (e.key === 'Escape') setInlineEdit(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage('');
      const data = { ...formData, amount: parseFloat(formData.amount), updated_at: new Date().toISOString() };
      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        throw new Error(t.invalidAmount);
      }

      if (plan === 'free' && !editingId) {
        const currentMonth = new Date().toISOString().substring(0, 7);
        const thisMonthTxns = transactions?.filter(tx => tx.date && tx.date.substring(0, 7) === currentMonth) || [];
        if (thisMonthTxns.length >= FREE_MONTHLY_LIMIT) {
          setShowUpgrade(true);
          setLoading(false);
          return;
        }
      }

      if (storageMode === 'cloud' && user) {
        if (editingId) { await SupabaseService.updateTransaction(user.id, editingId, data); }
        else { await SupabaseService.addTransaction(user.id, { ...data, id: generateUUID() }); }
      } else {
        const items = readWebTransactions();
        if (editingId) {
          writeWebTransactions(items.map(tx => tx.id === editingId ? { ...tx, ...data, id: editingId } : tx));
        } else {
          writeWebTransactions([{ ...data, id: generateUUID() }, ...items]);
        }
      }
      resetForm();
      await onRefresh();
      setStatus('success', editingId ? t.updateSuccess : t.saveSuccess);
    } catch (err) {
      console.error(err);
      setStatus('error', `${t.saveFailed}${err?.message ? `: ${err.message}` : ''}`);
    } finally { setLoading(false); }
  };

  const groupedTransactions = useMemo(() => filteredTransactions.reduce((acc, tx) => {
    const key = tx.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(tx);
    return acc;
  }, {}), [filteredTransactions]);

  const sortedGroupedTransactions = useMemo(
    () => Object.entries(groupedTransactions).sort((a, b) => b[0].localeCompare(a[0])),
    [groupedTransactions]
  );

  const thisMonthTxnsCount = useMemo(() => {
    const currentMonth = new Date().toISOString().substring(0, 7);
    return transactions?.filter(tx => tx.date && tx.date.substring(0, 7) === currentMonth).length || 0;
  }, [transactions]);

  const hasTxQuota = Number.isFinite(FREE_MONTHLY_LIMIT);
  const quotaPercent = hasTxQuota ? Math.min(100, (thisMonthTxnsCount / FREE_MONTHLY_LIMIT) * 100) : 0;
  const quotaTone = quotaPercent >= 100 ? 'is-danger' : quotaPercent >= 80 ? 'is-warning' : '';

  /* ── table view ─────────────────────────────────────────────── */
  const renderTableView = () => (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: '132px' }}>{t.thDate || 'Date'}</th>
            <th style={{ width: '128px' }}>{t.thType || 'Type'}</th>
            <th style={{ width: '20%' }}>{t.thCategory || 'Category'}</th>
            <th>{t.thDescription || 'Description'}</th>
            <th className="is-num" style={{ width: '150px' }}>{t.thAmount || 'Amount'}</th>
            <th className="is-center" style={{ width: '104px' }} />
          </tr>
        </thead>
        <tbody>
          {filteredTransactions.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <div className="empty-state">
                  <div className="empty-state-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
                  <strong>{t.noResults}</strong>
                </div>
              </td>
            </tr>
          ) : filteredTransactions.map(tx => {
            const isEditRow = inlineEdit?.id === tx.id;

            const inputCell = (field, type = 'text') => {
              const val = isEditRow && inlineEdit.field === field ? inlineEdit.value : tx[field] ?? '';
              const isActive = isEditRow && inlineEdit.field === field;
              return (
                <input
                  type={type}
                  value={val}
                  readOnly={!isEditRow}
                  className={`inline-cell ${isActive ? 'is-active' : ''}`}
                  onClick={() => !isEditRow && handleInlineChange(tx.id, field, tx[field] ?? '')}
                  onChange={e => handleInlineChange(tx.id, field, e.target.value)}
                  onKeyDown={e => handleInlineKeyDown(e, tx)}
                />
              );
            };

            return (
              <tr key={tx.id} className={isEditRow ? 'is-editing' : ''}>
                <td>{inputCell('date', 'date')}</td>
                <td>
                  {isEditRow && inlineEdit.field === 'type' ? (
                    <select
                      className="inline-cell is-active"
                      value={inlineEdit.value}
                      onChange={e => handleInlineChange(tx.id, 'type', e.target.value)}
                      onKeyDown={e => handleInlineKeyDown(e, tx)}
                    >
                      <option value="income">{t.income}</option>
                      <option value="expense">{t.expense}</option>
                    </select>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleInlineChange(tx.id, 'type', tx.type)}
                      className={`type-badge ${tx.type}`}
                      style={{ cursor: 'pointer', border: 'none' }}
                    >
                      {tx.type === 'income' ? `↑ ${t.income}` : `↓ ${t.expense}`}
                    </button>
                  )}
                </td>
                <td>{inputCell('category')}</td>
                <td className="is-truncate">{inputCell('description')}</td>
                <td
                  className="is-num num"
                  style={{ fontWeight: 700, color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)' }}
                >
                  {isEditRow && inlineEdit.field === 'amount' ? inputCell('amount', 'number') : (
                    <button
                      type="button"
                      className="cell-btn"
                      onClick={() => handleInlineChange(tx.id, 'amount', tx.amount)}
                    >
                      {tx.type === 'income' ? '+' : '−'} {formatCurrency(tx.amount)}
                    </button>
                  )}
                </td>
                <td className="is-center">
                  {isEditRow ? (
                    <div className="cluster" style={{ gap: 'var(--space-1)', justifyContent: 'center', flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm" disabled={loading} onClick={() => handleInlineSave(tx)}>✓</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setInlineEdit(null)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="cluster" style={{ gap: 'var(--space-1)', justifyContent: 'center', flexWrap: 'nowrap' }}>
                      <button title={t.edit} onClick={() => handleEdit(tx)} disabled={loading} className="icon-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button title={t.delete} onClick={() => handleDelete(tx.id)} disabled={loading} className="icon-btn danger" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {filteredTransactions.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={4}>{t.showingOf
                .replace('{shown}', filteredTransactions.length)
                .replace('{total}', transactions?.length || 0)}</td>
              <td className="is-num num" style={{ color: totals.income - totals.expense >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {formatCurrency(totals.income - totals.expense)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  return (
    <div className="transactions-container page--wide">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t.transactionsTitle}</span>
          <h1>{t.transactionsTitle}</h1>
          <p>{t.totalRecords.replace('{n}', transactions?.length || 0)}</p>
        </div>
      </header>

      {/* action bar: primary action left, scan tiles centre, view switch right */}
      <section className="toolbar">
        <button className="btn btn-primary-lg" onClick={handleNewTransaction} disabled={loading}>
          <span className="btn-plus">+</span>
          {t.newTransaction}
        </button>

        <span className="toolbar-divider" aria-hidden="true" />

        <div className="scan-actions">
          <button className="action-tile action-tile--slip" onClick={handleOpenScanSlip} disabled={loading}>
            <span className="action-tile-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </span>
            <span className="action-tile-copy">
              <strong>{t.scanSlip || 'Scan Slip'}</strong>
              <small>{t.scanSlipCardDesc}</small>
            </span>
          </button>

          <button className="action-tile action-tile--bill" onClick={handleOpenScanBill} disabled={loading}>
            <span className="action-tile-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></svg>
            </span>
            <span className="action-tile-copy">
              <strong>{t.scanBill || 'Scan Bill'}</strong>
              <small>{t.scanBillCardDesc}</small>
            </span>
          </button>
        </div>

        <div className="toolbar-end">
          <div className="view-switch" role="group" aria-label={t.viewCards + ' / ' + t.viewTable}>
            <button
              type="button"
              aria-pressed={viewMode === 'cards'}
              className={viewMode === 'cards' ? 'is-active' : ''}
              onClick={() => setViewMode('cards')}
              title={t.viewCards || 'Cards'}
            >
              <span className="view-switch-icon" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/></svg>
              </span>
              <span className="view-switch-label">{t.viewCards || 'Cards'}</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'table'}
              className={viewMode === 'table' ? 'is-active' : ''}
              onClick={() => { setViewMode('table'); setInlineEdit(null); }}
              title={t.viewTable || 'Table'}
            >
              <span className="view-switch-icon" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
              </span>
              <span className="view-switch-label">{t.viewTable || 'Table'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* แถบโควตารายการ — แสดงเฉพาะเมื่อยังมีเพดานจริง
          ตอนนี้ free ใช้ transactions_per_month: Infinity แถบนี้จึงถูกซ่อน
          (ไม่งั้นจะขึ้น "0 / Infinity")
          เพดานที่บังคับจริงของ free ตอนนี้คือจำนวนสแกน AI ซึ่งแสดงอยู่ในหน้า Settings */}
      {plan === 'free' && hasTxQuota && (
        <section className="quota-banner">
          <div className="quota-banner-copy">
            <span className="quota-banner-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </span>
            <div>
              <strong>{t.freeQuotaTitle}</strong>
              <p>
                {t.freeQuotaUsed.replace('{n}', thisMonthTxnsCount).replace('{max}', FREE_MONTHLY_LIMIT)}
              </p>
              <div className="progress" style={{ marginTop: 'var(--space-2)' }}>
                <div className={`progress-fill ${quotaTone}`} style={{ width: `${quotaPercent}%` }} />
              </div>
            </div>
          </div>
          {CAN_SELL && (
            <button className="btn btn-sm" onClick={() => setShowUpgrade(true)}>{t.upgradeToPro}</button>
          )}
        </section>
      )}

      <section className="metrics-strip">
        <div className="metric-tile income">
          <span>{t.totalIncome}</span>
          <strong className="num">{formatCurrency(totals.income)}</strong>
        </div>
        <div className="metric-tile expense">
          <span>{t.totalExpense}</span>
          <strong className="num">{formatCurrency(totals.expense)}</strong>
        </div>
        <div className="metric-tile">
          <span>{t.netBalance}</span>
          <strong
            className="num"
            style={{ color: totals.income - totals.expense >= 0 ? 'var(--accent-primary)' : 'var(--color-danger)' }}
          >
            {formatCurrency(totals.income - totals.expense)}
          </strong>
        </div>
        <div className="metric-tile">
          <span>{t.storageMode}</span>
          <strong style={{ fontSize: 'var(--text-md)' }}>{t.storageBrowser}</strong>
        </div>
      </section>

      {message && (
        <div className={`alert ${messageType === 'error' ? 'alert-danger' : 'alert-success'}`}>
          {message}
        </div>
      )}

      {showScanSlip && createPortal(
        <>
          <div className="sheet-backdrop" onClick={handleCloseScanSlip} />
          <div className="sheet scan-modal-sheet" role="dialog" aria-modal="true">
            <div className="sheet-handle" />
            <ScanSlip t={t} onClose={handleCloseScanSlip} onTransactionCreate={handleScanTransactions} />
          </div>
        </>,
        document.body
      )}

      {showScanBill && createPortal(
        <>
          <div className="sheet-backdrop" onClick={handleCloseScanBill} />
          <div className="sheet scan-modal-sheet" role="dialog" aria-modal="true">
            <div className="sheet-handle" />
            <ScanBill t={t} onTransactionCreate={handleScanTransactions} onClose={handleCloseScanBill} />
          </div>
        </>,
        document.body
      )}

      {showForm && createPortal(
        <>
          <div className="sheet-backdrop" onClick={resetForm} />
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>{editingId ? t.editTransaction : t.newTransaction}</h3>
              <button type="button" className="icon-btn" onClick={resetForm} aria-label={t.cancel} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form id="transaction-form" onSubmit={handleSubmit} className="stack-lg">
              <div className="filter-bar">
                <div className="field">
                  <label>{t.formType}</label>
                  <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} disabled={loading}>
                    <option value="income">{t.income}</option>
                    <option value="expense">{t.expense}</option>
                  </select>
                </div>
                <div className="field">
                  <label>{t.formAmount}</label>
                  <input type="number" step="0.01" placeholder="0.00" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} disabled={loading} required />
                </div>
                <div className="field">
                  <label>{t.formCategory}</label>
                  <input type="text" placeholder={t.formCategoryPlaceholder} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} disabled={loading} required />
                </div>
                <div className="field">
                  <label>{t.formDate}</label>
                  <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} disabled={loading} required />
                </div>
              </div>

              <div className="field">
                <label>{t.formDescription}</label>
                <input type="text" placeholder={t.formDescPlaceholder} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} disabled={loading} />
              </div>

              <div className="cluster" style={{ flexWrap: 'nowrap' }}>
                <button type="submit" className="btn btn-block" disabled={loading}>
                  {loading ? t.saving : editingId ? t.updateBtn : t.addTransactionBtn}
                </button>
                <button type="button" className="btn btn-ghost" onClick={resetForm} disabled={loading}>
                  {t.cancel}
                </button>
              </div>
            </form>
          </div>
        </>,
        document.body
      )}

      <section className="panel glass-card">
        <div className="panel-header" style={{ marginBottom: 'var(--space-4)' }}>
          <span className="section-title-bar">{t.filters}</span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setFilters({ search: '', type: '', category: '', startDate: '', endDate: '' })}
            disabled={!hasActiveFilters}
          >
            {t.reset}
          </button>
        </div>

        <div className="filter-bar">
          <div className="field">
            <label>{t.filterSearch}</label>
            <input type="search" placeholder={t.filterSearchPlaceholder} value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.filterType}</label>
            <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
              <option value="">{t.allTypes}</option>
              <option value="income">{t.income}</option>
              <option value="expense">{t.expense}</option>
            </select>
          </div>
          <div className="field">
            <label>{t.filterCategory}</label>
            <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}>
              <option value="">{t.allCategories}</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t.filterFrom}</label>
            <input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.filterTo}</label>
            <input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
          </div>
        </div>

        <p className="result-count">
          {t.showingOf.replace('{shown}', filteredTransactions.length).replace('{total}', transactions?.length || 0)}
        </p>
      </section>

      {viewMode === 'table' ? (
        <section className="panel card--flush">{renderTableView()}</section>
      ) : filteredTransactions.length > 0 ? (
        <section className="transactions-list">
          <div className="transaction-feed">
            {sortedGroupedTransactions.map(([date, items]) => (
              <div key={date} className="transaction-group">
                <div className="transaction-group-title">
                  <span>{date}</span>
                  <div />
                  <span className="num">{items.length}</span>
                </div>
                <div className="transaction-stack">
                  {items.map(tx => (
                    <article key={tx.id} className="transaction-card-row">
                      <div className="transaction-card-main">
                        <div
                          className="transaction-avatar"
                          style={{
                            background: tx.type === 'income' ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
                            color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)',
                          }}
                        >
                          {(tx.category || '?').charAt(0)}
                        </div>
                        <div className="transaction-card-copy">
                          <strong>{tx.category}</strong>
                          <span>{tx.description || '—'}</span>
                        </div>
                      </div>
                      <div className="transaction-card-side">
                        <span className={`type-badge ${tx.type}`}>
                          {tx.type === 'income' ? `↑ ${t.income}` : `↓ ${t.expense}`}
                        </span>
                        <strong className={`transaction-amount ${tx.type} num`}>
                          {tx.type === 'income' ? '+' : '−'} {formatCurrency(tx.amount)}
                        </strong>
                      </div>
                      <div className="transaction-card-actions">
                        <button title={t.edit} onClick={() => handleEdit(tx)} disabled={loading} className="icon-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button title={t.delete} onClick={() => handleDelete(tx.id)} disabled={loading} className="icon-btn danger" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="empty-state">
            <div className="empty-state-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
            <strong>{t.noResults}</strong>
            <p>{transactions?.length === 0 ? t.addFirstTransaction : t.noResultsHint}</p>
            {transactions?.length === 0 && (
              <button className="btn" style={{ marginTop: 'var(--space-3)' }} onClick={handleNewTransaction}>
                + {t.newTransaction}
              </button>
            )}
          </div>
        </section>
      )}

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        title={`⚠️ ${t.txLimitTitle}`}
        description={t.txLimitDesc}
        feature="unlimited_tx"
        t={t}
      />
    </div>
  );
}

export default Transactions;
