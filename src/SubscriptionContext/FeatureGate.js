import React from 'react';
import { useFeatureGate, useSubscription } from './SubscriptionContext';
import './FeatureGate.css';
import { useLanguage } from '../services/LanguageContext';

/**
 * FeatureGate — wraps any UI that requires a paid plan.
 *
 * Usage (block mode — replaces content with upgrade card):
 *   <FeatureGate feature="ai_scan_slip">
 *     <ScanSlip />
 *   </FeatureGate>
 *
 * Usage (inline mode — renders children + shows overlay on top):
 *   <FeatureGate feature="export_excel" mode="overlay">
 *     <ExportButton />
 *   </FeatureGate>
 *
 * Usage (silent mode — just hides):
 *   <FeatureGate feature="multi_workspace" mode="hide">
 *     <WorkspacePanel />
 *   </FeatureGate>
 */

const featureLabels = (t) => ({
  cloud_sync:       { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>, label: 'Cloud Sync',         plan: 'Pro' },
  ai_scan_slip:     { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: t.fgAiScanSlip,       plan: 'Pro' },
  ai_scan_bill:     { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/></svg>, label: t.fgAiScanBill,       plan: 'Pro' },
  auto_scan_batch:  { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, label: t.fgAutoScan,         plan: 'Pro' },
  export_excel:     { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, label: 'Export Excel',       plan: 'Pro' },
  export_pdf:       { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, label: 'Export PDF',         plan: 'Pro' },
  budget_limits:    { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></svg>, label: 'Budget Limits',      plan: 'Pro' },
  slip_verify:      { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, label: 'Slip Verify',        plan: 'Pro' },
  unlimited_tx:     { icon: <span style={{ fontWeight: 800, fontSize: '18px' }}>∞</span>, label: t.fgUnlimitedTx,      plan: 'Pro' },
  multi_workspace:  { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>, label: t.fgMultiWorkspace,   plan: 'Business' },
  api_access:       { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, label: 'API Access',         plan: 'Business' },
  priority_support: { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>, label: 'Priority Support',   plan: 'Business' },
});

export default function FeatureGate({ feature, children, mode = 'block', className = '' }) {
  const { allowed, requirePro } = useFeatureGate(feature);
  const { loading } = useSubscription();
  const { t } = useLanguage();
  const meta = featureLabels(t)[feature] ?? { icon: '🔒', label: feature, plan: 'Pro' };

  if (loading) return null;
  if (allowed) return <>{children}</>;

  if (mode === 'hide') return null;

  if (mode === 'overlay') {
    return (
      <div className={`fg-overlay-wrap ${className}`}>
        <div className="fg-overlay-blur">{children}</div>
        <div className="fg-overlay-prompt" onClick={requirePro}>
          <span className="fg-overlay-icon">{meta.icon}</span>
          <span className="fg-overlay-text">
            {t.fgAvailableIn.split('{feature}').map((part, i) => (
              i === 0 ? <React.Fragment key={i}>{part}</React.Fragment>
                      : <React.Fragment key={i}><strong>{meta.label}</strong>{part.replace('{plan}', meta.plan)}</React.Fragment>
            ))}
          </span>
          <span className="fg-overlay-cta">{t.fgUpgradeArrow} →</span>
        </div>
      </div>
    );
  }

  // Default: block mode
  return (
    <div className={`fg-block ${className}`} onClick={requirePro} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && requirePro()}>
      <div className="fg-block__icon">{meta.icon}</div>
      <p className="fg-block__title">{meta.label}</p>
      <p className="fg-block__subtitle">{t.fgOnlyIn.replace('{plan}', meta.plan)}</p>
      <div className="fg-block__btn">{t.fgUpgradeTo.replace('{plan}', meta.plan)}</div>
    </div>
  );
}

/**
 * Inline upgrade nudge — use inside a list item or settings row.
 *
 * <UpgradeNudge feature="budget_limits" />
 */
export function UpgradeNudge({ feature }) {
  const { allowed, requirePro } = useFeatureGate(feature);
  const { t } = useLanguage();
  const meta = featureLabels(t)[feature] ?? { icon: '🔒', label: feature, plan: 'Pro' };
  if (allowed) return null;
  return (
    <button className="fg-nudge" onClick={requirePro}>
      <span className="fg-nudge__badge">{meta.plan}</span>
      <span className="fg-nudge__label">{t.fgUnlock.replace('{feature}', meta.label)}</span>
      <span className="fg-nudge__arrow">→</span>
    </button>
  );
}
