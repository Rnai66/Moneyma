import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import SupabaseService from '../services/SupabaseService';
import { useAuth } from '../services/AuthContext';
import ScanSlip from '../components/ScanSlip';
import ScanBill from '../components/ScanBill';


const WEB_TRANSACTIONS_KEY = 'webTransactions';
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
  const [showForm, setShowForm] = useState(false);
  const [showScanSlip, setShowScanSlip] = useState(false);
  const [showScanBill, setShowScanBill] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [inlineEdit, setInlineEdit] = useState(null); // { id, field, value }
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

  const resetForm = () => {
    setFormData({ type: 'expense', amount: '', category: '', description: '', date: new Date().toISOString().split('T')[0] });
    setEditingId(null);
    setShowForm(false);
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
    // Prevent body scroll when modal is open
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
        return {
          type: tx.type || 'expense',
          amount: amt,
          category: tx.category || 'Other',
          description: tx.note || tx.description || '',
          date: tx.date || new Date().toISOString().split('T')[0],
        };
      });

      if (storageMode === 'cloud' && user) {
        for (const tx of itemsToSave) {
          await SupabaseService.addTransaction(user.id, { ...tx, id: generateUUID() });
        }
      } else if (window.electronAPI) {
        for (const tx of itemsToSave) {
          await window.electronAPI.addTransaction(tx);
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
      setShowScanSlip(false);
      setShowScanBill(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t.confirmDelete)) {
      try {
        setLoading(true);
        setMessage('');
        if (storageMode === 'cloud' && user) {
          await SupabaseService.deleteTransaction(user.id, id);
        } else if (window.electronAPI) {
          await window.electronAPI.deleteTransaction(id);
        } else {
          writeWebTransactions(readWebTransactions().filter(tx => tx.id !== id));
        }
        await onRefresh();
        setStatus('success', t.deleteSuccess);
      }
      catch (e) {
        console.error(e);
        setStatus('error', `${t.deleteFailed}${e?.message ? `: ${e.message}` : ''}`);
      } finally { setLoading(false); }
    }
  };

  // ─── Inline cell save ─────────────────────────────────────────────────────
  const handleInlineSave = async (tx) => {
    if (!inlineEdit || inlineEdit.id !== tx.id) return;
    const updatedTx = { ...tx, [inlineEdit.field]: inlineEdit.value };
    // Reuse handleSubmit logic inline
    try {
      setLoading(true);
      const data = { ...updatedTx, amount: parseFloat(updatedTx.amount) };
      if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error(t.invalidAmount);
      if (storageMode === 'cloud' && user) {
        await SupabaseService.updateTransaction(user.id, tx.id, data);
      } else if (window.electronAPI) {
        await window.electronAPI.updateTransaction(tx.id, data);
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

  // ─── Table view renderer ──────────────────────────────────────────────────
  const renderTableView = () => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontSize: '13.5px', lineHeight: '1.4',
      }}>
        <thead>
          <tr style={{ background: 'var(--bg-card-inner)', borderBottom: '2px solid var(--color-border)' }}>
            {[t.thDate || 'Date', t.thType || 'Type', t.thCategory || 'Category', t.thDescription || 'Description', t.thAmount || 'Amount', ''].map((h, i) => (
              <th key={h || i} style={{
                padding: '10px 12px', textAlign: 'left', color: 'var(--color-text-secondary)',
                fontWeight: '600', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredTransactions.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              {t.noResults}
            </td></tr>
          ) : filteredTransactions.map(tx => {
            const isEditRow = inlineEdit?.id === tx.id;
            const cellStyle = {
              padding: '9px 12px', borderBottom: '1px solid var(--color-border)',
              verticalAlign: 'middle', background: isEditRow ? 'var(--bg-card-inner)' : undefined,
            };
            const inputCell = (field, type = 'text') => {
              const val = isEditRow && inlineEdit.field === field ? inlineEdit.value : tx[field] ?? '';
              const isActive = isEditRow && inlineEdit.field === field;
              return (
                <input
                  type={type}
                  value={val}
                  readOnly={!isEditRow}
                  onClick={() => !isEditRow && handleInlineChange(tx.id, field, tx[field] ?? '')}
                  onChange={e => handleInlineChange(tx.id, field, e.target.value)}
                  onKeyDown={e => handleInlineKeyDown(e, tx)}
                  style={{
                    background: isActive ? 'var(--bg-input)' : 'transparent',
                    border: isActive ? '1.5px solid var(--color-accent)' : '1.5px solid transparent',
                    borderRadius: '6px', padding: '4px 7px', fontSize: '13px',
                    color: 'var(--color-text-primary)', fontFamily: 'inherit',
                    width: '100%', boxSizing: 'border-box', cursor: isEditRow ? 'text' : 'pointer',
                    outline: 'none',
                  }}
                />
              );
            };
            return (
              <tr key={tx.id} style={{ transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-inner)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={cellStyle}>{inputCell('date', 'date')}</td>
                <td style={cellStyle}>
                  {isEditRow && inlineEdit.field === 'type' ? (
                    <select
                      value={inlineEdit.value}
                      onChange={e => handleInlineChange(tx.id, 'type', e.target.value)}
                      onKeyDown={e => handleInlineKeyDown(e, tx)}
                      style={{ fontFamily: 'inherit', fontSize: '13px', padding: '4px 6px', borderRadius: '6px', border: '1.5px solid var(--color-accent)', background: 'var(--bg-input)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="income">{t.income}</option>
                      <option value="expense">{t.expense}</option>
                    </select>
                  ) : (
                    <span
                      onClick={() => handleInlineChange(tx.id, 'type', tx.type)}
                      className={`type-badge ${tx.type}`}
                      style={{ cursor: 'pointer' }}
                    >
                      {tx.type === 'income' ? `↑ ${t.income}` : `↓ ${t.expense}`}
                    </span>
                  )}
                </td>
                <td style={cellStyle}>{inputCell('category')}</td>
                <td style={cellStyle}>{inputCell('description')}</td>
                <td style={{ ...cellStyle, fontWeight: '600', color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)', whiteSpace: 'nowrap' }}>
                  {isEditRow && inlineEdit.field === 'amount' ? inputCell('amount', 'number') : (
                    <span onClick={() => handleInlineChange(tx.id, 'amount', tx.amount)} style={{ cursor: 'pointer' }}>
                      {tx.type === 'income' ? '+' : '−'} {formatCurrency(tx.amount)}
                    </span>
                  )}
                </td>
                <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                  {isEditRow ? (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn" disabled={loading} style={{ padding: '4px 10px', fontSize: '12px', minHeight: '28px' }}
                        onClick={() => handleInlineSave(tx)}>{t.save || 'Save'} ✓</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '12px', minHeight: '28px' }}
                        onClick={() => setInlineEdit(null)}>{t.cancel || 'Cancel'}</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button title={t.edit} onClick={() => handleEdit(tx)} disabled={loading} className="icon-btn">✏️</button>
                      <button title={t.delete} onClick={() => handleDelete(tx.id)} disabled={loading} className="icon-btn danger">🗑️</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage('');
      const data = { ...formData, amount: parseFloat(formData.amount) };
      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        throw new Error(t.invalidAmount);
      }

      if (storageMode === 'cloud' && user) {
        if (editingId) { await SupabaseService.updateTransaction(user.id, editingId, data); }
        else { await SupabaseService.addTransaction(user.id, { ...data, id: generateUUID() }); }
      } else if (window.electronAPI) {
        if (editingId) { await window.electronAPI.updateTransaction(editingId, data); }
        else { await window.electronAPI.addTransaction(data); }
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

  const inputStyle = {
    padding: '9px 14px', border: '1.5px solid var(--color-border)', borderRadius: '8px',
    fontSize: '13.5px', fontFamily: 'inherit', background: 'var(--bg-input)',
    color: 'var(--color-text-primary)', outline: 'none', width: '100%',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
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

  const statusStyle = messageType === 'error'
    ? {
      background: 'rgba(217,79,104,0.12)',
      border: '1px solid rgba(217,79,104,0.22)',
      color: 'var(--color-danger)',
    }
    : {
      background: 'rgba(14,159,110,0.12)',
      border: '1px solid rgba(14,159,110,0.22)',
      color: 'var(--color-success)',
    };

  return (
    <div className="transactions-container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t.filters}</span>
          <h1>{t.transactionsTitle}</h1>
          <p>{t.totalRecords.replace('{n}', transactions?.length || 0)}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1.5px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              onClick={() => setViewMode('cards')}
              style={{
                padding: '6px 12px', fontSize: '13px', fontWeight: '600', border: 'none', cursor: 'pointer',
                background: viewMode === 'cards' ? 'var(--color-accent, #3b82f6)' : 'transparent',
                color: viewMode === 'cards' ? '#fff' : 'var(--color-text-secondary)',
                transition: 'all 0.15s',
              }}
            >☰ {t.viewCards || 'Cards'}</button>
            <button
              onClick={() => { setViewMode('table'); setInlineEdit(null); }}
              style={{
                padding: '6px 12px', fontSize: '13px', fontWeight: '600', border: 'none', cursor: 'pointer',
                background: viewMode === 'table' ? 'var(--color-accent, #3b82f6)' : 'transparent',
                color: viewMode === 'table' ? '#fff' : 'var(--color-text-secondary)',
                transition: 'all 0.15s',
              }}
            >⊞ {t.viewTable || 'Table'}</button>
          </div>
          <button
            className="btn scan-slip-btn"
            onClick={() => setShowScanSlip(true)}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📷 {t.scanSlip || 'Scan Slip'}
          </button>
          <button
            className="btn scan-bill-btn"
            onClick={() => setShowScanBill(true)}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            🧾 {t.scanBill || 'Scan Bill'}
          </button>
          <button className="btn" onClick={handleNewTransaction} disabled={loading}>
            {t.newTransaction}
          </button>
        </div>
      </div>

      <div className="metrics-strip">
        <div className="metric-tile income">
          <span>{t.totalIncome}</span>
          <strong>{formatCurrency(totals.income)}</strong>
        </div>
        <div className="metric-tile expense">
          <span>{t.totalExpense}</span>
          <strong>{formatCurrency(totals.expense)}</strong>
        </div>
      </div>

      {message && (
        <div style={{ ...statusStyle, padding: '14px 16px', borderRadius: '14px', fontSize: '14px', fontWeight: '600' }}>
          {message}
        </div>
      )}

      <div style={{
        padding: '10px 14px',
        background: 'var(--bg-card-inner)',
        borderRadius: '12px',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
        fontSize: '13px',
        fontWeight: '500',
      }}>
        {t.storageMode}: {window.electronAPI ? t.storageDesktop : t.storageBrowser}
      </div>

      {/* Scan Slip Modal */}
      {showScanSlip && (
        <ScanSlip
          t={t}
          onClose={() => setShowScanSlip(false)}
          onTransactionCreate={handleScanTransactions}
        />
      )}
      {/* Scan Bill Modal */}
      {showScanBill && (
        <ScanBill
          t={t}
          onTransactionCreate={handleScanTransactions}
          onClose={() => setShowScanBill(false)}
        />
      )}
      {/* Bottom-sheet modal for add/edit */}
      {showForm && createPortal(
        <>
          {/* Backdrop */}
          <div
            onClick={resetForm}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              zIndex: 9999, backdropFilter: 'blur(2px)',
            }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0,
            background: 'var(--bg-card)',
            borderRadius: '20px 20px 0 0',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
            zIndex: 10000,
            padding: '24px 24px 40px',
            maxHeight: '90dvh',
            maxWidth: '600px',
            margin: '0 auto',
            overflowY: 'auto',
            animation: 'slideUp 0.25s ease',
          }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'var(--color-border)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 24px' }}>
              <h3 style={{ margin: 0, fontWeight: '700', fontSize: '18px', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                {editingId ? t.editTransaction : t.newTransaction}
              </h3>
              <button
                type="submit"
                form="transaction-form"
                className="btn"
                disabled={loading}
                style={{ padding: '8px 16px', fontSize: '14px', minHeight: '36px', minWidth: '90px' }}
              >
                {loading ? t.saving : editingId ? t.updateBtn : t.addTransactionBtn}
              </button>
            </div>
            <form id="transaction-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                <div className="filter-group">
                  <label>{t.formType}</label>
                  <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} disabled={loading} style={inputStyle}>
                    <option value="income">{t.income}</option>
                    <option value="expense">{t.expense}</option>
                  </select>
                </div>
                <div className="filter-group">
                  <label>{t.formAmount}</label>
                  <input type="number" step="0.01" placeholder="0.00" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} disabled={loading} required style={inputStyle} />
                </div>
                <div className="filter-group">
                  <label>{t.formCategory}</label>
                  <input type="text" placeholder={t.formCategoryPlaceholder} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} disabled={loading} required style={inputStyle} />
                </div>
                <div className="filter-group">
                  <label>{t.formDate}</label>
                  <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} disabled={loading} required style={inputStyle} />
                </div>
              </div>
              <div className="filter-group">
                <label>{t.formDescription}</label>
                <input type="text" placeholder={t.formDescPlaceholder} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} disabled={loading} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="submit" className="btn" disabled={loading} style={{ flex: 1, padding: '14px' }}>
                  {loading ? t.saving : editingId ? t.updateBtn : t.addTransactionBtn}
                </button>
                <button type="button" className="btn btn-ghost" onClick={resetForm} disabled={loading} style={{ padding: '14px' }}>
                  {t.cancel}
                </button>
              </div>
            </form>
          </div>
        </>,
        document.body
      )}

      <div className="card glass-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
          <span className="section-title-bar">{t.filters}</span>
          <button className="btn btn-ghost" onClick={() => setFilters({ search: '', type: '', category: '', startDate: '', endDate: '' })} style={{ padding: '6px 14px', fontSize: '12px' }}>
            {t.reset}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
          <div className="filter-group">
            <label>{t.filterSearch}</label>
            <input type="text" placeholder={t.filterSearchPlaceholder} value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
          </div>
          <div className="filter-group">
            <label>{t.filterType}</label>
            <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
              <option value="">{t.allTypes}</option>
              <option value="income">{t.income}</option>
              <option value="expense">{t.expense}</option>
            </select>
          </div>
          <div className="filter-group">
            <label>{t.filterCategory}</label>
            <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}>
              <option value="">{t.allCategories}</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>{t.filterFrom}</label>
            <input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
          </div>
          <div className="filter-group">
            <label>{t.filterTo}</label>
            <input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop: '16px', padding: '10px 14px', backgroundColor: 'var(--bg-card-inner)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
            {t.showingOf.replace('{shown}', filteredTransactions.length).replace('{total}', transactions?.length || 0)}
          </span>
        </div>
      </div>

      <div className="transactions-list">
        {viewMode === 'table' ? (
          <div className="card glass-card" style={{ padding: '0' }}>
            {renderTableView()}
          </div>
        ) : filteredTransactions.length > 0 ? (
          <div className="transaction-feed">
            {sortedGroupedTransactions.map(([date, items]) => (
              <section key={date} className="transaction-group">
                <div className="transaction-group-title">
                  <span>{date}</span>
                  <div />
                </div>
                <div className="transaction-stack">
                  {items.map(tx => (
                    <article key={tx.id} className="transaction-card-row">
                      <div className="transaction-card-main">
                        <div className="transaction-avatar" style={{
                          background: tx.type === 'income'
                            ? 'linear-gradient(135deg, rgba(78,222,163,0.28), rgba(78,222,163,0.08))'
                            : 'linear-gradient(135deg, rgba(255,180,171,0.28), rgba(255,180,171,0.08))',
                          color: tx.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)',
                        }}>
                          {(tx.category || '?').charAt(0)}
                        </div>
                        <div className="transaction-card-copy">
                          <strong>{tx.category}</strong>
                          <span>{tx.description || t.formDescPlaceholder}</span>
                        </div>
                      </div>
                      <div className="transaction-card-side">
                        <span className={`type-badge ${tx.type}`}>
                          {tx.type === 'income' ? `↑ ${t.income}` : `↓ ${t.expense}`}
                        </span>
                        <strong className={`transaction-amount ${tx.type}`}>
                          {tx.type === 'income' ? '+' : '−'} {formatCurrency(tx.amount)}
                        </strong>
                      </div>
                      <div className="transaction-card-actions">
                        <button title={t.edit} onClick={() => handleEdit(tx)} disabled={loading} className="icon-btn">✏️</button>
                        <button title={t.delete} onClick={() => handleDelete(tx.id)} disabled={loading} className="icon-btn danger">🗑️</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-secondary)' }}>
            <div style={{ fontSize: '36px', opacity: 0.25, marginBottom: '12px' }}>🔍</div>
            <p style={{ fontWeight: '600', fontSize: '15px', marginBottom: '6px', color: 'var(--color-text-primary)' }}>
              {t.noResults}
            </p>
            <p style={{ fontSize: '13px' }}>
              {transactions?.length === 0 ? t.addFirstTransaction : t.noResultsHint}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Transactions;
