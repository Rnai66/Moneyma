import React, { useState, useEffect, useCallback } from 'react';
import {
  PLANS,
  purchasePlan,
  getRevenueCatOfferings,
  openNativeSubscriptionManagement,
  restoreRevenueCat,
  findPackage,
  storePriceFor,
  PREPARE_TIMEOUT_MS,
  STORE_SHEET_TIMEOUT_MS,
} from './SubscriptionService';
import { Capacitor } from '@capacitor/core';
import { useSubscription } from './SubscriptionContext';
import { useLanguage } from '../services/LanguageContext';
import { discountFor } from '../config/promo';
import './PaywallScreen.css';
import { NATIVE_BILLING_READY } from '../config/billing';
import { APP_ICON } from '../config/appInfo';

/** See App.js — no paywall on native until Play Billing is live. */

// ─── Feature comparison rows ─────────────────────────────────────────────────
const comparisonRows = (t) => [
  // ⚠️ ตารางนี้ต้องตรงกับสิ่งที่บังคับจริงในโค้ดเสมอ
  // โฆษณาข้อจำกัดที่ไม่มีจริง = ข้อมูลราคา/สิทธิ์ไม่ตรง เสี่ยงผิดนโยบาย Play
  // ตัวเลขอ่านจาก PLANS.free.limits โดยตรงเพื่อไม่ให้หลุดกันทีหลัง
  { label: t.pwTxPerMonth,   free: t.pwUnlimited,                                premium: t.pwUnlimited },
  { label: t.pwAiScanSlip,   free: `${PLANS.free.limits.ai_scans_per_month}/${t.pwPerMonth}`, premium: t.pwUnlimited },
  { label: t.pwBudgetLimits, free: `${PLANS.free.limits.budgets}`,               premium: t.pwUnlimited },
  { label: t.pwExport,       free: false,                                        premium: true },
  { label: t.pwCloudSync,    free: false,                                        premium: true },
  { label: t.pwAiScanBill,   free: false,                                        premium: true },
  { label: t.pwAutoScan,     free: false,                                        premium: true },
];

/**
 * ข้อเสนอ 3 ใบบน paywall
 *
 * เดิมการ์ดคือ "แผน" (free / pro / business) + สวิตช์รายเดือน-รายปี
 * ปัญหา: ผู้ใช้ต้องตัดสินใจสองชั้น และ Business ที่ไม่มีลูกค้าเป้าหมายชัด
 * ก็กินพื้นที่เท่าตัวอื่น ทำให้ลังเลนานขึ้นโดยไม่เพิ่มยอดขาย
 *
 * ตอนนี้การ์ดคือ "ข้อเสนอ" ตรง ๆ — เหลือคำถามเดียวที่ตอบง่าย:
 * จ่ายรายเดือน จ่ายทีเดียวทั้งปี หรือจ่ายครั้งเดียวจบ
 */
const IS_IOS_DEVICE = Capacitor.getPlatform() === 'ios';

const OFFERS = [
  { id: 'pro_monthly',       plan: 'pro',      period: 'monthly'  },
  { id: 'pro_yearly',        plan: 'pro',      period: 'yearly', featured: true },
  { id: 'lifetime_lifetime', plan: 'lifetime', period: 'lifetime', oneTime: true },
].filter(offer => !(IS_IOS_DEVICE && offer.oneTime));

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
  const { t } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState(null);
  const [rcPackages, setRcPackages] = useState([]);
  const [restoring, setRestoring] = useState(false);

  // Load RevenueCat offerings on mobile
  useEffect(() => {
    if (!isMobile()) return;
    getRevenueCatOfferings()
      .then((pkgs) => {
        setRcPackages(pkgs);
      })
      .catch(console.warn);
  }, []);

  // ── Purchase handler ──────────────────────────────────────────────────────
  const handlePurchase = useCallback(async (planId, period) => {
    if (planId === 'free' || planId === currentPlan || loading) return;
    setError(null);
    const planKey = planId + '_' + period;
    setLoadingPlan(planKey);
    setLoading(true);

    /**
     * ตาข่ายกันค้างชั้นสุดท้าย — ต้องยาวกว่าเพดานทุกชั้นใน SubscriptionService
     * 🔴 ห้ามกลับไปตั้ง 28 วิ: แผ่นจ่ายเงินของ Apple อาจค้างรอผู้ใช้พิมพ์รหัส
     * นานกว่านั้น ตัดกลางคันแล้วผู้ใช้จะเห็น error ทั้งที่การซื้อกำลังสำเร็จ
     */
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setLoadingPlan(null);
      setError(t.error || 'Connection timed out. Please try again.');
    }, PREPARE_TIMEOUT_MS + STORE_SHEET_TIMEOUT_MS + 5000);

    try {
      let currentPackages = rcPackages;
      if (isMobile() && (!currentPackages || currentPackages.length === 0)) {
        currentPackages = await getRevenueCatOfferings().catch(() => []);
        if (currentPackages.length > 0) setRcPackages(currentPackages);
      }

      const rcPkg = isMobile()
        ? findPackage(currentPackages, planId, period)
        : null;

      await purchasePlan(planId, period, rcPkg);
      await refresh().catch(console.warn);
      onClose?.();
    } catch (err) {
      setLoading(false);
      setLoadingPlan(null);
      if (err.message?.includes('cancelled') || err.message?.includes('cancel') || err.userCancelled) {
        // user cancelled — not an error
      } else {
        setError(err.message || t.error);
      }
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false);
      setLoadingPlan(null);
    }
  }, [currentPlan, loading, rcPackages, refresh, onClose, t]);

  // ── Restore purchases (mobile) ────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    setError(null);
    const restoreTimer = setTimeout(() => {
      setRestoring(false);
      setError(t.pwNoPurchase || 'Restore timed out. Please try again.');
    }, 22000);

    try {
      const { plan } = await restoreRevenueCat();
      await refresh().catch(console.warn);
      if (plan !== 'free') onClose?.();
      else setError(t.pwNoPurchase);
    } catch (err) {
      setError(err.message || t.pwNoPurchase);
    } finally {
      clearTimeout(restoreTimer);
      setRestoring(false);
    }
  }, [restoring, refresh, onClose, t]);


  // ── ป้ายบนปุ่มของแต่ละข้อเสนอ ─────────────────────────────────────────────
  function offerBtnLabel(offer) {
    if (loadingPlan === offer.id) return `⏳ ${t.pwProcessing}`;
    if (offer.plan === currentPlan) return `✓ ${t.pwCurrentPlanBtn}`;
    return offer.oneTime ? t.pwBuyOnce : t.pwSubscribe;
  }

  return (
    <div className="pw" role="dialog" aria-modal="true" aria-label={t.pwAriaLabel}>
      {/* Backdrop */}
      <div className="pw__backdrop" onClick={onClose} />

      <div className="pw__sheet">
        {/* Close */}
        <button className="pw__close" onClick={onClose} aria-label={t.pwClose} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {/* Header */}
        <div className="pw__header">
          <img className="pw__logo pw__logo--icon" src={APP_ICON} alt="MoneyMa" width={56} height={56} />
          <h2 className="pw__title">{t.pwTitle}</h2>
          <p className="pw__subtitle">
            {highlightFeature
              ? t.pwSubtitleFeature.replace('{feature}', highlightFeature)
              : t.pwSubtitle}
          </p>
        </div>

        {/* ข้อเสนอ 3 ใบ — ไม่มีสวิตช์รายเดือน/รายปีแล้ว การ์ดคือข้อเสนอตรง ๆ */}
        <div className="pw__plans">
          {OFFERS.map((offer) => {
            const p = PLANS[offer.plan];
            const isActive = offer.plan === currentPlan;
            const pct = discountFor(offer.period);

            const listPrice = offer.period === 'lifetime'
              ? p.price.lifetime
              : p.price[offer.period];
            const shownPrice = storePriceFor(
              rcPackages, offer.plan, offer.period, `฿${listPrice.toLocaleString()}`,
            );
            const monthlyEquiv = offer.period === 'yearly' && listPrice > 0
              ? Math.round((listPrice * (100 - pct) / 100) / 12)
              : null;

            return (
              <div key={offer.id}
                className={`pw__plan ${offer.featured ? 'pw__plan--featured' : ''} ${isActive ? 'pw__plan--current' : ''}`}>
                {offer.featured && <div className="pw__plan-badge">{t.pwBestValue}</div>}
                {offer.oneTime && <div className="pw__plan-badge pw__plan-badge--onetime">{t.pwOneTime}</div>}

                <div className="pw__plan-header">
                  <p className="pw__plan-name">{t[`pwOffer_${offer.period}`]}</p>

                  <div className="pw__plan-price">
                    {/* ราคาจากร้านมาก่อนเสมอ — ผู้ใช้ต่างประเทศต้องเห็นสกุลเงินตัวเอง */}
                    <span className="pw__plan-price-main">{shownPrice}</span>
                    {!offer.oneTime && (
                      <span className="pw__plan-price-period">
                        /{offer.period === 'yearly' ? t.pwPerYear : t.pwPerMonth}
                      </span>
                    )}
                  </div>

                  {pct > 0 && (
                    <p className="pw__plan-discount">
                      {t.pwDiscountOff.replace('{pct}', pct)}
                      {offer.period === 'monthly' && ` · ${t.pwFirstPeriodOnly}`}
                    </p>
                  )}
                  {monthlyEquiv && (
                    <p className="pw__plan-monthly-equiv">{t.pwMonthlyEquiv.replace('{n}', monthlyEquiv)}</p>
                  )}
                  {offer.oneTime && (
                    <p className="pw__plan-monthly-equiv">{t.pwNoRenewal}</p>
                  )}
                </div>

                <button
                  className={`pw__plan-btn ${isActive ? 'pw__plan-btn--current' : ''} ${offer.featured && !isActive ? 'pw__plan-btn--featured' : ''}`}
                  onClick={() => handlePurchase(offer.plan, offer.period)}
                  disabled={loading || isActive}>
                  {offerBtnLabel(offer)}
                </button>
              </div>
            );
          })}
        </div>

        {/* 🔴 ข้อความบังคับของ Play — ห้ามตัดทิ้งเพื่อความสวยงาม
            ทั้งเป็นข้อกำหนดและเป็นสิ่งที่กันรีวิว 1 ดาว "หลอกลด" ได้ดีที่สุด */}
        {discountFor('yearly') > 0 && (
          <p className="pw__promo-terms">{t.pwPromoTerms}</p>
        )}

        {/* Error */}
        {error && <p className="pw__error">{error}</p>}

        {/* Feature comparison */}
        <div className="pw__comparison">
          <p className="pw__comparison-title">{t.pwCompare}</p>
          <div className="pw__table">
            {/* Header row */}
            <div className="pw__table-header">
              <div className="pw__col-label" />
              {['free','premium'].map((c) => (
                <div key={c} className={`pw__col-plan ${c === 'premium' ? 'pw__col-plan--featured' : ''}`}>
                  {c === 'free' ? PLANS.free.nameLocal : t.pwPremium}
                  {((c === 'free' && currentPlan === 'free') ||
                    (c === 'premium' && currentPlan !== 'free')) && <span className="pw__col-you"> ✓</span>}
                </div>
              ))}
            </div>

            {/* Rows */}
            {comparisonRows(t).map((row, i) => (
              <div key={i} className="pw__table-row">
                <div className="pw__col-label">{row.label}</div>
                {['free','premium'].map((c) => {
                  const val = row[c];
                  return (
                    <div key={c} className={`pw__col-val ${c === 'premium' ? 'pw__col-val--featured' : ''}`}>
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
              {restoring ? t.pwRestoring : t.pwRestore}
            </button>
          )}
          {currentPlan !== 'free' && (
            <button className="pw__footer-link" onClick={openNativeSubscriptionManagement}>
              {t.pwManageSub}
            </button>
          )}
          <p className="pw__footer-legal">
            {t.pwPaymentNote.replace('{store}', isMobile() ? 'App Store / Google Play' : 'Stripe')}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '11px', marginTop: '6px' }}>
            <a 
              href="https://moneyma-app.netlify.app/terms-of-service.html" 
              target="_system" 
              rel="noopener noreferrer" 
              onClick={(e) => {
                e.preventDefault();
                window.open('https://moneyma-app.netlify.app/terms-of-service.html', '_system');
              }}
              style={{ color: 'var(--accent-primary)', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Terms of Service (EULA)
            </a>
            <span>•</span>
            <a 
              href="https://moneyma-app.netlify.app/privacy-policy.html" 
              target="_system" 
              rel="noopener noreferrer" 
              onClick={(e) => {
                e.preventDefault();
                window.open('https://moneyma-app.netlify.app/privacy-policy.html', '_system');
              }}
              style={{ color: 'var(--accent-primary)', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Privacy Policy
            </a>
          </div>
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

  // Native builds must not render a paywall until Play Billing is configured —
  // showing prices without a working Play purchase path breaks Play policy.
  if (Capacitor.isNativePlatform() && !NATIVE_BILLING_READY) return null;

  return <PaywallScreen onClose={closePaywall} highlightFeature={paywallFeature} />;
}
