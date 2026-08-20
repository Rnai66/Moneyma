import React from 'react';
import { Capacitor } from '@capacitor/core';
import { useSubscription } from '../SubscriptionContext/SubscriptionContext';
import './UpgradeModal.css';
import { NATIVE_BILLING_READY } from '../config/billing';

/** See App.js — no purchase CTAs on native until Play Billing is live. */
const CAN_SELL = !Capacitor.isNativePlatform() || NATIVE_BILLING_READY;

/**
 * UpgradeModal - A beautiful, high-converting popup to notify free users
 * that they have hit a limit (transactions, budgets, etc.) and seamlessly
 * guide them to the upgrade screen.
 *
 * @param {boolean} isOpen - Controlled visibility
 * @param {function} onClose - Closing trigger
 * @param {string} title - Heading text
 * @param {string} description - Details about the reached limit
 * @param {string} feature - Feature key for context highlighting (e.g., 'unlimited_tx')
 * @param {object} t - Language translations dictionary
 */
export default function UpgradeModal({
  isOpen,
  onClose,
  title,
  description,
  feature,
  t
}) {
  const { openPaywall } = useSubscription();

  if (!isOpen) return null;

  const handleUpgradeClick = () => {
    onClose?.();
    openPaywall?.(feature);
  };

  // Safe translations fallback
  const txtTitle = title || t?.upgradeTitle;
  const txtDesc = description || t?.upgradeDesc;
  const txtCta = t?.upgradeCta;
  const txtCancel = t?.maybeLater;

  // Feature highlight mapping
  const featureList = {
    unlimited_tx: [
      t?.featUnlimitedTx,
      t?.featCloudSync,
      t?.featExcel
    ],
    budget_limits: [
      t?.featUnlimitedBudgets,
      t?.featAlert,
      t?.featVisuals
    ]
  };

  const currentFeatures = featureList[feature] || [
    t?.featUnlimitedTx,
    t?.featCloudSync,
    t?.featExcel,
  ];

  return (
    <div className="upg-backdrop" role="dialog" aria-modal="true" aria-labelledby="upg-title-id">
      <div className="upg-sheet">
        <button className="upg-close" onClick={onClose} aria-label="Close modal" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        
        <div className="upg-icon-wrap" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--accent-primary)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </div>
        
        <h3 id="upg-title-id" className="upg-title">{txtTitle}</h3>
        <p className="upg-desc" dangerouslySetInnerHTML={{ __html: txtDesc }} />
        
        <div className="upg-features">
          {currentFeatures.map((feat, index) => (
            <div key={index} className="upg-feature-item">
              <span className="upg-feature-check">✓</span>
              <span>{feat}</span>
            </div>
          ))}
        </div>
        
        <div className="upg-actions">
          {CAN_SELL ? (
            <>
              <button className="upg-btn-primary" onClick={handleUpgradeClick}>
                {txtCta}
              </button>
              <button className="upg-btn-secondary" onClick={onClose}>
                {txtCancel}
              </button>
            </>
          ) : (
            <button className="upg-btn-primary" onClick={onClose}>
              {t?.gotIt}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
