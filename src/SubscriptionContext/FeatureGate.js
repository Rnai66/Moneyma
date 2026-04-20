import React from 'react';
import { useFeatureGate, useSubscription } from '../contexts/SubscriptionContext';
import './FeatureGate.css';

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

const FEATURE_LABELS = {
  cloud_sync:       { icon: '☁️', label: 'Cloud Sync',           plan: 'Pro' },
  ai_scan_slip:     { icon: '🤖', label: 'AI Scan สลิป',         plan: 'Pro' },
  ai_scan_bill:     { icon: '🧾', label: 'AI Scan บิล',           plan: 'Pro' },
  auto_scan_batch:  { icon: '🔍', label: 'Auto-scan อัตโนมัติ',   plan: 'Pro' },
  export_excel:     { icon: '📊', label: 'Export Excel',          plan: 'Pro' },
  export_pdf:       { icon: '📄', label: 'Export PDF',            plan: 'Pro' },
  budget_limits:    { icon: '🎯', label: 'Budget Limits',         plan: 'Pro' },
  slip_verify:      { icon: '✅', label: 'Slip Verify',            plan: 'Pro' },
  unlimited_tx:     { icon: '∞',  label: 'ธุรกรรมไม่จำกัด',       plan: 'Pro' },
  multi_workspace:  { icon: '🏢', label: 'หลาย Workspace',         plan: 'Business' },
  api_access:       { icon: '⚡', label: 'API Access',            plan: 'Business' },
  priority_support: { icon: '🎖️', label: 'Priority Support',     plan: 'Business' },
};

export default function FeatureGate({ feature, children, mode = 'block', className = '' }) {
  const { allowed, requirePro } = useFeatureGate(feature);
  const { loading } = useSubscription();
  const meta = FEATURE_LABELS[feature] ?? { icon: '🔒', label: feature, plan: 'Pro' };

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
            <strong>{meta.label}</strong> ใช้ได้ใน {meta.plan}
          </span>
          <span className="fg-overlay-cta">อัปเกรด →</span>
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
      <p className="fg-block__subtitle">ฟีเจอร์นี้ใช้ได้ใน {meta.plan} เท่านั้น</p>
      <div className="fg-block__btn">อัปเกรดเป็น {meta.plan}</div>
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
  const meta = FEATURE_LABELS[feature] ?? { icon: '🔒', label: feature, plan: 'Pro' };
  if (allowed) return null;
  return (
    <button className="fg-nudge" onClick={requirePro}>
      <span className="fg-nudge__badge">{meta.plan}</span>
      <span className="fg-nudge__label">ปลดล็อค {meta.label}</span>
      <span className="fg-nudge__arrow">→</span>
    </button>
  );
}
