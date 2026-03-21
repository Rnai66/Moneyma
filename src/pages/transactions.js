import React, { useState, useMemo } from 'react';

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

function Transactions({ transactions, onRefresh, t }) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
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
    setEditingId(null); setShowForm(false);
  };

  const setStatus = (type, text) => {
    setMessageType(type);
    setMessage(text);
  };

  const handleEdit = (tx) => {
    setFormData({ type: tx.type, amount: tx.amount.toString(), category: tx.category, description: tx.description || '', date: tx.date });
    setEditingId(tx.id); setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t.confirmDelete)) {
      try {
        setLoading(true);
        setMessage('');
        if (window.electronAPI) {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage('');
      const data = { ...formData, amount: parseFloat(formData.amount) };
      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        throw new Error(t.invalidAmount);
      }

      if (window.electronAPI) {
        if (editingId) { await window.electronAPI.updateTransaction(editingId, data); }
        else { await window.electronAPI.addTransaction(data); }
      } else {
        const items = readWebTransactions();
        if (editingId) {
          writeWebTransactions(items.map(tx => tx.id === editingId ? { ...tx, ...data, id: editingId } : tx));
        } else {
          writeWebTransactions([{ ...data, id: Date.now() }, ...items]);
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
        <button className="btn" onClick={() => setShowForm(!showForm)} disabled={loading}>
          {showForm ? `✕ ${t.cancel}` : t.newTransaction}
        </button>
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

      {showForm && (
        <div className="card glass-card" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 20px', fontWeight: '700', fontSize: '16px', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            {editingId ? t.editTransaction : t.newTransaction}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
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
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? t.saving : editingId ? t.updateBtn : t.addTransactionBtn}
              </button>
              {editingId && (
                <button type="button" className="btn btn-ghost" onClick={resetForm} disabled={loading}>
                  {t.cancelEdit}
                </button>
              )}
            </div>
          </form>
        </div>
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
        {filteredTransactions.length > 0 ? (
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
                        <button
                          title={t.edit}
                          onClick={() => handleEdit(tx)}
                          disabled={loading}
                          className="icon-btn"
                        >
                          ✏️
                        </button>
                        <button
                          title={t.delete}
                          onClick={() => handleDelete(tx.id)}
                          disabled={loading}
                          className="icon-btn danger"
                        >
                          🗑️
                        </button>
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
