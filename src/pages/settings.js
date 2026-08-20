import React, { useRef, useState } from 'react';
import {
  backupLocalDataBrowser,
  exportTransactionsToExcelBrowser,
  restoreLocalBackupFile,
} from '../utils/dataTransfer';
import { useAuth } from '../services/AuthContext';
import { useSync } from '../services/useSync';
import { checkAiLimit } from '../services/AiUsageService';
import SupabaseService from '../services/SupabaseService';
import { useSubscription } from '../SubscriptionContext/SubscriptionContext';
import { APP_VERSION, APP_ICON } from '../config/appInfo';
import ExportCustomizerModal from '../components/ExportCustomizerModal';

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track"><span className="switch-knob" /></span>
      <span className="switch-label">{checked ? 'ON' : 'OFF'}</span>
    </button>
  );
}

function SectionCard({ title, children }) {
  return (
    <section className="panel">
      <div className="panel-header" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="section-title-bar">{title}</span>
      </div>
      {children}
    </section>
  );
}

/* one consistent settings row: label + description on the left, control on the right */
function SettingRow({ title, description, children, extra }) {
  return (
    <div className="setting-row">
      <div className="setting-row-copy">
        <strong>{title}</strong>
        {description && <p>{description}</p>}
        {extra}
      </div>
      {children && <div className="setting-row-control">{children}</div>}
    </div>
  );
}

function Settings({ darkMode, onDarkModeChange, language, onLanguageChange, transactions, onDataRestored, onRequireLogin, onSignOut, onSyncNow, lastSyncedAt, t, storageMode, setStorageMode }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dbInfo, setDbInfo] = useState({ path: '', isCustom: false });
  const [showExportModal, setShowExportModal] = useState(false);
  const restoreInputRef = useRef(null);

  const { user, isAuthenticated, isPro } = useAuth();
  const { syncStatus, manualSync, isSyncing } = useSync();
  const plan = useSubscription()?.plan;   // ทน ๆ ไว้ เผื่อ Settings ถูกเรนเดอร์นอก provider
  const [aiUsage, setAiUsage] = useState(null);

  React.useEffect(() => {
    if (isAuthenticated) {
      checkAiLimit().then(res => setAiUsage(res)).catch(() => {});
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    setDbInfo({ path: 'localStorage / Capacitor WebView', isCustom: false });
  }, []);

  const run = async (fn) => {
    try { setLoading(true); setMessage(''); await fn(); }
    catch (e) { console.error(e); setMessage(t.error || e?.message || 'Error'); }
    finally { setLoading(false); }
  };

  const handleSync = () => run(async () => {
    if (onSyncNow) {
      await onSyncNow();
      setMessage(`✅ ${t.syncNowBtn}`);
      return;
    }
    const mergedTransactions = await manualSync(transactions);
    if (mergedTransactions) {
      localStorage.setItem('webTransactions', JSON.stringify(mergedTransactions));
      if (onDataRestored) await onDataRestored();
    }
  });

  const handleSignOut = () => {
    if (!window.confirm(t.signOutConfirm)) return;
    run(async () => { await onSignOut?.(); });
  };

  /**
   * ลบบัญชีถาวร — Google Play บังคับให้แอปที่มีสมาชิกต้องมีปุ่มนี้
   *
   * ยืนยัน 3 ชั้น เพราะกู้คืนไม่ได้:
   *   1. เตือนว่าจะเสียอะไรบ้าง + แนะให้ export ก่อน
   *   2. ถ้ายังมีสมาชิกอยู่ บอกให้ไปยกเลิกที่ Play ก่อน (การลบบัญชีไม่หยุดการเรียกเก็บเงิน)
   *   3. ให้พิมพ์คำยืนยัน — กันกดพลาด
   */
  const handleDeleteAccount = () => {
    if (!window.confirm(t.deleteAccountWarning)) return;

    if (plan && plan !== 'free') {
      if (!window.confirm(t.deleteAccountSubActive)) return;
    }

    const typed = window.prompt(t.deleteAccountConfirmPrompt);
    if (typed === null) return;                       // กด Cancel
    if (typed.trim() !== t.deleteAccountConfirmWord) {
      setMessage(t.deleteAccountMismatch);
      return;
    }

    run(async () => {
      setMessage(t.deleteAccountDeleting);
      const { success, error } = await SupabaseService.deleteAccount();
      if (!success) {
        throw new Error(error?.message || t.deleteAccountFailed);
      }
      window.alert(t.deleteAccountSuccess);
      // บัญชีหายไปแล้ว — พากลับหน้าแรกเพื่อให้แอปโหลด state ใหม่ทั้งหมด
      window.location.replace('/');
    });
  };

  const handleExport = () => run(async () => {
    const r = await exportTransactionsToExcelBrowser(transactions);
    setMessage(r.success ? `✅ ${r.filename}` : (r.message || t.cancel));
  });

  const handleBackup = () => run(async () => {
    const r = await backupLocalDataBrowser();
    setMessage(r.success ? `✅ ${r.filename}` : (r.message || t.cancel));
  });

  const handleRestore = () => {
    if (!window.confirm(t.restoreConfirm)) return;
    run(async () => { restoreInputRef.current?.click(); });
  };

  const handleRestoreFile = () => run(async () => {
    const file = restoreInputRef.current?.files?.[0];
    const r = await restoreLocalBackupFile(file);
    restoreInputRef.current.value = '';
    await onDataRestored?.();
    setMessage(r.success ? `✅ ${r.message}` : (r.message || t.cancel));
  });

  const isSuccess = String(message || '').startsWith('✅');

  const fullName = [user?.user_metadata?.firstName, user?.user_metadata?.lastName].filter(Boolean).join(' ');

  const quotaItems = aiUsage ? [
    {
      label: t.quotaDaily,
      value: `${aiUsage.usage?.dailyCount || 0} / ${aiUsage.limits?.ai_scans_per_day === Infinity ? '∞' : aiUsage.limits?.ai_scans_per_day}`,
    },
    {
      label: t.quotaMonthly,
      value: `${aiUsage.usage?.monthlyCount || 0} / ${aiUsage.limits?.ai_scans_per_month === Infinity ? '∞' : aiUsage.limits?.ai_scans_per_month}`,
    },
    ...(aiUsage.limits?.ai_scans_per_month !== Infinity ? [{
      label: t.quotaRemaining,
      value: `${Math.max(0, aiUsage.limits.ai_scans_per_month - (aiUsage.usage?.monthlyCount || 0))}`,
      accent: true,
    }] : []),
  ] : [];

  return (
    <div className="page page--narrow">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t.settingsSubtitle}</span>
          <h1>{t.settingsTitle}</h1>
          <p>{t.settingsSubtitle}</p>
        </div>
      </header>

      <input
        ref={restoreInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleRestoreFile}
      />

      {message && (
        <div className={`alert ${isSuccess ? 'alert-success' : 'alert-danger'}`}>{message}</div>
      )}

      {/* ── profile ── */}
      <SectionCard title={t.userProfile}>
        {isAuthenticated && user ? (
          <div className="stack">
            <div className="setting-row">
              <div className="setting-row-copy">
                <strong>{fullName || t.userLabel}</strong>
                <p style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  {user.email}
                </p>
                {user.user_metadata?.tel && (
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    {user.user_metadata.tel}
                  </p>
                )}
              </div>
              <span className={`tag ${isPro ? 'tag-plan-pro' : 'tag-neutral'}`}>
                {isPro ? 'PREMIUM' : 'FREE'}
              </span>
            </div>

            {aiUsage && (
              <div className="quota-card">
                <div className="section-title-bar" style={{ marginBottom: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  {t.aiUsageTitle}
                </div>
                <div className="quota-grid">
                  {quotaItems.map(({ label, value, accent }) => (
                    <div key={label} className="quota-item">
                      <span>{label}</span>
                      <strong className="num" style={accent ? { color: 'var(--accent-primary)' } : undefined}>{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <p>{t.notLoggedInProfile}</p>
            <button className="btn" style={{ marginTop: 'var(--space-3)' }} onClick={onRequireLogin}>
              {t.loginToSync}
            </button>
          </div>
        )}
      </SectionCard>

      {/* ── appearance ── */}
      <SectionCard title={t.appearance}>
        <div className="stack-sm">
          <SettingRow title={t.darkMode} description={darkMode ? t.darkModeOn : t.darkModeOff}>
            <ToggleSwitch checked={darkMode} onChange={onDarkModeChange} label={t.darkMode} />
          </SettingRow>

          <SettingRow title={t.languageLabel} description={t.languageCurrent}>
            <select
              value={language}
              onChange={e => onLanguageChange(e.target.value)}
              style={{ minWidth: '170px' }}
            >
              <option value="th">ภาษาไทย (TH)</option>
              <option value="en">English (US)</option>
            </select>
          </SettingRow>
        </div>
      </SectionCard>

      {/* ── cloud sync ── */}
      <SectionCard title={t.syncTitle}>
        <p className="panel-subtitle" style={{ marginBottom: 'var(--space-4)' }}>
          {t.syncDesc}
        </p>

        {!isAuthenticated ? (
          <SettingRow
            title={t.signInToSync}
            description={t.signInToSyncDesc}
          >
            <button className="btn" onClick={onRequireLogin}>{t.loginToSync}</button>
          </SettingRow>
        ) : (
          <SettingRow
            title={t.syncStatus}
            description={syncStatus?.message}
            extra={
              <div className="cluster" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <span className={`tag ${isSyncing ? 'tag-info' : syncStatus?.status === 'failed' ? 'tag-danger' : 'tag-success'}`}>
                  {isSyncing
                    ? t.syncStateSyncing
                    : syncStatus?.status === 'failed'
                      ? t.syncStateFailed
                      : t.syncStateUpToDate}
                </span>
                {lastSyncedAt && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {new Date(lastSyncedAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}
                  </span>
                )}
              </div>
            }
          >
            <button className="btn" onClick={handleSync} disabled={isSyncing || loading}>
              ⟳ {isSyncing ? t.loading : t.syncNowBtn}
            </button>
          </SettingRow>
        )}
      </SectionCard>

      {/* ── account ── */}
      {isAuthenticated && (
        <SectionCard title={t.accountSection}>
          <SettingRow
            title={t.signOutBtn}
            description={t.signOutDesc}
          >
            <button className="btn btn-danger" onClick={handleSignOut} disabled={loading || isSyncing}>
              {t.signOutBtn}
            </button>
          </SettingRow>

          {/* ลบบัญชี — Google Play บังคับให้มีในแอป คู่กับหน้าเว็บ /delete-account.html */}
          <SettingRow
            title={t.deleteAccountTitle}
            description={t.deleteAccountDesc}
          >
            <button
              className="btn btn-danger"
              onClick={handleDeleteAccount}
              disabled={loading || isSyncing}
            >
              {t.deleteAccountBtn}
            </button>
          </SettingRow>
        </SectionCard>
      )}

      {/* ── export & backup ── */}
      <SectionCard title={t.exportBackup}>
        <div className="stack-sm">
          <SettingRow title={t.customizeStatementBtn || "ปรับแต่งสเตทเมนต์ / แบบฟอร์มรายงาน"} description={t.customizeStatementDesc || "เลือกคอลัมน์ ใส่โลโก้/เลขผู้เสียภาษี และออกรายงานสเตทเมนต์ PDF/HTML มืออาชีพ"}>
            <button className="btn" style={{ background: 'var(--accent-primary)', color: '#fff' }} onClick={() => setShowExportModal(true)}>
              {t.customizeStatementBtn || "⚙️ ปรับแต่งแบบฟอร์ม & ส่งออก"}
            </button>
          </SettingRow>

          {[
            { title: t.exportExcelTitle, desc: t.exportExcelDesc, action: handleExport, label: t.exportExcelBtn },
            { title: t.backupTitle, desc: t.backupDesc, action: handleBackup, label: t.backupBtn },
            { title: t.restoreTitle, desc: t.restoreDesc, action: handleRestore, label: t.restoreBtn, danger: true },
          ].map(({ title, desc, action, label, danger }) => (
            <SettingRow key={title} title={title} description={desc}>
              <button className={`btn ${danger ? 'btn-danger' : 'btn-ghost'}`} onClick={action} disabled={loading}>
                {loading ? t.loading : label}
              </button>
            </SettingRow>
          ))}
        </div>
      </SectionCard>

      <ExportCustomizerModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        transactions={transactions}
        t={t}
      />

      {/* ── database ── */}
      <SectionCard title={t.databaseSection}>
        <div className="stack-sm">
          <SettingRow
            title={t.useCloudStorage || 'Secure Cloud DB (Pro)'}
            description={t.useCloudStorageDesc || 'Bypass local save and work directly on Supabase cloud.'}
          >
            <ToggleSwitch
              checked={storageMode === 'cloud'}
              label={t.useCloudStorage}
              onChange={(val) => {
                if (!isAuthenticated || !isPro) { onRequireLogin(); return; }
                setStorageMode(val ? 'cloud' : 'local');
              }}
            />
          </SettingRow>

          <div className="code-block">
            <span className="code-block-label">
              {t.dbCurrentPath}{' '}
              <b style={{ color: dbInfo.isCustom ? 'var(--accent-primary)' : 'var(--color-text-muted)' }}>
                {dbInfo.isCustom ? t.dbCustom : t.dbDefault}
              </b>
            </span>
            <code>{dbInfo.path || '…'}</code>
          </div>
        </div>
      </SectionCard>

      {/* ── about ── */}
      <SectionCard title={t.aboutTitle}>
        <div className="stack">
          <div className="cluster" style={{ gap: 'var(--space-4)', flexWrap: 'nowrap' }}>
            {/* ไอคอนจริงที่แอปใช้ (ตัวเดียวกับ manifest) ไม่ใช่อีโมจิ 💰 */}
            <img
              className="about-mark about-mark--icon"
              src={APP_ICON}
              alt={t.appName}
              width={48}
              height={48}
            />
            <div>
              <strong style={{ fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>{t.appName}</strong>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{t.appTagline}</p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                {APP_VERSION ? `${t.appVersion.replace('{v}', APP_VERSION)} · ` : ''}{t.appStack}
              </p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-4)' }}>
            <div className="section-title-bar" style={{ marginBottom: 'var(--space-3)' }}>{t.featuresTitle}</div>
            <div className="feature-grid">
              {t.featureList.map(f => (
                <div key={f} className="feature-item" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                  <span>{f}</span>
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
