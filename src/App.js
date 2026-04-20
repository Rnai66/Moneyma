import React, { useState, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import './styles/App.css';
import Dashboard from './pages/dashboard';
import Transactions from './pages/transactions';
import Statistics from './pages/statistics';
import Reports from './pages/reports';
import BudgetLimits from './pages/BudgetLimits';
import Settings from './pages/settings';
import Login from './pages/Login';
import Register from './pages/Register';
import UpdatePassword from './pages/UpdatePassword';
import PremiumSettings from './pages/PremiumSettings';
import { getTranslation } from './i18n';
import { AuthProvider, useAuth } from './services/AuthContext';
import { LanguageProvider } from './services/LanguageContext';
import { useSync } from './services/useSync';
import SupabaseService from './services/SupabaseService';
import { SubscriptionProvider } from './SubscriptionContext/SubscriptionContext';
import { PaywallTrigger } from './SubscriptionContext/PaywallScreen';

const WEB_TRANSACTIONS_KEY = 'webTransactions';

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

function getWebSummary(transactions) {
  return transactions.reduce((acc, tx) => {
    if (tx.type === 'income') acc.totalIncome += Number(tx.amount) || 0;
    else acc.totalExpense += Number(tx.amount) || 0;
    acc.balance = acc.totalIncome - acc.totalExpense;
    return acc;
  }, { totalIncome: 0, totalExpense: 0, balance: 0 });
}

function MainApp({ onRequireLogin }) {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);

  const { isPro, isAuthenticated, user } = useAuth();
  const { manualSync } = useSync();
  const [hasAutoSynced, setHasAutoSynced] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('language') || 'th';
  });

  const [storageMode, setStorageMode] = useState(() => {
    return localStorage.getItem('storageMode') || 'local';
  });

  const t = getTranslation(language);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [storageMode, isAuthenticated, isPro]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.documentElement.classList.toggle('dark-mode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

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
      } else if (window.electronAPI) {
        const trans = await window.electronAPI.getTransactions({});
        const sum = await window.electronAPI.getSummary();
        setTransactions(trans || []);
        setSummary(sum || { totalIncome: 0, totalExpense: 0, balance: 0 });
        currentItems = trans || [];
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

      // Auto-Sync (Only in local mode)
      if (storageMode !== 'cloud' && isAuthenticated && isPro && !hasAutoSynced) {
        setHasAutoSynced(true);
        manualSync(currentItems).then(async (mergedTransactions) => {
          if (mergedTransactions) {
            if (window.electronAPI && window.electronAPI.saveAllTransactions) {
              await window.electronAPI.saveAllTransactions(mergedTransactions);
            } else {
              localStorage.setItem(WEB_TRANSACTIONS_KEY, JSON.stringify(mergedTransactions));
            }
            setTransactions(mergedTransactions);
            setSummary(getWebSummary(mergedTransactions));
          }
        }).catch(err => console.error('Auto sync failed', err));
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderPage = () => {
    const shared = { t, storageMode, setStorageMode };
    switch (currentPage) {
      case 'dashboard': return <Dashboard summary={summary} transactions={transactions.slice(0, 5)} {...shared} />;
      case 'transactions': return <Transactions transactions={transactions} onRefresh={loadData} {...shared} />;
      case 'statistics': return <Statistics transactions={transactions} darkMode={darkMode} {...shared} />;
      case 'reports': return <Reports transactions={transactions} darkMode={darkMode} {...shared} />;
      case 'budget': return <BudgetLimits transactions={transactions} {...shared} />;
      case 'premium': return <PremiumSettings setCurrentPage={setCurrentPage} />;
      case 'settings': return <Settings darkMode={darkMode} onDarkModeChange={setDarkMode} language={language} onLanguageChange={setLanguage} transactions={transactions} onDataRestored={loadData} onRequireLogin={onRequireLogin} {...shared} />;
      default: return <Dashboard summary={summary} transactions={transactions.slice(0, 5)} {...shared} />;
    }
  };

  const NAV_ITEMS = [
    { id: 'dashboard', icon: '◫', label: t.navDashboard, hint: t.dashboardSubtitle },
    { id: 'transactions', icon: '▤', label: t.navTransactions, hint: t.totalRecords.replace('{n}', transactions?.length || 0) },
    { id: 'statistics', icon: '◭', label: t.navStatistics, hint: t.statisticsSubtitle },
    { id: 'reports', icon: '▣', label: t.navReports, hint: t.reportsSubtitle },
    { id: 'budget', icon: '◎', label: t.navBudget, hint: t.budgetSubtitle },
    { id: 'premium', icon: '💎', label: 'Premium', hint: 'อัปเกรดเพื่อปลดล็อกฟีเจอร์' },
    { id: 'settings', icon: '◌', label: t.navSettings, hint: t.settingsSubtitle },
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
          <h1>💰 Finance Manager</h1>
          <p>{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <div className="app-backdrop" />
      <nav className="sidebar">
        <div className="logo">
          <div className="logo-mark">M</div>
          <div>
            <h1>MoneyMa</h1>
            <div className="logo-subtitle">Personal Finance Manager</div>
          </div>
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

      <button 
        className="mobile-premium-btn" 
        onClick={() => setCurrentPage('premium')}
        title="Premium"
      >
        💎
      </button>
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

  if (authLoading) {
    return (
      <div className="app" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading-inner">
          <div className="loading-spinner" />
          <h1>💰 MoneyMa</h1>
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
  return <MainApp onRequireLogin={() => setIsGuest(false)} />;
}

function App() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const deepLinkPath = getDeepLinkPath(url);
      if (!deepLinkPath) {
        return;
      }

      if (deepLinkPath.includes('/update-password')) {
        window.location.replace(deepLinkPath);
      }
    });

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
