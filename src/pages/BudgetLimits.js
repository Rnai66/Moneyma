import React, { useState, useEffect, useCallback } from 'react';
import SupabaseService from '../services/SupabaseService';
import { useAuth } from '../services/AuthContext';
import { useSubscription } from '../SubscriptionContext/SubscriptionContext';
import UpgradeModal from '../components/UpgradeModal';
import { PLANS } from '../SubscriptionContext/SubscriptionService';

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
  const { plan } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState(false);
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
            alertThreshold,
            used: spent,
            remaining: limitAmount - spent,
            percentage: Math.round(percentage),
            status: isExceeded ? 'exceeded' : (isWarning ? 'warning' : 'ok'),
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
      const alertVal = parseInt(formData.alertThreshold, 10);

      if (plan === 'free') {
        const isEditing = budgetStatus.some(b => b.category === formData.category);
        if (!isEditing && budgetStatus.length >= PLANS.free.limits.budgets) {
          setShowUpgrade(true);
          setLoading(false);
          return;
        }
      }

      if (storageMode === 'cloud' && user) {
        const res = await SupabaseService.setBudget(user.id, formData.category, limitVal, alertVal, 'monthly');
        if (res.error) throw res.error;
      } else {
        const allBudgets = readWebBudgets();
        const filtered = allBudgets.filter(b => !(b.category === formData.category && b.month === currentMonth));
        filtered.push({
          id: Date.now(),
          category: formData.category,
          limit: limitVal,
          month: currentMonth,
          alertThreshold: alertVal,
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
        } else {
          const allBudgets = readWebBudgets();
          writeWebBudgets(allBudgets.filter(b => !(b.category === category && b.month === currentMonth)));
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

  const statusMeta = {
    exceeded: { tone: 'is-danger', tag: 'tag-danger', color: 'var(--color-danger)', label: t.statusExceeded },
    warning: { tone: 'is-warning', tag: 'tag-warning', color: 'var(--color-warning)', label: t.statusWarning },
    ok: { tone: '', tag: 'tag-success', color: 'var(--color-success)', label: t.statusOnTrack },
  };

  const getStatus = (b) => statusMeta[b.status] || statusMeta.ok;

  const tips = [t.tip1, t.tip2, t.tip3, t.tip4];

  const totals = budgetStatus.reduce((acc, b) => {
    acc.limit += b.limit || 0;
    acc.used += b.used || 0;
    return acc;
  }, { limit: 0, used: 0 });

  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t.budgetSubtitle}</span>
          <h1>{t.budgetTitle}</h1>
          <p>{t.budgetSubtitle}</p>
        </div>
        <div className="page-heading-actions">
          <div className="field">
            <label>{t.labelSelectMonth}</label>
            <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} />
          </div>
          <button className="btn" onClick={() => setShowForm(!showForm)} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {showForm ? (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                {t.cancel}
              </>
            ) : `+ ${t.setBudget}`}
          </button>
        </div>
      </header>

      {budgetStatus.length > 0 && (
        <section className="metrics-strip">
          <div className="metric-tile">
            <span>{t.budgetStatus}</span>
            <strong className="num">{budgetStatus.length}</strong>
          </div>
          <div className="metric-tile expense">
            <span>{t.totalExpense}</span>
            <strong className="num">{fmt(totals.used)}</strong>
          </div>
          <div className="metric-tile">
            <span>{t.labelBudgetLimit}</span>
            <strong className="num">{fmt(totals.limit)}</strong>
          </div>
          <div className="metric-tile">
            <span>{t.remaining}</span>
            <strong
              className="num"
              style={{ color: totals.limit - totals.used < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
            >
              {fmt(totals.limit - totals.used)}
            </strong>
          </div>
        </section>
      )}

      {showForm && (
        <section className="panel">
          <div className="panel-header" style={{ marginBottom: 'var(--space-4)' }}>
            <span className="section-title-bar">{t.setBudgetForm}</span>
          </div>

          <form onSubmit={handleSubmit} className="stack">
            <div className="filter-bar">
              <div className="field">
                <label>{t.labelBudgetCategory}</label>
                <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} disabled={loading} required>
                  <option value="">{t.selectCategory}</option>
                  {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{t.labelBudgetLimit}</label>
                <input type="number" step="100" placeholder="5,000" value={formData.limit} onChange={e => setFormData({ ...formData, limit: e.target.value })} disabled={loading} required />
              </div>
              <div className="field">
                <label>{t.labelAlertAt}</label>
                <input type="number" min="0" max="100" value={formData.alertThreshold} onChange={e => setFormData({ ...formData, alertThreshold: e.target.value })} disabled={loading} />
              </div>
            </div>

            <div className="alert alert-info">
              <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '6px' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
              </span>
              {t.alertHint.replace('{pct}', formData.alertThreshold)}
            </div>

            <div className="cluster">
              <button type="submit" className="btn" disabled={loading}>
                {loading ? t.saving : t.setBudgetBtn}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={loading}>
                {t.cancel}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <span className="section-title-bar">{t.budgetStatus}</span>
          <span className="mini-badge">{currentMonth}</span>
        </div>

        {budgetStatus && budgetStatus.length > 0 ? (
          <div className="grid grid-auto-lg">
            {budgetStatus.map(b => {
              const st = getStatus(b);
              const pct = Math.min(b.percentage, 100);

              return (
                <article key={b.category} className="budget-card" style={{ borderLeftColor: st.color }}>
                  <div className="cluster-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <strong className="budget-card-title">{b.category}</strong>
                      <span className={`tag ${st.tag}`}>{st.label}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(b.category)}
                      disabled={loading}
                      className="icon-btn danger"
                      title={t.delete}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </div>

                  <div>
                    <div className="cluster-between" style={{ marginBottom: 'var(--space-2)' }}>
                      <span className="num" style={{ fontWeight: 650, color: 'var(--color-text-primary)' }}>
                        {fmt(b.used)}{' '}
                        <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>/ {fmt(b.limit)}</span>
                      </span>
                      <span className="num" style={{ fontWeight: 800, color: st.color }}>{b.percentage}%</span>
                    </div>
                    <div className="progress">
                      <div className={`progress-fill ${st.tone}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-2" style={{ gap: 'var(--space-3)' }}>
                    <div className="budget-stat">
                      <span>{t.remaining}</span>
                      <strong className="num" style={{ color: b.remaining < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {fmt(b.remaining)}
                      </strong>
                    </div>
                    <div className="budget-stat">
                      <span>{t.alertAtLabel}</span>
                      <strong className="num" style={{ color: 'var(--accent-primary)' }}>
                        {fmt((b.limit * b.alertThreshold) / 100)}
                      </strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></svg>
            </div>
            <strong>{t.noBudgetsYet}</strong>
            <p>{t.noBudgetsHint}</p>
            {!showForm && (
              <button className="btn" style={{ marginTop: 'var(--space-3)' }} onClick={() => setShowForm(true)}>
                + {t.setBudget}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="panel tips-panel">
        <div className="section-title-bar" style={{ color: 'var(--accent-primary)', marginBottom: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
          {t.budgetTips}
        </div>
        <ul className="tips-list">
          {tips.map((tip, i) => <li key={i}>{tip}</li>)}
        </ul>
      </section>

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        title={`⚠️ ${t.budgetLimitTitle}`}
        description={t.budgetLimitDesc}
        feature="budget_limits"
        t={t}
      />
    </div>
  );
}

export default BudgetLimits;
