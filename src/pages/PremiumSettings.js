import React, { useEffect, useState } from 'react';
import PaymentService from '../services/PaymentService';
import { purchasePlan, purchaseRevenueCat, restoreRevenueCat, openStripePortal, loadSubscription, storePriceFor } from '../SubscriptionContext/SubscriptionService';
import { Capacitor } from '@capacitor/core';
import { useLanguage } from '../services/LanguageContext';
import '../styles/App.css';
import { NATIVE_BILLING_READY } from '../config/billing';

/**
 * Google Play forbids advertising or steering to any payment method other
 * than Play Billing for in-app digital goods. Until RevenueCat/Play Billing
 * is fully configured, native builds ship with no purchase UI at all —
 * no prices, no bank transfer, no external links.
 */
const IS_NATIVE = Capacitor.isNativePlatform();
/** set by `npm run build:mobile` — lets webpack dead-code-strip web-only payment data */
const IS_MOBILE_BUILD = process.env.REACT_APP_MOBILE_BUILD === 'true';

const PremiumSettings = ({ setCurrentPage, subStatus }) => {
  const { t, language } = useLanguage();
  const [packages, setPackages] = useState([]);

  /**
   * ราคาที่แสดงบนการ์ด — ดึงจากร้านก่อนเสมอ
   *
   * 🔴 แอปขาย 10 ประเทศ ผู้ใช้สิงคโปร์จ่าย SGD ไม่ใช่บาท
   * ถ้าโชว์ค่าคงที่จะเห็น "฿99" แต่ตอนจ่ายเป็น SGD 4.98 = ผิดนโยบาย Play
   * ค่าที่ส่งเป็น fallback ใช้เฉพาะตอนยังโหลดร้านไม่ได้ (ออฟไลน์ / บนเว็บ)
   */
  const priceOf = (planId, fallback) => {
    const [plan, period] = planId.split('_');
    return storePriceFor(packages, plan, period, fallback);
  };
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedChannel, setCopiedChannel] = useState('');
  const [showStatusAlert, setShowStatusAlert] = useState(!!subStatus);
  const [billingIssue, setBillingIssue] = useState(null);

  const planHighlights = [
    {
      id: 'pro_monthly',
      eyebrow: 'PRO',
      price: priceOf('pro_monthly', '฿99'),
      period: '/ ' + (language === 'th' ? 'เดือน' : 'mo'),
      subtitle: (language === 'th' ? 'สำหรับผู้ใช้งานทั่วไป' : 'For personal use'),
      recommended: false,
      points: [t.freeUpdates, language === 'th' ? 'สแกน AI 20 ครั้ง/วัน' : '20 AI scans/day', t.localDevice, t.backupRestore, t.cloudBackup],
    },
    {
      id: 'pro_yearly',
      eyebrow: 'PRO',
      price: priceOf('pro_yearly', '฿1,188'),
      period: '/ ' + (language === 'th' ? 'ปี' : 'yr'),
      subtitle: (language === 'th' ? 'คุ้มค่าที่สุด' : 'Best value'),
      recommended: true,
      points: [t.freeUpdates, language === 'th' ? 'สแกน AI 300 ครั้ง/วัน' : '300 AI scans/day', t.onlineDb, t.cloudBackup],
    },
    {
      id: 'business_monthly',
      eyebrow: 'BUSINESS',
      price: priceOf('business_monthly', '฿499'),
      period: '/ ' + (language === 'th' ? 'เดือน' : 'mo'),
      subtitle: (language === 'th' ? 'สำหรับธุรกิจขนาดเล็ก' : 'For small business'),
      recommended: false,
      points: [t.onlineDb, t.cloudBackup, t.support, language === 'th' ? 'สแกน AI 2,000 ครั้ง/วัน' : '2,000 AI scans/day', language === 'th' ? 'ออกรายงานภาษี' : 'Tax reports'],
    },
    {
      id: 'business_yearly',
      eyebrow: 'BUSINESS',
      price: priceOf('business_yearly', '฿5,988'),
      period: '/ ' + (language === 'th' ? 'ปี' : 'yr'),
      subtitle: (language === 'th' ? 'มืออาชีพ' : 'Professional'),
      recommended: false,
      points: [t.onlineDb, t.cloudBackup, t.support, language === 'th' ? 'สแกน AI ไม่จำกัด*' : 'Unlimited AI scans*', language === 'th' ? 'จัดการสต็อก' : 'Inventory'],
    },
    {
      // One-time purchase — must match the `lifetime` product price in the store
      id: 'lifetime_lifetime',
      eyebrow: 'LIFETIME',
      price: priceOf('lifetime_lifetime', '฿2,990'),
      period: language === 'th' ? '· จ่ายครั้งเดียว' : '· one-time',
      subtitle: (language === 'th' ? 'จ่ายครั้งเดียว ใช้ได้ตลอดไป ไม่มีต่ออายุ' : 'Pay once, keep forever — no renewals'),
      recommended: false,
      oneTime: true,
      points: [
        language === 'th' ? 'ได้ทุกอย่างของแผน Pro ถาวร' : 'Everything in Pro, permanently',
        t.freeUpdates,
        language === 'th' ? 'สแกน AI 300 ครั้ง/วัน' : '300 AI scans/day',
        t.cloudBackup,
        language === 'th' ? 'ไม่มีเรียกเก็บเงินซ้ำ' : 'Never billed again',
      ],
    },
  ];

  // Built with `npm run build:mobile`, the ternary folds to [] at compile time
  // so the account numbers are stripped from the bundle entirely — not merely
  // hidden at runtime. Keeps the Android artifact free of any alternative
  // payment route, which is what Play's Payments policy is about.
  const manualPaymentChannels = IS_MOBILE_BUILD ? [] : [
    { id: 'promptpay', label: 'PROMPTPAY', value: '0959987090' },
    { id: 'paynow', label: 'PAYNOW', value: '84879698' },
  ];

  const contactChannels = IS_MOBILE_BUILD ? [] : [
    { id: 'line', label: 'LINE', value: 'jawnai99' },
    { id: 'whatsapp', label: 'WHATSAPP', value: '+65 8487 9698' },
    { id: 'email', label: 'EMAIL', value: 'Rnaibro@gmail.com' },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        await PaymentService.init(); 
        
        // Use the new subscription service for better state
        const sub = await loadSubscription();
        setIsPremium(sub.plan !== 'free');

        if (sub.plan === 'free') {
            const offerings = await PaymentService.getOfferings();
            if (offerings && offerings.availablePackages) {
                setPackages(offerings.availablePackages);
            }
            // Tell the user *why* in-app purchase isn't available instead of
            // failing later with a cryptic alert when they tap a plan.
            if (Capacitor.isNativePlatform() && !offerings?.availablePackages?.length) {
              setBillingIssue(PaymentService.getUnavailableReason?.() || 'no_offerings');
            }
        }
      } catch (error) {
        console.error("Error fetching payment data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePurchase = async (pkg) => {
    try {
      setIsLoading(true);
      const res = await purchaseRevenueCat(pkg);
      if (res?.plan && res?.plan !== 'free') {
        setIsPremium(true);
        alert(t.premiumSuccess);
      }
    } catch (error) {
      if (!error?.userCancelled && !error?.message?.includes('cancelled')) {
        alert(t.error + ': ' + (error.message || error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStripePurchase = async (plan, period = 'monthly') => {
    try {
      setIsLoading(true);
      const res = await purchasePlan(plan, period);
      if (res?.plan && res?.plan !== 'free') {
        setIsPremium(true);
        alert(t.premiumSuccess);
      }
    } catch (error) {
      if (!error?.userCancelled && !error?.message?.includes('cancelled')) {
        alert(t.error + ': ' + (error.message || error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    try {
      setIsLoading(true);
      const res = await restoreRevenueCat();
      const sub = await loadSubscription();
      if (res?.plan !== 'free' || sub.plan !== 'free') {
        setIsPremium(true);
        alert(t.restoreSuccess);
      } else {
        alert(t.restoreFailed);
      }
    } catch (error) {
      alert(t.error + ': ' + (error.message || error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPayment = async (channel) => {
    try {
      await navigator.clipboard.writeText(channel.value);
      setCopiedChannel(channel.id);
      window.setTimeout(() => setCopiedChannel(''), 2000);
    } catch (error) {
      alert(t.error);
    }
  };

  return (
    <div className="premium-page page--narrow" style={styles.container}>
      {showStatusAlert && (
        <div style={{
          ...styles.statusAlert,
          backgroundColor: subStatus === 'success' ? 'rgba(46, 213, 115, 0.15)' : 'rgba(255, 71, 87, 0.15)',
          borderColor: subStatus === 'success' ? '#2ed573' : '#ff4757'
        }}>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              {subStatus === 'success' ? (language === 'th' ? 'สมัครสมาชิกสำเร็จ! 🎉' : 'Subscription Successful! 🎉') : (language === 'th' ? 'ยกเลิกรายการ' : 'Subscription Cancelled')}
            </strong>
            <small>
              {subStatus === 'success' 
                ? (language === 'th' ? 'ยินดีด้วย! คุณสามารถใช้งานฟีเจอร์ Premium ได้ครบทุกอย่างแล้ว' : 'Congrats! You now have full access to all Premium features.')
                : (language === 'th' ? 'รายการของคุณถูกยกเลิก คุณยังสามารถเลือกสมัครใหม่ได้ทุกเมื่อ' : 'Your transaction was cancelled. You can try again anytime.')}
            </small>
          </div>
          <button onClick={() => setShowStatusAlert(false)} style={styles.closeAlert} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      <div style={styles.header}>
        <button onClick={() => setCurrentPage ? setCurrentPage('dashboard') : window.history.back()} style={styles.backButton}>
          ← {t.premiumBack}
        </button>
        <h2 style={styles.title}>{t.premiumTitle}</h2>
      </div>

      <div style={styles.content}>
        {isLoading ? (
          <div style={styles.loadingContainer}>
            <div className="loading-spinner"></div>
            <p style={styles.loadingText}>{t.loadingPackages}</p>
          </div>
        ) : isPremium ? (
          <div className="premium-scroll-area">
            <div style={styles.premiumCard}>
              <div style={{ ...styles.premiumIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#fff" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <h3 style={styles.premiumTitleText}>{t.premiumStatus}</h3>
              <p style={styles.premiumDesc}>{t.premiumStatusDesc}</p>
            </div>

            <div style={styles.benefits}>
              <h3 style={styles.benefitsTitle}>{t.benefitsTitle}</h3>
              <ul style={styles.benefitsList}>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit1}</li>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit2}</li>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit3}</li>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit4}</li>
              </ul>
            </div>

            <div style={styles.footerLinks}>
              {!Capacitor.isNativePlatform() && (
                <button style={styles.portalButton} onClick={openStripePortal}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    {language === 'th' ? 'จัดการการสมัครสมาชิก (Stripe)' : 'Manage Subscription (Stripe)'}
                  </span>
                </button>
              )}

              <button style={styles.restoreButton} onClick={handleRestore}>
                {t.restorePurchases}
              </button>
            </div>
          </div>
        ) : IS_NATIVE && !NATIVE_BILLING_READY ? (
          /* Native build with billing not yet live: show the feature list only.
             No prices, no purchase buttons, no external payment routes. */
          <div className="premium-scroll-area">
            <div style={styles.benefits}>
              <h3 style={styles.benefitsTitle}>{t.benefitsTitle}</h3>
              <ul style={styles.benefitsList}>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit1}</li>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit2}</li>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit3}</li>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit4}</li>
              </ul>
            </div>

            <div className="alert alert-info" style={{ display: 'block' }}>
              <strong style={{ display: 'block', marginBottom: '4px' }}>
                {language === 'en' ? 'Coming soon' : 'เปิดให้บริการเร็ว ๆ นี้'}
              </strong>
              <span style={{ fontWeight: 400, fontSize: 'var(--text-sm)' }}>
                {language === 'en'
                  ? 'Premium plans are not available in this version yet. All current features remain free to use.'
                  : 'แพ็กเกจพรีเมียมยังไม่เปิดในเวอร์ชันนี้ ฟีเจอร์ที่มีอยู่ทั้งหมดยังใช้งานได้ฟรีตามปกติ'}
              </span>
            </div>
          </div>
        ) : (
          <div className="premium-scroll-area">
            {billingIssue && (
              <div className="alert alert-warning" style={{ display: 'block' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>
                  {language === 'en'
                    ? 'In-app purchase is unavailable right now'
                    : 'ยังซื้อในแอปไม่ได้ในขณะนี้'}
                </strong>
                <span style={{ fontWeight: 400, fontSize: 'var(--text-sm)' }}>
                  {{
                    not_configured: language === 'en'
                      ? 'Billing keys are not configured in this build.'
                      : 'บิลด์นี้ยังไม่ได้ตั้งค่าคีย์ระบบชำระเงิน',
                    no_offerings: language === 'en'
                      ? 'Google Play has not returned any packages yet. This is normal until the app is published to a test track and products are attached to an offering.'
                      : 'Google Play ยังไม่ส่งแพ็กเกจกลับมา — เป็นเรื่องปกติจนกว่าแอปจะขึ้น track ทดสอบและผูกสินค้าเข้ากับ offering แล้ว',
                    store_error: language === 'en'
                      ? 'Could not reach Google Play. Make sure you are signed in to the Play Store.'
                      : 'เชื่อมต่อ Google Play ไม่ได้ — ตรวจสอบว่าเข้าสู่ระบบ Play Store แล้ว',
                    init_failed: language === 'en'
                      ? 'Billing failed to start.'
                      : 'เริ่มระบบชำระเงินไม่สำเร็จ',
                  }[billingIssue] || (language === 'en' ? 'No packages available.' : 'ไม่มีแพ็กเกจให้เลือก')}
                  {' '}
                  {language === 'en'
                    ? 'You can subscribe on the website instead.'
                    : 'สมัครผ่านเว็บไซต์แทนได้'}
                </span>
              </div>
            )}

            <div style={styles.planGrid}>
              {planHighlights.map((plan) => (
                <div
                  key={plan.id}
                  style={{
                    ...styles.planCard,
                    ...(plan.recommended ? styles.planCardRecommended : {}),
                  }}
                >
                  <div style={styles.planHeader}>
                    <div style={styles.planHeaderInfo}>
                      <div style={styles.planEyebrow}>{plan.eyebrow}</div>
                      <div style={styles.priceContainer}>
                        <h3 style={styles.planPrice}>{plan.price}</h3>
                        <span style={styles.planPeriod}>{plan.period}</span>
                      </div>
                      <p style={styles.planSubtitle}>{plan.subtitle}</p>
                    </div>
                    {plan.recommended && <span style={styles.planBadge}>{t.recommended}</span>}
                    {plan.oneTime && (
                      <span style={{ ...styles.planBadge, backgroundColor: '#5a3f8f' }}>
                        {language === 'th' ? 'จ่ายครั้งเดียว' : 'ONE-TIME'}
                      </span>
                    )}
                  </div>

                  <div style={styles.planPoints}>
                    {plan.points.map((point) => (
                      <div key={point} style={styles.planPoint}>
                        <span style={styles.planPointIcon}>✓</span>
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>

                  <div style={styles.planAction}>
                    <button
                      style={{
                        ...styles.stripeButton,
                        ...(plan.recommended ? {} : { background: 'var(--bg-subtle)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text-primary)', boxShadow: 'none' })
                      }}
                      onClick={() => {
                        // ids are `<plan>_<period>` — lifetime_lifetime is the
                        // one-time product, everything else is a subscription
                        const [type, period] = plan.id.split('_');
                        handleStripePurchase(type, period);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                        {t.buyNow.replace('{price}', plan.price)}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.benefits}>
              <h3 style={styles.benefitsTitle}>{t.whyUpgrade}</h3>
              <ul style={styles.benefitsList}>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit1}</li>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit2}</li>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit3}</li>
                <li><span style={{ ...styles.checkIcon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t.benefit4}</li>
              </ul>
            </div>

            {/* Manual bank transfer + direct contact are WEB ONLY.
                Google Play's Payments policy forbids steering users to any
                payment method other than Play Billing for in-app digital
                goods, so none of this may render on a native build. */}
            {!IS_NATIVE && (
              <div style={styles.manualPaymentCard}>
                <div style={styles.manualPaymentHeader}>
                  <h3 style={styles.manualPaymentTitle}>{t.additionalPayment}</h3>
                  <p style={styles.manualPaymentSubtitle}>{t.manualPaymentInfo}</p>
                </div>

                <div style={styles.manualPaymentGrid}>
                  {manualPaymentChannels.map((channel) => (
                    <div key={channel.id} style={styles.manualPaymentItem}>
                      <div style={styles.channelInfo}>
                        <div style={styles.manualPaymentLabel}>{channel.label}</div>
                        <div style={styles.manualPaymentValue}>{channel.value}</div>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        style={styles.copyButton}
                        onClick={() => handleCopyPayment(channel)}
                      >
                        {copiedChannel === channel.id ? t.copied : t.copy}
                      </button>
                    </div>
                  ))}
                </div>

                <div style={styles.contactSection}>
                  <h4 style={styles.contactTitle}>{t.contactUs}</h4>
                  <div style={styles.contactGrid}>
                    {contactChannels.map((channel) => (
                      <div key={channel.id} style={styles.contactItem}>
                        <span style={styles.contactLabel}>{channel.label}</span>
                        <span style={styles.contactValue}>{channel.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div style={styles.packagesContainer}>
              {packages.length > 0 ? packages.map((pkg) => (
                <div key={pkg.identifier} style={styles.packageCard}>
                  <div style={styles.packageInfo}>
                    <h4 style={styles.pkgTitle}>{pkg.product.title}</h4>
                    <p style={styles.pkgDesc}>{pkg.product.description}</p>
                  </div>
                  <button 
                    className="btn"
                    style={styles.buyButton}
                    onClick={() => handlePurchase(pkg)}
                  >
                    {t.buyNow.replace('{price}', pkg.product.priceString)}
                  </button>
                </div>
              )) : null}
            </div>

            <div style={styles.footerLinks}>
              {!Capacitor.isNativePlatform() && (
                <button style={styles.portalButton} onClick={openStripePortal}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    {language === 'th' ? 'จัดการการสมัครสมาชิก (Stripe)' : 'Manage Subscription (Stripe)'}
                  </span>
                </button>
              )}

              <button style={styles.restoreButton} onClick={handleRestore}>
                {t.restorePurchases}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: 0,
    animation: 'pageFadeIn 0.4s ease both',
    width: '100%'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 'var(--space-6)',
    gap: 'var(--space-4)',
    flexWrap: 'wrap'
  },
  backButton: {
    background: 'var(--bg-subtle)',
    border: '1px solid var(--color-border-strong)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  title: {
    margin: 0,
    fontSize: 'var(--text-3xl)',
    fontWeight: '800',
    letterSpacing: '-0.04em',
    background: 'linear-gradient(135deg, var(--color-text-primary) 0%, var(--accent-primary) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 0',
    gap: '20px'
  },
  loadingText: {
    color: 'var(--color-text-muted)',
    fontSize: '15px'
  },
  premiumCard: {
    textAlign: 'center',
    padding: '60px 30px',
    background: 'var(--accent-gradient)',
    borderRadius: '28px',
    boxShadow: 'var(--shadow-accent)',
    color: '#fff',
    animation: 'slideUp 0.5s ease both'
  },
  premiumIcon: {
    fontSize: '64px',
    marginBottom: '20px',
    filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.3))'
  },
  premiumTitleText: {
    fontSize: '28px',
    fontWeight: '800',
    marginBottom: '12px',
    margin: 0
  },
  premiumDesc: {
    fontSize: '16px',
    opacity: 0.9,
    margin: 0,
    lineHeight: '1.6'
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
    marginBottom: '24px',
  },
  planCard: {
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '32px',
    backgroundColor: 'var(--bg-card)',
    backdropFilter: 'blur(20px)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: 'var(--shadow-sm)',
    position: 'relative',
    overflow: 'hidden'
  },
  planCardRecommended: {
    border: '2px solid var(--accent-primary)',
    background: 'linear-gradient(180deg, var(--accent-soft) 0%, var(--bg-card) 100%)',
    boxShadow: 'var(--shadow-accent)',
    transform: 'translateY(-8px)'
  },
  planHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '20px',
  },
  planEyebrow: {
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
  },
  planPrice: {
    margin: 0,
    fontSize: 'var(--text-3xl)',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    lineHeight: '1',
  },
  priceContainer: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    margin: '4px 0'
  },
  planPeriod: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    fontWeight: '600'
  },
  planSubtitle: {
    margin: '4px 0 0',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: '500',
    lineHeight: '1.4'
  },
  planBadge: {
    alignSelf: 'flex-start',
    padding: '6px 14px',
    borderRadius: '999px',
    backgroundColor: 'var(--accent-primary)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  planPoints: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginTop: 'auto'
  },
  planPoint: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '15px',
    color: 'var(--color-text-secondary)'
  },
  planPointIcon: {
    color: 'var(--color-success)',
    fontWeight: '900',
    fontSize: '18px'
  },
  benefits: {
    marginBottom: '32px',
    padding: '28px',
    backgroundColor: 'var(--bg-card-inner)',
    borderRadius: '24px',
    border: '1px solid var(--color-border)',
  },
  benefitsTitle: {
    margin: '0 0 20px',
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text-primary)'
  },
  benefitsList: {
    listStyleType: 'none',
    padding: 0,
    margin: 0,
    display: 'grid',
    gap: '16px'
  },
  checkIcon: {
    marginRight: '8px'
  },
  manualPaymentCard: {
    marginBottom: '32px',
    padding: '28px',
    borderRadius: '24px',
    backgroundColor: 'rgba(255, 143, 112, 0.05)',
    border: '1.5px dashed rgba(255, 107, 107, 0.3)',
  },
  manualPaymentHeader: {
    marginBottom: '20px',
  },
  manualPaymentTitle: {
    margin: '0 0 8px',
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text-primary)'
  },
  manualPaymentSubtitle: {
    margin: 0,
    color: 'var(--color-text-secondary)',
    fontSize: '15px',
  },
  manualPaymentGrid: {
    display: 'grid',
    gap: '16px',
  },
  manualPaymentItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    padding: '18px',
    borderRadius: '18px',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--color-border)',
  },
  channelInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  manualPaymentLabel: {
    fontSize: '11px',
    fontWeight: '800',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  manualPaymentValue: {
    fontSize: '22px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
    letterSpacing: '0.02em'
  },
  copyButton: {
    padding: '10px 20px',
    borderRadius: '14px',
    fontSize: '14px'
  },
  contactSection: {
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid var(--color-divider)',
  },
  contactTitle: {
    margin: '0 0 16px',
    fontSize: '14px',
    fontWeight: '800',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  contactGrid: {
    display: 'grid',
    gap: '12px',
  },
  contactItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    borderRadius: '16px',
    backgroundColor: 'var(--bg-subtle)',
  },
  contactLabel: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
  },
  contactValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  packagesContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  packageCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '20px',
    padding: '24px',
    gap: '20px'
  },
  packageInfo: {
    flex: 1
  },
  pkgTitle: {
    margin: '0 0 6px 0',
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary)'
  },
  pkgDesc: {
    margin: 0,
    color: 'var(--color-text-secondary)',
    fontSize: '14px',
    lineHeight: '1.4'
  },
  buyButton: {
    padding: '12px 24px',
    borderRadius: '16px',
    whiteSpace: 'nowrap'
  },
  footerLinks: {
    marginTop: '40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px'
  },
  downloadLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 24px',
    borderRadius: '16px',
    backgroundColor: '#000',
    color: '#fff',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '700',
    transition: 'transform 0.2s ease',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
  },
  playStoreIcon: {
    fontSize: '20px'
  },
  testLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 24px',
    borderRadius: '16px',
    backgroundColor: 'rgba(95, 116, 255, 0.08)',
    color: 'var(--accent-primary)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '700',
    transition: 'all 0.2s ease',
    border: '1px solid var(--accent-primary)',
    boxShadow: '0 4px 12px rgba(95, 116, 255, 0.1)'
  },
  restoreButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    padding: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    textDecoration: 'underline',
    transition: 'color 0.2s ease'
  },
  planAction: {
    marginTop: '24px',
  },
  stripeButton: {
    width: '100%',
    padding: '16px',
    borderRadius: '16px',
    border: 'none',
    background: 'linear-gradient(135deg, var(--accent-primary) 0%, #7c4dff 100%)',
    color: 'white',
    fontWeight: '800',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 10px 20px rgba(95, 116, 255, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  portalButton: {
    background: 'var(--bg-subtle)',
    border: '1px solid var(--color-border)',
    borderRadius: '16px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginBottom: '8px'
  },
  statusAlert: {
    padding: '20px',
    borderRadius: '20px',
    marginBottom: '24px',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    animation: 'slideDown 0.4s ease both'
  },
  closeAlert: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px'
  }
};

export default PremiumSettings;
