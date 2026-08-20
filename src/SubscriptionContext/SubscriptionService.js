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
    // ราคาตั้งรายปี = 99 x 12 โดยไม่ฝังส่วนลดไว้
    // ส่วนลดทั้งหมดไปอยู่ที่ offer ของ Google Play แทน เพื่อให้ Play
    // แสดงเปอร์เซ็นต์ตรงกับที่โฆษณา (โปร Q4 = 713 บาท = ลด 40% พอดี)
    price: { monthly: 99, yearly: 1188 },
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
    price: { monthly: 499, yearly: 5988 },   // 499 x 12 — หลักเดียวกับ pro
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
    // 2.52 เท่าของรายปีราคาตั้ง (฿1,188) — อยู่ในเกณฑ์ปลอดภัย 2.5–3 เท่า
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
  // lifetime buys the Pro feature set permanently — it sits everywhere pro does
  cloud_sync: ['pro', 'business', 'lifetime'],
  ai_scan_slip: ['free', 'pro', 'business', 'lifetime'],
  ai_scan_bill: ['free', 'pro', 'business', 'lifetime'],
  auto_scan_batch: ['pro', 'business', 'lifetime'],
  export_excel: ['pro', 'business', 'lifetime'],
  export_pdf: ['pro', 'business', 'lifetime'],
  budget_limits: ['pro', 'business', 'lifetime'],
  slip_verify: ['pro', 'business', 'lifetime'],
  unlimited_tx: ['pro', 'business', 'lifetime'],
  stock_management: ['business', 'lifetime'],
  pos_billing: ['business', 'lifetime'],
  // business-only extras (Multi-warehouse & Enterprise APIs)
  multi_warehouse: ['business'],
  multi_workspace: ['business'],
  api_access: ['business'],
  priority_support: ['business'],
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

let rcInitialized = false;
let Purchases = null;

async function getRC() {
  if (!Purchases) {
    const mod = await import('@revenuecat/purchases-capacitor');
    Purchases = mod.Purchases;
  }
  return Purchases;
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
export function fallbackPriceTHB(plan, period) {
  const p = PLANS[plan];
  if (!p) return '';
  const n = period === 'lifetime' ? p.price?.lifetime : p.price?.[period];
  return typeof n === 'number' ? `฿${n.toLocaleString()}` : '';
}

export async function initRevenueCat(userId) {
  if (rcInitialized || !isMobile()) return;
  const RC = await getRC();
  const platform = (await import('@capacitor/core')).Capacitor.getPlatform();
  const apiKey = platform === 'ios'
    ? process.env.REACT_APP_REVENUECAT_API_KEY_IOS
    : process.env.REACT_APP_REVENUECAT_API_KEY_ANDROID;

  if (!apiKey) {
    console.warn('[RC] API key not set. Set REACT_APP_REVENUECAT_API_KEY_IOS/ANDROID');
    return;
  }
  await RC.configure({ apiKey, appUserID: userId });
  rcInitialized = true;
}

export async function getRevenueCatOfferings() {
  const RC = await getRC();
  const { offerings } = await RC.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchaseRevenueCat(rcPackage) {
  const RC = await getRC();
  const { customerInfo } = await RC.purchasePackage({ aPackage: rcPackage });

  const activeSubs = Object.keys(customerInfo.entitlements.active);
  const productId = activeSubs[0];

  // Prefer the package we actually bought — entitlement keys are often just
  // "Premium" and carry no plan information at all.
  const plan =
    planFromIdentifier(rcPackage?.identifier) ??
    planFromIdentifier(rcPackage?.product?.identifier) ??
    planFromIdentifier(productId) ??
    'free';

  // A lifetime purchase has no expiry; never write one or it will look expired.
  const isOneTime = ONE_TIME_PLANS.includes(plan);

  await syncSubscriptionToSupabase({
    plan,
    status: 'active',
    provider: 'revenuecat',
    provider_subscription_id: rcPackage?.product?.identifier || productId,
    current_period_end: isOneTime
      ? null
      : (customerInfo.latestExpirationDate
        ? new Date(customerInfo.latestExpirationDate).toISOString()
        : null),
  });

  return { plan, customerInfo };
}

export async function restoreRevenueCat() {
  const RC = await getRC();
  const { customerInfo } = await RC.restorePurchases();
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
 * Redirect to Stripe Checkout.
 * On success, Stripe redirects back to /subscription/success?session_id=...
 * Your FastAPI backend at /api/stripe/create-checkout handles session creation.
 */
export async function createStripeCheckout(plan, period = 'monthly') {
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
        // one-time purchases use Checkout mode "payment", not "subscription"
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
  window.location.href = url; // redirect to Stripe hosted checkout
}

/**
 * Open Stripe Customer Portal to manage/cancel subscription.
 */
export async function openStripePortal() {
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return trialSub || { plan: 'free', status: 'active' };

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single();

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
      await syncSubscriptionToSupabase({ plan: 'free', status: 'expired' });
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
