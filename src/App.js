import React, { useState, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import './styles/App.css';
import Dashboard from './pages/dashboard';
import Transactions from './pages/transactions';
import Reports from './pages/reports';
import BudgetLimits from './pages/BudgetLimits';
import Settings from './pages/settings';
import Login from './pages/Login';
import Register from './pages/Register';
import UpdatePassword from './pages/UpdatePassword';
import PremiumSettings from './pages/PremiumSettings';
import InventoryPOS from './pages/InventoryPOS';

import { AuthProvider, useAuth } from './services/AuthContext';
import { LanguageProvider, useLanguage } from './services/LanguageContext';
import { useSync } from './services/useSync';
import SupabaseService from './services/SupabaseService';
import { SubscriptionProvider } from './SubscriptionContext/SubscriptionContext';
import { PaywallTrigger } from './SubscriptionContext/PaywallScreen';
import { NATIVE_BILLING_READY } from './config/billing';
import { APP_ICON } from './config/appInfo';

const WEB_TRANSACTIONS_KEY = 'webTransactions';

/**
 * Purchase UI visibility.
 * Native builds must not show prices, upgrade CTAs or any payment route until
 * Google Play Billing is configured — steering users elsewhere for in-app
 * digital goods violates Play's Payments policy.
 * Flip NATIVE_BILLING_READY to true once RevenueCat products are live.
 */
const SHOW_PREMIUM_UI = !Capacitor.isNativePlatform() || NATIVE_BILLING_READY;

function getDeepLinkPath(url) {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname && parsedUrl.pathname !== '/' ? parsedUrl.pathname : `/${parsedUrl.host}`;
    const searchParams = new URLSearchParams(parsedUrl.search);

    if (path.includes('update-password')) {
      searchParams.set('mode', 'update-password');
      const search = searchParams.toString();
      return `/${search ? `?${search}` : ''}${parsedUrl.hash || ''}`;
    }

    return `${path}${parsedUrl.search || ''}${parsedUrl.hash || ''}`;
  } catch (error) {
    console.error('Failed to parse deep link URL:', error);
    return null;
  }
}

function normalizeTransaction(tx, index = 0) {
  const fallbackDate = new Date().toISOString().split('T')[0];
  return {
    ...tx,
    id: tx?.id ?? Date.now() + index,
    type: tx?.type === 'income' ? 'income' : 'expense',
    amount: Number(tx?.amount) || 0,
    category: typeof tx?.category === 'string' && tx.category.trim() ? tx.category : 'อื่น ๆ',
    description: typeof tx?.description === 'string' ? tx.description : '',
    date: typeof tx?.date === 'string' && tx.date.trim() ? tx.date : fallbackDate,
  };
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function getWebTransactions() {
  try {
    const raw = JSON.parse(localStorage.getItem(WEB_TRANSACTIONS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map((tx, index) => normalizeTransaction(tx, index));
  } catch (error) {
    console.error('Error reading local transactions:', error);
    return [];
  }
}

/** "2 นาทีที่แล้ว" / "2 minutes ago" — relative, falls back to a date. */
function formatSyncTime(iso, language) {
  if (!iso) return language === 'th' ? 'ยังไม่เคยซิงค์' : 'Never synced';

  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return language === 'th' ? 'ยังไม่เคยซิงค์' : 'Never synced';

  const diffSec = Math.round((Date.now() - then) / 1000);
  const th = language === 'th';

  if (diffSec < 60) return th ? 'เมื่อสักครู่' : 'just now';
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return th ? `${m} นาทีที่แล้ว` : `${m} min ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return th ? `${h} ชั่วโมงที่แล้ว` : `${h} hr ago`;
  }
  return new Date(iso).toLocaleDateString(th ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short' });
}

function getWebSummary(transactions) {
  return transactions.reduce((acc, tx) => {
    if (tx.type === 'income') acc.totalIncome += Number(tx.amount) || 0;
    else acc.totalExpense += Number(tx.amount) || 0;
    acc.balance = acc.totalIncome - acc.totalExpense;
    return acc;
  }, { totalIncome: 0, totalExpense: 0, balance: 0 });
}

function MainApp({ onRequireLogin, initialPage, subStatus }) {
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [currentPage, setCurrentPage] = useState(initialPage || 'dashboard');

  const { isPro, isAuthenticated, user, signOut } = useAuth();
  const { manualSync, syncStatus, isSyncing } = useSync();
  // Track which account we last synced for, so logging out and back in
  // (or switching accounts) triggers a fresh sync instead of being skipped.
  const [syncedUserId, setSyncedUserId] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem('lastSyncedAt') || null);

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // ภาษาใช้ LanguageContext เป็นแหล่งความจริงเดียว
  // เดิม MainApp ถือ state แยกของตัวเอง (default 'th') ขณะที่ LanguageContext default 'en'
  // ทำให้หน้าที่อ่านคนละแหล่งแสดงคนละภาษา และการสลับภาษาไม่ส่งผลกับหน้าที่ใช้ context
  const { language, t, switchLanguage: setLanguage } = useLanguage();

  const [storageMode, setStorageMode] = useState(() => {
    return localStorage.getItem('storageMode') || 'local';
  });


  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [storageMode, isAuthenticated, isPro]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.documentElement.classList.toggle('dark-mode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('storageMode', storageMode);
  }, [storageMode]);

  const loadData = async () => {
    try {
      setLoading(true);
      let currentItems = [];

      if (storageMode === 'cloud' && isAuthenticated && isPro && user) {
        const { transactions: cloudTx, error } = await SupabaseService.getTransactions(user.id);
        if (error) {
          console.error('Cloud load error:', error);
          setTransactions([]);
        } else {
          setTransactions(cloudTx || []);
          setSummary(getWebSummary(cloudTx || []));
          currentItems = cloudTx || [];
        }
      } else {
        const localTransactions = getWebTransactions();
        let migrated = false;
        
        // Migrate numeric IDs to UUIDs to prevent Supabase type sync errors
        const mappedTransactions = localTransactions.map(tx => {
          if (typeof tx.id === 'number' || (typeof tx.id === 'string' && tx.id.length < 32)) {
            migrated = true;
            return { ...tx, id: generateUUID() };
          }
          return tx;
        });

        if (migrated) {
          localStorage.setItem(WEB_TRANSACTIONS_KEY, JSON.stringify(mappedTransactions));
        }

        setTransactions(mappedTransactions);
        setSummary(getWebSummary(mappedTransactions));
        
        currentItems = mappedTransactions;
      }

      // Auto-sync on login / account switch (local storage mode).
      // Available to every signed-in user — no Pro gate.
      if (storageMode !== 'cloud' && isAuthenticated && user?.id && syncedUserId !== user.id) {
        setSyncedUserId(user.id);
        runSync(currentItems).catch(err => console.error('Auto sync failed', err));
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Two-way sync: push local changes up, pull everything down, merge,
   * then persist + re-render. Safe to call from anywhere.
   */
  const runSync = async (items) => {
    const source = items ?? getWebTransactions();
    const merged = await manualSync(source);
    if (!merged) return null;

    localStorage.setItem(WEB_TRANSACTIONS_KEY, JSON.stringify(merged));
    setTransactions(merged);
    setSummary(getWebSummary(merged));

    const stamp = new Date().toISOString();
    localStorage.setItem('lastSyncedAt', stamp);
    setLastSyncedAt(stamp);
    return merged;
  };

  // Reset the sync marker on sign-out so the next sign-in syncs again.
  useEffect(() => {
    if (!isAuthenticated) setSyncedUserId(null);
  }, [isAuthenticated]);

  // Push pending changes before the tab/app closes.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return undefined;

    const flush = () => {
      try {
        const pending = localStorage.getItem(WEB_TRANSACTIONS_KEY);
        if (pending) localStorage.setItem('pendingSync', '1');
      } catch (e) { /* ignore */ }
    };

    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [isAuthenticated, user?.id]);

  /** Sync everything up before signing out so nothing is stranded locally. */
  const handleSignOut = async () => {
    try {
      if (isAuthenticated && navigator.onLine) {
        await runSync().catch(err => console.error('Sync before sign-out failed', err));
      }
    } finally {
      setSyncedUserId(null);
      await signOut();
    }
  };

  const renderPage = () => {
    const shared = { t, storageMode, setStorageMode };
    switch (currentPage) {
      case 'dashboard': return <Dashboard summary={summary} transactions={transactions.slice(0, 5)} {...shared} />;
      case 'transactions': return <Transactions transactions={transactions} onRefresh={loadData} {...shared} />;
      case 'statistics':
      case 'reports': return <Reports transactions={transactions} darkMode={darkMode} {...shared} />;
      case 'inventory':
        return (
          <InventoryPOS
            userPlan={isPro ? 'business' : 'free'}
            onAddTransaction={(newTx) => {
              const updated = [normalizeTransaction(newTx), ...transactions];
              localStorage.setItem(WEB_TRANSACTIONS_KEY, JSON.stringify(updated));
              setTransactions(updated);
              setSummary(getWebSummary(updated));
            }}
            openPaywall={() => setCurrentPage('premium')}
            {...shared}
          />
        );
      case 'budget': return <BudgetLimits transactions={transactions} {...shared} />;
      case 'premium':
        // Guard against deep links / stale state reaching the paywall on native
        if (!SHOW_PREMIUM_UI) return <Dashboard summary={summary} transactions={transactions.slice(0, 5)} {...shared} />;
        return <PremiumSettings setCurrentPage={setCurrentPage} />;
      case 'settings': return <Settings darkMode={darkMode} onDarkModeChange={setDarkMode} language={language} onLanguageChange={setLanguage} transactions={transactions} onDataRestored={loadData} onRequireLogin={onRequireLogin} onSignOut={handleSignOut} onSyncNow={() => runSync()} lastSyncedAt={lastSyncedAt} {...shared} />;
      default: return <Dashboard summary={summary} transactions={transactions.slice(0, 5)} {...shared} />;
    }
  };

  const NAV_ICONS = {
    dashboard: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
    transactions: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><path d="M10 9H8"/></svg>,
    reports: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    inventory: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
    budget: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></svg>,
    premium: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    settings: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  };

  const NAV_ITEMS = [
    { id: 'dashboard', icon: NAV_ICONS.dashboard, label: t.navDashboard, hint: t.dashboardSubtitle },
    { id: 'transactions', icon: NAV_ICONS.transactions, label: t.navTransactions, hint: t.totalRecords.replace('{n}', transactions?.length || 0) },
    { id: 'reports', icon: NAV_ICONS.reports, label: t.navReports || 'สรุป & งบการเงิน', hint: t.navReportsHint || 'สถิติภาพรวม และออกสเตทเม้นท์' },
    { id: 'inventory', icon: NAV_ICONS.inventory, label: t.navInventory || 'สต็อก & POS', hint: t.navInventoryHint || 'จัดการคลังสินค้าและออกบิล' },
    { id: 'budget', icon: NAV_ICONS.budget, label: t.navBudget, hint: t.budgetSubtitle },
    ...(SHOW_PREMIUM_UI
      ? [{ id: 'premium', icon: NAV_ICONS.premium, label: 'Premium', hint: t.premiumHint }]
      : []),
    { id: 'settings', icon: NAV_ICONS.settings, label: t.navSettings, hint: t.settingsSubtitle },
  ];

  const monthLabel = new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  if (loading) {
    return (
      <div className={`app ${darkMode ? 'dark-mode' : ''}`} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading-inner">
          <div className="loading-spinner" />
          <img className="loading-logo" src={APP_ICON} alt="MoneyMa" width={56} height={56} />
          <h1>MoneyMa</h1>
          <p>{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <div className="app-backdrop" />
      <nav className="sidebar">
        <div className="logo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img className="logo-mark logo-mark--icon" src={APP_ICON} alt="MoneyMa" width={42} height={42} />
            <div>
              <h1>MoneyMa</h1>
              <div className="logo-subtitle">{t.appTagline}</div>
            </div>
          </div>
          <button
            onClick={() => setCurrentPage('settings')}
            title={t.navSettings || 'ตั้งค่า'}
            style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', fontSize: '18px', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}
          >
            ⚙️
          </button>
        </div>

        <div className="sidebar-spotlight">
          <span className="sidebar-kicker">{language === 'th' ? 'ภาพรวมเดือนนี้' : 'Current cycle'}</span>
          <strong>{monthLabel}</strong>
          <p>
            {language === 'th'
              ? 'ติดตามรายรับ รายจ่าย และสภาพคล่องในมุมมองเดียว'
              : 'Track income, expenses, and cash flow in one place.'}
          </p>
        </div>

        <ul className="nav-menu">
          {NAV_ITEMS.map(item => (
            <li key={item.id}>
              <button
                className={currentPage === item.id ? 'active' : ''}
                onClick={() => setCurrentPage(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-copy">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="nav-footer">
          {isAuthenticated && (
            <button
              className={`sync-pill ${isSyncing ? 'is-syncing' : ''} ${syncStatus?.status === 'failed' ? 'is-failed' : ''}`}
              onClick={() => runSync()}
              disabled={isSyncing}
              title={t.syncNowBtn}
            >
              <span className="sync-pill-dot" aria-hidden="true" />
              <span className="sync-pill-copy">
                <strong>
                  {isSyncing
                    ? (language === 'th' ? 'กำลังซิงค์…' : 'Syncing…')
                    : syncStatus?.status === 'failed'
                      ? (language === 'th' ? 'ซิงค์ไม่สำเร็จ' : 'Sync failed')
                      : (language === 'th' ? 'ข้อมูลเป็นปัจจุบัน' : 'Up to date')}
                </strong>
                <small>{formatSyncTime(lastSyncedAt, language)}</small>
              </span>
              <span className="sync-pill-icon" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              </span>
            </button>
          )}

          <div className="nav-footer-card">
            <div>
              <div className="nav-footer-title">{darkMode ? (language === 'th' ? 'โหมดกลางคืน' : 'Night mode') : (language === 'th' ? 'โหมดสว่าง' : 'Light mode')}</div>
              <div className="nav-footer-subtitle">{language === 'th' ? 'สลับบรรยากาศของหน้าแอป' : 'Switch the visual atmosphere'}</div>
            </div>
            <button className="theme-toggle" onClick={() => setDarkMode(d => !d)}>
              <span className={`theme-toggle-knob ${darkMode ? 'active' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content" key={currentPage}>
        {renderPage()}
      </main>

      <nav className="mobile-nav">
        {NAV_ITEMS.filter(item => item.id !== 'premium').map(item => (
          <button
            key={item.id}
            className={currentPage === item.id ? 'active' : ''}
            onClick={() => setCurrentPage(item.id)}
          >
            <span>{item.icon}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>

      {SHOW_PREMIUM_UI && (
        <button
          className="mobile-premium-btn"
          onClick={() => setCurrentPage('premium')}
          title="Premium"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
      )}
    </div>
  );
}

// Auth wrapper component
function AppWrapper() {
  const { isAuthenticated, isRecovery, loading: authLoading } = useAuth();
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem('guestMode') === 'true');

  useEffect(() => {
    localStorage.setItem('guestMode', isGuest);
  }, [isGuest]);

  // Detect recovery mode from URL
  const urlHash = window.location.hash;
  const urlSearch = window.location.search;
  const urlPath = window.location.pathname;
  const urlParams = new URLSearchParams(urlSearch);
  const combined = urlHash + urlSearch;
  const isUpdatePasswordMode = urlParams.get('mode') === 'update-password';
  const isUpdatePasswordPath = urlPath === '/update-password' || urlPath.includes('update-password');
  const hasRecoveryToken = combined.includes('type=recovery') || 
    (combined.includes('access_token') && combined.includes('type=recovery'));

  // Detect Subscription success/cancel
  const isSubSuccess = urlPath.includes('/subscription/success');
  const isSubCancel = urlPath.includes('/subscription/cancel');

  useEffect(() => {
    if (isSubSuccess || isSubCancel) {
      // Clear URL and let the app handle the state
      window.history.replaceState({}, document.title, '/');
    }
  }, [isSubSuccess, isSubCancel]);

  if (authLoading) {
    return (
      <div className="app" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading-inner">
          <div className="loading-spinner" />
          <img className="loading-logo" src={APP_ICON} alt="MoneyMa" width={56} height={56} />
          <h1>MoneyMa</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show UpdatePassword if: isRecovery flag set, or URL is /update-password, or recovery token in URL
  if (isRecovery || isUpdatePasswordMode || isUpdatePasswordPath || hasRecoveryToken) {
    return <UpdatePassword onUpdateSuccess={() => {
      // Clear the hash/path and go back to login
      window.history.replaceState({}, document.title, '/');
      window.location.reload();
    }} />;
  }

  // Show auth pages if not authenticated AND not guest
  if (!isAuthenticated && !isGuest) {
    if (authMode === 'login') {
      return (
        <Login
          onSwitchToRegister={() => setAuthMode('register')}
          onLoginSuccess={() => { }}
          onContinueAsGuest={() => setIsGuest(true)}
        />
      );
    } else {
      return (
        <Register
          onSwitchToLogin={() => setAuthMode('login')}
          onRegisterSuccess={() => setAuthMode('login')}
        />
      );
    }
  }

  // Show main app if authenticated or guest
  return <MainApp 
    onRequireLogin={() => setIsGuest(false)} 
    initialPage={isSubSuccess || isSubCancel ? 'premium' : 'dashboard'}
    subStatus={isSubSuccess ? 'success' : isSubCancel ? 'cancel' : null}
  />;
}

function App() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    const handleUrl = async (url) => {
      if (!url) return;

      // Password-reset link keeps its existing behaviour.
      const deepLinkPath = getDeepLinkPath(url);
      if (deepLinkPath && deepLinkPath.includes('/update-password')) {
        window.location.replace(deepLinkPath);
        return;
      }

      // OAuth callback (moneyma://auth?code=… or #access_token=…).
      // Without this the browser hands the credentials back but nothing
      // consumes them, so Google sign-in appears to do nothing on device.
      const result = await SupabaseService.completeAuthFromDeepLink(url);
      if (result?.session) {
        window.location.replace('/');
      } else if (result?.error) {
        console.error('Deep link auth failed:', result.error);
      }
    };

    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => handleUrl(url));

    // Cold start: if the deep link launched the app, appUrlOpen may have fired
    // before this listener existed — pick the URL up from the launch intent.
    CapacitorApp.getLaunchUrl()
      .then((result) => handleUrl(result?.url))
      .catch(() => { /* no launch url */ });

    return () => {
      listener.then((handle) => handle.remove()).catch((error) => {
        console.error('Failed to remove deep link listener:', error);
      });
    };
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <AppWrapper />
          <PaywallTrigger />
        </SubscriptionProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
