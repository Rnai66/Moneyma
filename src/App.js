import React, { useState, useEffect } from 'react';
import './styles/App.css';
import Dashboard from './pages/dashboard';
import Transactions from './pages/transactions';
import Statistics from './pages/statistics';
import Reports from './pages/reports';
import BudgetLimits from './pages/BudgetLimits';
import Settings from './pages/settings';
import { getTranslation } from './i18n';

const WEB_TRANSACTIONS_KEY = 'webTransactions';

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

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('language') || 'th';
  });

  const t = getTranslation(language);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.documentElement.classList.toggle('dark-mode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (window.electronAPI) {
        const trans = await window.electronAPI.getTransactions({});
        const sum = await window.electronAPI.getSummary();
        setTransactions(trans || []);
        setSummary(sum || { totalIncome: 0, totalExpense: 0, balance: 0 });
      } else {
        const localTransactions = getWebTransactions();
        setTransactions(localTransactions);
        setSummary(getWebSummary(localTransactions));
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderPage = () => {
    const shared = { t };
    switch (currentPage) {
      case 'dashboard': return <Dashboard summary={summary} transactions={transactions.slice(0, 5)} {...shared} />;
      case 'transactions': return <Transactions transactions={transactions} onRefresh={loadData} {...shared} />;
      case 'statistics': return <Statistics transactions={transactions} darkMode={darkMode} {...shared} />;
      case 'reports': return <Reports transactions={transactions} darkMode={darkMode} {...shared} />;
      case 'budget': return <BudgetLimits transactions={transactions} {...shared} />;
      case 'settings': return <Settings darkMode={darkMode} onDarkModeChange={setDarkMode} language={language} onLanguageChange={setLanguage} transactions={transactions} onDataRestored={loadData} {...shared} />;
      default: return <Dashboard summary={summary} transactions={transactions.slice(0, 5)} {...shared} />;
    }
  };

  const NAV_ITEMS = [
    { id: 'dashboard', icon: '◫', label: t.navDashboard, hint: t.dashboardSubtitle },
    { id: 'transactions', icon: '▤', label: t.navTransactions, hint: t.totalRecords.replace('{n}', transactions?.length || 0) },
    { id: 'statistics', icon: '◭', label: t.navStatistics, hint: t.statisticsSubtitle },
    { id: 'reports', icon: '▣', label: t.navReports, hint: t.reportsSubtitle },
    { id: 'budget', icon: '◎', label: t.navBudget, hint: t.budgetSubtitle },
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
        {NAV_ITEMS.map(item => (
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
    </div>
  );
}

export default App;
