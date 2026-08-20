import React from 'react';
import { Capacitor } from '@capacitor/core';
import { useSubscription } from '../SubscriptionContext/SubscriptionContext';
import { useLanguage } from '../services/LanguageContext';
import { discountFor, daysLeft, isPromoActive } from '../config/promo';
import { NATIVE_BILLING_READY } from '../config/billing';
import './PromoBanner.css';

/**
 * แถบโปรโมชันพร้อมนับถอยหลัง
 *
 * ทุกอย่างอ่านจาก `src/config/promo.js` — ห้าม hardcode เลข 40 หรือวันที่ตรงนี้
 * ไม่งั้นพอ 1 ม.ค. แบนเนอร์จะยังโชว์ทั้งที่ Play ปิด offer ไปแล้ว
 * = ราคาที่แสดงไม่ตรงกับตอนจ่ายจริง ซึ่งผิดนโยบายการแสดงราคาของ Play
 *
 * เงื่อนไขที่ต้องผ่านครบถึงจะแสดง:
 *   1. อยู่ในช่วงโปรจริง
 *   2. ผู้ใช้ยังเป็น free — คนที่จ่ายแล้วไม่ควรโดนตื๊อขายซ้ำ
 *   3. ถ้าอยู่บนมือถือ ต้องเปิด Play Billing แล้ว
 *      (Google ห้ามโฆษณาสินค้าที่ผู้ใช้กดซื้อไม่ได้)
 */
/**
 * ตัดสินว่าจะแสดงแบนเนอร์ไหม — แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อทดสอบได้
 *
 * @param {object}  o
 * @param {boolean} o.loading       สถานะสมาชิกยังโหลดไม่เสร็จ
 * @param {string}  o.plan          'free' | 'pro' | 'business' | 'lifetime'
 * @param {boolean} o.isNative      อยู่บนแอปมือถือหรือไม่
 * @param {boolean} o.billingReady  NATIVE_BILLING_READY
 * @param {Date}    [o.now]
 */
export function shouldShowPromoBanner({ loading, plan, isNative, billingReady, now = new Date() }) {
  // 1. อย่ากะพริบแบนเนอร์ตอนยังไม่รู้ว่าเขาเป็นสมาชิกอยู่หรือเปล่า
  if (loading) return false;

  // 2. ต้องอยู่ในช่วงโปรจริง และมีส่วนลดจริง
  if (!isPromoActive(now) || discountFor('yearly', now) <= 0) return false;

  // 3. คนที่จ่ายแล้วไม่ควรโดนตื๊อขายซ้ำ
  if (plan && plan !== 'free') return false;

  // 4. บนมือถือ ถ้ายังเปิด Play Billing ไม่ได้ ห้ามโฆษณา
  //    Google ห้ามโปรโมตสินค้าที่ผู้ใช้กดซื้อไม่ได้
  if (isNative && !billingReady) return false;

  return true;
}

export default function PromoBanner() {
  const { t } = useLanguage();
  const sub = useSubscription();
  const plan = sub?.plan;
  const openPaywall = sub?.openPaywall;

  const pct = discountFor('yearly');
  const days = daysLeft();

  const visible = shouldShowPromoBanner({
    loading: !!sub?.loading,
    plan,
    isNative: Capacitor.isNativePlatform(),
    billingReady: NATIVE_BILLING_READY,
  });
  if (!visible) return null;

  const urgent = days <= 7;

  return (
    <button
      type="button"
      className={`promo-banner ${urgent ? 'promo-banner--urgent' : ''}`}
      onClick={() => openPaywall?.('promo_banner')}
      aria-label={t.promoBannerAria}
    >
      <span className="promo-banner__badge">-{pct}%</span>
      <span className="promo-banner__text">
        <strong>{t.promoBannerTitle.replace('{pct}', pct)}</strong>
        <span className="promo-banner__days">
          {days === 1
            ? t.promoBannerLastDay
            : t.promoBannerDaysLeft.replace('{n}', days)}
        </span>
      </span>
      <span className="promo-banner__cta" aria-hidden="true">›</span>
    </button>
  );
}
