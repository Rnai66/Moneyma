import React, { useState, useEffect, useCallback } from 'react';
import SupabaseService from '../services/SupabaseService';
import { useAuth } from '../services/AuthContext';

const WEB_BUDGETS_KEY = 'webBudgets';

function readWebBudgets() {
  try {
    return JSON.parse(localStorage.getItem(WEB_BUDGETS_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function writeWebBudgets(items) {
  localStorage.setItem(WEB_BUDGETS_KEY, JSON.stringify(items));
}

function BudgetLimits({ transactions, t, storageMode }) {
  const { user } = useAuth();
  const [budgetStatus, setBudgetStatus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().split('T')[0].substring(0, 7));
  const [formData, setFormData] = useState({ category: '', limit: '', alertThreshold: 80 });

  const fmt = (v) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(v);
  const expenseCategories = [...new Set(transactions?.filter(tx => tx.type === 'expense').map(tx => tx.category) || [])].sort();

  const loadBudgets = useCallback(async () => {
    try {
      setLoading(true);
      if (storageMode === 'cloud' && user) {
        const { status } = await SupabaseService.getBudgetStatus(user.id, currentMonth);
        setBudgetStatus(status || []);
      } else if (window.electronAPI) {
        const data = await window.electronAPI.getBudgetStatus(currentMonth);
        const statusList = data.map(b => ({
          ...b,
          used: b.spent,
          status: b.isExceeded ? 'exceeded' : (b.isWarning ? 'warning' : 'ok')
        }));
        setBudgetStatus(statusList || []);
      } else {
        const allBudgets = readWebBudgets();
        const monthBudgets = allBudgets.filter(b => b.month === currentMonth);
        
        const statusList = monthBudgets.map(budget => {
          const limitAmount = parseFloat(budget.limit);
          const alertThreshold = parseFloat(budget.alertThreshold) || 80;
          
          const spent = transactions
            .filter(tx => tx.type === 'expense' && tx.category === budget.category && String(tx.date).startsWith(currentMonth))
            .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
            
          const percentage = limitAmount > 0 ? (spent / limitAmount) * 100 : 0;
          const isExceeded = spent > limitAmount;
          const isWarning = percentage >= alertThreshold && !isExceeded;
          
          return {
            category: budget.category,
            limit: limitAmount,
            alertThreshold: alertThreshold,
            used: spent,
            remaining: limitAmount - spent,
            percentage: Math.round(percentage),
            status: isExceeded ? 'exceeded' : (isWarning ? 'warning' : 'ok')
          };
        });
        
        setBudgetStatus(statusList);
      }
    } catch (e) {
      console.error('Error loading budgets:', e);
      setBudgetStatus([]);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, transactions, storageMode, user]);

  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const limitVal = parseFloat(formData.limit);
      const alertVal = parseInt(formData.alertThreshold);

      if (storageMode === 'cloud' && user) {
        const res = await SupabaseService.setBudget(user.id, formData.category, limitVal, alertVal, 'monthly');
        if (res.error) throw res.error;
      } else if (window.electronAPI) {
        await window.electronAPI.setBudget(formData.category, limitVal, currentMonth, alertVal);
      } else {
        const allBudgets = readWebBudgets();
        const filtered = allBudgets.filter(b => !(b.category === formData.category && b.month === currentMonth));
        filtered.push({
          id: Date.now(),
          category: formData.category,
          limit: limitVal,
          month: currentMonth,
          alertThreshold: alertVal
        });
        writeWebBudgets(filtered);
      }

      setFormData({ category: '', limit: '', alertThreshold: 80 });
      setShowForm(false);
      await loadBudgets();
    } catch (err) {
      console.error('Error setting budget:', err);
      alert(t.error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (category) => {
    if (window.confirm(t.deleteBudgetConfirm.replace('{category}', category))) {
      try {
        setLoading(true);
        if (storageMode === 'cloud' && user) {
          await SupabaseService.deleteBudget(user.id, category, 'monthly');
        } else if (window.electronAPI) {
          await window.electronAPI.deleteBudget(category, currentMonth);
        } else {
          const allBudgets = readWebBudgets();
          const filtered = allBudgets.filter(b => !(b.category === category && b.month === currentMonth));
          writeWebBudgets(filtered);
        }
        await loadBudgets();
      } catch (e) {
        console.error('Error deleting budget:', e);
        alert(t.error);
      } finally {
        setLoading(false);
      }
    }
  };

  const inputStyle = {
    padding: '9px 14px', border: '1.5px solid var(--color-border)', borderRadius: '8px',
    fontSize: '13.5px', fontFamily: 'inherit', background: 'var(--bg-input)',
    color: 'var(--color-text-primary)', outline: 'none', width: '100%',
  };

  const statusConfig = {
    exceeded: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: t.statusExceeded, gradient: 'linear-gradient(90deg,#ef4444,#dc2626)' },
    warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: t.statusWarning, gradient: 'linear-gradient(90deg,#f59e0b,#d97706)' },
    ok: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: t.statusOnTrack, gradient: 'linear-gradient(90deg,#10b981,#059669)' },
  };

  const getStatus = (b) => {
    if (b.status === 'exceeded') return statusConfig.exceeded;
    if (b.status === 'warning') return statusConfig.warning;
    return statusConfig.ok;
  };

  const tips = [t.tip1, t.tip2, t.tip3, t.tip4];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--color-text-primary)', letterSpacing: '-0.03em', margin: 0 }}>{t.budgetTitle}</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>{t.budgetSubtitle}</p>
      </div>

      {/* Month + Add Button */}
      <div className="card" style={{ padding: '20px', flexDirection: 'row', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div className="filter-group" style={{ gap: '4px', flex: '0 0 auto' }}>
          <label>{t.labelSelectMonth}</label>
          <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
        </div>
        <button className="btn" onClick={() => setShowForm(!showForm)} disabled={loading} style={{ marginLeft: 'auto' }}>
          {showForm ? `✕ ${t.cancel}` : t.setBudget}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 20px', fontWeight: '700', fontSize: '16px', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            {t.setBudgetForm}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <div className="filter-group">
                <label>{t.labelBudgetCategory}</label>
                <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} disabled={loading} required style={inputStyle}>
                  <option value="">{t.selectCategory}</option>
                  {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label>{t.labelBudgetLimit}</label>
                <input type="number" step="100" placeholder="5,000" value={formData.limit} onChange={e => setFormData({ ...formData, limit: e.target.value })} disabled={loading} required style={inputStyle} />
              </div>
              <div className="filter-group">
                <label>{t.labelAlertAt}</label>
                <input type="number" min="0" max="100" value={formData.alertThreshold} onChange={e => setFormData({ ...formData, alertThreshold: e.target.value })} disabled={loading} style={inputStyle} />
              </div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', padding: '10px 14px', background: 'var(--bg-card-inner)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              💡 {t.alertHint.replace('{pct}', formData.alertThreshold)}
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: 'fit-content' }}>
              {loading ? t.saving : t.setBudgetBtn}
            </button>
          </form>
        </div>
      )}

      {/* Budget Status */}
      <div className="card" style={{ padding: '24px' }}>
        <span className="section-title-bar" style={{ marginBottom: '24px', display: 'flex' }}>{t.budgetStatus}</span>
        {budgetStatus && budgetStatus.length > 0 ? (
          <div style={{ display: 'grid', gap: '16px' }}>
            {budgetStatus.map(b => {
              const st = getStatus(b);
              const pct = Math.min(b.percentage, 100);
              return (
                <div key={b.category} style={{ padding: '20px', background: 'var(--bg-card-inner)', borderRadius: '12px', border: `1px solid var(--color-border)`, borderLeftWidth: '4px', borderLeftColor: st.color }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px', letterSpacing: '-0.01em' }}>{b.category}</div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: '600', background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </div>
                    <button onClick={() => handleDelete(b.category)} disabled={loading}
                      style={{ padding: '5px 10px', fontSize: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', cursor: 'pointer', color: '#ef4444' }}>
                      🗑️
                    </button>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>
                        {fmt(b.used)} <span style={{ fontWeight: '400', color: 'var(--color-text-secondary)' }}>/ {fmt(b.limit)}</span>
                      </span>
                      <span style={{ fontWeight: '700', color: st.color }}>{b.percentage}%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--color-border)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: st.gradient, borderRadius: '999px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{t.remaining}</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: b.remaining < 0 ? '#ef4444' : '#10b981', letterSpacing: '-0.02em' }}>{fmt(b.remaining)}</div>
                    </div>
                    <div style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{t.alertAtLabel}</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#6366f1', letterSpacing: '-0.02em' }}>{fmt((b.limit * b.alertThreshold) / 100)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-secondary)' }}>
            <div style={{ fontSize: '40px', opacity: 0.25, marginBottom: '12px' }}>💰</div>
            <p style={{ fontWeight: '600', fontSize: '15px', marginBottom: '6px', color: 'var(--color-text-primary)' }}>{t.noBudgetsYet}</p>
            <p style={{ fontSize: '13px' }}>{t.noBudgetsHint}</p>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="card" style={{ padding: '20px', background: 'rgba(99,102,241,0.04)', borderColor: 'rgba(99,102,241,0.15)' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: 'var(--accent-primary)' }}>💡 {t.budgetTips}</h3>
        <ul style={{ color: 'var(--color-text-secondary)', fontSize: '13.5px', padding: '0 0 0 18px', margin: 0 }}>
          {tips.map((tip, i) => <li key={i} style={{ lineHeight: '2' }}>{tip}</li>)}
        </ul>
      </div>
    </div>
  );
}

export default BudgetLimits;