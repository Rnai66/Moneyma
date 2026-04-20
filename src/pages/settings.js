import React, { useRef, useState } from 'react';
import {
  backupLocalDataBrowser,
  exportTransactionsToExcelBrowser,
  restoreLocalBackupFile,
} from '../utils/dataTransfer';
import { useAuth } from '../services/AuthContext';
import { useSync } from '../services/useSync';

function ToggleSwitch({ checked, onChange }) {
  return (
    <div onClick={() => onChange(!checked)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: '44px', height: '24px', borderRadius: '999px', position: 'relative',
        background: checked ? 'var(--accent-gradient)' : 'var(--color-border)',
        transition: 'background 0.25s ease',
        boxShadow: checked ? '0 2px 8px rgba(99,102,241,0.4)' : 'none',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: '3px', left: checked ? '23px' : '3px',
          width: '18px', height: '18px', borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.25s ease',
        }} />
      </div>
      <span style={{ fontWeight: '600', fontSize: '13px', color: checked ? 'var(--accent-primary)' : 'var(--color-text-secondary)' }}>
        {checked ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="card" style={{ padding: '24px' }}>
      <span className="section-title-bar" style={{ marginBottom: '20px', display: 'flex' }}>{title}</span>
      {children}
    </div>
  );
}

function Settings({ darkMode, onDarkModeChange, language, onLanguageChange, transactions, onDataRestored, onRequireLogin, t, storageMode, setStorageMode }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dbInfo, setDbInfo] = useState({ path: '', isCustom: false });
  const restoreInputRef = useRef(null);
  
  const { isAuthenticated, isPro, upgradeToPro } = useAuth();
  const { syncStatus, manualSync, isSyncing } = useSync();

  // Load current DB path on mount
  React.useEffect(() => {
    if (window.electronAPI?.getDbPath) {
      window.electronAPI.getDbPath().then(setDbInfo).catch(() => { });
    } else {
      setDbInfo({ path: 'localStorage / Capacitor WebView', isCustom: false });
    }
  }, []);

  const run = async (fn) => {
    try { setLoading(true); setMessage(''); await fn(); }
    catch (e) { console.error(e); setMessage(t.error || e?.message || 'Error'); }
    finally { setLoading(false); }
  };

  const handleUpgrade = () => run(async () => {
    const res = await upgradeToPro();
    if (res.success) {
      setMessage('✅ Upgraded to Pro successfully!');
    } else {
      setMessage(res.error || 'Failed to upgrade');
    }
  });

  const handleSync = () => run(async () => {
    const mergedTransactions = await manualSync(transactions);
    if (mergedTransactions) {
      if (window.electronAPI && window.electronAPI.saveAllTransactions) {
        await window.electronAPI.saveAllTransactions(mergedTransactions);
      } else {
        localStorage.setItem('webTransactions', JSON.stringify(mergedTransactions));
      }
      if (onDataRestored) {
        await onDataRestored();
      }
    }
  });

  const handleExport = () => run(async () => {
    if (window.electronAPI) {
      const r = await window.electronAPI.exportToExcel();
      setMessage(r.success ? `✅ ${r.path.split('/').pop()}` : (r.message || t.cancel));
      return;
    }

    const r = await exportTransactionsToExcelBrowser(transactions);
    setMessage(r.success ? `✅ ${r.filename}` : (r.message || t.cancel));
  });

  const handleBackup = () => run(async () => {
    if (window.electronAPI) {
      const r = await window.electronAPI.backupDatabase();
      setMessage(r.success ? `✅ ${r.path.split('/').pop()}` : (r.message || t.cancel));
      return;
    }

    const r = await backupLocalDataBrowser();
    setMessage(r.success ? `✅ ${r.filename}` : (r.message || t.cancel));
  });

  const handleRestore = () => {
    if (!window.confirm(t.restoreConfirm)) return;
    run(async () => {
      if (window.electronAPI) {
        const r = await window.electronAPI.restoreDatabase();
        setMessage(r.success ? `✅ ${r.message}` : (r.message || t.cancel));
      } else {
        restoreInputRef.current?.click();
      }
    });
  };

  const handleRestoreFile = () => run(async () => {
    const file = restoreInputRef.current?.files?.[0];
    const r = await restoreLocalBackupFile(file);
    restoreInputRef.current.value = '';
    await onDataRestored?.();
    setMessage(r.success ? `✅ ${r.message}` : (r.message || t.cancel));
  });

  const handleChooseDb = () => run(async () => {
    if (window.electronAPI) {
      const r = await window.electronAPI.chooseDatabase();
      if (r.success) {
        setDbInfo({ path: r.path, isCustom: true });
        setMessage(`✅ ${t.dbRestartNote}`);
      } else {
        setMessage(t.cancel);
      }
    }
  });

  const handleResetDb = () => run(async () => {
    if (window.electronAPI) {
      await window.electronAPI.resetDbPath();
      const info = await window.electronAPI.getDbPath();
      setDbInfo(info);
      setMessage(`✅ ${t.dbRestartNote}`);
    }
  });

  const isSuccess = String(message || '').startsWith('✅');

  const rowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', background: 'var(--bg-card-inner)', borderRadius: '10px',
    border: '1px solid var(--color-border)', gap: '16px', flexWrap: 'wrap',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px' }}>
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--color-text-primary)', letterSpacing: '-0.03em', margin: 0 }}>{t.settingsTitle}</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>{t.settingsSubtitle}</p>
      </div>

      {/* Status message */}
      <input
        ref={restoreInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleRestoreFile}
      />

      {message && (
        <div style={{
          padding: '14px 18px', borderRadius: '10px',
          background: isSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${isSuccess ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          color: isSuccess ? '#059669' : '#dc2626', fontSize: '13.5px', fontWeight: '500',
        }}>
          {message}
        </div>
      )}

      {/* Appearance */}
      <SectionCard title={t.appearance}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Dark Mode */}
          <div style={rowStyle}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '3px' }}>{t.darkMode}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{darkMode ? t.darkModeOn : t.darkModeOff}</div>
            </div>
            <ToggleSwitch checked={darkMode} onChange={onDarkModeChange} />
          </div>

          {/* Language */}
          <div style={rowStyle}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '3px' }}>{t.languageLabel}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{t.languageCurrent}</div>
            </div>
            <select
              value={language}
              onChange={e => onLanguageChange(e.target.value)}
              style={{
                padding: '8px 14px', border: '1.5px solid var(--color-border)', borderRadius: '8px',
                fontSize: '13.5px', fontFamily: 'inherit', background: 'var(--bg-input)',
                color: 'var(--color-text-primary)', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="th">🇹🇭 ภาษาไทย</option>
              <option value="en">🇺🇸 English</option>
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Cloud Sync (Pro) */}
      <SectionCard title={t.syncTitle || 'คลาวด์ซิงค์ / Cloud Sync'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
            {t.syncDesc || 'อัปโหลดและดาวน์โหลดข้อมูลธุรกรรมกับเซิร์ฟเวอร์'}
          </div>
          
          {!isAuthenticated ? (
            <div style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '3px' }}>{t.syncRequiresPro || 'ฟีเจอร์นี้สงวนไว้สำหรับสมาชิกโปรเท่านั้น'}</div>
              </div>
              <button className="btn" onClick={onRequireLogin} style={{ flexShrink: 0 }}>
                {t.loginToSync || 'เข้าสู่ระบบ'}
              </button>
            </div>
          ) : !isPro ? (
            <div style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '3px' }}>{t.syncRequiresPro || 'ฟีเจอร์นี้สงวนไว้สำหรับสมาชิกโปรเท่านั้น'}</div>
              </div>
              <button className="btn" onClick={handleUpgrade} disabled={loading} style={{ flexShrink: 0 }}>
                {loading ? t.loading : (t.upgradeToPro || 'อัปเกรดเป็น Pro')}
              </button>
            </div>
          ) : (
            <div style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                  {t.syncStatus || 'สถานะซิงค์'}: <span style={{ color: isSyncing ? 'var(--accent-primary)' : 'var(--color-text-secondary)' }}>{syncStatus?.status || 'idle'}</span>
                </div>
                {syncStatus?.lastSync && (
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    {new Date(syncStatus.lastSync).toLocaleString()}
                  </div>
                )}
                {syncStatus?.message && (
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    {syncStatus.message}
                  </div>
                )}
              </div>
              <button className="btn" onClick={handleSync} disabled={isSyncing || loading} style={{ flexShrink: 0 }}>
                {isSyncing ? t.loading : (t.syncNowBtn || 'ซิงค์ข้อมูล')}
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Export & Backup */}
      <SectionCard title={t.exportBackup}>
        <div style={{ display: 'grid', gap: '12px' }}>
          {[
            { title: t.exportExcelTitle, desc: t.exportExcelDesc, action: handleExport, label: t.exportExcelBtn },
            { title: t.backupTitle, desc: t.backupDesc, action: handleBackup, label: t.backupBtn },
            { title: t.restoreTitle, desc: t.restoreDesc, action: handleRestore, label: t.restoreBtn, danger: true },
          ].map(({ title, desc, action, label, danger }) => (
            <div key={title} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '3px' }}>{title}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{desc}</div>
              </div>
              <button className={`btn ${danger ? 'btn-danger' : ''}`} onClick={action} disabled={loading} style={{ flexShrink: 0 }}>
                {loading ? t.loading : label}
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Database */}
      <SectionCard title={t.databaseSection}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={rowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '3px' }}>
                {t.useCloudStorage || 'Secure Cloud DB (Pro)'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {t.useCloudStorageDesc || 'Bypass local save and work directly on Supabase cloud.'}
              </div>
            </div>
            <ToggleSwitch
              checked={storageMode === 'cloud'}
              onChange={(val) => {
                if (!isAuthenticated || !isPro) {
                  onRequireLogin();
                  return;
                }
                setStorageMode(val ? 'cloud' : 'local');
              }}
            />
          </div>

          {/* Current path display */}
          <div style={{ padding: '12px 16px', background: 'var(--bg-card-inner)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              {t.dbCurrentPath} <span style={{ color: dbInfo.isCustom ? 'var(--accent-primary)' : 'var(--color-text-muted)', fontWeight: '700' }}>
                {dbInfo.isCustom ? t.dbCustom : t.dbDefault}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {dbInfo.path || '…'}
            </div>
          </div>

          {/* Choose DB */}
          {window.electronAPI && (
            <div style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '3px' }}>{t.dbChooseBtn}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{t.dbChooseDesc}</div>
              </div>
              <button className="btn" onClick={handleChooseDb} disabled={loading} style={{ flexShrink: 0 }}>
                {loading ? t.loading : t.dbChooseBtn}
              </button>
            </div>
          )}

          {/* Reset DB */}
          {window.electronAPI && dbInfo.isCustom && (
            <div style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)', marginBottom: '3px' }}>{t.dbResetBtn}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{t.dbResetDesc}</div>
              </div>
              <button className="btn btn-danger" onClick={handleResetDb} disabled={loading} style={{ flexShrink: 0 }}>
                {loading ? t.loading : t.dbResetBtn}
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* About */}
      <SectionCard title={t.aboutTitle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
              💰
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>{t.appName}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{t.appVersion}</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>{t.featuresTitle}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {t.featureList.map(f => (
                <div key={f} style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export default Settings;
