import React, { useState, useEffect, useCallback } from 'react';
import {
  PLANS,
  purchasePlan,
  getRevenueCatOfferings,
  openStripePortal,
  restoreRevenueCat,
} from './SubscriptionService';
import { useSubscription } from './SubscriptionContext';
import './PaywallScreen.css';

// ─── Feature comparison rows ─────────────────────────────────────────────────
const COMPARISON_ROWS = [
  {
    label: 'ธุรกรรมต่อเดือน',
    free: '50 รายการ',
    pro: 'ไม่จำกัด',
    business: 'ไม่จำกัด',
  },
  {
    label: 'Cloud Sync',
    free: false,
    pro: true,
    business: true,
  },
  {
    label: 'AI Scan สลิป',
    free: false,
    pro: '200 สแกน/เดือน',
    business: 'ไม่จำกัด',
  },
  {
    label: 'AI Scan บิล/ใบเสร็จ',
    free: false,
    pro: true,
    business: true,
  },
  {
    label: 'Auto-scan Gallery',
    free: false,
    pro: true,
    business: true,
  },
  {
    label: 'Slip Verify API',
    free: false,
    pro: true,
    business: true,
  },
  {
    label: 'Budget Limits',
    free: '1 หมวด',
    pro: 'ไม่จำกัด',
    business: 'ไม่จำกัด',
  },
  {
    label: 'Export Excel / PDF',
    free: false,
    pro: true,
    business: true,
  },
  {
    label: 'หลาย Workspace',
    free: false,
    pro: false,
    business: true,
  },
  {
    label: 'API Access',
    free: false,
    pro: false,
    business: true,
  },
  {
    label: 'Priority Support',
    free: false,
    pro: false,
    business: true,
  },
];

// ─── Platform helper ─────────────────────────────────────────────────────────
function isMobile() {
  try {
    const { Capacitor } = require('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// ─── Main PaywallScreen ──────────────────────────────────────────────────────
export default function PaywallScreen({ onClose, highlightFeature }) {
  const { plan: currentPlan, refresh } = useSubscription();

  const [period, setPeriod] = useState('yearly'); // 'monthly' | 'yearly'
  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState(null);
  const [rcPackages, setRcPackages] = useState({});
  const [restoring, setRestoring] = useState(false);

  // Load RevenueCat offerings on mobile
  useEffect(() => {
    if (!isMobile()) return;
    getRevenueCatOfferings()
      .then((pkgs) => {
        const map = {};
        pkgs.forEach((pkg) => { map[pkg.identifier] = pkg; });
        setRcPackages(map);
      })
      .catch(console.warn);
  }, []);

  // ── Purchase handler ──────────────────────────────────────────────────────
  const handlePurchase = useCallback(async (planId) => {
    if (planId === 'free' || planId === currentPlan) return;
    setError(null);
    setLoadingPlan(planId);
    setLoading(true);

    try {
      const rcPkg = isMobile()
        ? (rcPackages[`allslip_${planId}_${period}`] ?? null)
        : null;

      await purchasePlan(planId, period, rcPkg);
      await refresh();
      onClose?.();
    } catch (err) {
      if (err.message?.includes('cancelled') || err.message?.includes('cancel')) {
        // user cancelled — not an error
      } else {
        setError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } finally {
      setLoading(false);
      setLoadingPlan(null);
    }
  }, [currentPlan, period, rcPackages, refresh, onClose]);

  // ── Restore purchases (mobile) ────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    setRestoring(true);
    setError(null);
    try {
      const { plan } = await restoreRevenueCat();
      await refresh();
      if (plan !== 'free') onClose?.();
    } catch (err) {
      setError(err.message || 'ไม่พบการซื้อที่บันทึกไว้');
    } finally {
      setRestoring(false);
    }
  }, [refresh, onClose]);

  // ── Yearly savings calc ───────────────────────────────────────────────────
  function yearlySavings(planId) {
    const p = PLANS[planId];
    if (!p || !p.price.monthly) return 0;
    const monthlyTotal = p.price.monthly * 12;
    return Math.round(((monthlyTotal - p.price.yearly) / monthlyTotal) * 100);
  }

  // ── Plan button label ─────────────────────────────────────────────────────
  function planBtnLabel(planId) {
    if (loadingPlan === planId) return '⏳ กำลังดำเนินการ...';
    if (planId === currentPlan) return '✓ แผนปัจจุบัน';
    if (planId === 'free') return 'ใช้แบบฟรี';
    return `เริ่มใช้ ${PLANS[planId]?.nameLocal}`;
  }

  return (
    <div className="pw" role="dialog" aria-modal="true" aria-label="เลือก Plan">
      {/* Backdrop */}
      <div className="pw__backdrop" onClick={onClose} />

      <div className="pw__sheet">
        {/* Close */}
        <button className="pw__close" onClick={onClose} aria-label="ปิด">✕</button>

        {/* Header */}
        <div className="pw__header">
          <div className="pw__logo">💰</div>
          <h2 className="pw__title">อัปเกรด Allslip</h2>
          <p className="pw__subtitle">
            {highlightFeature
              ? `ปลดล็อค ${highlightFeature} และฟีเจอร์ Pro อื่นๆ`
              : 'ปลดล็อคทุกฟีเจอร์ AI สแกนสลิป บิล และ Cloud Sync'}
          </p>
        </div>

        {/* Period toggle */}
        <div className="pw__period-toggle">
          <button
            className={`pw__period-btn ${period === 'monthly' ? 'pw__period-btn--active' : ''}`}
            onClick={() => setPeriod('monthly')}>
            รายเดือน
          </button>
          <button
            className={`pw__period-btn ${period === 'yearly' ? 'pw__period-btn--active' : ''}`}
            onClick={() => setPeriod('yearly')}>
            รายปี
            <span className="pw__period-save">ประหยัด {yearlySavings('pro')}%</span>
          </button>
        </div>

        {/* Plan cards */}
        <div className="pw__plans">
          {['free', 'pro', 'business'].map((planId) => {
            const p = PLANS[planId];
            const isActive = planId === currentPlan;
            const isFeatured = planId === 'pro';
            const price = period === 'yearly' ? p.price.yearly : p.price.monthly;
            const monthlyEquiv = period === 'yearly' && p.price.yearly > 0
              ? (p.price.yearly / 12).toFixed(0)
              : null;

            return (
              <div key={planId}
                className={`pw__plan ${isFeatured ? 'pw__plan--featured' : ''} ${isActive ? 'pw__plan--current' : ''}`}>
                {isFeatured && <div className="pw__plan-badge">แนะนำ</div>}
                {isActive && !isFeatured && <div className="pw__plan-badge pw__plan-badge--current">ปัจจุบัน</div>}

                <div className="pw__plan-header">
                  <p className="pw__plan-name">{p.nameLocal}</p>
                  <div className="pw__plan-price">
                    {price === 0 ? (
                      <span className="pw__plan-price-main">ฟรี</span>
                    ) : (
                      <>
                        <span className="pw__plan-price-main">฿{price.toLocaleString()}</span>
                        <span className="pw__plan-price-period">
                          /{period === 'yearly' ? 'ปี' : 'เดือน'}
                        </span>
                      </>
                    )}
                  </div>
                  {monthlyEquiv && price > 0 && (
                    <p className="pw__plan-monthly-equiv">฿{monthlyEquiv}/เดือน</p>
                  )}
                </div>

                <button
                  className={`pw__plan-btn ${isActive ? 'pw__plan-btn--current' : ''} ${isFeatured && !isActive ? 'pw__plan-btn--featured' : ''}`}
                  onClick={() => handlePurchase(planId)}
                  disabled={loading || isActive}>
                  {planBtnLabel(planId)}
                </button>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && <p className="pw__error">{error}</p>}

        {/* Feature comparison */}
        <div className="pw__comparison">
          <p className="pw__comparison-title">เปรียบเทียบฟีเจอร์</p>
          <div className="pw__table">
            {/* Header row */}
            <div className="pw__table-header">
              <div className="pw__col-label" />
              {['free','pro','business'].map((p) => (
                <div key={p} className={`pw__col-plan ${p === 'pro' ? 'pw__col-plan--featured' : ''}`}>
                  {PLANS[p].nameLocal}
                  {p === currentPlan && <span className="pw__col-you"> ✓</span>}
                </div>
              ))}
            </div>

            {/* Rows */}
            {COMPARISON_ROWS.map((row, i) => (
              <div key={i} className="pw__table-row">
                <div className="pw__col-label">{row.label}</div>
                {['free','pro','business'].map((p) => {
                  const val = row[p];
                  return (
                    <div key={p} className={`pw__col-val ${p === 'pro' ? 'pw__col-val--featured' : ''}`}>
                      {val === true  ? <span className="pw__check">✓</span>
                      : val === false ? <span className="pw__cross">—</span>
                      : <span className="pw__val-text">{val}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="pw__footer">
          {isMobile() && (
            <button className="pw__footer-link" onClick={handleRestore} disabled={restoring}>
              {restoring ? 'กำลังกู้คืน...' : 'กู้คืนการซื้อ'}
            </button>
          )}
          {!isMobile() && currentPlan !== 'free' && (
            <button className="pw__footer-link" onClick={openStripePortal}>
              จัดการ Subscription
            </button>
          )}
          <p className="pw__footer-legal">
            ชำระเงินผ่าน {isMobile() ? 'App Store / Google Play' : 'Stripe'} · ยกเลิกได้ทุกเมื่อ
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * PaywallTrigger — thin wrapper that reads showPaywall from context
 * and renders PaywallScreen when open.
 *
 * Place once near the root of your app:
 *   <PaywallTrigger />
 */
export function PaywallTrigger() {
  const { showPaywall, closePaywall, paywallFeature } = useSubscription();
  if (!showPaywall) return null;
  return <PaywallScreen onClose={closePaywall} highlightFeature={paywallFeature} />;
}
