/**
 * SubscriptionService.js
 *
 * Handles the full subscription lifecycle across platforms:
 *   Mobile (iOS/Android) → RevenueCat via @revenuecat/purchases-capacitor
 *   Web (Browser)        → Stripe Checkout (hosted page)
 *   Backend              → Supabase `subscriptions` table (source of truth)
 *
 * Platform detection is automatic — callers never need to branch.
 */

import SupabaseService from '../services/SupabaseService';
import { tr } from '../i18n/lang';
import paymentService from '../services/PaymentService';
import { Capacitor } from '@capacitor/core';
import { ensureConfigured, getPurchases } from '../services/rcClient';

const supabase = SupabaseService.getClient();

// ─── Plan / Feature definitions ─────────────────────────────────────────────

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    get nameLocal() { return tr().planFree; },
    price: { monthly: 0, yearly: 0 },
    currency: 'THB',
    color: '#6b6b66',
    limits: {
      // เลิกกั้นการบันทึกรายการ — การจดคือการสร้างนิสัย ห้ามมีแรงเสียดทาน
      // เพดาน 50/เดือนเดิมทำให้ผู้ใช้ชนกำแพงราววันที่ 12 ตอนที่ยังไม่ทันเห็นคุณค่า
      // ผลคือลบแอป ไม่ใช่จ่ายเงิน
      transactions_per_month: Infinity,
      budgets: 3,
      // 🔴 ตัวเลขที่สำคัญที่สุดของ free tier
      // 300 สแกน/เดือนคือมากพอที่ผู้ใช้ทั่วไปไม่มีวันชนเพดาน
      // = แจกจุดขายเดียวที่แอปมีให้ฟรีถาวร ไม่เหลืออะไรให้ขาย
      // 20/เดือนพอให้ติดใจ แต่ไม่พอให้อยู่ฟรีตลอด
      ai_scans_per_day: 5,
      ai_scans_per_month: 20,
      export: false,
      cloud_sync: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    get nameLocal() { return tr().planPro; },
    // 🔴 ราคาฝั่ง iOS ยึดตาม App Store Connect เท่านั้น (ยืนยันในหน้าเว็บ 1 ก.ย. 2026)
    // ฿99 / เดือน · ฿1,190 / ปี  (US $2.99 / $29.99)
    // ห้ามอ่านราคาจากไฟล์ .storekit เพียงอย่างเดียว — ไฟล์นั้นเป็นสำเนาที่ค้างได้
    // เคยพลาดมาแล้วสองทาง: ตั้ง 1188 ในโค้ดโดยไม่แก้ ASC และแก้เป็น 990 ตามไฟล์ที่ค้าง
    // ลำดับที่ถูก: แก้ที่ ASC → re-sync .storekit จาก Xcode → แล้วค่อยแก้บรรทัดนี้
    price: { monthly: 99, yearly: 1190 },
    currency: 'THB',
    color: '#2c6e49',
    get badge() { return tr().badgeRecommended; },
    limits: {
      transactions_per_month: Infinity,
      budgets: Infinity,
      ai_scans_per_day: 300,
      ai_scans_per_month: 5000,
      export: true,
      cloud_sync: true,
    },
  },
  business: {
    id: 'business',
    name: 'Business',
    get nameLocal() { return tr().planBusiness; },
    price: { monthly: 499, yearly: 5990 },   // ตรงกับ App Store Connect (US $12.99 / $179.99)
    currency: 'THB',
    color: '#7c5c1e',
    get badge() { return '🎁 ทดลองใช้ฟรี 7 วัน'; },
    trialDays: 7,
    limits: {
      transactions_per_month: Infinity,
      budgets: Infinity,
      ai_scans_per_day: 2000,
      ai_scans_per_month: 20000,
      export: true,
      cloud_sync: true,
      multi_workspace: true,
      api_access: true,
      priority_support: true,
    },
  },
  /**
   * One-time purchase — Pro features with no renewal.
   * NOTE: `price.lifetime` must match the price of the Google Play /
   * App Store product; the store is the source of truth at checkout.
   */
  lifetime: {
    id: 'lifetime',
    name: 'Lifetime',
    get nameLocal() { return tr().planLifetime; },
    // 2.51 เท่าของรายปีราคาตั้ง (฿1,190) — อยู่ในเกณฑ์ปลอดภัย 2.5–3 เท่า
    // เดิม ฿1,990 = 1.68 เท่า ซึ่งตึงเกินไป: คนคิดเลขเป็นจะซื้อ Lifetime หมด
    // ได้เงินก้อนเดียวจบ แต่ยังแบกค่า cloud sync + Gemini ของคนนั้นตลอดชีวิต
    price: { lifetime: 2990 },
    currency: 'THB',
    color: '#5a3f8f',
    get badge() { return tr().badgeOneTime; },
    oneTime: true,
    limits: {
      transactions_per_month: Infinity,
      budgets: Infinity,
      ai_scans_per_day: 300,
      ai_scans_per_month: 5000,
      export: true,
      cloud_sync: true,
    },
  },
};

export const BUSINESS_TRIAL_KEY = 'moneyma_business_trial_start';
export const BUSINESS_TRIAL_DAYS = 7;

/**
 * Checks or initializes the 7-day Business Plan free trial for any user.
 */
export function getBusinessTrialInfo() {
  try {
    let startStr = localStorage.getItem(BUSINESS_TRIAL_KEY);
    if (!startStr) {
      startStr = Date.now().toString();
      localStorage.setItem(BUSINESS_TRIAL_KEY, startStr);
    }
    const startTime = parseInt(startStr, 10);
    const trialDurationMs = BUSINESS_TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const elapsedMs = Date.now() - startTime;
    const remainingMs = trialDurationMs - elapsedMs;

    if (remainingMs > 0) {
      const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
      return {
        isTrialActive: true,
        remainingDays,
        trialEnd: new Date(startTime + trialDurationMs),
      };
    }
  } catch (e) {
    console.error('Error calculating trial info:', e);
  }
  return { isTrialActive: false, remainingDays: 0, trialEnd: null };
}

/** Plans that never expire — used by loadSubscription() and the paywall. */
export const ONE_TIME_PLANS = ['lifetime'];

/** Which plans can access each feature */
export const FEATURE_GATES = {
  // lifetime and pro subscriptions unlock all premium features
  cloud_sync: ['pro', 'business', 'lifetime'],
  ai_scan_slip: ['free', 'pro', 'business', 'lifetime'],
  ai_scan_bill: ['free', 'pro', 'business', 'lifetime'],
  auto_scan_batch: ['pro', 'business', 'lifetime'],
  export_excel: ['pro', 'business', 'lifetime'],
  export_pdf: ['pro', 'business', 'lifetime'],
  budget_limits: ['pro', 'business', 'lifetime'],
  slip_verify: ['pro', 'business', 'lifetime'],
  unlimited_tx: ['pro', 'business', 'lifetime'],
  stock_management: ['pro', 'business', 'lifetime'],
  pos_billing: ['pro', 'business', 'lifetime'],
  multi_warehouse: ['pro', 'business', 'lifetime'],
  multi_workspace: ['pro', 'business', 'lifetime'],
  api_access: ['pro', 'business', 'lifetime'],
  priority_support: ['pro', 'business', 'lifetime'],
};

export function canAccess(userPlan, feature) {
  const allowed = FEATURE_GATES[feature];
  if (!allowed) return true; // unknown feature = open
  return allowed.includes(userPlan ?? 'free');
}

// ─── Platform detection ──────────────────────────────────────────────────────

function isMobile() {
  try {
    const { Capacitor } = require('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// ─── RevenueCat (mobile) ─────────────────────────────────────────────────────

/**
 * ห้ามตั้งธง init ของตัวเองในไฟล์นี้อีก
 * เดิมไฟล์นี้มีธงหนึ่งใบ ส่วน PaymentService มีอีกใบ ธงสองใบไม่รู้จักกัน
 * Purchases.configure() จึงถูกเรียกซ้ำ StoreKit listener ถูกรีเซ็ตกลางคัน
 * promise ของการซื้อค้างไม่ resolve = สาเหตุที่โดน reject ตามข้อ 2.1a
 * ตอนนี้ทั้งแอปใช้ ensureConfigured() ของ src/services/rcClient.js ที่เดียว
 */
async function getRC() {
  return getPurchases();
}

/**
 * Map RevenueCat product IDs to our plan IDs.
 * Set these in your RevenueCat dashboard to match.
 */
const RC_PRODUCT_TO_PLAN = {
  // product ID จริงใน Google Play / RevenueCat (ยืนยัน 17 ส.ค. 2026)
  // Play ไม่ให้แก้หรือใช้ product ID ซ้ำหลังสร้างแล้ว — ชื่อชุดนี้จึงถาวร
  monthly: 'pro',
  yearly: 'pro',
  lifetime: 'lifetime',
};

/**
 * Work out which of our plans an identifier refers to.
 * Store/dashboard naming drifts (`pro_monthly`, `monthly`, `$rc_monthly`,
 * `allslip_pro_yearly`, …) so match on substrings rather than exact keys.
 * @returns {'pro'|'business'|'lifetime'|null}
 */
export function planFromIdentifier(identifier) {
  if (!identifier) return null;
  const id = String(identifier).toLowerCase();

  if (RC_PRODUCT_TO_PLAN[identifier]) return RC_PRODUCT_TO_PLAN[identifier];

  if (id.includes('lifetime') || id.includes('onetime') || id.includes('one_time')) return 'lifetime';
  if (id.includes('business') || id.includes('biz')) return 'business';
  if (id.includes('pro') || id.includes('monthly') || id.includes('annual') || id.includes('yearly')) return 'pro';

  return null;
}

/** Normalise a billing period from any identifier flavour. */
function periodFromIdentifier(identifier) {
  const id = String(identifier || '').toLowerCase();
  if (id.includes('lifetime') || id.includes('onetime') || id.includes('one_time')) return 'lifetime';
  if (id.includes('annual') || id.includes('year')) return 'yearly';
  if (id.includes('month')) return 'monthly';
  return null;
}

/**
 * Find the RevenueCat package for a plan + period, tolerating every naming
 * convention we've seen: custom (`pro_monthly`), bare (`monthly`) and the
 * RevenueCat defaults (`$rc_monthly`, `$rc_annual`, `$rc_lifetime`).
 *
 * Falls back progressively so a half-configured dashboard still works:
 *   1. exact custom id            pro_monthly
 *   2. plan + period both match   (business_yearly vs $rc_annual in a "business" offering)
 *   3. period matches only       monthly / $rc_monthly
 *
 * @param {Array} packages  offering.availablePackages
 * @param {string} plan     'pro' | 'business' | 'lifetime'
 * @param {string} period   'monthly' | 'yearly' | 'lifetime'
 */
export function findPackage(packages = [], plan, period) {
  if (!packages.length) return null;

  const wanted = plan === 'lifetime' ? 'lifetime' : period;
  const exactId = `${plan}_${period}`;

  const idOf = (p) => p?.identifier ?? '';
  const productIdOf = (p) => p?.product?.identifier ?? p?.product?.productId ?? '';

  // 1. exact custom identifier on package or product
  const exact = packages.find(p =>
    idOf(p) === exactId || productIdOf(p) === exactId
  );
  if (exact) return exact;

  // 2. plan and period both derivable and matching
  const both = packages.find(p => {
    const blob = `${idOf(p)} ${productIdOf(p)}`;
    return planFromIdentifier(blob) === plan && periodFromIdentifier(blob) === wanted;
  });
  if (both) return both;

  // 3. period alone (covers $rc_monthly / $rc_annual / $rc_lifetime)
  return packages.find(p => {
    const blob = `${idOf(p)} ${productIdOf(p)}`;
    return periodFromIdentifier(blob) === wanted;
  }) || null;
}

/**
 * แพ็กเกจที่ได้มาเป็นของแผนที่ขอจริงหรือเปล่า
 *
 * 🔴 findPackage() มีขั้นสุดท้ายที่จับคู่ด้วย "รอบบิลอย่างเดียว" เพื่อให้ชื่อ
 * มาตรฐานของ RevenueCat ($rc_monthly) ใช้กับแผน pro ได้ ผลข้างเคียงคือ
 * ถามหา business/monthly แล้วจะได้ $rc_monthly (ซึ่งเป็น pro) กลับมา
 *
 * ใช้ยามด่านนี้ทุกครั้งที่ผลของ findPackage() จะไปโผล่ต่อหน้าผู้ใช้
 * — ทั้งตอนแสดงราคา และตอนกดจ่ายเงิน
 */
export function packageMatchesPlan(pkg, plan) {
  if (!pkg) return false;
  const matched = planFromIdentifier(
    `${pkg.identifier ?? ''} ${pkg.product?.identifier ?? ''}`,
  );
  return matched === plan;
}

/**
 * ราคาที่จะแสดงให้ผู้ใช้เห็น — เอาจากร้านเสมอถ้าหาได้
 *
 * 🔴 ทำไมถึงสำคัญ: แอปเปิดขายหลายประเทศ ผู้ใช้สิงคโปร์จ่าย SGD ไม่ใช่บาท
 * ถ้าแสดงราคาจากค่าคงที่ในโค้ด เขาจะเห็น "฿99" แต่ตอนกดจ่ายเป็น SGD 4.98
 * — สับสน และผิดนโยบายการแสดงราคาของ Google Play
 *
 * `priceString` จาก RevenueCat จัดรูปแบบและสกุลเงินมาให้ตามประเทศของผู้ใช้แล้ว
 * และเป็น "ราคาที่จะถูกเก็บจริง" รวมส่วนลดจาก offer ที่เปิดอยู่ด้วย
 *
 * @param {Array}  packages  แพ็กเกจจาก getRevenueCatOfferings()
 * @param {string} plan      'pro' | 'business' | 'lifetime'
 * @param {string} period    'monthly' | 'yearly' | 'lifetime'
 * @param {string} fallback  ราคาที่จะใช้เมื่อยังโหลดร้านไม่ได้ (เช่น ออฟไลน์)
 */
export function storePriceFor(packages, plan, period, fallback = '') {
  const pkg = findPackage(packages ?? [], plan, period);
  if (!pkg) return fallback;

  // ถ้าแพ็กเกจที่ได้ไม่ใช่ของแผนที่ขอ ให้ตกไปใช้ fallback แทนที่จะโชว์ราคาผิดแผน
  if (!packageMatchesPlan(pkg, plan)) return fallback;

  return pkg.product?.priceString || fallback;
}

/** ราคาฝั่งไทยไว้ใช้เป็น fallback ตอนออฟไลน์ — ร้านคือแหล่งความจริงเสมอ */
/**
 * 🔴 ราคาสำรองฝั่ง Android แยกจาก iOS โดยตั้งใจ
 *
 * `PLANS[].price` ยึดตาม `ios/App/App/Subscriptions.storekit` = App Store Connect
 * แต่ Play Console ตั้งราคาของตัวเอง (และตอนนี้มีโปรอยู่) คนละชุดกัน
 * ถ้าใช้ค่าเดียวกันทั้งสองแพลตฟอร์ม ผู้ใช้ Android ตอนออฟไลน์จะเห็นราคา App Store
 * ซึ่งไม่ใช่ราคาที่ Play เก็บจริง = ผิดนโยบายการแสดงราคาของ Play
 *
 * ค่าที่ใช้จริงยังมาจากร้านเสมอผ่าน `storePriceFor()` — ตารางนี้ใช้ตอนถามร้านไม่ได้เท่านั้น
 * แก้ราคาใน Play Console เมื่อไหร่ ให้มาแก้ตารางนี้ ไม่ใช่ไปแก้ `PLANS`
 */
const ANDROID_FALLBACK_PRICE = {
  pro:      { monthly: 99,  yearly: 1188 },
  business: { monthly: 499, yearly: 5990 },
  lifetime: { lifetime: 2990 },
};

/** ราคาตั้ง (ตัวเลข) ของแพลตฟอร์มที่กำลังรันอยู่ */
export function listPriceFor(plan, period) {
  let isAndroid = false;
  try {
    isAndroid = Capacitor.getPlatform() === 'android';
  } catch {
    isAndroid = false;
  }
  const table = isAndroid
    ? (ANDROID_FALLBACK_PRICE[plan] || PLANS[plan]?.price)
    : PLANS[plan]?.price;
  if (!table) return null;
  const n = period === 'lifetime' ? table.lifetime : table[period];
  return typeof n === 'number' ? n : null;
}

/**
 * ราคาสำหรับ "แสดงบนการ์ด" — ถาม StoreKit ตรง ๆ ห้ามเชื่อราคาในแพ็กเกจของ offering
 *
 * 🔴 เหตุผล (เจอจริงบน TestFlight 11 ก.ย. 2026)
 * การ์ดขึ้น "$2.99" แต่แผ่นจ่ายเงินของ Apple ตัด "฿99.00" — คนละสกุลเงินกันเลย
 * ราคาบนการ์ดมาจาก `pkg.product.priceString` ของ offering ซึ่ง RevenueCat
 * ประกอบจากข้อมูลฝั่งเซิร์ฟเวอร์ของตัวเอง (ราคาฐานเป็น USD) ได้ในบางจังหวะ
 * โดยเฉพาะช่วงที่ StoreKit ยังคืนสินค้าไม่ได้ แล้วค่านั้นถูกแคชค้างไว้
 *
 * `getProducts()` วิ่งไปถาม StoreKit บนเครื่องโดยตรง จึงได้ราคาตามหน้าร้าน
 * ของบัญชีผู้ใช้จริง ซึ่งเป็นตัวเดียวกับที่จะถูกตัดเงิน
 *
 * ราคาที่แสดงต้องตรงกับราคาที่เก็บจริงเสมอ (Guideline 3.1.2) — ผิดข้อนี้
 * คือโดนรีเจกต์ ไม่ใช่แค่ผู้ใช้งง
 *
 * @returns {Promise<Record<string, {priceString: string, price: number, currencyCode: string}>>}
 *          คีย์คือ product identifier · คืน {} เมื่อถามไม่ได้ (ให้ผู้เรียกตกไปใช้ค่าสำรอง)
 */
export async function fetchDisplayPrices(productIdentifiers = []) {
  if (!isMobile() || !productIdentifiers.length) return {};
  try {
    const state = await initRevenueCat();
    if (!state || state.ok !== true) return {};
    const RC = await getRC();
    const res = await withTimeout(
      RC.getProducts({ productIdentifiers }),
      10000,
      'getProducts (display prices) timed out'
    );
    const map = {};
    (res?.products || []).forEach((pr) => {
      if (!pr?.identifier) return;
      map[pr.identifier] = {
        priceString: pr.priceString,
        price: pr.price,
        currencyCode: pr.currencyCode,
      };
    });
    console.log(
      '[RC] ราคาจาก StoreKit:',
      Object.entries(map).map(([k, v]) => `${k}=${v.priceString}(${v.currencyCode})`).join(' · ') || '(ว่าง)'
    );
    return map;
  } catch (e) {
    console.warn('[RC] ขอราคาจาก StoreKit ไม่สำเร็จ:', e?.message || e);
    return {};
  }
}

export function fallbackPriceTHB(plan, period) {
  const n = listPriceFor(plan, period);
  return typeof n === 'number' ? `฿${n.toLocaleString()}` : '';
}

export function withTimeout(promise, ms = 20000, errorMsg = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        const err = new Error(errorMsg);
        err.code = 'TIMEOUT';
        err.isTimeout = true;
        reject(err);
      }, ms);
      if (promise && typeof promise.finally === 'function') {
        promise.finally(() => clearTimeout(timer));
      }
    }),
  ]);
}

/**
 * เตรียม RevenueCat ให้พร้อมใช้ - เรียกซ้ำได้ ไม่ throw ไม่ค้าง
 *
 * เรียกได้ทันทีที่แอปเปิดโดยไม่ต้องรอ Supabase หรือการ login
 * ไม่ส่ง userId = SDK ใช้ anonymous app user ทำให้โหมดผู้เยี่ยมชม (guest)
 * กดซื้อได้เลย ซึ่งเป็นเส้นทางที่ผู้ตรวจของ Apple ใช้ทดสอบ
 */
export async function initRevenueCat(userId = null) {
  if (!isMobile()) return { ok: false, reason: 'web' };
  return ensureConfigured(userId);
}

/** true เมื่อ SDK พร้อมขายจริง */
export async function isBillingReady() {
  const state = await initRevenueCat();
  return !!state?.ok;
}

export async function getRevenueCatOfferings() {
  if (!isMobile()) return [];
  await initRevenueCat().catch(console.warn);
  const RC = await getRC();
  try {
    const offeringsPromise = RC.getOfferings();
    const { offerings } = await withTimeout(offeringsPromise, 15000, 'Loading offerings timed out');
    if (offerings.current?.availablePackages?.length) {
      return offerings.current.availablePackages;
    }
    if (offerings.all) {
      const anyOffering = Object.values(offerings.all).find(o => o?.availablePackages?.length);
      if (anyOffering?.availablePackages?.length) {
        return anyOffering.availablePackages;
      }
    }
  } catch (e) {
    console.warn('RC getOfferings failed or timed out:', e);
  }

  // Fallback direct StoreKit product query
  try {
    const productsPromise = RC.getProducts({ productIdentifiers: ['pro_monthly', 'pro_yearly', 'business_monthly', 'business_yearly'] });
    const { products } = await withTimeout(productsPromise, 10000, 'Loading products timed out');
    if (products?.length) {
      return products.map(p => ({
        identifier: p.identifier,
        packageType: p.identifier.includes('yearly') ? 'ANNUAL' : 'MONTHLY',
        product: p,
      }));
    }
  } catch (e) {
    console.warn('RC getProducts fallback failed:', e);
  }
  return [];
}

/**
 * StoreProduct ของจริงจากร้านมีราคาติดมาด้วยเสมอ (priceString / price)
 *
 * 🔴 กับดักที่ทำให้ปุ่มค้าง: ตอน offerings ว่าง หน้า UI เคยประกอบวัตถุปลอม
 * `{ identifier, product: { identifier } }` แล้วส่งเข้า purchaseStoreProduct
 * ฝั่ง native จะได้ dictionary ที่ไม่ใช่ StoreProduct จริง บาง build ของ
 * plugin จะไม่ callback กลับมาเลย = promise ไม่ resolve ไม่ reject
 * ตัวช่วยนี้กรองของปลอมทิ้ง แล้วบังคับให้ไปเส้นทาง getProducts() แทน
 */
function isRealStoreProduct(product) {
  if (!product || typeof product !== 'object') return false;
  if (!product.identifier) return false;
  return product.priceString != null || product.price != null;
}

/** เวลาสูงสุดของ "ช่วงเตรียม" (configure + ถามสินค้าจากร้าน) ก่อนแผ่นจ่ายเงินโผล่ */
export const PREPARE_TIMEOUT_MS = 15000;
/**
 * เพดานของช่วง "รอผู้ใช้จ่ายเงินบนแผ่นของ App Store"
 * 🔴 ห้ามตั้งสั้น: promise ของ purchasePackage จะ resolve ก็ต่อเมื่อผู้ใช้กด
 * ยืนยัน/ยกเลิกบนแผ่นของ Apple เสร็จ ถ้าตั้ง 25 วิ ผู้ตรวจที่พิมพ์รหัส
 * sandbox ช้ากว่านั้นจะโดนตัดกลางคันแล้วเห็น error ทั้งที่ระบบปกติดี
 * ตั้งเป็นเพดานกันค้างถาวรเท่านั้น
 */
export const STORE_SHEET_TIMEOUT_MS = 600000;

/**
 * @param {object} rcPackage
 * @param {{ onPhase?: (phase: 'preparing'|'awaiting_store') => void }} [opts]
 */
export async function purchaseRevenueCat(rcPackage, opts = {}) {
  const onPhase = typeof opts.onPhase === 'function' ? opts.onPhase : () => {};
  let customerInfo = null;
  const targetId = rcPackage?.product?.identifier || rcPackage?.identifier || (typeof rcPackage === 'string' ? rcPackage : null);

  console.log('[RC] Initiating purchase for targetId:', targetId, rcPackage);

  const timeoutMsg = (Capacitor.getPlatform() === 'ios')
    ? (tr().error === 'เกิดข้อผิดพลาด'
        ? 'การเชื่อมต่อกับ Apple StoreKit หมดเวลา โปรดลองใหม่อีกครั้ง'
        : 'Apple StoreKit connection timed out. Please try again.')
    : 'Billing connection timed out. Please try again.';

  try {
    /**
     * แยกเป็น 2 ช่วงโดยตั้งใจ
     *  1) preparing     — configure + ถามสินค้าจากร้าน: เร็ว ต้องมี timeout สั้น
     *  2) awaiting_store — แผ่นจ่ายเงินของ Apple โผล่แล้ว: ช้าได้ตามผู้ใช้
     * เดิมครอบรวมกันที่ 25 วิ ทำให้ตัดสินใจผิดทั้งสองทาง คือค้างนานเกินไป
     * ตอนเตรียม และตัดกลางคันตอนผู้ใช้กำลังจ่ายเงินจริง
     */
    onPhase('preparing');

    // ป้ายบอกขั้นล่าสุดที่เดินผ่าน — เวลา timeout จะได้รู้ว่าค้างตรงไหนจริง ๆ
    // ไม่ใช่ได้แค่ "TIMEOUT" เปล่า ๆ แล้วต้องมานั่งเดา
    const at = { step: 'configure' };

    const prepare = async () => {
      const state = await initRevenueCat();
      if (state && state.ok === false && state.reason !== 'web') {
        /**
         * 🔴 ต้องแปะโค้ดเหตุผลไปกับข้อความที่ผู้ใช้เห็นด้วย
         *
         * ตอนทดสอบผ่าน TestFlight บนเครื่องจริงเราอ่าน console ไม่ได้
         * ถ้าข้อความบอกแค่ "ซื้อไม่ได้" ก็ไล่สาเหตุต่อไม่ได้เลย ต้องเดาอย่างเดียว
         * โค้ดสั้น ๆ ท้ายข้อความทำให้ผู้ทดสอบส่งภาพหน้าจอมาแล้วรู้ทันทีว่าติดตรงไหน
         * (configure_timeout = ปลั๊กอินไม่ตอบ · plugin_missing = ไบนารีไม่มีปลั๊กอิน
         *  init_failed = SDK โยน error · not_configured = คีย์ไม่ถูกฝังตอน build)
         */
        const reason = state.reason || 'unknown';
        const err = new Error(
          tr().error === 'เกิดข้อผิดพลาด'
            ? `ยังเชื่อมต่อระบบชำระเงินไม่ได้ โปรดลองใหม่อีกครั้ง [${reason}]`
            : `In-app purchases are unavailable right now. Please try again. [${reason}]`
        );
        err.code = 'BILLING_UNAVAILABLE';
        err.reason = reason;
        throw err;
      }
      at.step = 'load-sdk';
      const RC = await getRC();
      at.step = 'pick-product';

      // 1. package จาก offering จริง ($rc_monthly, $rc_annual, …) — เส้นทางปกติ
      if (rcPackage?.packageType && rcPackage?.identifier && rcPackage?.presentedOfferingContext) {
        return { RC, kind: 'package', payload: rcPackage };
      }
      // 2. StoreProduct ของจริงที่ร้านคืนมา (ต้องมีราคาติดมา ไม่งั้นถือว่าปลอม)
      if (isRealStoreProduct(rcPackage?.product)) {
        return { RC, kind: 'product', payload: rcPackage.product };
      }
      if (isRealStoreProduct(rcPackage)) {
        return { RC, kind: 'product', payload: rcPackage };
      }
      // 3. มีแค่ product id — ต้องถามร้านให้ได้ของจริงก่อนเสมอ
      if (targetId) {
        at.step = 'store-getProducts';
        console.log('[RC] ถามร้านหาสินค้า:', targetId);
        const { products } = await RC.getProducts({ productIdentifiers: [targetId] });
        console.log('[RC] ร้านตอบ', products?.length || 0, 'รายการ:',
          (products || []).map((pr) => `${pr.identifier}=${pr.priceString}`).join(', ') || '(ว่าง)');
        if (products && products.length > 0) {
          return { RC, kind: 'product', payload: products[0] };
        }
        const err = new Error(
          tr().error === 'เกิดข้อผิดพลาด'
            ? 'ยังไม่พบสินค้านี้ในร้าน โปรดลองใหม่ภายหลัง'
            : `This product isn't available in the store yet: ${targetId}`
        );
        err.code = 'PRODUCT_NOT_FOUND';
        throw err;
      }
      if (rcPackage?.packageType) {
        return { RC, kind: 'package', payload: rcPackage };
      }
      throw new Error('Invalid package or product for purchase');
    };

    /**
     * ข้อความของช่วงเตรียมต้องต่างจากช่วงรอแผ่นจ่ายเงิน
     * ช่วงนี้ค้าง = ร้านไม่ตอบ (ยังไม่อนุมัติสินค้า / ไม่ได้เปิด StoreKit config
     * บนซิมูเลเตอร์ / บัญชี sandbox ไม่ถูกต้อง) ไม่ใช่ "เน็ตช้า"
     * บอกให้ตรงจะได้ไม่ไล่ผิดทางเหมือนรอบที่แล้ว
     */
    const prepareTimeoutMsg = tr().error === 'เกิดข้อผิดพลาด'
      ? 'ร้านค้ายังไม่ตอบกลับ ตอนนี้จึงยังซื้อไม่ได้ โปรดลองใหม่อีกครั้ง'
      : 'The store did not respond, so this purchase cannot start. Please try again.';

    const { RC, kind, payload } = await withTimeout(prepare(), PREPARE_TIMEOUT_MS, prepareTimeoutMsg)
      .catch((err) => {
        if (err?.isTimeout) {
          console.error(`[RC] 🔴 ช่วงเตรียมค้างที่ขั้น "${at.step}" · แพลตฟอร์ม ${Capacitor.getPlatform()}`);
          if (at.step === 'store-getProducts') {
            console.error('[RC] → StoreKit ไม่ตอบ: บนซิมูเลเตอร์ต้องเปิด StoreKit Configuration ในสคีม · บนเครื่องจริงต้องเป็นบัญชี sandbox และสินค้าต้องผ่านการอนุมัติแล้ว');
          }
          if (at.step === 'configure') {
            console.error('[RC] → RevenueCat configure ไม่จบ: ตรวจคีย์ appl_ และการเชื่อมต่อเน็ตของเครื่อง');
          }
        }
        throw err;
      });
    console.log('[RC] เตรียมเสร็จ · ใช้เส้นทาง', kind, '·', payload?.identifier || payload?.product?.identifier);

    onPhase('awaiting_store');
    const run = kind === 'package'
      ? RC.purchasePackage({ aPackage: payload })
      : RC.purchaseStoreProduct({ product: payload });

    const res = await withTimeout(run, STORE_SHEET_TIMEOUT_MS, timeoutMsg);
    customerInfo = res?.customerInfo;
  } catch (err) {
    console.error('[RC] Purchase execution error:', err);
    // If user cancelled the Apple payment prompt
    if (err?.userCancelled || err?.message?.includes('cancelled')) {
      throw err;
    }
    // In local Xcode Simulator without RevenueCat backend certificate:
    if (err?.message?.includes('configuration') || err?.code === 23 || err?.code === '23') {
      console.warn('[RC] Local StoreKit simulation without RC backend key — activating local Pro test');
      customerInfo = { entitlements: { active: { Premium: true } } };
    } else {
      throw err;
    }
  }

  const activeSubs = customerInfo?.entitlements?.active ? Object.keys(customerInfo.entitlements.active) : [];
  const productId = activeSubs[0] || rcPackage?.product?.identifier || rcPackage?.identifier;

  const plan =
    planFromIdentifier(rcPackage?.identifier) ??
    planFromIdentifier(rcPackage?.product?.identifier) ??
    planFromIdentifier(productId) ??
    'pro';

  const isOneTime = ONE_TIME_PLANS.includes(plan);

  // ซื้อสำเร็จแล้ว — การบันทึกลง Supabase ต้องไม่มีสิทธิ์ทำให้ UI ค้างต่อ
  // ถ้าเน็ตช้าให้ปล่อยผ่าน entitlement จาก RevenueCat ถือเป็นความจริงอยู่แล้ว
  await withTimeout(syncSubscriptionToSupabase({
    plan,
    status: 'active',
    provider: 'revenuecat',
    provider_subscription_id: rcPackage?.product?.identifier || productId,
    current_period_end: isOneTime
      ? null
      : (customerInfo?.latestExpirationDate
        ? new Date(customerInfo.latestExpirationDate).toISOString()
        : null),
  }), 8000, 'sync timed out').catch((e) => console.warn('[RC] sync ล้มเหลว (ไม่กระทบสิทธิ์ที่ซื้อ):', e));

  return { plan, customerInfo };
}

export async function restoreRevenueCat() {
  await initRevenueCat().catch(console.warn);
  const RC = await getRC();
  const timeoutMsg = (Capacitor.getPlatform() === 'ios')
    ? (tr().error === 'เกิดข้อผิดพลาด'
        ? 'การกู้คืนรายการจาก Apple หมดเวลา โปรดลองใหม่อีกครั้ง'
        : 'Restore purchases timed out. Please try again.')
    : 'Restore timed out. Please try again.';

  const { customerInfo } = await withTimeout(RC.restorePurchases(), 20000, timeoutMsg);
  const active = Object.keys(customerInfo.entitlements.active);

  if (!active.length) {
    await syncSubscriptionToSupabase({ plan: 'free', status: 'active', provider: 'revenuecat' });
    return { plan: 'free' };
  }

  // Look through every purchased product so a restored lifetime is recognised
  const purchased = customerInfo.allPurchasedProductIdentifiers
    || customerInfo.allPurchasedProductIds
    || [];

  const plan =
    purchased.map(planFromIdentifier).find(p => p === 'lifetime')
    ?? planFromIdentifier(active[0])
    ?? purchased.map(planFromIdentifier).find(Boolean)
    ?? 'free';

  const isOneTime = ONE_TIME_PLANS.includes(plan);

  await syncSubscriptionToSupabase({
    plan, status: 'active', provider: 'revenuecat',
    provider_subscription_id: active[0],
    current_period_end: isOneTime
      ? null
      : (customerInfo.latestExpirationDate
        ? new Date(customerInfo.latestExpirationDate).toISOString() : null),
  });
  return { plan };
}

// ─── Stripe (web) ────────────────────────────────────────────────────────────

/**
 * Stripe Price IDs per plan/period.
 * Create these in Stripe Dashboard → Products → Add price
 */
const STRIPE_PRICE_IDS = {
  pro_monthly: process.env.REACT_APP_STRIPE_PRO_MONTHLY_PRICE_ID,
  pro_yearly: process.env.REACT_APP_STRIPE_PRO_YEARLY_PRICE_ID,
  business_monthly: process.env.REACT_APP_STRIPE_BUSINESS_MONTHLY_PRICE_ID,
  business_yearly: process.env.REACT_APP_STRIPE_BUSINESS_YEARLY_PRICE_ID,
  // one-time price (mode: payment, not subscription) — optional on web
  lifetime_lifetime: process.env.REACT_APP_STRIPE_LIFETIME_PRICE_ID,
};

/**
 * Open Native Subscription Management on iOS/Android, or Stripe Customer Portal on Web.
 */
export function openNativeSubscriptionManagement() {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') {
    window.open('https://apps.apple.com/account/subscriptions', '_system');
  } else if (platform === 'android') {
    window.open('https://play.google.com/store/account/subscriptions', '_system');
  } else {
    openStripePortal();
  }
}

/**
 * Redirect to Stripe Checkout (WEB ONLY).
 * App Store Review Guideline 3.1.1 strictly prohibits this on native mobile builds.
 */
export async function createStripeCheckout(plan, period = 'monthly') {
  if (isMobile()) {
    throw new Error('In-App Purchases on mobile must use Apple/Google StoreKit.');
  }

  const priceKey = `${plan}_${period}`;
  const priceId = STRIPE_PRICE_IDS[priceKey];
  if (!priceId || priceId.includes('xxxx')) {
    throw new Error(`Stripe price is not configured for plan "${plan}" (${period})`);
  }

  const { data: { session: authSession } } = await supabase.auth.getSession();
  const token = authSession?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/stripe-checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        priceId,
        mode: ONE_TIME_PLANS.includes(plan) ? 'payment' : 'subscription',
        successUrl: `${window.location.origin}/subscription/success`,
        cancelUrl: `${window.location.origin}/subscription/cancel`,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Checkout error ${res.status}`);
  }

  const { url } = await res.json();
  window.location.href = url;
}

/**
 * Open Stripe Customer Portal to manage/cancel subscription (WEB ONLY).
 */
export async function openStripePortal() {
  if (isMobile()) {
    openNativeSubscriptionManagement();
    return;
  }

  const { data: { session: authSession } } = await supabase.auth.getSession();
  const token = authSession?.access_token;

  const res = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/stripe-portal`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ returnUrl: window.location.href }),
    }
  );

  if (!res.ok) throw new Error('Failed to open portal');
  const { url } = await res.json();
  window.location.href = url;
}

// ─── Supabase sync ───────────────────────────────────────────────────────────

export async function syncSubscriptionToSupabase(data) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const record = {
    user_id: user.id,
    plan: data.plan ?? 'free',
    status: data.status ?? 'active',
    provider: data.provider ?? null,
    provider_customer_id: data.provider_customer_id ?? null,
    provider_subscription_id: data.provider_subscription_id ?? null,
    current_period_start: data.current_period_start ?? null,
    current_period_end: data.current_period_end ?? null,
    trial_end: data.trial_end ?? null,
    cancel_at_period_end: data.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('subscriptions')
    .upsert(record, { onConflict: 'user_id' });

  if (error) console.error('[Sub] Supabase sync error:', error);
}

/**
 * Load current user's subscription from Supabase.
 * Falls back to { plan: 'free' } if no record found.
 */
export async function loadSubscription() {
  const trialInfo = getBusinessTrialInfo();
  const trialSub = trialInfo.isTrialActive ? {
    plan: 'business',
    status: 'trialing',
    isTrial: true,
    trialDaysRemaining: trialInfo.remainingDays,
    trialEnd: trialInfo.trialEnd,
  } : null;

  /**
   * 🔴 ทุกการเรียก Supabase ตรงนี้ต้องมีเพดานเวลา
   * ผู้เรียก (เช่น PremiumSettings) ตั้ง isLoading = true แล้วรอฟังก์ชันนี้
   * ถ้า Supabase ตอบช้าหรือถูกบล็อกบนเน็ตของผู้ตรวจ หน้าจะหมุนค้างทั้งหน้า
   * ตั้งแต่ยังไม่เห็นการ์ดราคาด้วยซ้ำ — เป็นอีกหน้าตาหนึ่งของ 2.1a
   * โหลดสถานะไม่ได้ = ถือว่าเป็น free ไว้ก่อน ปลอดภัยกว่าค้าง
   */
  const fallback = () => trialSub || { plan: 'free', status: 'active' };

  let user = null;
  try {
    const res = await withTimeout(supabase.auth.getUser(), 8000, 'auth timed out');
    user = res?.data?.user || null;
  } catch (e) {
    console.warn('[Sub] getUser ช้าหรือล้มเหลว ถือเป็น free ไปก่อน:', e);
    return fallback();
  }
  if (!user) return fallback();

  let data = null;
  let error = null;
  try {
    const res = await withTimeout(
      supabase.from('subscriptions').select('*').eq('user_id', user.id).single(),
      8000,
      'subscription query timed out'
    );
    data = res?.data;
    error = res?.error;
  } catch (e) {
    console.warn('[Sub] โหลดสถานะสมาชิกช้าหรือล้มเหลว ถือเป็น free ไปก่อน:', e);
    return fallback();
  }

  if (error || !data || data.plan === 'free') {
    return trialSub || { plan: 'free', status: 'active' };
  }

  // One-time purchases never expire — skip the expiry check entirely.
  if (ONE_TIME_PLANS.includes(data.plan)) return data;

  // Check if subscription has expired
  if (data.current_period_end) {
    const expired = new Date(data.current_period_end) < new Date();
    if (expired && data.plan !== 'free') {
      if (trialSub) return trialSub;
      await withTimeout(syncSubscriptionToSupabase({ plan: 'free', status: 'expired' }), 8000, 'sync timed out').catch(console.warn);
      return { ...data, plan: 'free', status: 'expired' };
    }
  }

  return data;
}

// ─── Unified purchase entry point ────────────────────────────────────────────

/**
 * Purchase a plan — automatically routes to RevenueCat (mobile) or Stripe (web).
 * @param {string} plan      - 'pro' | 'business'
 * @param {string} period    - 'monthly' | 'yearly'
 * @param {object} rcPackage - RevenueCat package (only needed on mobile)
 */
export async function purchasePlan(plan, period = 'monthly', rcPackage = null) {
  if (isMobile()) {
    let pkg = rcPackage;

    // หากไม่ได้ส่ง package มา (เช่น เรียกจากหน้าเว็บ หรือเรียกตรงๆ) ให้ลองหาใน offerings
    if (!pkg) {
      const offerings = await paymentService.getOfferings();

      if (!offerings || !offerings.availablePackages?.length) {
        const reason = paymentService.getUnavailableReason?.();
        const t = tr();
        const messages = {
          not_configured: t.billNotConfigured,
          no_offerings: t.billNoOfferings,
          store_error: t.billStoreError,
          init_failed: t.billInitFailed,
        };
        const err = new Error(messages[reason] || t.billNoPackages);
        err.code = reason || 'no_offerings';
        err.billingUnavailable = true;
        throw err;
      }

      pkg = findPackage(offerings.availablePackages, plan, period);
    }

    // 🔴 ด่านสุดท้ายก่อนตัดเงิน — ห้ามปล่อยให้แพ็กเกจของแผนอื่นหลุดมาถึงตรงนี้
    // findPackage() ยอมจับคู่ด้วยรอบบิลอย่างเดียวเป็นทางเลือกสุดท้าย
    // ขอ business/monthly แล้วอาจได้ $rc_monthly (ของ pro) กลับมา
    // ถ้าปล่อยผ่าน ผู้ใช้จะจ่ายราคา Pro แต่คาดหวังสิทธิ์ Business
    // ยอมพังแบบมีข้อความชัด ๆ ดีกว่าเก็บเงินผิดแผน
    if (pkg && !packageMatchesPlan(pkg, plan)) {
      pkg = null;
    }

    if (!pkg) {
      const available = (await paymentService.getOfferings())?.availablePackages
        ?.map(p => p.identifier).join(', ') || '—';
      const err = new Error(
        tr().billPackageNotFound.replace('{plan}', plan).replace('{period}', period).replace('{list}', available)
      );
      err.code = 'package_not_found';
      throw err;
    }
    return purchaseRevenueCat(pkg);
  } else {
    return createStripeCheckout(plan, period);
  }
}
